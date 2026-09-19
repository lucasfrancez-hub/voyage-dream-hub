/**
 * ADAPTER DE LOCAÇÃO DE CARRO — Compre Fácil.
 *
 * Arquitetura: Sky Hub -> Internal API v1 -> este adapter -> Compre Fácil.
 * A Sky Hub nunca fala com a operadora nem vê o formato bruto dela.
 *
 * Fase atual: buscar → normalizar → selecionar → recuperar seleção.
 * NÃO existe reserva, pagamento ou emissão aqui.
 *
 * Preço: exatamente o valor devolvido pela operadora. O Compre Fácil NÃO
 * devolve comissão da agência em campo próprio (só taxa administrativa e um
 * MarkupId interno). Nada é inferido: `markup_viaair` é 0 e
 * `comissao_agencia` é null. A eventual divisão comercial será regra interna
 * futura, separada deste contrato bruto.
 *
 * SERVER-ONLY.
 */
import { randomBytes } from "node:crypto";
import { z } from "zod";
import type { CarroCF } from "@/lib/comprefacil/carros.server";

/* ── Entrada ─────────────────────────────────────────────────────────── */

const dataHora = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?$/, "use AAAA-MM-DDTHH:MM");

export const carsLocationsInput = z.object({
  texto: z.string().min(2).max(60),
  limite: z.number().int().min(1).max(50).optional(),
});

export const carsSearchInput = z.object({
  /** sigla da loja/cidade vinda de /cars/locations */
  retirada: z.string().min(2).max(20),
  devolucao: z.string().min(2).max(20).optional(),
  tipoRetirada: z.enum(["loja", "cidade"]).optional(),
  tipoDevolucao: z.enum(["loja", "cidade"]).optional(),
  dataHoraRetirada: dataHora,
  dataHoraDevolucao: dataHora,
  adultos: z.number().int().min(1).max(9).default(2),
  criancas: z.array(z.number().int().min(0).max(17)).max(9).optional(),
  cidadeId: z.number().int().positive().optional(),
  cidadeDevolucaoId: z.number().int().positive().optional(),
  limite: z.number().int().min(1).max(100).optional(),
});
export type CarsSearchInput = z.infer<typeof carsSearchInput>;

export const carsSelectInput = z.object({
  buscaId: z.string().min(6).max(60),
  carroId: z.string().min(3).max(60),
  /** códigos das proteções escolhidas (opcional) */
  protecoes: z.array(z.string().min(1).max(20)).max(10).optional(),
});

export const carsSelectionInput = z.object({
  selecaoId: z.string().min(6).max(60),
});

/* ── Saída (padrão VIA AIR, em português) ────────────────────────────── */

export type ReferenciaOpaca = { tipo: "opaca"; ref: string; expira_em: string };
type ReferenciaInterna = Record<string, unknown>;

export type ProtecaoNormalizada = {
  codigo: string | null;
  titulo: string;
  descricao: string | null;
  valor: number | null;
  obrigatoria: boolean;
};

export type CarroNormalizado = {
  fornecedor: "comprefacil";
  tipo: "carro";
  carro_id: string;
  /** nome comercial quando o catálogo da operadora resolve; senão o código */
  locadora: string | null;
  /** sigla crua da operadora (ex.: "FL", "MOV") */
  locadora_codigo: string | null;
  /** nome oficial do catálogo da operadora; null quando não resolvido */
  locadora_nome: string | null;
  categoria: string | null;
  grupo: string | null;
  codigo_acriss: string | null;
  modelo: string | null;
  descricao: string | null;
  cambio: string | null;
  ar_condicionado: boolean | null;
  passageiros: number | null;
  malas: number | null;
  portas: number | null;
  quilometragem_livre: boolean | null;
  imagem_url: string | null;
  retirada: { local: string | null; endereco: string | null; data_hora: string | null };
  devolucao: { local: string | null; endereco: string | null; data_hora: string | null };
  diarias: number;
  moeda: string;
  valor_diaria: number | null;
  taxas: number;
  valor_total: number | null;
  disponibilidade: "disponivel" | "sob_consulta";
  protecoes: ProtecaoNormalizada[];
  protecoes_selecionadas: string[];
  valor_protecoes: number;
  /** não vem em campo próprio da operadora — nunca inventado aqui */
  combustivel: null;
  franquia: null;
  cancelamento: null;
  documento_condutor: string | null;
  precificacao: {
    origem_valor: "operadora";
    markup_viaair: 0;
    comissao_agencia: null;
    comissao_agencia_status: "nao_informada_pela_api";
  };
  referencia_fornecedor: ReferenciaOpaca;
};

