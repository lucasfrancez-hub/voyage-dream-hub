/**
 * Estado estruturado da conversa (agent_state).
 *
 * Client-safe: só tipos e funções puras. O objetivo é que o agente (hoje o
 * runAgent, futuramente o n8n) não precise reler dezenas de mensagens para
 * redescobrir origem, destino, datas e passageiros.
 *
 * REGRA: campo desconhecido permanece `null` (ou lista vazia). Nada é inventado.
 */

export type AgentStateIntent =
  | "aereo"
  | "pacote"
  | "hotel"
  | "pos_venda"
  | "duvida"
  | "outro"
  | null;

export type AgentStateProductScope = "aereo" | "pacote" | "hotel" | "combinado" | "outro" | null;

export type AgentStateStage =
  | "descoberta"
  | "coleta"
  | "pesquisa"
  | "apresentacao"
  | "selecao"
  | "passageiros"
  | "revalidacao"
  | "pagamento"
  | "pos_venda"
  | null;

export type AgentStateTripType = "ida" | "ida_e_volta" | "multitrecho" | null;

export type AgentState = {
  intent: AgentStateIntent;
  product_scope: AgentStateProductScope;
  stage: AgentStateStage;
  origin: string | null;
  /** true só quando o próprio cliente confirmou a origem (nunca deduzida). */
  origin_confirmed: boolean | null;
  destination: string | null;
  trip_type: AgentStateTripType;
  departure_date: string | null;
  return_date: string | null;
  adults: number | null;
  /** Idades das crianças (2-11), quando informadas. */
  children: number[];
  /** Idades dos bebês (0-1), quando informadas. */
  infants: number[];
  baggage: boolean | null;
  departure_time_preference: string | null;
  return_time_preference: string | null;
  direct_only: boolean | null;
  max_connections: number | null;
  included_airlines: string[];
  excluded_airlines: string[];
  cabin: "ECONOMY" | "PREMIUM_ECONOMY" | "BUSINESS" | "FIRST" | null;
  last_quote_id: string | null;
  selected_option: number | null;
  checkout_id: string | null;
  order_id: string | null;
  payment_status: string | null;
  /** O que a conversa está esperando do cliente agora ("cpf", "confirmacao_opcao"…). */
  awaiting: string | null;
  handoff_status: string | null;
  /** Atualizado automaticamente a cada merge. */
  updated_at?: string | null;
};

export const EMPTY_AGENT_STATE: AgentState = {
  intent: null,
  product_scope: null,
  stage: null,
  origin: null,
  origin_confirmed: null,
  destination: null,
  trip_type: null,
  departure_date: null,
  return_date: null,
  adults: null,
  children: [],
  infants: [],
  baggage: null,
  departure_time_preference: null,
  return_time_preference: null,
  direct_only: null,
  max_connections: null,
  included_airlines: [],
  excluded_airlines: [],
  cabin: null,
  last_quote_id: null,
  selected_option: null,
  checkout_id: null,
  order_id: null,
  payment_status: null,
  awaiting: null,
  handoff_status: null,
  updated_at: null,
};

const STRING_KEYS = [
  "intent",
  "product_scope",
  "stage",
  "origin",
  "destination",
  "trip_type",
  "departure_date",
  "return_date",
  "departure_time_preference",
  "return_time_preference",
  "cabin",
  "last_quote_id",
  "checkout_id",
  "order_id",
  "payment_status",
  "awaiting",
  "handoff_status",
] as const;

const BOOLEAN_KEYS = ["origin_confirmed", "baggage", "direct_only"] as const;
const NUMBER_KEYS = ["adults", "max_connections", "selected_option"] as const;
const NUMBER_LIST_KEYS = ["children", "infants"] as const;
const STRING_LIST_KEYS = ["included_airlines", "excluded_airlines"] as const;

function str(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t.slice(0, 120) : null;
}

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() && Number.isFinite(Number(v))) return Number(v);
  return null;
}

/**
 * Filtra um objeto arbitrário (ex.: `state_update` vindo do n8n) deixando
 * apenas as chaves conhecidas e os tipos esperados. Nada fora do modelo entra.
 */
export function sanitizeAgentStatePatch(input: unknown): Partial<AgentState> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const raw = input as Record<string, unknown>;
  const out: Record<string, unknown> = {};

  for (const k of STRING_KEYS) {
    if (k in raw) out[k] = raw[k] === null ? null : str(raw[k]);
  }
  for (const k of BOOLEAN_KEYS) {
    if (k in raw) out[k] = raw[k] === null ? null : typeof raw[k] === "boolean" ? raw[k] : null;
  }
  for (const k of NUMBER_KEYS) {
    if (k in raw) out[k] = raw[k] === null ? null : num(raw[k]);
  }
  for (const k of NUMBER_LIST_KEYS) {
    if (k in raw) {
      const arr = Array.isArray(raw[k]) ? (raw[k] as unknown[]) : [];
      out[k] = arr.map(num).filter((n): n is number => n !== null).slice(0, 9);
    }
  }
  for (const k of STRING_LIST_KEYS) {
    if (k in raw) {
      const arr = Array.isArray(raw[k]) ? (raw[k] as unknown[]) : [];
      out[k] = arr.map(str).filter((s): s is string => !!s).slice(0, 20);
    }
  }
  return out as Partial<AgentState>;
}

/** Normaliza o JSON salvo no banco para o formato completo do estado. */
export function normalizeAgentState(input: unknown): AgentState {
  return { ...EMPTY_AGENT_STATE, ...sanitizeAgentStatePatch(input) };
}

/** Aplica um patch sobre o estado atual, mantendo o que não foi informado. */
export function mergeAgentState(current: unknown, patch: unknown): AgentState {
  const base = normalizeAgentState(current);
  const clean = sanitizeAgentStatePatch(patch);
  return { ...base, ...clean, updated_at: new Date().toISOString() };
}

/** Campos ainda necessários para uma pesquisa aérea válida. */
export function missingFlightFields(state: AgentState): string[] {
  const faltando: string[] = [];
  if (!state.origin || state.origin_confirmed !== true) faltando.push("origin");
  if (!state.destination) faltando.push("destination");
  if (!state.trip_type) faltando.push("trip_type");
  if (!state.departure_date) faltando.push("departure_date");
  if (state.trip_type === "ida_e_volta" && !state.return_date) faltando.push("return_date");
  if (!state.adults) faltando.push("adults");
  return faltando;
}
