import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Importação manual de vendas do Monde (v3).
 * O usuário digita o número da venda, o sistema busca em /sales
 * (a API v3 não expõe filtro por número — paginamos até achar),
 * gera um preview e depois cria um pedido local.
 */

const BASE_URL = "https://web.monde.com.br/api/v3";
const PAGE_SIZE = 50;
const MAX_PAGES = 40; // 40 × 50 = 2000 vendas cobertas na busca

/** Enriquecimento de voo via AeroDataBox — cidades, aeroportos e horários locais. */
type AeroInfo = {
  fromCity?: string; toCity?: string;
  fromAirport?: string; toAirport?: string;
  departAt?: string; arriveAt?: string;
  airline?: string; airlineIata?: string;
};
const AERO_CACHE = new Map<string, AeroInfo | null>();
async function enrichFlightFromAero(flightNumber: string | null | undefined, date: string | null | undefined): Promise<AeroInfo | null> {
  const apiKey = process.env.RAPIDAPI_AERODATABOX_KEY;
  if (!apiKey || !flightNumber || !date) return null;
  const num = String(flightNumber).replace(/\s+/g, "").toUpperCase();
  const day = String(date).slice(0, 10);
  if (!/^[A-Z0-9]{3,10}$/.test(num) || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const cacheKey = `${num}|${day}`;
  if (AERO_CACHE.has(cacheKey)) return AERO_CACHE.get(cacheKey) ?? null;
  try {
    const resp = await fetch(
      `https://aerodatabox.p.rapidapi.com/flights/number/${encodeURIComponent(num)}/${day}?withAircraftImage=false&withLocation=false`,
      { headers: { "x-rapidapi-key": apiKey, "x-rapidapi-host": "aerodatabox.p.rapidapi.com" } },
    );
    if (!resp.ok) { AERO_CACHE.set(cacheKey, null); return null; }
    const raw = (await resp.json().catch(() => null)) as any[] | null;
    const f = Array.isArray(raw) ? raw[0] : null;
    if (!f) { AERO_CACHE.set(cacheKey, null); return null; }
    const toLocal = (v?: string) => {
      if (!v) return undefined;
      const m = v.replace(" ", "T").match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
      return m ? `${m[1]}T${m[2]}` : undefined;
    };
    const info: AeroInfo = {
      fromCity: f.departure?.airport?.municipalityName,
      toCity: f.arrival?.airport?.municipalityName,
      fromAirport: f.departure?.airport?.name,
      toAirport: f.arrival?.airport?.name,
      departAt: toLocal(f.departure?.scheduledTime?.local),
      arriveAt: toLocal(f.arrival?.scheduledTime?.local),
      airline: f.airline?.name,
      airlineIata: f.airline?.iata,
    };
    AERO_CACHE.set(cacheKey, info);
    return info;
  } catch { AERO_CACHE.set(cacheKey, null); return null; }
}

async function ensureAdmin(ctx: { supabase: any; userId: string }) {
  const { data } = await ctx.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", ctx.userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!data) throw new Error("Apenas administradores podem importar vendas do Monde.");
}

async function mondeGet(path: string, query?: Record<string, string>) {
  const basic = process.env.MONDE_V3_BASIC;
  if (!basic) throw new Error("MONDE_V3_BASIC não configurado.");
  const qs = query ? "?" + new URLSearchParams(query).toString() : "";
  const res = await fetch(`${BASE_URL}${path}${qs}`, {
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      res.status === 401
        ? "Credencial do Monde inválida (401)."
        : `Monde v3 HTTP ${res.status}: ${text.slice(0, 300)}`,
    );
  }
  return res.json();
}

type MondePersonRef = {
  external_id?: string | null;
  person_kind?: "individual" | "company" | null;
  name?: string | null;
  legal_name?: string | null;
  gender?: string | null;
  birthdate?: string | null;
  cpf_cnpj?: string | null;
  cpf?: string | null;
  cnpj?: string | null;
  rg?: string | null;
  rg_ie?: string | null;
  passport_number?: string | null;
  passport_expiration_date?: string | null;
  foreigner?: boolean | null;
  email?: string | null;
  phone_number?: string | null;
  mobile_number?: string | null;
  address?: {
    postal_code?: string | null;
    street?: string | null;
    street_number?: string | null;
    additional_info?: string | null;
    neighborhood?: string | null;
    city_name?: string | null;
    state_code?: string | null;
    country_code?: string | null;
  } | null;
};

type MondeSale = {
  sale_id: string;
  sale_number: number;
  sale_date: string;
  status: string;
  observations?: string | null;
  registered_at?: string | null;
  travel_agent?: { name?: string | null; cpf?: string | null } | null;
  payer?: MondePersonRef | null;
  requester?: MondePersonRef | null;
  airline_tickets?: any[];
  hotels?: any[];
  cruises?: any[];
  insurances?: any[];
  train_tickets?: any[];
  ground_transportations?: any[];
  car_rentals?: any[];
  travel_packages?: any[];
  totals?: {
    products?: number;
    fees?: number;
    discount?: number;
    payments?: number;
    balance?: number;
    final_value?: number;
  } | null;
};

async function findSaleByNumber(
  saleNumber: number,
  onProgress?: (page: number, totalPages: number) => void,
): Promise<{ sale: MondeSale | null; pagesScanned: number; totalPages: number }> {
  let totalPages = 1;
  for (let page = 1; page <= MAX_PAGES; page++) {
    const json = await mondeGet("/sales", {
      page: String(page),
      size: String(PAGE_SIZE),
      status: "opened,closed,canceled",
    });
    totalPages = Number(json?.pagination?.total_pages ?? 1);
    onProgress?.(page, totalPages);
    const rows: MondeSale[] = Array.isArray(json?.data) ? json.data : [];
    const found = rows.find((r) => Number(r.sale_number) === saleNumber);
    if (found) return { sale: found, pagesScanned: page, totalPages };
    if (page >= totalPages) break;
  }
  return { sale: null, pagesScanned: Math.min(MAX_PAGES, totalPages), totalPages };
}

type ItemSummary = {
  kind: "flight" | "hotel" | "cruise" | "insurance" | "train" | "ground" | "car" | "package";
  title: string;
  locator: string | null;
  supplier: string | null;
  begin: string | null;
  end: string | null;
  customer_amount: number;
  fees: number;
  raw: any;
};

function summarizeItems(sale: MondeSale): ItemSummary[] {
  const out: ItemSummary[] = [];
  const num = (v: any) => (typeof v === "number" ? v : Number(v ?? 0)) || 0;

  for (const t of sale.airline_tickets ?? []) {
    const segs: any[] = Array.isArray(t.segments) ? t.segments : [];
    const totalCustomer = num(t.totals?.customer_amount ?? t.totals?.amount);
    const totalFees = num(t.totals?.fees) + num(t.totals?.du_fee);
    if (segs.length === 0) {
      out.push({
        kind: "flight",
        title: `Aéreo ${t.supplier?.name ?? ""}`.trim(),
        locator: t.locator ?? null,
        supplier: t.supplier?.name ?? null,
        begin: null,
        end: null,
        customer_amount: totalCustomer,
        fees: totalFees,
        raw: t,
      });
      continue;
    }
    segs.forEach((seg, idx) => {
      const airline = (seg.airline_code || t.supplier?.name || "").trim();
      const flightNo = seg.flight_number ? ` ${seg.flight_number}` : "";
      const route = `${seg.origin ?? ""}→${seg.destination ?? ""}`;
      out.push({
        kind: "flight",
        title: `Voo ${airline}${flightNo} ${route}`.trim(),
        locator: t.locator ?? null,
        supplier: t.supplier?.name ?? null,
        begin: seg.departure_date ?? null,
        end: seg.arrival_date ?? null,
        // Financeiro só no primeiro segmento pra não duplicar
        customer_amount: idx === 0 ? totalCustomer : 0,
        fees: idx === 0 ? totalFees : 0,
        raw: { ...t, __segment: seg, __segment_index: idx, __segment_count: segs.length },
      });
    });
  }
  for (const h of sale.hotels ?? []) {
    out.push({
      kind: "hotel",
      title: `Hotel ${h.supplier?.name ?? ""} (${h.nights ?? "?"} noites)`.trim(),
      locator: h.booking_number ?? null,
      supplier: h.supplier?.name ?? null,
      begin: h.check_in ?? null,
      end: h.check_out ?? null,
      customer_amount: num(h.totals?.customer_amount ?? h.totals?.amount),
      fees: num(h.totals?.fees),
      raw: h,
    });
  }
  for (const c of sale.cruises ?? []) {
    out.push({
      kind: "cruise",
      title: `Cruzeiro ${c.ship_name ?? ""} — ${c.cruise_destination ?? ""}`.trim(),
      locator: c.booking_number ?? null,
      supplier: c.supplier?.name ?? null,
      begin: c.departure_date ?? null,
      end: c.arrival_date ?? null,
      customer_amount: num(c.totals?.customer_amount ?? c.totals?.amount),
      fees: num(c.totals?.fees),
      raw: c,
    });
  }
  for (const ins of sale.insurances ?? []) {
    out.push({
      kind: "insurance",
      title: `Seguro ${ins.supplier?.name ?? ""} (${ins.destination ?? ""})`.trim(),
      locator: ins.voucher_code ?? null,
      supplier: ins.supplier?.name ?? null,
      begin: ins.begin_date ?? null,
      end: ins.end_date ?? null,
      customer_amount: num(ins.totals?.customer_amount ?? ins.totals?.amount),
      fees: num(ins.totals?.fees),
      raw: ins,
    });
  }
  for (const t of sale.train_tickets ?? []) {
    out.push({
      kind: "train",
      title: `Trem ${t.locator ?? ""}`.trim(),
      locator: t.locator ?? null,
      supplier: t.supplier?.name ?? null,
      begin: t.departure_date ?? null,
      end: t.arrival_date ?? null,
      customer_amount: num(t.totals?.customer_amount ?? t.totals?.amount),
      fees: num(t.totals?.fees),
      raw: t,
    });
  }
  for (const g of sale.ground_transportations ?? []) {
    out.push({
      kind: "ground",
      title: `Transfer ${g.locator ?? ""}`.trim(),
      locator: g.locator ?? null,
      supplier: g.supplier?.name ?? null,
      begin: g.departure_date ?? null,
      end: g.arrival_date ?? null,
      customer_amount: num(g.totals?.customer_amount ?? g.totals?.amount),
      fees: num(g.totals?.fees),
      raw: g,
    });
  }
  for (const c of sale.car_rentals ?? []) {
    out.push({
      kind: "car",
      title: `Carro ${c.vehicle_category ?? ""} (${c.rental_days ?? "?"}d)`.trim(),
      locator: c.booking_number ?? null,
      supplier: c.supplier?.name ?? null,
      begin: c.pickup_date ?? null,
      end: c.dropoff_date ?? null,
      customer_amount: num(c.totals?.customer_amount ?? c.totals?.amount),
      fees: num(c.totals?.fees),
      raw: c,
    });
  }
  for (const p of sale.travel_packages ?? []) {
    out.push({
      kind: "package",
      title: `Pacote ${p.package_name ?? ""}`.trim(),
      locator: p.booking_number ?? null,
      supplier: p.supplier?.name ?? null,
      begin: p.begin_date ?? null,
      end: p.end_date ?? null,
      customer_amount: num(p.totals?.customer_amount ?? p.totals?.amount),
      fees: num(p.totals?.fees),
      raw: p,
    });
  }
  return out;
}

type PassengerSummary = {
  external_id: string | null;
  name: string;
  cpf: string | null;
  birth_date: string | null;
  email: string | null;
  phone: string | null;
  passport: string | null;
  passport_expiry: string | null;
  raw: MondePersonRef;
};

function extractPassengers(sale: MondeSale): PassengerSummary[] {
  const map = new Map<string, PassengerSummary>();
  const push = (person?: MondePersonRef | null) => {
    if (!person || !person.name) return;
    const cpfClean = (person.cpf ?? person.cpf_cnpj ?? "").replace(/\D+/g, "");
    const key = person.external_id ?? (cpfClean.length >= 11 ? cpfClean : person.name);
    if (map.has(key)) return;
    map.set(key, {
      external_id: person.external_id ?? null,
      name: person.name!,
      cpf: cpfClean.length === 11 ? cpfClean : null,
      birth_date: person.birthdate ?? null,
      email: person.email ?? null,
      phone: person.mobile_number ?? person.phone_number ?? null,
      passport: person.passport_number ?? null,
      passport_expiry: person.passport_expiration_date ?? null,
      raw: person,
    });
  };
  const groups: any[][] = [
    sale.airline_tickets ?? [], sale.hotels ?? [], sale.cruises ?? [],
    sale.insurances ?? [], sale.train_tickets ?? [], sale.ground_transportations ?? [],
    sale.car_rentals ?? [], sale.travel_packages ?? [],
  ];
  for (const g of groups) {
    for (const item of g) {
      for (const pax of item.passengers ?? []) push(pax.person);
    }
  }
  return Array.from(map.values());
}

/** Busca detalhes completos de cada passageiro em /people/{id} do Monde. */
async function enrichPassengers(list: PassengerSummary[]): Promise<PassengerSummary[]> {
  const out: PassengerSummary[] = [];
  for (const p of list) {
    if (!p.external_id) { out.push(p); continue; }
    try {
      const json = await mondeGet(`/people/${p.external_id}`);
      const full = (json?.data ?? json) as any;
      const cpfClean = (full?.cpf ?? full?.cpf_cnpj ?? p.cpf ?? "").replace(/\D+/g, "");
      out.push({
        ...p,
        cpf: cpfClean.length === 11 ? cpfClean : p.cpf,
        birth_date: full?.birthdate ?? p.birth_date,
        email: full?.email ?? p.email,
        phone: full?.mobile_number ?? full?.phone_number ?? p.phone,
        passport: full?.passport_number ?? p.passport,
        passport_expiry: full?.passport_expiration_date ?? p.passport_expiry,
        raw: { ...p.raw, ...full },
      });
    } catch {
      out.push(p);
    }
  }
  return out;
}

/** Coleta os bilhetes emitidos por passageiro a partir dos airline_tickets da venda. */
function collectTicketsByPassenger(sale: MondeSale): Map<string, Array<{ ticket_number: string; locator: string | null; airline: string | null }>> {
  const byKey = new Map<string, Array<{ ticket_number: string; locator: string | null; airline: string | null }>>();
  for (const t of sale.airline_tickets ?? []) {
    for (const pax of t.passengers ?? []) {
      const person = pax.person as MondePersonRef | undefined;
      if (!person) continue;
      const cpfClean = (person.cpf ?? person.cpf_cnpj ?? "").replace(/\D+/g, "");
      const key = person.external_id ?? (cpfClean.length >= 11 ? cpfClean : person.name ?? "");
      if (!key) continue;
      const tn = (pax as any).ticket_number ?? (pax as any).ticket ?? (pax as any).number ?? null;
      if (!tn) continue;
      const arr = byKey.get(key) ?? [];
      arr.push({ ticket_number: String(tn), locator: t.locator ?? null, airline: t.supplier?.name ?? null });
      byKey.set(key, arr);
    }
  }
  return byKey;
}

export type MondeSalePreview = {
  sale_id: string;
  sale_number: number;
  sale_date: string;
  status: string;
  observations: string | null;
  travel_agent_name: string | null;
  payer: {
    name: string | null;
    cpf_cnpj: string | null;
    email: string | null;
    phone: string | null;
  };
  items: ItemSummary[];
  passengers: PassengerSummary[];
  totals: {
    products: number;
    fees: number;
    discount: number;
    final_value: number;
  };
  pages_scanned: number;
  total_pages: number;
  already_imported_order_id: string | null;
};

export const previewMondeSale = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ sale_number: z.number().int().min(1) }).parse(input),
  )
  .handler(async ({ data, context }): Promise<MondeSalePreview> => {
    await ensureAdmin(context);
    const { sale, pagesScanned, totalPages } = await findSaleByNumber(data.sale_number);
    if (!sale) {
      throw new Error(
        `Venda #${data.sale_number} não encontrada nas últimas ${pagesScanned * PAGE_SIZE} vendas do Monde.`,
      );
    }
    const { data: existing } = await context.supabase
      .from("orders")
      .select("id")
      .eq("monde_sale_id", sale.sale_id)
      .maybeSingle();

    const items = summarizeItems(sale);
    const passengers = await enrichPassengers(extractPassengers(sale));
    return {
      sale_id: sale.sale_id,
      sale_number: sale.sale_number,
      sale_date: sale.sale_date,
      status: sale.status,
      observations: sale.observations ?? null,
      travel_agent_name: sale.travel_agent?.name ?? null,
      payer: {
        name: sale.payer?.name ?? null,
        cpf_cnpj: sale.payer?.cpf_cnpj ?? null,
        email: sale.payer?.email ?? null,
        phone: sale.payer?.mobile_number ?? sale.payer?.phone_number ?? null,
      },
      items,
      passengers,
      totals: {
        products: sale.totals?.products ?? 0,
        fees: sale.totals?.fees ?? 0,
        discount: sale.totals?.discount ?? 0,
        final_value: sale.totals?.final_value ?? sale.totals?.payments ?? 0,
      },
      pages_scanned: pagesScanned,
      total_pages: totalPages,
      already_imported_order_id: (existing as any)?.id ?? null,
    };
  });

