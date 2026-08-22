/**
 * Normalização do retorno bruto da PassHub para o formato do motor interno.
 * SERVER-ONLY (só é importado dentro de handlers de server functions).
 */

import type { PassHubVoo, PassHubOferta, PassHubResultado } from "./types";

export type * from "./types";

type Rec = Record<string, unknown>;

const rec = (v: unknown): Rec => (v && typeof v === "object" && !Array.isArray(v) ? (v as Rec) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown, fb = ""): string => (typeof v === "string" ? v : v == null ? fb : String(v));
const num = (v: unknown, fb = 0): number => {
  const n = typeof v === "number" ? v : Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : fb;
};
const bool = (v: unknown): boolean => v === true || v === "true";

/** "05:15" -> 315 minutos. */
export function duracaoParaMinutos(txt: string): number {
  const m = /^(\d+):(\d{2})$/.exec(txt.trim());
  if (!m) return 0;
  return Number(m[1]) * 60 + Number(m[2]);
}

function normalizaVoo(raw: unknown): PassHubVoo {
  const v = rec(raw);
  const provedores = arr(v["providers"]).map(rec);
  const melhor = provedores[0] ?? {};
  const parcelas = rec(melhor["parcelamento"]);
  const duracao = str(v["TOTAL_FLIGHT_DURATION"]);

  return {
    companhia: str(v["AIRLINE"], "—"),
    companhiaIata: str(v["AIRLINE_IATA"]),
    operadoPor: str(v["OPERATING_AIRLINE_IATA"]),
    familiaTarifaria: str(v["fare_family"]),
    classe: str(v["CLASSE_SERVICO"]),
    origem: str(v["DEPARTURE_LOCATION"]),
    destino: str(v["ARRIVAL_LOCATION"]),
    partida: str(v["DEPARTURE_TIME"]),
    chegada: str(v["ARRIVAL_TIME"]),
    duracao,
    duracaoMinutos: duracaoParaMinutos(duracao),
    numeroVoo: str(v["flight_number"]),
    paradas: num(v["QNT_STOP"]),
    escala: str(v["escala"]),
    mudancaAeroporto: bool(v["has_airport_change"]),
    conexoes: arr(v["STOPS"]).map((s) => {
      const c = rec(s);
      return {
        aeroporto: str(c["airport_code"]),
        chegada: str(c["arrival_time"]),
        saida: str(c["departure_time"]),
        duracao: str(c["duration"]),
        mudancaAeroporto: bool(c["is_airport_change"]),
      };
    }),
    bagagemDespachada: bool(v["BAGAGEM_DESPACHADA_INCLUSA"]),
    bagagemDespachadaQtd: num(v["BAGAGEM_DESPACHADA_QUANTIDADE"]),
    bagagemMao: bool(v["BAGAGEM_MAO_INCLUSA"]),
    servicos: arr(v["SERVICOS"]).map((s) => {
      const c = rec(s);
      return {
        tipo: str(c["type"]),
        incluso: bool(c["isIncluded"]),
        descricao: str(c["description"]),
      };
    }),
    precoTotal: num(v["preco_total"]),
    precoTarifa: num(v["preco_tarifa"]),
    taxas: num(v["TOTAL_TAX"] ?? v["TAX"]),
    provedor: str(v["provider"] ?? melhor["provider"]),
    canal: str(melhor["channel"]),
    rateToken: str(v["rateToken"] ?? melhor["rateToken"]),
    parcelamento: Object.entries(parcelas).map(([bandeira, info]) => {
      const i = rec(info);
      const lista = arr(i["parcelas"]).map((p) => num(p));
      return {
        bandeira,
        maxParcelas: lista.length ? Math.max(...lista) : 0,
        motivos: arr(i["motivos"]).map((m) => str(m)),
      };
    }),
  };
}

/** Converte o payload bruto da PassHub em ofertas prontas para o motor. */
export function normalizaBuscaPassHub(bruto: unknown): PassHubResultado {
  const raiz = rec(bruto);
  const meta = rec(raiz["meta"]);
  const global = rec(meta["global"]);

  const ofertas: PassHubOferta[] = arr(raiz["passagens"]).map((p, i) => {
    const item = rec(p);
    const ida = normalizaVoo(item["ida"]);
    const voltas = arr(item["voltas"]).map(normalizaVoo);
    return {
      id: `${i}-${ida.numeroVoo}-${ida.partida}`,
      precoTotal: ida.precoTotal + voltas.reduce((s, v) => s + v.precoTotal, 0),
      ida,
      voltas,
    };
  });

  const precos = ofertas.map((o) => o.precoTotal).filter((n) => n > 0);

  return {
    pagina: num(meta["page"], 1),
    porPagina: num(meta["page_size"], ofertas.length),
    total: num(meta["total_items"], ofertas.length),
    totalPaginas: num(meta["total_pages"], 1),
    companhias: arr(global["airlines"]).map((a) => str(a)),
    familias: arr(global["fare_families"]).map((a) => str(a)),
    // Preços vêm somados (ida + volta), então a faixa é derivada das ofertas
    // para não filtrar tudo com o price_max de trecho único da PassHub.
    precoMin: precos.length ? Math.min(...precos) : num(global["price_min"]),
    precoMax: precos.length ? Math.max(...precos) : num(global["price_max"]),
    ofertas,
  };
}
