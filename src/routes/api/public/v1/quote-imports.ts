/**
 * API pública autenticada por token da extensão "Via Air Orçamentos".
 * Não depende do portal Via Air estar aberto.
 *
 * POST /api/public/v1/quote-imports  -> cria/reprocessa uma importação
 * GET  /api/public/v1/quote-imports?id=... -> status da importação
 */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
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
  const header = request.headers.get("authorization") ?? "";
  const token = header.replace(/^Bearer\s+/i, "").trim();
  if (!token || token.length < 20) return null;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const hash = await sha256(token);
  const { data } = await supabaseAdmin
    .from("extension_tokens")
    .select("id, user_id, revoked_at")
    .eq("token_hash", hash)
    .maybeSingle();
  if (!data || data.revoked_at) return null;
  await supabaseAdmin
    .from("extension_tokens")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", data.id);
  return { userId: data.user_id };
}

const bodySchema = z.object({
  source: z.string().max(40).optional(),
  sourceUrl: z.string().url().max(2000),
  detectedAt: z.string().max(40).optional().nullable(),
  browserExtension: z.boolean().optional(),
});

export const Route = createFileRoute("/api/public/v1/quote-imports")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),

      GET: async ({ request }) => {
        const auth = await authUser(request);
        if (!auth) return json({ error: "unauthorized" }, 401);
        const id = new URL(request.url).searchParams.get("id");
        if (!id) return json({ error: "missing_id" }, 400);
        const { getImportStatus, processQuoteImport } = await import("@/lib/quotes/import.server");
        let st = await getImportStatus(id);
        if (!st) return json({ error: "not_found" }, 404);
        // retomada: importação travada em PROCESSING há mais de 30s
        if (st.status === "PROCESSING" && Date.now() - new Date(st.updated_at).getTime() > 30_000) {
          await processQuoteImport(id);
          st = await getImportStatus(id);
        }
        return json({
          importId: id,
          status: st?.status ?? "PROCESSING",
          quoteId: st?.quote_id ?? null,
          quote: st?.quote ?? null,
          error: st?.error ?? null,
        });
      },

      POST: async ({ request }) => {
        const auth = await authUser(request);
        if (!auth) return json({ error: "unauthorized" }, 401);

        let parsed;
        try {
          parsed = bodySchema.parse(await request.json());
        } catch {
          return json({ error: "invalid_body" }, 400);
        }

        const { createQuoteImport, processQuoteImport, getImportStatus } = await import(
          "@/lib/quotes/import.server"
        );
        const created = await createQuoteImport({
          sourceUrl: parsed.sourceUrl,
          source: parsed.source ?? "INFOTRAVEL",
          detectedAt: parsed.detectedAt ?? null,
          browserExtension: parsed.browserExtension ?? true,
          userId: auth.userId,
        });
        if (!created.importId) return json({ error: created.error ?? "invalid_url" }, 422);

        // responde rápido: processa com prazo curto e devolve o que houver
        const work = processQuoteImport(created.importId).catch(() => null);
        await Promise.race([work, new Promise((r) => setTimeout(r, 4000))]);
        const st = await getImportStatus(created.importId);

        return json({
          importId: created.importId,
          status: st?.status ?? "PROCESSING",
          duplicate: created.duplicate ?? false,
          quoteId: st?.quote_id ?? null,
          quote: st?.quote ?? null,
        });
      },
    },
  },
});