async function upsertPerson(
  ctx: { supabase: any },
  person: MondePersonRef,
): Promise<string | null> {
  if (!person.name) return null;
  const isCompany = person.person_kind === "company";
  const cpfCnpj = (person.cpf ?? person.cpf_cnpj ?? "").replace(/\D+/g, "");
  const addr = person.address ?? null;
  const row: Record<string, any> = {
    monde_id: person.external_id ?? null,
    kind: isCompany ? "PJ" : "PF",
    name: person.name,
    gender: person.gender ?? null,
    birth_date: !isCompany ? person.birthdate ?? null : null,
    cpf: !isCompany && cpfCnpj.length === 11 ? cpfCnpj : null,
    cnpj: isCompany && cpfCnpj.length === 14 ? cpfCnpj : null,
    rg: person.rg ?? person.rg_ie ?? null,
    passport_number: person.passport_number ?? null,
    passport_expiration: person.passport_expiration_date ?? null,
    email: person.email ?? null,
    phone: person.phone_number ?? null,
    mobile_phone: person.mobile_number ?? null,
    zip: addr?.postal_code ?? null,
    address: addr?.street ?? null,
    number: addr?.street_number ?? null,
    complement: addr?.additional_info ?? null,
    district: addr?.neighborhood ?? null,
    city: addr?.city_name ?? null,
    state: addr?.state_code ?? null,
    country: addr?.country_code ?? null,
    is_foreign: !!person.foreigner,
  };

  // Tenta por monde_id → cpf → cnpj
  if (row.monde_id) {
    const { data: byMonde } = await ctx.supabase
      .from("people")
      .select("id")
      .eq("monde_id", row.monde_id)
      .maybeSingle();
    if ((byMonde as any)?.id) {
      await ctx.supabase.from("people").update(row).eq("id", (byMonde as any).id);
      return (byMonde as any).id;
    }
  }
  if (row.cpf) {
    const { data: byCpf } = await ctx.supabase
      .from("people").select("id").eq("cpf", row.cpf).maybeSingle();
    if ((byCpf as any)?.id) return (byCpf as any).id;
  }
  if (row.cnpj) {
    const { data: byCnpj } = await ctx.supabase
      .from("people").select("id").eq("cnpj", row.cnpj).maybeSingle();
    if ((byCnpj as any)?.id) return (byCnpj as any).id;
  }
  const { data: inserted, error } = await ctx.supabase
    .from("people").insert(row).select("id").single();
  if (error) return null;
  return (inserted as any)?.id ?? null;
}

