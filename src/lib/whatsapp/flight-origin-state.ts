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

/**
 * Detecta se a cidade aparece em contexto de DESTINO ("para X", "até X",
 * "vou a X", "pra X", "chegar em X", etc.). Quando a cidade é citada como
 * destino, ela NÃO pode ser reaproveitada como origem de embarque.
 * Caso real: "quero uma passagem para São Paulo dia 11/10" → São Paulo é
 * destino, não origem. Antes a origem era confirmada erroneamente como
 * "São Paulo" e travava a cotação.
 */
export function pareceDestinoNaMensagem(text: string | null | undefined, city: string): boolean {
  const alvo = cityTokens(city);
  if (!alvo.length) return false;
  const t = normalizeCity(text);
  if (!t) return false;

  // A cidade deve aparecer no texto para ser considerada destino.
  if (!alvo.every((tok) => new RegExp(`(^| )${tok}`, "i").test(t))) return false;

  // Preposições de destino antes da cidade (ou próximas).
  const destinoPattern = new RegExp(
    `(para|pra|pro|at[eé]|a|em|ir|chegar|chegada|destino|para\s+ir)\s+([a-z\\s]*\\b)?${alvo[0]!}\\b`,
    "i",
  );
  if (destinoPattern.test(t)) return true;

  // Padrão "passagem para X", "voo para X", "vou para X".
  const passagemParaPattern = new RegExp(
    `(passagem|voo|avi[ãa]o|vou|vamos|quer[eo]|reservar|comprar)\s+(?:para|pra|pro|at[eé]|a|em)\s+([a-z\\s]*\\b)?${alvo[0]!}\\b`,
    "i",
  );
  if (passagemParaPattern.test(t)) return true;

  return false;
}

/**
 * A cidade aparece em contexto de ORIGEM? Aceita menção direta ou com
 * preposições de saída/embarque. Rejeita quando a cidade está claramente no
 * contexto de destino.
 */
export function mentionsCityAsOrigin(text: string | null | undefined, city: string): boolean {
  if (!mentionsCity(text, city)) return false;
  if (pareceDestinoNaMensagem(text, city)) return false;
  return true;
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
/**
 * NOMES QUE NUNCA SÃO CIDADE.
 *
 * Caso real (ago/2026): o cliente chamou o atendente pelo nome com erro de
 * digitação — "Robertp quero ver uma passagem para São Paulo" — e "Robertp"
 * virou cidade de embarque confirmada. Vocativo não é origem.
 */
const NOMES_INTERNOS = [
  "camila", "roberto", "bruno", "paula", "giovani", "giovanni", "maria",
  "nathalia", "nath", "fabricio", "lucas", "francez", "via air", "viaair",
  "atendente", "consultor", "consultora", "vendedor", "vendedora", "bot", "robo",
];

/** Distância de edição simples (tolera erro de digitação: "Robertp" ≈ "Roberto"). */
function distancia(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (Math.abs(m - n) > 2) return 99;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(
        prev[j]! + 1,
        cur[j - 1]! + 1,
        prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = cur;
  }
  return prev[n]!;
}

/**
 * A "cidade" é na verdade um nome de pessoa (do time ou do próprio cliente)?
 * Tolerante a erro de digitação e a acento/caixa.
 */
export function pareceNomeDePessoa(
  city: string | null | undefined,
  nomesExtras: Array<string | null | undefined> = [],
): boolean {
  const c = normalizeCity(city);
  if (!c) return false;
  const lista = [
    ...NOMES_INTERNOS,
    ...nomesExtras.flatMap((n) => normalizeCity(n).split(" ")),
  ]
    .map((n) => normalizeCity(n))
    .filter((n) => n.length >= 3);
  return lista.some((nome) => {
    if (c === nome) return true;
    // Erro de digitação: 1 letra trocada/faltando em nomes curtos, 2 em longos.
    const tolerancia = nome.length >= 7 ? 2 : 1;
    return distancia(c, nome) <= tolerancia;
  });
}

export function resolveOriginState(params: {
  origin: string | null | undefined;
  inbound: InboundMessage[];
  askedOriginAt?: string | null;
  suggestedOrigin?: string | null;
  /** Nome do cliente / do agente — nunca podem virar cidade de embarque. */
  nomesProibidos?: Array<string | null | undefined>;
}): FlightOriginState {
  const origin = (params.origin ?? "").trim();
  if (origin.length < 2) return MISSING_ORIGIN;
  if (pareceNomeDePessoa(origin, params.nomesProibidos ?? [])) return MISSING_ORIGIN;


  // 1) o cliente escreveu a cidade em alguma mensagem deste protocolo como ORIGEM
  //    (não como destino: "para São Paulo" é destino, não origem de embarque).
  for (let i = params.inbound.length - 1; i >= 0; i--) {
    const m = params.inbound[i]!;
    if (mentionsCityAsOrigin(m.content, origin)) {
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
