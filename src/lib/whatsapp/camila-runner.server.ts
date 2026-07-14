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
  else parts.push(`- Cliente NÃO reconhecido no cadastro. Se pedir dados sensíveis, peça o CPF antes.`);
  if (conv.identity_verified_at) {
    parts.push(`- ✅ Identidade JÁ VERIFICADA (CPF ${conv.identity_verified_cpf?.slice(-4).padStart(11, "*")}). Pode falar de dados financeiros/pedidos.`);
  } else {
    parts.push(`- ⚠️ Identidade AINDA NÃO VERIFICADA. Para dados sensíveis (valor, pagamento, alteração), chame pedir_confirmacao_identidade primeiro.`);
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

  const history = await loadHistory(conv.id, 30);
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

  try {
    const result = await generateText({
      model,
      system: buildSystemPrompt(conv),
      messages,
      tools: cleanTools as never,
      stopWhen: stepCountIs(10),
      temperature: 0.6,
    });

    const text = result.text?.trim();
    if (!text) {
      console.warn("[camila] resposta vazia");
      return;
    }

    // Persiste como saída da Camila
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

    // Envia pra Meta em balões
    const sent = await sendWhatsAppBubbles(conv.wa_phone, text);
    const failed = sent.filter((s) => s.error);
    if (failed.length > 0) {
      console.error("[camila] falha ao enviar balões:", failed);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[camila] erro na geração:", msg);
    // Fallback humano
    await saveMessage({
      conversation_id: conv.id,
      direction: "outbound",
      sender: "system",
      content: `[erro Camila] ${msg}`,
    });
  }
}
