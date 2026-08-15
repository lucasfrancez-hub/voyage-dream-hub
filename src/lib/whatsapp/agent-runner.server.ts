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
import { buildSenderPrefix, capitalizeBubbles, capitalizeKnownNames, descreverMidiaNoHistorico, fixGluedSentences, firstName as extractFirstName } from "./text-utils.server";
import { buildSharedAgentPrompt } from "@/lib/chat/camila-prompt";
import { isCompanyDataBlocked } from "./data-blocklist";
import { triageFirstMessage, heuristicaAereo, routeAereoParaCentral } from "./triage.server";
import { createHash, randomUUID } from "node:crypto";
import {
  CENTRAL_PROMPT_VERSION,
  centralBriefHasMissingOrigin,
  isValidOriginQuestion,
  isInvalidMissingOriginResponse,
  origemJaFoiRespondidaNoProtocolo,
  safeMissingOriginResponse,
} from "./airflow-guard";

// Gênero por slug (usado pra montar o prompt compartilhado com a flexão certa).
/** Aviso fixo enviado pelo consultor antes do especialista aéreo assumir. */
export const AVISO_TRANSFERENCIA_AEREO =
  "Claro! Já vou te transferir pro nosso setor aéreo, que continua com vc por aqui";

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
      `- Se o cliente pedir COTAÇÃO DE PASSAGEM AÉREA E SOMENTE ISSO ("quero uma passagem", "quero um voo", "quero comprar só as passagens", "pode ser só o voo"), ` +
      `chame IMEDIATAMENTE a tool transferir_para_central com o que já souber, na MESMA resposta, sem perguntar origem, destino, datas ou passageiros. ` +
      `Avise o cliente na mesma mensagem: "Perfeito! Como é só o aéreo, vou te passar pro nosso especialista em passagens, que continua daqui com você." Nenhuma transferência pode ser silenciosa.\n` +
      `- 🚫 TRAVA DE ESCOPO: se a mensagem tiver QUALQUER combinação de produtos — "aéreo e hotel", "voo + hotel", "passagem e hospedagem", "pacote", "viagem completa", "hotel também" —, ` +
      `é PROIBIDO chamar transferir_para_central. Esse caso é COMERCIAL e continua com você. A tool bloqueia no servidor e o cliente vai perceber a incoerência.\n` +
      `- 🚫 Palavra-chave isolada ("voo", "aéreo", "passagem", "hotel") NUNCA decide o roteamento: vale a intenção completa. Na dúvida, NÃO transfira — faça uma pergunta de esclarecimento.\n` +
      `- 🚫 PROIBIDO, em pedido de passagem aérea: perguntar origem/destino/datas/passageiros, encaminhar ao Comercial, falar de horário de atendimento do Comercial ou dizer que alguém retorna depois. ` +
      `Cotação aérea NUNCA vai para o Comercial — ela é sempre da Central, 24h por dia.\n` +
      `- Pacote pronto, personalização, aéreo + hotel, hotel, carro, seguro e cruzeiro continuam 100% com você, ` +
      `exatamente como sempre — e, quando não houver pacote ou o cliente quiser personalizar, você segue coletando os dados e encaminhando para o Comercial.`


    );
  }
  parts.push(`- Data/hora atual (SP): ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`);
  return parts.join("\n");
}

