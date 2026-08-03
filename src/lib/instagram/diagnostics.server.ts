import { createHmac, timingSafeEqual } from "crypto";

const GRAPH = "https://graph.instagram.com/v21.0";
const CALLBACK_URL = "https://pedidos.viaair.tur.br/api/public/instagram-webhook";

type MetaError = {
  message?: string;
  type?: string;
  code?: number | string;
  error_subcode?: number | string;
  fbtrace_id?: string;
};

type AccountRow = {
  id: string;
  ig_user_id: string;
  page_id: string | null;
  username: string;
  access_token: string | null;
  active: boolean;
  metadata: Record<string, unknown> | null;
};

function env(name: string) {
  return process.env[name]?.trim() || null;
}

export function instagramVerifyToken() {
  return env("META_IG_VERIFY_TOKEN_V2") ?? env("META_IG_VERIFY_TOKEN") ?? env("WHATSAPP_VERIFY_TOKEN_USER");
}

export function instagramAppSecret() {
  return env("INSTAGRAM_APP_SECRET") ?? env("META_APP_SECRET");
}

export function calculateInstagramSignature(rawBody: string, secret: string) {
  return `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`;
}

export function validateInstagramSignature(rawBody: string, received: string, secret: string) {
  const calculated = calculateInstagramSignature(rawBody, secret);
  const a = Buffer.from(received);
  const b = Buffer.from(calculated);
  return { calculated, valid: a.length === b.length && timingSafeEqual(a, b) };
}

function parseMetaResponse(raw: string) {
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function metaError(body: Record<string, unknown> | null): MetaError | null {
  const value = body?.error;
  return value && typeof value === "object" ? (value as MetaError) : null;
}

async function probe(url: string, token?: string) {
  const started = Date.now();
  try {
    const response = await fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      redirect: "error",
    });
    const raw = await response.text();
    const body = parseMetaResponse(raw);
    return {
      ok: response.ok,
      status: response.status,
      raw,
      body,
      error: metaError(body),
      durationMs: Date.now() - started,
    };
  } catch (error) {
    return {
      ok: false,
      status: null,
      raw: "",
      body: null,
      error: { message: error instanceof Error ? error.message : String(error) },
      durationMs: Date.now() - started,
    };
  }
}

async function logProbe(params: {
  accountId: string;
  operation: string;
  endpoint: string;
  result: Awaited<ReturnType<typeof probe>>;
}) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const error = params.result.error;
  await supabaseAdmin.from("instagram_api_logs").insert({
    account_id: params.accountId,
    operation: params.operation,
    endpoint: params.endpoint,
    method: "GET",
    response_body: params.result.body,
    response_raw: params.result.body ? null : params.result.raw.slice(0, 20_000),
    http_status: params.result.status,
    success: params.result.ok,
    error_message: error?.message ?? null,
    error_code: error?.code != null ? String(error.code) : null,
    error_subcode: error?.error_subcode != null ? String(error.error_subcode) : null,
    fbtrace_id: error?.fbtrace_id ?? null,
    duration_ms: params.result.durationMs,
  });
}

