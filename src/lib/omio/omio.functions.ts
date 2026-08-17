import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const omioAutocomplete = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ termo: z.string().min(2).max(60), locale: z.string().max(10).optional() }).parse(input),
  )
  .handler(async ({ data }) => {
    const { omioSugerir } = await import("@/lib/omio/connector.server");
    return { opcoes: await omioSugerir(data.termo, data.locale ?? "en") };
  });

export const omioPesquisar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        origemId: z.string().min(1).max(40),
        destinoId: z.string().min(1).max(40),
        data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        adultos: z.number().int().min(1).max(9).optional(),
        modo: z.enum(["train", "bus", "flight"]).optional(),
        moeda: z.string().min(3).max(3).optional(),
        locale: z.string().max(10).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { omioBuscar } = await import("@/lib/omio/connector.server");
    return omioBuscar(data);
  });

export const omioDetalhe = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        searchId: z.string().min(1).max(80),
        journeyId: z.string().min(1).max(120),
        legId: z.string().min(1).max(120),
        modo: z.enum(["train", "bus", "flight"]).optional(),
        locale: z.string().max(10).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { omioDetalhar } = await import("@/lib/omio/connector.server");
    const r = await omioDetalhar(data);
    return { ...r, bruto: undefined };
  });
