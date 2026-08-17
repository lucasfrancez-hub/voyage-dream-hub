/**
 * MOTOR ANTIFRAUDE COMPORTAMENTAL — camada determinística (pura, testável).
 *
 * Aqui NÃO existe IA: são os detectores de sinais por padrão de texto,
 * a combinação em clusters e o cálculo do risco.
 *
 * O cálculo NÃO é soma simples de pontos. Cada sinal vira uma probabilidade
 * de risco (peso × intensidade × recorrência) e as probabilidades são
 * combinadas por "noisy-OR": vários sinais fracos relacionados sobem bem mais
 * que um sinal forte isolado, e nenhum sinal sozinho estoura o topo da escala.
 * Clusters (combinações de comportamento) entram como evidência adicional e
 * os redutores multiplicam o risco para baixo.
 */

export type FraudSignalCode =
  | "REQUEST_PRE_FORMATTED"
  | "OPERATIONAL_EXECUTION"
  | "URGENCY_TRAVEL_SOON"
  | "URGENCY_PRESSURE"
  | "PRICE_INSENSITIVE"
  | "ITINERARY_DISINTEREST"
  | "INCONSISTENCY"
  | "CHECKOUT_BYPASS_ATTEMPT"
  | "INTL_MISMATCH"
  | "REPEATED_PATTERN"
  | "EVASIVE_ANSWERS"
  | "PASSENGER_SWAP"
  | "INTERNATIONAL_SHORT_STAY"
  | "AUTOMATED_TEXT_PATTERN";

export type FraudReducerCode =
  | "CONTEXT_EXPLAINED"
  | "PRICE_NEGOTIATION"
  | "ITINERARY_INTEREST"
  | "INTL_COHERENT"
  | "DATA_CONSISTENT"
  | "CHECKOUT_ACCEPTED"
  | "NATURAL_CONVERSATION";

export type FraudSignal = {
  code: FraudSignalCode;
  /** 0..1 — o quão forte o sinal aparece nesta conversa. */
  intensity: number;
  /** quantas vezes o sinal se repetiu ao longo da conversa. */
  occurrences: number;
  /** trechos que sustentam o sinal (auditoria). */
  evidence: string[];
  source: "code" | "ia";
  last_at?: string;
};

export type FraudReducer = {
  code: FraudReducerCode;
  intensity: number;
  evidence: string[];
  source: "code" | "ia";
};

export type FraudClusterCode =
  | "EXECUCAO_URGENTE"
  | "CONTORNO_CHECKOUT"
  | "INTERNACIONAL_SENSIVEL"
  | "COMPORTAMENTO_INCONSISTENTE"
  | "PERMANENCIA_ATIPICA"
  | "PADRAO_AUTOMATIZADO";

export type FraudCluster = { code: FraudClusterCode; label: string; strength: number };

export type FraudLevel = "baixo" | "atencao" | "moderado" | "alto" | "critico";

export const SIGNAL_LABEL: Record<FraudSignalCode, string> = {
  REQUEST_PRE_FORMATTED: "Solicitação inicial excessivamente estruturada",
  OPERATIONAL_EXECUTION: "Conversa puramente operacional (só executa etapas)",
  URGENCY_TRAVEL_SOON: "Viagem muito próxima",
  URGENCY_PRESSURE: "Pressão constante para concluir agora",
  PRICE_INSENSITIVE: "Pouca ou nenhuma reação ao preço",
  ITINERARY_DISINTEREST: "Sem interesse por horários, conexões, bagagem ou cia",
  INCONSISTENCY: "Contradições entre informações da conversa",
  CHECKOUT_BYPASS_ATTEMPT: "Tentativa de desviar do checkout oficial",
  INTL_MISMATCH: "Número internacional sem relação com a viagem",
  REPEATED_PATTERN: "Padrão repetido em pedidos/conversas",
  EVASIVE_ANSWERS: "Respostas evasivas a perguntas objetivas",
  PASSENGER_SWAP: "Troca de passageiros sem contexto",
  INTERNATIONAL_SHORT_STAY: "Permanência curta para um deslocamento internacional",
  AUTOMATED_TEXT_PATTERN: "Mensagens padronizadas / pouco naturais",

};

