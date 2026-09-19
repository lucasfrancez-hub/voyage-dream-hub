/** Permissões da API interna VIA AIR. Client-safe. */
export const API_SCOPES = [
  "flights:read",
  "flights:write",
  "checkouts:read",
  "checkouts:write",
  "passengers:write",
  "payments:read",
  "payments:write",
  "orders:read",
  "tickets:read",
  "hotels:read",
  "hotels:book",
  "cars:read",
  "cars:book",
  "insurance:read",
  "products:read",
  "packages:read",
  "services:read",
  "quotes:write",
  // Carteira financeira genérica (entrada do cliente e saída Pix ao fornecedor).
  // Propositalmente separadas de payments:* (aéreo) para não haver ambiguidade.
  "wallet:charge",
  "wallet:read",
  "wallet:payout",
  "wallet:refund",
] as const;

export type ApiScope = (typeof API_SCOPES)[number];

/** Conjunto padrão entregue à Sky Hub (aéreo + checkout + pagamento + pedidos). */
export const SKYHUB_DEFAULT_SCOPES: ApiScope[] = [
  "flights:read",
  "flights:write",
  "checkouts:read",
  "checkouts:write",
  "passengers:write",
  "payments:read",
  "payments:write",
  "orders:read",
  "tickets:read",
];

export const API_SCOPE_LABEL: Record<ApiScope, string> = {
  "flights:read": "Buscar voos",
  "flights:write": "Selecionar voos / criar oferta",
  "checkouts:read": "Ler checkout",
  "checkouts:write": "Criar e alterar checkout",
  "passengers:write": "Enviar passageiros",
  "payments:read": "Consultar pagamentos",
  "payments:write": "Cobrar (Pix e cartão)",
  "orders:read": "Ler pedidos",
  "tickets:read": "Ler bilhetes",
  "hotels:read": "Buscar hotéis",
  "hotels:book": "Reservar hotéis",
  "cars:read": "Buscar carros",
  "cars:book": "Reservar carros",
  "insurance:read": "Consultar seguro viagem",
  "products:read": "Consultar produtos",
  "packages:read": "Consultar pacotes",
  "services:read": "Consultar serviços (transfer, passeio, ingresso, seguro)",
  "quotes:write": "Criar orçamento público",
};
