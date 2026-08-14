/**
 * Pontos de interesse próximos à hospedagem (OpenStreetMap / Overpass).
 * SERVER-ONLY. Sem chave, sem custo — usado no mapa do orçamento público.
 */

export type NearbyPlace = { name: string; distance: string };

const OVERPASS = "https://overpass-api.de/api/interpreter";

/** Categorias que interessam ao viajante (praias, praias, museus, parques...). */
const ACEITOS = new Set([
  "attraction", "museum", "artwork", "viewpoint", "theme_park", "zoo", "aquarium", "gallery",
  "beach", "beach_resort", "peak", "cape", "bay",
  "park", "garden", "marina", "nature_reserve", "water_park",
  "monument", "memorial", "castle", "ruins", "church", "fort",
  "mall", "marketplace",
]);

function haversine(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

function formatarDistancia(metros: number): string {
  if (metros < 1000) return `${Math.round(metros / 50) * 50} m`;
  return `${(metros / 1000).toFixed(1).replace(".", ",")} km`;
}

type Elemento = {
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

/** Busca até `limite` pontos próximos, ordenados por distância. */
export async function nearbyPlaces(
  lat: number,
  lng: number,
  limite = 5,
): Promise<NearbyPlace[]> {
  const filtros = ["tourism", "natural", "leisure", "historic", "shop"]
    .map((k) => `nwr(around:3000,${lat},${lng})[name][${k}];`)
    .join("");
  const query = `[out:json][timeout:20];(${filtros});out center 120;`;

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20_000);
    const res = await fetch(OVERPASS, {
      method: "POST",
      signal: ctrl.signal,
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ data: query }).toString(),
    }).finally(() => clearTimeout(timer));
    if (!res.ok) return [];
    const json = (await res.json()) as { elements?: Elemento[] };

    const vistos = new Set<string>();
    const itens: Array<{ name: string; metros: number }> = [];
    for (const el of json.elements ?? []) {
      const tags = el.tags ?? {};
      const nome = tags.name?.trim();
      if (!nome) continue;
      const tipo = tags.tourism ?? tags.natural ?? tags.leisure ?? tags.historic ?? tags.shop ?? "";
      if (!ACEITOS.has(tipo)) continue;
      const pLat = el.lat ?? el.center?.lat;
      const pLng = el.lon ?? el.center?.lon;
      if (pLat == null || pLng == null) continue;
      const chave = nome.toLowerCase();
      if (vistos.has(chave)) continue;
      vistos.add(chave);
      itens.push({ name: nome, metros: haversine(lat, lng, pLat, pLng) });
    }

    return itens
      .sort((a, b) => a.metros - b.metros)
      .slice(0, limite)
      .map((i) => ({ name: i.name, distance: formatarDistancia(i.metros) }));
  } catch {
    return [];
  }
}
