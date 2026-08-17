/**
 * MOTOR ANTIFRAUDE — orquestração (SERVER-ONLY).
 *
 * Duas camadas, como no briefing:
 *  1) CÓDIGO (determinístico): detecta sinais por padrão de texto/estrutura,
 *     combina em clusters, calcula risco e EXECUTA a transferência.
 *  2) IA: lê a conversa inteira e devolve sinais/redutores com intensidade,
 *     interpretando comportamento, coerência e evolução do diálogo.
 *
 * Mesmo que o prompt dos agentes mude, a proteção continua funcionando: quem
 * transfere e pausa a IA é o backend.
 */
import { generateText } from "ai";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";
import {
  computeRisk,
  detectDeterministicSignals,
  LEVEL_LABEL,
  REDUCER_LABEL,
  SIGNAL_LABEL,
  type FraudCluster,
  type FraudLevel,
  type FraudMessage,
  type FraudReducer,
  type FraudReducerCode,
  type FraudSignal,
  type FraudSignalCode,
} from "./signals";

export type FraudState = {
  conversation_id: string;
  score: number;
  max_score: number;
  confidence: number;
  level: FraudLevel;
  band: FraudBand;
  trend: FraudTrend;
  velocity: FraudVelocity;
  persistence: number;
  signals: StoredSignal[];
  reducers: FraudReducer[];
  clusters: FraudCluster[];
  critical_flags: FraudCriticalFlag[];
  summary: string | null;
  last_evaluation: string | null;
  transfer_required: boolean;
  transfer_at: string | null;
  transfer_reason: string | null;
  score_at_transfer: number | null;
  analysis_active: boolean;
  payment: FraudPaymentMeta | null;
  overrides: ManualOverride[];
  outcome: string | null;
};


const SIGNAL_CODES = Object.keys(SIGNAL_LABEL) as FraudSignalCode[];
const REDUCER_CODES = Object.keys(REDUCER_LABEL) as FraudReducerCode[];

const IA_PROMPT = `Você é um analista antifraude de uma agência de viagens brasileira (VIA AIR).
Leia TODA a conversa (cliente x atendimento) e devolva SOMENTE um JSON.

Sua função é interpretar COMPORTAMENTO, não julgar pessoas. Nunca aumente risco por
nacionalidade, país, DDI, idioma, cidade, viajar sozinho, não despachar bagagem,
usar código IATA, escrever corretamente ou comprar internacional. Isso é contexto, não risco.

Sinais possíveis (code): ${SIGNAL_CODES.join(", ")}.
Redutores possíveis (code): ${REDUCER_CODES.join(", ")}.

Significados:
- REQUEST_PRE_FORMATTED: a 1ª mensagem já chega como ficha operacional pronta (origem/destino, IATA, datas fechadas, pax, bagagem, pouca contextualização).
- OPERATIONAL_EXECUTION: o cliente só executa etapas ("pode ser", "manda o link", "preciso emitir"), sem interesse por itinerário.
- URGENCY_TRAVEL_SOON / URGENCY_PRESSURE: viagem muito próxima / pressão constante para concluir.
- PRICE_INSENSITIVE: aceita qualquer valor, não compara, não reage ao preço.
- ITINERARY_DISINTEREST: não pergunta horário, conexão, bagagem, cia, regras.
- INCONSISTENCY / PASSENGER_SWAP / EVASIVE_ANSWERS: contradições recorrentes, troca de passageiros sem contexto, respostas evasivas.
- CHECKOUT_BYPASS_ATTEMPT: tenta desviar do checkout oficial ("não funciona aí", "manda outro link", "tem outro lugar pra passar o cartão").
- INTL_MISMATCH: número estrangeiro SEM relação com a viagem, junto de urgência/execução. Coerente = redutor INTL_COHERENT.
- REPEATED_PATTERN / AUTOMATED_TEXT_PATTERN: pedidos repetidos, texto padronizado, interação pouco natural.

Regras:
- intensity de 0 a 1: 0.3 = leve indício, 0.6 = claro, 0.9 = muito forte.
- Só liste um sinal se houver evidência real na conversa; cite o trecho em "evidence".
- Correção natural de dado NÃO é INCONSISTENCY.
- Sempre liste os redutores que existirem — o motor precisa poder baixar o risco.

Formato exato:
{"signals":[{"code":"...","intensity":0.7,"evidence":"trecho"}],"reducers":[{"code":"...","intensity":0.8,"evidence":"trecho"}],"summary":"1 frase interna"}`;

function clamp(v: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0));
}

