/**
 * WORKER CENTRAL DE ENTREGA DAS COTAÇÕES AÉREAS.
 *
 * ÚNICO caminho de envio de opção de voo (card ou texto). Agente, watchdog,
 * cron, recuperação de claim, reenvio e pós-pesquisa chamam a MESMA função:
 * `processNextFlightQuoteOption()`.
 *
 * Como funciona:
 * - a fila é lida do ESTADO da cotação (delivery_status != completed,
 *   cancelled_at null, delivered < expected). Não depende de mensagem do
 *   cliente, de regex de promessa nem da resposta da Paula/Bruno;
 * - cada opção tem estado próprio (wa_flight_quote_options): pending, claimed,
 *   rendering, delivered_card, delivered_text, failed, cancelled;
 * - o claim é POR OPÇÃO e expira em 45s. Worker que morre no meio libera a
 *   opção sozinho, sem travar a cotação inteira;
 * - após cada entrega a rodada ENCADEIA a próxima (execução nova) e grava
 *   next_run_at (30-90s). Nada de dormir dentro do worker;
 * - idempotência por quote_id + option_index + fingerprint;
 * - card em até 6s (cache-first); estourou ou falhou → fallback em texto com
 *   os dados completos da opção, e aquela opção NÃO volta como card;
 * - emergência: cotação incompleta há mais de 5 min → todas as opções que
 *   faltam vão em texto e a cotação é concluída.
 *
 * SERVER-ONLY.
 */
import {
  CLAIM_TTL_MS,
  META_OPCOES,
  claimExpirado,
  cotacaoConcluida,
  emEmergencia,
  expectedOptions,
  fingerprintOpcao,
  foiEntregue,
  opcaoDisponivel,
  proximoIntervaloMs,
  quoteStatus,
  statusAposFalha,
  ehTerminal,
  type OptLite,
} from "./flight-delivery";

type QuoteRow = {
  id: string;
  conversation_id: string;
  protocolo_id: string | null;
  payload: unknown;
  created_at: string;
  cancelled_at: string | null;
  sent_fingerprints: unknown;
  agent_slug: string | null;
  agent_name: string | null;
  delivery_status: string | null;
  expected_options: number | null;
  delivered_options_count: number | null;
  next_run_at: string | null;
};

type OptionRow = {
  id: string;
  quote_id: string;
  option_index: number;
  fingerprint: string;
  delivery_status: string;
  claim_id: string | null;
  claim_expires_at: string | null;
  attempt_count: number;
  next_run_at: string | null;
  provider_message_id: string | null;
};

const workerId = () => `w_${Math.random().toString(36).slice(2, 10)}`;

const log = (o: Record<string, unknown>) =>
  console.log(JSON.stringify({ ...o, at: new Date().toISOString() }));

const db = async () => (await import("@/integrations/supabase/client.server")).supabaseAdmin;

const opcoesDoPayload = (payload: unknown): OptLite[] =>
  (((payload ?? {}) as { opcoes?: OptLite[] }).opcoes ?? []) as OptLite[];

/* ────────────────────────── materialização das opções ───────────────────── */

/**
 * Garante uma linha de estado por opção prevista. Reaproveita as impressões
 * digitais já gravadas na cotação (compatibilidade com o modelo antigo), então
 * nada que já chegou ao cliente é reenviado.
 */
