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

        // 1) destino: sempre a sessão ativa do usuário (nunca um cruise_id vindo do navegador)
        const session = await activeSession(supabaseAdmin, auth.userId);
        if (!session) return json({ error: "no_active_import" }, 409);
        if (sentToken && sentToken !== session.token) {
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