export const importMondeSale = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ sale_number: z.number().int().min(1) }).parse(input),
  )
  .handler(async ({ data, context }): Promise<{ order_id: string; order_number: string }> => {
    await ensureAdmin(context);
    const { sale } = await findSaleByNumber(data.sale_number);
    if (!sale) throw new Error(`Venda #${data.sale_number} não encontrada.`);

    // Idempotência: já importada?
    const { data: existing } = await context.supabase
      .from("orders").select("id, order_number").eq("monde_sale_id", sale.sale_id).maybeSingle();
    if (existing) {
      return { order_id: (existing as any).id, order_number: (existing as any).order_number };
    }

    const payer = sale.payer ?? {};
    const payerId = payer ? await upsertPerson(context, payer) : null;
    const cpfClean = (payer.cpf_cnpj ?? "").replace(/\D+/g, "");
    const totalPrice = sale.totals?.final_value ?? sale.totals?.payments ?? 0;
    const passengers = await enrichPassengers(extractPassengers(sale));
    const ticketsByPax = collectTicketsByPassenger(sale);
    const items = summarizeItems(sale);

    // primeira locator de aéreo, se houver
    const firstFlight = items.find((i) => i.kind === "flight");
    const firstSupplier = items[0]?.supplier ?? null;

    const orderPayload: Record<string, any> = {
      full_name: payer.name ?? passengers[0]?.name ?? "Passageiro Monde",
      email: payer.email ?? null,
      phone: payer.mobile_number ?? payer.phone_number ?? null,
      cpf: cpfClean.length === 11 ? cpfClean : null,
      cnpj: cpfClean.length === 14 ? cpfClean : null,
      birth_date: payer.birthdate ?? null,
      person_id: payerId,
      payment_method: "monde",
      total_price: totalPrice,
      adults: passengers.length || 1,
      children: 0,
      status: "pending",
      supplier_name: firstSupplier,
      airline_locator: firstFlight?.locator ?? null,
      monde_sale_id: sale.sale_id,
      supplier_order_number: String(sale.sale_number),
      notes: sale.observations ?? null,
      payer_full_name: payer.name ?? null,
      payer_cpf: cpfClean.length === 11 ? cpfClean : null,
      payer_cnpj: cpfClean.length === 14 ? cpfClean : null,
      payer_email: payer.email ?? null,
      payer_phone: payer.mobile_number ?? payer.phone_number ?? null,
      payer_zip: payer.address?.postal_code ?? null,
      payer_address: payer.address?.street ?? null,
      payer_number: payer.address?.street_number ?? null,
      payer_district: payer.address?.neighborhood ?? null,
      payer_city: payer.address?.city_name ?? null,
      payer_state: payer.address?.state_code ?? null,
      package_snapshot: {
        manual: true,
        source: "monde_v3_sale",
        sale_number: sale.sale_number,
        sale_id: sale.sale_id,
        sale_date: sale.sale_date,
        raw: sale,
      },
    };

    const { data: created, error } = await context.supabase
      .from("orders").insert(orderPayload).select("id, order_number").single();
    if (error) throw new Error(`Erro criando pedido: ${error.message}`);
    const orderId = (created as any).id as string;
    const orderNumber = (created as any).order_number as string;

    // Passageiros
    const paxIdByKey = new Map<string, string>();
    let sortP = 0;
    for (const p of passengers) {
      const key = p.external_id ?? p.cpf ?? p.name;
      const tickets = ticketsByPax.get(key) ?? [];
      // Salva como mapa { [locator]: ticket_number } — o renderer espera Record<string,string>.
      const ticketsMap: Record<string, string> = {};
      for (const t of tickets) {
        const k = t.locator || `_${Object.keys(ticketsMap).length + 1}`;
        ticketsMap[k] = t.ticket_number;
      }
      const { data: paxRow, error: paxErr } = await context.supabase
        .from("order_passengers")
        .insert({
          order_id: orderId,
          full_name: p.name,
          cpf: p.cpf,
          birth_date: p.birth_date,
          passport_number: p.passport,
          passport_expiry_date: p.passport_expiry,
          whatsapp: p.phone,
          ticket_number: tickets[0]?.ticket_number ?? null,
          tickets: tickets.length ? ticketsMap : null,
          sort_order: sortP++,
        })
        .select("id").single();
      if (!paxErr && paxRow) {
        paxIdByKey.set(key, (paxRow as any).id);
      }
    }

    // Itens + financeiro
    let sortI = 0;
    for (const it of items) {
      const details: Record<string, any> = { source: "monde", monde: it.raw };
      if (it.kind === "flight") {
        const seg = it.raw?.__segment ?? it.raw?.segments?.[0] ?? {};
        details.from_iata = seg.origin ?? null;
        details.to_iata = seg.destination ?? null;
        details.airline = seg.airline_code ?? it.raw?.supplier?.name ?? null;
        details.flight_number = seg.flight_number ?? null;
        details.booking_class = (seg.class ?? "").trim() || null;
        details.departure_at = seg.departure_date ?? null;
        details.arrival_at = seg.arrival_date ?? null;
        details.segment_index = it.raw?.__segment_index ?? 0;
        details.segment_count = it.raw?.__segment_count ?? 1;
        details.direction = (it.raw?.__segment_index ?? 0) === 0 ? "outbound" : "connection";
      } else if (it.kind === "hotel") {
        details.hotel_name = it.raw.supplier?.name ?? null;
        details.check_in = it.raw.check_in ?? null;
        details.check_out = it.raw.check_out ?? null;
        details.nights = it.raw.nights ?? null;
        details.meal_plan = it.raw.meal_plan ?? null;
        details.room_category = it.raw.room_category ?? null;
      }

      const { data: itemRow, error: iErr } = await context.supabase
        .from("order_items")
        .insert({
          order_id: orderId,
          kind: it.kind,
          status: "pending",
          title: it.title || `${it.kind} Monde`,
          supplier_locator: it.locator,
          details,
          sort_order: sortI++,
        })
        .select("id").single();
      if (iErr || !itemRow) continue;
      const itemId = (itemRow as any).id as string;

      // Financeiro — só no primeiro segmento do bilhete (evita duplicar valor)
      const raw = it.raw as any;
      const isConnectionSegment = it.kind === "flight" && (raw.__segment_index ?? 0) > 0;
      if (!isConnectionSegment) {
        await context.supabase.from("order_item_financials").insert({
          order_item_id: itemId,
          supplier_name: it.supplier,
          sale_value: raw.totals?.products ?? raw.totals?.amount ?? it.customer_amount,
          tax_value: raw.totals?.fees ?? 0,
          discount_value: raw.totals?.discount ?? 0,
          commission_value: raw.commission_amount ?? 0,
          commission_pct: raw.commission_percentage ?? 0,
          rav_value: raw.totals?.rav_fee ?? 0,
          total: it.customer_amount,
          is_commissionable: true,
        });
      }

      // Vincula passageiros deste item
      for (const paxItem of raw.passengers ?? []) {
        const pkey = paxItem.person?.external_id ?? (paxItem.person?.cpf ?? "").replace(/\D+/g, "") ?? paxItem.person?.name;
        const paxId = paxIdByKey.get(pkey);
        if (paxId) {
          await context.supabase.from("order_item_passengers").upsert({
            order_id: orderId,
            order_item_id: itemId,
            passenger_id: paxId,
          }, { onConflict: "order_item_id,passenger_id", ignoreDuplicates: true });
        }
      }
    }

    // Formas de pagamento vindas do Monde
    const paymentRows = mapMondePayments(sale, payer?.name ?? null);
    if (paymentRows.length) {
      const withOrder = paymentRows.map((p) => ({ ...p, order_id: orderId }));
      await context.supabase.from("order_payments").insert(withOrder);
    }

    return { order_id: orderId, order_number: orderNumber };
  });

