/**
 * Registro manual de token 2FA (quando o código chega no celular de alguém
 * da equipe e não na caixa automática).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const registrarCodigoManual = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        provider: z.string().min(1).default("generico"),
        codigo: z
          .string()
          .trim()
          .min(4)
          .max(10)
          .regex(/^[A-Za-z0-9]+$/, "Use apenas números ou letras."),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { data: admin, error } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (error) throw new Error(error.message);
    if (!admin) throw new Error("Sem permissão");

    const { registrarCodigoMensagem } = await import("./inbox.server");
    const r = await registrarCodigoMensagem({
      source: "manual",
      texto: "código informado pela equipe",
      provider: data.provider,
      code: data.codigo,
      sender: "equipe",
    });
    return { ok: r.ok, fornecedor: r.provider };
  });
