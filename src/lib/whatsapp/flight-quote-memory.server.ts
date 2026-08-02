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
/**
 * DURAÇÃO: "qual demora menos", "qual leva menos tempo", "qual é mais rápida",
 * "qual tem menor duração", "qual viagem é mais curta", "qual voa menos".
 * Nunca é escolha — é comparação entre as opções já enviadas.
 */
const RX_DURACAO_COMPARACAO =
  /\b(menor|menos)\s+(tempo|dura(ç|c)(ã|a)o)\b|\bdura(ç|c)(ã|a)o\s+menor\b|\b(demora|leva|dura|voa)\s+menos\b|\bmenos\s+(horas?|tempo)\s+(de\s+)?(voo|viagem)?\b|\bmais\s+r[áa]pid[ao]s?\b|\bmais\s+curt[ao]s?\b|\bviagem\s+mais\s+curta\b|\bchega\s+em\s+menos\s+tempo\b/i;

export type ComparisonIntent = "chegada_mais_cedo" | "saida_mais_cedo" | "menor_duracao";
/** Tipo publicado no contexto do agente (`comparison_type`). */
export type ComparisonType = "arrival" | "departure" | "duration";

const COMPARISON_TYPE: Record<ComparisonIntent, ComparisonType> = {
  chegada_mais_cedo: "arrival",
  saida_mais_cedo: "departure",
  menor_duracao: "duration",
};

/** Comparação por DURAÇÃO ("qual demora menos"). Nunca é escolha. */
export function detectDurationComparisonIntent(
  texto: string,
): { comparison_type: "duration" } | null {
  return RX_DURACAO_COMPARACAO.test(String(texto ?? "")) ? { comparison_type: "duration" } : null;
}

/** Detecta intenção de COMPARAÇÃO (tem prioridade sobre a leitura ordinal). */
export function detectComparisonIntent(texto: string): ComparisonIntent | null {
  const t = String(texto ?? "");
  if (RX_CHEGA_CEDO.test(t)) return "chegada_mais_cedo";
  if (RX_SAI_CEDO.test(t)) return "saida_mais_cedo";
  if (detectDurationComparisonIntent(t)) return "menor_duracao";
  return null;
}

/** `comparison_type` normalizado da mensagem ("arrival" | "departure" | "duration"). */
export function detectComparisonType(texto: string): ComparisonType | null {
  const intent = detectComparisonIntent(texto);
  return intent ? COMPARISON_TYPE[intent] : null;
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
    | "ultima_referencia"
    | "continuidade";
  /** Cotação com mais de QUOTE_STALE_HOURS — precisa reconsultar. */
  stale?: boolean;
  /** Companhia da opção — mantém o escopo em perguntas seguintes ("ela"). */
  companhia?: string | null;
  /** Assunto tratado no turno (bagagem, conexão, valor…). */
  assunto?: string | null;
  /** Conflito entre a mensagem citada e o texto ("respondeu a 1 e pediu a 2"). */
  conflito?: { option_index_texto: number; option_index_citada: number } | null;
};

/** Assunto do turno — usado para manter a referência entre perguntas. */
export function detectAssunto(texto: string): string | null {
  const t = String(texto ?? "");
  if (/\b(bagagem|mala|despachad|franquia|quilos?|kg)\b/i.test(t)) return "bagagem";
  if (/\b(conex(ã|a)o|escala|dura(ç|c)(ã|a)o|quanto (demora|tempo))\b/i.test(t)) return "conexao";
  if (/\b(valor|pre(ç|c)o|quanto (fica|custa|sai)|parcel|desconto)\b/i.test(t)) return "valor";
  if (/\b(hor[áa]rio|sai|chega|decola)\b/i.test(t)) return "horario";
  if (/\b(assento|marca(ç|c)(ã|a)o)\b/i.test(t)) return "assento";
  if (/\b(tarifa|regras|remarca|alter|reembols|cancel)\b/i.test(t)) return "tarifa";
  if (/\b(emiss(ã|a)o|emitir|pagamento|fechar)\b/i.test(t)) return "emissao";
  return null;
}

