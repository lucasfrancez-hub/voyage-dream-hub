/**
 * RESOLVEDOR DETERMINÍSTICO DE RESPOSTAS CURTAS (puro, sem I/O).
 *
 * O roteamento e a continuidade da cotação aérea NÃO podem depender de o
 * modelo "adivinhar" o que "isso", "ok" ou "?" significam. Aqui a resposta
 * curta é resolvida contra a PERGUNTA PENDENTE persistida na solicitação
 * aérea; só o que sobra vai para o modelo.
 */
import { pareceNomeDePessoa } from "./flight-origin-state";


export type PendingQuestion =
  | "confirm_origin"
  | "ask_origin"
  | "ask_destination"
  | "confirm_trip_type_and_dates"
  | "ask_dates"
  | "ask_trip_type"
  | "ask_passengers"
  | "ask_baggage"
  | "ask_direct_flight"
  | "confirm_search";

export type NextAction =
  | "ask_origin"
  | "ask_destination"
  | "ask_dates"
  | "ask_trip_type"
  | "ask_passengers"
  | "run_search"
  | "await_customer"
  | "deliver_options";

export type CustomerMessageKind =
  | "nudge" // cobrança: "?", "conseguiu?", "no aguardo"
  | "affirmative" // "isso", "sim", "pode ser", "fechado"
  | "negative" // "não", "não é isso"
  | "answer" // resposta com conteúdo
  | "other";

export function normalizar(s: string): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[!¡.…]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/* ── cobrança do cliente ────────────────────────────────────────────────── */

const RX_NUDGE =
  /^(\?+|oi\?*|ola\?*|alo\?*|e ai\?*|conseguiu\??|conseguiu ver\??|ja conseguiu\??|tem novidade\??|alguma novidade\??|novidades\??|no aguardo|aguardando|to no aguardo|estou no aguardo|ainda esta ai\??|ainda ta ai\??|ta ai\??|voce sumiu\??|sumiu\??|e entao\??|entao\??|demora muito\??|vai demorar\??|ainda nao chegou|nao chegou nada|cade\??|cade as opcoes\??)$/i;

const RX_AFIRMATIVO =
  /^(isso|isso mesmo|isso ai|sim|siim|s|ss|ok|okay|okey|blz|beleza|certo|correto|exato|exatamente|perfeito|show|pode ser|pode sim|pode|pode manter|manter|mantem|fechado|fechou|confirmo|confirmado|positivo|uhum|aham|ta bom|tabom|ta certo|claro|com certeza|por favor|pf|pfv|vamos|bora|top|otimo|legal)$/i;

const RX_NEGATIVO =
  /^(nao|nao e isso|nao era isso|negativo|errado|nada disso|nao quero|nem|nao obrigado|nao obg)$/i;

/**
 * Classifica a mensagem do cliente dentro de uma cotação aérea ativa.
 * `pesquisaEmAndamento` faz "ok" contar como cobrança e não como confirmação.
 */
export function classifyCustomerMessage(
  textoBruto: string,
  opts?: { pesquisaEmAndamento?: boolean },
): CustomerMessageKind {
  const t = normalizar(textoBruto);
  if (!t) return "other";
  if (RX_NUDGE.test(t)) return "nudge";
  if (RX_AFIRMATIVO.test(t)) {
    // Durante uma pesquisa em andamento, "ok" é só o cliente aguardando.
    if (opts?.pesquisaEmAndamento && /^(ok|okay|okey|blz|beleza|ta bom|tabom|certo|uhum|aham)$/.test(t))
      return "nudge";
    return "affirmative";
  }
  if (RX_NEGATIVO.test(t)) return "negative";
  return "answer";
}

/** Mensagem curta = nunca deve recalcular o setor responsável. */
export function isShortCustomerMessage(textoBruto: string): boolean {
  const t = normalizar(textoBruto);
  if (!t) return true;
  if (RX_NUDGE.test(t) || RX_AFIRMATIVO.test(t) || RX_NEGATIVO.test(t)) return true;
  return t.split(" ").length <= 3;
}

/* ── mudança real de necessidade (única coisa que troca o setor) ────────── */

export type OutroServico =
  | "pacote"
  | "hotel"
  | "carro"
  | "seguro"
  | "transfer"
  | "cruzeiro"
  | "passeio"
  | "pos_venda";

