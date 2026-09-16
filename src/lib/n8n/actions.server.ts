/**
 * Execução das ações decididas pelo n8n. SERVER-ONLY.
 *
 * Princípio: o n8n DECIDE, o Lovable EXECUTA — e sempre reverifica as travas
 * antes de qualquer envio (modo da conversa, ai_paused, assunção humana, kill
 * switch global, bloqueio por fraude e validade do run).
 *
 * Nesta fase, as ações comerciais (pesquisa, checkout, revalidação, pagamento,
 * Pix) são apenas REGISTRADAS: nenhum fluxo de atendimento atual muda. Só
 * texto, pausa da IA, estado e handoff são efetivamente executados.
 */
import { applyAgentStatePatch } from "./state.server";

export const N8N_ACTION_TYPES = [
  "flight_search",
  "show_flight_cards",
  "request_data",
  "create_checkout",
  "revalidate",
  "payment",
  "pix",
  "handoff",
  "pause_ai",
] as const;

export type N8nActionType = (typeof N8N_ACTION_TYPES)[number];

export type N8nAction = { type: N8nActionType } & Record<string, unknown>;

export type ActionResult = { type: string; executed: boolean; detail: string };

/** Ações executadas de fato nesta fase. O resto fica registrado como pedido. */
const EXECUTAVEIS: N8nActionType[] = ["request_data", "handoff", "pause_ai"];

async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export type GuardResult =
  | { ok: true; conversation: { id: string; wa_phone: string; agent_slug: string | null; agent_name: string | null } }
  | { ok: false; reason: string };

/** Revalida TODAS as travas antes de executar um callback. */
export async function guardBeforeExecute(conversationId: string): Promise<GuardResult> {
  const { isAiGloballyOff } = await import("@/lib/whatsapp/ai-global-switch.server");
  if (await isAiGloballyOff()) return { ok: false, reason: "ai_globally_off" };

  const { isAiSilenced } = await import("@/lib/whatsapp/ai-silence.server");
  if (await isAiSilenced()) return { ok: false, reason: "ai_silenced" };

  const supabase = await db();
  const { data } = await supabase
    .from("wa_conversations")
    .select("id, wa_phone, mode, ai_paused, assigned_to, agent_slug, central_slug, fraud_transfer_required")
    .eq("id", conversationId)
    .maybeSingle();
  if (!data) return { ok: false, reason: "conversation_not_found" };
  const conv = data as Record<string, unknown>;
  if ((conv["mode"] as string) !== "ai") return { ok: false, reason: "not_in_ai_mode" };
  if (conv["ai_paused"]) return { ok: false, reason: "ai_paused" };
  if (conv["assigned_to"]) return { ok: false, reason: "human_assigned" };
  if (conv["fraud_transfer_required"]) return { ok: false, reason: "fraud_blocked" };

  const slug = (conv["central_slug"] as string | null) ?? (conv["agent_slug"] as string | null) ?? null;
  let nome: string | null = null;
  if (slug) {
    const { data: ag } = await supabase.from("ai_agents").select("nome").eq("slug", slug).maybeSingle();
    nome = (ag as { nome?: string } | null)?.nome ?? null;
  }
  return {
    ok: true,
    conversation: {
      id: String(conv["id"]),
      wa_phone: String(conv["wa_phone"] ?? ""),
      agent_slug: slug,
      agent_name: nome,
    },
  };
}

/**
 * Cadência natural entre bubbles. O envio físico ao WhatsApp acontece AQUI (o n8n só
 * manda o array no callback), então a espera fica nesta camada e não num Wait do n8n.
 * Tempo antes da PRÓXIMA bubble, conforme o tamanho dela: curta ~1–2 s, média ~2–4 s,
 * longa ~4–6 s, com variação aleatória. Mínimo de 0,7 s para nunca chegarem juntas e
 * teto total por resposta para não segurar o callback.
 */
export const BUBBLE_CADENCE_MIN_MS = 700;
export const BUBBLE_CADENCE_MAX_TOTAL_MS = 15_000;

