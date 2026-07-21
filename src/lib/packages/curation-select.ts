/**
 * Seleção curada de pacotes — replica exatamente as regras da aba
 * "Curadoria de IA" (src/components/packages/CurationTab.tsx), mas
 * retorna uma lista achatada e deduplicada, na mesma ordem de
 * prioridade dos grupos exibidos.
 *
 * Usada pelo FeaturedCarousel (público /pacotes e widget /embed) para
 * garantir que os "Pacotes em destaque" sejam exatamente os mesmos que
 * a curadoria destaca no admin.
 */

export type CurationPkg = {
  id: string;
  destination: string;
  origin?: string | null;
  going_date?: string | null;
  price_per_person: number | string;
  base_occupancy?: number | null;
  is_active?: boolean;
};

const HOLIDAY_WINDOWS: Array<{ theme: string; from: string; to: string }> = [
  { theme: "natal", from: "2026-12-19", to: "2026-12-27" },
  { theme: "reveillon", from: "2026-12-27", to: "2027-01-04" },
  { theme: "carnaval", from: "2027-02-06", to: "2027-02-10" },
  { theme: "pascoa", from: "2027-03-25", to: "2027-03-29" },
  { theme: "natal", from: "2027-12-19", to: "2027-12-27" },
  { theme: "reveillon", from: "2027-12-27", to: "2028-01-04" },
  { theme: "carnaval", from: "2028-02-26", to: "2028-03-01" },
  { theme: "pascoa", from: "2028-04-13", to: "2028-04-17" },
  { theme: "prolongado", from: "2026-09-04", to: "2026-09-08" },
  { theme: "prolongado", from: "2026-10-09", to: "2026-10-12" },
  { theme: "prolongado", from: "2026-10-30", to: "2026-11-02" },
  { theme: "prolongado", from: "2026-11-13", to: "2026-11-15" },
  { theme: "prolongado", from: "2027-04-19", to: "2027-04-21" },
  { theme: "prolongado", from: "2027-05-27", to: "2027-05-30" },
  { theme: "prolongado", from: "2027-09-04", to: "2027-09-07" },
  { theme: "prolongado", from: "2027-10-09", to: "2027-10-12" },
  { theme: "prolongado", from: "2027-10-30", to: "2027-11-02" },
  { theme: "prolongado", from: "2027-11-13", to: "2027-11-15" },
  { theme: "prolongado", from: "2028-04-21", to: "2028-04-23" },
  { theme: "prolongado", from: "2028-06-15", to: "2028-06-18" },
  { theme: "prolongado", from: "2028-09-07", to: "2028-09-10" },
];

