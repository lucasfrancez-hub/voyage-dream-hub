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

/**
 * Referência opaca entregue ao Sky Hub. Não é legível nem editável: é só um
 * ponteiro para o registro do servidor, onde ficam os identificadores reais
 * da operadora (código do serviço, Guid da busca, tarifas, IDs extras).
 */
export type ReferenciaOpaca = {
  tipo: "opaca";
  ref: string;
  expira_em: string;
};

/** Dados do fornecedor que NUNCA saem do servidor. */
export type ReferenciaInterna = Record<string, unknown>;

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
  /**
   * Bloco fixo de precificação do contrato VIA AIR → Sky Hub.
   * Regra desta fase: o valor é exatamente o retornado pela operadora, sem
   * markup adicional. A comissão da agência NÃO é informada pela API do
   * Compre Fácil e NUNCA é calculada aqui — a eventual divisão de 10% para a
   * agência será uma regra comercial interna futura, separada do contrato
   * bruto do fornecedor.
   */
  precificacao: {
    origem_valor: "operadora";
    markup_viaair: 0;
    comissao_agencia: null;
    comissao_agencia_status: "nao_informada_pela_api";
  };
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
  /** ponteiro opaco — a reserva futura é resolvida no servidor */
  referencia_fornecedor: ReferenciaOpaca;
};

/** Forma interna: o normalizado + o bloco sigiloso do fornecedor. */
export type ServicoInterno = ServicoNormalizado & { _fornecedor: ReferenciaInterna };

/** Remove o bloco sigiloso antes de responder ao Sky Hub. */
export function paraSkyHub(s: ServicoInterno): ServicoNormalizado {
  const { _fornecedor: _oculto, ...publico } = s;
  return publico;
}


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
  /** como a consulta ao fornecedor terminou (nunca confundir vazio com timeout) */
  desfecho: "concluido_com_resultados" | "concluido_sem_resultados" | "teto_de_tempo" | "erro" | "destino_desconhecido";
  /** instrumentação: onde o tempo foi gasto nesta busca */
  metricas: {
    ms_total: number;
    ms_resolucao_cidade: number;
    ms_rede_fornecedor: number;
    ms_espera_polling: number;
    ms_parsing: number;
    bytes_fornecedor: number;
    chamadas_fornecedor: number;
    resultados: number;
    cache_hit: boolean;
    cache_age_ms: number | null;
    cache_ttl_ms: number;
  };
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

/** Validade da referência opaca da busca (2 h, igual à busca guardada). */
const VALIDADE_BUSCA_MS = 2 * 60 * 60 * 1000;
/** Validade da seleção persistida. */
const VALIDADE_SELECAO_MS = 30 * 24 * 60 * 60 * 1000;

function refOpaca(validadeMs: number): ReferenciaOpaca {
  return {
    tipo: "opaca",
    ref: novoId("svcref"),
    expira_em: new Date(Date.now() + validadeMs).toISOString(),
  };
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
): ServicoInterno {
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
    // Valor preservado como veio: nenhum markup do Pacote VIA AIR é somado.
    valor_liquido: valor,
    taxas: 0,
    valor_total: valor,
    disponibilidade: valor != null ? "disponivel" : "sob_consulta",
    precificacao: {
      origem_valor: "operadora",
      markup_viaair: 0,
      comissao_agencia: null,
      comissao_agencia_status: "nao_informada_pela_api",
    },
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
    referencia_fornecedor: refOpaca(VALIDADE_BUSCA_MS),
    _fornecedor: {
      fornecedor: "comprefacil",
      origem: ctx.seguro ? "seguro" : "servico",
      id_interno: s.id,
      codigo_fornecedor: s.externoId || null,
      tipo_servico_id: s.tipoServicoId ?? null,
      busca_guid: s.buscaGuid ?? null,
      // Metadado interno do fornecedor (ex.: 646). Não é percentual conhecido
      // e nunca sai do servidor — ver `paraSkyHub` e o bloco `precificacao`.
      markup_id: s.markupId ?? null,
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
  servicos: ServicoInterno[];
} | null> {
  const supabase = await db();
  const { data } = await supabase
    .from("api_offer_refs")
    .select("payload,expires_at")
    .eq("kind", `svcsearch:${buscaId}`)
    .maybeSingle();
  const row = data as
    | { payload: { criterio: ServicesSearchResult["criterio"]; servicos: ServicoInterno[] }; expires_at: string }
    | null;
  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) return null;
  return row.payload;
}


/* ── Busca ───────────────────────────────────────────────────────────── */