export function bubbleDelayMs(texto: string, rand: () => number = Math.random): number {
  const n = String(texto ?? "").trim().length;
  const [min, max] = n <= 40 ? [1_000, 2_000] : n <= 160 ? [2_000, 4_000] : [4_000, 6_000];
  return Math.round(min + (max - min) * Math.min(1, Math.max(0, rand())));
}

/** Espera (ms) antes de cada bubble, na ordem. A primeira sai sem espera. */
export function planBubbleCadence(textos: string[], rand: () => number = Math.random): number[] {
  let total = 0;
  return textos.map((t, i) => {
    if (i === 0) return 0;
    const alvo = bubbleDelayMs(t, rand);
    const espera = Math.max(BUBBLE_CADENCE_MIN_MS, Math.min(alvo, BUBBLE_CADENCE_MAX_TOTAL_MS - total));
    total += espera;
    return espera;
  });
}

/** Envia os balões respeitando a trava de última hora de assunção humana. */
export async function sendReplyBubbles(args: {
  conversationId: string;
  waPhone: string;
  agentSlug: string | null;
  agentName: string | null;
  bubbles: string[];
  runId: string;
}): Promise<{ sent: number; aborted: boolean }> {
  const { abortIfHumanTookOver } = await import("@/lib/whatsapp/human-takeover.server");
  const { sendWhatsAppText } = await import("@/lib/whatsapp/send.server");
  const { saveMessage, setWaMessageId } = await import("@/lib/whatsapp/conversation.server");

  const textos = args.bubbles
    .map((b) =>
      String(b ?? "")
        .trim()
        .slice(0, 4000),
    )
    .filter(Boolean);
  const esperas = planBubbleCadence(textos);
  let inboundWaId: string | null | undefined;

  let enviados = 0;
  for (const [i, texto] of textos.entries()) {
    if (esperas[i]! > 0) {
      // "Digitando…" durante a espera, quando o canal suporta (mesmo recurso do fluxo atual).
      try {
        if (inboundWaId === undefined) inboundWaId = await ultimoInboundWaId(args.conversationId);
        const { sendWhatsAppTypingIndicator } = await import("@/lib/whatsapp/send.server");
        await sendWhatsAppTypingIndicator(inboundWaId ?? "", args.waPhone);
      } catch {
        /* indicador é opcional */
      }
      await new Promise((res) => setTimeout(res, esperas[i]));
    }
    // Trava de assunção humana conferida DEPOIS da espera, logo antes de cada envio.
    if (await abortIfHumanTookOver(args.conversationId, "n8n-reply")) {
      return { sent: enviados, aborted: true };
    }
    const salvo = await saveMessage({
      conversation_id: args.conversationId,
      direction: "outbound",
      sender: (args.agentSlug ?? "ai") as never,
      content: texto,
      agent_slug: args.agentSlug,
      agent_name: args.agentName,
      source_tool: "n8n",
      tool_calls: { run_id: args.runId } as never,
    });
    const r = await sendWhatsAppText(args.waPhone, texto);
    if (salvo?.id && r.id) await setWaMessageId(salvo.id, r.id);
    enviados += 1;
  }
  return { sent: enviados, aborted: false };
}