export const REDUCER_LABEL: Record<FraudReducerCode, string> = {
  CONTEXT_EXPLAINED: "Cliente explicou espontaneamente o contexto da viagem",
  PRICE_NEGOTIATION: "Pergunta preço / compara opções",
  ITINERARY_INTEREST: "Demonstra interesse por horários, conexão ou bagagem",
  INTL_COHERENT: "Número internacional coerente com a rota informada",
  DATA_CONSISTENT: "Dados mantidos consistentes ao longo da conversa",
  CHECKOUT_ACCEPTED: "Seguiu normalmente pelo checkout oficial",
  NATURAL_CONVERSATION: "Conversa natural, com contexto pessoal",
};

/** Peso = risco máximo que o sinal consegue representar sozinho (0..1). */
const SIGNAL_WEIGHT: Record<FraudSignalCode, number> = {
  REQUEST_PRE_FORMATTED: 0.16,
  OPERATIONAL_EXECUTION: 0.3,
  URGENCY_TRAVEL_SOON: 0.2,
  URGENCY_PRESSURE: 0.26,
  PRICE_INSENSITIVE: 0.27,
  ITINERARY_DISINTEREST: 0.18,
  INCONSISTENCY: 0.3,
  CHECKOUT_BYPASS_ATTEMPT: 0.44,
  INTL_MISMATCH: 0.12,
  REPEATED_PATTERN: 0.27,
  EVASIVE_ANSWERS: 0.2,
  PASSENGER_SWAP: 0.24,
  // Duração é evidência contextual: peso baixo, nunca decide sozinha.
  INTERNATIONAL_SHORT_STAY: 0.14,
  AUTOMATED_TEXT_PATTERN: 0.22,

};

const REDUCER_WEIGHT: Record<FraudReducerCode, number> = {
  CONTEXT_EXPLAINED: 0.14,
  PRICE_NEGOTIATION: 0.16,
  ITINERARY_INTEREST: 0.16,
  INTL_COHERENT: 0.12,
  DATA_CONSISTENT: 0.1,
  CHECKOUT_ACCEPTED: 0.3,
  NATURAL_CONVERSATION: 0.12,
};

export function levelFromScore(score: number): FraudLevel {
  if (score >= 80) return "critico";
  if (score >= 65) return "alto";
  if (score >= 45) return "moderado";
  if (score >= 25) return "atencao";
  return "baixo";
}

export const LEVEL_LABEL: Record<FraudLevel, string> = {
  baixo: "Baixo",
  atencao: "Atenção",
  moderado: "Moderado",
  alto: "Alto",
  critico: "Crítico",
};

/** Definição dos clusters: combinação de sinais → evidência forte. */
const CLUSTERS: Array<{
  code: FraudClusterCode;
  label: string;
  strength: number;
  /** todos obrigatórios */
  all: FraudSignalCode[];
  /** ao menos N destes */
  anyOf?: { codes: FraudSignalCode[]; min: number };
}> = [
  {
    code: "EXECUCAO_URGENTE",
    label: "Execução urgente (pedido pronto + viagem próxima + fechar já)",
    strength: 0.66,
    all: ["REQUEST_PRE_FORMATTED", "URGENCY_TRAVEL_SOON"],
    anyOf: { codes: ["OPERATIONAL_EXECUTION", "PRICE_INSENSITIVE", "ITINERARY_DISINTEREST", "URGENCY_PRESSURE"], min: 2 },
  },
  {
    code: "CONTORNO_CHECKOUT",
    label: "Tentativa de contornar o checkout oficial",
    strength: 0.78,
    all: ["CHECKOUT_BYPASS_ATTEMPT"],
    anyOf: { codes: ["URGENCY_PRESSURE", "OPERATIONAL_EXECUTION", "PRICE_INSENSITIVE", "URGENCY_TRAVEL_SOON"], min: 1 },
  },
  {
    code: "INTERNACIONAL_SENSIVEL",
    label: "Internacional muito próximo com conversa operacional",
    strength: 0.68,
    all: ["INTL_MISMATCH", "URGENCY_TRAVEL_SOON"],
    anyOf: { codes: ["OPERATIONAL_EXECUTION", "PRICE_INSENSITIVE", "URGENCY_PRESSURE"], min: 2 },
  },
  {
    code: "COMPORTAMENTO_INCONSISTENTE",
    label: "Contradições recorrentes com pressão para concluir",
    strength: 0.7,
    all: ["INCONSISTENCY"],
    anyOf: { codes: ["PASSENGER_SWAP", "EVASIVE_ANSWERS", "URGENCY_PRESSURE", "REPEATED_PATTERN"], min: 2 },
  },
  {
    code: "PADRAO_AUTOMATIZADO",
    label: "Padrão automatizado/reutilizado de solicitações",
    strength: 0.66,
    all: ["AUTOMATED_TEXT_PATTERN"],
    anyOf: { codes: ["REPEATED_PATTERN", "OPERATIONAL_EXECUTION", "PASSENGER_SWAP"], min: 2 },
  },
  {
    code: "PERMANENCIA_ATIPICA",
    label: "Permanência curta internacional somada a comportamento operacional",
    strength: 0.58,
    all: ["INTERNATIONAL_SHORT_STAY"],
    anyOf: {
      codes: [
        "PRICE_INSENSITIVE",
        "ITINERARY_DISINTEREST",
        "OPERATIONAL_EXECUTION",
        "URGENCY_PRESSURE",
        "CHECKOUT_BYPASS_ATTEMPT",
        "REQUEST_PRE_FORMATTED",
      ],
      min: 3,
    },
  },
];

