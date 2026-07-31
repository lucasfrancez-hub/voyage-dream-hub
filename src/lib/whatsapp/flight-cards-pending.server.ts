/**
 * Envia as artes de uma cotação de voo que ficou pendente (cotou mas nunca
 * entregou). Usado como rede de segurança pelo watchdog e pelo agente.
 */
export async function sendPendingFlightCards(
  conversationId: string,
  waPhone: string,
  maxAgeMs = 60 * 60 * 1000,
): Promise<{ sent: number; quote_id?: string }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const desde = new Date(Date.now() - maxAgeMs).toISOString();
  const { data: row } = await supabaseAdmin
    .from("wa_flight_quotes")
    .select("id, payload")
    .eq("conversation_id", conversationId)
    .is("cards_sent_at", null)
    .gte("created_at", desde)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const quote = row?.payload as
    | { opcoes?: Array<{ opcao: number; destaque: string }> }
    | null
    | undefined;
  const opcoes = (quote?.opcoes ?? []).slice(0, 4);
  if (!row?.id || !opcoes.length) return { sent: 0 };

  const { buildFlightCardData, renderFlightCardAsset } = await import("./flight-card.server");
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
  for (const arte of artes) {
    if (!arte.asset) continue;
    const caption = `Opção ${arte.op.opcao} — ${arte.op.destaque}`;
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
      }
    } catch {
      /* segue pras próximas */
    }
  }

  if (sent === artes.length && artes.length > 0) {
    await supabaseAdmin
      .from("wa_flight_quotes")
      .update({ cards_sent_at: new Date().toISOString() })
      .eq("conversation_id", conversationId)
      .is("cards_sent_at", null);
  }
  return { sent, quote_id: row.id as string };
}
