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
          .select("target_url, click_count")
          .eq("slug", slug)
          .maybeSingle();

        if (error || !data?.target_url) {
          return new Response("Link não encontrado", {
            status: 404,
            headers: { "cache-control": "no-store" },
          });
        }

        // best-effort click tracking (não bloqueia o redirect)
        void supabaseAdmin
          .from("short_links")
          .update({
            click_count: (data.click_count ?? 0) + 1,
            last_click_at: new Date().toISOString(),
          })
          .eq("slug", slug);

        // métricas detalhadas do clique (região, dispositivo, origem)
        try {
          const { parseUserAgent, geoFromHeaders, hostDoReferrer } = await import(
            "@/lib/analytics/ua.server"
          );
          const userAgent = request.headers.get("user-agent");
          const ua = parseUserAgent(userAgent);
          const geo = geoFromHeaders(request.headers);
          const referrer = request.headers.get("referer");
          void supabaseAdmin.from("short_link_clicks").insert({
            slug,
            referrer,
            referrer_host: hostDoReferrer(referrer),
            country: geo.country,
            region: geo.region,
            city: geo.city,
            device: ua.device,
            browser: ua.browser,
            os: ua.os,
            user_agent: userAgent?.slice(0, 400) ?? null,
          });
        } catch {
          /* métricas nunca bloqueiam o redirect */
        }

        // marca a origem do acesso (?s=slug) para casar clique → navegação
        let destino = data.target_url;
        try {
          const u = new URL(destino);
          if (!u.searchParams.has("s")) u.searchParams.set("s", slug);
          destino = u.toString();
        } catch {
          /* mantém a URL original */
        }

        return new Response(null, {
          status: 302,
          headers: {
            location: destino,
            "cache-control": "no-store",
            "x-robots-tag": "noindex, nofollow",
            "referrer-policy": "no-referrer",
          },
        });
      },
    },
  },
});
