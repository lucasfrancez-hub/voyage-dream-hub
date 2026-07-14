import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// -------- Types --------

export type QuoteConfig = {
  pix: { enabled: boolean; discount_pct: number };
  card: { enabled: boolean; max_installments: number; interest_from: number | null };
  boleto: { enabled: boolean; max_installments: number };
  valid_until: string | null; // ISO date (YYYY-MM-DD)
  notes: string;
};

export const DEFAULT_QUOTE_CONFIG: QuoteConfig = {
  pix: { enabled: true, discount_pct: 5 },
  card: { enabled: true, max_installments: 10, interest_from: null },
  boleto: { enabled: false, max_installments: 1 },
  valid_until: null,
  notes: "",
};

export function normalizeQuoteConfig(raw: unknown): QuoteConfig {
  const r = (raw ?? {}) as Partial<QuoteConfig>;
  const pix = r.pix ?? DEFAULT_QUOTE_CONFIG.pix;
  const card = r.card ?? DEFAULT_QUOTE_CONFIG.card;
  const boleto = r.boleto ?? DEFAULT_QUOTE_CONFIG.boleto;
  return {
    pix: {
      enabled: !!pix.enabled,
      discount_pct: Math.max(0, Math.min(100, Number(pix.discount_pct ?? 0))),
    },
    card: {
      enabled: !!card.enabled,
      max_installments: Math.max(1, Math.min(24, Number(card.max_installments ?? 1))),
      interest_from: card.interest_from == null ? null : Math.max(1, Number(card.interest_from)),
    },
    boleto: {
      enabled: !!boleto.enabled,
      max_installments: Math.max(1, Math.min(12, Number(boleto.max_installments ?? 1))),
    },
    valid_until: r.valid_until ?? null,
    notes: r.notes ?? "",
  };
}

export type HotelInfo = {
  name: string | null;
  rating: number | null;
  num_reviews: number | null;
  ranking: string | null;
  address: string | null;
  description: string | null;
  photos: string[]; // urls
  amenities: string[];
  web_url: string | null;
};

export type PublicQuoteItem = {
  kind: "flight" | "hotel" | "other";
  title: string;
  direction?: "outbound" | "return" | null;
  airline?: string | null;
  flight_number?: string | null;
  from_iata?: string | null;
  from_city?: string | null;
  to_iata?: string | null;
  to_city?: string | null;
  departure_at?: string | null;
  arrival_at?: string | null;
  hotel_name?: string | null;
  hotel_stars?: number | null;
  nights?: number | null;
  meal_plan?: string | null;
  check_in?: string | null;
  check_out?: string | null;
  hotel_info?: HotelInfo | null;
  category?: string | null;
  date_from?: string | null;
  date_to?: string | null;
  notes?: string | null;
};

export type PublicQuote = {
  orderNumber: string;
  customerFirstName: string;
  totalPrice: number;
  createdAt: string;
  tripTitle: string | null;
  destination: string | null;
  travelers: { adults: number; children: number };
  items: PublicQuoteItem[];
  config: QuoteConfig;
  agency: { name: string; email: string; phone: string; whatsapp: string };
};


// -------- Server functions --------

export const getQuoteToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { orderId: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!isAdmin) throw new Error("Forbidden");
    const { data: row, error } = await supabase
      .from("orders")
      .select("order_number")
      .eq("id", data.orderId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const orderNumber = (row as { order_number?: string | null } | null)?.order_number;
    if (!orderNumber) throw new Error("Pedido sem numeração");
    const { encodeQuoteTokenFromOrderNumber } = await import("./quote-token.server");
    return { token: encodeQuoteTokenFromOrderNumber(orderNumber) };
  });


export const saveQuoteConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { orderId: string; config: QuoteConfig }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!isAdmin) throw new Error("Forbidden");
    const cfg = normalizeQuoteConfig(data.config);
    const payload = { quote_config: cfg as unknown } as Record<string, unknown>;
    const { error } = await supabase.from("orders").update(payload as never).eq("id", data.orderId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getQuoteConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { orderId: string }) => input)
  .handler(async ({ data, context }): Promise<QuoteConfig> => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!isAdmin) throw new Error("Forbidden");
    const { data: row, error } = await supabase
      .from("orders")
      .select("id")
      .eq("id", data.orderId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Pedido não encontrado");
    const raw = (row as unknown as { quote_config?: unknown }).quote_config;
    return normalizeQuoteConfig(raw);
  });

