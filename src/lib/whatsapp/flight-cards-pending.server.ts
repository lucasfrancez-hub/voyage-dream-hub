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
 * Entrega em ETAPAS (uma arte por rodada): cada chamada renderiza e envia UMA
 * opção e devolve o controle. O cron (watchdog, 1x/min) chama de novo pra
 * mandar a próxima. Assim o worker nunca fica dormindo 60s e a numeração das
 * opções mantém a ordem encontrada, sem rótulo numérico na legenda.
 */
type LegLite = { cia?: string; voo?: string; partida?: string };
type OptLite = {
  opcao: number;
  total?: number;
  ida?: LegLite | null;
  volta?: LegLite | null;
};

const MAX_OPCOES = 2; // por cotação, salvo pedido explícito de mais horários
const INTERVALO_MS = 30_000; // 2ª arte fica elegível 30s depois da 1ª; o envio
// ocorre na próxima execução do cron (1x/min), então na prática o cliente recebe
// a segunda opção normalmente entre 30 e 90 segundos.
const CLAIM_TRAVADO_MS = 90_000; // claim preso (worker caiu no render) → destrava


const fingerprint = (o: OptLite): string =>
  [o.ida?.cia, o.ida?.voo, o.ida?.partida, o.volta?.cia, o.volta?.voo, o.volta?.partida, Math.round(Number(o.total ?? 0))]
    .map((v) => String(v ?? "-"))
    .join("|");

/**
 * Momento do último card realmente registrado na conversa. É usado somente
 * para manter o intervalo entre as duas artes, sem depender da legenda.
 */
