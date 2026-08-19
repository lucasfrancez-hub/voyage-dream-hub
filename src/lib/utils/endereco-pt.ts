/**
 * Tradução de endereços que voltam em inglês das APIs (TripAdvisor, mapas).
 * Usado tanto na hora de gravar o enriquecimento quanto na renderização,
 * para corrigir também os endereços já salvos em inglês.
 */

const PAISES: Record<string, string> = {
  Brazil: "Brasil",
  "United States": "Estados Unidos",
  "United States of America": "Estados Unidos",
  "United Kingdom": "Reino Unido",
  England: "Inglaterra",
  Scotland: "Escócia",
  Ireland: "Irlanda",
  Spain: "Espanha",
  Italy: "Itália",
  France: "França",
  Germany: "Alemanha",
  Netherlands: "Países Baixos",
  Switzerland: "Suíça",
  Austria: "Áustria",
  Greece: "Grécia",
  Turkey: "Turquia",
  Croatia: "Croácia",
  Hungary: "Hungria",
  Poland: "Polônia",
  Belgium: "Bélgica",
  Denmark: "Dinamarca",
  Sweden: "Suécia",
  Norway: "Noruega",
  Finland: "Finlândia",
  Iceland: "Islândia",
  Morocco: "Marrocos",
  Egypt: "Egito",
  "South Africa": "África do Sul",
  Mexico: "México",
  Colombia: "Colômbia",
  Peru: "Peru",
  Uruguay: "Uruguai",
  Paraguay: "Paraguai",
  Bolivia: "Bolívia",
  Panama: "Panamá",
  "Dominican Republic": "República Dominicana",
  "Costa Rica": "Costa Rica",
  Cuba: "Cuba",
  Jamaica: "Jamaica",
  Curacao: "Curaçao",
  Aruba: "Aruba",
  Canada: "Canadá",
  Japan: "Japão",
  China: "China",
  Thailand: "Tailândia",
  Singapore: "Singapura",
  "United Arab Emirates": "Emirados Árabes Unidos",
  Australia: "Austrália",
  "New Zealand": "Nova Zelândia",
};

const CIDADES: Record<string, string> = {
  "New York City": "Nova York",
  "New York": "Nova York",
  Lisbon: "Lisboa",
  Rome: "Roma",
  Florence: "Florença",
  Venice: "Veneza",
  Milan: "Milão",
  Naples: "Nápoles",
  Turin: "Turim",
  Athens: "Atenas",
  Geneva: "Genebra",
  Zurich: "Zurique",
  Munich: "Munique",
  Cologne: "Colônia",
  Copenhagen: "Copenhague",
  Moscow: "Moscou",
  Warsaw: "Varsóvia",
  Prague: "Praga",
  Vienna: "Viena",
  Seville: "Sevilha",
  Marrakech: "Marrakech",
  Cairo: "Cairo",
  Beijing: "Pequim",
  Tokyo: "Tóquio",
  Bangkok: "Bangcoc",
  "Mexico City": "Cidade do México",
  "Buenos Aires": "Buenos Aires",
};

/** Termos de logradouro e administrativos (aplicados como palavra inteira). */
const TERMOS: Array<[RegExp, string]> = [
  [/^State of\s+/i, ""],
  [/^Province of\s+/i, ""],
  [/^Region of\s+/i, ""],
  [/^Municipality of\s+/i, ""],
  [/\bState of\b/gi, ""],
  [/\bAvenue\b/gi, "Avenida"],
  [/\bAve\.?\b/g, "Av."],
  [/\bStreet\b/gi, "Rua"],
  [/\bSt\.\B/g, "Rua"],
  [/\bRoad\b/gi, "Estrada"],
  [/\bHighway\b/gi, "Rodovia"],
  [/\bBeach\b/gi, "Praia"],
  [/\bSquare\b/gi, "Praça"],
  [/\bDistrict\b/gi, "Bairro"],
  [/\bNeighborhood\b/gi, "Bairro"],
  [/\bIsland\b/gi, "Ilha"],
  [/\bLake\b/gi, "Lago"],
  [/\bBay\b/gi, "Baía"],
  [/\bNorth\b/gi, "Norte"],
  [/\bSouth\b/gi, "Sul"],
  [/\bEast\b/gi, "Leste"],
  [/\bWest\b/gi, "Oeste"],
  [/\bFloor\b/gi, "Andar"],
  [/\bBuilding\b/gi, "Edifício"],
  [/\bKm\b/g, "km"],
];

/** Traduz um trecho de endereço (cidade, estado, país ou linha completa). */
export function traduzirEndereco(valor: string | null | undefined): string | null {
  if (!valor || !valor.trim()) return null;
  let out = valor.trim();

  for (const [de, para] of Object.entries(CIDADES)) {
    out = out.replace(new RegExp(`\\b${de}\\b`, "g"), para);
  }
  for (const [de, para] of Object.entries(PAISES)) {
    out = out.replace(new RegExp(`\\b${de}\\b`, "gi"), para);
  }
  for (const [re, para] of TERMOS) out = out.replace(re, para);

  return out.replace(/\s{2,}/g, " ").replace(/\s+,/g, ",").replace(/,\s*,/g, ", ").trim() || null;
}
