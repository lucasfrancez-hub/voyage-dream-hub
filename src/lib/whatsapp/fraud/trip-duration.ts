/**
 * Duração da viagem como sinal CONTEXTUAL do score antifraude.
 *
 * Regra principal: a pergunta não é "quantos dias?", e sim
 * "essa permanência é normal para esse tipo de deslocamento?".
 *
 * - Doméstico: peso baixo ou neutro (bate-volta, reunião, evento são normais).
 * - Internacional: quanto maior o deslocamento e menor a permanência,
 *   maior a relevância — mas nunca gera transferência sozinho.
 */

export type TripDurationContext = {
  trip_duration_days: number;
  domestic_or_international: "domestic" | "international" | "desconhecido";
  route_distance_km: number | null;
  route_distance_context: "curta" | "media" | "longa" | "desconhecida";
  longhaul: boolean;
};

export type TripDurationAssessment = {
  /** 0..1 — força bruta do sinal INTERNATIONAL_SHORT_STAY (0 = neutro). */
  intensity: number;
  evidence: string;
  context: TripDurationContext;
};

/** Coordenadas aproximadas (lat, lon) — só para medir ordem de grandeza da rota. */
const AIRPORTS: Record<string, { lat: number; lon: number; br: boolean }> = {
  GRU: { lat: -23.4, lon: -46.5, br: true },
  CGH: { lat: -23.6, lon: -46.7, br: true },
  VCP: { lat: -23.0, lon: -47.1, br: true },
  GIG: { lat: -22.8, lon: -43.2, br: true },
  SDU: { lat: -22.9, lon: -43.2, br: true },
  BSB: { lat: -15.9, lon: -47.9, br: true },
  CNF: { lat: -19.6, lon: -43.9, br: true },
  CWB: { lat: -25.5, lon: -49.2, br: true },
  POA: { lat: -30.0, lon: -51.2, br: true },
  FLN: { lat: -27.7, lon: -48.5, br: true },
  NVT: { lat: -26.9, lon: -48.7, br: true },
  SSA: { lat: -12.9, lon: -38.3, br: true },
  REC: { lat: -8.1, lon: -34.9, br: true },
  FOR: { lat: -3.8, lon: -38.5, br: true },
  NAT: { lat: -5.8, lon: -35.4, br: true },
  MCZ: { lat: -9.5, lon: -35.8, br: true },
  BEL: { lat: -1.4, lon: -48.5, br: true },
  MAO: { lat: -3.0, lon: -60.0, br: true },
  MGF: { lat: -23.5, lon: -52.0, br: true },
  LDB: { lat: -23.3, lon: -51.1, br: true },
  IGU: { lat: -25.6, lon: -54.5, br: true },
  CGB: { lat: -15.7, lon: -56.1, br: true },
  CGR: { lat: -20.5, lon: -54.7, br: true },
  GYN: { lat: -16.6, lon: -49.2, br: true },
  VIX: { lat: -20.3, lon: -40.3, br: true },
  JPA: { lat: -7.1, lon: -34.9, br: true },
  SLZ: { lat: -2.6, lon: -44.2, br: true },
  THE: { lat: -5.1, lon: -42.8, br: true },
  AJU: { lat: -10.98, lon: -37.07, br: true },
  PMW: { lat: -10.3, lon: -48.4, br: true },
  // internacionais frequentes
  EZE: { lat: -34.8, lon: -58.5, br: false },
  AEP: { lat: -34.6, lon: -58.4, br: false },
  SCL: { lat: -33.4, lon: -70.8, br: false },
  MVD: { lat: -34.8, lon: -56.0, br: false },
  ASU: { lat: -25.2, lon: -57.5, br: false },
  LIM: { lat: -12.0, lon: -77.1, br: false },
  BOG: { lat: 4.7, lon: -74.1, br: false },
  MEX: { lat: 19.4, lon: -99.1, br: false },
  CUN: { lat: 21.0, lon: -86.9, br: false },
  MIA: { lat: 25.8, lon: -80.3, br: false },
  MCO: { lat: 28.4, lon: -81.3, br: false },
  JFK: { lat: 40.6, lon: -73.8, br: false },
  EWR: { lat: 40.7, lon: -74.2, br: false },
  LAX: { lat: 33.9, lon: -118.4, br: false },
  ORD: { lat: 42.0, lon: -87.9, br: false },
  IAH: { lat: 30.0, lon: -95.3, br: false },
  ATL: { lat: 33.6, lon: -84.4, br: false },
  BOS: { lat: 42.4, lon: -71.0, br: false },
  YYZ: { lat: 43.7, lon: -79.6, br: false },
  LIS: { lat: 38.8, lon: -9.1, br: false },
  OPO: { lat: 41.2, lon: -8.7, br: false },
  MAD: { lat: 40.5, lon: -3.6, br: false },
  BCN: { lat: 41.3, lon: 2.1, br: false },
  CDG: { lat: 49.0, lon: 2.5, br: false },
  ORY: { lat: 48.7, lon: 2.4, br: false },
  LHR: { lat: 51.5, lon: -0.5, br: false },
  LGW: { lat: 51.1, lon: -0.2, br: false },
  FCO: { lat: 41.8, lon: 12.3, br: false },
  MXP: { lat: 45.6, lon: 8.7, br: false },
  FRA: { lat: 50.0, lon: 8.6, br: false },
  MUC: { lat: 48.4, lon: 11.8, br: false },
  AMS: { lat: 52.3, lon: 4.8, br: false },
  ZRH: { lat: 47.5, lon: 8.5, br: false },
  DXB: { lat: 25.3, lon: 55.4, br: false },
  DOH: { lat: 25.3, lon: 51.6, br: false },
  IST: { lat: 41.3, lon: 28.7, br: false },
  JNB: { lat: -26.1, lon: 28.2, br: false },
  NRT: { lat: 35.8, lon: 140.4, br: false },
  SYD: { lat: -33.9, lon: 151.2, br: false },
};

