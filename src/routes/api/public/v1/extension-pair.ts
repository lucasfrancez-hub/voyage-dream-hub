/**
 * Pareamento automático da extensão "Via Air Orçamentos".
 *
 * A extensão envia o access token da sessão Supabase do portal (usuário já logado
 * em pedidos.viaair.tur.br) e recebe de volta um token permanente de extensão.
 * Assim o usuário nunca precisa copiar/colar token manualmente.
 */
import { createFileRoute } from "@tanstack/react-router";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
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

export const Route = createFileRoute("/api/public/v1/extension-pair")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),

      POST: async ({ request }) => {
        const accessToken = (request.headers.get("authorization") ?? "")
          .replace(/^Bearer\s+/i, "")
          .trim();
        if (accessToken.length < 20) return json({ error: "unauthorized" }, 401);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: userData, error } = await supabaseAdmin.auth.getUser(accessToken);
        const user = userData?.user;
        if (error || !user) return json({ error: "unauthorized" }, 401);

        // Reaproveita um token já pareado automaticamente para este usuário,
        // se a extensão ainda tiver o segredo; senão cria um novo.
        const bytes = new Uint8Array(32);
        crypto.getRandomValues(bytes);
        const token = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
        const hash = await sha256(token);

        // Mantém no máximo 5 tokens ativos por usuário.
        const { data: ativos } = await supabaseAdmin
          .from("extension_tokens")
          .select("id")
          .eq("user_id", user.id)
          .is("revoked_at", null)
          .order("created_at", { ascending: false });
        const excedentes = (ativos ?? []).slice(4).map((t) => t.id);
        if (excedentes.length) {
          await supabaseAdmin
            .from("extension_tokens")
            .update({ revoked_at: new Date().toISOString() })
            .in("id", excedentes);
        }

        const { error: insertError } = await supabaseAdmin.from("extension_tokens").insert({
          user_id: user.id,
          token_hash: hash,
          label: "Pareamento automático (navegador)",
        });
        if (insertError) return json({ error: "pair_failed" }, 500);

        return json({ token, email: user.email ?? null });
      },
    },
  },
});