/** Última opção que o cliente comentou (persistida na conversa). */
export type LastReference = {
  quote_id: string;
  option_index: number;
  /** Companhia travada na referência ("a Latam chega antes?" → "ela" = Latam). */
  companhia?: string | null;
  /** Assunto que estava sendo tratado (bagagem, conexão, valor…). */
  assunto?: string | null;
} | null;

/**
 * Pronomes/refências vagas à ÚLTIMA opção comentada:
 * "essa", "aquela", "ela", "nela", "dessa", "a de antes", "a mesma"...
 */
const RX_PRONOME_VAGO =
  /\b(ess[ae]|est[ae]|iss[oe]|dess[ae]|dest[ae]|diss[oe]|ness[ae]|nest[ae]|niss[oe]|aquel[ae]|aquilo|daquel[ae]|naquel[ae]|el[ae]|nel[ae]|del[ae]|ess[ae] da[ií]|aquel[ae] da[ií]|ess[ae] mesm[ao]|aquel[ae] mesm[ao]|a mesma|o mesmo|a de cima|a de antes|o de antes|a anterior|o anterior|a (que|q) (voc[êe]|vc|tu) (mandou|enviou|passou|mostrou)|aquel[ao] (voo|hor[áa]rio|op(ç|c)(ã|a)o|passagem|tarifa))\b/i;

/**
 * CONTINUIDADE: pergunta de acompanhamento SEM pronome, que ainda fala da
 * mesma opção ("quanto fica com bagagem?", "e são quantos quilos?").
 */
const RX_CONTINUIDADE =
  /\b(bagagem|bagagens|mala|malas|despachad|franquia|quantos? quilos?|\d{1,2}\s?kg|kg\b|dimens(õ|o)es|bagagem de m(ã|a)o|conex(ã|a)o|conex(õ|o)es|escala|dura(ç|c)(ã|a)o|quanto (demora|tempo|custa|fica|ficaria|muda|sai)|qual (o|a) (valor|pre(ç|c)o|diferen(ç|c)a)|diferen(ç|c)a|chega (que horas|a que horas)|sai (que horas|a que horas)|hor[áa]rio|assento|marca(ç|c)(ã|a)o de assento|remarca(ç|c)(ã|a)o|remarcar|alter(a|ar|a(ç|c)(ã|a)o)|cancelamento|reembols|tarifa|regras|emiss(ã|a)o|emitir|parcel|valor|pre(ç|c)o|d[áa] tempo|ainda (est[áa]|t[áa]) dispon[íi]vel|dispon[íi]vel)\b/i;

/** Pedido de REENVIO da mesma opção ("manda de novo", "reenvia aquela"). */
const RX_REENVIO =
  /\b(manda(r)?|envia(r)?|reenvia(r)?|mostra(r)?|passa(r)?|repete|repetir|ver|rever)\b[^.?!]{0,40}\b(de novo|novamente|outra vez|mais uma vez|pra mim|para mim)\b|\breenvi(a|e|ar|ando)\b/i;

/**
 * PERGUNTA (preço/condição/comparação) — nunca é decisão de compra.
 * "quanto fica com bagagem?" ≠ "fico com essa". Checado ANTES da regex de
 * escolha para não gerar falso positivo de fechamento.
 */
const RX_PERGUNTA_NAO_DECISAO =
  /\b(quanto|quando|qual|quais|como|quantos?|quantas?|tem|teria|h[áa]|d[áa] pra|dá pra|ser[áa]|e se)\b[^.?!]{0,80}\b(fica|ficaria|ficam|custa|custaria|sai|sairia|muda|mudaria|inclui|incluindo|com|barat|caro|dispon[íi]vel)\b|\?\s*$/i;
/** Interrogativa pura de preço: "quanto fica", "quanto ficaria", "qual fica mais barata". */
const RX_INTERROGATIVA_PRECO =
  /\b(quanto|qual|quais|como)\b[^.?!]{0,40}\b(fica|ficaria|ficam|custa|custaria|sai|sairia|muda|mudaria)\b/i;

