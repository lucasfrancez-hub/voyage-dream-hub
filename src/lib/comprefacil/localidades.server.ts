import { chamarCompreFacil, COMPREFACIL_BASES } from "./auth.server";

export type CidadeOficialCF = { id: number; nome: string; iata: string | null };

let cache: { em: number; itens: CidadeOficialCF[] } | null = null;
const TTL = 6 * 60 * 60 * 1000; // 6h

/** Baixa a lista oficial de cidades/aeroportos da CompreFácil (com o Id certo). */
export async function cidadesOficiaisCF(): Promise<CidadeOficialCF[]> {
  if (cache && Date.now() - cache.em < TTL) return cache.itens;

  const base = COMPREFACIL_BASES.hotel;
  const mapa = new Map<number, CidadeOficialCF>();
  try {
    for (let pagina = 1; pagina <= 25; pagina++) {
      const r = await chamarCompreFacil(`/api/aeroporto?Pagina=${pagina}&ItensPorPagina=50`, { base });
      const dados = r.dados as any;
      const itens: any[] = dados?.Items ?? [];
      for (const a of itens) {
        const id = Number(a?.CidadeId ?? a?.Cidade?.Id);
        const nome = String(a?.Cidade?.Nome ?? a?.Descricao ?? "").trim();
        if (!id || !nome) continue;
        if (!mapa.has(id)) mapa.set(id, { id, nome, iata: a?.Iata ? String(a.Iata) : null });
      }
      const totalPaginas = Number(dados?.MetaData?.TotalPaginas ?? 0);
      if (!totalPaginas || pagina >= totalPaginas) break;
    }
  } catch (e) {
    console.error("[comprefacil] lista de cidades falhou:", e instanceof Error ? e.message : e);
    if (cache) return cache.itens;
    return [];
  }

  const itens = [...mapa.values()];
  if (itens.length) cache = { em: Date.now(), itens };
  return itens;
}

export function semAcento(v: string): string {
  return v
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}
