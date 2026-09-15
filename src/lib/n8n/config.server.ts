/**
 * Configuração e assinatura da ponte Lovable ↔ n8n. SERVER-ONLY.
 *
 * Feature flag: enquanto N8N_AGENT_ENABLED não for "true", nada é enviado ao
 * n8n e o runAgent atual continua sendo o único cérebro do atendimento.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export function n8nWebhookUrl(): string | null {
  const url = (process.env["N8N_AGENT_WEBHOOK_URL"] ?? "").trim();
  return url.startsWith("https://") ? url : null;
}

export function n8nSecret(): string | null {
  const s = (process.env["N8N_AGENT_SECRET"] ?? "").trim();
  return s.length >= 16 ? s : null;
}

/** Só true com flag ligada, URL https e segredo configurado. */
export function isN8nAgentEnabled(): boolean {
  return (process.env["N8N_AGENT_ENABLED"] ?? "false").trim().toLowerCase() === "true"
    && !!n8nWebhookUrl()
    && !!n8nSecret();
}

/** Assinatura HMAC-SHA256 de `${timestamp}.${body}`. */
export function signPayload(body: string, timestamp: string, secret: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * Verifica a assinatura de um callback do n8n. Rejeita janela maior que 5min
 * (proteção contra replay).
 */
export function verifyCallbackSignature(args: {
  body: string;
  signature: string | null;
  timestamp: string | null;
}): { ok: true } | { ok: false; reason: string } {
  const secret = n8nSecret();
  if (!secret) return { ok: false, reason: "secret_not_configured" };
  if (!args.signature || !args.timestamp) return { ok: false, reason: "missing_signature" };
  const ts = Number(args.timestamp);
  if (!Number.isFinite(ts)) return { ok: false, reason: "invalid_timestamp" };
  const idadeMs = Math.abs(Date.now() - (ts > 1e12 ? ts : ts * 1000));
  if (idadeMs > 5 * 60_000) return { ok: false, reason: "timestamp_expired" };
  const esperado = signPayload(args.body, args.timestamp, secret);
  if (!safeEqual(args.signature.trim().toLowerCase(), esperado)) {
    return { ok: false, reason: "invalid_signature" };
  }
  return { ok: true };
}
