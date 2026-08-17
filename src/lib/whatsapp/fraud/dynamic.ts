/**
 * MOTOR ANTIFRAUDE — camada de ESTADO VIVO (pura, testável, sem IA e sem banco).
 *
 * Aqui o score deixa de ser "soma de sinais" e passa a se comportar como um
 * score de crédito: cada sinal tem força, nasce, decai, é reforçado, pode ser
 * esclarecido; a confiança cresce quando várias evidências independentes
 * apontam junto; a tendência/velocidade/persistência descrevem o movimento; e
 * a transferência é decidida por CENÁRIOS (A..E), nunca por um threshold único.
 */
import {
  computeRisk,
  levelFromScore,
  type FraudCluster,
  type FraudClusterCode,
  type FraudLevel,
  type FraudReducer,
  type FraudSignal,
  type FraudSignalCode,
} from "./signals";

/* ── Sinal persistido (com ciclo de vida) ─────────────────────────────────── */

export type StoredSignalStatus = "ativo" | "enfraquecido" | "esclarecido" | "expirado";

export type StoredSignal = FraudSignal & {
  /** força efetiva atual (0..1) — é ela que entra no cálculo. */
  strength: number;
  created_at: string;
  last_reinforced_at: string;
  /** perda de força por hora sem reforço (0..1). */
  decay_rate: number;
  status: StoredSignalStatus;
  /** reduções manuais aplicadas pelo time (sinal esclarecido). */
  cleared_by?: string | null;
  cleared_at?: string | null;
};

export type FraudCriticalFlag =
  | "CHECKOUT_BYPASS_REPEAT"
  | "MULTIPLE_PAYMENT_FAILURE_PATTERN"
  | "IDENTITY_INCONSISTENCY"
  | "EXTREME_URGENCY_CLUSTER"
  | "REPEATED_OPERATIONAL_PATTERN"
  | "PAYMENT_METHOD_ROTATION"
  | "GATEWAY_RISK_FLAG";

export const CRITICAL_FLAG_LABEL: Record<FraudCriticalFlag, string> = {
  CHECKOUT_BYPASS_REPEAT: "Insistência repetida para sair do checkout oficial",
  MULTIPLE_PAYMENT_FAILURE_PATTERN: "Sequência de tentativas de pagamento recusadas",
  IDENTITY_INCONSISTENCY: "Divergência de identidade/dados do passageiro",
  EXTREME_URGENCY_CLUSTER: "Urgência extrema combinada com indiferença a preço",
  REPEATED_OPERATIONAL_PATTERN: "Padrão operacional repetido/automatizado",
  PAYMENT_METHOD_ROTATION: "Troca sucessiva de cartões/meios de pagamento",
  GATEWAY_RISK_FLAG: "Gateway/antifraude externo apontou risco",
};

export type FraudTrend = "subindo" | "estavel" | "caindo";
export type FraudVelocity = "leve" | "moderada" | "rapida";

export type FraudBand = "baixo" | "observacao" | "atencao" | "elevado" | "alto" | "critico";

export const BAND_LABEL: Record<FraudBand, string> = {
  baixo: "Baixo",
  observacao: "Observação",
  atencao: "Atenção",
  elevado: "Elevado",
  alto: "Alto",
  critico: "Crítico",
};

/** Faixas visuais do briefing (item 12) — referência de leitura, não decisão. */
export function bandFromScore(score: number): FraudBand {
  if (score >= 85) return "critico";
  if (score >= 70) return "alto";
  if (score >= 55) return "elevado";
  if (score >= 40) return "atencao";
  if (score >= 25) return "observacao";
  return "baixo";
}

export type FraudHistoryEntry = {
  at: string;
  score: number;
  confidence: number;
  level: FraudLevel;
  band: FraudBand;
  label: string;
  kind?: string;
};

/** Metadados SEGUROS de pagamento (nunca cartão completo/CVV). */
export type FraudPaymentMeta = {
  payment_attempt_count?: number;
  payment_status?: string | null;
  payment_method_changed?: boolean;
  different_card_attempts?: number;
  checkout_bypass?: boolean;
  gateway_risk_result?: "approved" | "review" | "declined" | "fraud" | null;
  identity_match_result?: "match" | "partial" | "mismatch" | null;
  last_event_at?: string | null;
};

export type ManualOverride = {
  action: "verificado" | "sinal_esclarecido" | "risco_descartado" | "observacao" | "bloquear_venda";
  signal_code?: FraudSignalCode | null;
  note?: string | null;
  at: string;
  by?: string | null;
};

