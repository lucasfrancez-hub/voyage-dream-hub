/**
 * Constantes e máquina de estados da integração Comprar Viagem / Oner.
 * Arquivo client-safe: só tipos e valores, nenhum segredo.
 */

export const ONER_PROVIDER = "oner" as const;

export const ONER_AUTH_API = "https://api.auth.onertravel.com";
export const ONER_API = "https://api.onertravel.com";
export const ONER_SITE = "https://www.comprarviagem.com.br";
export const ONER_USER_AREA = `${ONER_SITE}/viaair/user-area`;
export const ONER_INSTITUTION_ID = "23";
export const ONER_AGENT_ID = "83956";

/** Conta operacional VIA AIR usada na Comprar Viagem. */
export const ONER_ACCOUNT_EMAIL = process.env["ONER_ACCOUNT_EMAIL"] ?? "lucas@voeair.com";

/** Caminhos da área logada usados no acompanhamento (fallback visual). */
export const ONER_PATHS = {
  shoppingCart: `${ONER_USER_AREA}/shopping-cart`,
  sales: `${ONER_USER_AREA}/sales`,
  saleDetail: (saleId: string | number) => `${ONER_USER_AREA}/sales-detail/${saleId}`,
} as const;

/**
 * Forma de pagamento escolhida pelo cliente.
 * CARD segue automatizado ponta a ponta; PIX, nesta primeira versão,
 * é preparado à mão pela equipe dentro da Comprar Viagem.
 */
export type OnerPaymentMethod = "CARD" | "PIX";

/**
 * Etapas da lista de conferência do Pix manual, na ordem em que a equipe
 * executa a operação no fornecedor.
 */
export const ONER_PIX_STEPS = [
  "cart_prepared",
  "net_amount_checked",
  "order_created",
  "oner_pix_generated",
  "customer_paid",
  "oner_paid",
  "booking_confirmed",
  "locator_received",
  "tickets_received",
] as const;

export type OnerPixStep = (typeof ONER_PIX_STEPS)[number];

export const ONER_PIX_STEP_LABEL: Record<OnerPixStep, string> = {
  cart_prepared: "Carrinho preparado",
  net_amount_checked: "Valor líquido Oner conferido",
  order_created: "Pedido F-… criado",
  oner_pix_generated: "Pix Oner gerado",
  customer_paid: "Pagamento do cliente confirmado",
  oner_paid: "Oner paga",
  booking_confirmed: "Reserva confirmada",
  locator_received: "Localizador recebido",
  tickets_received: "Bilhetes recebidos",
};

/** Etapas da operação, na ordem natural do fluxo. */
export const ONER_STATES = [
  "CART_CREATED",
  "PIX_MANUAL_PREPARATION",

  "PASSENGERS_PENDING",
  "PASSENGERS_COMPLETED",
  "ONER_SESSION_CHECK",
  "ONER_AUTH_REQUIRED",
  "ONER_AUTHENTICATING",
  "ONER_READY",
  "ONER_CART_CREATED",
  "ONER_PRICE_VALIDATING",
  "PRICE_CHANGED",
  "ONER_ORDER_CREATED",
  "CUSTOMER_PAYMENT_PENDING",
  "CUSTOMER_PAID",
  "ONER_PIX_CREATING",
  "ONER_PIX_CREATED",
  "ONER_PAYMENT_PROCESSING",
  "ONER_PAID",
  "ONER_ORDER_CONFIRMING",
  "ONER_SALE_WAITING",
  "ONER_SALE_FOUND",
  "ONER_SALE_DETAIL_SYNCING",
  "WAITING_RESERVATION_DETAILS",
  "LOCATOR_RECEIVED",
  "TICKETS_RECEIVED",
  "BOOKING_CONFIRMED",
  "COMPLETE",
  "MANUAL_REVIEW",
  "FAILED",
  "CANCELLED",
] as const;

export type OnerState = (typeof ONER_STATES)[number];

/** Estados finais: o serviço de retomada não mexe mais neles. */
export const ONER_FINAL_STATES: OnerState[] = ["COMPLETE", "CANCELLED"];

/** Estados que exigem alguém olhando. */
export const ONER_ATTENTION_STATES: OnerState[] = [
  "MANUAL_REVIEW",
  "FAILED",
  "PRICE_CHANGED",
  "ONER_AUTH_REQUIRED",
  "PIX_MANUAL_PREPARATION",
];


/** Texto amigável de cada etapa, para telas internas. */
export const ONER_STATE_LABEL: Record<OnerState, string> = {
  CART_CREATED: "Oferta guardada",
  PIX_MANUAL_PREPARATION: "Pix — preparar manualmente",

  PASSENGERS_PENDING: "Aguardando passageiros",
  PASSENGERS_COMPLETED: "Passageiros preenchidos",
  ONER_SESSION_CHECK: "Verificando sessão do fornecedor",
  ONER_AUTH_REQUIRED: "Código de acesso necessário",
  ONER_AUTHENTICATING: "Autenticando no fornecedor",
  ONER_READY: "Sessão pronta",
  ONER_CART_CREATED: "Carrinho criado no fornecedor",
  ONER_PRICE_VALIDATING: "Conferindo o valor",
  PRICE_CHANGED: "Valor mudou — precisa de confirmação",
  ONER_ORDER_CREATED: "Pedido criado no fornecedor",
  CUSTOMER_PAYMENT_PENDING: "Aguardando pagamento do cliente",
  CUSTOMER_PAID: "Cliente pagou",
  ONER_PIX_CREATING: "Gerando Pix do fornecedor",
  ONER_PIX_CREATED: "Pix do fornecedor gerado",
  ONER_PAYMENT_PROCESSING: "Pagando o fornecedor",
  ONER_PAID: "Fornecedor pago",
  ONER_ORDER_CONFIRMING: "Fornecedor confirmando",
  ONER_SALE_WAITING: "Aguardando virar venda",
  ONER_SALE_FOUND: "Venda localizada",
  ONER_SALE_DETAIL_SYNCING: "Lendo detalhe da venda",
  WAITING_RESERVATION_DETAILS: "Aguardando dados da reserva",
  LOCATOR_RECEIVED: "Localizador recebido",
  TICKETS_RECEIVED: "Bilhetes recebidos",
  BOOKING_CONFIRMED: "Reserva confirmada",
  COMPLETE: "Concluído",
  MANUAL_REVIEW: "Revisão manual",
  FAILED: "Falhou",
  CANCELLED: "Cancelado",
};

/** Intervalo entre consultas: começa curto e vai aumentando. */
export function proximoIntervaloSegundos(pollCount: number): number {
  if (pollCount < 6) return 20;
  if (pollCount < 15) return 60;
  if (pollCount < 30) return 180;
  if (pollCount < 60) return 600;
  return 1800;
}

/** Chave de idempotência do pagamento ao fornecedor. */
export function chaveIdempotenciaPix(orderNumber: string): string {
  return `oner_pix_${String(orderNumber).trim().toUpperCase()}`;
}

/** Reconhece o número de pedido no formato F-... */
export function extrairNumeroPedido(texto: string): string | null {
  const m = String(texto ?? "").match(/\bF-\s?([A-Z0-9]{4,20})\b/i);
  return m ? `F-${m[1]!.toUpperCase()}` : null;
}
