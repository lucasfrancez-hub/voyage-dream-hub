import { createFileRoute } from "@tanstack/react-router";

// Encurtador VIA AIR: /l/<slug> → redireciona pro target_url e incrementa clicks.
export const Route = createFileRoute("/l/$slug")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const slug = String(params.slug || "").toLowerCase();
        if (!/^[a-z0-9-]{1,60}$/.test(slug)) {
          return new Response("Link inválido", { status: 404 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin
          .from("short_links")
          .select("target_url")
          .eq("slug", slug)
          .maybeSingle();

        if (error || !data?.target_url) {
          return new Response("Link não encontrado", {
            status: 404,
            headers: { "cache-control": "no-store" },
          });
        }

        // best-effort click tracking (não bloqueia)
        void supabaseAdmin.rpc("increment_short_link_click", { p_slug: slug }).then(
          async ({ error: rpcErr }: { error: unknown }) => {
            if (!rpcErr) return;
            // fallback: update direto se a RPC não existir
            try {
              const { data: cur } = await supabaseAdmin
                .from("short_links")
                .select("click_count")
                .eq("slug", slug)
                .maybeSingle();
              await supabaseAdmin
                .from("short_links")
                .update({
                  click_count: (cur?.click_count ?? 0) + 1,
                  last_click_at: new Date().toISOString(),
                })
                .eq("slug", slug);
            } catch {
              /* noop */
            }
          },
        );

        const url = new URL(request.url);
        return new Response(null, {
          status: 302,
          headers: {
            location: data.target_url,
            "cache-control": "no-store",
            "x-robots-tag": "noindex, nofollow",
            "referrer-policy": "no-referrer",
            "x-short-origin": url.origin,
          },
        });
      },
    },
  },
});
