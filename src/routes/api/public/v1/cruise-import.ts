/**
 * API do plugin "Exportar Cruzeiro".
 *
 * GET  /api/public/v1/cruise-import        -> cruzeiro com importação ativa do usuário
 * POST /api/public/v1/cruise-import        -> envia uma captura (snapshot) para esse cruzeiro
 *
 * Autenticação: token permanente da extensão (mesmo pareamento de /v1/extension-pair).
 */
import { createFileRoute } from "@tanstack/react-router";
import { snapshotPayloadSchema } from "@/lib/cruises/snapshot-schema";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type",
};


function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...CORS },
  });
}

async function sha256(v: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(v));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function authUser(request: Request): Promise<{ userId: string } | null> {
  const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (token.length < 20) return null;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("extension_tokens")
    .select("id, user_id, revoked_at")
    .eq("token_hash", await sha256(token))
    .maybeSingle();
  if (!data || data.revoked_at) return null;
  await supabaseAdmin
    .from("extension_tokens")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", data.id);
  return { userId: data.user_id };
}

async function isAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.rpc("has_role", { _user_id: userId, _role: "admin" });
  return Boolean(data);
}

type Admin = Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"];

async function activeSession(admin: Admin, userId: string) {
  const { data } = await admin
    .from("cruise_import_sessions")
    .select(
      "id, token, source, snapshots_count, last_capture_at, cruise:cruises(id, code, name, departure_date, ship_name, operator, source)",
    )
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();
  return data ?? null;
}

function randomToken(len = 4) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => alphabet[b % alphabet.length]).join("");
}

