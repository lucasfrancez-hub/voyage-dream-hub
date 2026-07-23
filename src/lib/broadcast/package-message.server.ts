/**
 * Formata um pacote pronto no MESMO formato que a IA (Camila) envia via
 * WhatsApp. Usado pelo editor de broadcast quando o usuário escolhe
 * "Pacote pronto". Server-only.
 */

type PkgRow = {
  id: string;
  slug: string;
  title: string | null;
  destination: string | null;
  origin: string | null;
  going_date: string | null;
  return_date: string | null;
  price_per_person: number | string | null;
  image_url: string | null;
  meal_plan: string | null;
  includes: unknown;
  base_occupancy: number | null;
  hotel_name: string | null;
  hotel_stars: number | null;
  services: unknown;
  supplier_name: string | null;
  is_active: boolean | null;
};

export type BroadcastPackage = {
  id: string;
  slug: string;
  title: string;
  destination: string | null;
  origin: string | null;
  image_url: string | null;
  caption: string;
  price_per_person: number | null;
  going_date: string | null;
  return_date: string | null;
  nights: number | null;
};

function brl2(n: number) {
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtCob(raw: string) {
  const s = String(raw).trim().replace(/[^\d.,-]/g, "");
  let n: number;
  if (s.includes(",")) n = Number(s.replace(/\./g, "").replace(",", "."));
  else if (/^\d+\.\d{1,2}$/.test(s)) n = Number(s);
  else n = Number(s.replace(/\./g, ""));
  if (!isFinite(n) || n === 0) return raw;
  return new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}
function sentidoLabel(s?: string | null) {
  return s === "in" ? "somente chegada" : s === "out" ? "somente saída" : "ida e volta (chegada e saída)";
}

export function buildPackageCaption(pkg: PkgRow, storedCopy: string | null, quantidade_adultos?: number): string {
  const qtd = quantidade_adultos && quantidade_adultos > 0 ? quantidade_adultos : (pkg.base_occupancy ?? 2);
  const priceP = Number(pkg.price_per_person) || 0;
  const total = priceP * qtd;
  const pixTotal = total * 0.95;
  const isCaptive = /cativ/i.test(String(pkg.supplier_name ?? ""));
  const parcelaVisaMaster = total / 15;
  const parcelaOutrasBandeiras = total / 10;
  const parcelaCartao10 = total / 10;
  const link = `https://pedidos.viaair.tur.br/w/${pkg.slug}`;

  // Reusa copy curada se houver
  if (storedCopy) {
    let caption = String(storedCopy)
      .split("\n")
      .filter((l) => !/Para mais informações me chame aqui/i.test(l) && !/^\s*4499826-1137\s*$/.test(l))
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    if (!caption.includes(link)) caption = `${caption}\n${link}`;
    return caption;
  }

  const dateRange = (() => {
    try {
      const d1 = new Date(String(pkg.going_date) + "T12:00:00");
      const d2 = new Date(String(pkg.return_date) + "T12:00:00");
      const dd = (d: Date) => String(d.getDate()).padStart(2, "0") + "/" + String(d.getMonth() + 1).padStart(2, "0");
      return `${dd(d1)} a ${dd(d2)}`;
    } catch {
      return "";
    }
  })();
  const nights = (() => {
    try {
      const d1 = new Date(String(pkg.going_date) + "T12:00:00").getTime();
      const d2 = new Date(String(pkg.return_date) + "T12:00:00").getTime();
      const n = Math.round((d2 - d1) / 86400000);
      return n > 0 ? n : null;
    } catch { return null; }
  })();
  const daysUntil = (() => {
    try {
      const t = new Date(String(pkg.going_date) + "T12:00:00").getTime();
      return Math.round((t - Date.now()) / 86400000);
    } catch { return null; }
  })();
  const boletoAteViagem = daysUntil !== null && daysUntil >= 60;

  const includesArr: string[] = Array.isArray(pkg.includes) ? (pkg.includes as string[]) : [];
  const mealText = String(pkg.meal_plan ?? "");
  const hasBreakfast =
    /café|cafe|breakfast|manhã|manha/i.test(mealText) ||
    includesArr.some((i) => /café|cafe|manhã|manha/i.test(String(i)));
  const hasAllInclusive =
    /all\s*inclusive|tudo\s*incluso/i.test(mealText) ||
    includesArr.some((i) => /all\s*inclusive|tudo\s*incluso/i.test(String(i)));
  const regime = hasAllInclusive ? "All Inclusive" : hasBreakfast ? "Café da Manhã" : "";
  const stars = pkg.hotel_stars ? "★".repeat(Math.min(5, Math.max(1, Number(pkg.hotel_stars)))) : "";

  const svc: Record<string, unknown> = (pkg.services as Record<string, unknown>) ?? {};
  const services_lines: string[] = [];
  const g = <T = unknown>(k: string) => svc[k] as T;
  const seguro = g<{ enabled?: boolean; cobertura?: string; moeda?: string }>("seguro");
  if (seguro?.enabled) {
    const cob = seguro.cobertura?.toString().trim();
    const moeda = seguro.moeda || "USD";
    services_lines.push(cob ? `🛡️ Seguro Viagem ${moeda} ${fmtCob(cob)} por pessoa` : `🛡️ Seguro Viagem`);
  }
  const canc = g<{ enabled?: boolean; cobertura?: string; moeda?: string }>("cancelamento");
  if (canc?.enabled) {
    const cob = canc.cobertura?.toString().trim();
    const moeda = canc.moeda || "BRL";
    services_lines.push(cob ? `🧾 Cobertura para cancelamento involuntário ${moeda} ${fmtCob(cob)} por pessoa` : `🧾 Cobertura para cancelamento involuntário`);
  }
  const transfer = g<{ enabled?: boolean; sentido?: string }>("transfer");
  if (transfer?.enabled) services_lines.push(`🚐 Transfer aeroporto ↔ hotel (${sentidoLabel(transfer.sentido)})`);
  const ct = g<{ enabled?: boolean; detalhe?: string }>("city_tour");
  if (ct?.enabled) {
    const det = ct.detalhe?.trim();
    services_lines.push(det ? `🗺️ City Tour — ${det}` : `🗺️ City Tour`);
  }
  const tickets = g<{ enabled?: boolean; parks?: unknown[] }>("tickets");
  if (tickets?.enabled) {
    const parks = (tickets.parks ?? []).map((p) => String(p ?? "").trim()).filter(Boolean);
    for (const park of parks) services_lines.push(`🎟️ Ingresso ${park}`);
  }
  const outros = g<unknown[]>("outros") ?? [];
  for (const extra of outros) {
    const t = String(extra ?? "").trim();
    if (t) services_lines.push(`✨ ${t}`);
  }

  const title = String(pkg.title || pkg.destination || "PACOTE").toUpperCase();
  const lines: string[] = [];
  lines.push(`*${title}*`);
  lines.push("");
  if (pkg.origin) lines.push(`✈️ Saindo de ${pkg.origin}`);
  if (dateRange) lines.push(`🗓️ ${dateRange}${nights ? ` (${nights} noites)` : ""}`);
  if (pkg.hotel_name) {
    lines.push(`🏨 ${pkg.hotel_name}${stars ? ` ${stars}` : ""}${regime ? ` — ${regime}` : ""}`);
  }
  if (services_lines.length) {
    lines.push("");
    for (const s of services_lines) lines.push(s);
  }
  lines.push("");
  lines.push(`*FORMAS DE PAGAMENTO:*`);
  lines.push(`🤑 *PIX:* ${brl2(pixTotal)} PARA ${qtd} ADULTO${qtd === 1 ? "" : "S"} _(5% de desconto já aplicado)_`);
  if (isCaptive) {
    lines.push(`💳 *Cartão Visa/Master:* 15x de ${brl2(parcelaVisaMaster)}`);
    lines.push(`💳 *Demais bandeiras:* 10x de ${brl2(parcelaOutrasBandeiras)}`);
  } else {
    lines.push(`💳 *Cartão de crédito:* 10x de ${brl2(parcelaCartao10)}`);
  }
  lines.push(`📄 *Boleto bancário:* até 10x mediante aprovação`);
  if (boletoAteViagem) lines.push(`📄 *Boleto parcelado:* até a data da viagem (sem análise de crédito)`);
  lines.push(`*sem juros em qualquer forma de pagamento*`);
  lines.push("");
  lines.push(link);
  return lines.join("\n");
}

export async function listBroadcastPackages(filter: { origin?: string; destination?: string; search?: string } = {}): Promise<BroadcastPackage[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  let q = supabaseAdmin
    .from("packages")
    .select("id, slug, title, destination, origin, going_date, return_date, price_per_person, image_url, meal_plan, includes, base_occupancy, hotel_name, hotel_stars, is_active, services, supplier_name")
    .eq("is_active", true)
    .order("going_date", { ascending: true })
    .limit(200);
  if (filter.origin) q = q.ilike("origin", `%${filter.origin}%`);
  if (filter.destination) q = q.ilike("destination", `%${filter.destination}%`);
  if (filter.search) {
    const s = filter.search.trim();
    q = q.or(`title.ilike.%${s}%,slug.ilike.%${s}%,destination.ilike.%${s}%`);
  }
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as PkgRow[];
  const ids = rows.map((r) => r.id);
  const copyMap = new Map<string, string>();
  if (ids.length > 0) {
    const { data: copies } = await supabaseAdmin
      .from("package_ai_copy")
      .select("package_id, text")
      .eq("channel", "whatsapp")
      .in("package_id", ids);
    for (const c of (copies ?? []) as { package_id: string; text: string }[]) {
      if (c.text) copyMap.set(c.package_id, c.text);
    }
  }
  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    title: r.title ?? r.destination ?? r.slug,
    destination: r.destination,
    origin: r.origin,
    image_url: r.image_url,
    caption: buildPackageCaption(r, copyMap.get(r.id) ?? null),
  }));
}