const SERVICOS: Array<[OutroServico, RegExp]> = [
  ["pacote", /\b(pacote|pacotes|all inclusive|viagem completa|aereo \+ hotel|aereo e hotel|voo e hotel)\b/],
  ["hotel", /\b(hotel|hoteis|hospedagem|pousada|resort|diaria|diarias|hospedar)\b/],
  ["carro", /\b(alugar (um )?carro|aluguel de carro|locacao de (carro|veiculo)|carro alugado|rent a car)\b/],
  ["seguro", /\b(seguro viagem|seguro de viagem|seguro medico|assistencia viagem)\b/],
  ["transfer", /\b(transfer|traslado|translado|van do aeroporto)\b/],
  ["cruzeiro", /\b(cruzeiro|navio|msc|costa cruzeiros)\b/],
  ["passeio", /\b(passeio|passeios|ingresso|ingressos|city tour|excursao|disney|universal)\b/],
  [
    "pos_venda",
    /\b(remarcar|remarcacao|reembolso|cancelar (minha|a) (reserva|passagem)|meu pedido|minha reserva|localizador|check-?in|voucher|bagagem extraviada)\b/,
  ],
];

/**
 * Só devolve algo quando o cliente pediu OUTRA necessidade de verdade.
 * Mensagem curta ("isso", "ok", "?") nunca cai aqui.
 */
export function detectarMudancaDeNecessidade(textoBruto: string): OutroServico | null {
  const t = normalizar(textoBruto);
  if (!t || isShortCustomerMessage(textoBruto)) return null;
  for (const [servico, rx] of SERVICOS) if (rx.test(t)) return servico;
  return null;
}

/* ── resolvedor da pergunta pendente ────────────────────────────────────── */

export type FlightRequestPatch = {
  origin?: string | null;
  origin_status?: string;
  destination?: string | null;
  departure_date?: string | null;
  return_date?: string | null;
  trip_type?: string | null;
  adults?: number | null;
  children?: number | null;
  infants?: number | null;
  baggage_filter?: boolean | null;
  direct_flight_filter?: boolean | null;
};

export type ResolveResult = {
  resolved: boolean;
  patch: FlightRequestPatch;
  next_action: NextAction | null;
  /** Verdadeiro quando a resposta é ambígua e precisa de UMA pergunta. */
  ambiguous?: boolean;
  /** Texto curto pra registrar no log/prompt. */
  note?: string;
};

const VAZIO: ResolveResult = { resolved: false, patch: {}, next_action: null };

function parseNumeroPax(t: string): number | null {
  const direto = t.match(/^(\d{1,2})$/);
  if (direto) return Number(direto[1]);
  const comPalavra = t.match(/(\d{1,2})\s*(adulto|adultos|pessoa|pessoas|pax|passageiro|passageiros)/);
  if (comPalavra) return Number(comPalavra[1]);
  const extenso: Record<string, number> = {
    um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5,
    seis: 6, sete: 7, oito: 8, nove: 9,
  };
  const palavra = t.match(/^(um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove)\b/);
  if (palavra) return extenso[palavra[1]!] ?? null;
  if (/^(so eu|somente eu|eu|eu mesmo|eu sozinho|sozinho|sozinha)$/.test(t)) return 1;
  return null;
}

/**
 * Resolve a resposta do cliente contra a pergunta pendente.
 * Só recorre ao modelo quando devolve resolved = false.
 */
/**
 * Cidade informada em texto livre ("Maringá", "saio de Maringa", "de Curitiba").
 * Retorna a cidade normalizada (sem preposição/ruído) ou null.
 */