function clamp(v: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, v));
}

function contribution(s: FraudSignal): number {
  const w = SIGNAL_WEIGHT[s.code] ?? 0.1;
  const intensity = clamp(s.intensity);
  const recorrencia = Math.min(1.6, 1 + 0.2 * Math.max(0, (s.occurrences || 1) - 1));
  return clamp(w * (0.5 + 0.5 * intensity) * recorrencia, 0, 0.9);
}

function noisyOr(values: number[]): number {
  return 1 - values.reduce((acc, v) => acc * (1 - clamp(v)), 1);
}

export function detectClusters(signals: FraudSignal[]): FraudCluster[] {
  const byCode = new Map(signals.map((s) => [s.code, s]));
  const presente = (c: FraudSignalCode) => (byCode.get(c)?.intensity ?? 0) >= 0.3;
  const out: FraudCluster[] = [];
  for (const c of CLUSTERS) {
    if (!c.all.every(presente)) continue;
    if (c.anyOf && c.anyOf.codes.filter(presente).length < c.anyOf.min) continue;
    const codes = [...c.all, ...(c.anyOf?.codes.filter(presente) ?? [])];
    const media =
      codes.reduce((acc, code) => acc + clamp(byCode.get(code)?.intensity ?? 0), 0) / codes.length;
    out.push({ code: c.code, label: c.label, strength: clamp(c.strength * (0.7 + 0.3 * media)) });
  }
  return out;
}

export type FraudComputation = {
  score: number;
  level: FraudLevel;
  clusters: FraudCluster[];
  transfer_required: boolean;
};

/**
 * Cálculo contextual do risco. Sinais → probabilidade combinada, clusters como
 * evidência adicional, redutores puxando para baixo.
 */
export function computeRisk(signals: FraudSignal[], reducers: FraudReducer[]): FraudComputation {
  const uteis = signals.filter((s) => clamp(s.intensity) > 0.05);
  const clusters = detectClusters(uteis);

  const base = noisyOr(uteis.map(contribution));
  const comClusters = noisyOr([base, ...clusters.map((c) => c.strength)]);

  const fatorRedutor = reducers.reduce(
    (acc, r) => acc * (1 - clamp((REDUCER_WEIGHT[r.code] ?? 0.1) * clamp(r.intensity))),
    1,
  );
  let risco = comClusters * fatorRedutor;

  // Piso: tentativa explícita de desviar do checkout nunca some por completo,
  // mas continua abaixo de "alto" se o cliente aceitou o fluxo oficial depois.
  const bypass = uteis.find((s) => s.code === "CHECKOUT_BYPASS_ATTEMPT");
  const aceitouCheckout = reducers.some((r) => r.code === "CHECKOUT_ACCEPTED" && r.intensity >= 0.5);
  if (bypass && !aceitouCheckout) risco = Math.max(risco, 0.32);

  const score = Math.round(clamp(risco) * 100);
  const level = levelFromScore(score);
  const transfer_required =
    score >= 65 || clusters.some((c) => c.code === "CONTORNO_CHECKOUT" && c.strength >= 0.72);

  return { score, level, clusters, transfer_required };
}

/* ────────────────────────────────────────────────────────────────────────────
   DETECTORES DETERMINÍSTICOS (texto do cliente)
   ────────────────────────────────────────────────────────────────────────── */

export type FraudMessage = {
  id?: string;
  direction: "inbound" | "outbound";
  sender?: string | null;
  content: string;
  created_at: string;
};