export type CarroInterno = CarroNormalizado & { _fornecedor: ReferenciaInterna };

/** Remove o bloco sigiloso do fornecedor antes de responder ao Sky Hub. */
export function paraSkyHub(c: CarroInterno): CarroNormalizado {
  const { _fornecedor: _oculto, ...publico } = c;
  return publico;
}

export type CarsCriterio = {
  retirada: string;
  devolucao: string;
  data_hora_retirada: string;
  data_hora_devolucao: string;
  diarias: number;
  adultos: number;
  criancas: number[];
};

export type CarsSearchResult = {
  status: "found" | "not_found";
  fonte: "COMPREFACIL";
  busca_id: string;
  criterio: CarsCriterio;
  total: number;
  locadoras: string[];
  carros: CarroNormalizado[];
  mensagem: string;
};

/* ── Helpers ─────────────────────────────────────────────────────────── */

function novoId(prefixo: string): string {
  return `${prefixo}_${randomBytes(12).toString("base64url").replace(/[^A-Za-z0-9]/g, "").slice(0, 20)}`;
}

const VALIDADE_BUSCA_MS = 2 * 60 * 60 * 1000;
const VALIDADE_SELECAO_MS = 30 * 24 * 60 * 60 * 1000;

function refOpaca(validadeMs: number): ReferenciaOpaca {
  return {
    tipo: "opaca",
    ref: novoId("carref"),
    expira_em: new Date(Date.now() + validadeMs).toISOString(),
  };
}

function normalizarDataHora(v: string): string {
  const base = v.replace(" ", "T");
  return base.length === 16 ? `${base}:00` : base;
}

