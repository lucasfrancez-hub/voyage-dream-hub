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
import { buildSenderPrefix, capitalizeBubbles, capitalizeKnownNames, fixGluedSentences, mergeQuestionBubbles, stripAgentSignature, stripFakeImageFailure, stripTextFlightList, stripReintroBubbles, firstName as extractFirstName } from "./text-utils.server";
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

function buildSystemPrompt(agent: Agent, conv: WaConversation, protocolo: WaProtocolo, isNewProtocolo: boolean): string {
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
    isNewProtocolo
      ? `- PRIMEIRA RESPOSTA DESTE PROTOCOLO: SIM. Antes de qualquer tool, cumprimente, diga seu nome e reaja ao pedido. Se for viagem/cotação, faça a triagem (só aéreo ou pacote com hospedagem) e NÃO cote ainda — mesmo que o "HISTÓRICO ANTERIOR" abaixo mostre confirmação de um protocolo passado JÁ ENCERRADO: aquela resposta NÃO vale pra esta nova solicitação. A triagem tem que ser refeita nesta conversa antes de chamar cotar_aereo/enviar_cartao_voo.`
      : `- PRIMEIRA RESPOSTA DESTE PROTOCOLO: NÃO. Não repita apresentação; continue naturalmente do ponto atual.`,
  );
  parts.push(
    `- Mensagens marcadas com "[sistema · <tipo>]" no histórico são AÇÕES AUTOMÁTICAS que a VIA AIR já enviou pra esse cliente (check-in, alerta/cancelamento de voo, voucher, recibo, contrato). ` +
    `Elas trazem localizador, número do voo, pedido, data, passageiro e outros dados. ` +
    `Se o cliente responder algo ligado a esse assunto (ex.: "remarcar voo", "quero reembolso", "não recebi o cartão", "quando é o voo?"), ` +
    `USE ESSES DADOS DIRETO — jamais peça localizador/CPF/número do pedido pra localizar algo que já está no [sistema · ...]. ` +
    `Assuma que o pedido está identificado por esse localizador e siga o atendimento.`
  );

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
  parts.push(
    `\n# 🚨 REGRAS CRÍTICAS DESTA RESPOSTA (acima de qualquer outra)\n` +
    `1. Responda PRIMEIRO o que o cliente acabou de perguntar — inclusive perguntas fora do assunto ("você é um robô?", "você é humano?"). ` +
    `Nessas, responda leve, no seu nome ("Sou ${agent.nome}, do time da VIA AIR, quem te atende aqui sou eu 😊"), sem falar de sistema/IA/automação, e só depois retome a etapa.\n` +
    `2. Com origem, destino, data(s), nº de passageiros e a triagem de "só aéreo" confirmada, é PROIBIDO fazer mais qualquer pergunta: chame cotar_aereo AGORA. Horário e bagagem NUNCA travam a cotação (use livre / sem bagagem e ofereça ajustar depois).\n` +
    `3. NUNCA diga que houve problema, instabilidade, erro ou dificuldade se nenhuma tool devolveu erro nesta resposta.\n` +
    `4. Nunca repita uma pergunta já respondida no histórico.`
  );
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


  // Captura o estado ANTES de chamar o modelo. As tools podem enviar e salvar
  // imagens durante generateText; contar depois faria a própria arte "gastar"
  // a apresentação da primeira resposta do protocolo.
  const { count: deliveredBeforeRun } = await supabaseAdmin
    .from("wa_messages")
    .select("id", { count: "exact", head: true })
    .eq("protocolo_id", protocolo.id)
    .eq("direction", "outbound")
    .neq("sender", "system")
    .not("wa_message_id", "is", null);
  const isNewProtocolo = (deliveredBeforeRun ?? 0) === 0;


  const gateway = createLovableAiGatewayProvider(key);
  const tools = buildCamilaTools(conv, { protocolId: protocolo.id, openedAt: sinceIso });
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
    const system = buildSystemPrompt(agent, conv, protocolo, isNewProtocolo);
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

    // Rede de segurança imediata: alguns modelos chamam cotar_aereo, recebem a
    // cotação, mas encerram o loop sem chamar enviar_cartao_voo. Nesse caso a
    // arte já existe e deve sair agora — não só minutos depois pelo watchdog.
    const executedToolNames = new Set(
      (result.steps ?? []).flatMap((step) => (step.toolCalls ?? []).map((call) => call.toolName)),
    );
    // Faz a checagem mesmo quando enviar_cartao_voo foi chamado: a tool pode
    // ter sido executada, mas todas as imagens terem falhado no transporte.
    // Se deu certo, cards_sent_at já está preenchido e esta chamada é no-op.
    let cardsEntregues = executedToolNames.has("enviar_cartao_voo");
    if (executedToolNames.has("cotar_aereo")) {
      const { sendPendingFlightCards } = await import("./flight-cards-pending.server");
      const recovered = await sendPendingFlightCards(
        conv.id,
        conv.wa_phone,
        60 * 60 * 1000,
        sinceIso,
        protocolo.id,
      ).catch((error) => {
        console.warn(`[agent:${agent.slug}] fallback imediato dos cards falhou:`, error);
        return { sent: 0 };
      });
      if (recovered.sent > 0) {
        cardsEntregues = true;
        console.log(`[agent:${agent.slug}] fallback imediato enviou ${recovered.sent} card(s)`);
      }
    }


    // REENVIO A PEDIDO: se o cliente disse que não recebeu as imagens, as artes
    // saem de novo por código — não dependemos do modelo chamar a tool.
    const ultimoInbound = [...merged].reverse().find((m) => m.sender === "customer")?.content ?? "";
    const pediuReenvio =
      /(n[aã]o (recebi|chegou|veio|carregou|apareceu)|cad[êe] (as )?(fotos|imagens|artes|op[çc][õo]es)|manda(r)? de novo|reenvia)/i.test(
        ultimoInbound,
      );
    if (pediuReenvio && !executedToolNames.has("enviar_cartao_voo")) {
      const { sendPendingFlightCards } = await import("./flight-cards-pending.server");
      const again = await sendPendingFlightCards(
        conv.id,
        conv.wa_phone,
        60 * 60 * 1000,
        sinceIso,
        protocolo.id,
        true,
      ).catch(() => ({ sent: 0 }));
      if (again.sent > 0) {
        cardsEntregues = true;
        console.log(`[agent:${agent.slug}] reenvio a pedido: ${again.sent} card(s)`);
      }
    }

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
    // Já falamos NESTE protocolo? Só aí cortamos saudação/apresentação e o
    // prefixo "*Roberto:*". Protocolo novo = atendimento novo: o agente se
    // apresenta de novo, com nome, igual na primeira vez.
    // IMPORTANTE: só conta mensagem que o cliente REALMENTE recebeu
    // (wa_message_id preenchido). Balão salvo mas não entregue não pode
    // "gastar" a apresentação — foi o que fez o nome sumir no WhatsApp.
    const jaFalouAntes = !isNewProtocolo;

    // O nome do atendente ("*Roberto:*") assina SEMPRE o primeiro balão de cada
    // resposta — é a assinatura da conversa no WhatsApp, não a apresentação.
    const reassinar = true;



    let text = capitalizeKnownNames(capitalizeBubbles(fixGluedSentences(rawText)), [clientFirst]);
    // O modelo às vezes assina sozinho ("*Maria:*") — a assinatura é do código.
    text = stripAgentSignature(text, agent.nome);
    if (jaFalouAntes) text = stripReintroBubbles(text);


    // Se as artes REALMENTE saíram, corta qualquer balão em que o modelo
    // inventou falha de envio ("probleminha pra mandar as imagens").
    if (cardsEntregues) text = stripTextFlightList(stripFakeImageFailure(text));

    // "Você é um robô?" — resposta determinística: alguns modelos ignoram a
    // pergunta e repetem a etapa anterior, o que denuncia automação.
    const perguntouRobo =
      /(voc[êe]\s+[ée]\s+(um\s+|uma\s+)?(rob[ôo]|bot|i\.?a\.?|intelig[êe]ncia artificial|m[áa]quina|atendente virtual)|atendimento autom[áa]tico|voc[êe]\s+[ée]\s+(humano|humana|uma pessoa|pessoa de verdade)|[ée] rob[ôo]\?)/i.test(
        ultimoInbound,
      );
    if (perguntouRobo && !new RegExp(`sou\\s+${agent.nome}`, "i").test(text)) {
      text = `Sou ${agent.nome}, do time da VIA AIR — quem tá te atendendo aqui sou eu 😊\n\n${text}`;
    }

    text = mergeQuestionBubbles(text);
    if (!text.trim()) {
      console.warn(`[agent:${agent.slug}] resposta virou vazia depois da limpeza — nada a enviar`);
      return;
    }

    const toolCallsSummary = result.steps
      ?.flatMap((s) => s.toolCalls ?? [])
      .map((tc) => ({ name: tc.toolName, input: tc.input }));

    // Prefixo "*Roberto:*" na primeira mensagem do atendimento (ou depois de
    // 30 min parado). O MESMO texto é salvo e enviado, pra o histórico interno
    // bater 100% com o que o cliente vê no WhatsApp.
    const prefix = reassinar ? buildSenderPrefix(agent.nome) : null;
    const { splitToBubbles } = await import("./send.server");
    const bubbles = splitToBubbles(text, prefix);

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

    // Último inbound: usado pra reacender o "digitando…" entre os balões.
    const { data: lastInbound } = await supabaseAdmin
      .from("wa_messages")
      .select("wa_message_id")
      .eq("conversation_id", conv.id)
      .eq("direction", "inbound")
      .not("wa_message_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // Envia exatamente os mesmos balões que foram salvos (já com o prefixo).
    const sent = await sendWhatsAppBubbles(conv.wa_phone, text, prefix, {
      typingId: (lastInbound?.wa_message_id as string | null) ?? null,
    });


    const failed = sent.filter((s) => s.error);
    if (failed.length > 0) console.error(`[agent:${agent.slug}] falha ao enviar:`, failed);

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
