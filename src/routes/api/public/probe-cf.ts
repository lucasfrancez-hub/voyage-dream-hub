import { createFileRoute } from "@tanstack/react-router";

const SEGREDO = "vA9-probe-2026-tmp";

export const Route = createFileRoute("/api/public/probe-cf")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (request.headers.get("x-probe") !== SEGREDO) return new Response("no", { status: 401 });
        const alvos = (await request.json()) as Array<{
          base: string;
          path: string;
          method?: string;
          body?: unknown;
        }>;
        const { chamarCompreFacil, COMPREFACIL_BASES } = await import("@/lib/comprefacil/auth.server");
        const out: unknown[] = [];
        for (const a of alvos) {
          try {
            const base = (COMPREFACIL_BASES as Record<string, string>)[a.base] ?? a.base;
            const r = await chamarCompreFacil(a.path, {
              base,
              method: a.method ?? "GET",
              body: a.body,
            });
            out.push({ ...a, status: r.status, amostra: JSON.stringify(r.dados).slice(0, 1200) });
          } catch (e) {
            out.push({ ...a, erro: e instanceof Error ? e.message : String(e) });
          }
        }
        return Response.json(out);
      },
    },
  },
});