export async function ensureQuoteOptions(quote: QuoteRow, meta = META_OPCOES): Promise<OptionRow[]> {
  const supabaseAdmin = await db();
  const todas = opcoesDoPayload(quote.payload);
  const expected = expectedOptions(todas.length, meta);

  const jaEntregues = new Set<string>(
    Array.isArray(quote.sent_fingerprints) ? (quote.sent_fingerprints as unknown[]).map(String) : [],
  );

  const { data: existentes } = await supabaseAdmin
    .from("wa_flight_quote_options")
    .select("id, quote_id, option_index, fingerprint, delivery_status, claim_id, claim_expires_at, attempt_count, next_run_at, provider_message_id")
    .eq("quote_id", quote.id)
    .order("option_index", { ascending: true });

  const porIndice = new Map<number, OptionRow>(
    ((existentes ?? []) as OptionRow[]).map((r) => [r.option_index, r]),
  );

  const novas = [] as Array<Record<string, unknown>>;
  for (let i = 0; i < expected; i++) {
    if (porIndice.has(i)) continue;
    const fp = fingerprintOpcao(todas[i]);
    novas.push({
      quote_id: quote.id,
      conversation_id: quote.conversation_id,
      protocolo_id: quote.protocolo_id,
      option_index: i,
      fingerprint: fp,
      // Opção cuja impressão digital já saiu antes: nasce entregue.
      delivery_status: jaEntregues.has(fp) ? "delivered_text" : "pending",
      delivered_at: jaEntregues.has(fp) ? new Date().toISOString() : null,
      delivery_format: jaEntregues.has(fp) ? "legacy" : null,
    });
  }
  if (novas.length) {
    await supabaseAdmin
      .from("wa_flight_quote_options")
      .upsert(novas as never, { onConflict: "quote_id,option_index", ignoreDuplicates: true });
  }

  const { data: todasLinhas } = await supabaseAdmin
    .from("wa_flight_quote_options")
    .select("id, quote_id, option_index, fingerprint, delivery_status, claim_id, claim_expires_at, attempt_count, next_run_at, provider_message_id")
    .eq("quote_id", quote.id)
    .lt("option_index", expected)
    .order("option_index", { ascending: true });

  const linhas = (todasLinhas ?? []) as OptionRow[];
  const entregues = linhas.filter((l) => foiEntregue(l.delivery_status)).length;

  await supabaseAdmin
    .from("wa_flight_quotes")
    .update({
      expected_options: expected,
      delivered_options_count: entregues,
      delivery_status: quoteStatus(entregues, expected, { cancelled: !!quote.cancelled_at }),
    })
    .eq("id", quote.id);

  return linhas;
}

/* ─────────────────────────────── validações ─────────────────────────────── */

type Contexto = {
  conversation_id: string;
  wa_phone: string;
  protocolo_id: string | null;
  protocol_opened_at: string | null;
};

async function contextoValido(quote: QuoteRow): Promise<Contexto | null> {
  const supabaseAdmin = await db();
  const { data: conv } = await supabaseAdmin
    .from("wa_conversations")
    .select("id, wa_phone, mode, ai_paused, protocolo_ativo_id")
    .eq("id", quote.conversation_id)
    .maybeSingle();
  if (!conv) return null;
  const c = conv as {
    wa_phone: string;
    mode: string | null;
    ai_paused: boolean | null;
    protocolo_ativo_id: string | null;
  };
  if (c.mode !== "ai" || c.ai_paused) return null;
  if (quote.cancelled_at) return null;

  let abertoEm: string | null = null;
  if (quote.protocolo_id) {
    if (c.protocolo_ativo_id && c.protocolo_ativo_id !== quote.protocolo_id) return null;
    const { data: p } = await supabaseAdmin
      .from("wa_protocolos")
      .select("status, opened_at, created_at")
      .eq("id", quote.protocolo_id)
      .maybeSingle();
    const proto = p as { status?: string; opened_at?: string | null; created_at?: string } | null;
    if (!proto || proto.status !== "aberto") return null;
    abertoEm = proto.opened_at ?? proto.created_at ?? null;
  }
  return {
    conversation_id: quote.conversation_id,
    wa_phone: c.wa_phone,
    protocolo_id: quote.protocolo_id,
    protocol_opened_at: abertoEm,
  };
}

/** Protocolo encerrado / cotação substituída: cancela o que sobrou. */
async function cancelarRestante(quoteId: string, motivo: string): Promise<void> {
  const supabaseAdmin = await db();
  await supabaseAdmin
    .from("wa_flight_quote_options")
    .update({ delivery_status: "cancelled", last_error: motivo.slice(0, 300) })
    .eq("quote_id", quoteId)
    .not("delivery_status", "in", "(delivered_card,delivered_text)");
  await supabaseAdmin
    .from("wa_flight_quotes")
    .update({ delivery_status: "cancelled", next_run_at: null })
    .eq("id", quoteId);
  log({ event: "flight_delivery_cancelled", quote_id: quoteId, motivo });
}

/* ──────────────────────────── claim atômico ─────────────────────────────── */

