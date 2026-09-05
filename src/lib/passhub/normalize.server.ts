/**
 * Normalização do retorno bruto da PassHub para o formato do motor interno.
 * SERVER-ONLY (só é importado dentro de handlers de server functions).
 */

import type { PassHubVoo, PassHubOferta, PassHubResultado } from "./types";
import { registraProvedor } from "./provider-registry.server";


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

function normalizaVoo(raw: unknown, incentivoPct = 0): PassHubVoo {
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
    ravValor: num(v["rav_amount_brl"] ?? v["RAV_AMOUNT"] ?? v["rav_amount"] ?? v["RAV"]),
    ravPercentual: num(v["rav_percentage"] ?? v["RAV_PERCENTAGE"]),
    // O incentivo do nível não vem no payload: o portal calcula tarifa base x pct.
    incentivoValor:
      num(v["incentive_amount_brl"] ?? v["incentive_amount"] ?? v["INCENTIVE_AMOUNT"]) ||
      Math.round(num(v["preco_tarifa"]) * (incentivoPct / 100) * 100) / 100,
    incentivoPercentual:
      num(v["incentive_percentage"] ?? v["INCENTIVE_PERCENTAGE"] ?? v["incentivo_percentual"]) ||
      incentivoPct,
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

/** "180" minutos -> "03:00". */
function minutosParaDuracao(min: number): string {
  if (!Number.isFinite(min) || min <= 0) return "";
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * A busca multitrecho devolve um formato próprio (`grupos` -> `combos` ->
 * `trechos`), sem os campos em caixa alta do motor de ida/volta. Convertemos
 * cada combo em uma oferta (1º trecho = ida, demais = trechos seguintes) para
 * a tela mostrar os voos normalmente.
 */
function normalizaTrechoMulti(
  raw: unknown,
  combo: Rec,
  rateToken: string,
  incentivoPct: number,
): PassHubVoo {
  const t = rec(raw);
  const segs = arr(t["segments"]).map(rec);
  const primeiro = segs[0] ?? {};
  const duracaoMin = num(t["duration"]);
  const tarifa = num(t["preco_tarifa"]);

  return {
    companhia: str(primeiro["airline"], str(combo["companhia"], "—")),
    companhiaIata: str(primeiro["airline_iata"], str(combo["companhia"])),
    operadoPor: str(primeiro["operating_airline_iata"]),
    familiaTarifaria: str(primeiro["fare_family"]),
    classe: str(primeiro["class_service"]),
    origem: str(t["origin"]),
    destino: str(t["destination"]),
    partida: str(t["departure_date"]),
    chegada: str(t["arrival_date"]),
    duracao: minutosParaDuracao(duracaoMin),
    duracaoMinutos: duracaoMin,
    numeroVoo: str(primeiro["flight_number"]),
    paradas: num(t["stops"], Math.max(segs.length - 1, 0)),
    escala: "",
    mudancaAeroporto: bool(t["has_airport_change"]),
    conexoes: segs.slice(1).map((s, i) => {
      const anterior = segs[i] ?? {};
      return {
        aeroporto: str(s["departure"]),
        chegada: str(anterior["arrival_date"]),
        saida: str(s["departure_date"]),
        duracao: "",
        mudancaAeroporto: str(anterior["arrival"]) !== str(s["departure"]),
      };
    }),
    bagagemDespachada: bool(primeiro["has_checked_bag"]),
    bagagemDespachadaQtd: num(primeiro["checked_bag_qty"]),
    bagagemMao: bool(primeiro["has_cabin_bag"]),
    servicos: [],
    precoTotal: num(t["price"]),
    precoTarifa: tarifa,
    taxas: num(t["total_tax"]),
    ravValor: 0,
    ravPercentual: 0,
    incentivoValor: Math.round(tarifa * (incentivoPct / 100) * 100) / 100,
    incentivoPercentual: incentivoPct,
    provedor: str(combo["provider"]),
    canal: "",
    rateToken,
    parcelamento: [],
  };
}

function ofertasMultitrecho(raiz: Rec, incentivoPct: number): PassHubOferta[] {
  const ofertas: PassHubOferta[] = [];
  arr(raiz["grupos"]).forEach((g, gi) => {
    const grupo = rec(g);
    arr(grupo["combos"]).forEach((c, ci) => {
      const combo = rec(c);
      const tokens = arr(combo["rate_tokens"]).map((x) => str(x));
      const provedor = str(combo["provider"]);
      const voos = arr(combo["trechos"]).map((t, i) =>
        normalizaTrechoMulti(t, combo, tokens[i] ?? "", incentivoPct),
      );
      if (!voos.length) return;
      for (const v of voos) if (v.rateToken) registraProvedor(v.rateToken, provedor);
      const [ida, ...demais] = voos as [PassHubVoo, ...PassHubVoo[]];
      ofertas.push({
        id: `mt-${gi}-${ci}-${ida.numeroVoo}-${ida.partida}`,
        precoTotal: num(combo["total_price"]),
        ida,
        voltas: demais,
      });
    });
  });
  return ofertas;
}

/** Converte o payload bruto da PassHub em ofertas prontas para o motor. */
export function normalizaBuscaPassHub(bruto: unknown, incentivoPct = 0): PassHubResultado {
  const raiz = rec(bruto);
  const meta = rec(raiz["meta"]);
  const global = rec(meta["global"]);

  if (Array.isArray(raiz["grupos"])) {
    const ofertasMulti = ofertasMultitrecho(raiz, incentivoPct);
    const precosMulti = ofertasMulti.map((o) => o.precoTotal).filter((n) => n > 0);
    return {
      pagina: num(meta["page"], 1),
      porPagina: num(meta["page_size"], ofertasMulti.length),
      total: num(meta["total_items"], ofertasMulti.length),
      totalPaginas: num(meta["total_pages"], 1),
      companhias: arr(global["airlines"]).map((a) => str(a)),
      familias: arr(global["fare_families"]).map((a) => str(a)),
      precoMin: precosMulti.length ? Math.min(...precosMulti) : num(global["preco_min"]),
      precoMax: precosMulti.length ? Math.max(...precosMulti) : num(global["preco_max"]),
      ofertas: ofertasMulti,
    };
  }



  const ofertas: PassHubOferta[] = arr(raiz["passagens"]).map((p, i) => {
    const item = rec(p);
    const ida = normalizaVoo(item["ida"], incentivoPct);
    const voltas = arr(item["voltas"]).map((v) => normalizaVoo(v, incentivoPct));
    // Guardamos o fornecedor de cada token: a tarifação recusa quando o
    // `provider` enviado não é o mesmo que gerou a oferta.
    for (const v of [ida, ...voltas]) registraProvedor(v.rateToken, v.provedor);

    // A PassHub NÃO precifica por trecho: `preco_total` da ida e de cada volta
    // já é o valor fechado da viagem (ida + aquela volta). Somar os dois
    // duplicaria o preço; o total da oferta é o menor combo disponível.
    const combos = voltas.map((v) => v.precoTotal).filter((n) => n > 0);
    return {
      id: `${i}-${ida.numeroVoo}-${ida.partida}`,
      precoTotal: combos.length ? Math.min(...combos) : ida.precoTotal,
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