function mergeSignals(a: FraudSignal[], b: FraudSignal[]): FraudSignal[] {
  const map = new Map<FraudSignalCode, FraudSignal>();
  for (const s of [...a, ...b]) {
    const atual = map.get(s.code);
    if (!atual) {
      map.set(s.code, { ...s, intensity: clamp(s.intensity), evidence: (s.evidence ?? []).slice(0, 4) });
      continue;
    }
    atual.intensity = clamp(Math.max(atual.intensity, s.intensity));
    atual.occurrences = Math.max(atual.occurrences ?? 1, s.occurrences ?? 1);
    atual.evidence = [...new Set([...(atual.evidence ?? []), ...(s.evidence ?? [])])].slice(0, 4);
    if (s.source === "ia") atual.source = atual.source === "code" ? "code" : "ia";
  }
  return [...map.values()];
}

function mergeReducers(a: FraudReducer[], b: FraudReducer[]): FraudReducer[] {
  const map = new Map<FraudReducerCode, FraudReducer>();
  for (const r of [...a, ...b]) {
    const atual = map.get(r.code);
    if (!atual) {
      map.set(r.code, { ...r, intensity: clamp(r.intensity), evidence: (r.evidence ?? []).slice(0, 3) });
      continue;
    }
    atual.intensity = clamp(Math.max(atual.intensity, r.intensity));
    atual.evidence = [...new Set([...(atual.evidence ?? []), ...(r.evidence ?? [])])].slice(0, 3);
  }
  return [...map.values()];
}

function transcript(messages: FraudMessage[]): string {
  return messages
    .map((m) => {
      const quem = m.direction === "inbound" ? "CLIENTE" : m.sender === "human" ? "ATENDENTE" : "IA";
      return `[${new Date(m.created_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}] ${quem}: ${(m.content || "")
        .replace(/\[\[media:[^\]]+\]\]/g, "[mídia]")
        .slice(0, 700)}`;
    })
    .join("\n");
}

/** Camada IA — nunca derruba a avaliação: falhou, volta vazio. */
async function analisarComIa(
  messages: FraudMessage[],
): Promise<{ signals: FraudSignal[]; reducers: FraudReducer[]; summary: string | null }> {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key || messages.length === 0) return { signals: [], reducers: [], summary: null };
  try {
    const gateway = createLovableAiGatewayProvider(key);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20_000);
    let raw: string;
    try {
      const res = await generateText({
        model: gateway("google/gemini-2.5-flash"),
        system: IA_PROMPT,
        prompt: `Conversa:\n\n${transcript(messages)}\n\nResponda somente o JSON.`,
        temperature: 0.1,
        abortSignal: controller.signal,
      });
      raw = res.text ?? "";
    } finally {
      clearTimeout(timer);
    }
    const json = raw.match(/\{[\s\S]*\}/)?.[0];
    if (!json) return { signals: [], reducers: [], summary: null };
    const parsed = JSON.parse(json) as {
      signals?: Array<{ code?: string; intensity?: number; evidence?: string }>;
      reducers?: Array<{ code?: string; intensity?: number; evidence?: string }>;
      summary?: string;
    };
    const signals: FraudSignal[] = (parsed.signals ?? [])
      .filter((s) => s.code && (SIGNAL_CODES as string[]).includes(s.code))
      .map((s) => ({
        code: s.code as FraudSignalCode,
        intensity: clamp(Number(s.intensity ?? 0.5)),
        occurrences: 1,
        evidence: s.evidence ? [String(s.evidence).slice(0, 180)] : [],
        source: "ia" as const,
      }));
    const reducers: FraudReducer[] = (parsed.reducers ?? [])
      .filter((r) => r.code && (REDUCER_CODES as string[]).includes(r.code))
      .map((r) => ({
        code: r.code as FraudReducerCode,
        intensity: clamp(Number(r.intensity ?? 0.5)),
        evidence: r.evidence ? [String(r.evidence).slice(0, 180)] : [],
        source: "ia" as const,
      }));
    return { signals, reducers, summary: parsed.summary?.slice(0, 400) ?? null };
  } catch (e) {
    console.warn("[antifraude] camada IA falhou:", e instanceof Error ? e.message : e);
    return { signals: [], reducers: [], summary: null };
  }
}

