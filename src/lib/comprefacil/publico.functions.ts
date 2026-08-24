/**
 * Versões PÚBLICAS (sem login) do motor de pacotes CompreFácil/FRT.
 *
 * Usadas no widget do site (embed) e nas páginas públicas. Devolvem apenas
 * dados de catálogo/tarifa — nada de dado de cliente.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { LocalidadeCF } from "./localidades.functions";

const aereo = z.object({
  origem: z.string().min(3).max(4),
  destino: z.string().min(3).max(4),
  ida: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  volta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  adultos: z.number().int().min(1).max(9),
  criancas: z.number().int().min(0).max(8).optional(),
});

export const buscarAereoCFPublic = createServerFn({ method: "POST" })
  .inputValidator((i: z.input<typeof aereo>) => aereo.parse(i))
  .handler(async ({ data }) => {
    const { buscarAereoDinamicoCF } = await import("./dinamico.server");
    try {
      const ofertas = await buscarAereoDinamicoCF(data);
      return { ok: true as const, ofertas };
    } catch (e) {
      return { ok: false as const, erro: e instanceof Error ? e.message : "Falha na busca aérea", ofertas: [] };
    }
  });

const hosp = z.object({
  cidadeId: z.number().int().positive(),
  checkin: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  checkout: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  adultos: z.number().int().min(1).max(24),
  criancas: z.number().int().min(0).max(20).optional(),
  quartos: z
    .array(
      z.object({
        adultos: z.number().int().min(1).max(6),
        criancas: z.number().int().min(0).max(5),
        bebes: z.number().int().min(0).max(3),
        idades: z.array(z.number().int().min(0).max(17)).max(5),
      }),
    )
    .max(4)
    .optional(),
});

export const buscarHospedagemCFPublic = createServerFn({ method: "POST" })
  .inputValidator((i: z.input<typeof hosp>) => hosp.parse(i))
  .handler(async ({ data }) => {
    const { buscarHotelDinamicoCF } = await import("./dinamico.server");
    try {
      const hoteis = await buscarHotelDinamicoCF(data);
      return { ok: true as const, hoteis };
    } catch (e) {
      return { ok: false as const, erro: e instanceof Error ? e.message : "Falha na busca de hotéis", hoteis: [] };
    }
  });

const loc = z.object({
  termo: z.string().min(2).max(60),
  campo: z.enum(["destino", "saida"]).optional(),
});

/** Autocomplete público de cidades (somente catálogo de destinos). */
export const autocompleteLocalidadeCFPublic = createServerFn({ method: "POST" })
  .inputValidator((i: z.input<typeof loc>) => loc.parse(i))
  .handler(async ({ data }): Promise<LocalidadeCF[]> => {
    const termo = data.termo.trim();
    const campo = data.campo === "saida" ? "cidade_saida" : "cidade";
    const { montarSugestoesCF } = await import("./localidades.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: linhas } = await supabaseAdmin
      .from("comprefacil_pacotes")
      .select(campo === "cidade" ? "cidade, cidade_id" : "cidade_saida")
      .eq("ativo", true)
      .limit(2000);

    return (await montarSugestoesCF((linhas as any[]) ?? [], campo, termo)) as LocalidadeCF[];
  });

