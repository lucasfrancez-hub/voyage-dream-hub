/**
 * Cache CURTO da RENDERIZAÇÃO das artes de voo + pré-aquecimento em paralelo.
 *
 * REGRAS (briefing):
 * - o cache reaproveita SOMENTE a imagem já renderizada. Ele nunca implica que
 *   a tarifa/disponibilidade continuem válidas — quem for comprar passa por
 *   nova consulta ao motor, como sempre;
 * - a assinatura considera TODOS os campos visíveis do cartão (origem, destino,
 *   aeroportos, datas, horários, companhia, número do voo, conexões, bagagem,
 *   valor, parcelamento e passageiros). Mudou qualquer dado → outro card;
 * - TTL curto (6h). Serve para reenvio, reply, duplicidade acidental,
 *   recuperação de worker e nova tentativa após falha de envio;
 * - o pré-aquecimento roda em paralelo à resposta do agente e é CANCELADO se a
 *   cotação for cancelada/substituída ou se o protocolo ativo mudar.
 *
 * SERVER-ONLY.
 */
import type { FlightCardData } from "@/lib/flight-card/card-html";

const BUCKET = "broadcast-media";
const PUBLIC_BASE = "https://pedidos.viaair.tur.br";
/** Validade da arte em cache. Curta de propósito. */
export const CARD_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

export type CardAsset = { bytes: Uint8Array; url: string; filename: string };

/**
 * Assinatura completa da opção: hash do JSON do cartão renderizado, que já
 * contém exatamente os campos visíveis ao cliente.
 */
export async function cardSignature(data: FlightCardData): Promise<string> {
  const json = JSON.stringify(data);
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(json));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Busca a arte já renderizada. Devolve null quando não há cache válido. */
export async function getCachedCard(signature: string): Promise<CardAsset | null> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("wa_flight_card_cache")
      .select("storage_path, public_url, filename, created_at, hits")
      .eq("signature", signature)
      .maybeSingle();
    if (!row) return null;
    const idade = Date.now() - new Date((row as { created_at: string }).created_at).getTime();
    if (idade > CARD_CACHE_TTL_MS) return null;

    const path = (row as { storage_path: string }).storage_path;
    const { data: file, error } = await supabaseAdmin.storage.from(BUCKET).download(path);
    if (error || !file) return null;
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.byteLength < 1000) return null;

    await supabaseAdmin
      .from("wa_flight_card_cache")
      .update({
        hits: ((row as { hits?: number }).hits ?? 0) + 1,
        last_used_at: new Date().toISOString(),
      })
      .eq("signature", signature)
      .then(() => {}, () => {});

    return {
      bytes,
      url: (row as { public_url: string }).public_url,
      filename: (row as { filename: string }).filename,
    };
  } catch {
    return null;
  }
}

/** Registra a arte renderizada no cache (best-effort). */
export async function putCachedCard(
  signature: string,
  asset: CardAsset,
  meta: { quote_id?: string | null; protocolo_id?: string | null; option_index?: number | null } = {},
): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("wa_flight_card_cache").upsert(
      {
        signature,
        storage_path: `flight-cards/${asset.filename}`,
        public_url: asset.url,
        filename: asset.filename,
        quote_id: meta.quote_id ?? null,
        protocolo_id: meta.protocolo_id ?? null,
        option_index: meta.option_index ?? null,
        created_at: new Date().toISOString(),
        last_used_at: new Date().toISOString(),
      } as never,
      { onConflict: "signature" },
    );
  } catch {
    /* cache é auxiliar: nunca bloqueia a entrega */
  }
}

/**
 * Cache-first: devolve a arte do cache ou renderiza dentro do prazo informado.
 * Estourou o prazo → erro, e o chamador manda o fallback em texto na hora.
 */
export async function getOrRenderCard(
  data: FlightCardData,
  opts: {
    softDeadlineMs: number;
    tentativas?: number;
    quote_id?: string | null;
    protocolo_id?: string | null;
    option_index?: number | null;
  },
): Promise<{ asset: CardAsset; from_cache: boolean }> {
  const signature = await cardSignature(data);
  const cached = await getCachedCard(signature);
  if (cached) return { asset: cached, from_cache: true };

  const { renderFlightCardAssetRetry } = await import("./flight-card.server");
  const asset = await renderFlightCardAssetRetry(
    data,
    opts.tentativas ?? 1,
    opts.softDeadlineMs,
  );
  await putCachedCard(signature, asset, {
    quote_id: opts.quote_id,
    protocolo_id: opts.protocolo_id,
    option_index: opts.option_index,
  });
  return { asset, from_cache: false };
}

/**
 * Renderização ANTECIPADA e em PARALELO das opções da cotação, disparada
 * assim que o motor responde — enquanto a IA ainda está escrevendo a resposta.
 * Não envia nada: só popula o cache, para que o envio seja instantâneo.
 *
 * Cancelamento: antes de gravar cada arte confere se a cotação continua ativa
 * (não cancelada) e se o protocolo do atendimento ainda é o mesmo.
 */
export async function prewarmFlightCards(
  quote: unknown,
  opcoes: unknown[],
  ctx: {
    conversation_id: string;
    quote_id: string;
    protocolo_id?: string | null;
    trigger_message_id?: string | null;
    limite?: number;
  },
): Promise<void> {
  const limite = ctx.limite ?? 3;
  const alvo = opcoes.slice(0, limite);
  if (!alvo.length) return;

  const { buildFlightCardData } = await import("./flight-card.server");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const aindaVale = async (): Promise<boolean> => {
    const { data: q } = await supabaseAdmin
      .from("wa_flight_quotes")
      .select("cancelled_at, protocolo_id")
      .eq("id", ctx.quote_id)
      .maybeSingle();
    if (!q || (q as { cancelled_at?: string | null }).cancelled_at) return false;
    const { data: conv } = await supabaseAdmin
      .from("wa_conversations")
      .select("protocolo_ativo_id")
      .eq("id", ctx.conversation_id)
      .maybeSingle();
    const ativo = (conv as { protocolo_ativo_id?: string | null } | null)?.protocolo_ativo_id ?? null;
    const daCotacao = (q as { protocolo_id?: string | null }).protocolo_id ?? null;
    if (daCotacao && ativo && daCotacao !== ativo) return false;
    return true;
  };

  const inicio = Date.now();
  await Promise.allSettled(
    alvo.map(async (op, i) => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data = buildFlightCardData(quote as any, op as any);
        const signature = await cardSignature(data);
        if (await getCachedCard(signature)) return;
        if (!(await aindaVale())) return;

        const { renderFlightCardAssetRetry } = await import("./flight-card.server");
        const asset = await renderFlightCardAssetRetry(data, 2, 26_000);
        if (!(await aindaVale())) return; // pesquisa substituída durante o render
        await putCachedCard(signature, asset, {
          quote_id: ctx.quote_id,
          protocolo_id: ctx.protocolo_id ?? null,
          option_index: i + 1,
        });
        console.log(
          JSON.stringify({
            event: "flight_card_prewarmed",
            conversation_id: ctx.conversation_id,
            quote_id: ctx.quote_id,
            protocolo_id: ctx.protocolo_id ?? null,
            option_index: i + 1,
            trigger_message_id: ctx.trigger_message_id ?? null,
            ms: Date.now() - inicio,
            at: new Date().toISOString(),
          }),
        );
      } catch (e) {
        console.warn("[flight-card-cache] prewarm falhou:", (e as Error)?.message);
      }
    }),
  );
}