async function claimOption(
  linha: OptionRow,
  worker: string,
): Promise<OptionRow | null> {
  const supabaseAdmin = await db();
  const agora = new Date();
  const expira = new Date(agora.getTime() + CLAIM_TTL_MS);

  let q = supabaseAdmin
    .from("wa_flight_quote_options")
    .update({
      delivery_status: "claimed",
      claim_id: worker,
      claim_started_at: agora.toISOString(),
      claim_expires_at: expira.toISOString(),
      attempt_count: linha.attempt_count + 1,
      last_attempt_at: agora.toISOString(),
      next_run_at: null,
    })
    .eq("id", linha.id)
    .eq("delivery_status", linha.delivery_status);
  // Só rouba um claim vivo se ele for o mesmo que lemos (evita corrida).
  q = linha.claim_id ? q.eq("claim_id", linha.claim_id) : q.is("claim_id", null);

  const { data } = await q.select(
    "id, quote_id, option_index, fingerprint, delivery_status, claim_id, claim_expires_at, attempt_count, next_run_at, provider_message_id",
  );
  const row = ((data ?? [])[0] as OptionRow | undefined) ?? null;
  if (row && linha.claim_id && !claimExpirado(linha.claim_expires_at)) return null;
  return row;
}

/* ───────────────────────────── entrega de UMA opção ─────────────────────── */

