/**
 * Runner de agentes (Camila / Roberto / futuros).
 * Escolhe o agente ativo para o horário atual (America/Sao_Paulo),
 * executa via AI SDK e envia resposta pelo WhatsApp.
 * SERVER-ONLY.
 */
import { generateText, stepCountIs, type ModelMessage } from "ai";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  getOrCreateConversation,
  loadHistory,
  saveMessage,
  ensureActiveProtocolo,
  type WaConversation,
  type WaProtocolo,
} from "./conversation.server";
import { buildCamilaTools } from "./tools.server";
import { sendWhatsAppBubbles } from "./send.server";
import { buildSenderPrefix, capitalizeBubbles, capitalizeKnownNames, firstName as extractFirstName } from "./text-utils.server";

type Agent = {
  id: string;
  slug: string;
  nome: string;
  system_prompt: string;
  horario_inicio: string; // "HH:MM:SS"
  horario_fim: string;
  timezone: string;
  ativo: boolean;
  tools_habilitadas: string[];
  temas_proibidos: string[];
  mensagem_ausencia: string | null;
};

function currentHourInSaoPaulo(): number {
  const fmt = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(new Date());
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return h + m / 60;
}

function hmToDecimal(hm: string): number {
  const [h, m] = hm.split(":").map(Number);
  return (h ?? 0) + (m ?? 0) / 60;
}

/** Retorna true se `now` (0..24) cai dentro do intervalo [inicio, fim), com virada de meia-noite. */
function isInWindow(now: number, inicio: number, fim: number): boolean {
  if (inicio === fim) return true;
  if (inicio < fim) return now >= inicio && now < fim;
  // vira o dia (ex.: 18:00 → 08:00)
  return now >= inicio || now < fim;
}

async function loadAgents(): Promise<Agent[]> {
  const { data } = await supabaseAdmin.from("ai_agents").select("*").eq("ativo", true);
  return (data ?? []) as unknown as Agent[];
}

function pickAgent(agents: Agent[]): Agent | null {
  if (!agents.length) return null;
  const now = currentHourInSaoPaulo();
  const match = agents.find((a) =>
    isInWindow(now, hmToDecimal(a.horario_inicio), hmToDecimal(a.horario_fim)),
  );
  // Fora de qualquer janela ativa → retorna null para disparar mensagem de ausência.
  return match ?? null;
}

function firstAvailableAusencia(agents: Agent[]): string | null {
  for (const a of agents) if (a.mensagem_ausencia) return a.mensagem_ausencia;
  return null;
}

function looksLikeRealName(v: string | null | undefined): boolean {
  if (!v) return false;
  const s = v.trim();
  if (s.length < 2) return false;
  // precisa ter pelo menos 2 letras seguidas (não só número/emoji/pontuação)
  if (!/[a-zA-ZÀ-ÿ]{2,}/.test(s)) return false;
  // rejeita placeholders comuns
  if (/^(user|cliente|test|teste|admin|whatsapp)$/i.test(s)) return false;
  return true;
}

function buildSystemPrompt(agent: Agent, conv: WaConversation, protocolo: WaProtocolo, _isNewProtocolo: boolean): string {
  const parts = [agent.system_prompt];
  parts.push(`\n\n# CONTEXTO DESTA CONVERSA`);
  parts.push(`- Você é: ${agent.nome}`);
  parts.push(`- Telefone do cliente: ${conv.wa_phone}`);
  const rawName = conv.display_name;
  if (looksLikeRealName(rawName)) {
    parts.push(`- nome_do_cliente (perfil whatsapp): "${rawName}" — parece nome real, pode usar o primeiro nome`);
  } else if (rawName) {
    parts.push(`- nome_do_cliente (perfil whatsapp): "${rawName}" — NÃO parece nome real, NÃO chame por esse valor. Pergunte como pode chamar.`);
  } else {
    parts.push(`- nome_do_cliente: não informado. Pergunte como pode chamar antes de continuar.`);
  }
  parts.push(`- Protocolo ATIVO: ${protocolo.numero} (uso interno — NÃO mencione o número ao cliente na abertura nem no meio da conversa; ele só aparece na mensagem automática de encerramento).`);

  if (conv.identity_verified_at) {
    parts.push(`- Identidade JÁ VERIFICADA. Pode falar de dados financeiros/pedidos.`);
  } else {
    parts.push(`- Para localizar/consultar pedido ou voo, aceite imediatamente UM destes dados: número do pedido, localizador/reserva ou CPF. Nunca exija CPF nem fale em segurança/privacidade. pedir_confirmacao_identidade é só para ações sensíveis, não para consultas.`);
  }
  if (agent.temas_proibidos?.length) {
    parts.push(`- Temas proibidos: ${agent.temas_proibidos.join(", ")}`);
  }
  parts.push(`- Data/hora atual (SP): ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`);
  return parts.join("\n");
}

