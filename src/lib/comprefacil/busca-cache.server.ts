/**
 * Guarda o JSON bruto que a operadora (CompreFácil/FRT) devolve na busca.
 *
 * A reserva real precisa do objeto original do produto — o motor só guarda a
 * versão mapeada para a tela, então persistimos o bruto por alguns minutos e
 * referenciamos por `buscaToken` + `buscaIndice`.
 *
 * O JSON bruto da hotelaria chega a dezenas de MB. Gravar isso puro no banco
 * custava ~20 s por busca (era o maior gargalo do motor). Agora ele vai
 * compactado em gzip/base64 e a gravação acontece em segundo plano: a busca
 * devolve o token na hora e a leitura espera o registro aparecer, se preciso.
 */

export type TipoBuscaCF = "aereo" | "hotel" | "servico";

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** JSON → gzip → base64 (formato gravado na coluna `itens`). */
async function compactar(valor: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(valor));
  const fluxo = new Blob([bytes]).stream().pipeThrough(new CompressionStream("gzip"));
  const buffer = await new Response(fluxo).arrayBuffer();
  let binario = "";
  const vista = new Uint8Array(buffer);
  const passo = 0x8000;
  for (let i = 0; i < vista.length; i += passo) {
    binario += String.fromCharCode(...vista.subarray(i, i + passo));
  }
  return btoa(binario);
}

/** base64 → gunzip → JSON. */
async function descompactar(base64: string): Promise<unknown> {
  const binario = atob(base64);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  const fluxo = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  return JSON.parse(await new Response(fluxo).text());
}

/**
 * Salva os itens brutos e devolve o token para referenciá-los depois.
 * A gravação é aguardada: no runtime serverless o trabalho que sobra depois
 * da resposta é descartado, e sem o registro a reserva acusava "busca
 * expirada". Compactado, o insert leva menos de 1 s.
 */
export async function guardarBuscaCF(tipo: TipoBuscaCF, itens: unknown[]): Promise<string | null> {
  if (!itens.length) return null;
  const token = crypto.randomUUID();
  try {
    const { supabaseAdmin } = (await import("@/integrations/supabase/client.server")) as any;
    const { error } = await supabaseAdmin.from("comprefacil_busca_cache").insert({
      token,
      tipo,
      itens: { gz: await compactar(itens) } as never,
    });
    if (error) {
      console.error("[comprefacil] cache da busca falhou:", error.message);
      return null;
    }
  } catch (e) {
    console.error("[comprefacil] cache da busca falhou:", e instanceof Error ? e.message : e);
    return null;
  }
  return token;
}


/** Recupera um item bruto guardado na busca. */
export async function itemBrutoCF(
  token: string,
  tipo: TipoBuscaCF,
  indice: number,
): Promise<any | null> {
  const { supabaseAdmin } = (await import("@/integrations/supabase/client.server")) as any;
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    const { data } = await supabaseAdmin
      .from("comprefacil_busca_cache")
      .select("itens")
      .eq("token", token)
      .eq("tipo", tipo)
      .maybeSingle();

    const bruto = data?.itens ?? null;
    if (bruto) {
      // Registros antigos ficaram gravados como array puro.
      const itens = (Array.isArray(bruto) ? bruto : await descompactar(bruto.gz)) as any[];
      if (!Array.isArray(itens)) return null;
      return itens[indice] ?? null;
    }
    // A gravação roda em segundo plano: dá um tempo para ela concluir.
    await espera(800);
  }
  return null;
}