const isoDate = (v?: string | null) => {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const br = s.match(/^(\d{2})[/-](\d{2})[/-](\d{4})$/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null;
};

/**
 * A captura já traz nome, data e navio: quando não existe importação ativa,
 * o cruzeiro é criado (ou reaproveitado) automaticamente a partir do snapshot.
 */
async function ensureSessionFromSnapshot(
  admin: Admin,
  userId: string,
  payload: { source: string; url: string; data: { cruise?: Record<string, unknown>; ship?: Record<string, unknown> } },
) {
  const c = (payload.data.cruise ?? {}) as Record<string, string | number | null | undefined>;
  const shipName =
    String(c.ship_name ?? "").trim() ||
    String((payload.data.ship ?? {}).name ?? "").trim();
  const departure = isoDate(String(c.departure_date ?? ""));
  const name =
    String(c.name ?? "").trim() ||
    [shipName, departure ? departure.split("-").reverse().join("/") : ""].filter(Boolean).join(" — ") ||
    "Cruzeiro importado";

  let query = admin
    .from("cruises")
    .select("id, code, source, name, departure_date, ship_name")
    .eq("source", payload.source)
    .ilike("name", name)
    .limit(1);
  query = departure ? query.eq("departure_date", departure) : query.is("departure_date", null);
  const { data: found } = await query.maybeSingle();

  let cruise = found ?? null;
  let created = false;

  if (!cruise) {
    const { data: inserted, error } = await admin
      .from("cruises")
      .insert({
        name,
        departure_date: departure,
        return_date: isoDate(String(c.return_date ?? "")),
        nights: typeof c.nights === "number" ? c.nights : null,
        ship_name: shipName,
        embark_port: String(c.embark_port ?? "").trim(),
        disembark_port: String(c.disembark_port ?? "").trim(),
        currency: String(c.currency ?? "BRL").trim() || "BRL",
        source: payload.source,
        created_by: userId,
      })
      .select("id, code, source, name, departure_date, ship_name")
      .maybeSingle();
    if (error || !inserted) throw new Error(error?.message ?? "cruise_create_failed");
    cruise = inserted;
    created = true;
  }

  const { error: sessionError } = await admin.from("cruise_import_sessions").insert({
    cruise_id: cruise.id,
    user_id: userId,
    token: `${cruise.code ?? "CRZ"}-${randomToken()}`,
    status: "active",
    source: payload.source,
  });
  if (sessionError) throw new Error(sessionError.message);

  await admin.from("cruise_import_logs").insert({
    cruise_id: cruise.id,
    user_id: userId,
    level: "info",
    message: created
      ? `Cruzeiro criado automaticamente pela captura: ${cruise.name}`
      : `Importação reativada automaticamente pela captura: ${cruise.name}`,
    data: { url: payload.url } as never,
  });

  const session = await activeSession(admin, userId);
  return { session, autoCreated: created, cruiseName: cruise.name as string };
}


export const Route = createFileRoute("/api/public/v1/cruise-import")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),

      /** Finalizar a importação direto da página da operadora. */
      DELETE: async ({ request }) => {
        const auth = await authUser(request);
        if (!auth) return json({ error: "unauthorized" }, 401);
        if (!(await isAdmin(auth.userId))) return json({ error: "forbidden" }, 403);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const session = await activeSession(supabaseAdmin, auth.userId);
        if (!session) return json({ error: "no_active_import" }, 409);

        await supabaseAdmin
          .from("cruise_import_sessions")
          .update({ status: "finished", finished_at: new Date().toISOString() })
          .eq("id", session.id);

        const cruiseId = (session.cruise as { id: string } | null)?.id;
        if (cruiseId) {
          await supabaseAdmin.from("cruise_import_logs").insert({
            cruise_id: cruiseId,
            snapshot_id: null,

            user_id: auth.userId,
            level: "info",
            message: `Importação finalizada pelo plugin com ${session.snapshots_count ?? 0} captura(s)`,
          });
        }
        return json({ ok: true, captures: session.snapshots_count ?? 0 });
      },


      GET: async ({ request }) => {
        const auth = await authUser(request);
        if (!auth) return json({ error: "unauthorized" }, 401);
        if (!(await isAdmin(auth.userId))) return json({ error: "forbidden" }, 403);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const session = await activeSession(supabaseAdmin, auth.userId);
        const { data: domains } = await supabaseAdmin
          .from("cruise_import_domains")
          .select("domain, source")
          .eq("enabled", true);

        if (!session) return json({ active: false, domains: domains ?? [] });
        return json({
          active: true,
          session: {
            id: session.id,
            token: session.token,
            source: session.source,
            captures: session.snapshots_count,
            last_capture_at: session.last_capture_at,
          },
          cruise: session.cruise,
          domains: domains ?? [],
        });
      },

      POST: async ({ request }) => {
        const auth = await authUser(request);
        if (!auth) return json({ error: "unauthorized" }, 401);
        if (!(await isAdmin(auth.userId))) return json({ error: "forbidden" }, 403);

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return json({ error: "invalid_json" }, 400);
        }
        const parsed = snapshotPayloadSchema.safeParse(body);
        if (!parsed.success) {
          return json({ error: "invalid_body", issues: parsed.error.issues.slice(0, 5) }, 422);
        }
        const payload = parsed.data;
        const sentToken = String((body as { session_token?: string }).session_token ?? "").trim();

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // 1) destino: sessão ativa do usuário (nunca um cruise_id vindo do navegador)
        let session = await activeSession(supabaseAdmin, auth.userId);
        if (session && sentToken && sentToken !== session.token) {
          return json({ error: "session_changed", session_token: session.token }, 409);
        }

        // 2) domínio autorizado
        let host = "";
        try {
          host = new URL(payload.url).hostname.toLowerCase();
        } catch {
          host = "";
        }
        const { data: domains } = await supabaseAdmin
          .from("cruise_import_domains")
          .select("domain")
          .eq("enabled", true);
        const allowed = (domains ?? []).some(
          (d) => host === d.domain.toLowerCase() || host.endsWith(`.${d.domain.toLowerCase()}`),
        );
        if (!allowed) return json({ error: "domain_not_allowed", host }, 403);

        // 2b) sem importação ativa: cria/reaproveita o cruzeiro a partir da própria captura
        let autoCreated = false;
        if (!session) {
          try {
            const result = await ensureSessionFromSnapshot(supabaseAdmin, auth.userId, payload);
            session = result.session;
            autoCreated = result.autoCreated;
          } catch (e) {
            return json({ error: "auto_create_failed", detail: e instanceof Error ? e.message : String(e) }, 500);
          }
          if (!session) return json({ error: "no_active_import" }, 409);
        }

        const cruiseId = (session.cruise as { id: string } | null)?.id;
        if (!cruiseId) return json({ error: "cruise_missing" }, 409);


        // 3) grava o snapshot bruto (nunca destruído)
        const seq = (session.snapshots_count ?? 0) + 1;
        const { data: snap, error: snapError } = await supabaseAdmin
          .from("cruise_import_snapshots")
          .insert({
            session_id: session.id,
            cruise_id: cruiseId,
            user_id: auth.userId,
            seq,
            source: payload.source,
            url: payload.url,
            page_type: payload.page_type,
            detected: payload.detected as never,
            summary: payload.detected.join(" + ") || payload.page_type,
            payload: payload as never,
            captured_at: payload.captured_at ?? new Date().toISOString(),
            status: "processando",
          })
          .select("id")
          .maybeSingle();
        if (snapError || !snap) return json({ error: "snapshot_failed" }, 500);

        await supabaseAdmin
          .from("cruise_import_sessions")
          .update({ snapshots_count: seq, last_capture_at: new Date().toISOString() })
          .eq("id", session.id);

        // 4) consolida
        try {
          const { consolidateSnapshot } = await import("@/lib/cruises/consolidate.server");
          const stats = await consolidateSnapshot({
            admin: supabaseAdmin,
            cruiseId,
            snapshotId: snap.id,
            data: payload.data,
          });
          await supabaseAdmin
            .from("cruise_import_snapshots")
            .update({
              status: "processado",
              stats,
              normalized: payload.data as never,
              processed_at: new Date().toISOString(),
            })
            .eq("id", snap.id);
          await supabaseAdmin.from("cruise_import_logs").insert({
            cruise_id: cruiseId,
            snapshot_id: snap.id,
            user_id: auth.userId,
            level: "info",
            message: `Captura #${String(seq).padStart(2, "0")} processada`,
            data: { url: payload.url, page_type: payload.page_type, stats } as never,
          });
          return json({ ok: true, snapshot_id: snap.id, capture: seq, stats });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          await supabaseAdmin
            .from("cruise_import_snapshots")
            .update({ status: "falhou", error: msg })
            .eq("id", snap.id);
          await supabaseAdmin.from("cruise_import_logs").insert({
            cruise_id: cruiseId,
            snapshot_id: snap.id,
            user_id: auth.userId,
            level: "error",
            message: `Falha ao processar captura #${seq}: ${msg}`,
          });
          return json({ ok: false, snapshot_id: snap.id, capture: seq, error: msg }, 200);
        }
      },
    },
  },
});