function clamp(v: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, Number.isFinite(v) ? v : 0));
}

const DECAY_BY_SIGNAL: Partial<Record<FraudSignalCode, number>> = {
  // sinais "de contexto" envelhecem rápido quando não se confirmam
  REQUEST_PRE_FORMATTED: 0.055,
  AUTOMATED_TEXT_PATTERN: 0.045,
  ITINERARY_DISINTEREST: 0.045,
  PRICE_INSENSITIVE: 0.035,
  URGENCY_TRAVEL_SOON: 0.02,
  // duração é evidência contextual: perde força rápido quando não se confirma
  INTERNATIONAL_SHORT_STAY: 0.04,
  // sinais objetivos praticamente não somem
  CHECKOUT_BYPASS_ATTEMPT: 0.008,
  INCONSISTENCY: 0.012,
  PASSENGER_SWAP: 0.012,
};
const DEFAULT_DECAY = 0.03;

function hoursBetween(a: string, b: string): number {
  const d = (new Date(b).getTime() - new Date(a).getTime()) / 3_600_000;
  return Number.isFinite(d) && d > 0 ? d : 0;
}

/**
 * Item 7 (decaimento) + item 8 (reforço): funde os sinais recém-detectados
 * com o histórico persistido, envelhecendo o que não se confirmou.
 */
export function evolveSignals(
  previous: StoredSignal[],
  fresh: FraudSignal[],
  nowIso: string,
): StoredSignal[] {
  const map = new Map<FraudSignalCode, StoredSignal>();

  for (const p of previous) {
    const decay = p.decay_rate ?? DECAY_BY_SIGNAL[p.code] ?? DEFAULT_DECAY;
    const horas = hoursBetween(p.last_reinforced_at ?? p.created_at ?? nowIso, nowIso);
    const strength = clamp((p.strength ?? p.intensity ?? 0) * Math.exp(-decay * horas));
    map.set(p.code, {
      ...p,
      strength,
      status:
        p.status === "esclarecido"
          ? "esclarecido"
          : strength < 0.08
            ? "expirado"
            : strength < (p.intensity ?? 0) * 0.55
              ? "enfraquecido"
              : "ativo",
    });
  }

  for (const f of fresh) {
    const atual = map.get(f.code);
    const decay = DECAY_BY_SIGNAL[f.code] ?? DEFAULT_DECAY;
    if (!atual) {
      map.set(f.code, {
        ...f,
        intensity: clamp(f.intensity),
        strength: clamp(f.intensity),
        occurrences: f.occurrences || 1,
        created_at: f.last_at ?? nowIso,
        last_reinforced_at: f.last_at ?? nowIso,
        decay_rate: decay,
        status: "ativo",
      });
      continue;
    }
    if (atual.status === "esclarecido") {
      // esclarecido pelo time: só volta se reaparecer com força bem maior
      if (clamp(f.intensity) < 0.8) continue;
      atual.status = "ativo";
      atual.cleared_at = null;
    }
    const ocorrencias = Math.max(atual.occurrences ?? 1, f.occurrences ?? 1) + 1;
    // reforço: repetir o mesmo comportamento vale mais que a 1ª aparição
    const reforco = 1 + Math.min(0.45, 0.12 * (ocorrencias - 1));
    map.set(f.code, {
      ...atual,
      intensity: clamp(Math.max(atual.intensity ?? 0, f.intensity)),
      strength: clamp(Math.max(atual.strength, clamp(f.intensity)) * reforco),
      occurrences: ocorrencias,
      evidence: [...new Set([...(atual.evidence ?? []), ...(f.evidence ?? [])])].slice(0, 5),
      source: f.source === "ia" && atual.source === "ia" ? "ia" : "code",
      last_reinforced_at: f.last_at ?? nowIso,
      decay_rate: decay,
      status: "ativo",
    });
  }

  return [...map.values()].filter((s) => s.status !== "expirado" || s.strength >= 0.05);
}

/** Sinais ativos convertidos para o formato aceito pelo cálculo determinístico. */
export function activeSignalsForScoring(signals: StoredSignal[]): FraudSignal[] {
  return signals
    .filter((s) => s.status !== "esclarecido" && s.strength >= 0.06)
    .map((s) => ({ ...s, intensity: s.strength }));
}

/* ── Confiança (item 4) ───────────────────────────────────────────────────── */