export async function runAgent(input: { wa_phone: string; profile_name?: string | null }): Promise<void> {
  const conv = await getOrCreateConversation(input.wa_phone, input.profile_name);

  if (conv.mode !== "ai") {
    console.log(`[agent] conversa ${conv.id} em modo ${conv.mode} — IA não responde`);
    return;
  }

  const agents = await loadAgents();
  const agent = pickAgent(agents);

  if (!agent) {
    const msg =
      firstAvailableAusencia(agents) ??
      "olá! nosso setor comercial está encerrado no momento. o horário de atendimento é das 09h às 22h. para emergências fora desse horário, ligue no nosso plantão.";
    await saveMessage({
      conversation_id: conv.id,
      direction: "outbound",
      sender: "system",
      content: msg,
    });
    await sendWhatsAppBubbles(conv.wa_phone, msg);
    return;
  }

  const key = process.env.LOVABLE_API_KEY;
  if (!key) {
    console.error("[agent] LOVABLE_API_KEY ausente");
    return;
  }

  // Protocolo ativo (abre/reabre conforme regra) + detecta se ainda é a primeira resposta nele
  const protocolo = await ensureActiveProtocolo(conv.id);

  // Escopo do histórico: SÓ mensagens do protocolo atual (desde opened_at).
  // Sem isso a IA puxa assunto de protocolos anteriores encerrados.
  const { data: pMeta } = await supabaseAdmin
    .from("wa_protocolos")
    .select("opened_at")
    .eq("id", protocolo.id)
    .maybeSingle();
  const sinceIso: string | undefined = pMeta?.opened_at ?? undefined;

  const history = await loadHistory(conv.id, 30, sinceIso);
  const messages: ModelMessage[] = history.map((m) => ({
    role: m.sender === "customer" ? "user" : "assistant",
    content: m.content,
  }));

  const { count: outboundNoProto } = await supabaseAdmin
    .from("wa_messages")
    .select("id", { count: "exact", head: true })
    .eq("protocolo_id", protocolo.id)
    .eq("direction", "outbound");
  const isNewProtocolo = (outboundNoProto ?? 0) === 0;


  const gateway = createLovableAiGatewayProvider(key);
  const model = gateway("google/gemini-3.5-flash");
  const tools = buildCamilaTools(conv);
  const cleanTools: Record<string, unknown> = { ...tools };
  delete cleanTools._meta;

  try {
    const result = await generateText({
      model,
      system: buildSystemPrompt(agent, conv, protocolo, isNewProtocolo),
      messages,
      tools: cleanTools as never,
      toolsContext: undefined as never,
      stopWhen: stepCountIs(10),
      temperature: 0.6,
    });

    const rawText = result.text?.trim();
    if (!rawText) {
      console.warn(`[agent:${agent.slug}] resposta vazia`);
      return;
    }
    // Garante primeira letra maiúscula em cada balão (o modelo escreve tudo minúsculo)
    // e capitaliza o primeiro nome do cliente sempre que aparecer no meio do texto.
    const clientFirst = extractFirstName(conv.display_name);
    const text = capitalizeKnownNames(capitalizeBubbles(rawText), [clientFirst]);

    const toolCallsSummary = result.steps
      ?.flatMap((s) => s.toolCalls ?? [])
      .map((tc) => ({ name: tc.toolName, input: tc.input }));

    await saveMessage({
      conversation_id: conv.id,
      direction: "outbound",
      sender: agent.slug === "roberto" ? "camila" : "camila", // sender enum only allows camila/human/system; we track agent separately
      content: text,
      tool_calls: toolCallsSummary && toolCallsSummary.length > 0 ? toolCallsSummary : null,
    });

    // Marca agente atendente
    await supabaseAdmin
      .from("wa_conversations")
      .update({ agent_slug: agent.slug })
      .eq("id", conv.id);

    const prefix = buildSenderPrefix(agent.nome);
    const sent = await sendWhatsAppBubbles(conv.wa_phone, text, prefix);
    const failed = sent.filter((s) => s.error);
    if (failed.length > 0) console.error(`[agent:${agent.slug}] falha ao enviar:`, failed);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[agent:${agent.slug}] erro:`, msg);
    await saveMessage({
      conversation_id: conv.id,
      direction: "outbound",
      sender: "system",
      content: `[erro ${agent.slug}] ${msg}`,
    });
  }
}