const RX_CHECKOUT_BYPASS = [
  /j[áa] tentei (por a[íi]|nesse|nesse link|a[íi])/i,
  /(n[ãa]o|nao) (funciona|abre|carrega|aprova|passa)\b.*(link|sistema|site|checkout|p[áa]gina)/i,
  /(link|sistema|site|checkout).{0,30}(n[ãa]o|nao) (funciona|abre|aprova|passa|carrega)/i,
  /(meu )?cart[ãa]o (d[áa]|deu) erro/i,
  /faz (por )?(outro|um outro) (sistema|link|jeito|meio)/i,
  /manda (outro|um outro) link/i,
  /(n[ãa]o|nao) quero pagar por a[íi]/i,
  /tem (outro|algum outro) (lugar|jeito|link|sistema|meio) (pra|para) (passar|pagar)/i,
  /por esse sistema nunca aprova/i,
  /(passa|passar) (o )?cart[ãa]o (na|pela) maquin/i,
  /manda (o )?(pix|dados) (da conta|banc[áa]ri)/i,
];

const RX_URGENCY_PRESSURE = [
  /preciso (emitir|fechar|resolver|comprar) (agora|hoje|j[áa]|urgente)/i,
  /\b(urgente|urg[êe]ncia)\b/i,
  /o quanto antes/i,
  /pra (hoje|amanh[ãa]|agora)\b/i,
  /r[áa]pido (por favor|pf)?/i,
  /(consegue|d[áa]) (emitir|fechar) (agora|j[áa]|hoje)/i,
  /manda (o )?link (de pagamento|pra pagar|logo)/i,
];

const RX_PRICE_ACCEPT = [
  /^(pode ser|ok|beleza|fechado|isso mesmo|perfeito|t[áa] bom|tudo bem)\.?$/i,
  /pode (emitir|fechar|seguir)/i,
  /qualquer (op[çc][ãa]o|hor[áa]rio|voo) serve/i,
  /(n[ãa]o|nao) importa o (pre[çc]o|valor)/i,
  /tanto faz o (hor[áa]rio|voo|pre[çc]o)/i,
  /pode ser esse mesmo/i,
];

const RX_PRICE_INTEREST = [
  /quanto (fica|custa|sai|d[áa])/i,
  /tem (mais )?barat/i,
  /mais em conta/i,
  /(t[áa]|esta|est[áa]) caro/i,
  /desconto/i,
  /parcel/i,
  /outra (data|op[çc][ãa]o) mais barat/i,
];

const RX_ITINERARY_INTEREST = [
  /hor[áa]rio/i,
  /conex[ãa]o|escala/i,
  /bagagem|mala|despach/i,
  /(qual|que) (cia|companhia|a[ée]rea)/i,
  /assento|poltrona/i,
  /dura[çc][ãa]o|chega que horas|sai que horas/i,
  /remarca|reembols|cancelamento/i,
];

const RX_CONTEXT = [
  /moro (em|na|no)\b/i,
  /minha (esposa|m[ãa]e|filha|irm[ãa]|fam[íi]lia)/i,
  /meu (marido|pai|filho|irm[ãa]o)/i,
  /(vou|vamos) (visitar|casar|estudar|trabalhar|passear|conhecer)/i,
  /est(ou|ou morando|ou em) (em|na|no)\b/i,
  /trabalho (em|na|no)\b/i,
  /(f[ée]rias|anivers[áa]rio|lua de mel|congresso|intercambio|interc[âa]mbio)/i,
];

const RX_IATA = /\b([A-Z]{3})\b/g;
const RX_DATE = /\b(\d{1,2}\s*(de\s*)?(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)[a-zç]*|\d{1,2}\/\d{1,2}(\/\d{2,4})?)\b/i;

function texto(m: FraudMessage): string {
  return (m.content || "").replace(/\[\[media:[^\]]+\]\]/g, " ").trim();
}

function match(rxs: RegExp[], t: string): boolean {
  return rxs.some((r) => r.test(t));
}

function pushSignal(
  map: Map<FraudSignalCode, FraudSignal>,
  code: FraudSignalCode,
  intensity: number,
  evidence: string,
  at?: string,
): void {
  const atual = map.get(code);
  if (!atual) {
    map.set(code, {
      code,
      intensity: clamp(intensity),
      occurrences: 1,
      evidence: evidence ? [evidence.slice(0, 180)] : [],
      source: "code",
      last_at: at,
    });
    return;
  }
  atual.intensity = clamp(Math.max(atual.intensity, intensity));
  atual.occurrences += 1;
  if (evidence && atual.evidence.length < 4) atual.evidence.push(evidence.slice(0, 180));
  if (at) atual.last_at = at;
}

