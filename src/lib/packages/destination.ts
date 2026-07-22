/**
 * Utilitários para normalizar/exibir o destino dos pacotes.
 *
 * Motivação: às vezes a mesma cidade entra como "Buenos Aires" e "Buenos Aires (AR)",
 * duplicando o filtro. Aqui removemos o sufixo entre parênteses (capturando ISO2 quando
 * disponível) e, para destinos internacionais, adicionamos a bandeirinha do país.
 */

export function canonDestination(raw: string | null | undefined): string {
  if (!raw) return "";
  return String(raw)
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function destinationKey(raw: string | null | undefined): string {
  return canonDestination(raw)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/** Extrai ISO2 do país do sufixo "(XX)" quando presente. */
function extractIsoFromSuffix(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;
  const m = String(raw).match(/\(([A-Za-z]{2})\)/);
  return m ? m[1].toUpperCase() : undefined;
}

// Mapa de cidades internacionais conhecidas → ISO2. Cidades brasileiras
// ficam de fora de propósito (sem bandeira). Adicione conforme aparecerem.
const INTL_CITY_TO_ISO: Record<string, string> = {
  "buenos aires": "AR",
  "mendoza": "AR",
  "bariloche": "AR",
  "cordoba": "AR",
  "ushuaia": "AR",
  "el calafate": "AR",
  "montevideu": "UY",
  "montevideo": "UY",
  "punta del este": "UY",
  "colonia": "UY",
  "santiago": "CL",
  "santiago do chile": "CL",
  "san pedro de atacama": "CL",
  "lima": "PE",
  "cusco": "PE",
  "cuzco": "PE",
  "machu picchu": "PE",
  "bogota": "CO",
  "cartagena": "CO",
  "medellin": "CO",
  "quito": "EC",
  "caracas": "VE",
  "assuncao": "PY",
  "asuncion": "PY",
  "la paz": "BO",
  "santa cruz de la sierra": "BO",
  "miami": "US",
  "orlando": "US",
  "new york": "US",
  "nova york": "US",
  "nova iorque": "US",
  "las vegas": "US",
  "los angeles": "US",
  "san francisco": "US",
  "boston": "US",
  "chicago": "US",
  "washington": "US",
  "seattle": "US",
  "honolulu": "US",
  "toronto": "CA",
  "vancouver": "CA",
  "montreal": "CA",
  "cidade do mexico": "MX",
  "cancun": "MX",
  "playa del carmen": "MX",
  "tulum": "MX",
  "los cabos": "MX",
  "puerto vallarta": "MX",
  "punta cana": "DO",
  "santo domingo": "DO",
  "aruba": "AW",
  "oranjestad": "AW",
  "curacao": "CW",
  "nassau": "BS",
  "bahamas": "BS",
  "havana": "CU",
  "varadero": "CU",
  "montego bay": "JM",
  "san juan": "PR",
  "panama": "PA",
  "cidade do panama": "PA",
  "san jose": "CR",
  "guanacaste": "CR",
  "lisboa": "PT",
  "porto": "PT",
  "madeira": "PT",
  "acores": "PT",
  "madrid": "ES",
  "barcelona": "ES",
  "sevilha": "ES",
  "valencia": "ES",
  "malaga": "ES",
  "palma de maiorca": "ES",
  "ibiza": "ES",
  "paris": "FR",
  "nice": "FR",
  "lyon": "FR",
  "marselha": "FR",
  "roma": "IT",
  "milao": "IT",
  "veneza": "IT",
  "florenca": "IT",
  "napoles": "IT",
  "londres": "GB",
  "edimburgo": "GB",
  "manchester": "GB",
  "dublin": "IE",
  "amsterda": "NL",
  "amsterdam": "NL",
  "bruxelas": "BE",
  "berlim": "DE",
  "munique": "DE",
  "frankfurt": "DE",
  "hamburgo": "DE",
  "viena": "AT",
  "zurique": "CH",
  "genebra": "CH",
  "praga": "CZ",
  "budapeste": "HU",
  "varsovia": "PL",
  "atenas": "GR",
  "santorini": "GR",
  "mykonos": "GR",
  "istambul": "TR",
  "capadocia": "TR",
  "dubai": "AE",
  "abu dhabi": "AE",
  "doha": "QA",
  "tel aviv": "IL",
  "jerusalem": "IL",
  "cairo": "EG",
  "marrakech": "MA",
  "casablanca": "MA",
  "cape town": "ZA",
  "cidade do cabo": "ZA",
  "joanesburgo": "ZA",
  "nairobi": "KE",
  "toquio": "JP",
  "tokyo": "JP",
  "kyoto": "JP",
  "osaka": "JP",
  "pequim": "CN",
  "xangai": "CN",
  "hong kong": "HK",
  "bangkok": "TH",
  "phuket": "TH",
  "singapura": "SG",
  "bali": "ID",
  "jakarta": "ID",
  "sydney": "AU",
  "melbourne": "AU",
  "auckland": "NZ",
};

/** Retorna a bandeira emoji para um ISO2 (ex.: "AR" → 🇦🇷). */
export function flagEmoji(iso: string | null | undefined): string {
  if (!iso) return "";
  const code = iso.trim().toUpperCase();
  if (code.length !== 2 || !/^[A-Z]{2}$/.test(code)) return "";
  const A = 0x1f1e6;
  return String.fromCodePoint(A + code.charCodeAt(0) - 65, A + code.charCodeAt(1) - 65);
}

export type DestinationOption = {
  /** Rótulo canônico para exibir (sem sufixo). */
  label: string;
  /** Chave usada no filtro (canônica). */
  value: string;
  /** ISO2 do país quando conhecido. */
  country?: string;
  /** true se país conhecido e diferente de BR. */
  isInternational: boolean;
  /** Bandeira emoji quando internacional. */
  flag: string;
};

/**
 * Recebe uma lista bruta de destinos e devolve as opções únicas com país/bandeira.
 * - Deduplica "Buenos Aires" e "Buenos Aires (AR)" no mesmo item.
 * - Para internacionais, adiciona a bandeirinha do país. Nacionais ficam limpos.
 */
export function dedupeDestinations(
  raws: Array<string | null | undefined>,
): DestinationOption[] {
  const byKey = new Map<string, DestinationOption>();

  for (const r of raws) {
    const label = canonDestination(r);
    if (!label) continue;
    const key = destinationKey(r);

    const isoFromSuffix = extractIsoFromSuffix(r);
    const isoFromMap = INTL_CITY_TO_ISO[key];
    const iso = isoFromSuffix || isoFromMap;

    const current = byKey.get(key);
    if (current) {
      // Preferir país já detectado; se não tinha, adotar o novo.
      if (!current.country && iso) {
        current.country = iso;
        current.isInternational = iso.toUpperCase() !== "BR";
        current.flag = current.isInternational ? flagEmoji(iso) : "";
      }
      // Preferir label mais curto (sem sufixo).
      if (label.length < current.label.length) current.label = label;
    } else {
      const country = iso;
      const isInternational = !!country && country.toUpperCase() !== "BR";
      byKey.set(key, {
        label,
        value: label,
        country,
        isInternational,
        flag: isInternational ? flagEmoji(country) : "",
      });
    }
  }

  return Array.from(byKey.values()).sort((a, b) =>
    a.label.localeCompare(b.label, "pt-BR"),
  );
}
