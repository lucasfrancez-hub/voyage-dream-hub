import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/wa-debug")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const key = url.searchParams.get("k");
        if (key !== "diag-viair-2026") {
          return new Response("nope", { status: 403 });
        }
        const action = url.searchParams.get("action") ?? "list";
        const waba = process.env.WHATSAPP_WABA_ID!;
        const token = process.env.WHATSAPP_ACCESS_TOKEN!;

        if (action === "subscribe") {
          const r = await fetch(
            `https://graph.facebook.com/v21.0/${waba}/subscribed_apps`,
            { method: "POST", headers: { Authorization: `Bearer ${token}` } }
          );
          return Response.json({ status: r.status, body: await r.json() });
        }

        const r = await fetch(
          `https://graph.facebook.com/v21.0/${waba}/subscribed_apps?access_token=${encodeURIComponent(token)}`
        );
        return Response.json({ status: r.status, body: await r.json() });
      },
    },
  },
});

