import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/_ph-diag")({
  server: {
    handlers: {
      GET: async () => {
        const { passhubPing } = await import("@/lib/passhub/client.server");
        return Response.json(await passhubPing());
      },
    },
  },
});
