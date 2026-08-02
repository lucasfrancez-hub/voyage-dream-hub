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
import {
  buildCentralPrompt,
  buildCentralTools,
  CENTRAL_GENDER,
  type CentralSlug,
} from "./central-especialistas.server";
import { sendWhatsAppBubbles } from "./send.server";
import { buildSenderPrefix, capitalizeBubbles, capitalizeKnownNames, fixGluedSentences, firstName as extractFirstName } from "./text-utils.server";
import { buildSharedAgentPrompt } from "@/lib/chat/camila-prompt";
import { isCompanyDataBlocked } from "./data-blocklist";
import { triageFirstMessage } from "./triage.server";

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
  equipe?: string | null;
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

/**
 * Escolhe o consultor de forma DETERMINÍSTICA (sem sorteio), igual à Central:
 * 1) menor carga — menos conversas atendidas nas últimas 24h;
 * 2) empate → quem está há mais tempo sem atender (round-robin);
 * 3) empate → ordem alfabética do slug.
 */
async function pickAgent(agents: Agent[], stickySlug?: string | null): Promise<Agent | null> {
  // A Central de Especialistas (Paula/Bruno) NUNCA é sorteada no atendimento
  // normal — ela só entra quando o consultor encaminha explicitamente.
  agents = agents.filter((a) => (a.equipe ?? "consultor") !== "especialista");
  if (!agents.length) return null;
  const now = currentHourInSaoPaulo();
  const inWindow = agents.filter((a) =>
    isInWindow(now, hmToDecimal(a.horario_inicio), hmToDecimal(a.horario_fim)),
  );
  // stickiness DENTRO do mesmo protocolo: só mantém o agente se ele ainda
  // está no plantão agora. Se saiu da janela (ex.: Roberto do noturno num
  // horário de dia), escolhe outro entre os disponíveis — nunca deixa um
  // agente fora do turno responder porque atendeu antes.
  if (stickySlug) {
    const kept = inWindow.find((a) => a.slug === stickySlug);
    if (kept) return kept;
  }
  if (!inWindow.length) return null;
  if (inWindow.length === 1) return inWindow[0]!;

  const slugs = inWindow.map((a) => a.slug);
  const desde24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: recentes } = await supabaseAdmin
    .from("wa_conversations")
    .select("agent_slug, last_message_at")
    .in("agent_slug", slugs)
    .gte("last_message_at", desde24h);

  const carga = new Map<string, number>(slugs.map((s) => [s, 0]));
  const ultimo = new Map<string, number>(slugs.map((s) => [s, 0]));
  for (const r of recentes ?? []) {
    const s = (r as { agent_slug?: string | null }).agent_slug ?? null;
    if (!s || !carga.has(s)) continue;
    carga.set(s, (carga.get(s) ?? 0) + 1);
    const t = (r as { last_message_at?: string | null }).last_message_at
      ? new Date((r as { last_message_at: string }).last_message_at).getTime()
      : 0;
    if (t > (ultimo.get(s) ?? 0)) ultimo.set(s, t);
  }

  const ordenados = [...inWindow].sort((a, b) => {
    const ca = carga.get(a.slug) ?? 0;
    const cb = carga.get(b.slug) ?? 0;
    if (ca !== cb) return ca - cb; // menor carga primeiro
    const ua = ultimo.get(a.slug) ?? 0;
    const ub = ultimo.get(b.slug) ?? 0;
    if (ua !== ub) return ua - ub; // há mais tempo sem atender primeiro
    return a.slug.localeCompare(b.slug);
  });
  const escolhido = ordenados[0]!;
  console.log(
    `[agentes] consultor escolhido: ${escolhido.slug} (carga 24h: ${slugs
      .map((s) => `${s}=${carga.get(s) ?? 0}`)
      .join(", ")})`,
  );
  return escolhido;
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

