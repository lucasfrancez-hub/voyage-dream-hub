import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type LocalidadeCF = { nome: string; cidadeId: number | null; total: number };

/**
 * Autopreencher de origem/destino do CompreFácil: devolve as cidades do
 * catálogo com o Id oficial da operadora, para a busca filtrar pelo Id certo.
 */
export const autocompleteLocalidadeCF = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { termo: string; campo?: "destino" | "saida" }) => input)
  .handler(async ({ data, context }) => {
    const termo = (data.termo ?? "").trim();
    if (termo.length < 2) return [] as LocalidadeCF[];
    const campo = data.campo === "saida" ? "cidade_saida" : "cidade";

    const { data: linhas, error } = await context.supabase
      .from("comprefacil_pacotes")
      .select(campo === "cidade" ? "cidade, cidade_id" : "cidade_saida")
      .eq("ativo", true)
      .ilike(campo, `%${termo}%`)
      .limit(800);
    if (error) throw new Error(error.message);

    const mapa = new Map<string, LocalidadeCF>();
    for (const l of (linhas as any[]) ?? []) {
      const nome: string | null = campo === "cidade" ? l.cidade : l.cidade_saida;
      if (!nome) continue;
      const chave = nome.toLowerCase();
      const atual = mapa.get(chave);
      if (atual) {
        atual.total += 1;
        if (atual.cidadeId == null && campo === "cidade") atual.cidadeId = l.cidade_id ?? null;
      } else {
        mapa.set(chave, { nome, cidadeId: campo === "cidade" ? (l.cidade_id ?? null) : null, total: 1 });
      }
    }

    const alvo = termo.toLowerCase();
    return [...mapa.values()]
      .sort((a, b) => {
        const pa = a.nome.toLowerCase().startsWith(alvo) ? 0 : 1;
        const pb = b.nome.toLowerCase().startsWith(alvo) ? 0 : 1;
        return pa - pb || b.total - a.total || a.nome.localeCompare(b.nome, "pt-BR");
      })
      .slice(0, 12);
  });