async function entregarOpcao(
  quote: QuoteRow,
  op: OptLite,
  linha: OptionRow,
  ctx: Contexto,
  worker: string,
  opts: { somenteTexto?: boolean } = {},
): Promise<{ ok: boolean; format: "card" | "text" | "skipped" | null; message_id: string | null }> {
  const supabaseAdmin = await db();
  const { saveMessage, setSendError, SENDING_CLAIM } = await import("./conversation.server");
  const { abortIfHumanTookOver } = await import("./human-takeover.server");
  const { sendWhatsAppText } = await import("./send.server");
  const { formatOptionText } = await import("./flight-option-text.server");
  const { logCardEvent } = await import("./card-log.server");

  const numero = linha.option_index + 1;
  const base = {
    conversation_id: ctx.conversation_id,
    quote_id: quote.id,
    option_index: numero,
    card_type: "flight_option",
  };
  const autor = { slug: quote.agent_slug, nome: quote.agent_name };

  if (await abortIfHumanTookOver(ctx.conversation_id, `opcao_${numero}`)) {
    return { ok: false, format: null, message_id: null };
  }

  // ── IDEMPOTÊNCIA: essa opção já saiu? (fingerprint da cotação ou mensagem
  // gravada com o mesmo quote_id + option_index).
  const fps = new Set<string>(
    Array.isArray(quote.sent_fingerprints) ? (quote.sent_fingerprints as unknown[]).map(String) : [],
  );
  const { data: jaMsg } = await supabaseAdmin
    .from("wa_messages")
    .select("id, wa_message_id")
    .eq("conversation_id", ctx.conversation_id)
    .eq("quote_id", quote.id)
    .eq("option_index", numero)
    .eq("direction", "outbound")
    .limit(1);
  if (fps.has(linha.fingerprint) || (jaMsg ?? []).length) {
    log({
      event: "flight_delivery_idempotent_skip",
      quote_id: quote.id,
      option_index: linha.option_index,
      worker_id: worker,
    });
    await marcarEntregue(linha, "delivered_text", ((jaMsg ?? [])[0] as { wa_message_id?: string } | undefined)?.wa_message_id ?? null, quote);
    return { ok: true, format: "skipped", message_id: null };
  }

  /* ---- fallback em texto (dados completos da opção) ---- */
  const mandarTexto = async (motivo: string) => {
    let texto = "";
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      texto = formatOptionText(quote.payload as any, op as any, numero);
    } catch {
      texto = "";
    }
    if (!texto.trim()) {
      await falhar(linha, `fallback_generation: ${motivo}`);
      return { ok: false, format: null as null, message_id: null };
    }
    const msg = await saveMessage({
      conversation_id: ctx.conversation_id,
      direction: "outbound",
      sender: "camila",
      content: texto,
      agent_slug: autor.slug,
      agent_name: autor.nome,
      quote_id: quote.id,
      option_index: numero,
      source_tool: "pesquisar_passagens",
      card_option: op as unknown,
    });
    const r = await sendWhatsAppText(ctx.wa_phone, texto);
    if (msg?.id) {
      await supabaseAdmin
        .from("wa_messages")
        .update({ wa_message_id: r.id ?? null, error: r.error ?? null })
        .eq("id", msg.id);
    }
    if (r.error) {
      await falhar(linha, `fallback_send: ${String(r.error)}`);
      log({
        event: "flight_delivery_failed",
        stage: "fallback_send",
        error_type: "meta_error",
        error_message: String(r.error).slice(0, 300),
        quote_id: quote.id,
        option_index: linha.option_index,
        attempt_count: linha.attempt_count,
      });
      return { ok: false, format: null as null, message_id: null };
    }
    logCardEvent({ ...base, event: "card_failed", failure_reason: motivo.slice(0, 300), fallback_sent: true, fallback_status: "sent", fallback_message_id: r.id ?? null, delivery_status: "failed" });
    await marcarEntregue(linha, "delivered_text", r.id ?? null, quote);
    log({
      event: "flight_delivery_option",
      quote_id: quote.id,
      protocol_id: ctx.protocolo_id,
      worker_id: worker,
      option_index: linha.option_index,
      fallback_sent: true,
      delivery_format: "text",
      message_id: r.id ?? null,
      fingerprint: linha.fingerprint,
      motivo,
    });
    return { ok: true, format: "text" as const, message_id: r.id ?? null };
  };

  if (opts.somenteTexto) return await mandarTexto("modo_emergencia");

  /* ---- ENTREGA OFICIAL: orçamento público AIR_ONLY (texto curto + link) ----
     Os cards/imagens de voo não são mais enviados ao cliente. */
  try {
    const { prepararLinkDaOpcao } = await import("./flight-quote-link.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { texto, link, publicId } = await prepararLinkDaOpcao({
      result: quote.payload as any,
      option: op as any,
      numero,
      agentName: autor.nome,
      conversationId: ctx.conversation_id,
      flightQuoteId: quote.id,
    });

    const msg = await saveMessage({
      conversation_id: ctx.conversation_id,
      direction: "outbound",
      sender: "camila",
      content: texto,
      agent_slug: autor.slug,
      agent_name: autor.nome,
      quote_id: quote.id,
      option_index: numero,
      source_tool: "pesquisar_passagens",
      card_option: op as unknown,
    });
    if (msg?.id) await setSendError(msg.id, SENDING_CLAIM);

    const r = await sendWhatsAppText(ctx.wa_phone, texto);
    if (msg?.id) {
      await supabaseAdmin
        .from("wa_messages")
        .update({ wa_message_id: r.id ?? null, error: r.error ?? null })
        .eq("id", msg.id);
    }
    if (r.error) return await mandarTexto(`quote_link_send: ${String(r.error)}`);

    logCardEvent({
      ...base,
      event: "card_sent",
      meta_message_id: r.id ?? null,
      delivery_status: "sent",
    });
    await marcarEntregue(linha, "delivered_text", r.id ?? null, quote);
    log({
      event: "flight_delivery_option",
      quote_id: quote.id,
      protocol_id: ctx.protocolo_id,
      worker_id: worker,
      option_index: linha.option_index,
      delivery_format: "quote_link",
      public_quote_id: publicId,
      link,
      message_id: r.id ?? null,
      fingerprint: linha.fingerprint,
    });
    return { ok: true, format: "text", message_id: r.id ?? null };
  } catch (e) {
    const motivo = (e as Error)?.message ?? "quote_link_error";
    log({
      event: "flight_delivery_failed",
      stage: "quote_link",
      error_type: "quote_link_error",
      error_message: motivo.slice(0, 300),
      quote_id: quote.id,
      option_index: linha.option_index,
      attempt_count: linha.attempt_count,
    });
    return await mandarTexto(`quote_link: ${motivo}`);
  }
}


async function marcarEntregue(
  linha: OptionRow,
  status: "delivered_card" | "delivered_text",
  messageId: string | null,
  quote: QuoteRow,
): Promise<void> {
  const supabaseAdmin = await db();
  await supabaseAdmin
    .from("wa_flight_quote_options")
    .update({
      delivery_status: status,
      delivery_format: status === "delivered_card" ? "card" : "text",
      provider_message_id: messageId,
      delivered_at: new Date().toISOString(),
      claim_id: null,
      claim_expires_at: null,
      next_run_at: null,
    })
    .eq("id", linha.id);

  // fingerprint na cotação (idempotência global e compatibilidade)
  const fps = new Set<string>(
    Array.isArray(quote.sent_fingerprints) ? (quote.sent_fingerprints as unknown[]).map(String) : [],
  );
  fps.add(linha.fingerprint);
  quote.sent_fingerprints = Array.from(fps);
  await supabaseAdmin
    .from("wa_flight_quotes")
    .update({ sent_fingerprints: Array.from(fps) as never })
    .eq("id", quote.id);
}

