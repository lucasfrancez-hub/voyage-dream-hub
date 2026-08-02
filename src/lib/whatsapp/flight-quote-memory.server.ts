/**
 * MEMÓRIA ESTRUTURADA DAS COTAÇÕES DE VOO.
 *
 * Problema que este módulo resolve: as opções vão ao cliente como ARTE
 * (imagem). O modelo só enxerga a legenda, então "gostei da segunda" virava
 * adivinhação — pior ainda quando existem mensagens entre a 1ª e a 2ª arte,
 * ou quando há mais de uma cotação na mesma conversa.
 *
 * Aqui a fonte de verdade é o BANCO, não o texto da conversa:
 * - `wa_flight_quotes.payload` guarda as opções reais do motor;
 * - `wa_messages.quote_id` + `option_index` dizem exatamente o que foi
 *   entregue, por qual agente e quando.
 *
 * Com isso o agente resolve "a primeira", "a segunda", "a da Azul", "a das
 * 8h", "a segunda da pesquisa anterior" e "mantém a primeira ida".
 *
 * SERVER-ONLY.
 */
import { airlineMatches } from "./airline-codes";
import type { FlightQuoteOption, FlightQuoteResult } from "./flight-quote.server";

export type QuoteOptionMemory = {
  quote_id: string;
  option_index: number;
  companhia: string;
  saida: string; // "08:10"
  chegada: string; // "13:20"
  data_ida: string;
  volta_saida: string | null;
  volta_chegada: string | null;
  paradas: number;
  duracao: string;
  bagagem_despachada: boolean;
  valor: number;
  valor_formatado: string;
  destaque: string;
  enviada_em: string | null;
  agente: string | null;
  opcao: FlightQuoteOption;
};

export type QuoteMemory = {
  quote_id: string;
  criada_em: string;
  atual: boolean;
  cancelada: boolean;
  escolha_option_index: number | null;
  rota: string;
  /** Cidades/IATAs pra resolver "a segunda de Recife". */
  origem_termos: string[];
  destino_termos: string[];
  /** Horas desde a criação — usado pra reconfirmar disponibilidade. */
  idade_horas: number;
  data_ida: string;
  data_volta: string | null;
  passageiros: string;
  agente_slug: string | null;
  agente_nome: string | null;
  filtros: Record<string, unknown> | null;
  opcoes: QuoteOptionMemory[];
  /** Opções que ainda não saíram (arte pendente). */
  pendentes: number[];
};

const hora = (s: string | null | undefined): string => String(s ?? "").split(" ")[1] ?? "—";
const dia = (s: string | null | undefined): string => String(s ?? "").split(" ")[0] ?? "—";

