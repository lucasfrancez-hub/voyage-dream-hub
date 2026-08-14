/**
 * Guarda das sessões autenticadas da Expedia TAAP.
 *
 * Nunca guardamos usuário/senha. Guardamos apenas o estado de sessão
 * (cookies + localStorage) capturado depois de um login manual feito por um
 * administrador, criptografado em AES-256-GCM antes de tocar o banco.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { encryptCardNumber, decryptCardNumber } from "@/lib/card-crypto.server";
import type { HotelSearchStatus } from "@/lib/hotels/types";

export type ExpediaCookie = {
  name: string;
  value: string;
  domain: string;
  path?: string;
  expires?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: string;
};

export type ExpediaSessionRow = {
  id: string;
  label: string;
  account_email: string | null;
  status: string;
  last_validated_at: string | null;
  created_at: string;
};

export type ExpediaSessionState = {
  id: string;
  label: string;
  cookies: ExpediaCookie[];
  storage: Record<string, string>;
};

const RELEVANT_DOMAINS = ["expedia.", "expediapartnercentral.", "orbitz.", "travelscape."];

/** Mantém só os cookies dos domínios da Expedia — reduz superfície do que é salvo. */
export function filterExpediaCookies(cookies: ExpediaCookie[]): ExpediaCookie[] {
  return cookies.filter((c) => RELEVANT_DOMAINS.some((d) => (c.domain || "").includes(d)));
}

export async function listExpediaSessions(): Promise<ExpediaSessionRow[]> {
  const { data, error } = await supabaseAdmin
    .from("expedia_sessions")
    .select("id,label,account_email,status,last_validated_at,created_at")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as ExpediaSessionRow[];
}

export async function saveExpediaSession(input: {
  label: string;
  accountEmail: string | null;
  cookies: ExpediaCookie[];
  storage: Record<string, string>;
  userId: string | null;
}): Promise<{ id: string; cookieCount: number }> {
  const cookies = filterExpediaCookies(input.cookies);
  if (!cookies.length) {
    throw new Error("Nenhum cookie da Expedia foi capturado — confirme que o login foi concluído.");
  }
  // Sessões antigas saem de circulação: só uma conectada por vez.
  await supabaseAdmin
    .from("expedia_sessions")
    .update({ status: "REPLACED" })
    .eq("status", "CONNECTED");

  const { data, error } = await supabaseAdmin
    .from("expedia_sessions")
    .insert({
      label: input.label || "Expedia TAAP",
      account_email: input.accountEmail,
      cookies_encrypted: encryptCardNumber(JSON.stringify(cookies)),
      storage_encrypted: encryptCardNumber(JSON.stringify(input.storage ?? {})),
      status: "CONNECTED",
      last_validated_at: new Date().toISOString(),
      created_by: input.userId,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return { id: data.id, cookieCount: cookies.length };
}

export async function getActiveExpediaSession(): Promise<ExpediaSessionState | null> {
  const { data, error } = await supabaseAdmin
    .from("expedia_sessions")
    .select("id,label,cookies_encrypted,storage_encrypted")
    .eq("status", "CONNECTED")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data?.cookies_encrypted) return null;
  try {
    return {
      id: data.id,
      label: data.label,
      cookies: JSON.parse(decryptCardNumber(data.cookies_encrypted)) as ExpediaCookie[],
      storage: data.storage_encrypted
        ? (JSON.parse(decryptCardNumber(data.storage_encrypted)) as Record<string, string>)
        : {},
    };
  } catch {
    return null;
  }
}

export async function markExpediaSession(id: string, status: string) {
  await supabaseAdmin
    .from("expedia_sessions")
    .update({ status, last_validated_at: new Date().toISOString() })
    .eq("id", id);
}

export async function deleteExpediaSession(id: string) {
  const { error } = await supabaseAdmin.from("expedia_sessions").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function logExpediaSearch(entry: {
  sessionId: string | null;
  searchType: string;
  params: Record<string, unknown>;
  url: string | null;
  status: HotelSearchStatus;
  durationMs: number;
  resultsCount: number;
  sourceLevel: string | null;
  parserErrors?: string[] | null;
}) {
  await supabaseAdmin
    .from("expedia_search_logs")
    .insert({
      session_id: entry.sessionId,
      search_type: entry.searchType,
      params: entry.params as never,
      url: entry.url,
      status: entry.status,
      duration_ms: entry.durationMs,
      results_count: entry.resultsCount,
      source_level: entry.sourceLevel,
      parser_errors: entry.parserErrors?.length ? entry.parserErrors : null,
    })
    .then(
      () => undefined,
      () => undefined,
    );
}

export async function listExpediaSearchLogs(limit = 30) {
  const { data, error } = await supabaseAdmin
    .from("expedia_search_logs")
    .select("id,search_type,params,status,duration_ms,results_count,source_level,created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return data ?? [];
}
