/**
 * Descoberta de código de cidade (SAO, RIO...) para a API interna.
 *
 * O motor da operadora precisa saber se o código enviado é cidade ou
 * aeroporto: mandar SAO/RIO como aeroporto devolve zero voos. O portal marca
 * isso na interface; a API descobre sozinha consultando o próprio catálogo.
 * SERVER-ONLY.
 */

const TTL_MS = 6 * 60 * 60_000;
const cache = new Map<string, { em: number; cidade: boolean }>();

/** Diz se o IATA informado é um código de cidade no catálogo da operadora. */
export async function ehCodigoDeCidade(iata: string, isDeparture: boolean): Promise<boolean> {
  const code = iata.trim().toUpperCase();
  const chave = `${code}|${isDeparture ? "d" : "a"}`;
  const guardado = cache.get(chave);
  if (guardado && Date.now() - guardado.em < TTL_MS) return guardado.cidade;
  try {
    const { searchAirports } = await import("@/lib/onertravel.server");
    const lista = await searchAirports({ query: code, isDeparture });
    const achado = lista.find((a) => a.iata.toUpperCase() === code);
    const cidade = Boolean(achado?.isCity);
    cache.set(chave, { em: Date.now(), cidade });
    return cidade;
  } catch {
    return false;
  }
}
