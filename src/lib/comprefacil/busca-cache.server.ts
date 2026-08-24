/**
 * Guarda o JSON bruto que a operadora (CompreFácil/FRT) devolve na busca.
 *
 * A reserva real precisa do objeto original do produto — o motor só guarda a
 * versão mapeada para a tela, então persistimos o bruto por alguns minutos e
 * referenciamos por `buscaToken` + `buscaIndice`.
 */

export type TipoBuscaCF = "aereo" | "hotel" | "servico";

/** Salva os itens brutos e devolve o token para referenciá-los depois. */
export async function guardarBuscaCF(tipo: TipoBuscaCF, itens: unknown[]): Promise<string | null> {
  if (!itens.length) return null;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const token = crypto.randomUUID();
    const { error } = await supabaseAdmin.from("comprefacil_busca_cache").insert({
      token,
      tipo,
      itens: itens as never,
    });
    if (error) return null;
    return token;
  } catch {
    return null;
  }
}

/** Recupera um item bruto guardado na busca. */
export async function itemBrutoCF(
  token: string,
  tipo: TipoBuscaCF,
  indice: number,
): Promise<any | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("comprefacil_busca_cache")
    .select("itens")
    .eq("token", token)
    .eq("tipo", tipo)
    .maybeSingle();
  const itens = (data?.itens ?? null) as any[] | null;
  if (!Array.isArray(itens)) return null;
  return itens[indice] ?? null;
}
