/**
 * ADAPTER DE SERVIÇOS — Compre Fácil (aba Serviços do motor de pacotes).
 *
 * Arquitetura: Sky Hub -> Internal API v1 -> este adapter -> Compre Fácil.
 * A Sky Hub nunca fala com a operadora nem vê o formato bruto dela.
 *
 * Fonte real: `buscarServicosDestinoCF` (POST /api/Servico/busca) para
 * serviços, passeios, ingressos e transfers + `buscarSegurosCF`
 * (POST /api/Seguro/busca) para seguro viagem. Nada de hardcode por tipo.
 *
 * Esta fase cobre apenas BUSCAR e SELECIONAR. Reserva de serviço não existe
 * na integração (o payload de reserva ainda envia `Servicos: []`).
 *
 * SERVER-ONLY.
 */
import { randomBytes } from "node:crypto";
import { z } from "zod";
import type { ServicoDisponivel } from "@/lib/comprefacil/servicos.server";

/* ── Contrato de entrada ─────────────────────────────────────────────── */

export const TIPOS_SERVICO = ["transfer", "passeio", "ingresso", "servico", "seguro"] as const;
export type TipoServico = (typeof TIPOS_SERVICO)[number];

const dataIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "use AAAA-MM-DD");

export const servicesSearchInput = z
  .object({
    /** Cidade oficial do Compre Fácil. Quando ausente, resolvida pelo destino. */
    cidadeId: z.number().int().positive().optional(),
    destino: z.string().min(2).max(120).optional(),
    destinoIata: z.string().length(3).optional(),
    data: dataIso,
    dataFim: dataIso.nullish(),
    adultos: z.number().int().min(1).max(24).default(2),
    /** idades das crianças (0-17) */
    criancas: z.array(z.number().int().min(0).max(17)).max(20).optional(),
    /** filtro opcional; vazio = todos os tipos */
    tipoServico: z
      .union([z.enum(TIPOS_SERVICO), z.array(z.enum(TIPOS_SERVICO)).max(5)])
      .optional(),
    incluirSeguro: z.boolean().optional(),
    limite: z.number().int().min(1).max(300).optional(),
  })
  .refine((v) => Boolean(v.cidadeId || v.destino || v.destinoIata), {
    message: "informe cidadeId, destino ou destinoIata",
  });

export type ServicesSearchInput = z.infer<typeof servicesSearchInput>;

export const servicesSelectInput = z.object({
  buscaId: z.string().min(6).max(60),
  servicoId: z.string().min(3).max(60),
  /** data escolhida entre as opções do serviço (quando houver) */
  data: dataIso.nullish(),
  /** horário escolhido (HH:MM) quando o serviço tem sessão */
  hora: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .nullish(),
});

/* ── Contrato de saída (padrão VIA AIR, em português) ────────────────── */

export type ServicoNormalizado = {
  fornecedor: "comprefacil";
  tipo: "servico";
  tipo_servico: TipoServico;
  /** rótulo cru da operadora, quando vier diferente dos tipos conhecidos */
  tipo_servico_origem: string | null;
  servico_id: string;
  titulo: string;
  descricao: string | null;
  destino: string | null;
  data: string | null;
  hora: string | null;
  passageiros: { adultos: number; criancas: number[] };
  imagem_url: string | null;
  moeda: "BRL";
  valor_liquido: number | null;
  taxas: number;
  valor_total: number | null;
  disponibilidade: "disponivel" | "sob_consulta";
  inclusos: string[];
  politica_cancelamento: string | null;
  /** dados específicos do tipo, preservados sem quebrar o contrato comum */
  dados_tipo: {
    categoria: string | null;
    operado_por: string | null;
    imagens: string[];
    logo: string | null;
    /** datas/horários oferecidos (passeio, ingresso, transfer) */
    opcoes: { data: string; hora: string | null; valor: number | null }[];
    /** coberturas detalhadas (seguro viagem) */
    coberturas: { nome: string; valor: string | null }[];
  };
  /** identificadores opacos para a reserva futura — a IA/Sky Hub não interpreta */
  referencia_fornecedor: Record<string, unknown>;
};

