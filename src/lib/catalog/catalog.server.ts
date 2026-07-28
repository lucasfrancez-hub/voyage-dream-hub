/** Helpers do importador de catálogo (servidor). */
import type { SupabaseClient } from "@supabase/supabase-js";

export function randomToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return "vacat_" + Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function ensureAdmin(ctx: { supabase: any; userId: string }) {
  const { data } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" });
  if (!data) throw new Error("Forbidden: apenas admin");
}

export async function loadAdminClient() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as SupabaseClient;
}