function calcularDiarias(inicio: string, fim: string): number {
  const ms = new Date(fim).getTime() - new Date(inicio).getTime();
  if (!Number.isFinite(ms) || ms <= 0) return 1;
  return Math.max(1, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}

function protecoes(c: CarroCF): ProtecaoNormalizada[] {
  return (c.Protecoes ?? []).map((p) => ({
    codigo: p.Codigo ?? null,
    titulo: p.Titulo ?? "",
    descricao: p.Descricao ?? null,
    valor: p.ValorVenda ?? p.ValorNet ?? null,
    obrigatoria: Boolean(p.ProtecaoObrigatoria),
  }));
}

function normalizar(c: CarroCF, criterio: CarsCriterio, guid: string): CarroInterno {
  const valorTotal = c.ValorTotalListagem ?? c.ValorListagem ?? c.ValorVenda ?? null;
  const valorDiaria = c.ValorVenda ?? c.ValorDiarias ?? null;
  return {
    fornecedor: "comprefacil",
    tipo: "carro",
    carro_id: novoId("car"),
    locadora: c.Fornecedor ?? null,
    categoria: c.Categoria ?? null,
    grupo: c.ModeloCodigo ?? null,
    codigo_acriss: c.Codigo ?? null,
    modelo: c.ModeloNome ?? null,
    descricao: c.Descricao ?? null,
    cambio: c.TransmissaoTipo ?? null,
    ar_condicionado: c.TemAirCondicionado ?? null,
    passageiros: c.Pax ?? null,
    malas: c.Bagagem ?? null,
    portas: c.Portas ?? null,
    quilometragem_livre: c.KmLivre ?? null,
    imagem_url: c.Imagem ?? null,
    retirada: {
      local: c.LocalOrigem ?? criterio.retirada,
      endereco: c.EnderecoOrigem ?? null,
      data_hora: c.DataHoraOrigem ?? criterio.data_hora_retirada,
    },
    devolucao: {
      local: c.LocalDevolucao ?? criterio.devolucao,
      endereco: c.EnderecoDevolucao ?? null,
      data_hora: c.DataHoraDevolucao ?? criterio.data_hora_devolucao,
    },
    diarias: criterio.diarias,
    moeda: c.MoedaListagem?.Sigla ?? "BRL",
    valor_diaria: valorDiaria,
    taxas: c.TaxaExtra ?? 0,
    valor_total: valorTotal,
    disponibilidade: valorTotal != null ? "disponivel" : "sob_consulta",
    protecoes: protecoes(c),
    protecoes_selecionadas: [],
    valor_protecoes: 0,
    combustivel: null,
    franquia: null,
    cancelamento: null,
    documento_condutor: c.CondutorDocumentoTipo ?? null,
    precificacao: {
      origem_valor: "operadora",
      markup_viaair: 0,
      comissao_agencia: null,
      comissao_agencia_status: "nao_informada_pela_api",
    },
    referencia_fornecedor: refOpaca(VALIDADE_BUSCA_MS),
    // Bloco sigiloso: identificadores reais para a reserva futura.
    // Nunca sai do servidor (ver `paraSkyHub`).
    _fornecedor: {
      fornecedor: "comprefacil",
      busca_guid: guid,
      item_guid: c.ItemGuid ?? null,
      codigo_interno: c.CodigoInterno ?? null,
      oferta_id: c.Id ?? null,
      locadora_codigo: c.Fornecedor ?? null,
      codigo_cliente: c.CodigoCliente ?? null,
      pagamento_codigo: c.PagamentoCodigo ?? null,
      webservice_id: c.WebServiceId ?? null,
      // Metadado interno da operadora. NÃO é comissão e não sai daqui.
      markup_id: c.MarkupId ?? null,
      taxa_adm: c.TaxaAdm ?? null,
      taxa_adm_percentual: c.TaxaAdmPercentual ?? null,
      extra: c.Extra ?? null,
      offline: c.Offline ?? null,
      protecoes: (c.Protecoes ?? []).map((p) => ({
        codigo: p.Codigo ?? null,
        tipo: p.Tipo ?? null,
        valor: p.ValorVenda ?? null,
        taxa_adm: p.TaxaAdm ?? null,
      })),
    },
  };
}

/* ── Persistência ────────────────────────────────────────────────────── */

async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function lerBusca(
  buscaId: string,
): Promise<{ criterio: CarsCriterio; carros: CarroInterno[] } | null> {
  const supabase = await db();
  const { data } = await supabase
    .from("api_offer_refs")
    .select("payload,expires_at")
    .eq("kind", `carsearch:${buscaId}`)
    .maybeSingle();
  const row = data as
    | { payload: { criterio: CarsCriterio; carros: CarroInterno[] }; expires_at: string }
    | null;
  if (!row || new Date(row.expires_at).getTime() < Date.now()) return null;
  return row.payload;
}

/* ── Lojas / localidades ─────────────────────────────────────────────── */

export type CarsLocation = {
  codigo: string;
  nome: string;
  endereco: string | null;
  tipo: "loja" | "cidade";
  cidade_id: number | null;
  principal: boolean;
};

export async function buscarLocaisCarro(
  input: z.infer<typeof carsLocationsInput>,
): Promise<{ status: "found" | "not_found"; total: number; locais: CarsLocation[] }> {
  const { lojasCarroCF } = await import("@/lib/comprefacil/carros.server");
  const lojas = await lojasCarroCF(input.texto, input.limite ?? 20);
  const locais: CarsLocation[] = lojas.map((l) => ({
    codigo: l.sigla,
    nome: l.nome,
    endereco: l.endereco,
    tipo: l.tipo === "A" ? "cidade" : "loja",
    cidade_id: l.cidadeId,
    principal: l.principal,
  }));
  return { status: locais.length ? "found" : "not_found", total: locais.length, locais };
}

/* ── Busca ───────────────────────────────────────────────────────────── */

export async function buscarCarros(
  input: CarsSearchInput,
  clientId: string | null,
): Promise<CarsSearchResult> {
  const retirada = input.retirada.trim().toUpperCase();
  const devolucao = (input.devolucao ?? input.retirada).trim().toUpperCase();
  const inicio = normalizarDataHora(input.dataHoraRetirada);
  const fim = normalizarDataHora(input.dataHoraDevolucao);

  const criterio: CarsCriterio = {
    retirada,
    devolucao,
    data_hora_retirada: inicio,
    data_hora_devolucao: fim,
    diarias: calcularDiarias(inicio, fim),
    adultos: input.adultos ?? 2,
    criancas: input.criancas ?? [],
  };

  const { buscarCarrosCF, lojasCarroCF } = await import("@/lib/comprefacil/carros.server");
  const tipo = (t?: "loja" | "cidade") => (t === "cidade" ? "A" : "C");

  // A operadora exige o id da cidade na busca; resolvemos pelo código do local
  // quando o Sky Hub não informa.
  async function resolverCidade(codigo: string): Promise<number | null> {
    const lojas = await lojasCarroCF(codigo, 10);
    const achou =
      lojas.find((l) => l.sigla?.toUpperCase() === codigo && l.cidadeId) ??
      lojas.find((l) => l.cidadeId);
    return achou?.cidadeId ?? null;
  }
  const cidadeOrigemId = input.cidadeId ?? (await resolverCidade(retirada));
  const cidadeDevolucaoId =
    input.cidadeDevolucaoId ??
    (devolucao === retirada ? cidadeOrigemId : await resolverCidade(devolucao));
  const bruto = await buscarCarrosCF({
    localOrigem: retirada,
    localDevolucao: devolucao,
    tipoOrigem: tipo(input.tipoRetirada),
    tipoDevolucao: tipo(input.tipoDevolucao ?? input.tipoRetirada),
    dataHoraRetirada: inicio,
    dataHoraDevolucao: fim,
    adultos: criterio.adultos,
    idadesCriancas: criterio.criancas,
    cidadeOrigemId,
    cidadeDevolucaoId,
    itensPorPagina: input.limite ?? 50,
  });

  const lista = bruto.itens.map((c) => normalizar(c, criterio, bruto.guid));
  const locadoras = Array.from(
    new Set(lista.map((c) => c.locadora).filter((x): x is string => Boolean(x))),
  );

  const buscaId = novoId("cars");
  const supabase = await db();
  await supabase.from("api_offer_refs").insert({
    api_client_id: clientId,
    search_id: buscaId,
    kind: `carsearch:${buscaId}`,
    payload: { criterio, carros: lista } as never,
    expires_at: new Date(Date.now() + VALIDADE_BUSCA_MS).toISOString(),
  } as never);

  return {
    status: lista.length ? "found" : "not_found",
    fonte: "COMPREFACIL",
    busca_id: buscaId,
    criterio,
    total: bruto.total || lista.length,
    locadoras,
    carros: lista.map(paraSkyHub),
    mensagem: lista.length
      ? `${lista.length} opção(ões) de carro disponíveis para o período.`
      : "Nenhum carro disponível para este local e período.",
  };
}

/* ── Seleção (não reserva) ───────────────────────────────────────────── */

export type CarsSelectResult = {
  status: "selected";
  selecao_id: string;
  busca_id: string;
  criterio: CarsCriterio;
  carro: CarroNormalizado;
  reserva: { realizada: false; motivo: "reserva_de_carro_nao_implementada" };
};

export type CarsSelectErro = {
  erro: "busca_expirada" | "carro_nao_encontrado" | "protecao_indisponivel";
};

export async function selecionarCarro(
  input: z.infer<typeof carsSelectInput>,
  clientId: string | null,
): Promise<CarsSelectResult | CarsSelectErro> {
  const busca = await lerBusca(input.buscaId);
  if (!busca) return { erro: "busca_expirada" };
  const base = busca.carros.find((c) => c.carro_id === input.carroId);
  if (!base) return { erro: "carro_nao_encontrado" };

  const escolhidas = input.protecoes ?? [];
  for (const cod of escolhidas) {
    if (!base.protecoes.some((p) => p.codigo === cod)) return { erro: "protecao_indisponivel" };
  }
  const valorProtecoes = base.protecoes
    .filter((p) => escolhidas.includes(p.codigo ?? ""))
    .reduce((s, p) => s + (p.valor ?? 0), 0);

  const escolhido: CarroInterno = {
    ...base,
    protecoes_selecionadas: escolhidas,
    valor_protecoes: valorProtecoes,
    valor_total: (base.valor_total ?? 0) + valorProtecoes,
    referencia_fornecedor: refOpaca(VALIDADE_SELECAO_MS),
    _fornecedor: { ...base._fornecedor, protecoes_escolhidas: escolhidas },
  };

  const selecaoId = novoId("carsel");
  const supabase = await db();
  await supabase.from("api_offer_refs").insert({
    api_client_id: clientId,
    search_id: input.buscaId,
    kind: `carsel:${selecaoId}`,
    payload: { criterio: busca.criterio, busca_id: input.buscaId, carro: escolhido } as never,
    expires_at: new Date(Date.now() + VALIDADE_SELECAO_MS).toISOString(),
  } as never);

  return {
    status: "selected",
    selecao_id: selecaoId,
    busca_id: input.buscaId,
    criterio: busca.criterio,
    carro: paraSkyHub(escolhido),
    reserva: { realizada: false, motivo: "reserva_de_carro_nao_implementada" },
  };
}

/* ── Recuperação da seleção ──────────────────────────────────────────── */

export type CarsSelectionResult = {
  status: "selected";
  selecao_id: string;
  busca_id: string | null;
  criterio: CarsCriterio | null;
  carro: CarroNormalizado;
  reserva: { realizada: false; motivo: "reserva_de_carro_nao_implementada" };
};

export async function recuperarSelecaoCarro(
  selecaoId: string,
): Promise<CarsSelectionResult | { erro: "selecao_nao_encontrada" }> {
  const supabase = await db();
  const { data } = await supabase
    .from("api_offer_refs")
    .select("payload,expires_at")
    .eq("kind", `carsel:${selecaoId}`)
    .maybeSingle();
  const row = data as
    | {
        payload: { criterio: CarsCriterio | null; busca_id?: string | null; carro: CarroInterno };
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
    carro: paraSkyHub(row.payload.carro),
    reserva: { realizada: false, motivo: "reserva_de_carro_nao_implementada" },
  };
}

/**
 * Uso interno da VIA AIR (reserva futura): identificadores reais da operadora.
 * NUNCA exposto em rota da Internal API.
 */
export async function lerReferenciaInternaCarro(
  selecaoId: string,
): Promise<ReferenciaInterna | null> {
  const supabase = await db();
  const { data } = await supabase
    .from("api_offer_refs")
    .select("payload,expires_at")
    .eq("kind", `carsel:${selecaoId}`)
    .maybeSingle();
  const row = data as { payload: { carro: CarroInterno }; expires_at: string } | null;
  if (!row || new Date(row.expires_at).getTime() < Date.now()) return null;
  return row.payload.carro._fornecedor ?? null;
}