function buildSystemPrompt(
  agent: Agent,
  conv: WaConversation,
  protocolo: WaProtocolo,
  _isNewProtocolo: boolean,
  previousContext?: string,
  opts?: { contextOnly?: boolean },
): string {
  // Sempre gera o prompt compartilhado com o nome/gênero deste agente,
  // ignorando o system_prompt armazenado (mantém a base única pra todo o time).
  // contextOnly = agentes da Central: eles têm prompt próprio e NÃO recebem
  // os fluxos de negócio das consultoras (evita regras contraditórias).
  const contextOnly = opts?.contextOnly === true;
  const parts: string[] = contextOnly ? [] : [buildSharedAgentPrompt(agent.nome, genderOf(agent.slug))];

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
  if (!contextOnly) {
    parts.push(
      `\n# ✈️ CENTRAL DE ESPECIALISTAS (roteamento)\n` +
      `- Se o cliente pedir COTAÇÃO DE PASSAGEM AÉREA avulsa ("quero uma passagem", "quero um voo", "quero cotar um aéreo", "quero comprar só as passagens"), ` +
      `chame a tool transferir_para_central com o que já souber e responda apenas: ` +
      `"Perfeito! Vou encaminhar seu atendimento para nossa Central de Especialistas, que vai pesquisar as melhores opções para você."\n` +
      `- Isso vale SÓ para passagem aérea avulsa. Pacote pronto, personalização de pacote, hotel, carro, seguro e cruzeiro continuam 100% com você, ` +
      `exatamente como sempre — e, quando não houver pacote ou o cliente quiser personalizar, você segue coletando os dados e encaminhando para o Comercial.`
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

  // ── Central de Especialistas ────────────────────────────────────────────
  // Dois caminhos chegam aqui:
  // 1) o consultor encaminhou durante a conversa (central_slug já preenchido);
  // 2) a PRIMEIRA mensagem do cliente já era pedido claro de passagem aérea —
  //    nesse caso a triagem direciona antes de qualquer saudação, sem passar
  //    pelas consultoras e sem transferência visível.
  let centralSlug = (conv as unknown as { central_slug?: string | null }).central_slug ?? null;
  let centralBrief = (conv as unknown as { central_brief?: string | null }).central_brief ?? null;
  let centralPrimeiroContato = false;

  if (!centralSlug) {
    const triagem = await triageFirstMessage(conv).catch((err) => {
      console.error("[agent] triagem inicial falhou:", err);
      return null;
    });
    if (triagem) {
      centralSlug = triagem.slug;
      centralBrief = triagem.brief;
      centralPrimeiroContato = true;
    }
  }

  const centralAgent = centralSlug
    ? agents.find((a) => a.slug === centralSlug && (a.equipe ?? "") === "especialista") ?? null
    : null;

  const agent = centralAgent ?? (await pickAgent(agents, stickySlug));



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

  // Gemini 3.x recusa (400) requisições cujo último turno é do assistente
  // ("Requests ending with a model turn are not supported"). Quando o histórico
  // termina numa mensagem nossa, fechamos com um turno de usuário neutro.
  if (messages.length === 0 || messages[messages.length - 1].role !== "user") {
    messages.push({
      role: "user",
      content:
        "[CONTINUAÇÃO AUTOMÁTICA — o cliente não enviou nova mensagem. Prossiga o atendimento a partir do contexto acima.]",
    });
  }


  const { count: outboundNoProto } = await supabaseAdmin
    .from("wa_messages")
    .select("id", { count: "exact", head: true })
    .eq("protocolo_id", protocolo.id)
    .eq("direction", "outbound");
  const isNewProtocolo = (outboundNoProto ?? 0) === 0;


  const gateway = createLovableAiGatewayProvider(key);
  const tools = centralAgent
    ? (buildCentralTools(
        conv,
        ((centralAgent as unknown as { tools_habilitadas?: unknown }).tools_habilitadas as string[] | null) ?? null,
      ) as unknown as ReturnType<typeof buildCamilaTools>)
    : buildCamilaTools(conv);
  const cleanTools: Record<string, unknown> = { ...tools };
  delete cleanTools._meta;

  // Cadeia de tentativas: o gateway às vezes devolve 502/503 em rajada (o
  // provedor cai por alguns segundos). Tentamos o mesmo modelo mais de uma vez
  // e alternamos entre modelos, com backoff crescente, antes de desistir.
  // O Gemini está instável (502 em rajada em todas as gerações), então o
  // ChatGPT virou o principal e o Gemini ficou só como último recurso.
  const DEFAULT_CHAIN = [
    "openai/gpt-5.4-mini",
    "openai/gpt-5.4-mini",
    "openai/gpt-5.4",
    "openai/gpt-5.4-nano",
    "google/gemini-3.6-flash",
    "google/gemini-3.1-flash-lite",
  ];
  // A ordem é configurável no painel (botão "status da IA" no cabeçalho do chat).
  let chain = DEFAULT_CHAIN;
  try {
    const { data: cfg } = await supabaseAdmin
      .from("ai_model_chain")
      .select("models")
      .eq("id", "whatsapp")
      .maybeSingle();
    const saved = (cfg as { models?: unknown } | null)?.models;
    if (Array.isArray(saved) && saved.length) chain = saved as string[];
  } catch {
    /* mantém o padrão */
  }
  const WAITS = [1500, 2500, 3500, 5000, 6000, 0];
  const ATTEMPTS = chain.map((model, i) => ({ model, wait: WAITS[i] ?? 0 }));

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  try {
    const system = centralAgent
      ? buildCentralPrompt(
          centralAgent.nome,
          CENTRAL_GENDER[centralAgent.slug as CentralSlug] ?? "f",
          centralBrief,
          { primeiroContato: centralPrimeiroContato, storedPrompt: centralAgent.system_prompt },
        ) +
        "\n\n" +
        buildSystemPrompt(agent, conv, protocolo, isNewProtocolo, previousContext, { contextOnly: true })
      : buildSystemPrompt(agent, conv, protocolo, isNewProtocolo, previousContext);
    let result: { text?: string; steps?: Array<{ toolCalls?: Array<{ toolName: string; input: unknown }> }> } | null = null;
    let lastErr: unknown = null;
    for (let i = 0; i < ATTEMPTS.length; i++) {
      try {
        // Modelos GPT-5 rejeitam temperature diferente do padrão (400).
        const isOpenAI = ATTEMPTS[i].model.startsWith("openai/");
        result = await generateText({
          model: gateway(ATTEMPTS[i].model),
          system,
          messages,
          tools: cleanTools as never,
          toolsContext: undefined as never,
          stopWhen: stepCountIs(10),
          ...(isOpenAI ? {} : { temperature: 0.6 }),
        });
        break;

      } catch (e) {
        lastErr = e;
        const m = e instanceof Error ? e.message : String(e);
        console.warn(`[agent:${agent.slug}] tentativa ${i + 1} (${ATTEMPTS[i].model}) falhou: ${m}`);
        if (i < ATTEMPTS.length - 1 && ATTEMPTS[i].wait > 0) await sleep(ATTEMPTS[i].wait);
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
    const text = capitalizeKnownNames(capitalizeBubbles(fixGluedSentences(rawText)), [clientFirst]);

    const toolCallsSummary = result.steps
      ?.flatMap((s) => s.toolCalls ?? [])
      .map((tc) => ({ name: tc.toolName, input: tc.input }));

    // FALLBACK DE ENVIO DE PACOTE: a IA às vezes anuncia "vou te mandar o pacote"
    // e encerra o turno sem chamar enviar_pacote — o cliente fica sem receber nada.
    // Se ela buscou pacotes, prometeu enviar e não chamou a tool, enviamos o
    // primeiro resultado da busca automaticamente.
    try {
      const calledEnviar = (toolCallsSummary ?? []).some(
        (tc) => tc.name === "enviar_pacote" || tc.name === "enviar_link_pacote",
      );
      const promisePattern =
        /(vou|já|ja|estou|to|tô)\s+(te\s+)?(mandar|enviar|mandando|enviando|preparando|separando)|te mando|te envio|mando (agora|já|ja)|envio (agora|já|ja)|segue (o|abaixo)? ?(pacote|folder|opç)/i;
      const mentionsPackage = /pacote|folder|opç|option|roteiro/i.test(text);
      if (!calledEnviar && promisePattern.test(text) && mentionsPackage) {
        const steps = result.steps as unknown as Array<{
          toolResults?: Array<{ toolName: string; output?: unknown }>;
        }>;
        const buscas = (steps ?? []).flatMap((s) => s.toolResults ?? [])
          .filter((tr) => tr.toolName === "buscar_pacotes");
        const first = buscas
          .map((tr) => (tr.output as { pacotes?: Array<{ slug?: string }> } | undefined)?.pacotes?.[0]?.slug)
          .find((s): s is string => !!s);
        if (first) {
          console.log(`[agent:${agent.slug}] fallback: enviando pacote ${first} (IA prometeu e não chamou a tool)`);
          const enviar = (tools as unknown as Record<string, { execute?: (...a: unknown[]) => Promise<unknown> }>)
            .enviar_pacote;
          await enviar?.execute?.({ slug: first, quantidade_adultos: null }, {});

          toolCallsSummary?.push({ name: "enviar_pacote", input: { slug: first, fallback: true } });
        }
      }
    } catch (e) {
      console.warn("[agent] fallback enviar_pacote falhou:", e);
    }


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

    // ASSUNÇÃO HUMANA: relê o estado da conversa IMEDIATAMENTE antes de enviar.
    // Se um atendente assumiu (mode != ai), pausou a IA ou a conversa foi
    // atribuída a um humano enquanto a resposta era gerada, nada é enviado.
    {
      const { abortIfHumanTookOver } = await import("./human-takeover.server");
      if (await abortIfHumanTookOver(conv.id, "baloes_da_ia")) {
        for (const rowId of savedRowIds) {
          if (rowId) {
            await supabaseAdmin
              .from("wa_messages")
              .update({ deleted_at: new Date().toISOString(), error: "Envio cancelado: atendimento assumido por humano" })
              .eq("id", rowId);
          }
        }
        return;
      }
    }

    const prefix = buildSenderPrefix(agent.nome);
    const sent = await sendWhatsAppBubbles(conv.wa_phone, text, prefix);
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