type PaymentInsert = {
  status: string;
  method: string;
  amount: number;
  installments: number | null;
  installment_amount: number | null;
  card_last4: string | null;
  card_brand: string | null;
  authorization_code: string | null;
  proposal_number: string | null;
  paid_at: string | null;
  description: string | null;
  added_by_name: string | null;
  notes: string | null;
};

function mapMondePayments(sale: MondeSale, payerName: string | null): PaymentInsert[] {
  const list: PaymentInsert[] = [];
  const payments: any[] = Array.isArray((sale as any).payments) ? (sale as any).payments : [];

  const toIso = (d: any): string | null => {
    if (!d || typeof d !== "string") return null;
    return /^\d{4}-\d{2}-\d{2}$/.test(d) ? `${d}T12:00:00-03:00` : d;
  };

  const push = (row: Partial<PaymentInsert> & { method: string; amount: number }) => {
    if (!row.amount || Math.abs(row.amount) < 0.005) return;
    list.push({
      status: row.status ?? (row.paid_at ? "paid" : "pending"),
      method: row.method,
      amount: row.amount,
      installments: row.installments ?? null,
      installment_amount:
        row.installment_amount ??
        (row.installments && row.installments > 0 ? row.amount / row.installments : null),
      card_last4: row.card_last4 ?? null,
      card_brand: row.card_brand ?? null,
      authorization_code: row.authorization_code ?? null,
      proposal_number: row.proposal_number ?? null,
      paid_at: row.paid_at ?? null,
      description: row.description ?? null,
      added_by_name: payerName,
      notes: "Importado do Monde",
    });
  };

  for (const p of payments) {
    const agency = p?.agency ?? {};
    const vendor = p?.vendor ?? {};

    if (agency.credit_card) {
      const c = agency.credit_card;
      push({
        method: "credit_card",
        amount: Number(c.amount) || 0,
        installments: c.installments ?? null,
        card_last4: c.card_last_digits ?? null,
        card_brand: c.card_brand ?? null,
        authorization_code: c.authorization ?? null,
        paid_at: toIso(c.settlement_date),
        description: `Cartão ${c.card_brand ?? ""} final ${c.card_last_digits ?? ""}`.trim(),
      });
    }
    if (agency.bank_slip) {
      const b = agency.bank_slip;
      push({
        method: "boleto",
        amount: Number(b.amount) || 0,
        proposal_number: b.bank_slip_number ? String(b.bank_slip_number) : null,
        paid_at: toIso(b.settlement_date),
        description: b.bank_account?.description ? `Boleto — ${b.bank_account.description}` : "Boleto",
      });
    }
    if (agency.bank_deposit) {
      const b = agency.bank_deposit;
      push({
        method: "bank_transfer",
        amount: Number(b.amount) || 0,
        paid_at: toIso(b.settlement_date),
        description:
          [b.bank_account?.description, b.observations].filter(Boolean).join(" — ") || "Depósito",
      });
    }
    if (agency.custom) {
      const c = agency.custom;
      const name = (c.payment_method_name || "").toLowerCase();
      const method = name.includes("pix") ? "pix" : name.includes("dinheiro") ? "cash" : "other";
      push({
        method,
        amount: Number(c.amount) || 0,
        paid_at: toIso(c.settlement_date),
        description: c.payment_method_name ?? null,
      });
    }
    if (agency.others) {
      const o = agency.others;
      const details = (o.details || "").toLowerCase();
      const method = details.includes("pix") ? "pix" : "other";
      push({
        method,
        amount: Number(o.amount) || 0,
        paid_at: toIso(o.settlement_date),
        description: (o.details || "").trim() || null,
      });
    }
    if (agency.invoice) {
      push({
        method: "invoice",
        amount: Number(agency.invoice.amount) || 0,
        paid_at: toIso(agency.invoice.settlement_date),
        description: "Faturado",
      });
    }
    if (agency.credit) {
      push({
        method: "credit_note",
        amount: Number(agency.credit.amount) || 0,
        paid_at: toIso(agency.credit.due_date),
        description: agency.credit.document ? `Crédito ${agency.credit.document}` : "Crédito",
      });
    }
    if (agency.refund) {
      push({
        method: "refund",
        amount: Number(agency.refund.amount) || 0,
        paid_at: toIso(agency.refund.settlement_date),
        description: agency.refund.description ?? "Reembolso",
      });
    }

    // Sem bloco "agency" mas com "vendor.credit_card" (cartão direto ao fornecedor) → registra.
    if (!Object.keys(agency).length && vendor.credit_card) {
      const c = vendor.credit_card;
      const amount =
        Number(c.amount) ||
        (Array.isArray(c.products)
          ? c.products.reduce((s: number, x: any) => s + (Number(x.payment_amount) || 0), 0)
          : 0);
      push({
        method: "credit_card",
        amount,
        installments: c.installments ?? null,
        card_last4: c.card_last_digits ?? null,
        card_brand: c.card_brand ?? null,
        authorization_code: c.authorization ?? null,
        paid_at: toIso(c.due_date),
        description: `Cartão fornecedor final ${c.card_last_digits ?? ""}`.trim(),
        status: "paid",
      });
    }
  }

  return list;
}