/** Intenção de FILTRO/nova pesquisa — tem prioridade sobre resolver referência. */
export type SearchFilterIntent = {
  somente_voo_direto?: boolean;
  maximo_conexoes?: number;
  preferir_conexao_curta?: boolean;
  companhias_excluidas?: string[];
  companhias_incluidas?: string[];
};
const RX_FILTRO_DIRETO =
  /\b(sem (conex(ã|a)o|escala)|voo direto|voos diretos|direto mesmo|n(ã|a)o quero (escala|conex(ã|a)o)|quero evitar (escala|conex(ã|a)o)|evitar conex(ã|a)o)\b/i;
const RX_FILTRO_UMA_CONEXAO =
  /\b(no m[áa]ximo (uma|1) conex(ã|a)o|s[óo] (uma|1) conex(ã|a)o|at[ée] (uma|1) conex(ã|a)o)\b/i;
const RX_FILTRO_CONEXAO_CURTA = /\bconex(ã|a)o (r[áa]pida|curta)\b/i;
const CIA_ALT = "gol|azul|latam|tam|avianca|copa|american|united|air ?europa|tap|ita|iberia|klm|delta";
const RX_CIA_TOKEN = new RegExp(`\\b(${CIA_ALT})\\b`, "gi");
/** Linguagem natural de EXCLUSÃO: "sem Gol", "evita a Gol", "qualquer uma menos Gol". */
const RX_CIA_EXCLUIR = new RegExp(
  `\\b(?:sem|n(?:ã|a)o\\s+(?:quero|gosto\\s+de|pode\\s+ser|curto)|evit(?:a|ar|e)|tir(?:a|ar|e)|tirando|exceto|fora|nada\\s+de|menos|qualquer\\s+uma\\s+menos|qualquer\\s+um\\s+menos)\\s+(?:a\\s+|o\\s+|da\\s+|de\\s+)?(${CIA_ALT})\\b`,
  "gi",
);
/** Linguagem natural de INCLUSÃO: "pode ser Azul ou Latam", "prefiro Azul", "quero Latam". */
const RX_CIA_INCLUIR = new RegExp(
  `\\b(?:s(?:ó|o)|somente|apenas|prefiro|prefer(?:e|ência|encia)\\s+por|quero|queria|gostaria\\s+de|pode\\s+ser|podia\\s+ser|de\\s+prefer(?:ê|e)ncia|se\\s+for)\\s+(?:a\\s+|o\\s+|na\\s+|pela\\s+|de\\s+)?(${CIA_ALT})\\b`,
  "gi",
);

/** Coleta companhias citadas logo após um marcador ("Azul ou Latam"). */
function ciasNaSequencia(texto: string, from: number): string[] {
  const trecho = texto.slice(from).split(/[.!?;]|\bmas\b|\bpor(é|e)m\b/i)[0] ?? "";
  return (trecho.match(RX_CIA_TOKEN) ?? []).map((c) => c.trim());
}

const dedupCia = (arr: string[]): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of arr) {
    const k = c.toLowerCase().replace(/\s+/g, "");
    if (!seen.has(k)) {
      seen.add(k);
      out.push(c);
    }
  }
  return out;
};

/**
 * Filtros de companhia em linguagem natural. A EXCLUSÃO é lida primeiro:
 * "não quero Gol" tem o verbo "quero" dentro, e não pode virar inclusão.
 */
export function detectAirlineFilters(texto: string): {
  companhias_excluidas?: string[];
  companhias_incluidas?: string[];
} {
  const t = String(texto ?? "");
  const excluidas: string[] = [];
  const trechosExcluidos: Array<[number, number]> = [];
  RX_CIA_EXCLUIR.lastIndex = 0;
  for (let m = RX_CIA_EXCLUIR.exec(t); m; m = RX_CIA_EXCLUIR.exec(t)) {
    excluidas.push(...ciasNaSequencia(t, m.index));
    trechosExcluidos.push([m.index, m.index + m[0].length + 40]);
  }
  const incluidas: string[] = [];
  RX_CIA_INCLUIR.lastIndex = 0;
  for (let m = RX_CIA_INCLUIR.exec(t); m; m = RX_CIA_INCLUIR.exec(t)) {
    if (trechosExcluidos.some(([a, b]) => m!.index >= a && m!.index <= b)) continue;
    incluidas.push(...ciasNaSequencia(t, m.index));
  }
  const exc = dedupCia(excluidas);
  const excKeys = new Set(exc.map((c) => c.toLowerCase().replace(/\s+/g, "")));
  const inc = dedupCia(incluidas).filter((c) => !excKeys.has(c.toLowerCase().replace(/\s+/g, "")));
  const out: { companhias_excluidas?: string[]; companhias_incluidas?: string[] } = {};
  if (exc.length) out.companhias_excluidas = exc;
  if (inc.length) out.companhias_incluidas = inc;
  return out;
}