function money(n: number): string {
  return Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/**
 * Carrega as cotações recentes da conversa já cruzadas com o que foi
 * efetivamente entregue (wa_messages). A primeira da lista é a ATUAL.
 */
export async function loadQuoteMemory(
  conversationId: string,
  horas = 48,
): Promise<QuoteMemory[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const desde = new Date(Date.now() - horas * 60 * 60 * 1000).toISOString();

  const { data: quotes } = await supabaseAdmin
    .from("wa_flight_quotes")
    .select(
      "id, payload, created_at, agent_slug, agent_name, filtros, cancelled_at, escolha_option_index",
    )
    .eq("conversation_id", conversationId)
    .gte("created_at", desde)
    .order("created_at", { ascending: false })
    .limit(5);
  if (!quotes?.length) return [];

  const ids = quotes.map((q) => q.id as string);
  const { data: cards } = await supabaseAdmin
    .from("wa_messages")
    .select("quote_id, option_index, created_at, agent_name, agent_slug")
    .in("quote_id", ids)
    .order("created_at", { ascending: true });

  const entregues = new Map<string, { em: string; agente: string | null }>();
  for (const c of (cards ?? []) as Array<{
    quote_id: string | null;
    option_index: number | null;
    created_at: string;
    agent_name: string | null;
    agent_slug: string | null;
  }>) {
    if (!c.quote_id || !c.option_index) continue;
    const k = `${c.quote_id}:${c.option_index}`;
    if (!entregues.has(k)) entregues.set(k, { em: c.created_at, agente: c.agent_name ?? c.agent_slug });
  }

  return quotes.map((q, idx) => {
    const payload = (q.payload ?? {}) as Partial<FlightQuoteResult>;
    const opcoes = (payload.opcoes ?? []) as FlightQuoteOption[];
    const pax = payload.passageiros;
    const mem: QuoteOptionMemory[] = opcoes.map((op, i) => {
      const optionIndex = op.opcao ?? i + 1;
      const hit = entregues.get(`${q.id}:${optionIndex}`) ?? null;
      return {
        quote_id: q.id as string,
        option_index: optionIndex,
        companhia: op.ida?.cia ?? "—",
        saida: hora(op.ida?.partida),
        chegada: hora(op.ida?.chegada),
        data_ida: dia(op.ida?.partida),
        volta_saida: op.volta ? hora(op.volta.partida) : null,
        volta_chegada: op.volta ? hora(op.volta.chegada) : null,
        paradas: op.ida?.paradas ?? 0,
        duracao: op.ida?.duracao ?? "—",
        bagagem_despachada: !!op.bagagem_despachada,
        valor: Number(op.total ?? 0),
        valor_formatado: op.total_formatado ?? money(Number(op.total ?? 0)),
        destaque: op.destaque ?? "",
        enviada_em: hit?.em ?? null,
        agente: hit?.agente ?? (q.agent_name as string | null) ?? null,
        opcao: op,
      };
    });
    return {
      quote_id: q.id as string,
      criada_em: q.created_at as string,
      atual: idx === 0,
      cancelada: !!q.cancelled_at,
      escolha_option_index: (q.escolha_option_index as number | null) ?? null,
      rota: `${payload.origem_nome ?? payload.origem_iata ?? "?"} → ${payload.destino_nome ?? payload.destino_iata ?? "?"}`,
      origem_termos: [payload.origem_nome, payload.origem_iata].filter(
        (x): x is string => typeof x === "string" && x.length > 1,
      ),
      destino_termos: [payload.destino_nome, payload.destino_iata].filter(
        (x): x is string => typeof x === "string" && x.length > 1,
      ),
      idade_horas: Math.max(
        0,
        (Date.now() - new Date(q.created_at as string).getTime()) / 3_600_000,
      ),
      data_ida: payload.data_ida ?? "—",
      data_volta: payload.data_volta ?? null,
      passageiros: pax
        ? `${pax.adultos} adulto(s)${pax.criancas ? ` + ${pax.criancas} criança(s)` : ""}${pax.bebes ? ` + ${pax.bebes} bebê(s)` : ""}`
        : "—",
      agente_slug: (q.agent_slug as string | null) ?? null,
      agente_nome: (q.agent_name as string | null) ?? null,
      filtros: (q.filtros as Record<string, unknown> | null) ?? null,
      opcoes: mem,
      pendentes: mem.filter((o) => !o.enviada_em).map((o) => o.option_index),
    };
  });
}

/** Bloco de contexto ESTRUTURADO injetado no prompt do agente. */
export function buildQuoteMemoryBlock(memorias: QuoteMemory[]): string {
  const comEnvio = memorias.filter((m) => m.opcoes.some((o) => o.enviada_em));
  if (!comEnvio.length) return "";

  const linhas: string[] = [
    `\n# 🧾 OPÇÕES DE VOO JÁ ENVIADAS (DADO ESTRUTURADO — FONTE DE VERDADE)`,
    `Isto NÃO é conversa: é o registro real do que a VIA AIR entregou. Quando o cliente citar "a primeira", "a segunda", "a da Azul", "a das 8h" ou "a da pesquisa anterior", encontre a opção AQUI. Nunca deduza pela legenda da imagem e nunca invente valores.`,
  ];

  for (const m of comEnvio) {
    linhas.push(
      `\n${m.atual ? "▶ COTAÇÃO ATUAL" : "· cotação anterior"} · quote_id: ${m.quote_id}` +
        ` · ${m.rota} · ida ${m.data_ida}${m.data_volta ? ` · volta ${m.data_volta}` : " (somente ida)"} · ${m.passageiros}` +
        (m.agente_nome ? ` · pesquisada por ${m.agente_nome}` : ""),
    );
    for (const o of m.opcoes) {
      if (!o.enviada_em) continue;
      const partes = [
        `option_index: ${o.option_index}`,
        `companhia: ${o.companhia}`,
        `saida: ${o.saida}`,
        `chegada: ${o.chegada}`,
        o.volta_saida ? `volta: ${o.volta_saida} → ${o.volta_chegada}` : null,
        o.paradas === 0 ? "direto" : `${o.paradas} conexão(ões)`,
        `duracao: ${o.duracao}`,
        o.bagagem_despachada ? "bagagem despachada" : "sem bagagem despachada",
        `valor: ${o.valor_formatado}`,
      ].filter(Boolean);
      linhas.push(`  - ${partes.join(" | ")}`);
    }
    if (m.pendentes.length) {
      linhas.push(`  (opção ${m.pendentes.join(", ")} ainda está saindo — não a cite como enviada)`);
    }
    if (m.escolha_option_index) {
      linhas.push(`  ✅ O cliente JÁ ESCOLHEU a opção ${m.escolha_option_index} desta cotação.`);
    }
    if (m.idade_horas >= QUOTE_STALE_HOURS) {
      linhas.push(
        `  ⏳ Esta cotação foi feita há ~${Math.round(m.idade_horas)}h. Tarifa e disponibilidade PODEM ter mudado:` +
          ` antes de confirmar ou repetir o valor, avise naturalmente ("vou consultar novamente a disponibilidade e o valor atualizado dessa opção")` +
          ` e refaça a busca com a ferramenta. Nunca afirme que o preço continua o mesmo.`,
      );
    }
  }
  linhas.push(
    `\nRegra: ao falar de uma opção, use SEMPRE os dados acima (companhia, horário e valor exatos). Se o cliente citar uma opção que não está nesta lista, pergunte a qual ele se refere em vez de supor.`,
    `Comparação: "qual chega primeiro", "qual sai primeiro", "qual é mais rápida" NÃO são a opção 1 — compare os horários/durações reais acima e responda qual vence, dizendo o porquê.`,
  );
  return linhas.join("\n");
}

/* ─────────────────────────────────────────────────────────────
   Resolução de referência ("a segunda", "a da Azul", "a das 8h")
   ───────────────────────────────────────────────────────────── */

const ORDINAIS: Array<{ rx: RegExp; n: number }> = [
  { rx: /\b(primeira|primeiro|1[ªaºo]?\b|op(ç|c)(ã|a)o\s*1\b|numero\s*1\b|n[º°]?\s*1\b)/i, n: 1 },
  { rx: /\b(segunda|segundo|2[ªaºo]?\b|op(ç|c)(ã|a)o\s*2\b|numero\s*2\b|n[º°]?\s*2\b)/i, n: 2 },
  { rx: /\b(terceira|terceiro|3[ªaºo]?\b|op(ç|c)(ã|a)o\s*3\b)/i, n: 3 },
  { rx: /\b(quarta|quarto|4[ªaºo]?\b|op(ç|c)(ã|a)o\s*4\b)/i, n: 4 },
];

const RX_ANTERIOR = /(pesquisa|cota(ç|c)(ã|a)o|busca)\s+(anterior|passada|de ontem|antiga)|de ontem|da outra (pesquisa|cota)/i;
const RX_MAIS_BARATA = /\bmais barat|\bmenor pre(ç|c)o|\bmais em conta\b/i;
const RX_MAIS_RAPIDA = /\bmais r(á|a)pid|\bmenos tempo\b|\bmais curt|\bmenor dura(ç|c)(ã|a)o\b/i;
const RX_DIRETO = /\bdiret[oa]\b|\bsem (escala|conex)/i;

/** Depois de quantas horas a cotação precisa ser reconfirmada no motor. */
export const QUOTE_STALE_HOURS = 6;

/**
 * "Qual chega primeiro?" NÃO é a opção 1 — é comparação de horário.
 * Detectado ANTES do ordinal justamente para não colidir com "primeira".
 */
const RX_CHEGA_CEDO = /\bchega(r|m)?\s+(primeir[oa]|mais\s+cedo|antes|mais\s+r[áa]pido)\b/i;
const RX_SAI_CEDO = /\b(sai|sair|saem|parte|partem|decola(m|r)?)\s+(primeir[oa]|mais\s+cedo|antes)\b/i;
const RX_MENOR_DURACAO = /\bmenor\s+dura(ç|c)(ã|a)o\b|\bmais\s+r[áa]pid[ao]\b|\bmenos\s+tempo\s+de\s+voo\b/i;

export type ComparisonIntent = "chegada_mais_cedo" | "saida_mais_cedo" | "menor_duracao";

/** Detecta intenção de COMPARAÇÃO (tem prioridade sobre a leitura ordinal). */
export function detectComparisonIntent(texto: string): ComparisonIntent | null {
  const t = String(texto ?? "");
  if (RX_CHEGA_CEDO.test(t)) return "chegada_mais_cedo";
  if (RX_SAI_CEDO.test(t)) return "saida_mais_cedo";
  if (RX_MENOR_DURACAO.test(t)) return "menor_duracao";
  return null;
}

const minutosHora = (hhmm: string): number => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : 99999;
};
const minutosDuracao = (d: string): number => {
  const m = d.match(/(\d+)\s*h\s*(\d+)?/i);
  return m ? Number(m[1]) * 60 + Number(m[2] ?? 0) : 99999;
};

