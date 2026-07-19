import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/doc/$id")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const id = params.id;
        if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
          return new Response("Not found", { status: 404 });
        }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: ci, error } = await supabaseAdmin
          .from("flight_checkins")
          .select("boarding_pass_path")
          .eq("id", id)
          .maybeSingle();
        if (error || !ci?.boarding_pass_path) {
          return new Response("Not found", { status: 404 });
        }
        const dl = await supabaseAdmin.storage
          .from("boarding-passes")
          .download(ci.boarding_pass_path);
        if (dl.error || !dl.data) {
          return new Response("Not found", { status: 404 });
        }
        const buf = await dl.data.arrayBuffer();
        return new Response(buf, {
          status: 200,
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": `inline; filename="cartao-embarque-${id.slice(0, 8)}.pdf"`,
            "Cache-Control": "private, max-age=300",
          },
        });
      },
    },
  },
});
