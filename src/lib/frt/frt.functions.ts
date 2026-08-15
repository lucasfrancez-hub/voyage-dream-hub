import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const searchSchema = z.object({
  origem: z.string().min(2).max(60),
  destino: z.string().min(2).max(60),
  ida: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  volta: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .nullable(),
  adultos: z.number().int().min(1).max(9).optional(),
  criancas: z.number().int().min(0).max(9).optional(),
  pais: z.string().max(60).optional(),
  companhia: z.string().max(60).optional(),
});

/** Consulta read-only na FRT/Infotravel. Nunca reserva nem adiciona ao carrinho. */
export const consultarFrt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => searchSchema.parse(input))
  .handler(async ({ data }) => {
    const { consultarFRT } = await import("@/lib/frt/frt-connector.server");
    return consultarFRT(data);
  });

/** Diagnóstico da conexão (login + campos do formulário), sem pesquisar. */
export const diagnosticarFrt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { frtDiagnostico } = await import("@/lib/frt/frt-connector.server");
    return frtDiagnostico();
  });
