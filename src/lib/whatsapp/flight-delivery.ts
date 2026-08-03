/**
 * REGRAS PURAS DA ENTREGA DAS COTAÇÕES AÉREAS (sem I/O, testáveis).
 *
 * O worker (flight-delivery.server.ts) só orquestra: toda decisão de quantidade,
 * estado, prazo e idempotência mora aqui.
 */

export type OptLite = {
  opcao?: number;
  total?: number;
  ida?: { cia?: string; voo?: string; partida?: string } | null;
  volta?: { cia?: string; voo?: string; partida?: string } | null;
};

/** Meta de opções por cotação (política da Central de Especialistas). */
export const META_OPCOES = 3;
/** Piso: havendo alternativa, nunca parar em 1. */
export const MIN_OPCOES = 2;
/** Validade do claim de UMA opção. Expirou sem entrega → volta pra fila. */
export const CLAIM_TTL_MS = 45_000;
/** Prazo brando da arte: passou disso, a opção vai em texto. */
export const SOFT_DEADLINE_MS = 6_000;
/** Intervalo progressivo entre as opções. */
export const INTERVALO_MIN_MS = 30_000;
export const INTERVALO_MAX_MS = 90_000;
/** Cotação incompleta por mais que isso → despejo em texto e conclusão. */
export const EMERGENCIA_MS = 5 * 60_000;
/** Opção sem entrega por mais que isso → recuperação forçada pelo reconciliador. */
export const RECUPERACAO_FORCADA_MS = 2 * 60_000;
/** Tentativas por opção antes de desistir do card e ir direto ao texto. */
export const MAX_TENTATIVAS = 3;

export type OptionDeliveryStatus =
  | "pending"
  | "claimed"
  | "rendering"
  | "card_generated"
  | "sending_card"
  | "delivered_card"
  | "delivered_text"
  | "retry_scheduled"
  | "failed_recoverable"
  | "failed_final"
  /** @deprecated compatibilidade com linhas antigas. */
  | "failed"
  | "cancelled";

export type QuoteDeliveryStatus =
  | "pending"
  | "processing"
  | "partially_delivered"
  | "recovering"
  | "completed"
  | "failed"
  | "cancelled";

export const ENTREGUES: OptionDeliveryStatus[] = ["delivered_card", "delivered_text"];

export const foiEntregue = (s: string | null | undefined): boolean =>
  s === "delivered_card" || s === "delivered_text";

/** Estados terminais: não voltam para a fila de jeito nenhum. */
export const ehTerminal = (s: string | null | undefined): boolean =>
  foiEntregue(s) || s === "cancelled" || s === "failed_final";

/** Estados que só existem no meio de uma tentativa (worker vivo ou morto). */
export const emAndamento = (s: string | null | undefined): boolean =>
  s === "claimed" || s === "rendering" || s === "card_generated" || s === "sending_card";

/** Falha recuperável até o limite de tentativas; depois vira failed_final. */
export function statusAposFalha(tentativas: number, max = MAX_TENTATIVAS): OptionDeliveryStatus {
  return tentativas >= max ? "failed_final" : "failed_recoverable";
}


/** Impressão digital da opção (idempotência): companhia+voo+horário+preço. */
export function fingerprintOpcao(o: OptLite): string {
  return [
    o.ida?.cia,
    o.ida?.voo,
    o.ida?.partida,
    o.volta?.cia,
    o.volta?.voo,
    o.volta?.partida,
    Math.round(Number(o.total ?? 0)),
  ]
    .map((v) => String(v ?? "-"))
    .join("|");
}

/**
 * expected_options = min(meta, opções realmente salvas).
 * Nunca deixar a cotação pendente esperando mais do que a pesquisa trouxe.
 */
export function expectedOptions(savedOptionsCount: number, meta = META_OPCOES): number {
  if (savedOptionsCount <= 0) return 0;
  return Math.max(1, Math.min(meta, savedOptionsCount));
}

/** Estado da cotação a partir do que já foi entregue. */
export function quoteStatus(
  deliveredCount: number,
  expected: number,
  opts: { cancelled?: boolean; anyFailed?: boolean; recovering?: boolean; allFinalFailed?: boolean } = {},
): QuoteDeliveryStatus {
  if (opts.cancelled) return "cancelled";
  if (expected <= 0) return "failed";
  if (deliveredCount >= expected) return "completed";
  // Nada entregue e nada mais recuperável: falha real (vai pro humano).
  if (opts.allFinalFailed && deliveredCount <= 0) return "failed";
  if (opts.recovering) return "recovering";
  if (deliveredCount <= 0) return opts.anyFailed ? "processing" : "pending";
  return "partially_delivered";
}

/** Só conclui quando TODAS as previstas chegaram — em card OU em texto. */
export function cotacaoConcluida(deliveredCount: number, expected: number): boolean {
  return expected > 0 && deliveredCount >= expected;
}

/** Intervalo progressivo (30-90s) da próxima opção. */
export function proximoIntervaloMs(rand: () => number = Math.random): number {
  return Math.round(INTERVALO_MIN_MS + rand() * (INTERVALO_MAX_MS - INTERVALO_MIN_MS));
}

/** Claim expirado = opção liberada pra outro worker. */
export function claimExpirado(claimExpiresAt: string | null | undefined, agora = Date.now()): boolean {
  if (!claimExpiresAt) return true;
  return new Date(claimExpiresAt).getTime() <= agora;
}

