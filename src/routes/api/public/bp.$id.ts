import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/bp/$id")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const id = params.id;
        if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
          return new Response("Not found", { status: 404 });
        }
        const url = new URL(request.url);
        const paxParam = url.searchParams.get("pax");
        const paxIndex = paxParam ? Number.parseInt(paxParam, 10) : null;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: ci, error } = await supabaseAdmin
          .from("flight_checkins")
          .select("boarding_pass_path, boarding_passes")
          .eq("id", id)
          .maybeSingle();
        if (error || !ci) {
          return new Response("Not found", { status: 404 });
        }

        let path: string | null = ci.boarding_pass_path ?? null;
        if (paxIndex && Array.isArray(ci.boarding_passes)) {
          const match = (ci.boarding_passes as Array<{ path: string; passenger_index: number }>)
            .find((p) => p.passenger_index === paxIndex);
          if (match?.path) path = match.path;
        }
        if (!path) return new Response("Not found", { status: 404 });

        const dl = await supabaseAdmin.storage
          .from("boarding-passes")
          .download(path);
        if (dl.error || !dl.data) {
          return new Response("Not found", { status: 404 });
        }
        const buf = await dl.data.arrayBuffer();
        const extension = path.split(".").pop()?.toLowerCase();
        const contentType =
          extension === "png"
            ? "image/png"
            : extension === "jpg" || extension === "jpeg"
              ? "image/jpeg"
              : "application/pdf";
        const downloadExtension = extension === "png" || extension === "jpg" || extension === "jpeg" ? extension : "pdf";
        return new Response(buf, {
          status: 200,
          headers: {
            "Content-Type": contentType,
            "Content-Disposition": `attachment; filename="cartao-embarque-${id.slice(0, 8)}${paxIndex ? `-pax${paxIndex}` : ""}.${downloadExtension}"`,
            "Cache-Control": "private, max-age=300",
            "X-Content-Type-Options": "nosniff",
          },
        });
      },
    },
  },
});
