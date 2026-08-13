/**
 * CONFIGURAÇÃO CENTRAL DA CURADORIA DE PROMOÇÕES DE AÉREO.
 *
 * Fonte única de verdade para limites de coleta. Nada de "10" espalhado
 * pelo código: para mudar o volume por origem basta editar aqui.
 */

/** Limite padrão de oportunidades validadas no motor VIA AIR por origem/ciclo. */
export const MAX_OPPORTUNITIES_PER_ORIGIN = 10;

/**
 * Limite individual por origem (opcional). Sobrepõe o padrão acima.
 * Ex.: { CWB: 15, GRU: 20 }
 */
export const MAX_OPPORTUNITIES_BY_ORIGIN: Record<string, number> = {};

/** Origens nacionais prioritárias. */
export const PRIORITY_ORIGINS_NACIONAL = ["MGF", "LDB", "CWB", "CAC", "IGU"] as const;

/** Origens internacionais (hubs) prioritárias. */
export const PRIORITY_ORIGINS_HUB = ["GRU", "GIG", "BSB", "CWB"] as const;

/** União das duas listas, já deduplicada (CWB participa das duas). */
export const PRIORITY_ORIGINS = [
  ...new Set<string>([...PRIORITY_ORIGINS_NACIONAL, ...PRIORITY_ORIGINS_HUB]),
];

/** Validações simultâneas no motor VIA AIR (~27,5s por oportunidade). */
export const PROMO_VALIDATION_CONCURRENCY = 3;

/** Limite de origens não prioritárias aproveitadas no mesmo ciclo. */
export const MAX_EXTRA_ORIGINS = 0;

export function maxOpportunitiesForOrigin(origin: string): number {
  const iata = origin.toUpperCase();
  return MAX_OPPORTUNITIES_BY_ORIGIN[iata] ?? MAX_OPPORTUNITIES_PER_ORIGIN;
}

export function isPriorityOrigin(origin: string): boolean {
  return PRIORITY_ORIGINS.includes(origin.toUpperCase());
}

/**
 * Regra do comercial: cada escopo tem suas próprias origens.
 * - NACIONAL: só o Paraná/região (MGF, LDB, CWB, CAC, IGU).
 * - INTERNACIONAL: só os hubs (GRU, GIG, BSB, CWB).
 * Ou seja: Brasília nunca aparece em voos nacionais, e Maringá/Londrina/
 * Cascavel/Foz nunca aparecem em internacionais.
 */
export function isOriginAllowedForScope(
  origin: string,
  scope: "nacional" | "internacional",
): boolean {
  const iata = origin.toUpperCase();
  const lista =
    scope === "nacional"
      ? (PRIORITY_ORIGINS_NACIONAL as readonly string[])
      : (PRIORITY_ORIGINS_HUB as readonly string[]);
  return lista.includes(iata);
}


/** Métricas por origem registradas em cada ciclo. */
export type OriginMetrics = {
  origin: string;
  discovered: number;
  deduped: number;
  selected: number;
  validated: number;
  with_price: number;
  no_result: number;
  errors: number;
  avg_seconds: number | null;
};
