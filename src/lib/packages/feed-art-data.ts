/**
 * Lógica compartilhada entre feed-art (3:4) e story-art (9:16):
 * carrega fontes, deriva o estado do destino, formata datas, detecta
 * inclusos e monta o objeto FeedArtData a partir do registro do pacote.
 */
import type { FeedArtData } from "@/components/packages/PackageFeedArt";
import { fetchProxiedImage } from "@/lib/image-proxy.functions";
import { generatePackageTagline } from "@/lib/packages/ai.functions";
import { classifyMealPlan, mealPlanLabel, type MealPlanKind } from "@/lib/packages/meal-plan";


const FONTS_HREF =
  "https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700;800;900&family=Dancing+Script:wght@600;700&display=swap";

export async function ensureFonts() {
  if (typeof document === "undefined") return;
  if (!document.querySelector(`link[data-vfeed-fonts]`)) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = FONTS_HREF;
    link.setAttribute("data-vfeed-fonts", "1");
    document.head.appendChild(link);
  }
  try {
    await Promise.all([
      (document as any).fonts?.load?.('900 100px "Montserrat"'),
      (document as any).fonts?.load?.('700 20px "Montserrat"'),
      (document as any).fonts?.load?.('700 48px "Dancing Script"'),
    ]);
    await (document as any).fonts?.ready;
  } catch {
    /* noop */
  }
}

const APT_LABEL: Record<number, string> = {
  1: "individual", 2: "duplo", 3: "triplo", 4: "quádruplo", 5: "quíntuplo",
};

const KNOWN_STATE: Record<string, string> = {
  "porto seguro": "Bahia", "salvador": "Bahia", "morro de sao paulo": "Bahia",
  "ilheus": "Bahia", "trancoso": "Bahia", "arraial d'ajuda": "Bahia",
  "maceio": "Alagoas", "maragogi": "Alagoas", "sao miguel dos milagres": "Alagoas",
  "recife": "Pernambuco", "porto de galinhas": "Pernambuco", "fernando de noronha": "Pernambuco",
  "natal": "Rio Grande do Norte", "pipa": "Rio Grande do Norte",
  "joao pessoa": "Paraiba",
  "fortaleza": "Ceara", "jericoacoara": "Ceara", "canoa quebrada": "Ceara",
  "sao luis": "Maranhao", "barreirinhas": "Maranhao",
  "belem": "Para",
  "manaus": "Amazonas",
  "rio de janeiro": "Rio de Janeiro", "buzios": "Rio de Janeiro", "angra dos reis": "Rio de Janeiro", "paraty": "Rio de Janeiro",
  "sao paulo": "Sao Paulo", "campos do jordao": "Sao Paulo", "ubatuba": "Sao Paulo", "ilhabela": "Sao Paulo",
  "curitiba": "Parana", "foz do iguacu": "Parana",
  "florianopolis": "Santa Catarina", "balneario camboriu": "Santa Catarina", "bombinhas": "Santa Catarina",
  "gramado": "Rio Grande do Sul", "canela": "Rio Grande do Sul", "porto alegre": "Rio Grande do Sul",
  "brasilia": "Distrito Federal",
  "bonito": "Mato Grosso do Sul", "campo grande": "Mato Grosso do Sul",
  "cuiaba": "Mato Grosso",
  "goiania": "Goias", "caldas novas": "Goias", "pirenopolis": "Goias",
  "belo horizonte": "Minas Gerais", "ouro preto": "Minas Gerais", "tiradentes": "Minas Gerais",
  "vitoria": "Espirito Santo", "guarapari": "Espirito Santo",
};

