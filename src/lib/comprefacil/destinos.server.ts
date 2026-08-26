/**
 * Destinos da CompreFácil que NÃO são aeroporto (Porto de Galinhas, Búzios,
 * Gramado…). A operadora expõe o catálogo completo de cidades no
 * `/api/destino/autocomplete`, com Id (para o hotel) e coordenadas.
 *
 * Para o aéreo, a cidade sem aeroporto recebe o aeroporto mais próximo
 * (OpenStreetMap, sem chave) — assim o voo vai para Recife e a hospedagem
 * continua em Porto de Galinhas.
 * SERVER-ONLY.
 */
import { chamarCompreFacil, COMPREFACIL_BASES } from "./auth.server";

export type DestinoCF = {
  nome: string;
  cidadeId: number;
  estado: string | null;
  pais: string | null;
  lat: number | null;
  lng: number | null;
};

const cacheTermo = new Map<string, { em: number; itens: DestinoCF[] }>();
const cacheIata = new Map<string, { em: number; iata: string | null }>();
const TTL = 6 * 60 * 60 * 1000;

function num(v: unknown): number | null {
  const n = Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) && n !== 0 ? n : null;
}

/** Cidades do catálogo oficial da operadora (com ou sem aeroporto). */
export async function buscarDestinosCF(termo: string, limite = 8): Promise<DestinoCF[]> {
  const chave = `${termo.toLowerCase()}|${limite}`;
  const guardado = cacheTermo.get(chave);
  if (guardado && Date.now() - guardado.em < TTL) return guardado.itens;

  try {
    const r = await chamarCompreFacil(
      `/api/destino/autocomplete?term=${encodeURIComponent(termo)}&limitCidades=${limite}&limitHoteis=0`,
      { base: COMPREFACIL_BASES.principal },
    );
    const lista: any[] = Array.isArray(r.dados) ? (r.dados as any[]) : [];
    const itens: DestinoCF[] = [];
    const vistos = new Set<number>();
    for (const d of lista) {
      if (String(d?.Tipo ?? "") !== "Cidade") continue;
      const id = Number(d?.CidadeId ?? d?.Cidade?.Id);
      const nome = String(d?.CidadeNome ?? d?.Nome ?? d?.Cidade?.Nome ?? "").trim();
      if (!id || !nome || vistos.has(id)) continue;
      vistos.add(id);
      itens.push({
        nome,
        cidadeId: id,
        estado: d?.Estado ? String(d.Estado) : null,
        pais: d?.Pais ? String(d.Pais) : null,
        lat: num(d?.Cidade?.Latitude),
        lng: num(d?.Cidade?.Longitude),
      });
    }
    cacheTermo.set(chave, { em: Date.now(), itens });
    return itens;
  } catch (e) {
    console.error("[comprefacil] destinos indisponíveis:", e instanceof Error ? e.message : e);
    return guardado?.itens ?? [];
  }
}

function haversine(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/**
 * Aeroporto comercial mais próximo de um ponto. `permitidos` é a lista de
 * códigos que a operadora realmente pesquisa (evita sugerir pista sem voo).
 */
export async function iataMaisProximo(
  lat: number,
  lng: number,
  permitidos?: Set<string>,
): Promise<string | null> {
  const chave = `${lat.toFixed(2)},${lng.toFixed(2)}`;
  const guardado = cacheIata.get(chave);
  if (guardado && Date.now() - guardado.em < TTL) return guardado.iata;

  const query = `[out:json][timeout:20];nwr(around:250000,${lat},${lng})[aeroway=aerodrome]["iata"];out center 200;`;
  try {
    // O Overpass recusa requisições sem User-Agent (HTTP 406); mantemos um
    // espelho de reserva para não depender de um único servidor.
    const espelhos = [
      "https://overpass-api.de/api/interpreter",
      "https://overpass.kumi.systems/api/interpreter",
    ];
    let json: { elements?: any[] } | null = null;
    for (const url of espelhos) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 20_000);
      const res = await fetch(url, {
        method: "POST",
        signal: ctrl.signal,
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          "user-agent": "VIA AIR motor de pacotes (contato@viaair.tur.br)",
          accept: "application/json",
        },
        body: new URLSearchParams({ data: query }).toString(),
      })
        .catch(() => null)
        .finally(() => clearTimeout(timer));
      if (!res?.ok) continue;
      json = (await res.json().catch(() => null)) as { elements?: any[] } | null;
      if (json) break;
    }
    if (!json) return null;

    let melhor: { iata: string; km: number } | null = null;
    for (const el of json.elements ?? []) {
      const iata = String(el?.tags?.iata ?? "").trim().toUpperCase();
      if (!/^[A-Z]{3}$/.test(iata)) continue;
      if (permitidos && permitidos.size && !permitidos.has(iata)) continue;
      const pLat = el.lat ?? el.center?.lat;
      const pLng = el.lon ?? el.center?.lon;
      if (pLat == null || pLng == null) continue;
      const km = haversine(lat, lng, pLat, pLng);
      if (!melhor || km < melhor.km) melhor = { iata, km };
    }
    const iata = melhor?.iata ?? null;
    cacheIata.set(chave, { em: Date.now(), iata });
    return iata;
  } catch (e) {
    console.error("[comprefacil] aeroporto próximo indisponível:", e instanceof Error ? e.message : e);
    return null;
  }
}
