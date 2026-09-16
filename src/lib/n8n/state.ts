/**
 * Estado estruturado da conversa (agent_state).
 *
 * Client-safe: só tipos e funções puras. O objetivo é que o agente (hoje o
 * runAgent, futuramente o n8n) não precise reler dezenas de mensagens para
 * redescobrir origem, destino, datas e passageiros.
 *
 * REGRA: campo desconhecido permanece `null` (ou lista vazia). Nada é inventado.
 */

export type AgentStateIntent = "aereo" | "pacote" | "hotel" | "pos_venda" | "duvida" | "outro" | null;

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

/**
 * Tipo de produto tratado na conversa. Separa explicitamente pacote PRONTO
 * (já publicado no Command Center) de pacote PERSONALIZADO (montado para o
 * cliente). Campo aditivo: `intent`/`product_scope` seguem existindo.
 */
export type AgentStateProductType =
  | "aereo"
  | "pacote_pronto"
  | "pacote_personalizado"
  | "cruzeiro"
  | "hotel"
  | "outro"
  | null;

/** Uma perna do multitrecho — mesmo contrato da Internal API (legs[]). */
export type AgentStateLeg = {
  origin: string | null;
  destination: string | null;
  departureDate: string | null;
};

/** Limites de multitrecho suportados pelo backend (src/lib/api/multicity.server.ts). */
export const MIN_AGENT_LEGS = 2;
export const MAX_AGENT_LEGS = 6;

export type AgentState = {
  intent: AgentStateIntent;
  product_scope: AgentStateProductScope;
  product_type: AgentStateProductType;
  stage: AgentStateStage;
  origin: string | null;
  /** true só quando o próprio cliente confirmou a origem (nunca deduzida). */
  origin_confirmed: boolean | null;
  destination: string | null;
  trip_type: AgentStateTripType;
  /** Trechos do multitrecho, na ordem. Nunca juntar destinos numa string. */
  legs: AgentStateLeg[];
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
  /**
   * true depois que a primeira transferência foi anunciada ao cliente. Próximos
   * handoffs humanos na mesma continuidade são silenciosos (sem nova bubble de aviso).
   */
  transfer_notice_shown?: boolean | null;
  /** Atualizado automaticamente a cada merge. */
  updated_at?: string | null;
};

export const EMPTY_AGENT_STATE: AgentState = {
  intent: null,
  product_scope: null,
  product_type: null,
  stage: null,
  origin: null,
  origin_confirmed: null,
  destination: null,
  trip_type: null,
  legs: [],
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
  transfer_notice_shown: null,
  updated_at: null,
};

const STRING_KEYS = [
  "intent",
  "product_scope",
  "product_type",
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

const BOOLEAN_KEYS = ["origin_confirmed", "baggage", "direct_only", "transfer_notice_shown"] as const;
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
      out[k] = arr
        .map(num)
        .filter((n): n is number => n !== null)
        .slice(0, 9);
    }
  }
  for (const k of STRING_LIST_KEYS) {
    if (k in raw) {
      const arr = Array.isArray(raw[k]) ? (raw[k] as unknown[]) : [];
      out[k] = arr
        .map(str)
        .filter((s): s is string => !!s)
        .slice(0, 20);
    }
  }
  if ("legs" in raw) out.legs = sanitizeLegs(raw.legs);
  return out as Partial<AgentState>;
}

const IATA = /^[A-Z]{3}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Mantém só pernas com o formato do backend; ordem preservada. */
export function sanitizeLegs(input: unknown): AgentStateLeg[] {
  if (!Array.isArray(input)) return [];
  return input
    .slice(0, MAX_AGENT_LEGS)
    .map((raw) => {
      const l = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
      const origin = str(l.origin)?.toUpperCase() ?? null;
      const destination = str(l.destination)?.toUpperCase() ?? null;
      const date = str(l.departureDate ?? l.date);
      return {
        origin: origin && IATA.test(origin) ? origin : null,
        destination: destination && IATA.test(destination) ? destination : null,
        departureDate: date && ISO_DATE.test(date) ? date : null,
      };
    })
    .filter((l) => l.origin || l.destination || l.departureDate);
}

/**
 * Regras do multitrecho, iguais às do backend (validarPernas):
 * 2 a 6 pernas, IATA de 3 letras, origem ≠ destino e datas não-decrescentes.
 */
export function validateLegs(legs: AgentStateLeg[]): string[] {
  const erros: string[] = [];
  if (legs.length < MIN_AGENT_LEGS) erros.push(`minimo_${MIN_AGENT_LEGS}_trechos`);
  if (legs.length > MAX_AGENT_LEGS) erros.push(`maximo_${MAX_AGENT_LEGS}_trechos`);
  let anterior: string | null = null;
  legs.forEach((l, i) => {
    const n = i + 1;
    if (!l.origin) erros.push(`trecho_${n}_origin`);
    if (!l.destination) erros.push(`trecho_${n}_destination`);
    if (!l.departureDate) erros.push(`trecho_${n}_departureDate`);
    if (l.origin && l.destination && l.origin === l.destination) erros.push(`trecho_${n}_origem_igual_destino`);
    if (l.departureDate) {
      if (anterior && l.departureDate < anterior) erros.push(`trecho_${n}_data_fora_de_ordem`);
      anterior = l.departureDate;
    }
  });
  return erros;
}

/** Pernas prontas para o payload de `search_multicity`. */
export function legsForSearch(state: AgentState): { origin: string; destination: string; departureDate: string }[] {
  if (validateLegs(state.legs).length > 0) return [];
  return state.legs.map((l) => ({
    origin: l.origin!,
    destination: l.destination!,
    departureDate: l.departureDate!,
  }));
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

  if (state.trip_type === "multitrecho") {
    if (!state.origin_confirmed) faltando.push("origin_confirmed");
    faltando.push(...validateLegs(state.legs));
    if (!state.adults) faltando.push("adults");
    return faltando;
  }

  if (!state.origin || state.origin_confirmed !== true) faltando.push("origin");
  if (!state.destination) faltando.push("destination");
  if (!state.trip_type) faltando.push("trip_type");
  if (!state.departure_date) faltando.push("departure_date");
  if (state.trip_type === "ida_e_volta" && !state.return_date) faltando.push("return_date");
  if (!state.adults) faltando.push("adults");
  return faltando;
}

/** Campos mínimos para pesquisar pacote pronto no Command Center. */
export function missingReadyPackageFields(state: AgentState): string[] {
  const faltando: string[] = [];
  if (!state.destination) faltando.push("destination");
  if (!state.departure_date && !state.origin && !state.return_date) {
    // Mês/período ajudam muito, mas não são obrigatórios para a primeira busca.
  }
  return faltando;
}