export async function runAgent(input: {
  wa_phone: string;
  profile_name?: string | null;
  trigger_message_id?: string;
}): Promise<void> {
  const conv = await getOrCreateConversation(input.wa_phone, input.profile_name);
  const aiRunId = randomUUID();

  // Interruptor global: com as IAs desligadas, todo atendimento é humano —
  // vale para as conversas atuais e para as que surgirem depois.
  {
    const { isAiGloballyOff } = await import("./ai-global-switch.server");
    if (await isAiGloballyOff()) {
      console.log(`[agent] interruptor global desligado — IA não responde (conversa ${conv.id})`);
      return;
    }
  }

  if (conv.mode !== "ai") {
    console.log(`[agent] conversa ${conv.id} em modo ${conv.mode} — IA não responde`);
    return;
  }


  if ((conv as unknown as { ai_paused?: boolean | null }).ai_paused) {
    console.log(`[agent] conversa ${conv.id} com IA pausada pelo atendente — não responde`);
    return;
  }

  // Orientação do supervisor: o atendente pode instruir a IA MESMO que a última
  // mensagem do cliente já tenha sido respondida. Nesse caso o run não é "stale":
  // ele existe justamente para transmitir a orientação.
  const instructionRun = Boolean(
    (conv as unknown as { ai_instruction?: string | null }).ai_instruction?.trim(),
  );
  const instructionAtStart = (
    conv as unknown as { ai_instruction_at?: string | null }
  ).ai_instruction_at ?? null;

  const agents = await loadAgents();
  const stickySlug = (conv as unknown as { agent_slug?: string | null }).agent_slug ?? null;

  // O protocolo precisa existir ANTES da triagem. Criar/reabrir um protocolo
  // limpa o runtime anterior; se isso acontecer depois da triagem, apagaria o
  // central_slug que acabou de ser gravado e abriria uma corrida consultor x Central.
  const protocolo = await ensureActiveProtocolo(conv.id);

  // `conv` foi carregada antes de ensureActiveProtocolo e pode conter o runtime
  // do protocolo encerrado. Sempre releia o roteamento já limpo/persistido.
  const { data: routingState } = await supabaseAdmin
    .from("wa_conversations")
    .select("agent_slug, central_slug, central_brief")
    .eq("id", conv.id)
    .single();

  // ── Central de Especialistas ────────────────────────────────────────────
  // Dois caminhos chegam aqui:
  // 1) o consultor encaminhou durante a conversa (central_slug já preenchido);
  // 2) a PRIMEIRA mensagem do cliente já era pedido claro de passagem aérea —
  //    nesse caso a triagem direciona antes de qualquer saudação, sem passar
  //    pelas consultoras e sem transferência visível.
  let centralSlug = typeof routingState?.central_slug === "string" ? routingState.central_slug : null;
  let centralBrief = typeof routingState?.central_brief === "string" ? routingState.central_brief : null;
  let centralPrimeiroContato = false;

  /* ── RETOMADA APÓS LONGA INATIVIDADE ────────────────────────────────────
     Se o cliente sumiu por muito tempo e volta com uma mensagem que NÃO é
     pedido de cotação aérea (ex.: só "oi"), o atendimento volta para as
     Consultoras. Sem isso, o Bruno/Paula continuava "cuidando da cotação"
     dias depois, mesmo sem o cliente ter pedido nada. */
  if (centralSlug) {
    const STALE_CENTRAL_MS = 6 * 60 * 60 * 1000; // 6h sem interação
    const { data: ultimas } = await supabaseAdmin
      .from("wa_messages")
      .select("content, direction, created_at")
      .eq("conversation_id", conv.id)
      .order("created_at", { ascending: false })
      .limit(2);
    const atual = ultimas?.[0];
    const anterior = ultimas?.[1];
    const gap =
      atual && anterior
        ? new Date(atual.created_at as string).getTime() -
          new Date(anterior.created_at as string).getTime()
        : 0;
    const textoAtual = ((atual?.content as string | null) ?? "").trim();
    if (gap >= STALE_CENTRAL_MS && !heuristicaAereo(textoAtual)) {
      await supabaseAdmin
        .from("wa_conversations")
        .update({
          central_slug: null,
          central_desde: null,
          central_brief: null,
          central_busca: null,
          agent_slug: null,
        })
        .eq("id", conv.id);
      console.log(
        `[agent] conversa ${conv.id}: retomada após ${(gap / 3600000).toFixed(1)}h sem cotação aérea — volta para as Consultoras`,
      );
      centralSlug = null;
      centralBrief = null;
    }
  }


  /* ── TRAVA DE SETOR PELA SOLICITAÇÃO AÉREA ATIVA ────────────────────────
     Enquanto existir uma solicitação aérea em aberto neste protocolo, o
     atendimento é do Aéreo (Paula/Bruno). Resposta curta ("isso", "ok", "?")
     NÃO recalcula produto nem setor — ela pertence à cotação em andamento.
     O setor só muda quando o cliente pede outra necessidade de verdade
     (hotel, carro, pacote, seguro, pós-venda...). */
  let flightBlock = "";
  {
    const {
      loadActiveFlightRequest,
      closeActiveFlightRequests,
      updateFlightRequest,
      markFlightProgress,
      clearPendingQuestion,
      registerCustomerNudge,
      buildFlightRequestBlock,
    } = await import("./flight-request.server");
    const { logProtocolEvent } = await import("./protocol-runtime.server");
    const { classifyCustomerMessage, detectarMudancaDeNecessidade, resolvePendingFlightAnswer } =
      await import("./short-answer");

    const ativa = await loadActiveFlightRequest(protocolo.id).catch(() => null);
    if (ativa) {
      const { data: ultimaIn } = await supabaseAdmin
        .from("wa_messages")
        .select("id, content")
        .eq("conversation_id", conv.id)
        .eq("direction", "inbound")
        .eq("protocolo_id", protocolo.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const texto = ((ultimaIn?.content as string | null) ?? "").trim();
      const mudanca = detectarMudancaDeNecessidade(texto);

      if (mudanca) {
        // Mudança real de necessidade: encerra a solicitação aérea e deixa a
        // triagem/consultor assumirem normalmente.
        await closeActiveFlightRequests({
          protocol_id: protocolo.id,
          status: "transferred",
          reason: `mudanca_de_necessidade:${mudanca}`,
        });
        await logProtocolEvent("flight_request_closed", {
          conversation_id: conv.id,
          protocolo_id: protocolo.id,
          search_request_id: ativa.id,
          motivo: `mudanca_de_necessidade:${mudanca}`,
        });
      } else {
        // Setor travado no aéreo — sem nova triagem.
        centralSlug = ativa.agent_slug ?? centralSlug;
        const kind = classifyCustomerMessage(texto, {
          pesquisaEmAndamento: ativa.status === "searching" || ativa.status === "delivering",
        });
        if (kind === "nudge") await registerCustomerNudge(ativa).catch(() => {});

        // Resolvedor determinístico da pergunta pendente.
        let resolvido: string | null = null;
        const r = resolvePendingFlightAnswer({
          pending_question: ativa.pending_question,
          pending_question_context: ativa.pending_question_context,
          texto,
        });
        if (r.resolved) {
          await markFlightProgress(ativa.id, {
            ...r.patch,
            next_action: r.next_action,
            status: r.next_action === "run_search" ? "searching" : "collecting",
            last_customer_message_id: (ultimaIn?.id as string | undefined) ?? null,
          } as never);
          await clearPendingQuestion(ativa.id);
          resolvido = r.note ?? String(ativa.pending_question);
          Object.assign(ativa, r.patch, { next_action: r.next_action, pending_question: null });
          await logProtocolEvent("flight_request_answer_resolved", {
            conversation_id: conv.id,
            protocolo_id: protocolo.id,
            search_request_id: ativa.id,
            pergunta: ativa.pending_question,
            resolvido,
          });
        } else if (r.ambiguous) {
          await updateFlightRequest(ativa.id, { recovery_priority: "high" } as never);
        }

        flightBlock = buildFlightRequestBlock(ativa, {
          resolvido,
          cobranca: kind === "nudge",
        });
        await logProtocolEvent("flight_sector_locked", {
          conversation_id: conv.id,
          protocolo_id: protocolo.id,
          search_request_id: ativa.id,
          agent_slug: ativa.agent_slug,
          status: ativa.status,
        });
      }
    }
  }

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

  // REDE DE SEGURANÇA: mesmo que a triagem não tenha rodado (por exemplo,
  // porque já havia uma resposta nossa na janela), TODO pedido explícito de
  // passagem aérea pertence à Central. Nenhum consultor conduz cotação aérea
  // nem encaminha ao Comercial enquanto o pedido estiver no escopo da Central.
  if (!centralSlug) {
    const { data: ultimas } = await supabaseAdmin
      .from("wa_messages")
      .select("content")
      .eq("conversation_id", conv.id)
      .eq("direction", "inbound")
      .eq("protocolo_id", protocolo.id)
      .order("created_at", { ascending: false })
      .limit(3);
    const textoRecente = ((ultimas ?? []) as Array<{ content: string | null }>)
      .map((m) => (m.content ?? "").trim())
      .filter(Boolean)
      .reverse()
      .join("\n");
    const { podeIrParaCentral } = await import("./escopo-produto");
    if (textoRecente && heuristicaAereo(textoRecente) && podeIrParaCentral(textoRecente)) {
      // HANDOFF COM CONTEXTO: o briefing é extraído de TODAS as mensagens do
      // cliente neste protocolo, não só das últimas — assim o especialista
      // recebe origem, destino, datas e passageiros já informados e não
      // repete perguntas já respondidas.
      const { data: todasIn } = await supabaseAdmin
        .from("wa_messages")
        .select("content")
        .eq("conversation_id", conv.id)
        .eq("direction", "inbound")
        .eq("protocolo_id", protocolo.id)
        .order("created_at", { ascending: true })
        .limit(20);
      const textoProtocolo =
        ((todasIn ?? []) as Array<{ content: string | null }>)
          .map((m) => (m.content ?? "").trim())
          .filter(Boolean)
          .join("\n") || textoRecente;

      const forcado = await routeAereoParaCentral(conv, textoProtocolo).catch((err) => {
        console.error("[agent] roteamento aéreo forçado falhou:", err);
        return null;
      });
      if (forcado) {
        centralSlug = forcado.slug;
        centralBrief = forcado.brief;
        centralPrimeiroContato = true;
        console.log(`[agent] pedido aéreo redirecionado à Central (${forcado.slug}) fora da triagem inicial`);
      }
    }

  }

  let centralAgent = centralSlug
    ? agents.find((a) => a.slug === centralSlug && (a.equipe ?? "") === "especialista") ?? null
    : null;

  // Se o especialista escolhido não veio na lista carregada (cache/ativo),
  // busca direto no banco — jamais cair no consultor por isso.
  if (centralSlug && !centralAgent) {
    const { data: espec } = await supabaseAdmin
      .from("ai_agents")
      .select("*")
      .eq("slug", centralSlug)
      .eq("equipe", "especialista")
      .maybeSingle();
    if (espec) centralAgent = espec as unknown as Agent;
  }

  const agent = centralAgent ?? (await pickAgent(agents, stickySlug));

  // Atendimento aéreo sempre tem uma solicitação persistida — é ela que
  // segura o setor, guarda os dados coletados e sobrevive a "isso"/"?".
  if (centralAgent) {
    const { ensureFlightRequest, buildFlightRequestBlock } = await import("./flight-request.server");
    const req = await ensureFlightRequest({
      conversation_id: conv.id,
      protocol_id: protocolo.id,
      agent_slug: centralAgent.slug,
    }).catch(() => null);
    if (req && !flightBlock) flightBlock = buildFlightRequestBlock(req);
  }


  /* ── PACOTE: aéreo (Paula/Bruno) nunca atende, sempre passa aos Consultores ──
     Se o especialista está ativo e o cliente falou de pacote, o prompt recebe
     uma ordem dura de chamar transferir_para_consultores nesta mesma resposta.
     Do lado do Consultor que recebe, entra a orientação de se apresentar e
     entender o pacote do zero (sem herdar destino/datas/pax do voo). */
  let pacoteBlock = "";
  let escopoBlock = "";
  {
    const { data: ultimaIn } = await supabaseAdmin
      .from("wa_messages")
      .select("content")
      .eq("conversation_id", conv.id)
      .eq("direction", "inbound")
      .eq("protocolo_id", protocolo.id)
      .order("created_at", { ascending: false })
      .limit(3);
    const textoPacote = ((ultimaIn ?? []) as Array<{ content: string | null }>)
      .map((m) => (m.content ?? "").trim())
      .filter(Boolean)
      .join("\n");

    const { contemProdutoCombinado, ehDuvidaAntesDeColeta, duvidaSemConteudo } = await import(
      "./escopo-produto"
    );

    // ENTENDER ANTES DE COLETAR — vale pra todos os agentes.
    if (duvidaSemConteudo(textoPacote)) {
      escopoBlock +=
        `\n\n# ❓ O CLIENTE DISSE QUE TEM UMA DÚVIDA — DESCUBRA QUAL É\n` +
        `Ele ainda NÃO disse qual é a dúvida. Sua única próxima mensagem é perguntar qual é a dúvida ` +
        `(ex.: "Claro! Pode me falar, qual é a sua dúvida?").\n` +
        `🚫 PROIBIDO nesta resposta: perguntar destino, origem, datas, passageiros, hotel, orçamento ou qualquer dado de cotação.`;
    } else if (ehDuvidaAntesDeColeta(textoPacote)) {
      escopoBlock +=
        `\n\n# ❓ DÚVIDA DO CLIENTE TEM PRIORIDADE\n` +
        `A mensagem contém uma DÚVIDA (pagamento, boleto, parcelamento, regras, documentação, bagagem...).\n` +
        `Ordem obrigatória: (1) responda a dúvida com base nas regras comerciais REAIS da VIA AIR — nunca invente nem generalize regra; ` +
        `(2) registre o que ele já informou; (3) só então, se fizer sentido, faça UMA pergunta de continuidade.\n` +
        `🚫 Proibido ignorar a pergunta para continuar um roteiro fixo de coleta.`;
    }

    if (contemProdutoCombinado(textoPacote) && !centralAgent) {
      escopoBlock +=
        `\n\n# 🧭 ESCOPO: ESTE CASO É COMERCIAL (fica com você)\n` +
        `O cliente quer pacote, aéreo + hotel, hospedagem ou outro serviço combinado. ` +
        `É PROIBIDO chamar transferir_para_central: Paula e Bruno atendem SOMENTE passagem aérea avulsa.\n` +
        `Continue você mesmo, reaproveitando tudo o que ele já informou (destino, datas, passageiros, origem) e pergunte só o que falta.`;
    }

    if (centralAgent) {
      const { detectarInteressePacote } = await import("./pacote-intent");
      if (detectarInteressePacote(textoPacote) || contemProdutoCombinado(textoPacote)) {

        pacoteBlock =
          `\n\n# 📦 O CLIENTE PEDIU PACOTE — TRANSFIRA AGORA\n` +
          `Você é do aéreo. Chame a tool transferir_para_consultores NESTA resposta e envie APENAS: ` +
          `"Perfeito! Vou te transferir para um dos nossos consultores, que vai entender certinho o tipo de pacote que vc procura e te mostrar as opções disponíveis".\n` +
          `Proibido: pesquisar pacote, adivinhar qual pacote é, presumir que é pro mesmo destino da passagem, dizer que não encontrou pacote, montar briefing, oferecer viagem personalizada ou falar em Comercial.\n` +
          `A cotação aérea continua salva; não repita os dados do voo.`;
        console.log(
          JSON.stringify({
            event: "pacote_intent_no_aereo",
            conversation_id: conv.id,
            protocol_id: protocolo.id,
            agente: centralAgent.slug,
          }),
        );
      }
    } else {
      const { data: convMeta } = await supabaseAdmin
        .from("wa_conversations")
        .select("meta")
        .eq("id", conv.id)
        .maybeSingle();
      const transf = ((convMeta?.meta as Record<string, unknown> | null) ?? {})[
        "transferencia_consultores"
      ] as Record<string, unknown> | undefined;
      if (transf && transf["motivo"] === "interesse_em_pacote") {
        pacoteBlock =
          `\n\n# 🤝 VOCÊ ACABOU DE ASSUMIR ESTE ATENDIMENTO (veio do setor aéreo)\n` +
          `O cliente estava cotando passagem e pediu pacote. Apresente-se antes de continuar: ` +
          `"Oi, <Nome>! Sou o(a) <seu nome>, consultor(a) da VIA AIR" e em seguida ` +
          `"Me conta um pouquinho do que vc está procurando nesse pacote. Já tem algum destino em mente ou quer ver sugestões?".\n` +
          `🚫 NÃO presuma que o pacote é pro mesmo destino, origem, datas ou passageiros da cotação aérea — isso é só histórico:\n` +
          `${String(transf["contexto_aereo_historico"] ?? "—")}\n` +
          `Pedido do cliente: ${String(transf["pedido_do_cliente"] ?? "interesse em pacote")}\n` +
          `Se ele já disse o destino do pacote (ex.: "tem pacote pra Porto Seguro?"), use ESSE destino.\n` +
          `Entenda destino/tipo de destino, origem, período, passageiros, preferências e perfil da viagem; depois pesquise pacote pronto com buscar_pacotes. ` +
          `Só encaminhe ao Comercial se não houver pacote compatível ou se o cliente quiser personalizar.`;

        // A apresentação é uma vez só: marca como consumida (o contexto aéreo
        // segue guardado no histórico de handoff e na cotação).
        const metaLimpa = { ...((convMeta?.meta as Record<string, unknown> | null) ?? {}) };
        metaLimpa["transferencia_consultores"] = { ...transf, assumido_em: new Date().toISOString(), motivo: "assumido" };
        await supabaseAdmin
          .from("wa_conversations")
          .update({ meta: metaLimpa as never })
          .eq("id", conv.id);

      }

    }
  }




  // VÍNCULO AGENTE ↔ PROTOCOLO: o agente e o tipo de prompt passam a pertencer
  // ao protocolo ativo. Nenhum protocolo novo herda esse estado.
  if (agent && protocolo?.id) {
    const { bindAgentToProtocol } = await import("./protocol-runtime.server");
    await bindAgentToProtocol({
      protocolo_id: protocolo.id,
      conversation_id: conv.id,
      agent_slug: agent.slug,
      agent_name: agent.nome ?? agent.slug,
      product_type: centralAgent ? "flight" : "other",
      prompt_type: centralAgent ? "central_especialistas" : "consultor",
    }).catch(() => {});
  }

  // Origem: dentro do MESMO protocolo ela já foi confirmada pelo cliente e é
  // reutilizada direto (mesmo que ele troque o destino). De protocolos
  // ANTERIORES ela NUNCA é reaproveitada automaticamente — só quando o cliente
  // pedir explicitamente ("mantém igual da última vez"). Sem esse pedido, o
  // atendimento pergunta do zero: "De qual cidade você pretende embarcar?".
  let origemSugerida: string | null = null;
  let origemConfirmadaNoProtocolo: string | null = null;
  if (centralAgent && centralBriefHasMissingOrigin(centralBrief)) {
    const { loadOrigemHistorico } = await import("./origin-history.server");
    const { pediuMesmosDadosDaUltimaVez } = await import("./airflow-guard");
    const hist = await loadOrigemHistorico(conv.id, protocolo?.id ?? null);
    origemConfirmadaNoProtocolo = hist.confirmadaNoProtocolo;

    const { data: ultimasIn } = await supabaseAdmin
      .from("wa_messages")
      .select("content")
      .eq("conversation_id", conv.id)
      .eq("direction", "inbound")
      .eq("protocolo_id", protocolo.id)
      .order("created_at", { ascending: false })
      .limit(5);
    const textoCliente = ((ultimasIn ?? []) as Array<{ content: string | null }>)
      .map((m) => m.content ?? "")
      .join("\n");
    const pediuRepetir = pediuMesmosDadosDaUltimaVez(textoCliente);

    origemSugerida = hist.confirmadaNoProtocolo || !pediuRepetir ? null : hist.sugerida;

    // A origem só era considerada confirmada quando já existia cotação salva.
    // Mas o cliente responde a cidade muito antes disso — sem ler a resposta
    // nas mensagens, o especialista repetia "de qual cidade você embarca?".
    if (!origemConfirmadaNoProtocolo) {
      const { origemRespondidaNoProtocolo } = await import("./airflow-guard");
      const [{ data: outMsgs }, { data: inMsgs }] = await Promise.all([
        supabaseAdmin
          .from("wa_messages")
          .select("content, created_at")
          .eq("conversation_id", conv.id)
          // Mensagens antigas podem ter protocolo_id nulo; opened_at é a
          // fronteira confiável do atendimento atual.
          .gte("created_at", protocolo.opened_at)
          .eq("direction", "outbound")
          .order("created_at", { ascending: true })
          .limit(60),
        supabaseAdmin
          .from("wa_messages")
          .select("content, created_at")
          .eq("conversation_id", conv.id)
          .gte("created_at", protocolo.opened_at)
          .eq("direction", "inbound")
          .order("created_at", { ascending: true })
          .limit(60),
      ]);
      const respondida = origemRespondidaNoProtocolo({
        outbound: (outMsgs ?? []) as Array<{ content: string | null; created_at: string }>,
        inbound: (inMsgs ?? []) as Array<{ content: string | null; created_at: string }>,
        sugestao: hist.sugerida,
      });
      if (respondida) {
        origemConfirmadaNoProtocolo = respondida;
        origemSugerida = null;
        console.log(
          JSON.stringify({
            event: "origem_lida_das_mensagens",
            conversation_id: conv.id,
            protocolo_id: protocolo.id,
            origem: respondida,
          }),
        );
      }
    }

    if (hist.sugerida && !pediuRepetir && !hist.confirmadaNoProtocolo) {
      console.log(
        JSON.stringify({
          event: "origem_historico_ignorada_protocolo_novo",
          conversation_id: conv.id,
          protocolo_id: protocolo.id,
          origem_historico: hist.sugerida,
        }),
      );
    }
  }





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

  const { data: latestInboundAtStart } = await supabaseAdmin
    .from("wa_messages")
    .select("id, created_at")
    .eq("conversation_id", conv.id)
    .eq("direction", "inbound")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const triggerMessageId = input.trigger_message_id ?? latestInboundAtStart?.id ?? null;

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
  // NUNCA entra sozinho. Só é carregado quando o próprio cliente referencia
  // expressamente um atendimento anterior ("da outra vez", "e a cotação?",
  // "o comercial não retornou") — protocolo encerrado não vaza para o novo.
  let previousContext = "";
  const ultimaInboundTexto =
    [...history].reverse().find((m) => (m as { sender?: string }).sender === "customer")?.content ?? null;
  const { shouldLoadPreviousContext } = await import("./history-reference");
  const podeCarregarAnterior = shouldLoadPreviousContext({ lastCustomerText: ultimaInboundTexto });
  if (sinceIso && podeCarregarAnterior) {
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
          // O marcador interno de mídia vira descrição: se entrar cru aqui, a
          // IA copia e o cliente recebe o link em vez da foto.
          return `[${when}] ${who}: ${descreverMidiaNoHistorico(String(m.content ?? "")).slice(0, 700)}`;
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
    // Marcador interno de mídia vira descrição — assim a IA sabe que a foto
    // foi enviada, mas não tem como copiar o link cru pro cliente.
    const base = descreverMidiaNoHistorico(String(m.content ?? ""));
    const content = wasDeleted
      ? `[MENSAGEM APAGADA PELO CLIENTE — ignore, não responda a esta mensagem específica] ${base}`
      : base;
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

  // MENSAGEM RESPONDIDA (botão "Responder" do WhatsApp): prioridade absoluta.
  // Lemos os campos já gravados em wa_messages (quote_id, option_index,
  // card_option, agent_name, source_tool, product_type) e entregamos prontos
  // ao modelo, antes do histórico — a IA para de deduzir pelo texto.
  const ultimaDoCliente = [...merged].reverse().find((m) => m.sender === "customer") as
    | (typeof merged)[number]
    | undefined;
  const replyToWaId =
    (ultimaDoCliente as unknown as { reply_to_wa_id?: string | null } | undefined)?.reply_to_wa_id ?? null;
  const replyToMessageId =
    (ultimaDoCliente as unknown as { reply_to_message_id?: string | null } | undefined)
      ?.reply_to_message_id ?? null;

  let repliedBlock = "";
  try {
    const { loadRepliedMessage, buildRepliedMessageBlock } = await import("./replied-message.server");
    const ctx = await loadRepliedMessage({
      conversation_id: conv.id,
      reply_to_message_id: replyToMessageId,
      reply_to_wa_id: replyToWaId,
    });
    repliedBlock = buildRepliedMessageBlock(ctx);
  } catch (err) {
    console.warn("[agent] bloco de mensagem respondida indisponível:", err);
  }

  // VISÃO: regra global válida pra QUALQUER agente (consultores, Central de
  // Especialistas e pós-venda). A leitura da imagem já veio na ingestão.
  let imagemBlock = "";
  try {
    const { hasImageAnalysis } = await import("./image-vision.server");
    const comImagem = [...merged]
      .reverse()
      .slice(0, 12)
      .filter((m) => m.sender === "customer" && hasImageAnalysis(m.content));
    if (comImagem.length) {
      imagemBlock =
        "\n\n[IMAGEM JÁ ANALISADA] O cliente enviou imagem(ns) e o conteúdo delas já foi lido e está no histórico, marcado com [[analise-imagem]]. Trate esses dados como se o cliente tivesse digitado: use companhia, aeroportos, datas, horários, valores, localizadores e mensagens de erro identificados. É PROIBIDO responder 'me manda o print', 'pode enviar uma imagem?' ou 'manda o print' quando existe leitura disponível. Relacione a imagem ao assunto atual da conversa (pesquisa, reserva ou pedido em andamento), não descreva a imagem isoladamente. Só peça nova imagem se a leitura indicar explicitamente que ficou ilegível ou falhou — e nesse caso explique que você tentou ler e peça mais resolução ou um recorte da parte importante.\n";
      console.log(
        JSON.stringify({
          event: "image_context_injected",
          conversation_id: conv.id,
          protocolo_id: protocolo.id,
          imagens: comImagem.length,
          at: new Date().toISOString(),
        }),
      );
    }
  } catch (err) {
    console.warn("[agent] bloco de imagem indisponível:", err);
  }

  // MEMÓRIA ESTRUTURADA DAS COTAÇÕES: o que foi enviado ao cliente vem do
  // banco, não da leitura da legenda das artes. É isso que faz "gostei da
  // segunda" apontar sempre para a opção certa, mesmo com mensagens no meio.
  let quoteBlock = "";
  try {
    const {
      loadQuoteMemory,
      buildQuoteMemoryBlock,
      registerCustomerChoice,
      buildChoiceBlock,
    } = await import("./flight-quote-memory.server");
    const memorias = await loadQuoteMemory(conv.id, {
      protocolId: protocolo.id,
      extraQuoteIds: [],
    });
    if (memorias.length) {
      const escolha = ultimaDoCliente
        ? await registerCustomerChoice(
            conv.id,
            memorias,
            ultimaDoCliente.content,
            replyToWaId,
            replyToMessageId,
          ).catch(() => null)
        : null;
      quoteBlock = buildQuoteMemoryBlock(memorias) + buildChoiceBlock(escolha);

      // CONTINUIDADE: com cotação ativa, mensagem sobre voo é REFINO da
      // pesquisa (aeroporto, horário, bagagem, companhia, "tem mais opções?").
      // O agente é obrigado a rodar nova pesquisa mantendo o restante.
      const cotacaoAtiva = memorias.find((m) => m.atual && !m.cancelada && !m.historica);
      if (cotacaoAtiva && ultimaDoCliente?.content) {
        const { detectRefineIntents, buildRefineBlock } = await import("./flight-refine");
        const intents = detectRefineIntents(ultimaDoCliente.content);

        // CASO 1 da política de quantidade: "tem mais opções?" com opções da
        // MESMA pesquisa ainda não apresentadas → entrega imediata, sem motor.
        const soPediuMais =
          intents.length === 1 && intents[0]?.kind === "mais_opcoes";
        let entregouRestantes = false;
        if (soPediuMais) {
          try {
            const { countUnsentOptions, sendRemainingOptions } = await import(
              "./flight-cards-pending.server"
            );
            const { restantes } = await countUnsentOptions(conv.id, protocolo.id);
            if (restantes > 0) {
              const r = await sendRemainingOptions(
                conv.id,
                conv.wa_phone,
                protocolo.id,
                protocolo.opened_at ?? null,
              );
              entregouRestantes = r.sent > 0;
              if (entregouRestantes) {
                quoteBlock +=
                  "\n\n[CONTINUIDADE] O cliente pediu mais opções e ainda havia alternativas desta MESMA pesquisa: elas JÁ estão sendo enviadas agora. NÃO pesquise de novo e NÃO liste voos em texto — responda só com um balão curto e natural avisando que está mandando outra alternativa para ele comparar.\n";
              }
            }
          } catch (err) {
            console.warn("[agent] entrega de opções restantes indisponível:", err);
          }
        }

        if (intents.length && !entregouRestantes) {
          // PRIORIDADE DO REPLY: se o cliente respondeu a um card específico,
          // a base do refino é a OPÇÃO RESPONDIDA (com os aeroportos daquele
          // card), nunca a última pesquisa da conversa.
          const { baseFromRepliedOption } = await import("./flight-refine");
          const quoteRef = escolha
            ? memorias.find((m) => m.quote_id === escolha.quote_id)
            : null;
          const usouReply = escolha?.match === "citada" && !!escolha.opcao;
          const repliedOption = usouReply
            ? {
                option_index: escolha!.opcao.option_index,
                companhia: escolha!.opcao.companhia,
                saida: escolha!.opcao.saida,
                chegada: escolha!.opcao.chegada,
                data_ida: escolha!.opcao.data_ida,
                valor_formatado: escolha!.opcao.valor_formatado,
                ida_origem_iata: escolha!.opcao.opcao?.ida?.origem ?? null,
                ida_destino_iata: escolha!.opcao.opcao?.ida?.destino ?? null,
              }
            : null;

          const baseBusca = usouReply
            ? baseFromRepliedOption(
                (quoteRef?.busca ?? cotacaoAtiva.busca) ?? null,
                repliedOption!,
              )
            : (cotacaoAtiva.busca ?? null);

          const refine = buildRefineBlock(baseBusca, intents, {
            fonte: usouReply
              ? "reply"
              : escolha?.match === "ordinal"
                ? "ordinal"
                : escolha?.match === "ultima_referencia"
                  ? "ultima_referencia"
                  : "texto",
            opcao: repliedOption,
          });
          if (refine) {
            quoteBlock += refine;
            console.log(
              JSON.stringify({
                event: "flight_refine_detected",
                conversation_id: conv.id,
                protocolo_id: protocolo.id,
                quote_id: cotacaoAtiva.quote_id,
                intents: intents.map((i) => i.kind),
                referencia_fonte: usouReply ? "reply" : (escolha?.match ?? "nenhuma"),
                reply_option_index: repliedOption?.option_index ?? null,
                base_origem_iata: baseBusca?.origem_iata ?? null,
                base_destino_iata: baseBusca?.destino_iata ?? null,
                at: new Date().toISOString(),
              }),
            );
          }
        }
      }
    }

  } catch (err) {
    console.warn("[agent] memória de cotações indisponível:", err);
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
        { slug: centralAgent.slug, nome: centralAgent.nome },
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
    // MAPA DE ATENDIMENTO: o fluxo desenhado na aba Fluxos entra no prompt de
    // TODOS os agentes. Quem edita o mapa muda o roteamento sem tocar em código.
    const { blocoFluxoParaPrompt } = await import("./flow.server");
    const mapa = await blocoFluxoParaPrompt().catch(() => "");
    const fluxoBlock = mapa ? `\n\n${mapa}` : "";

    const system =
      (centralAgent
        ? buildCentralPrompt(
            centralAgent.nome,
            CENTRAL_GENDER[centralAgent.slug as CentralSlug] ?? "f",
            centralBrief,
            {
              primeiroContato: centralPrimeiroContato,
              storedPrompt: centralAgent.system_prompt,
              origemSugeridaPeloHistorico: origemSugerida,
              origemConfirmadaNoProtocolo,

            },
          ) +
          "\n\n" +
          buildSystemPrompt(agent, conv, protocolo, isNewProtocolo, previousContext, { contextOnly: true })
        : buildSystemPrompt(agent, conv, protocolo, isNewProtocolo, previousContext)) +
      fluxoBlock +
      repliedBlock +
      imagemBlock +
      quoteBlock +
      pacoteBlock +
      escopoBlock +
      flightBlock;




    const loadedPromptType = centralAgent ? "central_especialistas" : "consultor";
    const enabledTools = Object.keys(cleanTools).sort();
    const promptHash = createHash("sha256").update(system).digest("hex");
    const runtimeAudit = {
      event: "ai_run_started",
      conversation_id: conv.id,
      protocol_id: protocolo.id,
      ai_run_id: aiRunId,
      trigger_message_id: triggerMessageId,
      selected_agent_slug: agent.slug,
      selected_agent_name: agent.nome,
      loaded_prompt_type: loadedPromptType,
      loaded_prompt_hash: promptHash,
      loaded_prompt_version: centralAgent ? CENTRAL_PROMPT_VERSION : "consultor-shared",
      enabled_tools: enabledTools,
      origem_informada_pelo_cliente: centralAgent ? !centralBriefHasMissingOrigin(centralBrief) : null,
      origem_sugerida_pelo_historico: centralAgent ? origemSugerida : null,
      central_brief: centralAgent ? centralBrief : null,
    };
    console.log("[agent-runtime]", JSON.stringify(runtimeAudit));

    const agentPromptMismatch =
      ((agent.equipe ?? "consultor") === "especialista") !== (loadedPromptType === "central_especialistas") ||
      (loadedPromptType === "central_especialistas" && !enabledTools.includes("pesquisar_passagens"));
    if (agentPromptMismatch) {
      console.error("[agent-runtime]", JSON.stringify({ ...runtimeAudit, event: "agent_prompt_mismatch" }));
      return;
    }

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


    let rawText = result.text?.trim();
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
    // Origem já confirmada neste mesmo protocolo não exige nova pergunta.
    if (centralAgent && !origemConfirmadaNoProtocolo && centralBriefHasMissingOrigin(centralBrief)) {
      // O brief da triagem é tirado da PRIMEIRA mensagem e nunca é atualizado.
      // Se já perguntamos a origem neste protocolo e o cliente respondeu
      // (ex.: "Maringá"), o guarda não pode repetir saudação + pergunta.
      const [{ data: outProto }, { data: inProto }] = await Promise.all([
        supabaseAdmin
          .from("wa_messages")
          .select("content, created_at")
          .eq("conversation_id", conv.id)
          .gte("created_at", protocolo.opened_at)
          .eq("direction", "outbound")
          .order("created_at", { ascending: true })
          .limit(60),
        supabaseAdmin
          .from("wa_messages")
          .select("content, created_at")
          .eq("conversation_id", conv.id)
          .gte("created_at", protocolo.opened_at)
          .eq("direction", "inbound")
          .order("created_at", { ascending: true })
          .limit(60),
      ]);
      const outboundProto = (outProto ?? []) as Array<{ content: string | null; created_at: string }>;
      const jaRespondeu = origemJaFoiRespondidaNoProtocolo({
        outbound: outboundProto,
        inbound: (inProto ?? []) as Array<{ content: string | null; created_at: string }>,
        sugestao: origemSugerida,
      });

      if (!jaRespondeu && (isInvalidMissingOriginResponse(rawText) || !isValidOriginQuestion(rawText, origemSugerida))) {
        console.warn("[agent-runtime]", JSON.stringify({
          ...runtimeAudit,
          event: "invalid_airflow_response_blocked",
          reason: "missing_origin_or_wrong_product",
          generated_response: rawText,
        }));
        rawText = safeMissingOriginResponse(conv.display_name, origemSugerida, {
          semSaudacao: outboundProto.length > 0,
        });
      } else if (jaRespondeu && isInvalidMissingOriginResponse(rawText)) {
        console.warn("[agent-runtime]", JSON.stringify({
          ...runtimeAudit,
          event: "airflow_response_kept_origin_already_answered",
        }));
      }
    }

    // TRAVA ANTI-REPETIÇÃO: com a origem já informada, a pergunta de embarque
    // não pode sair de novo. Remove a linha repetida; se sobrar só isso,
    // confirma a origem em vez de perguntar outra vez.
    if (centralAgent && origemConfirmadaNoProtocolo) {
      const linhas = rawText.split(/\n+/);
      const limpas = linhas.filter((l) => !isValidOriginQuestion(l, origemConfirmadaNoProtocolo));
      if (limpas.length !== linhas.length) {
        console.warn("[agent-runtime]", JSON.stringify({
          ...runtimeAudit,
          event: "origin_question_repeat_blocked",
          origem: origemConfirmadaNoProtocolo,
        }));
        const restante = limpas.join("\n").trim();
        rawText = restante || `Perfeito, então o embarque sai de ${origemConfirmadaNoProtocolo}`;
      }
    }



    // Deve rodar DEPOIS do Airflow Guard: quando faltava origem, o guard podia
    // substituir toda a resposta e apagar a apresentação recém-adicionada.
    // Assim, a primeira entrada de Bruno/Paula sempre se apresenta, inclusive
    // quando precisa perguntar imediatamente a cidade de embarque.
    if (centralAgent && centralPrimeiroContato) {
      const nomeEsc = centralAgent.nome.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const jaSeApresentou = new RegExp(`(?:sou (?:a|o)|aqui (?:é|e))\\s+${nomeEsc}\\b`, "i").test(rawText);
      if (!jaSeApresentou) {
        const cliente = extractFirstName(conv.display_name);
        const saudacao = cliente ? `Oi, ${cliente}! Tudo bem?` : "Oi! Tudo bem?";
        const artigo = CENTRAL_GENDER[centralAgent.slug as CentralSlug] === "m" ? "o" : "a";
        rawText = `${saudacao}\n\nSou ${artigo} ${centralAgent.nome}, do setor aéreo da VIA AIR\n\nVou cuidar da sua cotação por aqui\n\n${rawText}`;
      }
    }


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


    // Confirma o vínculo imediatamente antes de persistir/enviar. Uma nova
    // mensagem, protocolo ou troca de agente invalida esta execução antiga.
    const [{ data: currentConv }, { data: latestInboundNow }, { count: alreadyAnswered }] = await Promise.all([
      supabaseAdmin
        .from("wa_conversations")
        .select("protocolo_ativo_id, central_slug, agent_slug, mode, ai_paused, ai_instruction_at")
        .eq("id", conv.id)
        .maybeSingle(),
      supabaseAdmin
        .from("wa_messages")
        .select("id")
        .eq("conversation_id", conv.id)
        .eq("direction", "inbound")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      triggerMessageId && latestInboundAtStart?.created_at
        ? supabaseAdmin
            .from("wa_messages")
            .select("id", { count: "exact", head: true })
            .eq("conversation_id", conv.id)
            .eq("protocolo_id", protocolo.id)
            .eq("direction", "outbound")
            .neq("sender", "system")
            // O aviso de transferência não conta como resposta: ele é só a
            // ponte pro especialista, que responde no run agendado depois.
            .neq("content", AVISO_TRANSFERENCIA_AEREO)
            .gt("created_at", latestInboundAtStart.created_at)
        : Promise.resolve({ count: 0 }),

    ]);
    const activeSlug = centralAgent ? currentConv?.central_slug : currentConv?.agent_slug;
    const runtimeSwitchedToCentral = !centralAgent && currentConv?.central_slug != null;
    const staleRun =
      currentConv?.mode !== "ai" ||
      currentConv?.ai_paused === true ||
      currentConv?.protocolo_ativo_id !== protocolo.id ||
      latestInboundNow?.id !== triggerMessageId ||
      runtimeSwitchedToCentral ||
      (instructionRun && currentConv?.ai_instruction_at !== instructionAtStart) ||
      // Uma orientação pode ser enviada horas depois da última conversa. Se o
      // plantão mudou nesse intervalo, pickAgent escolhe o agente disponível e
      // bindAgentToProtocol já atualiza o protocolo. Não cancele esse run só
      // porque a coluna legada da conversa ainda aponta para o agente anterior.
      (!instructionRun && activeSlug != null && activeSlug !== agent.slug) ||
      (!instructionRun && (alreadyAnswered ?? 0) > 0);
    if (staleRun) {
      console.warn("[agent-runtime]", JSON.stringify({
        ...runtimeAudit,
        event: "pending_ai_run_cancelled",
        previous_agent_slug: agent.slug,
        new_agent_slug: activeSlug ?? null,
        latest_trigger_message_id: latestInboundNow?.id ?? null,
        already_answered: (alreadyAnswered ?? 0) > 0,
      }));
      return;
    }

    // Quando já houve atendimento de um consultor neste protocolo, o aviso de
    // transferência precisa sair com o nome dele ANTES da entrada do Aéreo.
    // A checagem pelo conteúdo torna a operação idempotente em reprocessamentos.
    if (centralAgent && centralPrimeiroContato) {
      const transicao = AVISO_TRANSFERENCIA_AEREO;
      const [{ data: ultimoConsultor }, { count: jaAvisou }] = await Promise.all([
        supabaseAdmin
          .from("wa_messages")
          .select("agent_slug")
          .eq("conversation_id", conv.id)
          .eq("protocolo_id", protocolo.id)
          .eq("direction", "outbound")
          .not("agent_slug", "is", null)
          .neq("agent_slug", centralAgent.slug)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabaseAdmin
          .from("wa_messages")
          .select("id", { count: "exact", head: true })
          .eq("conversation_id", conv.id)
          .eq("protocolo_id", protocolo.id)
          .eq("direction", "outbound")
          .eq("content", transicao),
      ]);
      const consultor = ultimoConsultor?.agent_slug
        ? agents.find((item) => item.slug === ultimoConsultor.agent_slug && item.equipe !== "especialista")
        : null;
      if (consultor && (jaAvisou ?? 0) === 0) {
        const row = await saveMessage({
          conversation_id: conv.id,
          direction: "outbound",
          sender: "camila",
          agent_slug: consultor.slug,
          content: transicao,
        });
        const enviado = await sendWhatsAppBubbles(conv.wa_phone, transicao, buildSenderPrefix(consultor.nome));
        const { setWaMessageId, setSendError } = await import("./conversation.server");
        if (row?.id && enviado[0]?.id) await setWaMessageId(row.id, enviado[0].id);
        else if (row?.id) await setSendError(row.id, enviado[0]?.error ?? "Não entregue pelo WhatsApp");

        // TRANSFERÊNCIA COM CARA DE HUMANA: o especialista não entra no mesmo
        // segundo. Reagenda este protocolo para 1min30 a 3min e encerra o run —
        // o dispatcher com debounce refaz a geração e o Bruno/Paula responde lá.
        const esperaMs = 90_000 + Math.floor(Math.random() * 90_000);
        await supabaseAdmin
          .from("wa_conversations")
          .update({ ai_debounce_until: new Date(Date.now() + esperaMs).toISOString() })
          .eq("id", conv.id);
        console.log(
          "[agent] transferência anunciada; especialista responde em",
          Math.round(esperaMs / 1000),
          "s",
        );
        return;
      }
    }


    const { splitToBubbles } = await import("./send.server");
    const { aplicarViciosDeLinguagem } = await import("./text-utils.server");
    const bubbles = splitToBubbles(aplicarViciosDeLinguagem(text));
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
      let clearInstruction = supabaseAdmin
        .from("wa_conversations")
        .update({ ai_instruction: null, ai_instruction_at: null, ai_instruction_by: null })
        .eq("id", conv.id);
      if (instructionAtStart) clearInstruction = clearInstruction.eq("ai_instruction_at", instructionAtStart);
      await clearInstruction;
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