async function falhar(linha: OptionRow, erro: string): Promise<void> {
  const supabaseAdmin = await db();
  const status = statusAposFalha(linha.attempt_count);
  await supabaseAdmin
    .from("wa_flight_quote_options")
    .update({
      delivery_status: status,
      last_error: erro.slice(0, 300),
      claim_id: null,
      claim_expires_at: null,
      // failed_final não volta pra fila; recuperável tenta de novo em 30s.
      next_run_at: status === "failed_final" ? null : new Date(Date.now() + 30_000).toISOString(),
    })
    .eq("id", linha.id);
  log({
    event: status === "failed_final" ? "flight_delivery_auto_repair_failed" : "flight_delivery_retry_scheduled",
    quote_id: linha.quote_id,
    option_index: linha.option_index,
    estado_anterior: linha.delivery_status,
    estado_novo: status,
    motivo: erro.slice(0, 200),
    tentativa: linha.attempt_count,
  });
}


/* ─────────────────────── seleção da cotação da vez ──────────────────────── */

async function proximaCotacao(params: {
  quote_id?: string | null;
  conversation_id?: string | null;
  protocolo_id?: string | null;
}): Promise<QuoteRow | null> {
  const supabaseAdmin = await db();
  const campos =
    "id, conversation_id, protocolo_id, payload, created_at, cancelled_at, sent_fingerprints, agent_slug, agent_name, delivery_status, expected_options, delivered_options_count, next_run_at";

  if (params.quote_id) {
    const { data } = await supabaseAdmin
      .from("wa_flight_quotes")
      .select(campos)
      .eq("id", params.quote_id)
      .maybeSingle();
    return (data as QuoteRow | null) ?? null;
  }

  const desde = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  let q = supabaseAdmin
    .from("wa_flight_quotes")
    .select(campos)
    .is("cancelled_at", null)
    .neq("delivery_status", "completed")
    .neq("delivery_status", "cancelled")
    .gte("created_at", desde)
    .order("created_at", { ascending: true })
    .limit(20);
  if (params.conversation_id) q = q.eq("conversation_id", params.conversation_id);
  if (params.protocolo_id) q = q.eq("protocolo_id", params.protocolo_id);
  const { data } = await q;

  const agora = Date.now();
  const linhas = (data ?? []) as QuoteRow[];
  for (const r of linhas) {
    if (r.next_run_at && new Date(r.next_run_at).getTime() > agora) continue;
    const total = opcoesDoPayload(r.payload).length;
    if (!total) continue;
    const expected = r.expected_options ?? expectedOptions(total);
    if ((r.delivered_options_count ?? 0) >= expected) continue;
    return r;
  }
  return null;
}

/* ─────────────────────────── FUNÇÃO CENTRAL ─────────────────────────────── */

export type ProcessResult = {
  quote_id: string | null;
  delivered: number;
  completed: boolean;
  chained_next_round: boolean;
  next_option_index: number | null;
  next_run_at: string | null;
};

/**
 * Processa a PRÓXIMA opção pendente de uma cotação. Uma opção por execução:
 * o encadeamento cuida do resto. Chamada por worker, cron, watchdog, retomada
 * de claim, reenvio e pós-pesquisa.
 */
