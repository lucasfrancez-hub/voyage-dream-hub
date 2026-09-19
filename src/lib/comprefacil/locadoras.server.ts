/**
 * Catálogo oficial de LOCADORAS de carro do Compre Fácil.
 *
 * A busca de carros devolve apenas a sigla do fornecedor (ex.: "FL", "MOV") e o
 * `WebServiceId` (ex.: 316). O nome comercial não vem na oferta — ele está no
 * cadastro de fornecedores da operadora:
 *
 *   GET /api/webservice?Pagina=&ItensPorPagina=   → { Items: [{ Id, Descricao, Sigla, SiglaInterna, Carro, ... }] }
 *
 * Confirmado em chamada real: Id 316 = "Foco Locadora" (Sigla "FL"),
 * Id 241 = "MOVIDA" (Sigla "MOV"), além de Hertz/Dollar/Thrifty (SG Rental).
 *
 * NUNCA inventamos nome: se a sigla/id não estiver no catálogo, o nome é null.
 *
 * SERVER-ONLY.
 */
import { chamarCompreFacil } from "@/lib/comprefacil/auth.server";

export type LocadoraCF = {
  id: number;
  nome: string;
  sigla: string;
  siglaInterna: string | null;
};

export type CatalogoLocadoras = {
  porId: Map<number, LocadoraCF>;
  porSigla: Map<string, LocadoraCF>;
};

const TTL_MS = 6 * 60 * 60 * 1000;
let cache: { em: number; catalogo: CatalogoLocadoras } | null = null;

const vazio = (): CatalogoLocadoras => ({ porId: new Map(), porSigla: new Map() });

/** Lê (com cache) o cadastro de fornecedores marcados como Carro. */
export async function catalogoLocadorasCF(): Promise<CatalogoLocadoras> {
  if (cache && Date.now() - cache.em < TTL_MS) return cache.catalogo;

  const itens: Record<string, unknown>[] = [];
  try {
    for (let pagina = 1; pagina <= 6; pagina++) {
      const r = await chamarCompreFacil(`/api/webservice?Pagina=${pagina}&ItensPorPagina=50`);
      if (!r.ok) break;
      const dados = r.dados as { Items?: Record<string, unknown>[]; MetaData?: { TotalPaginas?: number } };
      const lote = dados?.Items ?? [];
      itens.push(...lote);
      const totalPaginas = dados?.MetaData?.TotalPaginas ?? 1;
      if (lote.length === 0 || pagina >= totalPaginas) break;
    }
  } catch (e) {
    console.error("[comprefacil] catálogo de locadoras falhou:", e instanceof Error ? e.message : e);
  }

  const catalogo = vazio();
  for (const i of itens) {
    if (!i["Carro"]) continue;
    const id = Number(i["Id"] ?? 0);
    const nome = String(i["Descricao"] ?? "").trim();
    const sigla = String(i["Sigla"] ?? "").trim().toUpperCase();
    if (!nome) continue;
    const loc: LocadoraCF = {
      id,
      nome,
      sigla,
      siglaInterna: (i["SiglaInterna"] as string | null) ?? null,
    };
    if (id) catalogo.porId.set(id, loc);
    // A sigla interna se repete entre fornecedores (ex.: "SGR"); a Sigla, não.
    if (sigla && !catalogo.porSigla.has(sigla)) catalogo.porSigla.set(sigla, loc);
  }

  // Sem catálogo (falha de rede) não gravamos cache: tenta de novo na próxima.
  if (catalogo.porId.size || catalogo.porSigla.size) cache = { em: Date.now(), catalogo };
  return catalogo;
}

/**
 * Resolve o nome comercial da locadora.
 * Prioriza o `WebServiceId` (chave única) e cai para a sigla. Nunca devolve a
 * própria sigla como nome — se não houver correspondência, devolve null.
 */
export function nomeLocadora(
  catalogo: CatalogoLocadoras,
  webServiceId: number | null | undefined,
  sigla: string | null | undefined,
): string | null {
  if (webServiceId) {
    const porId = catalogo.porId.get(Number(webServiceId));
    if (porId) return porId.nome;
  }
  const s = (sigla ?? "").trim().toUpperCase();
  if (s) {
    const porSigla = catalogo.porSigla.get(s);
    if (porSigla) return porSigla.nome;
  }
  return null;
}
