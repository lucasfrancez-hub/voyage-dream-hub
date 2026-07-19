import { createFileRoute } from "@tanstack/react-router";

// Diagnóstico rápido do WhatsApp. Protegido por ?key=<META_APP_SECRET>.
export const Route = createFileRoute("/api/public/wa-diag")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const key = url.searchParams.get("key");
        if (!key || key !== process.env.META_APP_SECRET) {
          return new Response("forbidden", { status: 403 });
        }
        const t = process.env.WHATSAPP_ACCESS_TOKEN!;
        const waba = process.env.WHATSAPP_WABA_ID!;
        const phone = process.env.WHATSAPP_PHONE_NUMBER_ID!;
        const V = "v21.0";
        const j = async (u: string) => {
          const r = await fetch(u, { headers: { Authorization: `Bearer ${t}` } });
          const txt = await r.text();
          try { return { status: r.status, body: JSON.parse(txt) }; }
          catch { return { status: r.status, body: txt }; }
        };
        const out = {
          subscribed_apps: await j(`https://graph.facebook.com/${V}/${waba}/subscribed_apps`),
          phone: await j(`https://graph.facebook.com/${V}/${phone}?fields=display_phone_number,verified_name,quality_rating,messaging_limit_tier,name_status,code_verification_status,throughput`),
          waba: await j(`https://graph.facebook.com/${V}/${waba}?fields=name,business_verification_status,account_review_status,message_template_namespace`),
        };
        return Response.json(out);
      },
    },
  },
});