export function computeConfidence(input: {
  signals: StoredSignal[];
  reducers: FraudReducer[];
  clusters: FraudCluster[];
  criticalFlags: FraudCriticalFlag[];
  messageCount: number;
  evaluations: number;
  historyStability: number; // 0..1 — quanto o score se manteve coerente
}): number {
  const ativos = input.signals.filter((s) => s.status === "ativo" && s.strength >= 0.25);
  const independentes = new Set(ativos.map((s) => s.code)).size;
  const reforcados = ativos.filter((s) => (s.occurrences ?? 1) >= 2).length;
  const objetivos = ativos.filter((s) =>
    ["CHECKOUT_BYPASS_ATTEMPT", "INCONSISTENCY", "PASSENGER_SWAP"].includes(s.code),
  ).length;

  let c = 0;
  c += Math.min(0.34, independentes * 0.09); // várias evidências independentes
  c += Math.min(0.18, reforcados * 0.07); // comportamento que se repete
  c += Math.min(0.2, input.clusters.length * 0.12); // padrão conhecido
  c += Math.min(0.16, objetivos * 0.09); // eventos objetivos
  c += Math.min(0.14, input.criticalFlags.length * 0.08);
  c += Math.min(0.12, Math.max(0, input.evaluations - 1) * 0.03); // histórico confirma
  c += Math.min(0.12, Math.max(0, input.messageCount - 4) * 0.008); // volume de informação
  c += 0.1 * clamp(input.historyStability);

  // explicações coerentes e sinais que deixaram de se confirmar derrubam confiança
  const explicacoes = input.reducers.reduce((acc, r) => acc + clamp(r.intensity), 0);
  const enfraquecidos = input.signals.filter((s) => s.status === "enfraquecido").length;
  c -= Math.min(0.28, explicacoes * 0.07);
  c -= Math.min(0.2, enfraquecidos * 0.06);

  if (ativos.length === 0) c = Math.min(c, 0.2);
  if (input.messageCount < 3) c = Math.min(c, 0.35);

  return Math.round(clamp(c) * 100);
}

/* ── Tendência, velocidade e persistência (itens 5 e 6) ───────────────────── */

export function computeTrend(
  history: FraudHistoryEntry[],
  currentScore: number,
): { trend: FraudTrend; velocity: FraudVelocity; delta: number } {
  const pontos = [...history.slice(-4).map((h) => h.score), currentScore];
  if (pontos.length < 2) return { trend: "estavel", velocity: "leve", delta: 0 };
  const delta = pontos[pontos.length - 1]! - pontos[0]!;
  const passos = Math.max(1, pontos.length - 1);
  const porPasso = Math.abs(delta) / passos;
  const trend: FraudTrend = delta >= 6 ? "subindo" : delta <= -6 ? "caindo" : "estavel";
  const velocity: FraudVelocity = porPasso >= 9 ? "rapida" : porPasso >= 4 ? "moderada" : "leve";
  return { trend, velocity, delta };
}

/**
 * Persistência: quantas avaliações seguidas o risco ficou em patamar
 * moderado/elevado sem nada esclarecer os sinais.
 */
export function computePersistence(history: FraudHistoryEntry[], currentScore: number): number {
  const pontos = [...history.map((h) => h.score), currentScore].reverse();
  let n = 0;
  for (const p of pontos) {
    if (p >= 50) n += 1;
    else break;
  }
  return Math.min(99, n);
}

/** 0..1 — o quanto a série se manteve coerente (baixa oscilação). */
export function historyStability(history: FraudHistoryEntry[], currentScore: number): number {
  const pontos = [...history.slice(-6).map((h) => h.score), currentScore];
  if (pontos.length < 3) return 0;
  const media = pontos.reduce((a, b) => a + b, 0) / pontos.length;
  const desvio = Math.sqrt(pontos.reduce((a, b) => a + (b - media) ** 2, 0) / pontos.length);
  return clamp(1 - desvio / 30);
}

/* ── Eventos críticos (item 10) ───────────────────────────────────────────── */

