import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export type ImportedFlightSegment = {
  airline?: string;
  airline_iata?: string;
  flight_number?: string;
  from_iata?: string;
  from_city?: string;
  from_airport?: string;
  from_terminal?: string;
  to_iata?: string;
  to_city?: string;
  to_airport?: string;
  to_terminal?: string;
  depart_at?: string;   // "YYYY-MM-DDTHH:mm"
  arrive_at?: string;
  duration?: string;
  layover?: string;
  cabin_class?: string;
  fare_class?: string;
  fare_basis?: string;
  baggage_allowance?: string;
  aircraft?: string;
  status?: string;
};

export type ImportedFlightBlock = {
  direction: "outbound" | "return";
  airline?: string;
  segments: ImportedFlightSegment[];
};

export type ImportedPassenger = {
  full_name: string;
  kind?: "adult" | "child" | "infant";
  ticket_number?: string;
  seat?: string;
  baggage?: string;
  fare?: number;
  taxes?: number;
  total?: number;
};

export type ImportedReservation = {
  supplier_name?: string;
  locator?: string;
  order_number?: string;
  status?: string;
  currency?: string;
  total_fare?: number;
  base_fare?: number;
  taxes?: number;
  fees?: number;
  issued_at?: string;
  passengers: ImportedPassenger[];
  flights: ImportedFlightBlock[];
  notes?: string;
};

export type FlightImportStaging = {
  token: string;
  order_id: string;
  status: "pending" | "ready" | "error" | "consumed";
  airline_hint: string | null;
  source_url: string | null;
  parsed: ImportedReservation | null;
  error: string | null;
  created_at: string;
  updated_at: string;
  expires_at: string;
};

function randomToken(): string {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return "vaimp_" + Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function loadAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/** Cria um token de importação vinculado a um pedido. */
export const createImportToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    orderId: z.string().uuid(),
    airlineHint: z.enum(["latam", "gol", "azul", "any"]),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase
      .rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) throw new Error("Forbidden");

    const admin = await loadAdmin();
    const token = randomToken();
    const { error } = await admin.from("flight_import_staging").insert({
      token,
      order_id: data.orderId,
      airline_hint: data.airlineHint,
      status: "pending",
      created_by: context.userId,
    });
    if (error) throw new Error(error.message);
    return { token };
  });

/** Polling: o admin chama a cada 2s até `status === 'ready'`. */
export const getImportStaging = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ token: z.string().min(10) }).parse(input))
  .handler(async ({ data, context }): Promise<FlightImportStaging | null> => {
    const { data: isAdmin } = await context.supabase
      .rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) throw new Error("Forbidden");

    const admin = await loadAdmin();
    const { data: row, error } = await admin
      .from("flight_import_staging")
      .select("token, order_id, status, airline_hint, source_url, parsed, error, created_at, updated_at, expires_at")
      .eq("token", data.token)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (row as FlightImportStaging | null) ?? null;
  });

/** Marca como consumido depois da confirmação. */
export const consumeImportStaging = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ token: z.string().min(10) }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase
      .rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) throw new Error("Forbidden");
    const admin = await loadAdmin();
    await admin.from("flight_import_staging")
      .update({ status: "consumed", consumed_at: new Date().toISOString() })
      .eq("token", data.token);
    return { ok: true };
  });
