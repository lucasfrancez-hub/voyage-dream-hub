/**
 * Recebe os eventos de uso do site (pageview, clique, tempo, saída).
 * Público por natureza: grava só dados anônimos de navegação.
 */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const eventoSchema = z.object({
  session_id: z.string().min(6).max(80),
  visitor_id: z.string().max(80).nullish(),
  event_type: z.enum(["pageview", "click", "heartbeat", "session_end"]),
  path: z.string().max(300).nullish(),
  title: z.string().max(200).nullish(),
  referrer: z.string().max(500).nullish(),
  entry: z.boolean().optional(),
  utm_source: z.string().max(120).nullish(),
  utm_medium: z.string().max(120).nullish(),
  utm_campaign: z.string().max(120).nullish(),
  short_slug: z.string().max(60).nullish(),
  duration_ms: z.number().int().min(0).max(24 * 60 * 60 * 1000).nullish(),
  target_label: z.string().max(160).nullish(),
  meta: z.record(z.string(), z.unknown()).nullish(),
});

export const Route = createFileRoute("/api/public/analytics-collect")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = await request.json().catch(() => null);
          const parsed = eventoSchema.safeParse(body);
          if (!parsed.success) return new Response("ignored", { status: 202 });
          const e = parsed.data;

          const { parseUserAgent, geoFromHeaders, hostDoReferrer } = await import(
            "@/lib/analytics/ua.server"
          );
          const ua = parseUserAgent(request.headers.get("user-agent"));
          const geo = geoFromHeaders(request.headers);

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          await supabaseAdmin.from("site_events").insert({
            session_id: e.session_id,
            visitor_id: e.visitor_id ?? null,
            event_type: e.event_type,
            path: e.path ?? null,
            title: e.title ?? null,
            referrer: e.referrer ?? null,
            referrer_host: hostDoReferrer(e.referrer),
            entry: e.entry ?? false,
            utm_source: e.utm_source ?? null,
            utm_medium: e.utm_medium ?? null,
            utm_campaign: e.utm_campaign ?? null,
            short_slug: e.short_slug ?? null,
            country: geo.country,
            region: geo.region,
            city: geo.city,
            device: ua.device,
            browser: ua.browser,
            os: ua.os,
            duration_ms: e.duration_ms ?? null,
            target_label: e.target_label ?? null,
            meta: (e.meta ?? null) as never,
          });

          return new Response("ok", { status: 202, headers: { "cache-control": "no-store" } });
        } catch {
          return new Response("ok", { status: 202 });
        }
      },
    },
  },
});