export function detectCriticalFlags(input: {
  signals: StoredSignal[];
  clusters: FraudCluster[];
  payment?: FraudPaymentMeta | null;
}): FraudCriticalFlag[] {
  const flags = new Set<FraudCriticalFlag>();
  const by = new Map(input.signals.map((s) => [s.code, s]));
  const cluster = (c: FraudClusterCode) => input.clusters.find((x) => x.code === c);

  const bypass = by.get("CHECKOUT_BYPASS_ATTEMPT");
  if (bypass && bypass.status !== "esclarecido" && (bypass.occurrences ?? 1) >= 2)
    flags.add("CHECKOUT_BYPASS_REPEAT");
  if (input.payment?.checkout_bypass) flags.add("CHECKOUT_BYPASS_REPEAT");

  const inconsist = by.get("INCONSISTENCY");
  const swap = by.get("PASSENGER_SWAP");
  if (
    (inconsist && inconsist.strength >= 0.55) ||
    (swap && swap.strength >= 0.5) ||
    input.payment?.identity_match_result === "mismatch"
  )
    flags.add("IDENTITY_INCONSISTENCY");

  const urgencia = by.get("URGENCY_PRESSURE");
  const preco = by.get("PRICE_INSENSITIVE");
  if (
    (urgencia && urgencia.strength >= 0.6 && preco && preco.strength >= 0.5) ||
    (cluster("EXECUCAO_URGENTE")?.strength ?? 0) >= 0.7
  )
    flags.add("EXTREME_URGENCY_CLUSTER");

  if ((cluster("PADRAO_AUTOMATIZADO")?.strength ?? 0) >= 0.6) flags.add("REPEATED_OPERATIONAL_PATTERN");

  const p = input.payment;
  if (p) {
    if ((p.different_card_attempts ?? 0) >= 2 || p.payment_method_changed)
      flags.add("PAYMENT_METHOD_ROTATION");
    if ((p.payment_attempt_count ?? 0) >= 3 && p.payment_status && p.payment_status !== "paid")
      flags.add("MULTIPLE_PAYMENT_FAILURE_PATTERN");
    if (p.gateway_risk_result === "fraud" || p.gateway_risk_result === "declined")
      flags.add("GATEWAY_RISK_FLAG");
  }

  return [...flags];
}

/* ── Ajuste do score por eventos de pagamento (itens 16/17) ───────────────── */

export function paymentAdjustment(p?: FraudPaymentMeta | null): { up: number; down: number } {
  if (!p) return { up: 0, down: 0 };
  let up = 0;
  let down = 0;
  if ((p.different_card_attempts ?? 0) >= 2) up += 0.18 + 0.05 * ((p.different_card_attempts ?? 2) - 2);
  if (p.payment_method_changed) up += 0.08;
  if ((p.payment_attempt_count ?? 0) >= 3) up += 0.12;
  if (p.checkout_bypass) up += 0.22;
  if (p.gateway_risk_result === "review") up += 0.14;
  if (p.gateway_risk_result === "declined") up += 0.2;
  if (p.gateway_risk_result === "fraud") up += 0.4;
  if (p.identity_match_result === "mismatch") up += 0.25;
  if (p.identity_match_result === "match") down += 0.15;
  if (p.payment_status === "paid" && (p.payment_attempt_count ?? 1) <= 2) down += 0.2;
  if (p.gateway_risk_result === "approved") down += 0.12;
  return { up: clamp(up), down: clamp(down) };
}

/* ── Decisão de transferência (item 11) ───────────────────────────────────── */

export type TransferDecision = { required: boolean; reason: string | null; scenario: string | null };

export function decideTransfer(input: {
  score: number;
  confidence: number;
  trend: FraudTrend;
  velocity: FraudVelocity;
  persistence: number;
  clusters: FraudCluster[];
  criticalFlags: FraudCriticalFlag[];
  delta: number;
  manualBlock?: boolean;
  manualDismissed?: boolean;
}): TransferDecision {
  const {
    score,
    confidence,
    trend,
    velocity,
    persistence,
    clusters,
    criticalFlags,
    delta,
    manualBlock,
    manualDismissed,
  } = input;

  if (manualBlock)
    return { required: true, reason: "Venda bloqueada manualmente pelo time", scenario: "MANUAL" };

  // Cenário E — score muito alto
  if (score >= 80)
    return { required: true, reason: `Risco muito alto (${score})`, scenario: "E_SCORE_ALTO" };

  // Cenário D — cluster/evento crítico mesmo com score mediano
  const clusterCritico = clusters.find(
    (c) => (c.code === "CONTORNO_CHECKOUT" && c.strength >= 0.7) || c.strength >= 0.78,
  );
  const flagCritica =
    criticalFlags.includes("CHECKOUT_BYPASS_REPEAT") ||
    criticalFlags.includes("IDENTITY_INCONSISTENCY") ||
    criticalFlags.includes("GATEWAY_RISK_FLAG") ||
    criticalFlags.includes("MULTIPLE_PAYMENT_FAILURE_PATTERN");
  if ((clusterCritico || flagCritica) && score >= 45 && confidence >= 45)
    return {
      required: true,
      reason: clusterCritico
        ? `Padrão crítico detectado: ${clusterCritico.label}`
        : `Evento crítico: ${CRITICAL_FLAG_LABEL[criticalFlags[0] as FraudCriticalFlag]}`,
      scenario: "D_CLUSTER_CRITICO",
    };

  if (manualDismissed) return { required: false, reason: null, scenario: null };

  // Cenário A — risco relevante com alta confiança
  if (score >= 60 && confidence >= 80)
    return {
      required: true,
      reason: `Risco ${score} sustentado (confiança ${confidence}%)`,
      scenario: "A_RISCO_CONFIANCA",
    };

  // Cenário B — crescimento rápido
  if (trend === "subindo" && velocity === "rapida" && delta >= 18 && score >= 55 && confidence >= 55)
    return {
      required: true,
      reason: `Risco subindo rápido (+${delta} pontos) até ${score}`,
      scenario: "B_CRESCIMENTO_RAPIDO",
    };

  // Cenário C — persistência
  if (persistence >= 4 && score >= 55 && confidence >= 60)
    return {
      required: true,
      reason: `Risco entre 55 e 70 persistente em ${persistence} avaliações`,
      scenario: "C_PERSISTENCIA",
    };

  return { required: false, reason: null, scenario: null };
}