export async function buscarServicos(
  input: ServicesSearchInput,
  clientId: string | null,
  opcoes?: { ignorarCache?: boolean },
): Promise<ServicesSearchResult> {
  const t0 = Date.now();
  const { chaveBusca, lerCache, gravarCache, cacheTtlMs } = await import("./search-cache.server");
  const tCidade = Date.now();
  const cidade = await resolverCidade(input);
  const msCidade = Date.now() - tCidade;
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

  const metricasBase = (extra: {
    rede: number;
    espera: number;
    parsing: number;
    bytes: number;
    chamadas: number;
    resultados: number;
    cacheHit: boolean;
    cacheAge: number | null;
  }): ServicesSearchResult["metricas"] => ({
    ms_total: Date.now() - t0,
    ms_resolucao_cidade: msCidade,
    ms_rede_fornecedor: extra.rede,
    ms_espera_polling: extra.espera,
    ms_parsing: extra.parsing,
    bytes_fornecedor: extra.bytes,
    chamadas_fornecedor: extra.chamadas,
    resultados: extra.resultados,
    cache_hit: extra.cacheHit,
    cache_age_ms: extra.cacheAge,
    cache_ttl_ms: cacheTtlMs(),
  });

  const vazio = {
    rede: 0,
    espera: 0,
    parsing: 0,
    bytes: 0,
    chamadas: 0,
    resultados: 0,
    cacheHit: false,
    cacheAge: null,
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
      desfecho: "destino_desconhecido",
      metricas: metricasBase(vazio),
    };
  }

  /* ── Cache (destino + período + ocupação + filtros) ─────────────────── */
  const chave = chaveBusca({
    cidadeId: cidade.id,
    data: input.data,
    dataFim,
    adultos,
    criancas,
    tipos: filtros,
    limite: input.limite ?? null,
  });
  if (!opcoes?.ignorarCache) {
    const guardado = lerCache<ServicesSearchResult>(chave);
    if (guardado) {
      console.info(
        `[servicos] cache_hit chave=${chave} idade_ms=${guardado.idadeMs} resultados=${guardado.valor.total}`,
      );
      return {
        ...guardado.valor,
        metricas: metricasBase({
          ...vazio,
          resultados: guardado.valor.total,
          cacheHit: true,
          cacheAge: guardado.idadeMs,
        }),
      };
    }
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

  const metServicos = {
    chamadas: 0,
    ms_rede: 0,
    ms_espera: 0,
    ms_parsing: 0,
    bytes: 0,
    desfecho: "concluido_sem_resultados" as const,
  } as import("@/lib/comprefacil/servicos.server").MetricasFornecedor;
  const metSeguro = { ...metServicos };

  const [servicos, seguros] = await Promise.all([
    querOutros
      ? buscarServicosDestinoCF({ ...params, metricas: metServicos }).catch(() => {
          metServicos.desfecho = "erro";
          return [] as ServicoDisponivel[];
        })
      : Promise.resolve([]),
    querSeguro
      ? buscarSegurosCF({
          ...params,
          destinoIata: input.destinoIata ?? null,
          metricas: metSeguro,
        }).catch(() => {
          metSeguro.desfecho = "erro";
          return [] as ServicoDisponivel[];
        })
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
  const desfecho: ServicesSearchResult["desfecho"] = lista.length
    ? "concluido_com_resultados"
    : metServicos.desfecho === "erro" && metSeguro.desfecho === "erro"
      ? "erro"
      : metServicos.desfecho === "teto_de_tempo" || metSeguro.desfecho === "teto_de_tempo"
        ? "teto_de_tempo"
        : "concluido_sem_resultados";

  const metricas = metricasBase({
    rede: metServicos.ms_rede + metSeguro.ms_rede,
    espera: metServicos.ms_espera + metSeguro.ms_espera,
    parsing: metServicos.ms_parsing + metSeguro.ms_parsing,
    bytes: metServicos.bytes + metSeguro.bytes,
    chamadas: metServicos.chamadas + metSeguro.chamadas,
    resultados: lista.length,
    cacheHit: false,
    cacheAge: null,
  });

  const resultado: ServicesSearchResult = {
    status: lista.length ? "found" : "not_found",
    fonte: "COMPREFACIL",
    busca_id: buscaId,
    criterio,
    total: lista.length,
    por_tipo,
    servicos: lista.map(paraSkyHub),
    mensagem: lista.length
      ? `${lista.length} serviço(s) disponíveis para o destino e período.`
      : "Nenhum serviço disponível para este destino e período.",
    desfecho,
    metricas,
  };

  console.info(
    `[servicos] cache_miss destino=${criterio.destino ?? cidade.id} desfecho=${desfecho} ` +
      `total_ms=${metricas.ms_total} rede_ms=${metricas.ms_rede_fornecedor} espera_ms=${metricas.ms_espera_polling} ` +
      `parsing_ms=${metricas.ms_parsing} chamadas=${metricas.chamadas_fornecedor} kb=${Math.round(metricas.bytes_fornecedor / 1024)} ` +
      `resultados=${lista.length}`,
  );

  // Só guarda resultado de consulta efetivamente concluída: erro e teto de
  // tempo nunca viram cache.
  if (desfecho === "concluido_com_resultados" || desfecho === "concluido_sem_resultados") {
    gravarCache(chave, resultado);
  }


  await guardarBusca({ clientId, buscaId, payload: { criterio, servicos: lista } });
  return resultado;
}

/* ── Seleção (não reserva) ───────────────────────────────────────────── */

export type ServicesSelectResult = {
  status: "selected";
  selecao_id: string;
  busca_id: string;
  criterio: ServicesSearchResult["criterio"];
  servico: ServicoNormalizado;
  /** esta fase não reserva nada na operadora */
  reserva: { realizada: false; motivo: "reserva_de_servico_nao_implementada" };
};

export type ServicesSelectErro = {
  erro: "busca_expirada" | "servico_nao_encontrado" | "opcao_indisponivel";
};

export async function selecionarServico(
  input: z.infer<typeof servicesSelectInput>,
  clientId: string | null,
): Promise<ServicesSelectResult | ServicesSelectErro> {
  const busca = await lerBusca(input.buscaId);
  if (!busca) return { erro: "busca_expirada" };
  const base = busca.servicos.find((s) => s.servico_id === input.servicoId);
  if (!base) return { erro: "servico_nao_encontrado" };

  let escolhido: ServicoInterno = base;
  if (input.data || input.hora) {
    const opcao = base.dados_tipo.opcoes.find(
      (o) => (!input.data || o.data === input.data) && (!input.hora || o.hora === input.hora),
    );
    if (!opcao) return { erro: "opcao_indisponivel" };
    const tarifas = (base._fornecedor["tarifas"] ?? []) as {
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
      _fornecedor: {
        ...base._fornecedor,
        codigo_tarifa: tarifa?.codigo ?? base._fornecedor["codigo_tarifa"] ?? null,
        data_escolhida: opcao.data,
        hora_escolhida: opcao.hora,
      },
    };
  }

  // A referência opaca da seleção é nova e dura o tempo da seleção.
  escolhido = { ...escolhido, referencia_fornecedor: refOpaca(VALIDADE_SELECAO_MS) };

  const selecaoId = novoId("svcsel");
  const supabase = await db();
  await supabase.from("api_offer_refs").insert({
    api_client_id: clientId,
    search_id: input.buscaId,
    kind: `svcsel:${selecaoId}`,
    payload: { criterio: busca.criterio, busca_id: input.buscaId, servico: escolhido } as never,
    expires_at: new Date(Date.now() + VALIDADE_SELECAO_MS).toISOString(),
  } as never);

  return {
    status: "selected",
    selecao_id: selecaoId,
    busca_id: input.buscaId,
    criterio: busca.criterio,
    servico: paraSkyHub(escolhido),
    reserva: { realizada: false, motivo: "reserva_de_servico_nao_implementada" },
  };
}

/* ── Recuperação da seleção persistida ───────────────────────────────── */

export const servicesSelectionInput = z.object({
  selecaoId: z.string().min(6).max(60),
});

export type ServicesSelectionResult = {
  status: "selected";
  selecao_id: string;
  busca_id: string | null;
  criterio: ServicesSearchResult["criterio"] | null;
  servico: ServicoNormalizado;
  reserva: { realizada: false; motivo: "reserva_de_servico_nao_implementada" };
};

/** Devolve a seleção persistida com os mesmos identificadores (opacos). */
export async function recuperarSelecao(
  selecaoId: string,
): Promise<ServicesSelectionResult | { erro: "selecao_nao_encontrada" }> {
  const supabase = await db();
  const { data } = await supabase
    .from("api_offer_refs")
    .select("payload,expires_at")
    .eq("kind", `svcsel:${selecaoId}`)
    .maybeSingle();
  const row = data as
    | {
        payload: {
          criterio: ServicesSearchResult["criterio"] | null;
          busca_id?: string | null;
          servico: ServicoInterno;
        };
        expires_at: string;
      }
    | null;
  if (!row || new Date(row.expires_at).getTime() < Date.now()) {
    return { erro: "selecao_nao_encontrada" };
  }
  return {
    status: "selected",
    selecao_id: selecaoId,
    busca_id: row.payload.busca_id ?? null,
    criterio: row.payload.criterio ?? null,
    servico: paraSkyHub(row.payload.servico),
    reserva: { realizada: false, motivo: "reserva_de_servico_nao_implementada" },
  };
}

/**
 * Uso interno da VIA AIR (reserva futura): devolve os identificadores reais do
 * fornecedor de uma seleção. NUNCA exposto em rota da Internal API.
 */
export async function lerReferenciaInterna(
  selecaoId: string,
): Promise<ReferenciaInterna | null> {
  const supabase = await db();
  const { data } = await supabase
    .from("api_offer_refs")
    .select("payload,expires_at")
    .eq("kind", `svcsel:${selecaoId}`)
    .maybeSingle();
  const row = data as { payload: { servico: ServicoInterno }; expires_at: string } | null;
  if (!row || new Date(row.expires_at).getTime() < Date.now()) return null;
  return row.payload.servico._fornecedor ?? null;
}

