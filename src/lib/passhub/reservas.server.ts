/**
 * Reservas da agência na PassHub. SERVER-ONLY.
 *
 * Contrato do painel: GET {gerencia}/api/v1/reservas → todas as reservas da
 * agência (inclusive as criadas direto no site da PassHub).
 */
import { passhubRequest } from "./client.server";
import type { PassHubReservaLista } from "./types";

const GERENCIA = "https://emissor-gerencia.passhub.com.br";

type Rec = Record<string, unknown>;
const rec = (v: unknown): Rec => (v && typeof v === "object" && !Array.isArray(v) ? (v as Rec) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown, fb = ""): string => (typeof v === "string" ? v : v == null ? fb : String(v));
const num = (v: unknown, fb = 0): number => {
  const n = typeof v === "number" ? v : Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : fb;
};

function normalizaSegmento(v: unknown) {
  const s = rec(v);
  return {
    origem: str(s["origem"]),
    destino: str(s["destino"]),
    partida: str(s["data_partida"]),
    chegada: str(s["data_chegada"]),
    duracao: str(s["duracao"]),
    bagagemMao: s["bagagem_mao"] === true,
    bagagemDespachada: s["bagagem_despachada"] === true,
    bagagemDespachadaQtd: num(s["bagagem_despachada_quantidade"]),
    conexoes: arr(s["conexoes"]).map((c) => {
      const x = rec(c);
      return {
        origem: str(x["origem"]),
        destino: str(x["destino"]),
        partida: str(x["data_partida"]),
        chegada: str(x["data_chegada"]),
        duracao: str(x["duracao"]),
        numeroVoo: str(x["numero_voo"]),
        familiaTarifaria: str(x["familia_tarifaria"]),
        classe: str(x["cabin_class"]),
        companhia: str(x["airline_iata_operating"]),
      };
    }),
  };
}

function normalizaReserva(v: unknown): PassHubReservaLista {
  const r = rec(v);
  return {
    idPassagem: num(r["id_passagem"]),
    localizador: str(r["localizador"]),
    localizadorCompanhia: str(r["localizador_companhia"]),
    status: str(r["status_emissao"]),
    statusDescricao: str(r["descricao_status_emissao"]),
    origem: str(r["origem"]),
    destino: str(r["destino"]),
    dataIda: str(r["data_ida"]),
    dataVolta: str(r["data_volta"]),
    criadaEm: str(r["data_criacao_reserva"]),
    limiteEmissao: str(r["data_limite_emissao"]),
    emitidaEm: str(r["data_emissao"]),
    preco: num(r["preco"]),
    precoSemTaxa: num(r["preco_sem_taxa"]),
    taxas: num(r["tax"]),
    ravPercentual: num(r["rav_percentage"]),
    ravValor: num(r["rav_amount_brl"]),
    comissao: num(r["valor_comissao"]),
    companhia: str(r["companhia_aerea_iata"] ?? r["companhia_aerea"]),
    provedor: str(r["provider"]),
    emissor: str(r["nome_usuario"]),
    whatsapp: str(r["numero_whatsapp"]),
    linkPagamento: str(r["link_pagamento"]),
    multitrecho: r["is_multitrecho"] === true,
    passageiros: arr(r["nomes_passageiros"]).map((p) => str(p)).filter(Boolean),
    segmentos: arr(r["segmentos"]).map(normalizaSegmento),
  };
}

/** Todas as reservas da agência na PassHub, mais recentes primeiro. */
export async function passhubListarReservas(): Promise<PassHubReservaLista[]> {
  const bruto = await passhubRequest<unknown>(`${GERENCIA}/api/v1/reservas`, { method: "GET" });
  const dados = rec(rec(bruto)["data"]);
  const lista = arr(dados["reservas"] ?? rec(bruto)["reservas"]);
  return lista
    .map(normalizaReserva)
    .sort((a, b) => (a.criadaEm < b.criadaEm ? 1 : a.criadaEm > b.criadaEm ? -1 : 0));
}

/** Detalhe de uma reserva específica (mesmo contrato do painel). */
export async function passhubReservaDetalhe(id: number): Promise<PassHubReservaLista | null> {
  const bruto = await passhubRequest<unknown>(`${GERENCIA}/api/v1/reservas/${id}`, {
    method: "GET",
  });
  const dados = rec(bruto)["data"];
  if (!dados || typeof dados !== "object") return null;
  return normalizaReserva(dados);
}

/**
 * Link de pagamento da reserva. A PassHub gera o link do checkout logo após a
 * reserva, então aqui consultamos (com algumas tentativas) até ele aparecer.
 */
export async function passhubLinkPagamentoReserva(alvo: {
  id?: number;
  localizador?: string;
}): Promise<{ link: string; reserva: PassHubReservaLista | null }> {
  const localizador = (alvo.localizador ?? "").trim().toUpperCase();

  const buscar = async (): Promise<PassHubReservaLista | null> => {
    if (alvo.id) {
      const r = await passhubReservaDetalhe(alvo.id);
      if (r) return r;
    }
    if (!localizador) return null;
    const lista = await passhubListarReservas();
    return lista.find((r) => r.localizador.toUpperCase() === localizador) ?? null;
  };

  let reserva: PassHubReservaLista | null = null;
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    reserva = await buscar();
    if (reserva?.linkPagamento) return { link: reserva.linkPagamento, reserva };
    if (tentativa < 2) await new Promise((r) => setTimeout(r, 2000));
  }
  return { link: "", reserva };
}