/**
 * Detecta pedido de FILTRO na pesquisa. Deve ser checado ANTES do resolvedor
 * de referências: "tem alguma sem conexão?" é filtro, não referência.
 * Nunca limpa filtros anteriores — só devolve o que apareceu nesta mensagem.
 */
export function detectSearchFilterIntent(texto: string): SearchFilterIntent | null {
  const t = String(texto ?? "");
  const out: SearchFilterIntent = {};
  if (RX_FILTRO_CONEXAO_CURTA.test(t)) {
    out.maximo_conexoes = 1;
    out.preferir_conexao_curta = true;
  } else if (RX_FILTRO_UMA_CONEXAO.test(t)) {
    out.maximo_conexoes = 1;
  } else if (RX_FILTRO_DIRETO.test(t)) {
    out.somente_voo_direto = true;
  }
  Object.assign(out, detectAirlineFilters(t));
  return Object.keys(out).length ? out : null;
}

/**
 * BAGAGEM. Três intenções bem diferentes:
 * - `consultar`: "essa tem bagagem?" → responder pelo dado da própria tarifa;
 * - `incluir`: "quanto fica com bagagem?" → NOVA pesquisa com
 *   `bagagem_despachada: true`. Nunca somar valor por conta própria;
 * - `remover`: "sem bagagem fica quanto?" → NOVA pesquisa com
 *   `bagagem_despachada: false`.
 */
export type BaggageIntent = "consultar" | "incluir" | "remover" | null;
const RX_BAGAGEM = /\b(bagagem|bagagens|mala|malas|despachad|franquia|\d{1,2}\s?kg|quilos?)\b/i;
const RX_BAGAGEM_JA_TEM =
  /\b(j[áa] (tem|inclui|vem com|est[áa] com)|tem bagagem|tem mala|inclui bagagem|vem com bagagem|essa tem mala|acompanha (mala|bagagem)|(é|e) com bagagem)\b/i;
const RX_BAGAGEM_REMOVER =
  /\b(sem\s+(a\s+)?(mala|bagagem)|tir(a|ar|ando)\s+(a\s+)?(mala|bagagem)|n(ã|a)o\s+(quero|preciso|vou\s+levar)\s+(de\s+)?(mala|bagagem)|s[óo]\s+(com\s+)?bagagem\s+de\s+m(ã|a)o|s[óo]\s+m(ã|a)o)\b/i;
const RX_BAGAGEM_INCLUIR =
  /\b(quanto (fica|ficaria|custa|sai|muda|sairia)|com (uma )?(mala|bagagem)|incluindo|inclu(ir|indo)|acrescent|adiciona(r|ndo)?|quero (a )?tarifa com|op(ç|c)(õ|o)es com bagagem|com bagagem despachada|com \d{1,2}\s?kg|despachar)\b/i;

export function detectBaggageIntent(texto: string): BaggageIntent {
  const t = String(texto ?? "");
  if (!RX_BAGAGEM.test(t)) return null;
  // Remoção primeiro: "sem bagagem fica quanto?" também casa com RX_INCLUIR.
  if (RX_BAGAGEM_REMOVER.test(t)) return "remover";
  if (RX_BAGAGEM_JA_TEM.test(t)) return "consultar";
  if (RX_BAGAGEM_INCLUIR.test(t)) return "incluir";
  return "consultar";
}

/** `bagagem_despachada` a mandar ao motor — null quando é só consulta. */
export function baggageSearchFlag(intent: BaggageIntent): boolean | null {
  return intent === "incluir" ? true : intent === "remover" ? false : null;
}