export async function runInstagramHealthCheck(accountId?: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  let query = supabaseAdmin
    .from("instagram_accounts")
    .select("id, ig_user_id, page_id, username, access_token, active, metadata")
    .eq("active", true)
    .order("is_default", { ascending: false });
  if (accountId) query = query.eq("id", accountId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const reports = [];
  for (const account of (data ?? []) as AccountRow[]) {
    const token = account.access_token;
    const identityEndpoint = `${GRAPH}/me?fields=id,username,account_type`;
    const subscriptionEndpoint = `${GRAPH}/${encodeURIComponent(account.ig_user_id)}/subscribed_apps?fields=id,name,subscribed_fields`;
    const identity = token ? await probe(identityEndpoint, token) : null;
    const subscriptions = token ? await probe(subscriptionEndpoint, token) : null;
    if (identity) await logProbe({ accountId: account.id, operation: "health_identity", endpoint: identityEndpoint, result: identity });
    if (subscriptions) await logProbe({ accountId: account.id, operation: "health_subscriptions", endpoint: subscriptionEndpoint, result: subscriptions });

    const subscriptionRows = Array.isArray(subscriptions?.body?.data)
      ? (subscriptions?.body?.data as Array<Record<string, unknown>>)
      : [];
    const subscribedFields = Array.from(
      new Set(subscriptionRows.flatMap((row) => Array.isArray(row.subscribed_fields) ? row.subscribed_fields.filter((v): v is string => typeof v === "string") : [])),
    );
    const subscribed = subscriptions?.ok === true && subscriptionRows.length > 0;
    const messagesSubscribed = subscribedFields.includes("messages");
    const callback = await probe(CALLBACK_URL);
    const webhookReachable = callback.status === 403 || callback.ok;
    const secret = instagramAppSecret();
    const verifyToken = instagramVerifyToken();
    const localPayload = JSON.stringify({ diagnostic: true, at: new Date().toISOString() });
    const localSignature = secret ? validateInstagramSignature(localPayload, calculateInstagramSignature(localPayload, secret), secret).valid : false;
    const identityData = identity?.body && typeof identity.body === "object" ? identity.body : null;
    const connectedId = typeof identityData?.id === "string" ? identityData.id : null;
    const connectedUsername = typeof identityData?.username === "string" ? identityData.username : account.username;
    const accountConnected = identity?.ok === true && (connectedId === account.ig_user_id || connectedId === account.page_id);
    const tokenValid = identity?.ok === true;
    const failures = [
      !tokenValid && "Token inválido ou API indisponível",
      !accountConnected && "A API não confirmou a conta configurada",
      !webhookReachable && "Callback do webhook não respondeu",
      !secret && "APP_SECRET não configurado",
      !verifyToken && "Verify Token não configurado",
      !subscribed && "Conta sem inscrição ativa no webhook",
      subscribed && !messagesSubscribed && "Campo messages não está assinado",
    ].filter((v): v is string => Boolean(v));
    const apiError = identity?.error ?? subscriptions?.error ?? callback.error;
    const lastWebhook = await supabaseAdmin
      .from("instagram_webhook_logs")
      .select("received_at")
      .order("received_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const report = {
      accountId: account.id,
      appId: env("INSTAGRAM_APP_ID") ?? env("META_APP_ID") ?? String(account.metadata?.app_id ?? "") || null,
      igUserId: account.ig_user_id,
      connectedUsername,
      tokenValid,
      accountConnected,
      webhookReachable,
      signatureConfigured: Boolean(secret) && localSignature,
      verifyTokenConfigured: Boolean(verifyToken),
      subscribed,
      subscribedFields,
      messagesSubscribed,
      callbackUrl: CALLBACK_URL,
      httpStatus: identity?.status ?? subscriptions?.status ?? callback.status,
      lastWebhookAt: lastWebhook.data?.received_at ?? null,
      lastError: failures.join(" · ") || apiError?.message || null,
      errorCode: apiError?.code != null ? String(apiError.code) : null,
      errorSubcode: apiError?.error_subcode != null ? String(apiError.error_subcode) : null,
      fbtraceId: apiError?.fbtrace_id ?? null,
      overallStatus: failures.length === 0 ? "healthy" : "failed",
      identity: identity?.body,
      subscriptions: subscriptions?.body,
    };
    await supabaseAdmin.from("instagram_health_checks").insert({
      account_id: account.id,
      overall_status: report.overallStatus,
      token_valid: report.tokenValid,
      account_connected: report.accountConnected,
      webhook_reachable: report.webhookReachable,
      signature_configured: report.signatureConfigured,
      verify_token_configured: report.verifyTokenConfigured,
      subscribed: report.subscribed,
      subscribed_fields: report.subscribedFields,
      messages_subscribed: report.messagesSubscribed,
      app_id: report.appId,
      ig_user_id: report.igUserId,
      connected_username: report.connectedUsername,
      callback_url: report.callbackUrl,
      http_status: report.httpStatus,
      last_webhook_at: report.lastWebhookAt,
      last_error: report.lastError,
      error_code: report.errorCode,
      error_subcode: report.errorSubcode,
      fbtrace_id: report.fbtraceId,
      report,
    });
    reports.push(report);
  }
  return reports;
}

export async function getInstagramDiagnostics() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const [accounts, checks, webhookLogs, apiLogs, received] = await Promise.all([
    supabaseAdmin.from("instagram_accounts").select("id, ig_user_id, page_id, username, display_name, active, is_default, token_expires_at, metadata").order("is_default", { ascending: false }),
    supabaseAdmin.from("instagram_health_checks").select("*").order("checked_at", { ascending: false }).limit(20),
    supabaseAdmin.from("instagram_webhook_logs").select("id, received_at, method, event_object, event_type, account_external_id, conversation_external_id, message_external_id, sender_external_id, validation_status, signature_valid, verify_token_valid, rejection_reason, processing_status, processing_error, response_status, source_ip").order("received_at", { ascending: false }).limit(100),
    supabaseAdmin.from("instagram_api_logs").select("id, operation, endpoint, method, http_status, success, error_message, error_code, error_subcode, fbtrace_id, duration_ms, created_at").order("created_at", { ascending: false }).limit(100),
    supabaseAdmin.from("instagram_messages").select("id, ig_message_id, message_type, direction, created_at, conversation_id, instagram_conversations(contact_ig_id, ig_thread_id)").eq("direction", "inbound").order("created_at", { ascending: false }).limit(50),
  ]);
  for (const result of [accounts, checks, webhookLogs, apiLogs, received]) {
    if (result.error) throw new Error(result.error.message);
  }
  return {
    accounts: accounts.data ?? [],
    checks: checks.data ?? [],
    webhookLogs: webhookLogs.data ?? [],
    apiLogs: apiLogs.data ?? [],
    receivedMessages: received.data ?? [],
    callbackUrl: CALLBACK_URL,
  };
}