/** Opção disponível pra ser reivindicada nesta rodada. */
export function opcaoDisponivel(
  o: { delivery_status: string; claim_expires_at?: string | null; next_run_at?: string | null },
  agora = Date.now(),
): boolean {
  if (ehTerminal(o.delivery_status)) return false;
  if (o.next_run_at && new Date(o.next_run_at).getTime() > agora) return false;
  if (
    o.delivery_status === "pending" ||
    o.delivery_status === "failed" ||
    o.delivery_status === "failed_recoverable" ||
    o.delivery_status === "retry_scheduled"
  ) {
    return true;
  }
  // claimed/rendering/card_generated/sending_card: só se o claim expirou.
  return claimExpirado(o.claim_expires_at, agora);
}

export type TipoInconsistencia =
  | "claim_orfao"
  | "card_gerado_nao_enviado"
  | "envio_nao_reconciliado"
  | "opcao_parada"
  | "rodada_nao_agendada"
  | "status_incorreto";

export type Inconsistencia = {
  tipo: TipoInconsistencia;
  option_index: number | null;
  estado_anterior: string | null;
  motivo: string;
};

type OptSnapshot = {
  option_index: number;
  delivery_status: string;
  claim_expires_at?: string | null;
  next_run_at?: string | null;
  last_attempt_at?: string | null;
  provider_message_id?: string | null;
  attempt_count?: number | null;
};

type QuoteSnapshot = {
  created_at?: string | null;
  delivery_status?: string | null;
  delivered_options_count?: number | null;
  expected_options?: number | null;
  next_run_at?: string | null;
};

/**
 * Compara o que está gravado com o que deveria estar. Base da autocorreção:
 * o reconciliador não "tenta de novo às cegas" — ele descobre o que faltou.
 */
export function detectarInconsistencias(
  quote: QuoteSnapshot,
  opcoes: OptSnapshot[],
  agora = Date.now(),
): Inconsistencia[] {
  const out: Inconsistencia[] = [];
  const expected = Number(quote.expected_options ?? 0);
  const entreguesReais = opcoes.filter((o) => foiEntregue(o.delivery_status)).length;

  for (const o of opcoes) {
    if (ehTerminal(o.delivery_status)) continue;

    if (emAndamento(o.delivery_status) && claimExpirado(o.claim_expires_at, agora)) {
      out.push({
        tipo:
          o.delivery_status === "card_generated" || o.delivery_status === "sending_card"
            ? "card_gerado_nao_enviado"
            : "claim_orfao",
        option_index: o.option_index,
        estado_anterior: o.delivery_status,
        motivo: "claim expirado sem entrega",
      });
      continue;
    }

    // Envio saiu no provedor mas o banco não fechou o estado.
    if (o.provider_message_id && !foiEntregue(o.delivery_status)) {
      out.push({
        tipo: "envio_nao_reconciliado",
        option_index: o.option_index,
        estado_anterior: o.delivery_status,
        motivo: "provider_message_id existe sem estado entregue",
      });
      continue;
    }

    // Opção parada há tempo demais sem nenhuma tentativa em curso.
    const ref = o.last_attempt_at ?? quote.created_at ?? null;
    const parada = ref ? agora - new Date(ref).getTime() > RECUPERACAO_FORCADA_MS : false;
    const agendadaProFuturo = o.next_run_at ? new Date(o.next_run_at).getTime() > agora : false;
    if (parada && !agendadaProFuturo) {
      out.push({
        tipo: "opcao_parada",
        option_index: o.option_index,
        estado_anterior: o.delivery_status,
        motivo: `sem entrega há mais de ${Math.round(RECUPERACAO_FORCADA_MS / 1000)}s`,
      });
    }
  }

  // Faltam opções e ninguém agendou a rodada seguinte.
  const faltam = expected - entreguesReais;
  const temPendente = opcoes.some((o) => !ehTerminal(o.delivery_status));
  if (faltam > 0 && temPendente && !quote.next_run_at) {
    out.push({
      tipo: "rodada_nao_agendada",
      option_index: null,
      estado_anterior: quote.delivery_status ?? null,
      motivo: "delivered < expected sem next_run_at",
    });
  }

  // Contador ou status da cotação divergindo das opções reais.
  const statusEsperado = quoteStatus(entreguesReais, expected);
  const contadorErrado = Number(quote.delivered_options_count ?? 0) !== entreguesReais;
  const statusErrado =
    quote.delivery_status !== statusEsperado &&
    quote.delivery_status !== "recovering" &&
    quote.delivery_status !== "cancelled";
  if (expected > 0 && (contadorErrado || statusErrado)) {
    out.push({
      tipo: "status_incorreto",
      option_index: null,
      estado_anterior: quote.delivery_status ?? null,
      motivo: `gravado=${quote.delivery_status}/${quote.delivered_options_count} real=${statusEsperado}/${entreguesReais}`,
    });
  }

  return out;
}


/** Cotação parada há mais de 5 min com opções faltando → despejo em texto. */
export function emEmergencia(
  quote: { created_at?: string | null; delivered_options_count?: number | null; expected_options?: number | null },
  agora = Date.now(),
): boolean {
  const expected = Number(quote.expected_options ?? 0);
  const entregues = Number(quote.delivered_options_count ?? 0);
  if (expected <= 0 || entregues >= expected) return false;
  const criada = quote.created_at ? new Date(quote.created_at).getTime() : agora;
  return agora - criada > EMERGENCIA_MS;
}
