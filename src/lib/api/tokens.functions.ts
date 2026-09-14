/**
 * Gestão dos tokens da API interna VIA AIR (tela Configurações → API).
 * O token completo só existe uma vez: na criação/rotação. No banco fica
 * apenas o resumo criptográfico, que não permite recuperar o valor.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { API_SCOPES } from "./scopes";

export type ApiClientResumo = {
  id: string;
  name: string;
  clientCode: string;
  environment: string;
  tokenPrefix: string;
  tokenLast4: string;
  scopes: string[];
  active: boolean;
  rateLimitPerMin: number;
  webhookUrl: string | null;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
};

async function exigirAdmin(context: { supabase: unknown; userId: string }) {
  const supabase = context.supabase as {
    rpc: (n: string, a: Record<string, unknown>) => Promise<{ data: unknown }>;
  };
  const { data } = await supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
  if (!data) throw new Error("Apenas administradores podem gerenciar tokens da API.");
}

function mapear(r: Record<string, unknown>): ApiClientResumo {
  return {
    id: String(r["id"]),
    name: String(r["name"]),
    clientCode: String(r["client_code"]),
    environment: String(r["environment"]),
    tokenPrefix: String(r["token_prefix"]),
    tokenLast4: String(r["token_last4"]),
    scopes: (r["scopes"] as string[]) ?? [],
    active: Boolean(r["active"]),
    rateLimitPerMin: Number(r["rate_limit_per_min"] ?? 120),
    webhookUrl: (r["webhook_url"] as string) ?? null,
    lastUsedAt: (r["last_used_at"] as string) ?? null,
    expiresAt: (r["expires_at"] as string) ?? null,
    revokedAt: (r["revoked_at"] as string) ?? null,
    createdAt: String(r["created_at"]),
  };
}

export const listarApiClients = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ApiClientResumo[]> => {
    await exigirAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("api_clients")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return ((data ?? []) as Array<Record<string, unknown>>).map(mapear);
  });

const criarEntrada = z.object({
  name: z.string().trim().min(2).max(80),
  clientCode: z
    .string()
    .trim()
    .min(2)
    .max(40)
    .transform((v) => v.toUpperCase().replace(/[^A-Z0-9_]/g, "_")),
  environment: z.enum(["live", "test"]).default("live"),
  scopes: z.array(z.enum(API_SCOPES)).min(1),
  expiresInDays: z.number().int().min(1).max(3650).nullable().default(null),
  rateLimitPerMin: z.number().int().min(10).max(6000).default(120),
});

export const criarApiClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => criarEntrada.parse(d))
  .handler(async ({ data, context }) => {
    await exigirAdmin(context);
    const { gerarToken } = await import("./auth.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const t = gerarToken(data.environment);
    const { data: row, error } = await supabaseAdmin
      .from("api_clients")
      .insert({
        name: data.name,
        client_code: data.clientCode,
        environment: data.environment,
        token_prefix: t.prefix,
        token_hash: t.hash,
        token_last4: t.last4,
        scopes: data.scopes,
        rate_limit_per_min: data.rateLimitPerMin,
        created_by: context.userId,
        expires_at: data.expiresInDays
          ? new Date(Date.now() + data.expiresInDays * 86_400_000).toISOString()
          : null,
      } as never)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    // O token completo é devolvido UMA única vez.
    return { cliente: mapear(row as Record<string, unknown>), token: t.token };
  });

export const rotacionarApiToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await exigirAdmin(context);
    const { gerarToken } = await import("./auth.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: atual } = await supabaseAdmin
      .from("api_clients")
      .select("environment")
      .eq("id", data.id)
      .maybeSingle();
    const ambiente = ((atual as { environment?: string } | null)?.environment ?? "live") as
      | "live"
      | "test";
    const t = gerarToken(ambiente);
    const { error } = await supabaseAdmin
      .from("api_clients")
      .update({
        token_hash: t.hash,
        token_prefix: t.prefix,
        token_last4: t.last4,
        active: true,
        revoked_at: null,
        updated_at: new Date().toISOString(),
      } as never)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { token: t.token };
  });

export const revogarApiClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await exigirAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("api_clients")
      .update({ active: false, revoked_at: new Date().toISOString() } as never)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

const webhookEntrada = z.object({
  id: z.string().uuid(),
  url: z.string().url().max(500),
  secret: z.string().min(16).max(200),
  events: z.array(z.string().max(60)).max(30).default([]),
});

export const definirWebhookApiClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => webhookEntrada.parse(d))
  .handler(async ({ data, context }) => {
    await exigirAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("api_webhook_endpoints").delete().eq("api_client_id", data.id);
    const { error } = await supabaseAdmin.from("api_webhook_endpoints").insert({
      api_client_id: data.id,
      url: data.url,
      secret: data.secret,
      events: data.events,
      active: true,
    } as never);
    if (error) throw new Error(error.message);
    await supabaseAdmin
      .from("api_clients")
      .update({ webhook_url: data.url, webhook_secret_hint: `••••${data.secret.slice(-4)}` } as never)
      .eq("id", data.id);
    return { ok: true as const };
  });

export const estatisticasApiClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await exigirAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const desde = new Date(Date.now() - 24 * 3600_000).toISOString();
    const { count } = await supabaseAdmin
      .from("api_request_logs")
      .select("id", { count: "exact", head: true })
      .eq("api_client_id", data.id)
      .gte("created_at", desde);
    const { data: ultimos } = await supabaseAdmin
      .from("api_request_logs")
      .select("endpoint,method,status,created_at,duration_ms")
      .eq("api_client_id", data.id)
      .order("created_at", { ascending: false })
      .limit(20);
    return {
      chamadas24h: count ?? 0,
      ultimos: (ultimos ?? []) as Array<{
        endpoint: string;
        method: string;
        status: number;
        created_at: string;
        duration_ms: number | null;
      }>,
    };
  });
