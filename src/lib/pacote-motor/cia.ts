/** Nome oficial da companhia aérea por código IATA (a API às vezes devolve só a sigla). */
const NOMES: Record<string, string> = {
  G3: "GOL Linhas Aéreas",
  AD: "Azul Linhas Aéreas",
  "2Z": "Azul Conecta",
  LA: "LATAM Airlines",
  JJ: "LATAM Airlines",
  AA: "American Airlines",
  UA: "United Airlines",
  DL: "Delta Air Lines",
  CM: "Copa Airlines",
  AV: "Avianca",
  AR: "Aerolíneas Argentinas",
  TP: "TAP Air Portugal",
  IB: "Iberia",
  AF: "Air France",
  KL: "KLM",
  LH: "Lufthansa",
  TK: "Turkish Airlines",
  EK: "Emirates",
  QR: "Qatar Airways",
  BA: "British Airways",
  AZ: "ITA Airways",
  IG: "ITA Airways",
  LX: "Swiss Air Lines",
  AC: "Air Canada",
  CA: "Air China",
  UX: "Air Europa",
  AT: "Royal Air Maroc",
  SQ: "Singapore Airlines",
  EY: "Etihad Airways",
  LO: "LOT Polish Airlines",
  SU: "Aeroflot",
  AM: "Aeroméxico",
  H2: "Sky Airline",
  JA: "JetSmart",
  P5: "Wingo",
  O6: "Avianca Brasil",
};

const ALIAS: Record<string, string> = {
  LATAM: "LA",
  "LATAM AIRLINES": "LA",
  "LATAM AIRLINES BRASIL": "LA",
  GOL: "G3",
  "GOL LINHAS AEREAS": "G3",
  AZUL: "AD",
  "AZUL LINHAS AEREAS": "AD",
  ITA: "AZ",
  ALITALIA: "AZ",
  IBERIA: "IB",
  SWISS: "LX",
  "TAP PORTUGAL": "TP",
  "AMERICAN AIRLINES": "AA",
  AMERICAN: "AA",
  UNITED: "UA",
  DELTA: "DL",
  COPA: "CM",
  EMIRATES: "EK",
};

const semAcento = (v: string) =>
  (v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();

/** Sempre devolve o nome da companhia (nunca a sigla, quando conhecida). */
export function nomeCia(codigo?: string | null, nome?: string | null): string {
  const cod = (codigo ?? "").trim().toUpperCase();
  if (NOMES[cod]) return NOMES[cod]!;
  const alvo = semAcento(nome ?? "");
  if (alvo) {
    if (ALIAS[alvo] && NOMES[ALIAS[alvo]!]) return NOMES[ALIAS[alvo]!]!;
    if (NOMES[alvo]) return NOMES[alvo]!;
    // nome já veio por extenso (mais de uma palavra ou maior que sigla)
    if (alvo.length > 3) return (nome ?? "").trim();
  }
  return (nome ?? "").trim() || cod;
}

/** Trechos com troca de aeroporto na conexão (chegada num aeroporto, saída de outro). */
export function trocasDeAeroporto(conexoes?: readonly any[] | null) {
  const t: { de: string; para: string }[] = [];
  const cx = conexoes ?? [];
  for (let i = 0; i < cx.length - 1; i++) {
    const de = (cx[i]?.destino ?? "").toUpperCase();
    const para = (cx[i + 1]?.origem ?? "").toUpperCase();
    if (de && para && de !== para) t.push({ de, para });
  }
  return t;
}