async function ultimoEnvio(
  conversationId: string,
  desde: string,
): Promise<{ ultimoEm: number | null }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("wa_messages")
    .select("content, created_at")
    .eq("conversation_id", conversationId)
    .eq("direction", "outbound")
    .gte("created_at", desde)
    .order("created_at", { ascending: false })
    .limit(40);
  let ultimoEm: number | null = null;
  for (const m of (data ?? []) as { content: string | null; created_at: string }[]) {
    if (!/\[\[media:image/i.test(m.content ?? "")) continue;
    const t = new Date(m.created_at).getTime();
    if (ultimoEm === null || t > ultimoEm) ultimoEm = t;
  }
  return { ultimoEm };
}

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
    .select(
      "id, payload, protocolo_id, sent_fingerprints, cards_sent_at, agent_slug, agent_name, cancelled_at",
    )
    .eq("conversation_id", conversationId)
    .gte("created_at", desde)
    .order("created_at", { ascending: false })
    .limit(6);
  if (protocolOpenedAt) pendingQuery = pendingQuery.gte("created_at", protocolOpenedAt);
  if (protocolId) pendingQuery = pendingQuery.eq("protocolo_id", protocolId);
  const { data: rows } = await pendingQuery;

  const contaFps = (r: { sent_fingerprints?: unknown }) =>
    Array.isArray(r.sent_fingerprints) ? r.sent_fingerprints.length : 0;

  // Uma cotação está disponível quando ainda não foi reivindicada OU quando o
  // claim ficou preso (worker caiu no meio do render): claim antigo + artes
  // incompletas = destrava e tenta de novo, senão o cliente nunca recebe nada.
  // Cotação cancelada (o cliente já escolheu uma opção) nunca volta pra fila.
  const disponivel = (r: {
    cards_sent_at?: string | null;
    sent_fingerprints?: unknown;
    cancelled_at?: string | null;
  }) => {
    if (r.cancelled_at) return false;
    if (force) return true;
    if (!r.cards_sent_at) return true;
    const idade = Date.now() - new Date(r.cards_sent_at).getTime();
    return idade > CLAIM_TRAVADO_MS && contaFps(r) < MAX_OPCOES;
  };

  const quotesRecentes = (rows ?? []) as Array<{
    id: string;
    payload: unknown;
    protocolo_id: string | null;
    sent_fingerprints?: unknown;
    cards_sent_at?: string | null;
    agent_slug?: string | null;
    agent_name?: string | null;
    cancelled_at?: string | null;
  }>;
  // Só a cotação mais recente do protocolo pode avançar. As duplicadas antigas
  // ficam definitivamente fora da fila; do contrário, após concluir a atual o
  // cron voltaria nelas e repetiria os mesmos voos. A criação de novas cópias
  // da busca é bloqueada em `cotar_aereo`, que reaproveita a atual incompleta.
  const maisRecente = quotesRecentes[0];
  const row = maisRecente && disponivel(maisRecente) ? maisRecente : undefined;
  /** Autor real da pesquisa — preservado mesmo quando quem dispara é o cron. */
  const autor = { slug: row?.agent_slug ?? null, nome: row?.agent_name ?? null };

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

  // ---- espaçamento entre as duas artes ----
  const desdeNum = protocolOpenedAt ?? new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { ultimoEm } = await ultimoEnvio(conversationId, desdeNum);
  if (!force && ultimoEm && Date.now() - ultimoEm < INTERVALO_MS) {
    return { sent: 0, quote_id: row.id as string };
  }
  // Elegível agora: a partir daqui só falta o claim e o render.
  const elegivelEm = new Date().toISOString();

  // ---- claim atômico: quem conseguir marcar cards_sent_at é quem envia ----
  const claimAnterior = row.cards_sent_at ?? null;
  let claimQuery = supabaseAdmin
    .from("wa_flight_quotes")
    .update({ cards_sent_at: new Date().toISOString() })
    .eq("id", row.id);
  claimQuery = claimAnterior
    ? claimQuery.eq("cards_sent_at", claimAnterior)
    : claimQuery.is("cards_sent_at", null);
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

  // ETAPA ATUAL: quantas artes desta cotação já saíram e qual o próximo número.
  const fpsDaCotacao = new Set<string>(
    Array.isArray((row as { sent_fingerprints?: unknown }).sent_fingerprints)
      ? ((row as { sent_fingerprints: unknown[] }).sent_fingerprints as unknown[]).map(String)
      : [],
  );
  const restante = force ? MAX_OPCOES : MAX_OPCOES - fpsDaCotacao.size;
  if (restante <= 0) {
    await supabaseAdmin
      .from("wa_flight_quotes")
      .update({ cards_sent_at: new Date().toISOString() })
      .eq("id", row.id);
    return { sent: 0, quote_id: row.id as string };
  }

  // Horários já mostrados (nesta cotação) pra não repetir a mesma partida.
  const horariosUsados = new Set<string>(
    todas.filter((o) => jaFps.has(fingerprint(o))).map((o) => horarioIda(o)).filter(Boolean),
  );
  const candidatas = force ? todas : todas.filter((o) => !jaFps.has(fingerprint(o)));
  // UMA opção por rodada: renderiza, envia e devolve o controle. O cron chama
  // de novo no minuto seguinte pra mandar a próxima.
  const proxima = candidatas.find((o) => {
    const h = horarioIda(o);
    return !h || !horariosUsados.has(h);
  });
  const opcoes: OptLite[] = proxima ? [proxima] : [];
  if (!opcoes.length) {
    await supabaseAdmin
      .from("wa_flight_quotes")
      .update({ cards_sent_at: new Date().toISOString() })
      .eq("id", row.id);
    return { sent: 0, quote_id: row.id as string };
  }

  const { buildFlightCardData, renderFlightCardAssetRetry } = await import("./flight-card.server");
  const { buildFlightOptionCaption } = await import("./flight-caption.server");
  const { sendWhatsAppImageBytesDetailed, sendWhatsAppText } = await import("./send.server");
  const { saveMessage, saveAndSendText, setSendError, SENDING_CLAIM } = await import(
    "./conversation.server"
  );
  const { formatOptionText } = await import("./flight-option-text.server");
  const { abortIfHumanTookOver } = await import("./human-takeover.server");


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
      await saveAndSendText(conversationId, waPhone, aviso);
    }
  } catch {
    /* aviso é auxiliar: nunca bloqueia o envio das artes */
  }


  let sent = 0;
  let falhou = false;
  const novosFps: string[] = [];

  const persistirFp = async (fp: string) => {
    // Grave na cotação apenas as impressões digitais DELA. Copiar todas as
    // impressões da conversa inflava a contagem e confundia o estado da etapa.
    const atuais = new Set<string>([...fpsDaCotacao, ...novosFps]);
    await supabaseAdmin
      .from("wa_flight_quotes")
      .update({ sent_fingerprints: Array.from(new Set([...atuais, ...novosFps, fp])) })
      .eq("id", row.id);
  };

  const quoteId = row.id as string;
  const { logCardEvent, gapSeconds, logCardDelayIfNeeded } = await import("./card-log.server");
  type Stage = import("./card-log.server").CardFailureStage;

  const marcarFalhaNaCotacao = async (motivo: string) => {
    await supabaseAdmin
      .from("wa_flight_quotes")
      .update({
        card_failed: true,
        card_failed_at: new Date().toISOString(),
        card_failed_reason: motivo.slice(0, 300),
      })
      .eq("id", quoteId)
      .then(() => {}, () => {});
  };

  /**
   * FALLBACK REAL EM TEXTO — nunca é uma nova tentativa de imagem.
   * Monta o texto SÓ desta opção, com os dados estruturados da pesquisa,
   * e envia imediatamente pela Meta.
   */
  const enviarFallbackTexto = async (
    op: OptLite,
    numero: number,
  ): Promise<{ status: "sent" | "failed"; id: string | null; stage?: Stage; reason?: string }> => {
    let texto: string;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      texto = formatOptionText(quote as any, op as any, numero);
      if (!texto.trim()) throw new Error("texto vazio");
    } catch (e) {
      return {
        status: "failed",
        id: null,
        stage: "fallback_generation",
        reason: (e as Error)?.message ?? "falha ao montar o texto da opção",
      };
    }
    if (await abortIfHumanTookOver(conversationId, `fallback_opcao_${numero}`)) {
      return { status: "failed", id: null, stage: "fallback_send", reason: "assunção humana" };
    }
    try {
      const msg = await saveMessage({
        conversation_id: conversationId,
        direction: "outbound",
        sender: "camila",
        content: texto,
        // Fallback em texto também fica vinculado à cotação/opção/agente.
        agent_slug: autor.slug,
        agent_name: autor.nome,
        quote_id: quoteId,
        option_index: numero,
        source_tool: "pesquisar_passagens",
        card_option: op as unknown,
      });
      const r = await sendWhatsAppText(waPhone, texto);
      if (msg?.id) {
        await supabaseAdmin
          .from("wa_messages")
          .update({ wa_message_id: r.id ?? null, error: r.error ?? null })
          .eq("id", msg.id);
      }
      if (r.error) {
        return { status: "failed", id: null, stage: "fallback_send", reason: String(r.error).slice(0, 300) };
      }
      return { status: "sent", id: r.id ?? null };
    } catch (e) {
      return {
        status: "failed",
        id: null,
        stage: "fallback_send",
        reason: (e as Error)?.message ?? "exceção no envio do texto",
      };
    }
  };

  for (let i = 0; i < opcoes.length; i++) {
    const op = opcoes[i];
    if (i > 0) await new Promise((r) => setTimeout(r, INTERVALO_MS));
    const optionIndex = fpsDaCotacao.size + sent + 1;
    const processadoEm = new Date().toISOString();
    const base = {
      conversation_id: conversationId,
      quote_id: quoteId,
      option_index: optionIndex,
      eligible_at: elegivelEm,
      processed_at: processadoEm,
      card_type: "flight_option",
    };

    // ASSUNÇÃO HUMANA: relê o estado imediatamente antes de cada mídia.
    if (await abortIfHumanTookOver(conversationId, `card_opcao_${optionIndex}`)) {
      await liberarClaim();
      return { sent, quote_id: quoteId };
    }

    let geradoEm: string | null = null;
    let estagio: Stage = "image_render";
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = buildFlightCardData(quote as any, op as any);
      estagio = "image_render";
      const asset = await renderFlightCardAssetRetry(data);
      geradoEm = new Date().toISOString();
      logCardEvent({
        ...base,
        event: "card_generated",
        generated_at: geradoEm,
        storage_reference: asset.url ?? asset.filename ?? null,
        delivery_status: "generated",
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const caption = buildFlightOptionCaption(quote as any, op as any);

      // Registra no NOSSO chat ANTES de mandar pelo WhatsApp.
      estagio = "file_storage";
      const msg = await saveMessage({
        conversation_id: conversationId,
        direction: "outbound",
        sender: "camila",
        content: `[[media:image|${asset.url}|${asset.filename}]]\n${caption}`,
      });
      if (msg?.id) await setSendError(msg.id, SENDING_CLAIM);

      estagio = "meta_media_upload";
      const r = await sendWhatsAppImageBytesDetailed(
        waPhone,
        asset.bytes,
        asset.filename,
        caption,
        asset.url,
      );
      estagio = r.stage ?? "meta_message_send";

      if (msg?.id) {
        await supabaseAdmin
          .from("wa_messages")
          .update({
            wa_message_id: r.id ?? null,
            error: r.error ?? null,
          })
          .eq("id", msg.id);
      }

      const agora = Date.now();
      const gap = gapSeconds(ultimoEm, agora);
      if (!r.error) {
        sent++;
        const fp = fingerprint(op);
        novosFps.push(fp);
        logCardEvent({
          ...base,
          event: "card_sent",
          generated_at: geradoEm,
          uploaded_at: r.uploaded_at ?? null,
          sent_at: new Date(agora).toISOString(),
          meta_media_id: r.media_id ?? null,
          meta_message_id: r.id ?? null,
          // "sent" = a Meta aceitou. delivered/read só via webhook de status.
          delivery_status: "sent",
          gap_seconds: gap,
        });
        logCardDelayIfNeeded({ ...base, gap_seconds: gap });
        // grava já: se o worker cair aqui, esta opção não volta na próxima rodada
        await persistirFp(fp).catch(() => undefined);
      } else {
        falhou = true;
        // FALLBACK EM TEXTO desta opção (nunca reenviar a imagem).
        const fb = await enviarFallbackTexto(op, optionIndex);
        logCardEvent({
          ...base,
          event: "card_failed",
          generated_at: geradoEm,
          failed_stage: estagio,
          failure_reason: String(r.error).slice(0, 300),
          retry_count: 0,
          meta_media_id: r.media_id ?? null,
          meta_message_id: r.id ?? null,
          delivery_status: "failed",
          fallback_sent: fb.status === "sent",
          fallback_status: fb.status,
          fallback_message_id: fb.id,
          gap_seconds: gap,
        });
        if (fb.status === "failed") {
          logCardEvent({
            ...base,
            event: "card_failed",
            failed_stage: fb.stage ?? "fallback_send",
            failure_reason: fb.reason ?? "falha no fallback em texto",
            fallback_sent: false,
            fallback_status: "failed",
          });
          await escalarPorFalhaDeCard(conversationId, quoteId, optionIndex);
        } else {
          // Texto entregue: a opção está cumprida, não repete na próxima rodada
          // e NÃO vira encaminhamento ao Comercial.
          const fp = fingerprint(op);
          novosFps.push(fp);
          await persistirFp(fp).catch(() => undefined);
        }
        await marcarFalhaNaCotacao(String(r.error));
      }
    } catch (e) {
      falhou = true;
      const motivo = `exceção: ${(e as Error)?.message ?? "desconhecida"}`;
      const fb = await enviarFallbackTexto(op, optionIndex);
      logCardEvent({
        ...base,
        event: "card_failed",
        generated_at: geradoEm,
        failed_stage: estagio,
        failure_reason: motivo.slice(0, 300),
        retry_count: 0,
        delivery_status: "failed",
        fallback_sent: fb.status === "sent",
        fallback_status: fb.status,
        fallback_message_id: fb.id,
      });
      if (fb.status === "failed") {
        logCardEvent({
          ...base,
          event: "card_failed",
          failed_stage: fb.stage ?? "fallback_send",
          failure_reason: fb.reason ?? "falha no fallback em texto",
          fallback_sent: false,
          fallback_status: "failed",
        });
        await escalarPorFalhaDeCard(conversationId, quoteId, optionIndex);
      } else {
        const fp = fingerprint(op);
        novosFps.push(fp);
        await persistirFp(fp).catch(() => undefined);
      }
      await marcarFalhaNaCotacao(motivo);
    }
  }

  if (sent === 0 && !novosFps.length) {
    await liberarClaim();
    return { sent: 0, quote_id: row.id as string };
  }

  // Concluiu a cotação só quando as 2 opções saíram (arte ou texto); senão
  // libera o claim pra que a próxima rodada do cron mande a etapa seguinte.
  const totalEnviadas = fpsDaCotacao.size + novosFps.length;
  const concluiu = totalEnviadas >= MAX_OPCOES;
  await supabaseAdmin
    .from("wa_flight_quotes")
    .update({ cards_sent_at: concluiu ? new Date().toISOString() : null })
    .eq("id", row.id);

  void falhou;
  return { sent, quote_id: row.id as string };
}

