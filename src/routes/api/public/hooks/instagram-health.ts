import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/instagram-health")({
  server: {
    handlers: {
      POST: async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const recent = await supabaseAdmin
          .from("instagram_health_checks")
          .select("checked_at")
          .order("checked_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (recent.data?.checked_at && Date.now() - new Date(recent.data.checked_at).getTime() < 4 * 60_000) {
          return Response.json({ ok: true, skipped: "Verificação recente" });
        }
        const { runInstagramHealthCheck } = await import("@/lib/instagram/diagnostics.server");
        try {
          const reports = await runInstagramHealthCheck();
          return Response.json({ ok: reports.every((item) => item.overallStatus === "healthy"), reports });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.error("[instagram-health]", message);
          return Response.json({ ok: false, error: message }, { status: 500 });
        }
      },
    },
  },
});