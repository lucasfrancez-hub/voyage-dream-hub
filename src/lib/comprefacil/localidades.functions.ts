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

    const { cidadesOficiaisCF, semAcento } = await import("./localidades.server");
    const alvo = semAcento(termo);

    const { data: linhas } = await context.supabase
      .from("comprefacil_pacotes")
      .select(campo === "cidade" ? "cidade, cidade_id" : "cidade_saida")
      .eq("ativo", true)
      .limit(2000);

    const mapa = new Map<string, LocalidadeCF>();
    for (const l of (linhas as any[]) ?? []) {
      const nome: string | null = campo === "cidade" ? l.cidade : l.cidade_saida;
      if (!nome) continue;
      if (!semAcento(nome).includes(alvo)) continue;
      const chave = semAcento(nome);
      const atual = mapa.get(chave);
      if (atual) {
        atual.total += 1;
        if (atual.cidadeId == null && campo === "cidade") atual.cidadeId = l.cidade_id ?? null;
      } else {
        mapa.set(chave, { nome, cidadeId: campo === "cidade" ? (l.cidade_id ?? null) : null, iata: null, total: 1 });
      }
    }

    // Cidades oficiais da operadora (traz Maringá, Paranavaí, etc. mesmo sem pacote no cache)
    try {
      const oficiais = await cidadesOficiaisCF();
      const porIata = alvo.length === 3;
      for (const c of oficiais) {
        const casaIata = porIata && (c.iata ?? "").toLowerCase() === alvo;
        if (!casaIata && !semAcento(c.nome).includes(alvo)) continue;
        const chave = semAcento(c.nome);
        const atual = mapa.get(chave);
        if (atual) {
          if (atual.cidadeId == null) atual.cidadeId = c.id;
          if (!atual.iata) atual.iata = c.iata;
        } else {
          mapa.set(chave, { nome: c.nome, cidadeId: c.id, iata: c.iata, total: 0 });
        }
      }
    } catch (e) {
      console.error("[comprefacil] cidades oficiais indisponíveis:", e instanceof Error ? e.message : e);
    }

    return [...mapa.values()]
      .sort((a, b) => {
        const pa = semAcento(a.nome).startsWith(alvo) ? 0 : 1;
        const pb = semAcento(b.nome).startsWith(alvo) ? 0 : 1;
        return pa - pb || b.total - a.total || a.nome.localeCompare(b.nome, "pt-BR");
      })
      .slice(0, 12);
  });