/** Resolve a opção vencedora de uma comparação de horário/duração. */
export function resolveComparison(
  opcoes: QuoteOptionMemory[],
  intent: ComparisonIntent,
): QuoteOptionMemory | null {
  if (opcoes.length < 1) return null;
  const chave = (o: QuoteOptionMemory) =>
    intent === "chegada_mais_cedo"
      ? minutosHora(o.chegada)
      : intent === "saida_mais_cedo"
        ? minutosHora(o.saida)
        : minutosDuracao(o.duracao);
  const ord = [...opcoes].sort((a, b) => chave(a) - chave(b));
  if (ord.length > 1 && chave(ord[0]) === chave(ord[1])) return null; // empate → ambíguo
  return ord[0];
}

/** Normaliza pra comparar cidade citada ("Recife", "REC", "São Paulo"). */
const semAcento = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/** "8h", "08:10", "as 8", "das 11h40" → "HH:MM" aproximado (só a hora). */
function horaCitada(texto: string): string | null {
  const m = texto.match(/\b(?:[àa]s?\s*|das\s*|de\s*)?([0-2]?\d)(?::|h|hs)\s?([0-5]\d)?\b/i);
  if (!m) return null;
  const h = Number(m[1]);
  if (Number.isNaN(h) || h > 23) return null;
  return String(h).padStart(2, "0");
}

