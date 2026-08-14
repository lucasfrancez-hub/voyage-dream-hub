/**
 * REENVIO DE UMA OPÇÃO JÁ APRESENTADA.
 *
 * "Pode mandar novamente aquela opção?" não é uma nova pesquisa: é reentrega
 * do MESMO conteúdo já cotado. Este módulo recupera a opção pelo par
 * (quote_id, option_index) direto do payload salvo em `wa_flight_quotes`,
 * renderiza a arte de novo e, se a imagem falhar, cai no fallback em texto —
 * sem tocar em preço, horário, companhia ou bagagem.
 *
 * NUNCA chama o motor de busca.
 *
 * SERVER-ONLY.
 */
import { logCardEvent } from "./card-log.server";

export type ResendFormat = "card" | "texto" | "automatico";

export type ResendResult =
  | {
      ok: true;
      quote_id: string;
      option_index: number;
      format: "card" | "texto";
      message_id: string | null;
      stale: boolean;
      resumo: string;
    }
  | { ok: false; motivo: "opcao_nao_encontrada" | "falha_envio"; detalhe?: string };

/** Horas a partir das quais a disponibilidade precisa ser reconfirmada. */
const STALE_HOURS = 6;

export async function resendFlightOption(params: {
  conversationId: string;
  waPhone: string;
  quoteId: string;
  optionIndex: number;
  formato?: ResendFormat;
}): Promise<ResendResult> {
  const { conversationId, waPhone, quoteId, optionIndex } = params;
  const formato: ResendFormat = params.formato ?? "automatico";
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: row } = await supabaseAdmin
    .from("wa_flight_quotes")
    .select("id, payload, created_at, agent_slug, agent_name")
    .eq("id", quoteId)
    .eq("conversation_id", conversationId)
    .maybeSingle();

  const quote = (row?.payload ?? null) as
    | {
        origem_nome?: string;
        destino_nome?: string;
        opcoes?: Array<Record<string, unknown>>;
      }
    | null;
  const opcoes = quote?.opcoes ?? [];
  const op = opcoes.find((o, i) => Number((o as { opcao?: number }).opcao ?? i + 1) === optionIndex);
  if (!row || !quote || !op) {
    return { ok: false, motivo: "opcao_nao_encontrada" };
  }

  const idadeHoras = (Date.now() - new Date(row.created_at as string).getTime()) / 3_600_000;
  const stale = idadeHoras >= STALE_HOURS;
  const autor = {
    slug: (row.agent_slug as string | null) ?? null,
    nome: (row.agent_name as string | null) ?? null,
  };

  const { saveMessage, setSendError, SENDING_CLAIM } = await import("./conversation.server");
  const { formatOptionText } = await import("./flight-option-text.server");
  const { sendWhatsAppImageBytesDetailed, sendWhatsAppText } = await import("./send.server");
  const { abortIfHumanTookOver } = await import("./human-takeover.server");

  if (await abortIfHumanTookOver(conversationId, `reenvio_opcao_${optionIndex}`)) {
    return { ok: false, motivo: "falha_envio", detalhe: "assunção humana" };
  }

  const salvarLog = (format: "card" | "texto", messageId: string | null) =>
    logCardEvent({
      event: "option_resent",
      conversation_id: conversationId,
      quote_id: quoteId,
      option_index: optionIndex,
      card_type: "flight_option",
      meta_message_id: messageId,
      delivery_status: "sent",
      resend_format: format,
      sent_at: new Date().toISOString(),
    });

  const resumo = (() => {
    const ida = (op as { ida?: { cia?: string; partida?: string; chegada?: string } }).ida ?? {};
    const total = Number((op as { total?: number }).total ?? 0);
    return `opção ${optionIndex} · ${ida.cia ?? "—"} · ${String(ida.partida ?? "").split(" ")[1] ?? "—"} → ${String(ida.chegada ?? "").split(" ")[1] ?? "—"} · ${total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`;
  })();

  // ---- fallback em texto (também é o caminho quando o agente pede "texto")
  const enviarTexto = async (): Promise<ResendResult> => {
    let texto: string;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      texto = formatOptionText(quote as any, op as any, optionIndex);
      if (!texto.trim()) throw new Error("texto vazio");
    } catch (e) {
      return { ok: false, motivo: "falha_envio", detalhe: (e as Error)?.message };
    }
    const msg = await saveMessage({
      conversation_id: conversationId,
      direction: "outbound",
      sender: "camila",
      content: texto,
      agent_slug: autor.slug,
      agent_name: autor.nome,
      quote_id: quoteId,
      option_index: optionIndex,
      source_tool: "reenviar_opcao",
      card_option: op as unknown,
      message_type: "fallback",
      product_type: "flight",
    });
    const r = await sendWhatsAppText(waPhone, texto);
    if (msg?.id) {
      await supabaseAdmin
        .from("wa_messages")
        .update({ wa_message_id: r.id ?? null, error: r.error ?? null })
        .eq("id", msg.id);
    }
    if (r.error) return { ok: false, motivo: "falha_envio", detalhe: String(r.error).slice(0, 200) };
    salvarLog("texto", r.id ?? null);
    return {
      ok: true,
      quote_id: quoteId,
      option_index: optionIndex,
      format: "texto",
      message_id: r.id ?? null,
      stale,
      resumo,
    };
  };

  if (formato === "texto") return enviarTexto();

  // ---- reenvio do ORÇAMENTO PÚBLICO (texto curto + link, sem arte)
  try {
    const { prepararLinkDaOpcao } = await import("./flight-quote-link.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { texto } = await prepararLinkDaOpcao({
      result: quote as any,
      option: op as any,
      numero: optionIndex,
      agentName: autor.nome,
      conversationId,
      flightQuoteId: quoteId,
    });

    const msg = await saveMessage({
      conversation_id: conversationId,
      direction: "outbound",
      sender: "camila",
      content: texto,
      agent_slug: autor.slug,
      agent_name: autor.nome,
      quote_id: quoteId,
      option_index: optionIndex,
      source_tool: "reenviar_opcao",
      card_option: op as unknown,
      message_type: "card",
      product_type: "flight",
    });
    if (msg?.id) await setSendError(msg.id, SENDING_CLAIM);

    const r = await sendWhatsAppText(waPhone, texto);
    if (msg?.id) {
      await supabaseAdmin
        .from("wa_messages")
        .update({ wa_message_id: r.id ?? null, error: r.error ?? null })
        .eq("id", msg.id);
    }
    if (r.error) throw new Error(String(r.error).slice(0, 200));
    salvarLog("card", r.id ?? null);
    return {
      ok: true,
      quote_id: quoteId,
      option_index: optionIndex,
      format: "card",
      message_id: r.id ?? null,
      stale,
      resumo,
    };
  } catch (e) {
    logCardEvent({
      event: "card_failed",
      conversation_id: conversationId,
      quote_id: quoteId,
      option_index: optionIndex,
      card_type: "flight_option",
      failed_stage: "image_render",
      failure_reason: `reenvio: ${(e as Error)?.message ?? "falha"}`,
      delivery_status: "failed",
      fallback_sent: true,
    });
    if (formato === "card") return { ok: false, motivo: "falha_envio", detalhe: (e as Error)?.message };
    return enviarTexto();
  }
}