export async function processNextFlightQuoteOption(params: {
  quote_id?: string | null;
  conversation_id?: string | null;
  protocolo_id?: string | null;
  /** Ignora o intervalo progressivo (pedido explícito do cliente). */
  imediato?: boolean;
  /** Encadeia a próxima rodada por execução nova (padrão: sim). */
  encadear?: boolean;
  depth?: number;
  meta?: number;
}): Promise<ProcessResult> {
  const worker = workerId();
  const vazio: ProcessResult = {
    quote_id: null,
    delivered: 0,
    completed: false,
    chained_next_round: false,
    next_option_index: null,
    next_run_at: null,
  };

  const quote = await proximaCotacao(params);
  if (!quote) return vazio;

  const todas = opcoesDoPayload(quote.payload);
  const meta = params.meta ?? META_OPCOES;
  const expected = expectedOptions(todas.length, meta);
  if (!expected) return { ...vazio, quote_id: quote.id };

  const ctx = await contextoValido(quote);
  if (!ctx) {
    await cancelarRestante(quote.id, "protocolo encerrado, IA pausada ou cotação substituída");
    return { ...vazio, quote_id: quote.id };
  }

  const linhas = await ensureQuoteOptions(quote, meta);
  const entreguesAntes = linhas.filter((l) => foiEntregue(l.delivery_status)).length;
  const agora = Date.now();

  const emergencia = emEmergencia(
    { created_at: quote.created_at, delivered_options_count: entreguesAntes, expected_options: expected },
    agora,
  );

  const disponiveis = linhas.filter((l) =>
    opcaoDisponivel(
      { delivery_status: l.delivery_status, claim_expires_at: l.claim_expires_at, next_run_at: params.imediato || emergencia ? null : l.next_run_at },
      agora,
    ),
  );

  for (const l of linhas) {
    if (!foiEntregue(l.delivery_status) && l.claim_id && claimExpirado(l.claim_expires_at, agora)) {
      log({ event: "flight_delivery_claim_recovered", quote_id: quote.id, option_index: l.option_index, claim_id: l.claim_id });
    }
  }

  log({
    event: "flight_delivery_round",
    quote_id: quote.id,
    protocol_id: ctx.protocolo_id,
    worker_id: worker,
    saved_options_count: todas.length,
    expected_options: expected,
    delivered_options_count: entreguesAntes,
    pending_options_count: expected - entreguesAntes,
    available_now: disponiveis.length,
    emergency: emergencia,
    depth: params.depth ?? 0,
  });

  if (!disponiveis.length) {
    const completou = cotacaoConcluida(entreguesAntes, expected);
    await atualizarCotacao(quote.id, entreguesAntes, expected, completou ? null : new Date(agora + 60_000).toISOString());
    return { ...vazio, quote_id: quote.id, completed: completou };
  }

  /* ── ENTREGA ÚNICA: TODAS as opções em UM orçamento e UM link ──
     Uma pesquisa = um orçamento = um link. Nada de card/link por opção. */
  const reivindicadas: OptionRow[] = [];
  for (const l of disponiveis) {
    const c = await claimOption(l, worker);
    if (c) reivindicadas.push(c);
  }
  if (!reivindicadas.length) {
    log({ event: "flight_delivery_claim_lost", quote_id: quote.id, worker_id: worker });
    return { ...vazio, quote_id: quote.id };
  }

  await avisarAntesDoPrimeiroCard(ctx, entreguesAntes);

  const bundle = await entregarBundle(quote, todas, reivindicadas, ctx, worker, {
    somenteTexto: emergencia,
  });
  const entregues = entreguesAntes + bundle.entregues;
  const completou = cotacaoConcluida(entregues, expected) || bundle.entregues > 0;

  await atualizarCotacao(quote.id, entregues, expected, completou ? null : new Date(agora + 60_000).toISOString());

  log({
    event: "flight_delivery_round_result",
    quote_id: quote.id,
    protocol_id: ctx.protocolo_id,
    worker_id: worker,
    delivery_format: bundle.format,
    message_id: bundle.message_id,
    delivered_options_count: entregues,
    expected_options: expected,
    quote_completed: completou,
    chained_next_round: false,
    bundle: true,
  });

  return {
    quote_id: quote.id,
    delivered: bundle.entregues,
    completed: completou,
    chained_next_round: false,
    next_option_index: null,
    next_run_at: null,
  };
}

/**
 * Envia UMA mensagem com todas as opções pendentes e UM link do orçamento
 * público multi-opção. Em modo emergência (ou falha do link) cai para o texto
 * completo por opção, usando o caminho já existente.
 */
