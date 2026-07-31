/**
 * Envia as artes de uma cotação de voo que ficou pendente (cotou mas nunca
 * entregou). Usado como rede de segurança pelo watchdog e pelo agente.
 *
 * Regras anti-duplicidade:
 * - faz um "claim" atômico da cotação (marca cards_sent_at ANTES de enviar),
 *   então watchdog e agente nunca disparam as mesmas artes em paralelo;
 * - respeita as impressões digitais (sent_fingerprints) já entregues nesta
 *   conversa, então uma opção já enviada nunca é reenviada;
 * - se nada for enviado, libera o claim pra próxima tentativa.
 */
type LegLite = { cia?: string; voo?: string; partida?: string };
type OptLite = {
  opcao: number;
  total?: number;
  ida?: LegLite | null;
  volta?: LegLite | null;
};

const fingerprint = (o: OptLite): string =>
  [o.ida?.cia, o.ida?.voo, o.ida?.partida, o.volta?.cia, o.volta?.voo, o.volta?.partida, Math.round(Number(o.total ?? 0))]
    .map((v) => String(v ?? "-"))
    .join("|");

export async function sendPendingFlightCards(
  conversationId: string,
  waPhone: string,
  maxAgeMs = 60 * 60 * 1000,
  protocolOpenedAt?: string | null,
  protocolId?: string | null,
  /** true = reenvio pedido pelo cliente ("não recebi"): ignora claim e fingerprints. */
  force = false,
): Promise<{ sent: number; quote_id?: string }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const desde = new Date(Date.now() - maxAgeMs).toISOString();
  let pendingQuery = supabaseAdmin
    .from("wa_flight_quotes")
    .select("id, payload, protocolo_id")
    .eq("conversation_id", conversationId)
    .gte("created_at", desde)
    .order("created_at", { ascending: false })
    .limit(1);
  if (!force) pendingQuery = pendingQuery.is("cards_sent_at", null);
  if (protocolOpenedAt) pendingQuery = pendingQuery.gte("created_at", protocolOpenedAt);
  if (protocolId) pendingQuery = pendingQuery.eq("protocolo_id", protocolId);
  const { data: row } = await pendingQuery.maybeSingle();

  const quote = row?.payload as
    | {
        origem_iata: string;
        destino_iata: string;
        origem_nome: string;
        destino_nome: string;
        opcoes?: OptLite[];
      }
    | null
    | undefined;
  const todas = (quote?.opcoes ?? []).slice(0, 4);
  if (!row?.id || !quote || !todas.length) return { sent: 0 };

  // ---- claim atômico: quem conseguir marcar cards_sent_at é quem envia ----
  let claimQuery = supabaseAdmin
    .from("wa_flight_quotes")
    .update({ cards_sent_at: new Date().toISOString() })
    .eq("id", row.id)
    .is("cards_sent_at", null);
  if (protocolId) claimQuery = claimQuery.eq("protocolo_id", protocolId);
  if (!force) {
    const { data: claimed } = await claimQuery.select("id");
    if (!claimed?.length) return { sent: 0, quote_id: row.id as string };
  }

  const liberarClaim = async () => {
    let releaseQuery = supabaseAdmin.from("wa_flight_quotes").update({ cards_sent_at: null }).eq("id", row.id);
    if (protocolId) releaseQuery = releaseQuery.eq("protocolo_id", protocolId);
    await releaseQuery;
  };

  // ---- fingerprints já entregues nesta conversa (últimas 24h / protocolo) --
  const desdeFp = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const cortaFp = protocolOpenedAt && protocolOpenedAt > desdeFp ? protocolOpenedAt : desdeFp;
  const { data: quotesRecentes } = await supabaseAdmin
    .from("wa_flight_quotes")
    .select("sent_fingerprints")
    .eq("conversation_id", conversationId)
    .gte("created_at", cortaFp)
    .limit(20);
  const jaFps = new Set<string>(
    (quotesRecentes ?? []).flatMap((q) =>
      Array.isArray((q as { sent_fingerprints?: unknown }).sent_fingerprints)
        ? (q as { sent_fingerprints: unknown[] }).sent_fingerprints.map(String)
        : [],
    ),
  );
  const opcoes = force ? todas : todas.filter((o) => !jaFps.has(fingerprint(o)));
  if (!opcoes.length) return { sent: 0, quote_id: row.id as string };

  const { buildFlightCardData, renderFlightCardAssetRetry } = await import("./flight-card.server");
  const { buildFlightOptionCaption } = await import("./flight-caption.server");
  const { sendWhatsAppImageBytes } = await import("./send.server");
  const { saveMessage } = await import("./conversation.server");

  let sent = 0;
  let falhou = false;
  const novosFps: string[] = [];
  const INTERVALO_MS = 12_000; // uma opção por vez, intervalo curto (< 1 min)

  for (let i = 0; i < opcoes.length; i++) {
    const op = opcoes[i];
    if (i > 0) await new Promise((r) => setTimeout(r, INTERVALO_MS));
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = buildFlightCardData(quote as any, op as any);
      const asset = await renderFlightCardAssetRetry(data);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const caption = buildFlightOptionCaption(quote as any, op as any);
      const r = await sendWhatsAppImageBytes(
        waPhone,
        asset.bytes,
        asset.filename,
        caption,
        asset.url,
      );
      if (!r.error && r.id) {
        await saveMessage({
          conversation_id: conversationId,
          direction: "outbound",
          sender: "camila",
          content: `[[media:image|${asset.url}|${asset.filename}]]\n${caption}`,
          wa_message_id: r.id,
        });
        sent++;
        novosFps.push(fingerprint(op));
      } else {
        falhou = true;
      }
    } catch {
      falhou = true;
    }
  }

  if (sent === 0) {
    await liberarClaim();
    return { sent: 0, quote_id: row.id as string };
  }

  await supabaseAdmin
    .from("wa_flight_quotes")
    .update({
      sent_fingerprints: Array.from(new Set([...jaFps, ...novosFps])),
      // Se alguma opção não saiu, deixa a cotação pendente pra próxima rodada.
      cards_sent_at: falhou ? null : new Date().toISOString(),
    })
    .eq("id", row.id);

  return { sent, quote_id: row.id as string };
}
