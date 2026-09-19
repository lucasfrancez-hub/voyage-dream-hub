/**
 * Cache de busca de serviços (memória do servidor).
 *
 * Chave = destino + período + ocupação + filtros. Ocupações ou datas
 * diferentes NUNCA compartilham entrada. TTL configurável por
 * `SERVICES_SEARCH_CACHE_TTL_MS` (default 15 min, limitado a 10–30 min).
 *
 * SERVER-ONLY.
 */

export const cacheTtlMs = (): number => {
  const bruto = Number(process.env["SERVICES_SEARCH_CACHE_TTL_MS"] ?? 0);
  const ttl = Number.isFinite(bruto) && bruto > 0 ? bruto : 15 * 60 * 1000;
  return Math.min(30 * 60 * 1000, Math.max(10 * 60 * 1000, ttl));
};

type Entrada<T> = { em: number; valor: T };

const memoria = new Map<string, Entrada<unknown>>();

export function chaveBusca(p: {
  cidadeId: number;
  data: string;
  dataFim: string;
  adultos: number;
  criancas: number[];
  tipos: string[] | null;
  limite?: number | null;
}): string {
  return [
    `cidade:${p.cidadeId}`,
    `de:${p.data}`,
    `ate:${p.dataFim}`,
    `adt:${p.adultos}`,
    `chd:${[...p.criancas].sort((a, b) => a - b).join(",")}`,
    `tipos:${p.tipos ? [...p.tipos].sort().join(",") : "todos"}`,
    `limite:${p.limite ?? 0}`,
  ].join("|");
}

export function lerCache<T>(chave: string): { valor: T; idadeMs: number } | null {
  const e = memoria.get(chave) as Entrada<T> | undefined;
  if (!e) return null;
  const idadeMs = Date.now() - e.em;
  if (idadeMs > cacheTtlMs()) {
    memoria.delete(chave);
    return null;
  }
  return { valor: e.valor, idadeMs };
}

export function gravarCache<T>(chave: string, valor: T): void {
  // limpeza preguiçosa para o mapa não crescer sem limite
  if (memoria.size > 300) {
    const ttl = cacheTtlMs();
    for (const [k, v] of memoria) if (Date.now() - v.em > ttl) memoria.delete(k);
  }
  memoria.set(chave, { em: Date.now(), valor });
}

export function limparCache(): void {
  memoria.clear();
}