async function entregarBundle(
  quote: QuoteRow,
  todas: OptLite[],
  linhas: OptionRow[],
  ctx: Contexto,
  worker: string,
  opts: { somenteTexto?: boolean } = {},
): Promise<{ entregues: number; format: string | null; message_id: string | null }> {
  const fallback = async (motivo: string) => {
    let n = 0;
    for (const l of linhas) {
      const r = await entregarOpcao(quote, todas[l.option_index], l, ctx, worker, { somenteTexto: true });
      if (r.ok) n++;
    }
    log({ event: "flight_delivery_bundle_fallback", quote_id: quote.id, motivo: motivo.slice(0, 200), entregues: n });
    return { entregues: n, format: "text" as const, message_id: null };
  };

  if (opts.somenteTexto) return await fallback("modo_emergencia");

  const supabaseAdmin = await db();
  const { saveMessage, setSendError, SENDING_CLAIM } = await import("./conversation.server");
  const { abortIfHumanTookOver } = await import("./human-takeover.server");
  const { sendWhatsAppText } = await import("./send.server");

  if (await abortIfHumanTookOver(ctx.conversation_id, "cotacao_bundle")) {
    return { entregues: 0, format: null, message_id: null };
  }

  // Idempotência: já saiu alguma mensagem desta cotação?
  const { data: jaMsg } = await supabaseAdmin
    .from("wa_messages")
    .select("id")
    .eq("conversation_id", ctx.conversation_id)
    .eq("quote_id", quote.id)
    .eq("direction", "outbound")
    .limit(1);
  if ((jaMsg ?? []).length) {
    for (const l of linhas) await marcarEntregue(l, "delivered_text", null, quote);
    log({ event: "flight_delivery_idempotent_skip", quote_id: quote.id, worker_id: worker, bundle: true });
    return { entregues: linhas.length, format: "skipped", message_id: null };
  }

  const indices = linhas.map((l) => l.option_index).sort((a, b) => a - b);
  const opcoes = indices.map((i) => todas[i]).filter(Boolean);
  if (!opcoes.length) return await fallback("sem_opcoes");

  const autor = { slug: quote.agent_slug, nome: quote.agent_name };

  try {
    const { data: conv } = await supabaseAdmin
      .from("wa_conversations")
      .select("display_name, wa_phone")
      .eq("id", ctx.conversation_id)
      .maybeSingle();

    const { prepararOrcamentoMultiOpcoes } = await import("./flight-quote-link.server");
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const { texto, link, publicId } = await prepararOrcamentoMultiOpcoes({
      result: quote.payload as any,
      options: opcoes as any,
      agentName: autor.nome,
      agentSlug: autor.slug,
      conversationId: ctx.conversation_id,
      flightQuoteId: quote.id,
      clientName: (conv as { display_name?: string | null } | null)?.display_name ?? null,
      clientPhone: (conv as { wa_phone?: string | null } | null)?.wa_phone ?? ctx.wa_phone,
    });
    /* eslint-enable @typescript-eslint/no-explicit-any */

    const msg = await saveMessage({
      conversation_id: ctx.conversation_id,
      direction: "outbound",
      sender: "camila",
      content: texto,
      agent_slug: autor.slug,
      agent_name: autor.nome,
      quote_id: quote.id,
      option_index: indices[0]! + 1,
      source_tool: "pesquisar_passagens",
    });
    if (msg?.id) await setSendError(msg.id, SENDING_CLAIM);

    const r = await sendWhatsAppText(ctx.wa_phone, texto);
    if (msg?.id) {
      await supabaseAdmin
        .from("wa_messages")
        .update({ wa_message_id: r.id ?? null, error: r.error ?? null })
        .eq("id", msg.id);
    }
    if (r.error) return await fallback(`bundle_send: ${String(r.error)}`);

    for (const l of linhas) await marcarEntregue(l, "delivered_text", r.id ?? null, quote);
    log({
      event: "flight_delivery_bundle_sent",
      quote_id: quote.id,
      protocol_id: ctx.protocolo_id,
      worker_id: worker,
      options: indices.map((i) => i + 1),
      public_quote_id: publicId,
      link,
      message_id: r.id ?? null,
    });
    return { entregues: linhas.length, format: "quote_link_bundle", message_id: r.id ?? null };
  } catch (e) {
    return await fallback(`bundle: ${(e as Error)?.message ?? "erro"}`);
  }
}

