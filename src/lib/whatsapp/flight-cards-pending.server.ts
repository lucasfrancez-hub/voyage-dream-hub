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
): Promise<{ sent: number; quote_id?: string }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const desde = new Date(Date.now() - maxAgeMs).toISOString();
  let pendingQuery = supabaseAdmin
    .from("wa_flight_quotes")
    .select("id, payload")
    .eq("conversation_id", conversationId)
    .is("cards_sent_at", null)
    .gte("created_at", desde)
    .order("created_at", { ascending: false })
    .limit(1);
  if (protocolOpenedAt) pendingQuery = pendingQuery.gte("created_at", protocolOpenedAt);
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
  const { data: claimed } = await supabaseAdmin
    .from("wa_flight_quotes")
    .update({ cards_sent_at: new Date().toISOString() })
    .eq("id", row.id)
    .is("cards_sent_at", null)
    .select("id");
  if (!claimed?.length) return { sent: 0, quote_id: row.id as string };

  const liberarClaim = async () => {
    await supabaseAdmin.from("wa_flight_quotes").update({ cards_sent_at: null }).eq("id", row.id);
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
  const opcoes = todas.filter((o) => !jaFps.has(fingerprint(o)));
  if (!opcoes.length) return { sent: 0, quote_id: row.id as string };

  const { buildFlightCardData, renderFlightCardAsset } = await import("./flight-card.server");
  const { buildFlightOptionCaption } = await import("./flight-caption.server");
  const { sendWhatsAppImageBytes } = await import("./send.server");
  const { saveMessage } = await import("./conversation.server");

  const artes = await Promise.all(
    opcoes.map(async (op) => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data = buildFlightCardData(quote as any, op as any);
        return { op, asset: await renderFlightCardAsset(data) };
      } catch {
        return { op, asset: null };
      }
    }),
  );

  let sent = 0;
  const novosFps: string[] = [];
  for (const arte of artes) {
    if (!arte.asset) continue;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const caption = buildFlightOptionCaption(quote as any, arte.op as any);
    try {
      const r = await sendWhatsAppImageBytes(
        waPhone,
        arte.asset.bytes,
        arte.asset.filename,
        caption,
        arte.asset.url,
      );
      if (!r.error && r.id) {
        await saveMessage({
          conversation_id: conversationId,
          direction: "outbound",
          sender: "camila",
          content: `[[media:image|${arte.asset.url}|${arte.asset.filename}]]\n${caption}`,
          wa_message_id: r.id,
        });
        sent++;
        novosFps.push(fingerprint(arte.op));
      }
    } catch {
      /* segue pras próximas */
    }
  }

  if (sent === 0) {
    await liberarClaim();
    return { sent: 0, quote_id: row.id as string };
  }

  await supabaseAdmin
    .from("wa_flight_quotes")
    .update({ sent_fingerprints: Array.from(new Set([...jaFps, ...novosFps])) })
    .eq("id", row.id);

  return { sent, quote_id: row.id as string };
}