async function ultimoInboundWaId(conversationId: string): Promise<string | null> {
  const supabase = await db();
  const { data } = await supabase
    .from("wa_messages")
    .select("wa_message_id")
    .eq("conversation_id", conversationId)
    .eq("direction", "inbound")
    .not("wa_message_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as { wa_message_id?: string | null } | null)?.wa_message_id ?? null;
}

export async function executeActions(args: {
  conversationId: string;
  runId: string;
  actions: unknown;
}): Promise<ActionResult[]> {
  const lista = Array.isArray(args.actions) ? (args.actions as N8nAction[]) : [];
  const out: ActionResult[] = [];
  const supabase = await db();

  for (const acaoRaw of lista.slice(0, 10)) {
    const tipo = String((acaoRaw as { type?: unknown })?.type ?? "") as N8nActionType;
    if (!N8N_ACTION_TYPES.includes(tipo)) {
      out.push({ type: tipo || "unknown", executed: false, detail: "tipo de ação desconhecido" });
      continue;
    }
    if (!EXECUTAVEIS.includes(tipo)) {
      out.push({
        type: tipo,
        executed: false,
        detail: "ação registrada; execução comercial ainda não habilitada nesta fase",
      });
      continue;
    }

    try {
      if (tipo === "pause_ai") {
        await supabase
          .from("wa_conversations")
          .update({ ai_paused: true } as never)
          .eq("id", args.conversationId);
        out.push({ type: tipo, executed: true, detail: "IA pausada nesta conversa" });
        continue;
      }
      if (tipo === "request_data") {
        const brutos = (acaoRaw as { fields?: unknown }).fields;
        const campos = Array.isArray(brutos) ? brutos.map((f) => String(f)).slice(0, 10) : [];
        await applyAgentStatePatch(args.conversationId, { awaiting: campos.join(",") || null });
        out.push({ type: tipo, executed: true, detail: `aguardando: ${campos.join(", ") || "—"}` });
        continue;
      }
      if (tipo === "handoff") {
        const r = await performHandoff({
          conversationId: args.conversationId,
          to: String((acaoRaw as { to?: unknown }).to ?? "human"),
          reason: String((acaoRaw as { reason?: unknown }).reason ?? "n8n_handoff"),
          briefing: String((acaoRaw as { briefing?: unknown }).briefing ?? "").slice(0, 2000) || undefined,
          actor: "n8n",
        });
        out.push({ type: tipo, executed: r.executed, detail: r.detail });
        continue;
      }
    } catch (e) {
      out.push({ type: tipo, executed: false, detail: e instanceof Error ? e.message : String(e) });
    }
  }
  return out;
}

/**
 * Handoff único do n8n: usado pela action "handoff" E pelo fallback técnico
 * (dispatch.server.ts). Não existe outro caminho de transferência.
 *
 * Com onlyIfInAiMode, a troca para humano é ATÔMICA e só acontece se a
 * conversa ainda estiver em IA e sem humano atribuído — nunca gera dois
 * handoffs nem tira a conversa de um atendente.
 */
export async function performHandoff(args: {
  conversationId: string;
  to?: string;
  reason: string;
  briefing?: string;
  actor: string;
  onlyIfInAiMode?: boolean;
}): Promise<{ executed: boolean; detail: string }> {
  const supabase = await db();
  const { recordHandoff } = await import("@/lib/whatsapp/conversation.server");
  const destino = args.to ?? "human";

  if (args.onlyIfInAiMode) {
    const { data } = await supabase
      .from("wa_conversations")
      .update({ mode: "human", priority: "high" } as never)
      .eq("id", args.conversationId)
      .eq("mode", "ai")
      .is("assigned_to", null)
      .select("id");
    if (!Array.isArray(data) || data.length === 0) {
      return { executed: false, detail: "conversa não está mais em modo IA" };
    }
    await recordHandoff({
      conversation_id: args.conversationId,
      from_mode: "ai",
      to_mode: "human",
      reason: args.reason,
      briefing: args.briefing,
      actor: args.actor,
    });
    await applyAgentStatePatch(args.conversationId, { handoff_status: "human" });
    return { executed: true, detail: "handoff para human" };
  }

  await recordHandoff({
    conversation_id: args.conversationId,
    from_mode: "ai",
    to_mode: destino === "human" ? "human" : "ai",
    reason: args.reason,
    briefing: args.briefing,
    actor: args.actor,
  });
  if (destino === "human") {
    await supabase
      .from("wa_conversations")
      .update({ mode: "human", priority: "high" } as never)
      .eq("id", args.conversationId);
  }
  await applyAgentStatePatch(args.conversationId, { handoff_status: destino });
  return { executed: true, detail: `handoff para ${destino}` };
}
