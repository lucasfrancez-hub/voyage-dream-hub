import { chamarCompreFacil, COMPREFACIL_BASES } from "./auth.server";

export type CidadeOficialCF = { id: number; nome: string; iata: string | null };
export type SugestaoCF = { nome: string; cidadeId: number | null; iata: string | null; total: number };

let cache: { em: number; itens: CidadeOficialCF[] } | null = null;
const TTL = 6 * 60 * 60 * 1000; // 6h

/** Baixa a lista oficial de cidades/aeroportos da CompreFácil (com o Id certo). */
export async function cidadesOficiaisCF(): Promise<CidadeOficialCF[]> {
  if (cache && Date.now() - cache.em < TTL) return cache.itens;

  const base = COMPREFACIL_BASES.hotel;
  const mapa = new Map<string, CidadeOficialCF>();
  try {
    for (let pagina = 1; pagina <= 25; pagina++) {
      const r = await chamarCompreFacil(`/api/aeroporto?Pagina=${pagina}&ItensPorPagina=50`, { base });
      const dados = r.dados as any;
      const itens: any[] = dados?.Items ?? [];
      for (const a of itens) {
        const id = Number(a?.CidadeId ?? a?.Cidade?.Id);
        const nome = String(a?.Cidade?.Nome ?? a?.Descricao ?? "").trim();
        if (!id || !nome) continue;
        const iata = a?.Iata ? String(a.Iata).toUpperCase() : null;
        // Uma cidade pode ter vários aeroportos (ex.: Orlando = MCO e MIA):
        // guardamos cada aeroporto separadamente para não perder o código certo.
        const chave = `${id}-${iata ?? "s"}`;
        if (!mapa.has(chave)) mapa.set(chave, { id, nome, iata });
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

/**
 * Monta as sugestões de origem/destino juntando o catálogo já importado com a
 * lista oficial de aeroportos (cada aeroporto vira uma opção com o IATA certo).
 */
export async function montarSugestoesCF(
  linhas: { cidade?: string | null; cidade_saida?: string | null; cidade_id?: number | null }[],
  campo: "cidade" | "cidade_saida",
  termo: string,
): Promise<SugestaoCF[]> {
  const alvo = semAcento(termo);
  const porNome = new Map<string, SugestaoCF>();

  for (const l of linhas ?? []) {
    const nome = campo === "cidade" ? l.cidade : l.cidade_saida;
    if (!nome || !semAcento(nome).includes(alvo)) continue;
    const chave = semAcento(nome);
    const atual = porNome.get(chave);
    if (atual) {
      atual.total += 1;
      if (atual.cidadeId == null && campo === "cidade") atual.cidadeId = l.cidade_id ?? null;
    } else {
      porNome.set(chave, {
        nome,
        cidadeId: campo === "cidade" ? (l.cidade_id ?? null) : null,
        iata: null,
        total: 1,
      });
    }
  }

  const saida: SugestaoCF[] = [];
  const nomesComAeroporto = new Set<string>();
  try {
    const oficiais = await cidadesOficiaisCF();
    const porIata = alvo.length === 3;
    for (const c of oficiais) {
      const casaIata = porIata && (c.iata ?? "").toLowerCase() === alvo;
      if (!casaIata && !semAcento(c.nome).includes(alvo)) continue;
      const chave = semAcento(c.nome);
      nomesComAeroporto.add(chave);
      saida.push({ nome: c.nome, cidadeId: c.id, iata: c.iata, total: porNome.get(chave)?.total ?? 0 });
    }
  } catch (e) {
    console.error("[comprefacil] cidades oficiais indisponíveis:", e instanceof Error ? e.message : e);
  }

  for (const [chave, item] of porNome) if (!nomesComAeroporto.has(chave)) saida.push(item);

  const codigo = alvo.length === 3 ? alvo.toUpperCase() : null;
  return saida
    .sort((a, b) => {
      const ca = codigo && a.iata === codigo ? 0 : 1;
      const cb = codigo && b.iata === codigo ? 0 : 1;
      const pa = semAcento(a.nome).startsWith(alvo) ? 0 : 1;
      const pb = semAcento(b.nome).startsWith(alvo) ? 0 : 1;
      return ca - cb || pa - pb || b.total - a.total || a.nome.localeCompare(b.nome, "pt-BR");
    })
    .slice(0, 12);
}