export type OptionReference = {
  quote_id: string;
  option_index: number;
  opcao: QuoteOptionMemory;
  /** Como a referência foi resolvida (diagnóstico). */
  match:
    | "ordinal"
    | "companhia"
    | "horario"
    | "destaque"
    | "unica"
    | "comparacao"
    | "citada"
    | "ultima_referencia";
  /** Cotação com mais de QUOTE_STALE_HOURS — precisa reconsultar. */
  stale?: boolean;
};

/** Última opção que o cliente comentou (persistida na conversa). */
export type LastReference = { quote_id: string; option_index: number } | null;

/** Pronomes vagos: "essa", "vou nessa", "fechamos essa", "essa ficou melhor". */
const RX_PRONOME_VAGO =
  /\b(essa|esse|est[ae]|nessa|nesse|a de cima|essa a[ií]|essa mesmo|essa op(ç|c)(ã|a)o)\b/i;

/** Escolhe a cotação alvo considerando "pesquisa anterior" e cidade citada. */
function escolherCotacao(comEnvio: QuoteMemory[], t: string): QuoteMemory {
  const alvoTxt = semAcento(t);
  // Referência por destino/origem/rota: "a segunda de Recife", "a de Salvador"
  const porCidade = comEnvio.filter((m) =>
    [...m.destino_termos, ...m.origem_termos].some((termo) => {
      const n = semAcento(termo);
      return n.length > 2 && alvoTxt.includes(n);
    }),
  );
  if (porCidade.length === 1) return porCidade[0];
  if (porCidade.length > 1) return porCidade[0]; // mais recente entre as da cidade
  if (RX_ANTERIOR.test(t)) return comEnvio.find((m) => !m.atual) ?? comEnvio[0];
  return comEnvio[0];
}

