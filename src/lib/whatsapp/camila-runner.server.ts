/**
 * Runner da Camila: recebe uma conversa, monta contexto, executa o loop
 * do AI SDK com tools, e envia as respostas de volta pelo WhatsApp.
 * SERVER-ONLY.
 */
import { generateText, stepCountIs, type ModelMessage } from "ai";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";
import { CAMILA_SYSTEM_PROMPT } from "@/lib/chat/camila-prompt";
import {
  getOrCreateConversation,
  loadHistory,
  saveMessage,
  type WaConversation,
} from "./conversation.server";
import { buildCamilaTools } from "./tools.server";
import { sendWhatsAppBubbles } from "./send.server";

function buildSystemPrompt(conv: WaConversation): string {
  const parts = [CAMILA_SYSTEM_PROMPT];
  parts.push(`\n\n# CONTEXTO DESTA CONVERSA`);
  parts.push(`- Telefone: ${conv.wa_phone}`);
  if (conv.display_name) parts.push(`- Cliente reconhecido: ${conv.display_name}`);
  else parts.push(`- Cliente NÃO reconhecido no cadastro. Para localizar pedido, aceite número do pedido, localizador/reserva ou CPF — qualquer um sozinho.`);
  if (conv.identity_verified_at) {
    parts.push(`- ✅ Identidade JÁ VERIFICADA (CPF ${conv.identity_verified_cpf?.slice(-4).padStart(11, "*")}). Pode falar de dados financeiros/pedidos.`);
  } else {
    parts.push(`- Para consultas, nunca exija CPF: número do pedido, localizador/reserva ou CPF são equivalentes e basta um. pedir_confirmacao_identidade é somente para ações sensíveis.`);
  }
  parts.push(`- Data/hora atual: ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`);
  return parts.join("\n");
}

/**
 * Executa Camila para uma conversa. Não retorna a resposta — envia direto pelo WhatsApp
 * e persiste no banco.
 */
export async function runCamila(input: { wa_phone: string; profile_name?: string | null }): Promise<void> {
  const conv = await getOrCreateConversation(input.wa_phone, input.profile_name);

  // Se estiver em modo humano ou resolvido, não responde
  if (conv.mode !== "ai") {
    console.log(`[camila] conversa ${conv.id} em modo ${conv.mode} — Camila não responde`);
    return;
  }

  const key = process.env.LOVABLE_API_KEY;
  if (!key) {
    console.error("[camila] LOVABLE_API_KEY ausente");
    return;
  }

  // Escopo do histórico: só as mensagens do protocolo ATIVO. Se não houver protocolo ativo,
  // usa o último closed_at pra não puxar assuntos de atendimentos já encerrados.
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  let sinceIso: string | undefined;
  if (conv.protocolo_ativo_id) {
    const { data: p } = await supabaseAdmin
      .from("wa_protocolos")
      .select("opened_at")
      .eq("id", conv.protocolo_ativo_id)
      .maybeSingle();
    sinceIso = p?.opened_at ?? undefined;
  } else {
    const { data: last } = await supabaseAdmin
      .from("wa_protocolos")
      .select("closed_at")
      .eq("conversation_id", conv.id)
      .not("closed_at", "is", null)
      .order("closed_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    sinceIso = last?.closed_at ?? undefined;
  }

  const history = await loadHistory(conv.id, 30, sinceIso);
  const messages: ModelMessage[] = history.map((m) => ({
    role: m.sender === "customer" ? "user" : "assistant",
    content: m.content,
  }));


  const gateway = createLovableAiGatewayProvider(key);
  const model = gateway("google/gemini-3.5-flash");
  const tools = buildCamilaTools(conv);
  // Remove marker interno antes de passar pro AI SDK
  const cleanTools: Record<string, unknown> = { ...tools };
  delete cleanTools._meta;

  // Executa a geração com timeout explícito + 1 retry curto em caso de cancelamento/timeout.
  // Motivo: Cloudflare Worker pode cancelar a request longa (HTTP 499) e deixar o cliente sem resposta.
  const runOnce = async (timeoutMs: number) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await generateText({
        model,
        system: buildSystemPrompt(conv),
        messages,
        tools: cleanTools as never,
        toolsContext: undefined as never,
        stopWhen: stepCountIs(10),
        temperature: 0.6,
        abortSignal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  };

  let result: Awaited<ReturnType<typeof runOnce>> | null = null;
  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      result = await runOnce(attempt === 1 ? 25_000 : 20_000);
      break;
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[camila] tentativa ${attempt} falhou:`, msg);
    }
  }

  if (!result) {
    const msg = lastErr instanceof Error ? lastErr.message : String(lastErr);
    console.error("[camila] erro final na geração:", msg);
    // Log interno
    await saveMessage({
      conversation_id: conv.id,
      direction: "outbound",
      sender: "system",
      content: `[erro Camila] ${msg}`,
    });
    // Fallback visível pro cliente pra NUNCA deixar sem resposta
    const fallback =
      "Opa, tive um probleminha rápido aqui do meu lado 🙈 Já já retomo com você, tá? Se quiser, pode reenviar sua última mensagem 💛";
    try {
      await saveMessage({
        conversation_id: conv.id,
        direction: "outbound",
        sender: "camila",
        content: fallback,
      });
      await sendWhatsAppBubbles(conv.wa_phone, fallback);
    } catch (sendErr) {
      console.error("[camila] falha ao enviar fallback:", sendErr);
    }
    return;
  }

  const text = result.text?.trim();
  if (!text) {
    console.warn("[camila] resposta vazia — enviando fallback");
    const fallback =
      "Deixa eu confirmar uma informação aqui rapidinho e já volto pra te responder direitinho 💛";
    await saveMessage({
      conversation_id: conv.id,
      direction: "outbound",
      sender: "camila",
      content: fallback,
    });
    await sendWhatsAppBubbles(conv.wa_phone, fallback);
    return;
  }

  const toolCallsSummary = result.steps
    ?.flatMap((s) => s.toolCalls ?? [])
    .map((tc) => ({ name: tc.toolName, input: tc.input }));

  await saveMessage({
    conversation_id: conv.id,
    direction: "outbound",
    sender: "camila",
    content: text,
    tool_calls: toolCallsSummary && toolCallsSummary.length > 0 ? toolCallsSummary : null,
  });

  const sent = await sendWhatsAppBubbles(conv.wa_phone, text);
  const failed = sent.filter((s) => s.error);
  if (failed.length > 0) {
    console.error("[camila] falha ao enviar balões:", failed);
  }
}
