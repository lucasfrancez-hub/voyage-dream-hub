import { createFileRoute } from "@tanstack/react-router";

/**
 * Cron: comentários de publicações em colaboração (collab).
 * A Meta não envia webhook de comentário para o perfil coautor, então aqui
 * varremos as publicações marcadas e trazemos o que faltou para o chat.
 */
export const Route = createFileRoute("/api/public/hooks/instagram-collab-comments")({
  server: {
    handlers: {
      POST: async () => {
        try {
          const { syncCollabComments } = await import("@/lib/instagram/collab-comments.server");
          const resultado = await syncCollabComments();
          return Response.json({ ok: true, ...resultado });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.error("[instagram-collab-comments]", message);
          return Response.json({ ok: false, error: message }, { status: 500 });
        }
      },
    },
  },
});