/**
 * Resolve a qual opção o cliente se referiu. Só devolve resultado quando a
 * referência é INEQUÍVOCA — na dúvida devolve null e o agente pergunta.
 *
 * Prioridade: mensagem citada (Reply) > texto explícito > última opção
 * comentada (`ultimaRef`).
 */
export function resolveOptionReference(
  memorias: QuoteMemory[],
  texto: string,
  ultimaRef?: LastReference,
): OptionReference | null {
  const t = String(texto ?? "").trim();
  if (!t) return null;

  const comEnvio = memorias.filter((m) => m.opcoes.some((o) => o.enviada_em));
  if (!comEnvio.length) return null;

  const alvo = escolherCotacao(comEnvio, t);
  const enviadas = alvo.opcoes.filter((o) => o.enviada_em);
  if (!enviadas.length) return null;

  const achar = (o: QuoteOptionMemory | undefined, match: OptionReference["match"]) =>
    o
      ? {
          quote_id: alvo.quote_id,
          option_index: o.option_index,
          opcao: o,
          match,
          stale: alvo.idade_horas >= QUOTE_STALE_HOURS,
        }
      : null;

  // 0) COMPARAÇÃO vem antes do ordinal: "qual chega primeiro" ≠ "a primeira".
  const comparacao = detectComparisonIntent(t);
  if (comparacao) {
    const vencedora = resolveComparison(enviadas, comparacao);
    return vencedora ? achar(vencedora, "comparacao") : null;
  }

  // 1) ordinal explícito
  for (const { rx, n } of ORDINAIS) {
    if (rx.test(t)) {
      const hit = enviadas.find((o) => o.option_index === n);
      if (hit) return achar(hit, "ordinal");
    }
  }

  // 2) companhia citada (só quando UMA opção é daquela companhia)
  const porCia = enviadas.filter((o) => {
    const nome = o.companhia.split(/\s+/)[0] ?? o.companhia;
    return new RegExp(`\\b${nome.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(t) || airlineMatches(o.companhia, t);
  });
  if (porCia.length === 1) return achar(porCia[0], "companhia");

  // 3) horário citado
  const h = horaCitada(t);
  if (h) {
    const porHora = enviadas.filter((o) => o.saida.startsWith(h));
    if (porHora.length === 1) return achar(porHora[0], "horario");
  }

  // 4) atributo ("a mais barata", "a direta", "a mais rápida")
  if (RX_MAIS_BARATA.test(t)) {
    const ordenadas = [...enviadas].sort((a, b) => a.valor - b.valor);
    if (ordenadas.length && ordenadas[0].valor !== ordenadas[1]?.valor) return achar(ordenadas[0], "destaque");
  }
  if (RX_MAIS_RAPIDA.test(t)) {
    const vencedora = resolveComparison(enviadas, "menor_duracao");
    if (vencedora) return achar(vencedora, "destaque");
  }
  if (RX_DIRETO.test(t)) {
    const diretas = enviadas.filter((o) => o.paradas === 0);
    if (diretas.length === 1) return achar(diretas[0], "destaque");
  }

  // 5) só existe UMA opção entregue e o cliente falou "essa"
  if (enviadas.length === 1 && RX_PRONOME_VAGO.test(t)) {
    return achar(enviadas[0], "unica");
  }

  // 6) pronome vago + última opção COMENTADA pelo cliente ("gostei da primeira"
  //    → "fechamos essa"). Não é compra: é só a referência mais recente.
  if (ultimaRef && RX_PRONOME_VAGO.test(t)) {
    const q = memorias.find((m) => m.quote_id === ultimaRef.quote_id);
    const o = q?.opcoes.find((x) => x.option_index === ultimaRef.option_index);
    if (q && o) {
      return {
        quote_id: q.quote_id,
        option_index: o.option_index,
        opcao: o,
        match: "ultima_referencia",
        stale: q.idade_horas >= QUOTE_STALE_HOURS,
      };
    }
  }
  return null;
}

/**
 * Resolve a referência do TURNO inteiro, com a prioridade oficial:
 * 1) mensagem citada pelo botão "Responder" do WhatsApp;
 * 2) texto da mensagem (ordinal, companhia, horário, valor, comparação);
 * 3) última opção referenciada persistida na conversa.
 * Sempre que resolve, PERSISTE a referência na conversa.
 */
export async function resolveTurnReference(
  conversationId: string,
  memorias: QuoteMemory[],
  texto: string,
  replyToWaId?: string | null,
): Promise<OptionReference | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // 1) resposta citada — prioridade máxima
  if (replyToWaId) {
    const { data: citada } = await supabaseAdmin
      .from("wa_messages")
      .select("quote_id, option_index")
      .eq("wa_message_id", replyToWaId)
      .maybeSingle();
    const qid = (citada?.quote_id as string | null) ?? null;
    const oidx = (citada?.option_index as number | null) ?? null;
    if (qid && oidx) {
      const q = memorias.find((m) => m.quote_id === qid);
      const o = q?.opcoes.find((x) => x.option_index === oidx);
      if (q && o) {
        const ref: OptionReference = {
          quote_id: q.quote_id,
          option_index: o.option_index,
          opcao: o,
          match: "citada",
          stale: q.idade_horas >= QUOTE_STALE_HOURS,
        };
        await persistLastReference(conversationId, ref);
        return ref;
      }
    }
  }

  // 2) texto + 3) última referência persistida
  const { data: conv } = await supabaseAdmin
    .from("wa_conversations")
    .select("ultima_quote_referenciada, ultima_opcao_referenciada")
    .eq("id", conversationId)
    .maybeSingle();
  const ultimaRef: LastReference =
    conv?.ultima_quote_referenciada && conv?.ultima_opcao_referenciada
      ? {
          quote_id: conv.ultima_quote_referenciada as string,
          option_index: conv.ultima_opcao_referenciada as number,
        }
      : null;

  const ref = resolveOptionReference(memorias, texto, ultimaRef);
  if (ref) await persistLastReference(conversationId, ref);
  return ref;
}

/** Grava a última opção comentada (NÃO é compra, é só referência). */
export async function persistLastReference(
  conversationId: string,
  ref: OptionReference,
): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin
    .from("wa_conversations")
    .update({
      ultima_quote_referenciada: ref.quote_id,
      ultima_opcao_referenciada: ref.option_index,
      ultima_referencia_at: new Date().toISOString(),
    })
    .eq("id", conversationId);
}

/* ─────────────────────────────────────────────────────────────
   Escolha do cliente + cancelamento do card pendente
   ───────────────────────────────────────────────────────────── */

/** Intenção INEQUÍVOCA de escolher ("quero a segunda", "fecho com a da Azul"). */
const RX_ESCOLHA_CLARA =
  /\b(quero|vou (querer|ficar|de|nessa|nesse)|vamos nessa|fico com|fica(mos)? com|pode (ser|fechar|reservar|emitir)|fech(a|ar|o|amos)|reserv(a|ar|e)|emit(e|ir)|escolho|prefiro|me (manda|passa) (o )?(link|pagamento)|bora (nessa|de)|garant(e|ir))\b|\bacho que vai ser essa\b/i;
/** Comentário sem decisão ("essa parece boa", "gostei", "interessante"). */
const RX_APENAS_COMENTARIO = /\b(parece|achei|t(á|a) (boa|bom|legal)|interessante|gostei|ficou melhor)\b/i;

export type ChoiceDetection = {
  quote_id: string;
  option_index: number;
  opcao: QuoteOptionMemory;
  clara: boolean;
  match: OptionReference["match"];
  stale: boolean;
};

/**
 * Detecta a escolha do cliente na última mensagem. `clara` só é true quando há
 * verbo de decisão + referência resolvida; "essa parece boa" fica em `false`
 * (a segunda arte continua saindo, para comparação).
 */
export function detectCustomerChoice(
  memorias: QuoteMemory[],
  texto: string,
  refPre?: OptionReference | null,
): ChoiceDetection | null {
  const ref = refPre ?? resolveOptionReference(memorias, texto);
  if (!ref) return null;
  const decisao = RX_ESCOLHA_CLARA.test(texto);
  const soComentario = !decisao && RX_APENAS_COMENTARIO.test(texto);
  return {
    quote_id: ref.quote_id,
    option_index: ref.option_index,
    opcao: ref.opcao,
    // Comparação ("qual chega primeiro") nunca é escolha.
    clara: decisao && !soComentario && ref.match !== "comparacao",
    match: ref.match,
    stale: !!ref.stale,
  };
}

/**
 * Registra a escolha e, quando ela é inequívoca, CANCELA o card pendente para
 * o cliente não receber outra opção depois de já ter decidido.
 */
export async function registerCustomerChoice(
  conversationId: string,
  memorias: QuoteMemory[],
  texto: string,
  replyToWaId?: string | null,
): Promise<ChoiceDetection | null> {
  // Prioridade: mensagem citada > texto > última opção comentada.
  const ref = await resolveTurnReference(conversationId, memorias, texto, replyToWaId);
  const escolha = detectCustomerChoice(memorias, texto, ref);
  if (!escolha) return null;
  // Comparação não é escolha: não grava escolha_option_index.
  if (escolha.match === "comparacao") return escolha;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { logCardEvent } = await import("./card-log.server");
  const quote = memorias.find((m) => m.quote_id === escolha.quote_id);

  const patch: {
    escolha_option_index: number;
    escolha_at: string;
    cancelled_at?: string;
    cancelled_reason?: string;
  } = {
    escolha_option_index: escolha.option_index,
    escolha_at: new Date().toISOString(),
  };
  const pendentes = quote?.pendentes ?? [];
  if (escolha.clara && pendentes.length) {
    patch.cancelled_at = new Date().toISOString();
    patch.cancelled_reason = "pending_card_cancelled_by_customer_choice";
  }
  await supabaseAdmin.from("wa_flight_quotes").update(patch).eq("id", escolha.quote_id);

  if (escolha.clara && pendentes.length) {
    for (const idx of pendentes) {
      logCardEvent({
        event: "card_cancelled",
        conversation_id: conversationId,
        quote_id: escolha.quote_id,
        option_index: idx,
        card_type: "flight_option",
        failure_reason: "pending_card_cancelled_by_customer_choice",
        delivery_status: "failed",
      });
    }
  }
  return escolha;
}

/** Bloco curto no prompt avisando qual opção o cliente acabou de escolher. */
export function buildChoiceBlock(escolha: ChoiceDetection | null): string {
  if (!escolha) return "";
  const o = escolha.opcao;
  const resumo = `opção ${o.option_index} · ${o.companhia} · ${o.saida} → ${o.chegada}${o.volta_saida ? ` · volta ${o.volta_saida}` : ""} · ${o.valor_formatado}`;
  if (!escolha.clara) {
    return (
      `\n# 👉 O CLIENTE COMENTOU UMA OPÇÃO ESPECÍFICA\n` +
      `Ele se referiu à ${resumo} (quote_id ${escolha.quote_id}). Fale dessa opção usando exatamente esses dados. Ele ainda NÃO fechou: siga conduzindo com naturalidade.`
    );
  }
  return (
    `\n# ✅ ESCOLHA DO CLIENTE (confirmada pelo registro, não deduza)\n` +
    `Ele escolheu a ${resumo} (quote_id ${escolha.quote_id}).\n` +
    `Confirme essa opção pelos dados reais, não mande outras opções e conduza para o próximo passo do fechamento.`
  );
}