export type ServicesSearchResult = {
  status: "found" | "not_found";
  fonte: "COMPREFACIL";
  busca_id: string;
  criterio: {
    cidade_id: number;
    destino: string | null;
    data: string;
    data_fim: string;
    adultos: number;
    criancas: number[];
    tipo_servico: TipoServico[] | null;
  };
  total: number;
  por_tipo: Record<string, number>;
  servicos: ServicoNormalizado[];
  mensagem: string;
};

/* ── Helpers ─────────────────────────────────────────────────────────── */

function novoId(prefixo: string): string {
  return `${prefixo}_${randomBytes(12).toString("base64url").replace(/[^A-Za-z0-9]/g, "").slice(0, 20)}`;
}

/** Classifica no vocabulário da VIA AIR sem hardcode de um único tipo. */
function classificar(s: ServicoDisponivel, seguro: boolean): TipoServico {
  if (seguro) return "seguro";
  const porId: Record<number, TipoServico> = { 1: "passeio", 2: "ingresso", 3: "transfer" };
  const id = s.tipoServicoId;
  if (id != null && porId[id]) return porId[id]!;
  // A operadora manda TipoServico = 0 ("ATIVIDADE") para quase tudo, então o
  // tipo real vem do título/categoria. Sem isso, transfer e passeio somem.
  const t = `${s.categoria ?? ""} ${s.titulo ?? ""}`.toLowerCase();
  if (/seguro/.test(t)) return "seguro";
  if (/transfer|traslado|trans?por/.test(t)) return "transfer";
  if (/passeio|tour|excurs|city ?tour/.test(t)) return "passeio";
  if (/ingresso|ticket|entrada/.test(t)) return "ingresso";
  return "servico";
}

function normalizar(
  s: ServicoDisponivel,
  ctx: {
    cidadeId: number;
    destino: string | null;
    data: string;
    dataFim: string;
    adultos: number;
    criancas: number[];
    seguro: boolean;
  },
): ServicoNormalizado {
  const tipo = classificar(s, ctx.seguro);
  const opcoes = (s.opcoes ?? []).map((o) => ({ data: o.data, hora: o.hora, valor: o.valor }));
  const primeira = opcoes[0];
  const data = s.dataSelecionada ?? primeira?.data ?? ctx.data;
  const hora = s.horaSelecionada ?? primeira?.hora ?? null;
  const valor = s.valor;

  return {
    fornecedor: "comprefacil",
    tipo: "servico",
    tipo_servico: tipo,
    tipo_servico_origem: s.categoria ?? null,
    servico_id: novoId("svc"),
    titulo: s.titulo,
    descricao: s.descricao,
    destino: ctx.destino,
    data,
    hora,
    passageiros: { adultos: ctx.adultos, criancas: ctx.criancas },
    imagem_url: s.imagem ?? null,
    moeda: "BRL",
    // A operadora entrega um valor único já tarifado; não há taxa separada.
    valor_liquido: valor,
    taxas: 0,
    valor_total: valor,
    disponibilidade: valor != null ? "disponivel" : "sob_consulta",
    inclusos: s.informacoes ?? [],
    politica_cancelamento: s.politica,
    dados_tipo: {
      categoria: s.categoria ?? null,
      operado_por: s.fornecedor ?? null,
      imagens: s.imagens ?? [],
      logo: s.logo ?? null,
      opcoes,
      coberturas: s.coberturas ?? [],
    },
    referencia_fornecedor: {
      fornecedor: "comprefacil",
      origem: ctx.seguro ? "seguro" : "servico",
      id_interno: s.id,
      codigo_fornecedor: s.externoId || null,
      tipo_servico_id: s.tipoServicoId ?? null,
      busca_guid: s.buscaGuid ?? null,
      cidade_id: ctx.cidadeId,
      periodo: { de: ctx.data, ate: ctx.dataFim },
      ocupacao: { adultos: ctx.adultos, idades: ctx.criancas },
      codigo_tarifa: (s.opcoes ?? [])[0]?.codigo ?? null,
      tarifas: (s.opcoes ?? []).map((o) => ({
        codigo: o.codigo,
        data: o.data,
        hora: o.hora,
        valor: o.valor,
      })),
      extra_integracao: s.extra ?? null,
    },
  };
}