async function atualizarCotacao(
  quoteId: string,
  entregues: number,
  expected: number,
  nextRunAt: string | null,
): Promise<void> {
  const supabaseAdmin = await db();
  const status = quoteStatus(entregues, expected);
  await supabaseAdmin
    .from("wa_flight_quotes")
    .update({
      delivered_options_count: entregues,
      expected_options: expected,
      delivery_status: status,
      next_run_at: nextRunAt,
      // compatibilidade com o campo antigo de claim da cotação
      cards_sent_at: status === "completed" ? new Date().toISOString() : null,
    })
    .eq("id", quoteId);
}

/** Aviso humano antes da primeira arte (nunca mandar card "do nada"). */
async function avisarAntesDoPrimeiroCard(ctx: Contexto, jaEntregues: number): Promise<void> {
  if (jaEntregues > 0) return;
  try {
    const supabaseAdmin = await db();
    const desde = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { data } = await supabaseAdmin
      .from("wa_messages")
      .select("content")
      .eq("conversation_id", ctx.conversation_id)
      .eq("direction", "outbound")
      .gte("created_at", desde)
      .order("created_at", { ascending: false })
      .limit(8);
    const jaAvisou = (data ?? []).some((m) =>
      /(pesquis|verific|consult|buscando|já te (mando|trago)|opç)/i.test(
        (m as { content: string | null }).content ?? "",
      ),
    );
    if (jaAvisou) return;
    const { saveAndSendText } = await import("./conversation.server");
    await saveAndSendText(
      ctx.conversation_id,
      ctx.wa_phone,
      "Já verifiquei aqui com as companhias e vou te mandar as melhores opções agora",
    );
  } catch {
    /* aviso é auxiliar */
  }
}

/* ────────────────────── varredura (cron / watchdog) ─────────────────────── */

/**
 * Rede de segurança: percorre TODAS as cotações incompletas (claims expirados
 * inclusive) e processa a próxima opção de cada uma. Independe do texto da
 * conversa.
 */
export async function sweepFlightQuoteDeliveries(limite = 25): Promise<{
  cotacoes: number;
  entregues: number;
}> {
  const supabaseAdmin = await db();
  const desde = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { data } = await supabaseAdmin
    .from("wa_flight_quotes")
    .select("id, created_at, delivery_status, next_run_at, delivered_options_count, expected_options")
    .is("cancelled_at", null)
    .neq("delivery_status", "completed")
    .neq("delivery_status", "cancelled")
    .gte("created_at", desde)
    .order("created_at", { ascending: true })
    .limit(limite);

  const agora = Date.now();
  let entregues = 0;
  let cotacoes = 0;
  for (const q of (data ?? []) as Array<{ id: string; next_run_at: string | null }>) {
    if (q.next_run_at && new Date(q.next_run_at).getTime() > agora) continue;
    cotacoes++;
    const r = await processNextFlightQuoteOption({ quote_id: q.id }).catch((e) => {
      console.warn("[flight-delivery] sweep falhou:", (e as Error)?.message ?? e);
      return null;
    });
    entregues += r?.delivered ?? 0;
  }
  log({ event: "flight_delivery_sweep", cotacoes, entregues });
  return { cotacoes, entregues };
}

/**
 * Nova pesquisa substitui a anterior: marca como cancelled toda cotação ainda
 * incompleta da mesma conversa/protocolo. As opções ainda não entregues param
 * de sair, evitando misturar buscas diferentes na mesma conversa.
 */
export async function cancelarCotacoesAnteriores(
  conversationId: string,
  protocoloId?: string | null,
): Promise<number> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  let q = supabaseAdmin
    .from("wa_flight_quotes")
    .select("id")
    .eq("conversation_id", conversationId)
    .is("cancelled_at", null)
    .neq("delivery_status", "completed");
  if (protocoloId) q = q.eq("protocolo_id", protocoloId);
  const { data } = await q;
  const ids = (data ?? []).map((r) => r.id as string);
  if (!ids.length) return 0;
  const agora = new Date().toISOString();
  await supabaseAdmin
    .from("wa_flight_quotes")
    .update({ cancelled_at: agora, delivery_status: "cancelled", next_run_at: null })
    .in("id", ids);
  await supabaseAdmin
    .from("wa_flight_quote_options")
    .update({ status: "cancelled", claimed_by: null, claim_expires_at: null } as never)
    .in("quote_id", ids)
    .in("status", ["pending", "rendering", "sending"]);
  log({ event: "flight_delivery_superseded", conversation_id: conversationId, cancelled: ids.length });
  return ids.length;
}
