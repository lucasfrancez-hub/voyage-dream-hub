// Utilitário client-side para gerar o título automático da viagem
// (espelha a lógica do buildAutoTitle em src/lib/orders.functions.ts).

const IATA_CITY: Record<string, string> = {
  GRU: "São Paulo", CGH: "São Paulo", VCP: "Campinas",
  GIG: "Rio de Janeiro", SDU: "Rio de Janeiro",
  BSB: "Brasília", CNF: "Belo Horizonte", PLU: "Belo Horizonte",
  CWB: "Curitiba", POA: "Porto Alegre", FLN: "Florianópolis",
  SSA: "Salvador", REC: "Recife", FOR: "Fortaleza", NAT: "Natal",
  MCZ: "Maceió", AJU: "Aracaju", THE: "Teresina", SLZ: "São Luís",
  BEL: "Belém", MAO: "Manaus", MGF: "Maringá", LDB: "Londrina",
  CGB: "Cuiabá", CGR: "Campo Grande", GYN: "Goiânia", VIX: "Vitória",
  IGU: "Foz do Iguaçu", NVT: "Navegantes", JPA: "João Pessoa",
  PMW: "Palmas", MCP: "Macapá", PVH: "Porto Velho", RBR: "Rio Branco",
  BVB: "Boa Vista", STM: "Santarém",
  MIA: "Miami", MCO: "Orlando", JFK: "Nova York", LGA: "Nova York", EWR: "Newark",
  LAX: "Los Angeles", SFO: "São Francisco", ORD: "Chicago", IAH: "Houston",
  DFW: "Dallas", ATL: "Atlanta", BOS: "Boston", LAS: "Las Vegas",
  LIS: "Lisboa", OPO: "Porto", MAD: "Madri", BCN: "Barcelona",
  CDG: "Paris", ORY: "Paris", LHR: "Londres", LGW: "Londres",
  FCO: "Roma", MXP: "Milão", FRA: "Frankfurt", MUC: "Munique",
  AMS: "Amsterdã", ZRH: "Zurique", GVA: "Genebra",
  EZE: "Buenos Aires", AEP: "Buenos Aires", SCL: "Santiago", LIM: "Lima",
  BOG: "Bogotá", MEX: "Cidade do México", CUN: "Cancún",
  DXB: "Dubai", DOH: "Doha", IST: "Istambul",
};

const cityOf = (iata: string) => {
  const k = String(iata || "").toUpperCase().trim();
  return IATA_CITY[k] || k;
};

export type AutoTitleItem = {
  kind: "hotel" | "flight" | "other" | string;
  title: string | null;
  status?: string | null;
  supplier_locator?: string | null;
  details?: Record<string, unknown> | null;
};

export function computeAutoTitle(items: AutoTitleItem[] | null | undefined): string | null {
  const list = (items ?? []).filter((i) => (i.status ?? "") !== "cancelled");
  if (list.length === 0) return null;

  const flights = list.filter((i) => i.kind === "flight");
  const hotels = list.filter((i) => i.kind === "hotel");
  const others = list.filter((i) => i.kind !== "flight" && i.kind !== "hotel");

  const allSegs: Array<{ orig: string; dest: string; locator: string; order: number; depart: string; idx: number }> = [];
  flights.forEach((f, idx) => {
    const d = (f.details ?? {}) as Record<string, unknown>;
    const orig = String(d.origin ?? d.from ?? d.origin_code ?? d.from_iata ?? "").toUpperCase();
    const dest = String(d.destination ?? d.to ?? d.destination_code ?? d.to_iata ?? "").toUpperCase();
    if (!orig || !dest) return;
    const orderVal = Number(d.segment_index ?? d.order ?? idx);
    const depart = String(d.depart_at ?? d.departure_at ?? d.departure ?? "");
    allSegs.push({ orig, dest, locator: f.supplier_locator || "", order: isFinite(orderVal) ? orderVal : idx, depart, idx });
  });
  allSegs.sort((a, b) => {
    if (a.locator !== b.locator) return a.locator.localeCompare(b.locator);
    if (a.depart && b.depart && a.depart !== b.depart) return a.depart < b.depart ? -1 : 1;
    if (a.order !== b.order) return a.order - b.order;
    return a.idx - b.idx;
  });

  let flightDestCity: string | null = null;
  if (allSegs.length) {
    const firstOrig = allSegs[0].orig;
    const lastDest = allSegs[allSegs.length - 1].dest;
    if (firstOrig === lastDest && allSegs.length > 1) {
      const mid = Math.max(0, Math.floor(allSegs.length / 2) - 1);
      flightDestCity = cityOf(allSegs[mid]?.dest || allSegs[0].dest);
    } else {
      flightDestCity = cityOf(lastDest);
    }
  }

  const hotelCity = (() => {
    if (!hotels.length) return null;
    const d = (hotels[0].details ?? {}) as Record<string, unknown>;
    const c = String(d.city ?? d.cidade ?? d.destination ?? "").trim();
    return c || null;
  })();

  const kinds = new Set(list.map((i) => i.kind));
  const hasFlight = kinds.has("flight");
  const hasHotel = kinds.has("hotel");
  const hasOther = [...kinds].some((k) => k !== "flight" && k !== "hotel");
  const typesCount = (hasFlight ? 1 : 0) + (hasHotel ? 1 : 0) + (hasOther ? 1 : 0);

  const destino = flightDestCity || hotelCity || (others[0]?.title ?? null);

  if (typesCount >= 2) {
    return (destino ? `Pacote para ${destino}` : "Pacote de viagem").slice(0, 140);
  }
  if (hasFlight) {
    return (destino ? `Passagem aérea para ${destino}` : "Passagem aérea").slice(0, 140);
  }
  if (hasHotel) {
    return (destino ? `Hospedagem em ${destino}` : (hotels[0].title ? `Hospedagem ${hotels[0].title}` : "Hospedagem")).slice(0, 140);
  }
  if (hasOther) {
    return (others[0].title || "Serviços").slice(0, 140);
  }
  return null;
}