/** Descobre o usuário do Lucas (gestor) para receber as transferências. */
async function resolveLucasUserId(): Promise<string | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  try {
    const { data } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
    const alvo = data?.users?.find((u) => (u.email ?? "").toLowerCase() === "lucas@voeair.com");
    if (alvo?.id) return alvo.id;
  } catch (e) {
    console.warn("[antifraude] listUsers falhou:", e instanceof Error ? e.message : e);
  }
  const { data: perfil } = await supabaseAdmin
    .from("profiles")
    .select("id, full_name")
    .ilike("full_name", "%lucas%")
    .limit(1)
    .maybeSingle();
  return (perfil as { id?: string } | null)?.id ?? null;
}

/**
 * TRANSFERÊNCIA SILENCIOSA. Nenhuma mensagem é enviada ao cliente.
 * A IA para de responder e o Lucas assume.
 */
export async function enforceFraudTransfer(conversationId: string): Promise<boolean> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const lucas = await resolveLucasUserId();
  const { data: atual } = await supabaseAdmin
    .from("wa_conversations")
    .select("tags, fraud_transfer_at")
    .eq("id", conversationId)
    .maybeSingle();
  const tags = new Set<string>(((atual as { tags?: string[] } | null)?.tags ?? []) as string[]);
  tags.add("risco-fraude");

  const { error } = await supabaseAdmin
    .from("wa_conversations")
    .update({
      mode: "human",
      assigned_to: lucas,
      ai_paused: true,
      priority: "high",
      ai_debounce_until: null,
      ai_instruction: null,
      tags: [...tags],
      fraud_transfer_required: true,
      fraud_transfer_at: (atual as { fraud_transfer_at?: string | null } | null)?.fraud_transfer_at ?? new Date().toISOString(),
    })
    .eq("id", conversationId);
  if (error) {
    console.error("[antifraude] falha na transferência silenciosa:", error.message);
    return false;
  }

  try {
    await supabaseAdmin.from("wa_handoff_events").insert({
      conversation_id: conversationId,
      from_mode: "ai",
      to_mode: "human",
      reason: "FRAUD_RISK",
    });
  } catch {
    /* auditoria secundária: não pode quebrar a proteção */
  }
  console.warn(
    `[antifraude] ${JSON.stringify({ event: "fraud_silent_transfer", conversation_id: conversationId, assigned_to: lucas })}`,
  );
  return true;
}

function parseJsonArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (typeof value === "string") {
    try {
      const p = JSON.parse(value);
      return Array.isArray(p) ? (p as T[]) : [];
    } catch {
      return [];
    }
  }
  return [];
}

/** Estado atual persistido (sem recalcular). */
export async function loadFraudState(conversationId: string): Promise<FraudState | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("wa_conversations")
    .select(
      "id, fraud_risk_score, fraud_risk_level, fraud_signals, fraud_clusters, fraud_reducers, fraud_summary, fraud_last_evaluation, fraud_transfer_required, fraud_transfer_at",
    )
    .eq("id", conversationId)
    .maybeSingle();
  if (!data) return null;
  const row = data as Record<string, unknown>;
  return {
    conversation_id: conversationId,
    score: Number(row["fraud_risk_score"] ?? 0),
    level: (row["fraud_risk_level"] as FraudLevel) ?? "baixo",
    signals: parseJsonArray<FraudSignal>(row["fraud_signals"]),
    reducers: parseJsonArray<FraudReducer>(row["fraud_reducers"]),
    clusters: parseJsonArray<FraudCluster>(row["fraud_clusters"]),
    summary: (row["fraud_summary"] as string | null) ?? null,
    last_evaluation: (row["fraud_last_evaluation"] as string | null) ?? null,
    transfer_required: !!row["fraud_transfer_required"],
    transfer_at: (row["fraud_transfer_at"] as string | null) ?? null,
  };
}

/**
 * Avaliação completa da conversa: contexto inteiro → sinais → clusters →
 * redutores → risco → persistência → decisão de transferência.
 */