function pushReducer(
  map: Map<FraudReducerCode, FraudReducer>,
  code: FraudReducerCode,
  intensity: number,
  evidence: string,
): void {
  const atual = map.get(code);
  if (!atual) {
    map.set(code, { code, intensity: clamp(intensity), evidence: evidence ? [evidence.slice(0, 180)] : [], source: "code" });
    return;
  }
  atual.intensity = clamp(Math.max(atual.intensity, intensity));
  if (evidence && atual.evidence.length < 3) atual.evidence.push(evidence.slice(0, 180));
}

/** Primeira mensagem parece uma "ficha operacional" já pronta? 0..1 */
export function preFormattedScore(first: string): number {
  const t = first.trim();
  if (t.length < 40) return 0;
  let pts = 0;
  const iatas = (t.match(RX_IATA) ?? []).filter((c) => c === c.toUpperCase());
  if (iatas.length >= 1) pts += 0.25;
  if (RX_DATE.test(t)) pts += 0.2;
  if (/\b(\d+|um|uma|dois|duas|tr[êe]s)\s*(passageiro|adulto|pax|pessoa)/i.test(t)) pts += 0.2;
  if (/bagagem|despachad|s[óo] m[ãa]o/i.test(t)) pts += 0.2;
  if (/\bretorno\b|\bida e volta\b|\bvolta\b/i.test(t)) pts += 0.15;
  if (/\b(de|saindo de)\b.{0,30}\b(para|pra|→|->)\b/i.test(t)) pts += 0.15;
  // pouca contextualização: sem saudação e sem contexto pessoal
  const saudacao = /\b(oi|ol[áa]|bom dia|boa tarde|boa noite|tudo bem)\b/i.test(t);
  if (!saudacao) pts += 0.15;
  if (!match(RX_CONTEXT, t)) pts += 0.1;
  return clamp(pts);
}

/**
 * Sinais e redutores detectados só pelo texto/estrutura da conversa.
 * Nunca sobe risco por nacionalidade/DDI isolado — INTL_MISMATCH só nasce
 * quando existe número estrangeiro + urgência + comportamento operacional.
 */
