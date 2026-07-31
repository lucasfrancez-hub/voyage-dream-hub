/**
 * Envia as artes de uma cotação de voo que ficou pendente (cotou mas nunca
 * entregou). É o ÚNICO caminho de envio de arte de voo — o agente e o
 * watchdog chamam esta função, nunca renderizam por conta própria.
 *
 * Regras anti-duplicidade:
 * - faz um "claim" atômico da cotação (marca cards_sent_at ANTES de enviar),
 *   então watchdog e agente nunca disparam as mesmas artes em paralelo;
 * - respeita as impressões digitais (sent_fingerprints) já entregues nesta
 *   conversa, então uma opção já enviada nunca é reenviada;
 * - grava a impressão digital LOGO APÓS cada envio (não no fim do laço), então
 *   um timeout no meio do caminho nunca gera arte repetida na próxima rodada;
 * - se nada for enviado, libera o claim pra próxima tentativa.
 *
 * Entrega: no máximo 2 opções, com horários de partida DIFERENTES, uma por
 * minuto — cadência humana e sem pressão no renderizador.
 */
type LegLite = { cia?: string; voo?: string; partida?: string };
type OptLite = {
  opcao: number;
  total?: number;
  ida?: LegLite | null;
  volta?: LegLite | null;
};

const MAX_OPCOES = 2;
const INTERVALO_MS = 60_000; // 1 minuto entre as artes

const fingerprint = (o: OptLite): string =>
  [o.ida?.cia, o.ida?.voo, o.ida?.partida, o.volta?.cia, o.volta?.voo, o.volta?.partida, Math.round(Number(o.total ?? 0))]
    .map((v) => String(v ?? "-"))
    .join("|");

/** Chave de horário: usada pra não mandar duas opções que saem no mesmo horário. */
const horarioIda = (o: OptLite): string => String(o.ida?.partida ?? "").slice(0, 16);

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
  const todas = quote?.opcoes ?? [];
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
  const carregarFps = async (): Promise<Set<string>> => {
    const { data: quotesRecentes } = await supabaseAdmin
      .from("wa_flight_quotes")
      .select("sent_fingerprints")
      .eq("conversation_id", conversationId)
      .gte("created_at", cortaFp)
      .limit(20);
    return new Set<string>(
      (quotesRecentes ?? []).flatMap((q) =>
        Array.isArray((q as { sent_fingerprints?: unknown }).sent_fingerprints)
          ? (q as { sent_fingerprints: unknown[] }).sent_fingerprints.map(String)
          : [],
      ),
    );
  };
  const jaFps = await carregarFps();

  // Filtra o que já foi entregue e escolhe no máximo 2 com HORÁRIOS distintos.
  const candidatas = force ? todas : todas.filter((o) => !jaFps.has(fingerprint(o)));
  const horariosUsados = new Set<string>();
  const opcoes: OptLite[] = [];
  for (const op of candidatas) {
    const h = horarioIda(op);
    if (h && horariosUsados.has(h)) continue;
    horariosUsados.add(h);
    opcoes.push(op);
    if (opcoes.length >= MAX_OPCOES) break;
  }
  if (!opcoes.length) return { sent: 0, quote_id: row.id as string };

  const { buildFlightCardData, renderFlightCardAssetRetry } = await import("./flight-card.server");
  const { buildFlightOptionCaption } = await import("./flight-caption.server");
  const { sendWhatsAppImageBytes, sendWhatsAppBubbles } = await import("./send.server");
  const { saveMessage } = await import("./conversation.server");

  // Nunca mandar arte "do nada": se a IA não avisou nada nos últimos minutos,
  // o próprio sistema manda a transição antes das imagens.
  try {
    const desdeAviso = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { data: ultimas } = await supabaseAdmin
      .from("wa_messages")
      .select("content")
      .eq("conversation_id", conversationId)
      .eq("direction", "outbound")
      .gte("created_at", desdeAviso)
      .order("created_at", { ascending: false })
      .limit(8);
    const jaAvisou = (ultimas ?? []).some((m) =>
      /(pesquis|verific|consult|buscando|já te (mando|trago)|opç)/i.test((m as { content: string | null }).content ?? ""),
    );
    if (!jaAvisou) {
      const aviso = "Já verifiquei aqui com as companhias e vou te mandar as melhores opções agora";
      await saveMessage({
        conversation_id: conversationId,
        direction: "outbound",
        sender: "camila",
        content: aviso,
      });
      await sendWhatsAppBubbles(waPhone, aviso);
    }
  } catch {
    /* aviso é auxiliar: nunca bloqueia o envio das artes */
  }

  let sent = 0;
  let falhou = false;
  const novosFps: string[] = [];

  const persistirFp = async (fp: string) => {
    const atuais = await carregarFps();
    await supabaseAdmin
      .from("wa_flight_quotes")
      .update({ sent_fingerprints: Array.from(new Set([...atuais, ...novosFps, fp])) })
      .eq("id", row.id);
  };

  for (let i = 0; i < opcoes.length; i++) {
    const op = opcoes[i];
    if (i > 0) await new Promise((r) => setTimeout(r, INTERVALO_MS));
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = buildFlightCardData(quote as any, op as any);
      const asset = await renderFlightCardAssetRetry(data);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const caption = buildFlightOptionCaption(quote as any, op as any, jaFps.size + i + 1);
      const r = await sendWhatsAppImageBytes(
        waPhone,
        asset.bytes,
        asset.filename,
        caption,
        asset.url,
      );
      if (!r.error) {
        // Registra no painel MESMO sem id do WhatsApp — antes, quando a API não
        // devolvia id, a arte chegava pro cliente e sumia do nosso chat.
        await saveMessage({
          conversation_id: conversationId,
          direction: "outbound",
          sender: "camila",
          content: `[[media:image|${asset.url}|${asset.filename}]]\n${caption}`,
          wa_message_id: r.id ?? null,
        });
        sent++;
        const fp = fingerprint(op);
        novosFps.push(fp);
        // grava já: se o worker cair aqui, esta opção não volta na próxima rodada
        await persistirFp(fp).catch(() => undefined);
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
      // Se alguma opção não saiu, deixa a cotação pendente pra próxima rodada.
      cards_sent_at: falhou ? null : new Date().toISOString(),
    })
    .eq("id", row.id);

  return { sent, quote_id: row.id as string };
}