function norm(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

function deriveState(destination: string, address?: string | null) {
  const key = norm(destination);
  if (KNOWN_STATE[key]) return KNOWN_STATE[key];
  if (address) {
    const m = address.match(/-\s*([A-Z]{2})\b/);
    const UF: Record<string, string> = {
      AC: "Acre", AL: "Alagoas", AP: "Amapá", AM: "Amazonas", BA: "Bahia",
      CE: "Ceará", DF: "Distrito Federal", ES: "Espírito Santo", GO: "Goiás",
      MA: "Maranhão", MT: "Mato Grosso", MS: "Mato Grosso do Sul", MG: "Minas Gerais",
      PA: "Pará", PB: "Paraíba", PR: "Paraná", PE: "Pernambuco", PI: "Piauí",
      RJ: "Rio de Janeiro", RN: "Rio Grande do Norte", RS: "Rio Grande do Sul",
      RO: "Rondônia", RR: "Roraima", SC: "Santa Catarina", SP: "São Paulo",
      SE: "Sergipe", TO: "Tocantins",
    };
    if (m && UF[m[1]]) return UF[m[1]];
  }
  return "";
}

function formatDateBR(iso: string | null) {
  if (!iso) return "";
  // Parse YYYY-MM-DD como data local pra evitar shift de fuso (UTC → BRT tira 1 dia)
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export type SeguroMoeda = "BRL" | "USD" | "EUR";
export type PackageServices = {
  seguro?: {
    enabled?: boolean;
    cobertura?: string | null;
    moeda?: SeguroMoeda | null;
    // Campos legados — mantidos p/ compatibilidade com registros antigos.
    // Novo fluxo usa o bloco `cancelamento` no topo de services.
    cancelamento?: string | null;
    cancelamento_moeda?: SeguroMoeda | null;
    plano?: string | null;
  };
  cancelamento?: {
    enabled?: boolean;
    cobertura?: string | null;
    moeda?: SeguroMoeda | null;
  };
  transfer?: { enabled?: boolean; sentido?: "in" | "out" | "in_out" | null; pickup_points?: string | null };
  city_tour?: { enabled?: boolean; detalhe?: string | null };
  passeios?: string[] | null;
  tickets?: { enabled?: boolean; parks?: string[] | null };
  cruise?: {
    company?: string | null;
    ship?: string | null;
    cabin_type?: string | null;
    board_regime?: string | null;
  };
  outros?: string[];
};




export const SEGURO_MOEDA_SYMBOL: Record<SeguroMoeda, string> = {
  BRL: "R$",
  USD: "US$",
  EUR: "€",
};

export function formatSeguroCobertura(
  value: string | null | undefined,
  moeda: SeguroMoeda | null | undefined,
): string {
  const raw = (value ?? "").trim();
  if (!raw) return "";
  const sym = moeda ? SEGURO_MOEDA_SYMBOL[moeda] : "";
  // Detecta moeda embutida no texto para respeitar
  const embedded = /^(r\$|us\$|u\$|\$|€|usd|eur|brl)\s*(.*)$/i.exec(raw);
  const symOut = embedded ? raw.slice(0, embedded[0].length - embedded[2].length).trim() : sym;
  const amountStr = embedded ? embedded[2] : raw;
  // Extrai número aceitando "30000", "30.000", "30,000", "30.000,00", "30,000.00"
  const digits = amountStr.replace(/[^\d.,-]/g, "");
  let n: number = NaN;
  if (digits) {
    const hasComma = digits.includes(",");
    const hasDot = digits.includes(".");
    let normalized = digits;
    if (hasComma && hasDot) {
      // último separador é decimal
      normalized = digits.lastIndexOf(",") > digits.lastIndexOf(".")
        ? digits.replace(/\./g, "").replace(",", ".")
        : digits.replace(/,/g, "");
    } else if (hasComma) {
      // vírgula é decimal se houver 1-2 dígitos após
      const parts = digits.split(",");
      normalized = parts.length === 2 && parts[1].length <= 2
        ? `${parts[0].replace(/\./g, "")}.${parts[1]}`
        : digits.replace(/,/g, "");
    } else if (hasDot) {
      const parts = digits.split(".");
      normalized = parts.length === 2 && parts[1].length <= 2
        ? digits
        : digits.replace(/\./g, "");
    }
    n = Number(normalized);
  }
  const formatted = Number.isFinite(n)
    ? n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : amountStr.trim();
  return symOut ? `${symOut} ${formatted}` : formatted;
}

function normalizePasseios(services?: PackageServices | null): string[] {
  if (!services) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  const isCityTour = (s: string) => /^city\s*tour\b/i.test(s.trim());
  const push = (raw: string) => {
    const t = String(raw ?? "").trim().replace(/\s+/g, " ");
    if (!t) return;
    const k = t.toLowerCase();
    if (seen.has(k)) return;
    // Dedup por "family": todo City Tour conta como o mesmo passeio.
    // Mantém a primeira variação (preferencialmente a detalhada).
    if (isCityTour(t) && [...seen].some((x) => x.startsWith("city tour"))) return;
    seen.add(k);
    out.push(t);
  };
  if (services.city_tour?.enabled) {
    const det = services.city_tour.detalhe?.trim();
    push(det ? `City Tour — ${det}` : "City Tour");
  }
  for (const p of services.passeios ?? []) push(String(p ?? ""));
  return out;
}

function countServices(services?: PackageServices | null): number {
  if (!services) return 0;
  let n = 0;
  if (services.seguro?.enabled) n++;
  if (services.cancelamento?.enabled) n++;
  if (services.transfer?.enabled) n++;
  if (normalizePasseios(services).length) n++;
  if (services.tickets?.enabled && (services.tickets.parks ?? []).some((p) => p && p.trim())) n++;
  n += (services.outros ?? []).filter((x) => x && x.trim()).length;
  return n;
}

function detectIncludes(
  list: string[] | null | undefined,
  services?: PackageServices | null,
  kind?: "package" | "service" | "cruise" | null,
) {
  const s = (list ?? []).map((x) => norm(x)).join(" | ");
  const svcCount = countServices(services);
  const groupServices = svcCount >= 2;
  const seguroOn = !!services?.seguro?.enabled;
  const transferOn = !!services?.transfer?.enabled;
  const ticketsOn = !!services?.tickets?.enabled && (services?.tickets?.parks ?? []).some((p) => p && p.trim());
  const passeiosOn = normalizePasseios(services).length > 0;
  const isService = kind === "service";
  return {
    // Ingresso não tem aéreo / hotel / café / bagagem por padrão
    aereo: isService ? false : /aereo|voo|passag|avia/.test(s),
    hotel: isService ? false : /hotel|hospedagem|resort|pousada|acomoda/.test(s),
    cafeDaManha: isService ? false : /cafe da manha|cafe|breakfast|acm|map|fap|all inclusive|meia pensao|pensao completa|tudo incluso/.test(s),
    bagagem23kg: isService ? false : /bagagem|despachad|23\s*kg|23kg/.test(s),
    transfer: groupServices ? false : (transferOn || /transfer|traslado/.test(s)),
    seguroViagem: groupServices ? false : (seguroOn || /seguro/.test(s)),
    esimInternacional: isService ? false : /esim|chip|internet/.test(s),
    ingressos: ticketsOn || isService,
    passeios: passeiosOn,
    maisServicos: groupServices,
  };
}



/** Deriva rótulo do regime (all inclusive, meia pensão, etc.) para o chip de refeições. */
function deriveMealPlanLabel(
  mealPlan: string | null | undefined,
  list: string[] | null | undefined,
): string {
  const priority: readonly string[] = ["all_inclusive", "pensao_completa", "meia_pensao", "cafe"];
  const candidates: MealPlanKind[] = [];
  const primary = classifyMealPlan(mealPlan ?? "");
  if (primary) candidates.push(primary);
  for (const raw of list ?? []) {
    const k = classifyMealPlan(String(raw ?? ""));
    if (k) candidates.push(k);
  }
  let best: MealPlanKind = null;
  let bestRank = priority.length;
  for (const c of candidates) {
    const idx = c ? priority.indexOf(c) : -1;
    if (idx !== -1 && idx < bestRank) { best = c; bestRank = idx; }
  }

  return mealPlanLabel(best) || "Café da Manhã";
}



async function toDataUrl(url: string): Promise<string> {
  const res = await fetchProxiedImage({ data: { url } });
  if (!res.ok || !("base64" in res)) throw new Error("Falha ao carregar imagem de capa");
  return `data:${res.contentType || "image/jpeg"};base64,${res.base64}`;
}

export type FeedInputPkg = {
  slug: string;
  destination: string;
  origin: string | null;
  going_date: string | null;
  return_date: string | null;
  nights: number | null;
  price_per_person: number;
  image_url: string | null;
  includes: string[] | null;
  hotel_name: string | null;
  hotel_stars: number | null;
  room_type: string | null;
  base_occupancy: number;
  tripadvisor_address?: string | null;
  services?: PackageServices | null;
  meal_plan?: string | null;
  supplier_name?: string | null;
};


export async function buildFeedArtData(pkg: FeedInputPkg): Promise<FeedArtData> {
  if (!pkg.image_url) throw new Error("Cadastre a URL da imagem de capa para gerar a arte.");

  const [bg, tagline] = await Promise.all([
    toDataUrl(pkg.image_url),
    generatePackageTagline({ data: { destination: pkg.destination } })
      .then((r) => r.text)
      .catch(() => `Descubra ${pkg.destination}.`),
  ]);

  const pessoas = Math.max(1, Number(pkg.base_occupancy) || 2);
  const isCativa = /cativa/i.test(pkg.supplier_name ?? "");
  return {
    backgroundDataUrl: bg,
    estado: deriveState(pkg.destination, pkg.tripadvisor_address),
    destino: pkg.destination,
    frase: tagline,
    dataIda: formatDateBR(pkg.going_date),
    dataVolta: formatDateBR(pkg.return_date),
    noites: pkg.nights,
    origem: pkg.origin || "",
    hotel: pkg.hotel_name || "",
    estrelas: pkg.hotel_stars,
    quantidadePessoas: pessoas,
    apartamento: APT_LABEL[pessoas] || `de ${pessoas} pessoas`,
    parcelas: isCativa ? 15 : 10,
    isCativa,
    valorTotal: (Number(pkg.price_per_person) || 0) * pessoas,

    inclusos: detectIncludes(pkg.includes, pkg.services ?? null),
    mealPlanLabel: deriveMealPlanLabel(pkg.meal_plan, pkg.includes),
    ticketsLabel: (pkg.services?.tickets?.parks ?? [])
      .map((p) => String(p ?? "").trim())
      .filter(Boolean)
      .join(" · ") || null,
    ticketsParks: (pkg.services?.tickets?.parks ?? [])
      .map((p) => String(p ?? "").trim())
      .filter(Boolean),
    passeiosList: normalizePasseios(pkg.services ?? null),
  };
}