function iata(value?: string | null): string | null {
  const m = String(value ?? "")
    .toUpperCase()
    .match(/\b([A-Z]{3})\b/);
  return m ? m[1]! : null;
}

function haversine(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

function daysBetween(a: string, b: string): number | null {
  const d1 = new Date(`${a.slice(0, 10)}T12:00:00`).getTime();
  const d2 = new Date(`${b.slice(0, 10)}T12:00:00`).getTime();
  if (!Number.isFinite(d1) || !Number.isFinite(d2)) return null;
  const dias = Math.round((d2 - d1) / 86_400_000);
  return dias >= 0 ? dias : null;
}

/** Faixa dinâmica de atenção por dias de permanência (internacional). */
function baseByDays(dias: number): number {
  if (dias <= 3) return 0.85; // atenção forte
  if (dias === 4) return 0.6; // atenção relevante
  if (dias === 5) return 0.4; // atenção moderada
  if (dias === 6) return 0.22; // atenção leve
  return 0; // 7+ dias: neutro pela duração
}

/**
 * Avalia a permanência considerando rota, distância e tipo de voo.
 * Retorna intensity = 0 quando a duração é normal para aquele deslocamento.
 */
export function assessTripDuration(input: {
  origin?: string | null;
  destination?: string | null;
  departure_date?: string | null;
  return_date?: string | null;
  /** texto livre da rota, usado quando não há IATA estruturado */
  route_text?: string | null;
}): TripDurationAssessment | null {
  if (!input.departure_date || !input.return_date) return null;
  const dias = daysBetween(input.departure_date, input.return_date);
  if (dias === null) return null;

  const codes = [iata(input.origin), iata(input.destination)].filter(Boolean) as string[];
  const fromText = (input.route_text ?? "").toUpperCase().match(/\b[A-Z]{3}\b/g) ?? [];
  const [a, b] = codes.length === 2 ? codes : (fromText.slice(0, 2) as string[]);

  const pa = a ? AIRPORTS[a] : undefined;
  const pb = b ? AIRPORTS[b] : undefined;

  let tipo: TripDurationContext["domestic_or_international"] = "desconhecido";
  if (pa && pb) tipo = pa.br && pb.br ? "domestic" : "international";

  const distancia = pa && pb ? haversine(pa, pb) : null;
  const distContext: TripDurationContext["route_distance_context"] =
    distancia === null ? "desconhecida" : distancia >= 5000 ? "longa" : distancia >= 2000 ? "media" : "curta";
  const longhaul = distancia !== null && distancia >= 5000;

  const context: TripDurationContext = {
    trip_duration_days: dias,
    domestic_or_international: tipo,
    route_distance_km: distancia,
    route_distance_context: distContext,
    longhaul,
  };

  if (tipo === "desconhecido") return { intensity: 0, evidence: `Permanência de ${dias} dia(s)`, context };

  if (tipo === "domestic") {
    // Doméstico é praticamente neutro: só um resquício em trechos muito longos
    // com permanência de 1 dia (ex.: POA → MAO por 1 dia).
    const intensity = distancia !== null && distancia >= 3000 && dias <= 1 ? 0.12 : 0;
    return {
      intensity,
      evidence: `Nacional ${a}→${b}, ${dias} dia(s) — duração compatível com trabalho/evento/bate-volta`,
      context,
    };
  }

  const base = baseByDays(dias);
  if (base <= 0) {
    return { intensity: 0, evidence: `Internacional ${a}→${b}, ${dias} dia(s) — permanência normal`, context };
  }
  // Quanto maior o deslocamento, mais relevante a permanência curta.
  const fatorDistancia = distancia === null ? 0.6 : distancia >= 8000 ? 1 : distancia >= 5000 ? 0.9 : distancia >= 2500 ? 0.6 : 0.35;
  const intensity = Math.max(0, Math.min(1, base * fatorDistancia));
  return {
    intensity,
    evidence: `Internacional ${a}→${b}${distancia ? ` (~${distancia} km)` : ""} com permanência de ${dias} dia(s)`,
    context,
  };
}
