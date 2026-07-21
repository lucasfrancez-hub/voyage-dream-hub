import { createFileRoute } from "@tanstack/react-router";

// Rota "sem-preview" para colar em WhatsApp.
// - Scrapers de link preview (WhatsApp, Facebook, Twitter, Slack, LinkedIn, Telegram)
//   recebem 404 sem OG tags → nenhum card é gerado no chat.
// - Humanos são redirecionados para /pacotes/<slug>.
export const Route = createFileRoute("/w/$slug")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const ua = (request.headers.get("user-agent") || "").toLowerCase();
        const isPreviewBot =
          ua.includes("whatsapp") ||
          ua.includes("facebookexternalhit") ||
          ua.includes("facebot") ||
          ua.includes("twitterbot") ||
          ua.includes("slackbot") ||
          ua.includes("linkedinbot") ||
          ua.includes("telegrambot") ||
          ua.includes("discordbot") ||
          ua.includes("skypeuripreview") ||
          ua.includes("iframely") ||
          ua.includes("embedly");

        if (isPreviewBot) {
          return new Response("", {
            status: 404,
            headers: {
              "cache-control": "no-store",
              "x-robots-tag": "noindex, nofollow",
            },
          });
        }

        const slug = String(params.slug || "").replace(/[^a-z0-9-]/gi, "");
        const url = new URL(request.url);
        return Response.redirect(`${url.origin}/pacotes/${slug}`, 302);
      },
    },
  },
});