export function parseCidadeLivre(textoNormalizado: string): string | null {
  const t = textoNormalizado.replace(/[?,;]/g, " ").replace(/\s+/g, " ").trim();
  if (!t || t.length > 60) return null;
  const m = t.match(
    /^(?:eu\s+)?(?:saio|parto|embarco|vou sair|sair|partindo|saindo|embarcando)?\s*(?:de|do|da|em|no|na)?\s*([a-z][a-z\s.'-]{2,40})$/,
  );
  const bruto = (m?.[1] ?? t).replace(/\b(mesmo|por favor|pfv|obrigad[oa]|entao)\b/g, "").trim();
  if (bruto.length < 3) return null;
  if (/\d/.test(bruto)) return null;
  if (/^(sim|nao|ok|claro|isso|beleza|talvez|nao sei|qualquer|tanto faz|aqui)$/.test(bruto)) return null;
  // Vocativo ("Robertp", "Camila") não é cidade — inclusive com erro de digitação.
  if (pareceNomeDePessoa(bruto)) return null;

  return bruto.replace(/\b\w/g, (c) => c.toUpperCase());
}

export function resolvePendingFlightAnswer(params: {
  pending_question: PendingQuestion | string | null | undefined;
  pending_question_context?: Record<string, unknown> | null;
  texto: string;
}): ResolveResult {
  const pq = (params.pending_question ?? "") as PendingQuestion | "";
  if (!pq) return VAZIO;
  const ctx = params.pending_question_context ?? {};
  const t = normalizar(params.texto);
  if (!t) return VAZIO;
  const kind = classifyCustomerMessage(params.texto);
  if (kind === "nudge") return VAZIO;

  const sim = kind === "affirmative";
  const nao = kind === "negative";

  switch (pq) {
    case "confirm_origin": {
      if (sim && typeof ctx["origin"] === "string") {
        return {
          resolved: true,
          patch: { origin: String(ctx["origin"]), origin_status: "confirmed_by_customer" },
          next_action: "ask_destination",
          note: `origem confirmada: ${String(ctx["origin"])}`,
        };
      }
      if (nao) return { resolved: true, patch: { origin: null, origin_status: "missing" }, next_action: "ask_origin" };
      return VAZIO;
    }

    case "ask_origin": {
      if (sim || nao) return { ...VAZIO, ambiguous: true };
      // Cidade livre ("Maringá", "saio de Maringá") precisa ser PERSISTIDA aqui.
      // Enquanto isso ficava só a cargo do modelo, a origem se perdia entre os
      // turnos e o especialista repetia "de qual cidade você pretende embarcar?".
      const cidade = parseCidadeLivre(t);
      if (cidade)
        return {
          resolved: true,
          patch: { origin: cidade, origin_status: "informed_by_customer" },
          next_action: "ask_destination",
          note: `origem informada pelo cliente: ${cidade}`,
        };
      return VAZIO;
    }

    case "confirm_trip_type_and_dates": {
      if (sim) {
        const patch: FlightRequestPatch = {};
        if (typeof ctx["trip_type"] === "string") patch.trip_type = String(ctx["trip_type"]);
        if (typeof ctx["departure_date"] === "string") patch.departure_date = String(ctx["departure_date"]);
        if (typeof ctx["return_date"] === "string") patch.return_date = String(ctx["return_date"]);
        if (!Object.keys(patch).length) return VAZIO;
        return {
          resolved: true,
          patch,
          next_action: "ask_passengers",
          note: `trecho e datas confirmados (${patch.trip_type ?? "?"} · ${patch.departure_date ?? "?"}${
            patch.return_date ? ` → ${patch.return_date}` : ""
          })`,
        };
      }
      if (nao) return { resolved: true, patch: {}, next_action: "ask_dates" };
      return VAZIO;
    }

    case "ask_trip_type": {
      if (/\b(ida e volta|ida-volta|volta tambem|com volta)\b/.test(t))
        return { resolved: true, patch: { trip_type: "round_trip" }, next_action: "ask_dates" };
      if (/\b((so|somente|apenas) ida|ida simples|sem volta|so a ida)\b/.test(t))
        return { resolved: true, patch: { trip_type: "one_way", return_date: null }, next_action: "ask_dates" };
      return VAZIO;
    }

    case "ask_passengers": {
      const n = parseNumeroPax(t);
      if (n != null && n >= 1 && n <= 9)
        return {
          resolved: true,
          patch: { adults: n },
          next_action: "run_search",
          note: `passageiros: ${n} adulto(s)`,
        };
      return VAZIO;
    }

    case "ask_baggage": {
      if (sim || /\b(com bagagem|com mala|despachada|23kg)\b/.test(t))
        return { resolved: true, patch: { baggage_filter: true }, next_action: "run_search" };
      if (nao || /\b(sem bagagem|so bagagem de mao|sem mala)\b/.test(t))
        return { resolved: true, patch: { baggage_filter: false }, next_action: "run_search" };
      return VAZIO;
    }

    case "ask_direct_flight": {
      if (sim || /\b(direto|sem escala|sem conexao)\b/.test(t))
        return { resolved: true, patch: { direct_flight_filter: true }, next_action: "run_search" };
      if (nao || /\b(pode ter conexao|tanto faz|com escala)\b/.test(t))
        return { resolved: true, patch: { direct_flight_filter: false }, next_action: "run_search" };
      return VAZIO;
    }

    case "confirm_search": {
      if (sim) return { resolved: true, patch: {}, next_action: "run_search" };
      return VAZIO;
    }

    default:
      return VAZIO;
  }
}
