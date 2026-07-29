import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import type { DestinationSuggestion } from "@/lib/destinations-catalog";

/** Debounce simples para não disparar uma busca por tecla. */
export function useDebounced<T>(value: T, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

type GeoResult = {
  id: number;
  name: string;
  country?: string;
  admin1?: string;
  feature_code?: string;
};

/**
 * Busca cidades no mundo inteiro (base geográfica pública, sem chave).
 * Complementa o catálogo local para que qualquer destino tenha autopreencher.
 */
export function useGlobalCitySearch(query: string) {
  const q = useDebounced(query.trim(), 300);

  return useQuery({
    queryKey: ["global-city-search", q.toLowerCase()],
    enabled: q.length >= 2,
    staleTime: 30 * 60 * 1000,
    queryFn: async (): Promise<DestinationSuggestion[]> => {
      const url =
        "https://geocoding-api.open-meteo.com/v1/search?count=10&language=pt&format=json&name=" +
        encodeURIComponent(q);
      const res = await fetch(url);
      if (!res.ok) return [];
      const json = (await res.json()) as { results?: GeoResult[] };
      return (json.results ?? [])
        .filter((r) => !r.feature_code || r.feature_code.startsWith("PPL"))
        .map((r) => ({
          value: r.name,
          city: r.name,
          country: [r.admin1, r.country].filter(Boolean).join(", ") || undefined,
          registered: false,
        }));
    },
  });
}
