/**
 * Normalização do nome do destino para pt-BR.
 * Remove sufixos de país/IATA ("Prague CZ", "Prague, CZ") e traduz nomes de
 * cidades que costumam chegar em inglês das integrações (Prague → Praga).
 */

const TRADUCOES: Record<string, string> = {
  prague: "Praga",
  vienna: "Viena",
  wien: "Viena",
  budapest: "Budapeste",
  krakow: "Cracóvia",
  cracow: "Cracóvia",
  warsaw: "Varsóvia",
  munich: "Munique",
  cologne: "Colônia",
  florence: "Florença",
  venice: "Veneza",
  rome: "Roma",
  milan: "Milão",
  naples: "Nápoles",
  turin: "Turim",
  genoa: "Gênova",
  lisbon: "Lisboa",
  seville: "Sevilha",
  zurich: "Zurique",
  geneva: "Genebra",
  copenhagen: "Copenhague",
  athens: "Atenas",
  istanbul: "Istambul",
  moscow: "Moscou",
  bucharest: "Bucareste",
  belgrade: "Belgrado",
  bratislava: "Bratislava",
  edinburgh: "Edimburgo",
  london: "Londres",
  dublin: "Dublin",
  brussels: "Bruxelas",
  antwerp: "Antuérpia",
  "the hague": "Haia",
  gothenburg: "Gotemburgo",
  helsinki: "Helsinque",
  stockholm: "Estocolmo",
  "new york": "Nova York",
  "new orleans": "Nova Orleans",
  philadelphia: "Filadélfia",
  "mexico city": "Cidade do México",
  havana: "Havana",
  cairo: "Cairo",
  marrakech: "Marraquexe",
  jerusalem: "Jerusalém",
  "tel aviv": "Tel Aviv",
  bangkok: "Bangcoc",
  beijing: "Pequim",
  shanghai: "Xangai",
  seoul: "Seul",
  tokyo: "Tóquio",
  osaka: "Osaka",
  singapore: "Singapura",
  sydney: "Sydney",
  "cape town": "Cidade do Cabo",
  johannesburg: "Joanesburgo",
  "buenos aires": "Buenos Aires",
  santiago: "Santiago",
  montevideo: "Montevidéu",
  asuncion: "Assunção",
  bogota: "Bogotá",
  lima: "Lima",
  quito: "Quito",
  cartagena: "Cartagena",
  cancun: "Cancún",
};

/** "Prague CZ" / "Prague, Czech Republic" → "Praga" */
export function nomeDestino(destino?: string | null): string | null {
  let base = String(destino ?? "")
    .split(/[-–—,(/|]/)[0]
    .replace(/\s*\b[A-Z]{2,3}\b\s*$/, "") // sufixo de país/IATA: "Prague CZ"
    .trim();
  if (!base || /^sua viagem$/i.test(base)) return null;

  const chave = base.toLowerCase();
  if (TRADUCOES[chave]) return TRADUCOES[chave];
  base = base
    .split(/\s+/)
    .map((p) => TRADUCOES[p.toLowerCase()] ?? p)
    .join(" ");
  return base;
}
