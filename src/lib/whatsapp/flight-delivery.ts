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
  opts: { cancelled?: boolean; anyFailed?: boolean } = {},
): QuoteDeliveryStatus {
  if (opts.cancelled) return "cancelled";
  if (expected <= 0) return "failed";
  if (deliveredCount >= expected) return "completed";
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
  if (foiEntregue(o.delivery_status) || o.delivery_status === "cancelled") return false;
  if (o.next_run_at && new Date(o.next_run_at).getTime() > agora) return false;
  if (o.delivery_status === "pending" || o.delivery_status === "failed") return true;
  // claimed/rendering: só se o claim tiver expirado (worker morreu).
  return claimExpirado(o.claim_expires_at, agora);
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