/** "manda novamente aquela opção" → o agente deve usar a tool reenviar_opcao. */
export function detectResendIntent(texto: string): boolean {
  return RX_REENVIO.test(String(texto ?? ""));
}


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
          companhia: o.companhia,
          assunto: detectAssunto(t),
          stale: alvo.idade_horas >= QUOTE_STALE_HOURS,
        }
      : null;

  const citaCompanhia = (o: QuoteOptionMemory, texto: string) => {
    const nome = o.companhia.split(/\s+/)[0] ?? o.companhia;
    return (
      new RegExp(`\\b${nome.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(texto) ||
      airlineMatches(o.companhia, texto)
    );
  };

  /** Opções da companhia citada na frase (quando houver). */
  let daCompanhiaCitada = enviadas.filter((o) => citaCompanhia(o, t));

  /**
   * ESCOPO DE COMPANHIA HERDADO: "a Latam chega antes?" → "ela demora menos
   * também?". Sem companhia no texto, mantemos a companhia da referência
   * anterior — nunca trocamos silenciosamente para a vencedora da comparação.
   */
  const pronome = RX_PRONOME_VAGO.test(t);
  if (!daCompanhiaCitada.length && ultimaRef?.companhia && (pronome || RX_CONTINUIDADE.test(t))) {
    const herdada = enviadas.filter((o) => citaCompanhia(o, ultimaRef.companhia as string));
    if (herdada.length) daCompanhiaCitada = herdada;
  }

  // -1) FILTRO DE CONEXÃO vem antes de tudo: "tem alguma sem conexão?" é
  //     alteração de busca, não referência a uma opção já enviada.
  const filtro = detectSearchFilterIntent(t);
  if (filtro && (filtro.somente_voo_direto || filtro.maximo_conexoes != null)) return null;

  // 0) COMPARAÇÃO vem antes do ordinal: "qual chega primeiro" ≠ "a primeira".
  //    Se o cliente citou (ou herdou) uma companhia, a comparação fica
  //    RESTRITA a essa companhia — nunca responde por outra.
  const comparacao = detectComparisonIntent(t);
  if (comparacao) {
    const universo = daCompanhiaCitada.length ? daCompanhiaCitada : enviadas;
    if (daCompanhiaCitada.length === 1) return achar(daCompanhiaCitada[0], "comparacao");
    const vencedora = resolveComparison(universo, comparacao);
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
  if (daCompanhiaCitada.length === 1) return achar(daCompanhiaCitada[0], "companhia");

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
  if (enviadas.length === 1 && pronome) {
    return achar(enviadas[0], "unica");
  }

  const daUltimaRef = (match: OptionReference["match"]): OptionReference | null => {
    if (!ultimaRef) return null;
    const q = memorias.find((m) => m.quote_id === ultimaRef.quote_id);
    const o = q?.opcoes.find((x) => x.option_index === ultimaRef.option_index);
    if (!q || !o) return null;
    return {
      quote_id: q.quote_id,
      option_index: o.option_index,
      opcao: o,
      match,
      companhia: o.companhia,
      assunto: detectAssunto(t) ?? ultimaRef.assunto ?? null,
      stale: q.idade_horas >= QUOTE_STALE_HOURS,
    };
  };

  // 6) pronome vago ("essa", "aquela", "ela", "dessa") + última opção comentada.
  if (pronome) {
    const ref = daUltimaRef("ultima_referencia");
    if (ref) return ref;
  }

  // 7) CONTINUIDADE: pergunta de acompanhamento sem pronome ("quanto fica com
  //    bagagem?", "e são quantos quilos?") continua na última opção comentada.
  if (RX_CONTINUIDADE.test(t)) {
    const ref = daUltimaRef("continuidade");
    if (ref) return ref;
  }

  // 8) REENVIO sem pronome ("manda de novo", "reenvia pra mim") também mantém
  //    a última referência — o cliente não precisa repetir qual é.
  if (RX_REENVIO.test(t)) {
    const ref = daUltimaRef("ultima_referencia");
    if (ref) return ref;
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
  replyToMessageId?: string | null,
): Promise<OptionReference | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // Última referência persistida (usada tanto no caminho 2 quanto no 3).
  const { data: conv } = await supabaseAdmin
    .from("wa_conversations")
    .select(
      "ultima_quote_referenciada, ultima_opcao_referenciada, ultima_companhia_referenciada, ultima_referencia_assunto",
    )
    .eq("id", conversationId)
    .maybeSingle();
  const ultimaRef: LastReference =
    conv?.ultima_quote_referenciada && conv?.ultima_opcao_referenciada
      ? {
          quote_id: conv.ultima_quote_referenciada as string,
          option_index: conv.ultima_opcao_referenciada as number,
          companhia: (conv.ultima_companhia_referenciada as string | null) ?? null,
          assunto: (conv.ultima_referencia_assunto as string | null) ?? null,
        }
      : null;

  const refTexto = resolveOptionReference(memorias, texto, ultimaRef);

  // 1) resposta citada — prioridade máxima (FK interna primeiro, depois id da Meta)
  if (replyToMessageId || replyToWaId) {
    type Citada = { quote_id: string | null; option_index: number | null };
    let citada: Citada | null = null;
    if (replyToMessageId) {
      const { data } = await supabaseAdmin
        .from("wa_messages")
        .select("quote_id, option_index")
        .eq("id", replyToMessageId)
        .maybeSingle();
      citada = (data as Citada | null) ?? null;
    }
    if (!citada && replyToWaId) {
      const { data } = await supabaseAdmin
        .from("wa_messages")
        .select("quote_id, option_index")
        .eq("wa_message_id", replyToWaId)
        .maybeSingle();
      citada = (data as Citada | null) ?? null;
    }
    const qid = citada?.quote_id ?? null;
    const oidx = citada?.option_index ?? null;

    if (qid && oidx) {
      const q = memorias.find((m) => m.quote_id === qid);
      const o = q?.opcoes.find((x) => x.option_index === oidx);
      if (q && o) {
        // CONFLITO: o cliente respondeu a um card mas escreveu outra opção
        // explicitamente ("responde a opção 1 e diz 'quero a segunda'").
        // Não escolhemos em silêncio — sinalizamos para a IA confirmar.
        const conflito =
          refTexto &&
          (refTexto.match === "ordinal" || refTexto.match === "companhia" || refTexto.match === "horario") &&
          (refTexto.quote_id !== q.quote_id || refTexto.option_index !== o.option_index)
            ? { option_index_texto: refTexto.option_index, option_index_citada: o.option_index }
            : null;
        if (conflito) {
          console.log(
            JSON.stringify({
              event: "reply_text_conflict",
              conversation_id: conversationId,
              quote_id: q.quote_id,
              ...conflito,
              at: new Date().toISOString(),
            }),
          );
        }
        const ref: OptionReference = {
          quote_id: q.quote_id,
          option_index: o.option_index,
          opcao: o,
          match: "citada",
          companhia: o.companhia,
          assunto: detectAssunto(texto),
          conflito,
          stale: q.idade_horas >= QUOTE_STALE_HOURS,
        };
        await persistLastReference(conversationId, ref);
        return ref;
      }
    }
  }

  // 2) texto + 3) última referência persistida
  if (refTexto) await persistLastReference(conversationId, refTexto);
  return refTexto;
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
      ultima_referencia_source: ref.match === "citada" ? "reply" : ref.match,
      ultima_companhia_referenciada: ref.companhia ?? null,
      ultima_referencia_assunto: ref.assunto ?? null,
    })
    .eq("id", conversationId);
}

/* ─────────────────────────────────────────────────────────────
   Escolha do cliente + cancelamento do card pendente
   ───────────────────────────────────────────────────────────── */

/**
 * Intenção INEQUÍVOCA de escolher. "fica com" saiu daqui de propósito:
 * "quanto FICA COM bagagem?" é pergunta de preço, não fechamento. Só entram
 * formas de decisão em 1ª pessoa ("fico com", "vou nessa", "pode fechar").
 */
const RX_ESCOLHA_CLARA =
  /\b(quero (ess[ae]|aquel[ae]|a (primeira|segunda|terceira)|prosseguir|fechar|emitir|reservar)|quero ir nessa|vou (querer|ficar com|nessa|nesse|de ess[ae])|vamos (nessa|nessa op(ç|c)(ã|a)o)|fico com|ficamos com|pode (fechar|reservar|emitir|seguir com)|fech(a|ar|o|amos)\b|reserv(a|ar|e)\b|emit(e|ir)\b|escolho|escolhi|me (manda|passa) (o )?(link|pagamento)|bora (nessa|de)|garant(e|ir))\b|\bacho que vai ser essa\b/i;
/** Comentário sem decisão ("essa parece boa", "gostei", "interessante"). */
const RX_APENAS_COMENTARIO = /\b(parece|achei|t(á|a) (boa|bom|legal)|interessante|gostei|ficou melhor)\b/i;

export type ChoiceDetection = {
  quote_id: string;
  option_index: number;
  opcao: QuoteOptionMemory;
  clara: boolean;
  match: OptionReference["match"];
  stale: boolean;
  conflito?: OptionReference["conflito"];
  /** Bagagem: consultar (tarifa atual) x incluir/remover (nova pesquisa). */
  bagagem?: BaggageIntent;
  /** Mesmo valor de `bagagem`, com o nome usado no contrato do fluxo aéreo. */
  bagagem_intent?: BaggageIntent;
  /** Comparação pedida no turno ("arrival" | "departure" | "duration"). */
  comparison_type?: ComparisonType | null;
};

/**
 * Detecta a escolha do cliente na última mensagem. `clara` só é true quando há
 * verbo de decisão + referência resolvida; "essa parece boa" fica em `false`
 * (a segunda arte continua saindo, para comparação).
 *
 * ORDEM OBRIGATÓRIA DE CLASSIFICAÇÃO (item 4):
 *   1) consulta (pergunta de preço/condição/bagagem);
 *   2) comparação ("qual demora menos");
 *   3) alteração da pesquisa (filtro, bagagem incluir/remover);
 *   4) decisão.
 * Só chega em "decisão" o que não foi classificado antes.
 */
export function detectCustomerChoice(
  memorias: QuoteMemory[],
  texto: string,
  refPre?: OptionReference | null,
): ChoiceDetection | null {
  const ref = refPre ?? resolveOptionReference(memorias, texto);
  if (!ref) return null;
  const t = String(texto ?? "");
  const bagagem = detectBaggageIntent(t);
  const comparison_type = detectComparisonType(t);

  // 1) CONSULTA — "quanto fica com bagagem?", "como fica com conexão?"
  const consulta =
    RX_INTERROGATIVA_PRECO.test(t) ||
    (/\?/.test(t) && RX_PERGUNTA_NAO_DECISAO.test(t) && !/\b(pode (fechar|emitir|reservar))\b/i.test(t));
  // 2) COMPARAÇÃO — nunca é escolha.
  const comparacao = !!comparison_type || ref.match === "comparacao";
  // 3) ALTERAÇÃO DA PESQUISA — filtro novo ou bagagem incluir/remover.
  const filtro = detectSearchFilterIntent(t);
  const alteracao =
    bagagem === "incluir" || bagagem === "remover" || !!(filtro && Object.keys(filtro).length);
  // 4) DECISÃO — só sobra o que não caiu em 1..3.
  const decisao = !consulta && !comparacao && !alteracao && RX_ESCOLHA_CLARA.test(t);
  const soComentario = !decisao && RX_APENAS_COMENTARIO.test(t);
  return {
    quote_id: ref.quote_id,
    option_index: ref.option_index,
    opcao: ref.opcao,
    clara: decisao && !soComentario && !ref.conflito,
    match: ref.match,
    stale: !!ref.stale,
    conflito: ref.conflito ?? null,
    bagagem,
    bagagem_intent: bagagem,
    comparison_type,
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
  replyToMessageId?: string | null,
): Promise<ChoiceDetection | null> {
  // Prioridade: mensagem citada > texto > última opção comentada.
  const ref = await resolveTurnReference(conversationId, memorias, texto, replyToWaId, replyToMessageId);

  const escolha = detectCustomerChoice(memorias, texto, ref);
  if (!escolha) return null;
  // Comparação, conflito e pergunta não são escolha: não gravam nada.
  if (escolha.match === "comparacao" || escolha.conflito) return escolha;
  if (!escolha.clara) return escolha;

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
  const staleAviso = escolha.stale
    ? `\n⏳ Essa cotação já tem mais de ${QUOTE_STALE_HOURS}h. Antes de confirmar valor ou disponibilidade, diga que vai consultar novamente ("vou consultar novamente a disponibilidade e o valor atualizado dessa opção") e refaça a busca.`
    : "";
  const origem =
    escolha.match === "citada"
      ? " (ele respondeu diretamente a esse card pelo WhatsApp)"
      : escolha.match === "continuidade"
        ? " (a pergunta é continuação da mesma opção que ele já estava discutindo — responda direto, sem perguntar de qual opção se trata)"
        : escolha.match === "ultima_referencia"
        ? " (é a última opção que ele mesmo comentou — não peça confirmação de qual é)"
        : "";

  const bagagemAviso =
    escolha.bagagem === "incluir"
      ? `\n# 🧳 PEDIDO DE VALOR COM BAGAGEM DESPACHADA (bagagem_intent: incluir)\n` +
        `Ele quer saber QUANTO FICA com bagagem despachada. NUNCA estime, some ou "chute" o valor, e nunca reaproveite o preço antigo.\n` +
        `Faça uma NOVA busca com \`pesquisar_passagens\` usando os mesmos trechos/datas/pax e \`somente_com_bagagem: true\`, e responda com o valor real retornado. Avise que está consultando o valor com bagagem.`
      : escolha.bagagem === "remover"
        ? `\n# 🧳 PEDIDO DE VALOR SEM BAGAGEM DESPACHADA (bagagem_intent: remover)\n` +
          `Ele quer o valor SEM bagagem despachada. Faça uma NOVA busca com \`pesquisar_passagens\` (mesmos trechos/datas/pax) e \`somente_com_bagagem: false\`. Nunca subtraia valor por conta própria.`
        : escolha.bagagem === "consultar"
          ? `\n# 🧳 DÚVIDA SOBRE BAGAGEM DA OPÇÃO ATUAL (bagagem_intent: consultar)\n` +
            `Ele quer saber se ESSA opção já inclui bagagem despachada. Responda apenas com o que está registrado nessa cotação, SEM nova pesquisa. Se a franquia/peso não estiver registrada, diga que confirma a franquia exata com a companhia — NÃO invente quilos, peças nem regra de bagagem.`
          : "";

  if (escolha.conflito) {
    return (
      `\n# ⚠️ CONFLITO ENTRE A MENSAGEM RESPONDIDA E O TEXTO\n` +
      `Ele respondeu ao card da opção ${escolha.conflito.option_index_citada}, mas no texto citou a opção ${escolha.conflito.option_index_texto}. NÃO escolha sozinha: pergunte de forma curta e natural qual das duas ele quer seguir antes de qualquer outro passo.` +
      staleAviso
    );
  }

  if (escolha.match === "comparacao") {
    return (
      `\n# ⚖️ O CLIENTE PEDIU UMA COMPARAÇÃO (não é escolha)\n` +
      `Pelos dados reais, a resposta é a ${resumo}. Responda comparando horários/duração das opções enviadas e explique o porquê. Não trate isso como fechamento.` +
      staleAviso +
      bagagemAviso
    );
  }
  if (!escolha.clara) {
    return (
      `\n# 👉 O CLIENTE COMENTOU UMA OPÇÃO ESPECÍFICA\n` +
      `Ele se referiu à ${resumo} (quote_id ${escolha.quote_id})${origem}. Fale dessa opção usando exatamente esses dados. Ele ainda NÃO fechou: siga conduzindo com naturalidade.` +
      staleAviso +
      bagagemAviso
    );
  }
  return (
    `\n# ✅ ESCOLHA DO CLIENTE (confirmada pelo registro, não deduza)\n` +
    `Ele escolheu a ${resumo} (quote_id ${escolha.quote_id})${origem}.\n` +
    `Confirme essa opção pelos dados reais, não mande outras opções e conduza para o próximo passo do fechamento.` +
    staleAviso +
    bagagemAviso
  );
}
