/**
 * Avisos da VIA AIR para quem consome a API (hoje: Sky Hub).
 * O evento é sempre gravado antes de ser enviado; a entrega é repetida
 * com intervalos crescentes até dar certo. SERVER-ONLY.
 */
import { createHmac } from "node:crypto";

export type ApiWebhookEvent =
  | "checkout.updated"
  | "customer.payment.paid"
  | "customer.payment.failed"
  | "supplier.payment.pending"
  | "supplier.payment.paid"
  | "supplier.payment.failed"
  | "order.created"
  | "order.locator.received"
  | "order.ticket.received"
  | "order.completed"
  | "order.failed"
  | "checkout.session.required"
  | "checkout.session.restored"
  | "checkout.session.failed";

/** Espera entre tentativas: 1min, 5min, 15min, 1h, 6h, 24h. */
const ESPERAS_MIN = [1, 5, 15, 60, 360, 1440];

async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/** Enfileira um evento para todos os destinos ativos. Nunca lança. */
export async function enfileirarEvento(event: ApiWebhookEvent, payload: Record<string, unknown>) {
  try {
    const supabase = await db();
    // Multitrecho: quando a reserva pertence a um grupo, o aviso leva groupId e sequence.
    let corpo = payload;
    try {
      const { contextoDeGrupo } = await import("./multicity.server");
      const grupo = await contextoDeGrupo({
        orderId: payload["orderId"],
        checkoutId: payload["checkoutId"],
      });
      if (grupo) corpo = { ...payload, groupId: grupo.groupId, sequence: grupo.sequence };
    } catch {
      /* sem grupo: segue o aviso normal */
    }
    const { data } = await supabase
      .from("api_webhook_endpoints")
      .select("api_client_id,events,active")
      .eq("active", true);
    const destinos = (data ?? []) as Array<{ api_client_id: string; events: string[] }>;
    const linhas = destinos
      .filter((d) => d.events.length === 0 || d.events.includes(event))
      .map((d) => ({
        api_client_id: d.api_client_id,
        event,
        payload: corpo as never,
      }));
    if (linhas.length) await supabase.from("api_webhook_events").insert(linhas as never);
  } catch {
    /* aviso nunca derruba o fluxo principal */
  }
}

export function assinar(secret: string, timestamp: string, body: string): string {
  return `sha256=${createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")}`;
}

/** Envia os eventos pendentes que já chegaram na hora. */
export async function despacharPendentes(limite = 25): Promise<{ enviados: number; falhas: number }> {
  const supabase = await db();
  const agora = new Date().toISOString();
  const { data } = await supabase
    .from("api_webhook_events")
    .select("id,api_client_id,event,payload,attempts")
    .eq("status", "pending")
    .lte("next_attempt_at", agora)
    .order("created_at", { ascending: true })
    .limit(limite);

  const eventos = (data ?? []) as Array<{
    id: string;
    api_client_id: string;
    event: string;
    payload: Record<string, unknown>;
    attempts: number;
  }>;
  let enviados = 0;
  let falhas = 0;

  for (const ev of eventos) {
    const { data: dest } = await supabase
      .from("api_webhook_endpoints")
      .select("url,secret,active")
      .eq("api_client_id", ev.api_client_id)
      .eq("active", true)
      .maybeSingle();
    const destino = dest as { url: string; secret: string } | null;
    const tentativa = ev.attempts + 1;

    if (!destino) {
      await supabase
        .from("api_webhook_events")
        .update({ status: "skipped", last_error: "Nenhum destino ativo" } as never)
        .eq("id", ev.id);
      continue;
    }

    const body = JSON.stringify({
      id: ev.id,
      event: ev.event,
      createdAt: new Date().toISOString(),
      data: ev.payload,
    });
    const timestamp = String(Math.floor(Date.now() / 1000));
    const inicio = Date.now();
    let status = 0;
    let erro: string | null = null;
    try {
      const res = await fetch(destino.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-viaair-signature": assinar(destino.secret, timestamp, body),
          "x-viaair-timestamp": timestamp,
          "x-viaair-event": ev.event,
        },
        body,
        signal: AbortSignal.timeout(20_000),
      });
      status = res.status;
      if (!res.ok) erro = `HTTP ${res.status}`;
    } catch (e) {
      erro = e instanceof Error ? e.message : String(e);
    }

    await supabase.from("api_webhook_attempts").insert({
      event_id: ev.id,
      attempt: tentativa,
      status,
      error: erro?.slice(0, 300) ?? null,
      duration_ms: Date.now() - inicio,
    } as never);

    if (!erro) {
      enviados += 1;
      await supabase
        .from("api_webhook_events")
        .update({
          status: "delivered",
          attempts: tentativa,
          delivered_at: new Date().toISOString(),
          last_error: null,
        } as never)
        .eq("id", ev.id);
    } else {
      falhas += 1;
      const espera = ESPERAS_MIN[Math.min(tentativa - 1, ESPERAS_MIN.length - 1)]!;
      const esgotou = tentativa >= ESPERAS_MIN.length;
      await supabase
        .from("api_webhook_events")
        .update({
          status: esgotou ? "failed" : "pending",
          attempts: tentativa,
          next_attempt_at: new Date(Date.now() + espera * 60_000).toISOString(),
          last_error: erro.slice(0, 300),
        } as never)
        .eq("id", ev.id);
    }
  }
  return { enviados, falhas };
}