export async function evaluateConversationFraud(input: {
  conversation_id: string;
  message_id?: string | null;
  source?: "auto" | "manual";
  /** Pula a camada IA (útil em testes / reavaliações em lote). */
  skipAi?: boolean;
}): Promise<FraudState | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: conv } = await supabaseAdmin
    .from("wa_conversations")
    .select(
      "id, wa_phone, fraud_risk_score, fraud_risk_level, fraud_signals, fraud_reducers, fraud_transfer_required, fraud_transfer_at",
    )
    .eq("id", input.conversation_id)
    .maybeSingle();
  if (!conv) return null;
  const convRow = conv as Record<string, unknown>;

  const { data: msgs } = await supabaseAdmin
    .from("wa_messages")
    .select("id, direction, sender, content, created_at")
    .eq("conversation_id", input.conversation_id)
    .order("created_at", { ascending: false })
    .limit(80);
  const messages = ((msgs ?? []) as FraudMessage[]).slice().reverse();
  if (messages.length === 0) return loadFraudState(input.conversation_id);

  // Contexto de viagem, quando o robô de cotação já registrou a data
  let travelDate: string | null = null;
  let routeText: string | null = null;
  try {
    const { data: req } = await supabaseAdmin
      .from("wa_flight_search_requests")
      .select("departure_date, origin, destination")
      .eq("conversation_id", input.conversation_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const r = req as { departure_date?: string | null; origin?: string | null; destination?: string | null } | null;
    travelDate = r?.departure_date ?? null;
    routeText = [r?.origin, r?.destination].filter(Boolean).join(" ") || null;
  } catch {
    /* sem cotação registrada ainda */
  }

  const det = detectDeterministicSignals({
    messages,
    wa_phone: String(convRow["wa_phone"] ?? ""),
    travel_date: travelDate,
    route_text: routeText,
  });
  const ia = input.skipAi ? { signals: [], reducers: [], summary: null } : await analisarComIa(messages);

  const signals = mergeSignals(det.signals, ia.signals);
  const reducers = mergeReducers(det.reducers, ia.reducers);
  const calc = computeRisk(signals, reducers);

  const before = Number(convRow["fraud_risk_score"] ?? 0);
  const levelBefore = (convRow["fraud_risk_level"] as string) ?? "baixo";
  const antes = new Set(parseJsonArray<FraudSignal>(convRow["fraud_signals"]).map((s) => s.code));
  const agora = new Set(signals.map((s) => s.code));
  const reducersAntes = new Set(parseJsonArray<FraudReducer>(convRow["fraud_reducers"]).map((r) => r.code));

  const nowIso = new Date().toISOString();
  const jaTransferido = !!convRow["fraud_transfer_required"];
  const deveTransferir = calc.transfer_required;

  await supabaseAdmin
    .from("wa_conversations")
    .update({
      fraud_risk_score: calc.score,
      fraud_risk_level: calc.level,
      fraud_signals: signals,
      fraud_reducers: reducers,
      fraud_clusters: calc.clusters,
      fraud_summary: ia.summary,
      fraud_last_evaluation: nowIso,
    })
    .eq("id", input.conversation_id);

  let transferiu = false;
  if (deveTransferir && !jaTransferido) {
    transferiu = await enforceFraudTransfer(input.conversation_id);
  }

  try {
    await supabaseAdmin.from("wa_fraud_evaluations").insert({
      conversation_id: input.conversation_id,
      message_id: input.message_id ?? null,
      risk_before: before,
      risk_after: calc.score,
      level_before: levelBefore,
      level_after: calc.level,
      signals_added: signals.filter((s) => !antes.has(s.code)),
      signals_removed: [...antes].filter((c) => !agora.has(c)),
      reducers_added: reducers.filter((r) => !reducersAntes.has(r.code)),
      clusters_detected: calc.clusters,
      signals_snapshot: signals,
      summary: ia.summary,
      source: input.source ?? "auto",
      transfer_triggered: transferiu,
    });
  } catch (e) {
    console.warn("[antifraude] falha ao gravar auditoria:", e instanceof Error ? e.message : e);
  }

  console.log(
    `[antifraude] ${JSON.stringify({
      conversation_id: input.conversation_id,
      score: calc.score,
      level: LEVEL_LABEL[calc.level],
      clusters: calc.clusters.map((c) => c.code),
      transfer: transferiu,
    })}`,
  );

  return {
    conversation_id: input.conversation_id,
    score: calc.score,
    level: calc.level,
    signals,
    reducers,
    clusters: calc.clusters,
    summary: ia.summary,
    last_evaluation: nowIso,
    transfer_required: deveTransferir || jaTransferido,
    transfer_at: transferiu ? nowIso : ((convRow["fraud_transfer_at"] as string | null) ?? null),
  };
}

/**
 * Trava de segurança usada pelo runner da IA: se a conversa já foi marcada
 * como risco alto, a IA não responde mais — mesmo que alguma regra antiga
 * ainda tente rodar o agente.
 */
export async function fraudBlocksAi(conversationId: string): Promise<boolean> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("wa_conversations")
      .select("fraud_transfer_required")
      .eq("id", conversationId)
      .maybeSingle();
    return !!(data as { fraud_transfer_required?: boolean } | null)?.fraud_transfer_required;
  } catch {
    return false;
  }
}
