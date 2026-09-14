/**
 * GET /api/public/internal/v1/airports/search?query=&isDeparture=
 */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { withApi, ok, fail } from "@/lib/api/auth.server";
import { failFromError } from "@/lib/api/respond";

const entrada = z.object({
  query: z.string().trim().min(2).max(60),
  isDeparture: z.boolean().default(true),
});

export const Route = createFileRoute("/api/public/internal/v1/airports/search")({
  server: {
    handlers: {
      GET: async ({ request }) =>
        withApi(request, "flights:read", async (ctx) => {
          const url = new URL(request.url);
          const parsed = entrada.safeParse({
            query: url.searchParams.get("query") ?? "",
            isDeparture: url.searchParams.get("isDeparture") !== "false",
          });
          if (!parsed.success) {
            return fail("invalid_request", "Informe ao menos 2 letras em 'query'.", ctx.correlationId);
          }
          try {
            const { searchAirports } = await import("@/lib/onertravel.server");
            const lista = await searchAirports(parsed.data);
            return ok({ airports: lista }, ctx.correlationId);
          } catch (e) {
            return failFromError(e, ctx.correlationId);
          }
        }),
    },
  },
});
