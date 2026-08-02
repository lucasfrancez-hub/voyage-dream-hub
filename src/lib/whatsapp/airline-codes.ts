/**
 * Companhias aéreas: nome falado pelo cliente → código IATA do motor.
 * Usado para traduzir "não quero Gol", "tem da Azul?" nos filtros reais da
 * busca (marketingAirlineIatas) e para conferir o resultado devolvido.
 */

const MAPA: Array<{ iata: string; nome: string; apelidos: string[] }> = [
  { iata: "G3", nome: "Gol", apelidos: ["gol", "gol linhas aereas", "voegol"] },
  { iata: "AD", nome: "Azul", apelidos: ["azul", "azul linhas aereas"] },
  { iata: "LA", nome: "LATAM", apelidos: ["latam", "tam", "latam airlines"] },
  { iata: "2Z", nome: "Voepass", apelidos: ["voepass", "passaredo"] },
  { iata: "AA", nome: "American Airlines", apelidos: ["american", "american airlines", "aa"] },
  { iata: "UA", nome: "United", apelidos: ["united", "united airlines"] },
  { iata: "DL", nome: "Delta", apelidos: ["delta", "delta airlines"] },
  { iata: "CM", nome: "Copa", apelidos: ["copa", "copa airlines"] },
  { iata: "AV", nome: "Avianca", apelidos: ["avianca"] },
  { iata: "AR", nome: "Aerolineas Argentinas", apelidos: ["aerolineas", "aerolineas argentinas"] },
  { iata: "TP", nome: "TAP", apelidos: ["tap", "tap portugal", "tap air portugal"] },
  { iata: "AF", nome: "Air France", apelidos: ["air france", "airfrance"] },
  { iata: "KL", nome: "KLM", apelidos: ["klm"] },
  { iata: "IB", nome: "Iberia", apelidos: ["iberia"] },
  { iata: "LH", nome: "Lufthansa", apelidos: ["lufthansa"] },
  { iata: "EK", nome: "Emirates", apelidos: ["emirates"] },
  { iata: "TK", nome: "Turkish", apelidos: ["turkish", "turkish airlines"] },
  { iata: "JJ", nome: "LATAM", apelidos: ["jj"] },
];

export function normalizeAirline(v: string): string {
  return String(v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, "")
    .trim();
}

/** "Azul" | "ad" | "AD" → "AD". Devolve null quando não reconhece. */
export function airlineToIata(entrada: string): string | null {
  const raw = String(entrada ?? "").trim();
  if (!raw) return null;
  const up = raw.toUpperCase();
  if (/^[A-Z0-9]{2}$/.test(up) && MAPA.some((m) => m.iata === up)) return up;
  const n = normalizeAirline(raw);
  const hit = MAPA.find((m) => m.apelidos.includes(n) || normalizeAirline(m.nome) === n);
  return hit?.iata ?? (/^[A-Z0-9]{2}$/.test(up) ? up : null);
}

/** Nome comercial a partir do IATA ("AD" → "Azul"). */
export function iataToAirlineName(iata: string): string | null {
  const up = String(iata ?? "").toUpperCase();
  return MAPA.find((m) => m.iata === up)?.nome ?? null;
}

/** true quando o nome de companhia devolvido pelo motor bate com o IATA/nome pedido. */
export function airlineMatches(ciaDoMotor: string, alvo: string): boolean {
  const cia = normalizeAirline(ciaDoMotor);
  if (!cia) return false;
  const iata = airlineToIata(alvo);
  const nome = iata ? iataToAirlineName(iata) : null;
  const alvoN = normalizeAirline(nome ?? alvo);
  if (!alvoN) return false;
  return cia.includes(alvoN) || alvoN.includes(cia);
}

/** Converte uma lista falada em IATAs válidos (sem duplicar, sem vazios). */
export function airlineListToIatas(lista: string[] | null | undefined): string[] {
  const out: string[] = [];
  for (const v of lista ?? []) {
    const i = airlineToIata(v);
    if (i && !out.includes(i)) out.push(i);
  }
  return out;
}
