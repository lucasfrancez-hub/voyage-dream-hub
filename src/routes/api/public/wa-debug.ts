import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/wa-debug")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const key = url.searchParams.get("k");
        if (key !== process.env.WHATSAPP_VERIFY_TOKEN_USER) {
          return new Response("nope", { status: 403 });
        }
        const waba = process.env.WHATSAPP_WABA_ID;
        const token = process.env.WHATSAPP_ACCESS_TOKEN;
        const appId = process.env.META_APP_ID;
        if (!waba || !token) {
          return Response.json({ error: "missing envs", waba: !!waba, token: !!token });
        }
        const r = await fetch(
          `https://graph.facebook.com/v21.0/${waba}/subscribed_apps?access_token=${encodeURIComponent(token)}`
        );
        const body = await r.json();
        return Response.json({ status: r.status, appId, waba, subscribed_apps: body });
      },
    },
  },
});
