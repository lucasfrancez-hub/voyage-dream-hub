/**
 * CACHE PERSISTENTE DO MELHORES DESTINOS.
 *
 * A camada em memória (`melhores-destinos.server.ts`) morre a cada invocação
 * do worker. Quando a fonte bloqueia (403 predominante), o radar ficava sem
 * absolutamente nada — mesmo tendo dados bons coletados minutos antes pela
 * tela Passagens Baratas.
 *
 * Aqui guardamos no banco toda resposta boa da fonte. Assim:
 *  - Passagens Baratas e Promoções de Aéreo compartilham a MESMA coleta;
 *  - quando a fonte está fora, o radar usa o que já foi salvo (sem inventar);
 *  - nenhuma requisição extra é feita para "vencer" o bloqueio.
 */

const TABELA = "md_response_cache";

/** Hash estável e curto da URL (chave primária do cache). */
export function urlHash(url: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < url.length; i++) {
    const c = url.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
    h2 = Math.imul(h2 + c, 2246822519) >>> 0;
  }
  return `${h1.toString(36)}${h2.toString(36)}-${url.length.toString(36)}`;
}

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export type MdCacheEntry = { value: unknown; at: number };

/** Lê o último conteúdo salvo para a URL (mesmo vencido — quem decide é o chamador). */
export async function readMdCache(url: string): Promise<MdCacheEntry | null> {
  try {
    const db = await admin();
    const { data } = await db
      .from(TABELA)
      .select("payload, fetched_at")
      .eq("url_hash", urlHash(url))
      .maybeSingle();
    if (!data) return null;
    const row = data as { payload: unknown; fetched_at: string };
    return { value: row.payload, at: new Date(row.fetched_at).getTime() };
  } catch (e) {
    console.warn("[md-cache] leitura falhou", e instanceof Error ? e.message : e);
    return null;
  }
}

/** Guarda uma resposta boa. Falha de gravação nunca derruba a coleta. */
export async function writeMdCache(url: string, value: unknown): Promise<void> {
  try {
    const db = await admin();
    await db
      .from(TABELA)
      .upsert(
        {
          url_hash: urlHash(url),
          url,
          payload: value as never,
          fetched_at: new Date().toISOString(),
        } as never,
        { onConflict: "url_hash" },
      );
  } catch (e) {
    console.warn("[md-cache] gravação falhou", e instanceof Error ? e.message : e);
  }
}

/** Limpeza: o cache só serve como rede de segurança recente. */
export async function purgeMdCache(maxAgeMs = 7 * 24 * 60 * 60 * 1000): Promise<number> {
  try {
    const db = await admin();
    const { data } = await db
      .from(TABELA)
      .delete()
      .lt("fetched_at", new Date(Date.now() - maxAgeMs).toISOString())
      .select("url_hash");
    return (data as unknown[] | null)?.length ?? 0;
  } catch {
    return 0;
  }
}