export const getPublicQuote = createServerFn({ method: "GET" })
  .inputValidator((input: { token: string }) => input)
  .handler(async ({ data }): Promise<PublicQuote> => {
    const { decodeQuoteTokenToOrderNumber, decodeQuoteTokenLegacy } = await import("./quote-token.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Resolve orderId a partir do token curto (order_number) OU legado (uuid).
    let orderId: string | null = null;
    const orderNumber = decodeQuoteTokenToOrderNumber(data.token);
    if (orderNumber) {
      const { data: byNum } = await supabaseAdmin
        .from("orders").select("id").eq("order_number", orderNumber).maybeSingle();
      orderId = (byNum as { id?: string } | null)?.id ?? null;
    } else {
      orderId = decodeQuoteTokenLegacy(data.token);
    }
    if (!orderId) throw new Error("Orçamento inválido");

    const { data: order, error: e1 } = await supabaseAdmin
      .from("orders")
      .select("*")
      .eq("id", orderId)
      .maybeSingle();
    if (e1) throw new Error(e1.message);
    if (!order) throw new Error("Pedido não encontrado");


    // Materializa itens a partir do snapshot (caso o pedido tenha vindo de pacote pronto)
    try {
      await supabaseAdmin.rpc("materialize_order_from_snapshot", { _order_id: orderId });
    } catch {
      // ignora — pedidos manuais já têm itens
    }

    const { data: items, error: e2 } = await supabaseAdmin
      .from("order_items")
      .select("kind, title, details, status, sort_order")
      .eq("order_id", orderId)
      .neq("status", "cancelled")
      .order("sort_order", { ascending: true });
    if (e2) throw new Error(e2.message);

    const publicItems: PublicQuoteItem[] = (items ?? []).map((i) => {
      const d = (i.details ?? {}) as Record<string, unknown>;
      const str = (k: string) => {
        const v = d[k];
        if (v == null || v === "") return null;
        return String(v);
      };
      const num = (k: string) => {
        const v = d[k];
        if (v == null || v === "") return null;
        const n = Number(v);
        return Number.isFinite(n) ? n : null;
      };
      const combineDT = (dk: string, tk: string): string | null => {
        const dt = str(dk); const tm = str(tk);
        if (!dt) return null;
        return tm ? `${dt}T${tm}` : dt;
      };
      const kind = i.kind as "flight" | "hotel" | "other";
      if (kind === "flight") {
        return {
          kind,
          title: i.title,
          direction: (str("direction") as "outbound" | "return" | null) || null,
          airline: str("airline"),
          flight_number: str("flight_number"),
          from_iata: str("from_iata") ?? str("origin"),
          from_city: str("from_city"),
          to_iata: str("to_iata") ?? str("destination"),
          to_city: str("to_city"),
          departure_at:
            str("departure_datetime") ??
            combineDT("date_from", "time_from") ??
            combineDT("departure_date", "departure_time"),
          arrival_at:
            str("arrival_datetime") ??
            combineDT("date_to", "time_to") ??
            combineDT("arrival_date", "arrival_time"),
          notes: str("notes"),
        };
      }
      if (kind === "hotel") {
        return {
          kind,
          title: i.title,
          hotel_name: str("hotel_name") ?? i.title,
          hotel_stars: num("hotel_stars"),
          nights: num("nights"),
          meal_plan: str("meal_plan") ?? str("board"),
          check_in: str("check_in") ?? str("checkin"),
          check_out: str("check_out") ?? str("checkout"),
          notes: str("notes"),
        };
      }
      return {
        kind,
        title: i.title,
        category: str("category"),
        date_from: str("date_from"),
        date_to: str("date_to"),
        notes: str("notes"),
      };
    });

    const snap = ((order as { package_snapshot?: unknown }).package_snapshot ?? {}) as Record<string, unknown>;
    const rawCfg = (order as { quote_config?: unknown }).quote_config;
    const config = normalizeQuoteConfig(rawCfg);

    const fullName = (order as { full_name?: string | null }).full_name ?? "Cliente";
    return {
      orderNumber:
        (order as { order_number?: string | null }).order_number ??
        orderId.slice(0, 8).toUpperCase(),
      customerFirstName: (fullName.split(" ")[0] ?? "Cliente"),
      totalPrice: Number((order as { total_price?: number | string | null }).total_price ?? 0),
      createdAt: (order as { created_at: string }).created_at,
      tripTitle: (order as { trip_title?: string | null }).trip_title ?? null,
      destination: snap.destination ? String(snap.destination) : null,
      travelers: {
        adults: Number((order as { adults?: number | null }).adults ?? 0),
        children: Number((order as { children?: number | null }).children ?? 0),
      },
      items: publicItems,
      config,
      agency: {
        name: "Via Air",
        email: "comercial@voeair.com",
        phone: "(44) 99951-4838",
        whatsapp: "5544999514838",
      },
    };
  });
