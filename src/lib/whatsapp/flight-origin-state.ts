/**
 * ESTADO DA ORIGEM DO VOO — lógica pura (sem I/O), testável.
 *
 * Regra dura do briefing: a origem de uma cotação aérea só existe quando uma
 * MENSAGEM INBOUND DO PROTOCOLO ATUAL informa a cidade de embarque ou confirma
 * expressamente a cidade que perguntamos naquele mesmo protocolo.
 *
 * Nada aqui aceita cadastro, cidade da empresa, hub próximo, origem de pacote
 * ou origem de protocolo anterior.
 */

export type OriginStatus = "missing" | "explicitly_informed" | "explicitly_confirmed";

export type InboundMessage = {
  id: string;
  content: string | null;
  created_at: string;
};

export type FlightOriginState = {
  origin: string | null;
  status: OriginStatus;
  confirmed_by_message_id: string | null;
  confirmed_at: string | null;
};

export const MISSING_ORIGIN: FlightOriginState = {
  origin: null,
  status: "missing",
  confirmed_by_message_id: null,
  confirmed_at: null,
};

export function normalizeCity(s: string | null | undefined): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(aeroporto|internacional|estado|cidade|de|do|da|dos|das|em|no|na)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Tokens úteis da cidade (ignora partículas e siglas de 1 letra). */
function cityTokens(city: string): string[] {
  return normalizeCity(city)
    .split(" ")
    .filter((t) => t.length >= 3 || /^[a-z]{3}$/.test(t));
}

/** A mensagem do cliente cita essa cidade (ou o código IATA)? */
export function mentionsCity(text: string | null | undefined, city: string): boolean {
  const alvo = cityTokens(city);
  if (!alvo.length) return false;
  const t = normalizeCity(text);
  if (!t) return false;
  return alvo.every((tok) => new RegExp(`(^| )${tok}`, "i").test(t));
}

const RX_AFIRMATIVO =
  /^(sim|isso|isso mesmo|exato|exatamente|correto|confirmo|confirmado|pode ser|pode manter|mantem|mantenho|manter|continua|continuo|igual|o mesmo|a mesma|mesma coisa|positivo|ok|okay|blz|beleza|certo|uhum|aham|s)\b/i;

/** Resposta curta que confirma a origem que perguntamos ("sim", "pode manter"). */
export function isAffirmative(text: string | null | undefined): boolean {
  const t = (text ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!t) return false;
  if (t.length > 40) return false;
  return RX_AFIRMATIVO.test(t);
}

/**
 * Descobre se a origem pretendida está de fato autorizada pelas mensagens do
 * cliente NESTE protocolo.
 *
 * - `inbound`: apenas mensagens inbound do protocolo atual (ordem cronológica).
 * - `askedOriginAt`: quando a VIA AIR perguntou a origem neste protocolo
 *   (ISO). Só então uma resposta afirmativa curta conta como confirmação.
 * - `suggestedOrigin`: cidade que foi oferecida na pergunta de confirmação.
 */
export function resolveOriginState(params: {
  origin: string | null | undefined;
  inbound: InboundMessage[];
  askedOriginAt?: string | null;
  suggestedOrigin?: string | null;
}): FlightOriginState {
  const origin = (params.origin ?? "").trim();
  if (origin.length < 2) return MISSING_ORIGIN;

  // 1) o cliente escreveu a cidade em alguma mensagem deste protocolo
  for (let i = params.inbound.length - 1; i >= 0; i--) {
    const m = params.inbound[i]!;
    if (mentionsCity(m.content, origin)) {
      return {
        origin,
        status: "explicitly_informed",
        confirmed_by_message_id: m.id,
        confirmed_at: m.created_at,
      };
    }
  }

  // 2) respondemos a pergunta de origem com uma sugestão e ele confirmou
  const sugestao = (params.suggestedOrigin ?? "").trim();
  const perguntaEm = params.askedOriginAt ? new Date(params.askedOriginAt).getTime() : null;
  if (sugestao && perguntaEm && normalizeCity(sugestao) === normalizeCity(origin)) {
    for (let i = params.inbound.length - 1; i >= 0; i--) {
      const m = params.inbound[i]!;
      if (new Date(m.created_at).getTime() < perguntaEm) break;
      if (isAffirmative(m.content)) {
        return {
          origin,
          status: "explicitly_confirmed",
          confirmed_by_message_id: m.id,
          confirmed_at: m.created_at,
        };
      }
    }
  }

  return MISSING_ORIGIN;
}

/** A origem pode ser usada na pesquisa? */
export function originIsUsable(state: FlightOriginState | null | undefined): boolean {
  if (!state) return false;
  return (
    (state.status === "explicitly_informed" || state.status === "explicitly_confirmed") &&
    !!state.origin &&
    !!state.confirmed_by_message_id
  );
}
