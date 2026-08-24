/** Serviços adicionais do motor de pacotes (versões admin e pública). */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const entrada = z.object({
  cidadeId: z.number().int().positive(),
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  adultos: z.number().int().min(1).max(24),
  idades: z.array(z.number().int().min(0).max(17)).max(20).optional(),
  destino: z.string().max(120).nullish(),
});

async function executar(data: z.infer<typeof entrada>) {
  const { buscarServicosDestinoCF } = await import("./servicos.server");
  try {
    const servicos = await buscarServicosDestinoCF(data);
    return { ok: true as const, servicos };
  } catch (e) {
    return {
      ok: false as const,
      erro: e instanceof Error ? e.message : "Falha ao buscar serviços",
      servicos: [],
    };
  }
}

export const buscarServicosCF = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: z.input<typeof entrada>) => entrada.parse(i))
  .handler(async ({ data }) => executar(data));

export const buscarServicosCFPublic = createServerFn({ method: "POST" })
  .inputValidator((i: z.input<typeof entrada>) => entrada.parse(i))
  .handler(async ({ data }) => executar(data));