/**
 * Card E fallback falharam na mesma opção: aí sim o atendimento vai para o
 * time Comercial, preservando o contexto da pesquisa. Nada técnico chega ao
 * cliente.
 */
async function escalarPorFalhaDeCard(
  conversationId: string,
  quoteId: string,
  optionIndex: number,
): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: conv } = await supabaseAdmin
      .from("wa_conversations")
      .select("id, tags, protocolo_ativo_id")
      .eq("id", conversationId)
      .maybeSingle();
    const tags = Array.from(
      new Set([
        ...(((conv as { tags?: string[] | null } | null)?.tags ?? []) as string[]),
        "aguardando_humano",
        "falha_central",
      ]),
    );
    await supabaseAdmin
      .from("wa_conversations")
      .update({ tags, assigned_to: null, priority: "high" })
      .eq("id", conversationId);
    const { recordHandoff } = await import("./conversation.server");
    await recordHandoff({
      conversation_id: conversationId,
      from_mode: "ai",
      to_mode: "ai",
      reason: "aguardando_humano:falha_card_e_fallback",
      briefing: `Arte e texto da opção ${optionIndex} não puderam ser entregues (cotação ${quoteId}). Dados da pesquisa preservados.`,
    }).catch(() => {});
  } catch (e) {
    console.error("[flight-cards] falha ao escalar após card+fallback:", e);
  }
}

