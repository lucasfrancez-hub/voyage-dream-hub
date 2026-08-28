import { createFileRoute } from "@tanstack/react-router";

/** Leitura e gravação do rascunho público do formulário de visto (por token). */
export const Route = createFileRoute("/api/public/visto/$token")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data } = await supabaseAdmin
          .from("visa_requests")
          .select("form_data,status,protocolo,applicant_name")
          .eq("token", params.token)
          .maybeSingle();
        if (!data) return new Response("not found", { status: 404 });
        const row = data as Record<string, any>;
        return Response.json({
          protocolo: row.protocolo,
          status: row.status,
          applicantName: row.applicant_name,
          formData: row.form_data ?? {},
        });
      },
      POST: async ({ params, request }) => {
        const body = (await request.json().catch(() => null)) as { formData?: unknown } | null;
        if (!body || typeof body.formData !== "object" || body.formData === null) {
          return new Response("invalid payload", { status: 400 });
        }
        const raw = JSON.stringify(body.formData);
        if (raw.length > 400_000) return new Response("payload too large", { status: 413 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const fields = (body.formData as Record<string, any>).fields ?? {};
        const pick = (needle: string) => {
          const hit = Object.entries(fields as Record<string, string>).find(
            ([k, v]) => k.split("#")[0] === needle && String(v ?? "").trim() !== "",
          );
          return hit ? String(hit[1]).trim() : null;
        };

        const patch: Record<string, unknown> = {
          form_data: body.formData,
          status: "em_preenchimento",
        };
        const nome = pick("nome_completo");
        if (nome) patch.applicant_name = nome;
        const cpf = pick("cpf");
        if (cpf) patch.applicant_cpf = cpf;
        const email = pick("email");
        if (email) patch.applicant_email = email;
        const tel = pick("celular");
        if (tel) patch.applicant_phone = tel;

        const { error } = await supabaseAdmin
          .from("visa_requests")
          .update(patch as never)
          .eq("token", params.token);
        if (error) return new Response(error.message, { status: 500 });
        return Response.json({ ok: true });
      },
    },
  },
});