/* ── Avaliação completa do estado (composição) ────────────────────────────── */

export type DynamicEvaluation = {
  score: number;
  level: FraudLevel;
  band: FraudBand;
  confidence: number;
  trend: FraudTrend;
  velocity: FraudVelocity;
  delta: number;
  persistence: number;
  clusters: FraudCluster[];
  criticalFlags: FraudCriticalFlag[];
  signals: StoredSignal[];
  transfer: TransferDecision;
};

export function evaluateDynamicRisk(input: {
  previousSignals: StoredSignal[];
  freshSignals: FraudSignal[];
  reducers: FraudReducer[];
  history: FraudHistoryEntry[];
  payment?: FraudPaymentMeta | null;
  overrides?: ManualOverride[];
  messageCount: number;
  nowIso: string;
}): DynamicEvaluation {
  const overrides = input.overrides ?? [];
  let signals = evolveSignals(input.previousSignals, input.freshSignals, input.nowIso);

  // Item 22 — avaliação manual alimenta o score (sem apagar histórico)
  for (const o of overrides) {
    if (o.action === "sinal_esclarecido" && o.signal_code) {
      signals = signals.map((s) =>
        s.code === o.signal_code
          ? { ...s, strength: clamp(s.strength * 0.25), status: "esclarecido" as const, cleared_at: o.at, cleared_by: o.by ?? null }
          : s,
      );
    }
  }
  const descartado = overrides.some((o) => o.action === "risco_descartado");
  const bloqueado = overrides.some((o) => o.action === "bloquear_venda");
  const verificado = overrides.some((o) => o.action === "verificado");

  const base = computeRisk(activeSignalsForScoring(signals), input.reducers);
  const pay = paymentAdjustment(input.payment);
  let risco = clamp(base.score / 100);
  risco = 1 - (1 - risco) * (1 - pay.up); // eventos de pagamento sobem via noisy-OR
  risco = risco * (1 - pay.down * 0.8);
  if (descartado || verificado) risco *= descartado ? 0.45 : 0.75;
  if (bloqueado) risco = Math.max(risco, 0.9);

  const score = Math.round(clamp(risco) * 100);
  const criticalFlags = detectCriticalFlags({ signals, clusters: base.clusters, payment: input.payment });
  const stability = historyStability(input.history, score);
  const confidence = computeConfidence({
    signals,
    reducers: input.reducers,
    clusters: base.clusters,
    criticalFlags,
    messageCount: input.messageCount,
    evaluations: input.history.length,
    historyStability: stability,
  });
  const { trend, velocity, delta } = computeTrend(input.history, score);
  const persistence = computePersistence(input.history, score);

  const transfer = decideTransfer({
    score,
    confidence,
    trend,
    velocity,
    persistence,
    clusters: base.clusters,
    criticalFlags,
    delta,
    manualBlock: bloqueado,
    manualDismissed: descartado,
  });

  return {
    score,
    level: levelFromScore(score),
    band: bandFromScore(score),
    confidence,
    trend,
    velocity,
    delta,
    persistence,
    clusters: base.clusters,
    criticalFlags,
    signals,
    transfer,
  };
}