/* ── Resolução da cidade oficial ─────────────────────────────────────── */

async function resolverCidade(input: ServicesSearchInput): Promise<{ id: number; nome: string } | null> {
  if (input.cidadeId) return { id: input.cidadeId, nome: input.destino ?? String(input.cidadeId) };
  const { cidadesOficiaisCF, semAcento } = await import("@/lib/comprefacil/localidades.server");
  const cidades = await cidadesOficiaisCF();
  if (input.destinoIata) {
    const iata = input.destinoIata.toUpperCase();
    const c = cidades.find((x) => x.iata === iata);
    if (c) return { id: c.id, nome: input.destino ?? c.nome };
  }
  if (input.destino) {
    const alvo = semAcento(input.destino);
    const c =
      cidades.find((x) => semAcento(x.nome) === alvo) ??
      cidades.find((x) => semAcento(x.nome).startsWith(alvo)) ??
      cidades.find((x) => semAcento(x.descricao).includes(alvo));
    if (c) return { id: c.id, nome: input.destino };
  }
  return null;
}

/* ── Persistência dos identificadores opacos ─────────────────────────── */

async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function guardarBusca(args: {
  clientId: string | null;
  buscaId: string;
  payload: unknown;
}): Promise<void> {
  const supabase = await db();
  await supabase.from("api_offer_refs").insert({
    api_client_id: args.clientId,
    search_id: args.buscaId,
    kind: `svcsearch:${args.buscaId}`,
    payload: args.payload as never,
    expires_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
  } as never);
}

async function lerBusca(buscaId: string): Promise<{
  criterio: ServicesSearchResult["criterio"];
  servicos: ServicoNormalizado[];
} | null> {
  const supabase = await db();
  const { data } = await supabase
    .from("api_offer_refs")
    .select("payload,expires_at")
    .eq("kind", `svcsearch:${buscaId}`)
    .maybeSingle();
  const row = data as
    | { payload: { criterio: ServicesSearchResult["criterio"]; servicos: ServicoNormalizado[] }; expires_at: string }
    | null;
  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) return null;
  return row.payload;
}

/* ── Busca ───────────────────────────────────────────────────────────── */