const BR_KEYWORDS = [
  "porto seguro","porto de galinhas","porto alegre","porto belo","porto de pedras",
  "arraial d'ajuda","arraial do cabo","trancoso","morro de sao paulo","morro de são paulo",
  "salvador","praia do forte","maragogi","sao miguel dos milagres","são miguel dos milagres",
  "maceio","maceió","japaratinga","recife","olinda",
  "natal","pipa","tibau","fortaleza","jericoacoara","canoa quebrada","cumbuco",
  "aracaju","joao pessoa","joão pessoa","sao luis","são luís",
  "florianopolis","florianópolis","balneario camboriu","balneário camboriú","bombinhas",
  "buzios","búzios","cabo frio","angra dos reis","ilha grande","paraty","petropolis","petrópolis",
  "rio de janeiro","sao paulo","são paulo","campos do jordao","campos do jordão",
  "gramado","canela","monte verde","urubici","sao joaquim","são joaquim",
  "serra gaucha","serra gaúcha","serra catarinense",
  "ubatuba","ilhabela","guaruja","guarujá","santos","ilheus","ilhéus",
  "itacare","itacaré","morro branco","beach park","porto galinhas",
  "fernando de noronha","alter do chao","alter do chão","manaus","belem","belém",
  "bonito","chapada diamantina","chapada dos veadeiros","lencois maranhenses","lençóis maranhenses",
  "brasilia","brasília","curitiba","foz do iguacu","foz do iguaçu",
  "belo horizonte","ouro preto","tiradentes","diamantina","inhotim","capitolio","capitólio",
  "goiania","goiânia","caldas novas","rio quente",
  "praia do rosa","garopaba","imbituba","penha","itapema","brasil",
];
const INTERNATIONAL_KEYWORDS = [
  "bariloche","buenos aires","mendoza","el calafate","ushuaia","salta","argentina",
  "santiago","chile","valparaiso","valparaíso","atacama","puerto varas",
  "montevideu","montevidéu","montevideo","punta del este","uruguai",
  "cancun","cancún","playa del carmen","cozumel","riviera maya","cidade do mexico","cidade do méxico","mexico","méxico",
  "punta cana","republica dominicana","república dominicana",
  "havana","cuba","aruba","curacao","curaçao","bahamas","jamaica",
  "orlando","miami","nova york","new york","las vegas","los angeles","san francisco","estados unidos","eua","usa",
  "paris","franca","frança","lisboa","porto (portugal)","portugal",
  "madrid","espanha","barcelona","roma","italia","itália","milao","milão","milano","veneza","florenca","florença",
  "londres","reino unido","inglaterra","amsterdam","amsterda","amsterdã","holanda",
  "berlim","alemanha","praga","viena","atenas","santorini","grecia","grécia",
  "dubai","abu dhabi","istambul","turquia","cairo","egito","marrakech","marrocos",
  "toquio","tóquio","japao","japão","kyoto","seul","coreia",
  "bangkok","tailandia","tailândia","bali","indonesia","indonésia","phuket","singapura","hong kong",
  "cape town","cidade do cabo","africa do sul","áfrica do sul",
  "cartagena","colombia","colômbia","medellin","medellín","bogota","bogotá",
  "lima","peru","cusco","machu picchu","quito","equador","galapagos","galápagos",
];
const WINTER_KEYWORDS = [
  "bariloche","ushuaia","el calafate","valle nevado","portillo",
  "campos do jordao","campos do jordão","gramado","canela","monte verde","urubici",
  "sao joaquim","são joaquim","serra gaucha","serra gaúcha","serra catarinense",
];
const SUMMER_BR_KEYWORDS = [
  "porto seguro","arraial d'ajuda","trancoso","morro de sao paulo","morro de são paulo",
  "salvador","praia do forte","maragogi","porto de galinhas","maceio","maceió","japaratinga",
  "recife","natal","pipa","fortaleza","jericoacoara","canoa quebrada","aracaju",
  "florianopolis","florianópolis","balneario camboriu","balneário camboriú","bombinhas",
  "buzios","búzios","cabo frio","arraial do cabo","angra dos reis","ilha grande","paraty",
  "ubatuba","ilhabela","guaruja","guarujá","ilheus","ilhéus","itacare","itacaré",
  "fernando de noronha","alter do chao","alter do chão",
];

const norm = (s?: string | null) =>
  (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const matchesAny = (dest: string, keywords: string[]) => {
  const n = ` ${norm(dest).replace(/[^a-z0-9]+/g, " ")} `;
  return keywords.some((k) => n.includes(` ${norm(k).replace(/[^a-z0-9]+/g, " ")} `));
};
const isBrazilian = (dest: string) => matchesAny(dest, BR_KEYWORDS);
const totalPrice = <T extends CurationPkg>(p: T) =>
  Number(p.price_per_person) * (p.base_occupancy ?? 2);
const daysUntil = (s?: string | null) => {
  if (!s) return null;
  const d = new Date(String(s) + "T12:00:00").getTime();
  return isNaN(d) ? null : Math.round((d - Date.now()) / 86400000);
};
const monthOf = (s?: string | null) => {
  if (!s) return null;
  const m = Number((s || "").slice(5, 7));
  return isNaN(m) ? null : m;
};
const withinWindow = (d: string | null | undefined, from: string, to: string) =>
  !!d && d >= from && d <= to;

/**
 * Aplica exatamente as regras da aba de curadoria e devolve os pacotes
 * de destaque em ordem — mesmos grupos, mesma prioridade, sem duplicar.
 */
export function selectCuratedPackages<T extends CurationPkg>(packages: T[]): T[] {
  const active = (packages || []).filter((p) => p.is_active !== false);
  if (!active.length) return [];

  const buckets: T[][] = [];

  buckets.push([...active].sort((a, b) => totalPrice(a) - totalPrice(b)).slice(0, 5));

  buckets.push(
    active
      .filter((p) => !isBrazilian(p.destination) && matchesAny(p.destination, INTERNATIONAL_KEYWORDS))
      .sort((a, b) => totalPrice(a) - totalPrice(b))
      .slice(0, 6),
  );

  buckets.push(
    active
      .filter((p) => {
        const m = monthOf(p.going_date);
        return m !== null && m >= 6 && m <= 8 && matchesAny(p.destination, WINTER_KEYWORDS);
      })
      .sort((a, b) => totalPrice(a) - totalPrice(b))
      .slice(0, 6),
  );

  buckets.push(
    active
      .filter((p) => {
        const m = monthOf(p.going_date);
        if (m === null) return false;
        return (m === 12 || m <= 3) && matchesAny(p.destination, SUMMER_BR_KEYWORDS);
      })
      .sort((a, b) => totalPrice(a) - totalPrice(b))
      .slice(0, 6),
  );

  buckets.push(
    active
      .filter((p) => {
        const d = daysUntil(p.going_date);
        return d !== null && d >= 0 && d <= 60;
      })
      .sort((a, b) => (daysUntil(a.going_date) ?? 999) - (daysUntil(b.going_date) ?? 999))
      .slice(0, 5),
  );

  const themeOrder = ["natal", "reveillon", "carnaval", "pascoa", "prolongado"];
  const byTheme = new Map<string, T[]>();
  for (const p of active) {
    for (const w of HOLIDAY_WINDOWS) {
      if (withinWindow(p.going_date, w.from, w.to)) {
        const arr = byTheme.get(w.theme) ?? [];
        arr.push(p);
        byTheme.set(w.theme, arr);
        break;
      }
    }
  }
  for (const theme of themeOrder) {
    const arr = byTheme.get(theme);
    if (!arr?.length) continue;
    const seen = new Set<string>();
    const unique = arr.filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)));
    unique.sort((a, b) => totalPrice(a) - totalPrice(b));
    buckets.push(unique.slice(0, 6));
  }

  const seen = new Set<string>();
  const out: T[] = [];
  for (const bucket of buckets) {
    for (const p of bucket) {
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      out.push(p);
    }
  }
  return out;
}

