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
import { buildSenderPrefix, capitalizeBubbles, capitalizeKnownNames, fixGluedSentences, mergeQuestionBubbles, stripReintroBubbles, firstName as extractFirstName } from "./text-utils.server";
import { buildSharedAgentPrompt } from "@/lib/chat/camila-prompt";
import { isCompanyDataBlocked } from "./data-blocklist";

// Gênero por slug (usado pra montar o prompt compartilhado com a flexão certa).
const AGENT_GENDER: Record<string, "f" | "m"> = {
  camila: "f",
  nath: "f",
  maria: "f",
  roberto: "m",
  fabricio: "m",
  giovani: "m",
};
function genderOf(slug: string): "f" | "m" {
  return AGENT_GENDER[slug.toLowerCase()] ?? "f";
}


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

function pickAgent(agents: Agent[], stickySlug?: string | null): Agent | null {
  if (!agents.length) return null;
  const now = currentHourInSaoPaulo();
  const inWindow = agents.filter((a) =>
    isInWindow(now, hmToDecimal(a.horario_inicio), hmToDecimal(a.horario_fim)),
  );
  // stickiness DENTRO do mesmo protocolo: só mantém o agente se ele ainda
  // está no plantão agora. Se saiu da janela (ex.: Roberto do noturno num
  // horário de dia), sorteia outro entre os disponíveis — nunca deixa um
  // agente fora do turno responder porque atendeu antes.
  if (stickySlug) {
    const kept = inWindow.find((a) => a.slug === stickySlug);
    if (kept) return kept;
  }
  if (!inWindow.length) return null;
  return inWindow[Math.floor(Math.random() * inWindow.length)];
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

function buildSystemPrompt(agent: Agent, conv: WaConversation, protocolo: WaProtocolo, _isNewProtocolo: boolean, previousContext?: string): string {
  // Sempre gera o prompt compartilhado com o nome/gênero deste agente,
  // ignorando o system_prompt armazenado (mantém a base única pra todo o time).
  const base = buildSharedAgentPrompt(agent.nome, genderOf(agent.slug));
  const parts = [base];

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
  parts.push(
    `- Mensagens marcadas com "[sistema · <tipo>]" no histórico são AÇÕES AUTOMÁTICAS que a VIA AIR já enviou pra esse cliente (check-in, alerta/cancelamento de voo, voucher, recibo, contrato). ` +
    `Elas trazem localizador, número do voo, pedido, data, passageiro e outros dados. ` +
    `Se o cliente responder algo ligado a esse assunto (ex.: "remarcar voo", "quero reembolso", "não recebi o cartão", "quando é o voo?"), ` +
    `USE ESSES DADOS DIRETO — jamais peça localizador/CPF/número do pedido pra localizar algo que já está no [sistema · ...]. ` +
    `Assuma que o pedido está identificado por esse localizador e siga o atendimento.`
  );

  if (previousContext?.trim()) {
    parts.push(
      `\n# 🧠 HISTÓRICO ANTERIOR DESTE MESMO CLIENTE (protocolos passados — contexto, NÃO responda a essas mensagens)\n` +
      `"""\n${previousContext.slice(-8000)}\n"""\n` +
      `Use esse histórico pra ENTENDER do que o cliente está falando agora. ` +
      `Se ele citar "a cotação", "o pacote que pedi", "o comercial não me retornou", "aquela viagem", ` +
      `procure a solicitação aqui e retome o assunto pelo nome (destino, datas, nº de pax, hotel, valores já enviados). ` +
      `Se ele pedir o resumo da solicitação, REESCREVA o resumo a partir deste histórico — não peça pra ele repetir.`
    );
  }

  parts.push(
    `\n# ✍️ FORMATAÇÃO OBRIGATÓRIA (WhatsApp)\n` +
    `- Cada ideia/frase vai em um PARÁGRAFO próprio, separado por UMA LINHA EM BRANCO (\\n\\n). Nunca junte tudo num único bloco.\n` +
    `- Resumos e listas SEMPRE em tópicos, um por linha, começando com "- " (ex.: "- Origem: Maringá").\n` +
    `- Antes de uma lista, quebre a linha depois dos dois-pontos.\n` +
    `- Nunca cole palavras/frases (proibido "PerfeitoO Fabrício", "pedido.Vou", "HotelVou"): sempre espaço ou quebra de linha.\n` +
    `- Máximo ~3 linhas por parágrafo. Sem markdown de título; negrito só com *asterisco simples*.`
  );


  parts.push(
    `\n# ❌ NUNCA PEÇA DADO QUE NÃO EXISTE\n` +
    `- Se o assunto é COTAÇÃO / ORÇAMENTO / PROPOSTA / "o comercial não entrou em contato", NÃO existe pedido, nem localizador, nem reserva. ` +
    `É PROIBIDO pedir número do pedido, localizador, reserva ou CPF nesses casos. ` +
    `Reconheça o ocorrido, retome a solicitação a partir do histórico e diga que vai priorizar o retorno.\n` +
    `- Só peça pedido/localizador/CPF quando o cliente falar de uma COMPRA JÁ EMITIDA (voucher, bilhete, check-in, reembolso, remarcação) ` +
    `E não houver nenhum dado no histórico que identifique essa compra.\n` +
    `- Antes de perguntar qualquer coisa, releia o histórico: se a informação já foi dita alguma vez, use-a.`
  );



  if (conv.identity_verified_at) {
    parts.push(`- Identidade JÁ VERIFICADA. Pode falar de dados financeiros/pedidos.`);
  } else {
    parts.push(`- Para localizar/consultar pedido ou voo, aceite imediatamente UM destes dados: número do pedido, localizador/reserva ou CPF. Nunca exija CPF nem fale em segurança/privacidade. pedir_confirmacao_identidade é só para ações sensíveis, não para consultas.`);
  }
  if (agent.temas_proibidos?.length) {
    parts.push(`- Temas proibidos: ${agent.temas_proibidos.join(", ")}`);
  }
  if (isCompanyDataBlocked(conv.wa_phone)) {
    parts.push(
      `- 🚫 RESTRIÇÃO DESTE CONTATO: é PROIBIDO informar qualquer dado cadastral/corporativo da VIA AIR pra este número — ` +
      `CNPJ, razão social, inscrição municipal/estadual, endereço da agência, dados bancários/Pix da empresa, cartão CNPJ, contrato social, ` +
      `nome de sócios ou qualquer documento da empresa. Se pedirem, responda educadamente que esses dados são tratados diretamente pela ` +
      `diretoria e que um responsável entrará em contato, e siga o atendimento normalmente. Nunca explique que há bloqueio.`
    );
  }
  const instruction = (conv as unknown as { ai_instruction?: string | null }).ai_instruction?.trim();
  if (instruction) {
    parts.push(
      `\n# 🎯 ORIENTAÇÃO DO SUPERVISOR (PRIORIDADE MÁXIMA — VÁLIDA SÓ PARA ESTA RESPOSTA)\n` +
      `Um atendente humano da VIA AIR deixou esta instrução do que responder agora:\n"""\n${instruction}\n"""\n` +
      `OBRIGATÓRIO: transmita TODOS os pontos dessa orientação na próxima resposta — nada de resumir, ` +
      `suavizar ou trocar por uma frase genérica. Se a orientação tem 3 informações, sua resposta tem as 3. ` +
      `Ela vale mais que qualquer inferência sua sobre o que dizer, e mais que o roteiro padrão. ` +
      `Mantenha só o seu tom e a sua persona. ` +
      `NUNCA mencione que recebeu instrução, nem cite supervisor/atendente/sistema — fale como se fosse a sua própria resposta.`
    );

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

  if ((conv as unknown as { ai_paused?: boolean | null }).ai_paused) {
    console.log(`[agent] conversa ${conv.id} com IA pausada pelo atendente — não responde`);
    return;
  }

  const agents = await loadAgents();
  const stickySlug = (conv as unknown as { agent_slug?: string | null }).agent_slug ?? null;
  const agent = pickAgent(agents, stickySlug);



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

  // CONTEXTO ANTERIOR: mensagens de ANTES do protocolo atual (últimos 45 dias).
  // O cliente frequentemente retoma um assunto antigo ("o comercial não entrou
  // em contato", "e a cotação?"). Sem esse histórico a IA não entende do que
  // ele fala e acaba pedindo pedido/localizador/CPF sem necessidade.
  let previousContext = "";
  if (sinceIso) {
    const prevSince = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString();
    const { data: prevRows } = await supabaseAdmin
      .from("wa_messages")
      .select("sender, direction, content, created_at")
      .eq("conversation_id", conv.id)
      .lt("created_at", sinceIso)
      .gte("created_at", prevSince)
      .order("created_at", { ascending: false })
      .limit(40);
    const prev = ((prevRows ?? []) as Array<{ sender: string; content: string; created_at: string }>).reverse();
    if (prev.length) {
      previousContext = prev
        .map((m) => {
          const when = new Date(m.created_at).toLocaleString("pt-BR", {
            timeZone: "America/Sao_Paulo",
            day: "2-digit",
            month: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
          });
          const who = m.sender === "customer" ? "CLIENTE" : "VIA AIR";
          return `[${when}] ${who}: ${String(m.content ?? "").slice(0, 700)}`;
        })
        .join("\n");
    }
  }


  // CONTEXTO OPERACIONAL: pega TAMBÉM as mensagens automáticas (check-in,
  // alerta de voo, voucher, cobrança) dos últimos 7 dias que estão FORA do
  // protocolo atual — quando o cliente abre um novo protocolo respondendo
  // a uma ação nossa (ex.: "Remarcar voo" depois do alerta), a IA precisa
  // saber o que já foi enviado (localizador, voo, etc). Sem isso ela pede
  // dado que a gente já tem.
  const recentSince = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: sysRows } = await supabaseAdmin
    .from("wa_messages")
    .select("id, conversation_id, direction, sender, content, wa_message_id, tool_calls, protocolo_id, created_at, deleted_at")
    .eq("conversation_id", conv.id)
    .eq("sender", "system")
    .eq("direction", "outbound")
    .gte("created_at", recentSince)
    .order("created_at", { ascending: true });

  const seenIds = new Set(history.map((h) => h.id));
  const merged = [...history];
  for (const r of ((sysRows ?? []) as typeof history)) {
    if (!seenIds.has(r.id)) merged.push(r);
  }
  merged.sort((a, b) => a.created_at.localeCompare(b.created_at));

  const messages: ModelMessage[] = merged.map((m) => {
    const wasDeleted = !!(m as { deleted_at?: string | null }).deleted_at;
    const content = wasDeleted
      ? `[MENSAGEM APAGADA PELO CLIENTE — ignore, não responda a esta mensagem específica] ${m.content}`
      : m.content;
    return {
      role: m.sender === "customer" ? "user" : "assistant",
      content,
    };
  });

  // A orientação do atendente entra TAMBÉM como última mensagem do contexto:
  // é a posição que o modelo mais respeita, evitando respostas genéricas que
  // ignoram o conteúdo pedido.
  {
    const instr = (conv as unknown as { ai_instruction?: string | null }).ai_instruction?.trim();
    if (instr) {
      messages.push({
        role: "user",
        content:
          `[MENSAGEM INTERNA DO SISTEMA — NÃO É O CLIENTE FALANDO. NÃO RESPONDA A ELA, EXECUTE-A]\n` +
          `Responda AGORA ao cliente dizendo exatamente o conteúdo abaixo, com suas palavras e seu tom, ` +
          `sem omitir NENHUMA das informações pedidas:\n"""\n${instr}\n"""\n` +
          `Regras: cubra 100% dos pontos citados acima; não substitua por frases genéricas de encerramento ` +
          `("qualquer coisa me chame", "tenha uma ótima noite") a menos que a orientação peça isso; ` +
          `não mencione atendente/supervisor/instrução; escreva como se fosse você mesma.`,
      });
    }
  }


  const { count: outboundNoProto } = await supabaseAdmin
    .from("wa_messages")
    .select("id", { count: "exact", head: true })
    .eq("protocolo_id", protocolo.id)
    .eq("direction", "outbound");
  const isNewProtocolo = (outboundNoProto ?? 0) === 0;


  const gateway = createLovableAiGatewayProvider(key);
  const tools = buildCamilaTools(conv);
  const cleanTools: Record<string, unknown> = { ...tools };
  delete cleanTools._meta;

  // Cadeia de modelos: se o gateway devolver 502/503 (Bad Gateway) num modelo,
  // espera um pouco e tenta o próximo antes de desistir.
  const MODEL_CHAIN = [
    "google/gemini-2.5-flash",
    "google/gemini-2.5-pro",
    "google/gemini-2.5-flash-lite",
  ];
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  try {
    const system = buildSystemPrompt(agent, conv, protocolo, isNewProtocolo, previousContext);
    let result: { text?: string; steps?: Array<{ toolCalls?: Array<{ toolName: string; input: unknown }> }> } | null = null;
    let lastErr: unknown = null;
    for (let i = 0; i < MODEL_CHAIN.length; i++) {
      try {
        result = await generateText({
          model: gateway(MODEL_CHAIN[i]),
          system,
          messages,
          tools: cleanTools as never,
          toolsContext: undefined as never,
          stopWhen: stepCountIs(10),
          temperature: 0.6,
        });
        break;
      } catch (e) {
        lastErr = e;
        const m = e instanceof Error ? e.message : String(e);
        console.warn(`[agent:${agent.slug}] modelo ${MODEL_CHAIN[i]} falhou: ${m}`);
        if (i < MODEL_CHAIN.length - 1) await sleep(1500 * (i + 1));
      }
    }
    if (!result) throw lastErr ?? new Error("Falha ao gerar resposta");


    const rawText = result.text?.trim();
    if (!rawText) {
      console.warn(`[agent:${agent.slug}] resposta vazia`);
      return;
    }
    // GUARDA ANTI-LIXO: nunca mandar pro cliente respostas que sejam só código de
    // erro / eco técnico do gateway (ex.: "(502)", "Bad Gateway", "AI_APICallError").
    const junk =
      /^[\s(]*\d{3}[\s)]*$/.test(rawText) ||
      /(bad gateway|ai_apicallerror|service unavailable|internal server error|\b50[0-9]\b\s*$)/i.test(
        rawText,
      );
    if (junk || rawText.length < 2) {
      console.warn(`[agent:${agent.slug}] resposta descartada (lixo técnico): ${rawText}`);
      await supabaseAdmin
        .from("wa_conversations")
        .update({ ai_debounce_until: new Date(Date.now() + 60 * 1000).toISOString() })
        .eq("id", conv.id);
      return;
    }

    // Garante primeira letra maiúscula em cada balão (o modelo escreve tudo minúsculo)
    // e capitaliza o primeiro nome do cliente sempre que aparecer no meio do texto.
    const clientFirst = extractFirstName(conv.display_name);
    // Já existe mensagem nossa neste atendimento? Então nada de saudação/
    // apresentação de novo, nem prefixo "*Roberto:*" em toda mensagem.
    let jaFalouAntes = false;
    try {
      const { count } = await supabaseAdmin
        .from("wa_messages")
        .select("id", { count: "exact", head: true })
        .eq("conversation_id", conv.id)
        .eq("direction", "outbound")
        .neq("sender", "system");
      jaFalouAntes = (count ?? 0) > 0;
    } catch { /* noop */ }

    let text = capitalizeKnownNames(capitalizeBubbles(fixGluedSentences(rawText)), [clientFirst]);
    if (jaFalouAntes) text = stripReintroBubbles(text);
    text = mergeQuestionBubbles(text);

    const toolCallsSummary = result.steps
      ?.flatMap((s) => s.toolCalls ?? [])
      .map((tc) => ({ name: tc.toolName, input: tc.input }));

    const { splitToBubbles } = await import("./send.server");
    const bubbles = splitToBubbles(text);
    const savedRowIds: Array<string | null> = [];
    for (let i = 0; i < bubbles.length; i++) {
      const row = await saveMessage({
        conversation_id: conv.id,
        direction: "outbound",
        sender: "camila",
        agent_slug: agent.slug,
        content: bubbles[i],
        // tool_calls e reply só no primeiro balão
        tool_calls: i === 0 && toolCallsSummary && toolCallsSummary.length > 0 ? toolCallsSummary : null,
      });
      savedRowIds.push(row?.id ?? null);
    }


    // Marca agente atendente
    await supabaseAdmin
      .from("wa_conversations")
      .update({ agent_slug: agent.slug })
      .eq("id", conv.id);

    // FALLBACK DE ESCALAÇÃO: se a IA anunciou que está passando pro comercial
    // mas NÃO chamou a tool escalar_para_humano, marca aguardando_humano
    // mesmo assim pra aparecer "atendimento necessário" no painel.
    try {
      const lower = text.toLowerCase();
      const handoffPhrases = [
        "passar pro time",
        "passar para o time",
        "passei pro time",
        "passei para o time",
        "passar pro comercial",
        "passar para o comercial",
        "passei pro comercial",
        "passei para o comercial",
        "encaminhar pro comercial",
        "encaminhar para o comercial",
        "encaminhando pro comercial",
        "encaminhando para o comercial",
        "encaminhei pro comercial",
        "encaminhei para o comercial",
        "repassar pro comercial",
        "repassar para o comercial",
        "repassei pro comercial",
        "repassei para o comercial",
        "time comercial",
        "setor comercial",
        "consultor entra em contato",
        "consultor vai entrar em contato",
        "vou passar pro time",
      ];
      const mentionedHandoff = handoffPhrases.some((p) => lower.includes(p));
      const calledEscalate = (toolCallsSummary ?? []).some(
        (tc) => tc.name === "escalar_para_humano" || tc.name === "transferir_para_atendente",
      );
      const existingTags = ((conv as { tags?: string[] | null }).tags ?? []) as string[];
      const alreadyWaiting = existingTags.includes("aguardando_humano");
      if (mentionedHandoff && !calledEscalate && !alreadyWaiting) {
        const newTags = Array.from(new Set([...existingTags, "aguardando_humano", "escalada_implicita"]));
        await supabaseAdmin
          .from("wa_conversations")
          .update({ tags: newTags, assigned_to: null, priority: "normal" })
          .eq("id", conv.id);
        const { recordHandoff } = await import("./conversation.server");
        await recordHandoff({
          conversation_id: conv.id,
          from_mode: "ai",
          to_mode: "ai",
          reason: "aguardando_humano:escalada_implicita",
          briefing: "IA anunciou encaminhamento pro comercial sem chamar a tool — escalação inferida do texto.",
        }).catch(() => {});
        console.log(`[agent:${agent.slug}] escalação implícita detectada em conv ${conv.id}`);
      }
    } catch (e) {
      console.warn("[agent] fallback de escalação falhou:", e);
    }

    // Consome a orientação do supervisor (vale só para esta resposta).
    if ((conv as unknown as { ai_instruction?: string | null }).ai_instruction) {
      await supabaseAdmin
        .from("wa_conversations")
        .update({ ai_instruction: null, ai_instruction_at: null, ai_instruction_by: null })
        .eq("id", conv.id);
    }

    // Prefixo "*Roberto:*" só na PRIMEIRA mensagem do atendimento (assinar toda
    // mensagem deixa robótico).
    const prefix = jaFalouAntes ? null : buildSenderPrefix(agent.nome);
    const sent = await sendWhatsAppBubbles(conv.wa_phone, text, prefix);
    const failed = sent.filter((s) => s.error);
    if (failed.length > 0) console.error(`[agent:${agent.slug}] falha ao enviar:`, failed);

    // FALLBACK: o motor cotou (cotar_aereo) mas a IA esqueceu de chamar
    // enviar_cartao_voo — manda as artes mesmo assim, senão o cliente fica
    // esperando pra sempre depois do "estou buscando".
    try {
      const usadas = new Set((toolCallsSummary ?? []).map((t) => t.name));
      if (usadas.has("cotar_aereo") && !usadas.has("enviar_cartao_voo")) {
        const { data: q } = await supabaseAdmin
          .from("wa_flight_quotes")
          .select("id, payload")
          .eq("conversation_id", conv.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        const opcoes = ((q?.payload as { opcoes?: Array<{ opcao: number }> } | null)?.opcoes ?? [])
          .map((o) => o.opcao)
          .slice(0, 4);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const cardTool = (cleanTools as any)?.enviar_cartao_voo;
        if (q?.id && opcoes.length && cardTool?.execute) {
          await cardTool.execute(
            { quote_id: q.id as string, opcoes, legenda: null },
            {} as never,
          );
          console.log(`[agent:${agent.slug}] artes de voo enviadas por fallback`);
        }
      }
    } catch (e) {
      console.warn("[agent] fallback de artes de voo falhou:", e);
    }
    // Guarda o wa_message_id de cada balão pra permitir citar/casar replies depois
    const { setWaMessageId, setSendError } = await import("./conversation.server");
    for (let i = 0; i < savedRowIds.length; i++) {
      const rowId = savedRowIds[i];
      if (!rowId) continue;
      const res = sent[i];
      if (res?.id) await setWaMessageId(rowId, res.id);
      else await setSendError(rowId, res?.error ?? "Não entregue pelo WhatsApp");
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[agent:${agent.slug}] erro:`, msg);
    // Reagenda: o cron tenta de novo em ~1min em vez de deixar o cliente sem resposta.
    try {
      await supabaseAdmin
        .from("wa_conversations")
        .update({ ai_debounce_until: new Date(Date.now() + 60 * 1000).toISOString() })
        .eq("id", conv.id);
    } catch { /* noop */ }
    await saveMessage({
      conversation_id: conv.id,
      direction: "outbound",
      sender: "system",
      content: `⚠️ nota interna: falha temporária da IA (${msg}). Nova tentativa em 1 min.`,
    });
  }
}