export async function buscarServicos(
  input: ServicesSearchInput,
  clientId: string | null,
): Promise<ServicesSearchResult> {
  const cidade = await resolverCidade(input);
  const filtros = input.tipoServico
    ? Array.isArray(input.tipoServico)
      ? input.tipoServico
      : [input.tipoServico]
    : null;
  const adultos = input.adultos ?? 2;
  const criancas = input.criancas ?? [];
  const dataFim = input.dataFim || input.data;

  const criterio: ServicesSearchResult["criterio"] = {
    cidade_id: cidade?.id ?? 0,
    destino: input.destino ?? cidade?.nome ?? null,
    data: input.data,
    data_fim: dataFim,
    adultos,
    criancas,
    tipo_servico: filtros,
  };

  if (!cidade) {
    return {
      status: "not_found",
      fonte: "COMPREFACIL",
      busca_id: novoId("svcs"),
      criterio,
      total: 0,
      por_tipo: {},
      servicos: [],
      mensagem: "Destino não encontrado no catálogo de cidades da operadora.",
    };
  }

  const querSeguro =
    input.incluirSeguro ?? (filtros ? filtros.includes("seguro") : true);
  const querOutros = !filtros || filtros.some((t) => t !== "seguro");

  const params = {
    cidadeId: cidade.id,
    data: input.data,
    dataFim,
    adultos,
    idades: criancas,
    destino: criterio.destino,
    limite: input.limite,
  };

  const { buscarServicosDestinoCF } = await import("@/lib/comprefacil/servicos.server");
  const { buscarSegurosCF } = await import("@/lib/comprefacil/seguros.server");

  const [servicos, seguros] = await Promise.all([
    querOutros ? buscarServicosDestinoCF(params).catch(() => [] as ServicoDisponivel[]) : Promise.resolve([]),
    querSeguro
      ? buscarSegurosCF({ ...params, destinoIata: input.destinoIata ?? null }).catch(
          () => [] as ServicoDisponivel[],
        )
      : Promise.resolve([]),
  ]);

  const ctx = {
    cidadeId: cidade.id,
    destino: criterio.destino,
    data: input.data,
    dataFim,
    adultos,
    criancas,
  };

  const lista = [
    ...servicos.map((s) => normalizar(s, { ...ctx, seguro: false })),
    ...seguros.map((s) => normalizar(s, { ...ctx, seguro: true })),
  ].filter((s) => !filtros || filtros.includes(s.tipo_servico));

  const por_tipo: Record<string, number> = {};
  for (const s of lista) por_tipo[s.tipo_servico] = (por_tipo[s.tipo_servico] ?? 0) + 1;

  const buscaId = novoId("svcs");
  const resultado: ServicesSearchResult = {
    status: lista.length ? "found" : "not_found",
    fonte: "COMPREFACIL",
    busca_id: buscaId,
    criterio,
    total: lista.length,
    por_tipo,
    servicos: lista,
    mensagem: lista.length
      ? `${lista.length} serviço(s) disponíveis para o destino e período.`
      : "Nenhum serviço disponível para este destino e período.",
  };

  await guardarBusca({ clientId, buscaId, payload: { criterio, servicos: lista } });
  return resultado;
}

/* ── Seleção (não reserva) ───────────────────────────────────────────── */

export type ServicesSelectResult = {
  status: "selected";
  selecao_id: string;
  servico: ServicoNormalizado;
  /** esta fase não reserva nada na operadora */
  reserva: { realizada: false; motivo: "reserva_de_servico_nao_implementada" };
};

export async function selecionarServico(
  input: z.infer<typeof servicesSelectInput>,
  clientId: string | null,
): Promise<ServicesSelectResult | { erro: "busca_expirada" | "servico_nao_encontrado" | "opcao_indisponivel" }> {
  const busca = await lerBusca(input.buscaId);
  if (!busca) return { erro: "busca_expirada" };
  const base = busca.servicos.find((s) => s.servico_id === input.servicoId);
  if (!base) return { erro: "servico_nao_encontrado" };

  let escolhido = base;
  if (input.data || input.hora) {
    const opcao = base.dados_tipo.opcoes.find(
      (o) => (!input.data || o.data === input.data) && (!input.hora || o.hora === input.hora),
    );
    if (!opcao) return { erro: "opcao_indisponivel" };
    const tarifas = (base.referencia_fornecedor["tarifas"] ?? []) as {
      codigo: string | null;
      data: string;
      hora: string | null;
    }[];
    const tarifa = tarifas.find((t) => t.data === opcao.data && t.hora === opcao.hora);
    escolhido = {
      ...base,
      data: opcao.data,
      hora: opcao.hora,
      valor_liquido: opcao.valor ?? base.valor_liquido,
      valor_total: opcao.valor ?? base.valor_total,
      referencia_fornecedor: {
        ...base.referencia_fornecedor,
        codigo_tarifa: tarifa?.codigo ?? base.referencia_fornecedor["codigo_tarifa"] ?? null,
        data_escolhida: opcao.data,
        hora_escolhida: opcao.hora,
      },
    };
  }

  const selecaoId = novoId("svcsel");
  const supabase = await db();
  await supabase.from("api_offer_refs").insert({
    api_client_id: clientId,
    search_id: input.buscaId,
    kind: `svcsel:${selecaoId}`,
    payload: { criterio: busca.criterio, servico: escolhido } as never,
    expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  } as never);

  return {
    status: "selected",
    selecao_id: selecaoId,
    servico: escolhido,
    reserva: { realizada: false, motivo: "reserva_de_servico_nao_implementada" },
  };
}