/**
 * Seleção "mesclada" pra vitrines externas (widget WordPress):
 * metade Brasil (priorizando feriados e datas próximas) + metade
 * internacional — ambos ordenados pelos MENORES preços totais.
 * Intercalado BR/INTL pra dar variedade visual no carrossel.
 */
export function selectMixedFeatured<T extends CurationPkg>(
  packages: T[],
  total = 12,
): T[] {
  const active = (packages || []).filter((p) => p.is_active !== false);
  if (!active.length) return [];

  const half = Math.ceil(total / 2);

  const isHoliday = (p: T) =>
    HOLIDAY_WINDOWS.some((w) => withinWindow(p.going_date, w.from, w.to));
  const upcomingScore = (p: T) => {
    const d = daysUntil(p.going_date);
    if (d === null || d < 0) return 9999;
    return d;
  };

  // Brasil: feriados primeiro (por preço), depois próximas datas (0-90d por preço), depois resto por preço
  const brAll = active.filter((p) => isBrazilian(p.destination));
  const brHolidays = brAll
    .filter(isHoliday)
    .sort((a, b) => totalPrice(a) - totalPrice(b));
  const brUpcoming = brAll
    .filter((p) => !isHoliday(p))
    .filter((p) => {
      const d = daysUntil(p.going_date);
      return d !== null && d >= 0 && d <= 90;
    })
    .sort((a, b) => {
      const dp = upcomingScore(a) - upcomingScore(b);
      return dp !== 0 ? dp : totalPrice(a) - totalPrice(b);
    });
  const brRest = brAll.sort((a, b) => totalPrice(a) - totalPrice(b));
  const brSeen = new Set<string>();
  const brPool: T[] = [];
  for (const arr of [brHolidays, brUpcoming, brRest]) {
    for (const p of arr) {
      if (brSeen.has(p.id)) continue;
      brSeen.add(p.id);
      brPool.push(p);
      if (brPool.length >= half) break;
    }
    if (brPool.length >= half) break;
  }

  // Internacional: puramente pelos menores preços totais
  const intlPool = active
    .filter((p) => !isBrazilian(p.destination) && matchesAny(p.destination, INTERNATIONAL_KEYWORDS))
    .sort((a, b) => totalPrice(a) - totalPrice(b))
    .slice(0, half);

  // Intercala BR/INTL pra dar variedade no carrossel
  const out: T[] = [];
  const seen = new Set<string>();
  const push = (p?: T) => {
    if (!p || seen.has(p.id)) return;
    seen.add(p.id);
    out.push(p);
  };
  const maxLen = Math.max(brPool.length, intlPool.length);
  for (let i = 0; i < maxLen && out.length < total; i++) {
    push(brPool[i]);
    if (out.length >= total) break;
    push(intlPool[i]);
  }
  // Se ainda faltar, completa com o resto ativo mais barato
  if (out.length < total) {
    const filler = active
      .filter((p) => !seen.has(p.id))
      .sort((a, b) => totalPrice(a) - totalPrice(b));
    for (const p of filler) {
      push(p);
      if (out.length >= total) break;
    }
  }
  return out;
}
