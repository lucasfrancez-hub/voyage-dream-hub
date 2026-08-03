import { createFileRoute } from "@tanstack/react-router";

/**
 * Sincronização automática das agendas (Google / Titan / iCloud via CalDAV).
 * Roda a cada 5 minutos via pg_cron para os compromissos aparecerem sozinhos,
 * sem ninguém precisar clicar em "Sincronizar".
 */
export const Route = createFileRoute("/api/public/hooks/sync-calendars")({
  server: {
    handlers: {
      POST: async () => {
        const { sincronizar } = await import("@/lib/whatsapp/calendar.server");
        try {
          const r = await sincronizar(120);
          console.log(`[agenda] sync automático: ${r.total} evento(s)`, r.erro ?? "");
          return Response.json({ ok: !r.erro, ...r });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          console.error("[agenda] falha no sync automático:", msg);
          return Response.json({ ok: false, error: msg }, { status: 500 });
        }
      },
    },
  },
});
