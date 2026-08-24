import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type LocalidadeCF = { nome: string; cidadeId: number | null; iata: string | null; total: number };

/**
 * Autopreencher de origem/destino do CompreFácil: junta as cidades do catálogo
 * já importado com a lista oficial de cidades da operadora (Id certo), para
 * que qualquer cidade atendida apareça mesmo sem pacote no cache.
 */
export const autocompleteLocalidadeCF = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { termo: string; campo?: "destino" | "saida" }) => input)
  .handler(async ({ data, context }) => {
    const termo = (data.termo ?? "").trim();
    if (termo.length < 2) return [] as LocalidadeCF[];
    const campo = data.campo === "saida" ? "cidade_saida" : "cidade";

    const { montarSugestoesCF } = await import("./localidades.server");

    const { data: linhas } = await context.supabase
      .from("comprefacil_pacotes")
      .select(campo === "cidade" ? "cidade, cidade_id" : "cidade_saida")
      .eq("ativo", true)
      .limit(2000);

    return (await montarSugestoesCF((linhas as any[]) ?? [], campo, termo)) as LocalidadeCF[];
  });