export function detectDeterministicSignals(input: {
  messages: FraudMessage[];
  wa_phone: string;
  /** Data da viagem, quando já conhecida (ISO). */
  travel_date?: string | null;
  /** Rota mencionada (para coerência com o DDI). */
  route_text?: string | null;
}): { signals: FraudSignal[]; reducers: FraudReducer[] } {
  const sinais = new Map<FraudSignalCode, FraudSignal>();
  const redutores = new Map<FraudReducerCode, FraudReducer>();

  const inbound = input.messages.filter((m) => m.direction === "inbound");
  const textos = inbound.map(texto).filter(Boolean);
  const primeiro = textos[0] ?? "";

  // 1. Pedido pré-formatado
  const pf = preFormattedScore(primeiro);
  if (pf >= 0.5) pushSignal(sinais, "REQUEST_PRE_FORMATTED", pf, primeiro, inbound[0]?.created_at);

  // 2/3. Checkout bypass e pressão
  for (const m of inbound) {
    const t = texto(m);
    if (!t) continue;
    if (match(RX_CHECKOUT_BYPASS, t)) pushSignal(sinais, "CHECKOUT_BYPASS_ATTEMPT", 0.9, t, m.created_at);
    if (match(RX_URGENCY_PRESSURE, t)) pushSignal(sinais, "URGENCY_PRESSURE", 0.7, t, m.created_at);
    if (match(RX_PRICE_ACCEPT, t)) pushSignal(sinais, "PRICE_INSENSITIVE", 0.55, t, m.created_at);
    if (match(RX_PRICE_INTEREST, t)) pushReducer(redutores, "PRICE_NEGOTIATION", 0.9, t);
    if (match(RX_ITINERARY_INTEREST, t)) pushReducer(redutores, "ITINERARY_INTEREST", 0.9, t);
    if (match(RX_CONTEXT, t)) pushReducer(redutores, "CONTEXT_EXPLAINED", 0.8, t);
  }

  // 4. Desinteresse pelo itinerário: várias mensagens e nenhuma pergunta sobre voo
  const perguntouItinerario = redutores.has("ITINERARY_INTEREST");
  const perguntouPreco = redutores.has("PRICE_NEGOTIATION");
  if (textos.length >= 4 && !perguntouItinerario) {
    pushSignal(sinais, "ITINERARY_DISINTEREST", 0.6, "Nenhuma pergunta sobre horário/conexão/bagagem");
  }

  // 5. Comportamento operacional: mensagens curtíssimas de execução, sem perguntas
  const curtasOperacionais = textos.filter((t) =>
    /^(pode ser|ok|beleza|manda o link|manda|pode emitir|fechado|isso|sim)\.?$/i.test(t.trim()),
  ).length;
  const perguntas = textos.filter((t) => t.includes("?")).length;
  if (textos.length >= 3 && curtasOperacionais >= 2 && perguntas === 0) {
    pushSignal(
      sinais,
      "OPERATIONAL_EXECUTION",
      clamp(0.45 + 0.15 * curtasOperacionais),
      `${curtasOperacionais} respostas de execução sem nenhuma pergunta`,
    );
  }

  // 6. Urgência pela data da viagem
  if (input.travel_date) {
    const dias = (new Date(input.travel_date).getTime() - Date.now()) / 86400000;
    if (dias >= 0 && dias <= 7) {
      const intensity = dias <= 1 ? 1 : dias <= 3 ? 0.8 : 0.55;
      pushSignal(sinais, "URGENCY_TRAVEL_SOON", intensity, `Embarque em ~${Math.round(dias)} dia(s)`);
    }
  }

  // 7. Número internacional — só vira sinal junto com urgência + operacional
  const digits = (input.wa_phone || "").replace(/\D/g, "");
  const internacional = digits.length > 0 && !digits.startsWith("55");
  if (internacional) {
    const rota = (input.route_text ?? textos.join(" ")).toLowerCase();
    const ddi = digits.slice(0, 3);
    const paisNaRota = DDI_HINTS[ddi]?.some((k) => rota.includes(k)) ?? false;
    if (paisNaRota) {
      pushReducer(redutores, "INTL_COHERENT", 0.9, `DDI +${ddi} coerente com a rota`);
    } else if (sinais.has("URGENCY_PRESSURE") || sinais.has("URGENCY_TRAVEL_SOON")) {
      if (sinais.has("OPERATIONAL_EXECUTION") || sinais.has("REQUEST_PRE_FORMATTED")) {
        pushSignal(sinais, "INTL_MISMATCH", 0.5, `Número +${ddi} sem relação aparente com a viagem`);
      }
    }
  }

  // 8. Mensagens muito padronizadas / repetidas
  const normalizadas = textos.map((t) => t.toLowerCase().replace(/\d+/g, "#").replace(/\s+/g, " ").trim());
  const repetidas = normalizadas.filter((t, i) => t.length > 25 && normalizadas.indexOf(t) !== i).length;
  if (repetidas >= 1) {
    pushSignal(sinais, "AUTOMATED_TEXT_PATTERN", clamp(0.4 + 0.2 * repetidas), "Estrutura de mensagem repetida");
  }

  // 9. Conversa natural (redutor)
  const naturais = textos.filter((t) => t.length > 60 && match(RX_CONTEXT, t)).length;
  if (naturais >= 1 || perguntas >= 2) {
    pushReducer(redutores, "NATURAL_CONVERSATION", clamp(0.5 + 0.2 * (naturais + perguntas)), "Conversa com contexto e perguntas");
  }
  if (perguntouPreco && perguntouItinerario) {
    pushReducer(redutores, "DATA_CONSISTENT", 0.6, "Cliente acompanha detalhes da viagem");
  }

  return { signals: [...sinais.values()], reducers: [...redutores.values()] };
}

/** Pistas simples de coerência entre DDI e rota mencionada. */
const DDI_HINTS: Record<string, string[]> = {
  "351": ["lisboa", "porto", "portugal", "lis", "opo", "faro"],
  "34": ["madri", "madrid", "barcelona", "espanha", "mad", "bcn"],
  "1": ["eua", "estados unidos", "miami", "orlando", "nova york", "new york", "mia", "jfk", "canada", "canadá", "toronto"],
  "44": ["londres", "reino unido", "lhr", "inglaterra"],
  "39": ["itália", "italia", "roma", "milão", "milao", "fco", "mxp"],
  "33": ["frança", "franca", "paris", "cdg"],
  "49": ["alemanha", "frankfurt", "munique", "fra"],
  "54": ["argentina", "buenos aires", "eze", "aep"],
  "56": ["chile", "santiago", "scl"],
  "598": ["uruguai", "montevid", "mvd"],
  "595": ["paraguai", "assun", "asu"],
  "351915": ["lisboa", "portugal"],
};
