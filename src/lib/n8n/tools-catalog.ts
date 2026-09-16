/**
 * Catálogo machine-readable das ferramentas que o agente do n8n pode usar.
 *
 * O n8n NÃO fala com o Supabase nem com Oner/Asaas: toda operação passa pela
 * Internal API v1 da VIA AIR, autenticada com o token dedicado do n8n
 * (Authorization: Bearer vai_live_… / vai_test_…).
 *
 * Client-safe: só metadados, nenhum segredo.
 */
import type { AgentRole } from "./agent-profile";

export type N8nTool = {
  name: string;
  description: string;
  method: "GET" | "POST" | "PUT";
  endpoint: string;
  required_scope: string;
  roles: AgentRole[];
  input_schema: Record<string, unknown>;
  output_schema: Record<string, unknown>;
  notes?: string;
};

const obj = (properties: Record<string, unknown>, required: string[] = []) => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});

const S = { type: "string" };
const N = { type: "number" };
const B = { type: "boolean" };
const ARR = (items: unknown) => ({ type: "array", items });

export const N8N_TOOLS: N8nTool[] = [
  {
    name: "health",
    description: "Verifica se a busca de voos, a sessão de compra e o Pix estão disponíveis.",
    method: "GET",
    endpoint: "/api/public/internal/v1/health",
    required_scope: "flights:read",
    roles: ["air"],
    input_schema: obj({}),
    output_schema: obj({ status: S, version: S, services: { type: "object" } }),
  },
  {
    name: "search_airports",
    description: "Busca aeroportos e cidades por texto para resolver origem e destino em IATA.",
    method: "GET",
    endpoint: "/api/public/internal/v1/airports/search?q={termo}",
    required_scope: "flights:read",
    roles: ["air", "consultant"],
    input_schema: obj({ q: S }, ["q"]),
    output_schema: obj({ results: ARR(obj({ iata: S, name: S, city: S, country: S, isCity: B })) }),
  },
  {
    name: "search_flights",
    description: "Pesquisa voos de ida ou ida e volta. Devolve ofertas com preço, bagagem, família tarifária e plano de parcelamento.",
    method: "POST",
    endpoint: "/api/public/internal/v1/flights/search",
    required_scope: "flights:read",
    roles: ["air"],
    input_schema: obj(
      {
        origin: S,
        destination: S,
        departureDate: S,
        returnDate: { ...S, nullable: true },
        adults: N,
        children: N,
        infants: N,
        cabinClass: { type: "string", enum: ["ECONOMY", "PREMIUM_ECONOMY", "BUSINESS", "FIRST"] },
        // Nomes idênticos aos da rota real (flights.search.ts). Não existe
        // baggageOnly/directOnly: o filtro de bagagem é checkedBaggage e o de
        // conexões é maxStops (0 = só voo direto).
        checkedBaggage: B,
        maxStops: N,
        airlines: ARR(S),

      },
      ["origin", "destination", "departureDate", "adults"],
    ),
    output_schema: obj({
      searchId: S,
      offers: ARR(obj({ offerId: S, price: { type: "object" }, segments: ARR({ type: "object" }), baggage: { type: "object" }, installmentPlan: { type: "object" } })),
    }),
    notes: "Pode levar de 10 a 42s. Chamar de forma assíncrona e devolver o resultado por callback.",
  },
  {
    name: "search_inbound",
    description: "Busca as opções de volta a partir de uma oferta de ida já escolhida.",
    method: "POST",
    endpoint: "/api/public/internal/v1/flights/inbound",
    required_scope: "flights:read",
    roles: ["air"],
    input_schema: obj({ searchId: S, outboundOfferId: S }, ["outboundOfferId"]),
    output_schema: obj({ offers: ARR({ type: "object" }) }),
  },
  {
    name: "search_multicity",
    description: "Pesquisa multitrecho: uma perna por objeto, resultados independentes por perna.",
    method: "POST",
    endpoint: "/api/public/internal/v1/flights/multicity/search",
    required_scope: "flights:read",
    roles: ["air"],
    input_schema: obj(
      { legs: ARR(obj({ origin: S, destination: S, departureDate: S }, ["origin", "destination", "departureDate"])), adults: N, children: N, infants: N },
      ["legs", "adults"],
    ),
    output_schema: obj({ searchId: S, legs: ARR(obj({ sequence: N, offers: ARR({ type: "object" }) })) }),
  },
  {
    name: "search_ready_packages",
    description:
      "Pacotes PRONTOS publicados no Command Center da VIA AIR (destino, datas, hotel, inclusos, preço real e parcelamento). Usar SEMPRE antes de propor pacote personalizado. Nunca inventar pacote: só existe o que esta tool devolver.",
    method: "POST",
    endpoint: "/api/public/internal/v1/packages/search",
    required_scope: "packages:read",
    roles: ["consultant"],
    input_schema: obj({
      destination: S,
      origin: S,
      month: S,
      departureFrom: S,
      departureTo: S,
      departureDate: S,
      returnDate: S,
      nights: N,
      nightsMin: N,
      nightsMax: N,
      adults: N,
      children: ARR(N),
      kind: { type: "string", enum: ["package", "tour", "service"] },
      productType: { type: "string", enum: ["pacote_pronto", "passeio", "servico", "cruzeiro"] },
      onlyAvailable: B,
      limit: N,
    }),
    output_schema: obj({
      status: { type: "string", enum: ["found", "not_found", "incompatible", "customization_required"] },
      next_step: { type: "string", enum: ["present_options", "custom_quote"] },
      source: { type: "string", enum: ["COMMAND_CENTER"] },
      total_count: N,
      packages: ARR({ type: "object" }),
      near_matches: ARR({ type: "object" }),
      message: S,
    }),
    notes:
      "status=found → apresentar os pacotes retornados. not_found/incompatible/customization_required → seguir para cotação personalizada, sem oferecer 'pacote parecido'. PREÇO: o único valor comercial é package_total, já na ocupação-base (pricing_basis=per_party → apresentar como 'R$ X occupancy_label', ex.: 'para 2 pessoas'). taxes já estão inclusas (taxes_included=true) — NUNCA somar taxes ao package_total, nunca dividir por passageiro, nunca multiplicar. Se requires_recalculation=true (ocupação diferente da base ou crianças), informar que a condição precisa ser recalculada/confirmada, sem adaptar valor.",
  },
  {
    name: "create_flight_quote",
    description:
      "Cria o orçamento aéreo persistido da VIA AIR e devolve UM único link público. Envie options[] com até 3 ofertas (opção 1, 2 e 3 no mesmo link). Nunca montar preço ou link manualmente.",
    method: "POST",
    endpoint: "/api/public/internal/v1/quotes/flight",
    required_scope: "quotes:write",
    roles: ["air"],
    input_schema: obj(
      {
        searchId: S,
        offerId: S,
        inboundOfferId: { ...S, nullable: true },
        fareIndex: N,
        inboundFareIndex: N,
        agentName: S,
        conversationId: S,
      },
      ["offerId"],
    ),
    output_schema: obj({ quote_id: S, public_id: S, public_url: S, short_url: S, total: N, currency: S }),
    notes:
      "Só aceita identificadores opacos (offerId). As chaves do fornecedor são resolvidas no servidor e nunca voltam na resposta. O link é o mesmo formato https://pedidos.viaair.tur.br/orcamento/{publicId} usado pelo fluxo de reserva.",
  },
  {
    name: "create_checkout",


    description: "Cria o carrinho (checkout) a partir da oferta escolhida pelo cliente.",
    method: "POST",
    endpoint: "/api/public/internal/v1/checkouts",
    required_scope: "checkouts:write",
    roles: ["air"],
    input_schema: obj({ offerId: S, inboundOfferId: { ...S, nullable: true } }, ["offerId"]),
    output_schema: obj({ checkoutId: S, total: { type: "object" }, expiresAt: S }),
    notes: "Enviar header Idempotency-Key.",
  },
  {
    name: "create_multicity_checkouts",
    description: "Cria um checkout por perna do multitrecho, agrupados por groupId.",
    method: "POST",
    endpoint: "/api/public/internal/v1/multicity/checkouts",
    required_scope: "checkouts:write",
    roles: ["air"],
    input_schema: obj({ legs: ARR(obj({ sequence: N, offerId: S }, ["sequence", "offerId"])) }, ["legs"]),
    output_schema: obj({ groupId: S, items: ARR({ type: "object" }) }),
  },
  {
    name: "get_checkout",
    description: "Lê o conteúdo do carrinho: trechos, valores, taxas e situação.",
    method: "GET",
    endpoint: "/api/public/internal/v1/checkouts/{checkoutId}",
    required_scope: "checkouts:read",
    roles: ["air"],
    input_schema: obj({ checkoutId: S }, ["checkoutId"]),
    output_schema: obj({ checkoutId: S, status: S, total: { type: "object" }, passengers: ARR({ type: "object" }) }),
  },
  {
    name: "get_multicity_group",
    description: "Situação consolidada de um grupo multitrecho (COMPLETE só quando todas as pernas terminam).",
    method: "GET",
    endpoint: "/api/public/internal/v1/multicity/groups/{groupId}",
    required_scope: "checkouts:read",
    roles: ["air"],
    input_schema: obj({ groupId: S }, ["groupId"]),
    output_schema: obj({ groupId: S, status: S, items: ARR({ type: "object" }) }),
  },
  {
    name: "set_passengers",
    description: "Cadastra os passageiros do carrinho (1 a 9).",
    method: "PUT",
    endpoint: "/api/public/internal/v1/checkouts/{checkoutId}/passengers",
    required_scope: "passengers:write",
    roles: ["air"],
    input_schema: obj(
      {
        checkoutId: S,
        passengers: ARR(
          obj(
            { type: { type: "string", enum: ["ADT", "CHD", "INF"] }, firstName: S, lastName: S, birthDate: S, gender: { type: "string", enum: ["M", "F"] }, document: S, email: S, phone: S },
            ["type", "firstName", "lastName", "birthDate"],
          ),
        ),
      },
      ["checkoutId", "passengers"],
    ),
    output_schema: obj({ checkoutId: S, passengers: ARR({ type: "object" }) }),
  },
  {
    name: "set_multicity_passengers",
    description: "Cadastra os passageiros de todas as pernas de um grupo multitrecho.",
    method: "PUT",
    endpoint: "/api/public/internal/v1/multicity/groups/{groupId}/passengers",
    required_scope: "passengers:write",
    roles: ["air"],
    input_schema: obj({ groupId: S, passengers: ARR({ type: "object" }) }, ["groupId", "passengers"]),
    output_schema: obj({ groupId: S, items: ARR({ type: "object" }) }),
  },
  {
    name: "revalidate_checkout",
    description: "Revalida preço e disponibilidade antes de cobrar. Retorna VALID, PRICE_CHANGED ou EXPIRED.",
    method: "POST",
    endpoint: "/api/public/internal/v1/checkouts/{checkoutId}/revalidate",
    required_scope: "checkouts:write",
    roles: ["air"],
    input_schema: obj({ checkoutId: S }, ["checkoutId"]),
    output_schema: obj({ status: S, total: { type: "object" } }),
  },
  {
    name: "revalidate_multicity_group",
    description: "Revalida cada perna do grupo multitrecho de forma isolada.",
    method: "POST",
    endpoint: "/api/public/internal/v1/multicity/groups/{groupId}/revalidate",
    required_scope: "checkouts:write",
    roles: ["air"],
    input_schema: obj({ groupId: S }, ["groupId"]),
    output_schema: obj({ groupId: S, items: ARR({ type: "object" }) }),
  },
  {
    name: "get_payment_methods",
    description: "Formas de pagamento realmente disponíveis para aquele carrinho (regra de 72h aplicada pelo servidor).",
    method: "POST",
    endpoint: "/api/public/internal/v1/checkouts/{checkoutId}/payment-methods",
    required_scope: "checkouts:read",
    roles: ["air"],
    input_schema: obj({ checkoutId: S }, ["checkoutId"]),
    output_schema: obj({ methods: ARR({ type: "object" }) }),
  },
  {
    name: "get_installments",
    description: "Planos de parcelamento reais do carrinho, já com as regras da VIA AIR.",
    method: "POST",
    endpoint: "/api/public/internal/v1/checkouts/{checkoutId}/installments",
    required_scope: "checkouts:read",
    roles: ["air"],
    input_schema: obj({ checkoutId: S, amount: N }, ["checkoutId"]),
    output_schema: obj({ installments: ARR(obj({ quantity: N, value: N, total: N, interestFree: B })) }),
  },
  {
    name: "tokenize_card",
    description: "Tokeniza um cartão no cofre do fornecedor. PAN e CVV nunca são armazenados nem registrados.",
    method: "POST",
    endpoint: "/api/public/internal/v1/checkouts/{checkoutId}/payments/card-token",
    required_scope: "payments:write",
    roles: ["air"],
    input_schema: obj({ checkoutId: S, card: { type: "object" } }, ["checkoutId", "card"]),
    output_schema: obj({ cardToken: S, brand: S, lastDigits: S }),
    notes: "Só habilitar quando a etapa de pagamento entrar em produção.",
  },
  {
    name: "pay_card",
    description: "Cobra de 1 a 3 cartões tokenizados, com soma exata do valor aéreo.",
    method: "POST",
    endpoint: "/api/public/internal/v1/checkouts/{checkoutId}/payments/card",
    required_scope: "payments:write",
    roles: ["air"],
    input_schema: obj({ checkoutId: S, cards: ARR({ type: "object" }), payer: { type: "object" } }, ["checkoutId", "cards"]),
    output_schema: obj({ paymentId: S, status: S }),
    notes: "Exige confirmação explícita do cliente, validada pelo Lovable.",
  },
  {
    name: "create_pix",
    description: "Gera a cobrança Pix VIA AIR (Asaas) do carrinho.",
    method: "POST",
    endpoint: "/api/public/internal/v1/checkouts/{checkoutId}/payments/pix",
    required_scope: "payments:write",
    roles: ["air"],
    input_schema: obj({ checkoutId: S }, ["checkoutId"]),
    output_schema: obj({ txid: S, qrCode: S, invoiceUrl: S, expiresAt: S }),
  },
  {
    name: "get_pix_status",
    description: "Consulta a situação da cobrança Pix do carrinho.",
    method: "GET",
    endpoint: "/api/public/internal/v1/checkouts/{checkoutId}/payments/pix",
    required_scope: "payments:read",
    roles: ["air"],
    input_schema: obj({ checkoutId: S }, ["checkoutId"]),
    output_schema: obj({ txid: S, status: S, paidAt: S }),
  },
  {
    name: "cancel_payment",
    description: "Cancela uma tentativa de pagamento ainda em aberto.",
    method: "POST",
    endpoint: "/api/public/internal/v1/checkouts/{checkoutId}/payments/cancel",
    required_scope: "payments:write",
    roles: ["air"],
    input_schema: obj({ checkoutId: S }, ["checkoutId"]),
    output_schema: obj({ status: S }),
  },
  {
    name: "get_payment",
    description: "Consulta uma cobrança pelo identificador do pagamento.",
    method: "GET",
    endpoint: "/api/public/internal/v1/payments/{paymentId}",
    required_scope: "payments:read",
    roles: ["air"],
    input_schema: obj({ paymentId: S }, ["paymentId"]),
    output_schema: obj({ paymentId: S, status: S, amount: N }),
  },
  {
    name: "create_order",
    description: "Conclui o pedido no fornecedor depois do pagamento confirmado.",
    method: "POST",
    endpoint: "/api/public/internal/v1/checkouts/{checkoutId}/order",
    required_scope: "checkouts:write",
    roles: ["air"],
    input_schema: obj({ checkoutId: S }, ["checkoutId"]),
    output_schema: obj({ orderId: S, status: S }),
  },
  {
    name: "get_order",
    description: "Pedido completo: trechos, passageiros, valores e bilhetes.",
    method: "GET",
    endpoint: "/api/public/internal/v1/orders/{orderId}",
    required_scope: "orders:read",
    roles: ["air", "consultant"],
    input_schema: obj({ orderId: S }, ["orderId"]),
    output_schema: obj({ orderId: S, status: S, passengers: ARR({ type: "object" }), tickets: ARR({ type: "object" }) }),
  },
  {
    name: "get_order_status",
    description: "Situação do pedido (pagamento do cliente e pagamento do fornecedor).",
    method: "GET",
    endpoint: "/api/public/internal/v1/orders/{orderId}/status",
    required_scope: "orders:read",
    roles: ["air", "consultant"],
    input_schema: obj({ orderId: S }, ["orderId"]),
    output_schema: obj({ orderId: S, customerPaymentStatus: S, providerPaymentStatus: S, state: S }),
  },
  {
    name: "get_tickets",
    description: "Localizador (PNR) e números de bilhete do pedido.",
    method: "GET",
    endpoint: "/api/public/internal/v1/orders/{orderId}/tickets",
    required_scope: "tickets:read",
    roles: ["air", "consultant"],
    input_schema: obj({ orderId: S }, ["orderId"]),
    output_schema: obj({ tickets: ARR(obj({ pnr: S, ticketNumber: S, passenger: S, status: S })) }),
  },
  {
    name: "get_documents",
    description: "Links assinados (15 min) dos documentos do pedido: plano de viagem e bilhete eletrônico.",
    method: "GET",
    endpoint: "/api/public/internal/v1/orders/{orderId}/documents",
    required_scope: "orders:read",
    roles: ["air", "consultant"],
    input_schema: obj({ orderId: S }, ["orderId"]),
    output_schema: obj({ documents: ARR(obj({ type: S, url: S, expiresAt: S })) }),
  },
  {
    name: "import_reservation",
    description: "Importa uma reserva Comprar Viagem a partir do link ou do identificador do carrinho.",
    method: "POST",
    endpoint: "/api/public/internal/v1/imports/comprar-viagem/reservation",
    required_scope: "checkouts:read",
    roles: ["air"],
    input_schema: obj({ checkoutUrl: S, checkoutId: S }),
    output_schema: obj({ externalCartId: S, segments: ARR({ type: "object" }), passengers: ARR({ type: "object" }), total: { type: "object" } }),
  },
];

/** Escopos mínimos do cliente n8n na primeira fase (sem pagamento). */
export const N8N_INITIAL_SCOPES = [
  "flights:read",
  "packages:read",
  "checkouts:read",
  "checkouts:write",
  "passengers:write",
  "orders:read",
  "tickets:read",
  "quotes:write",
];

/**
 * Ferramentas autorizadas por perfil (fonte da verdade do backend).
 *
 * consultant: pacotes prontos e apoio; NÃO faz aéreo avulso — deve transferir
 * para a Central (regra conversacional, não é tool).
 * air: pesquisa aérea, multitrecho e criação do orçamento aéreo.
 */
export const DEFAULT_TOOLS_BY_ROLE: Record<AgentRole, string[]> = {
  consultant: ["search_ready_packages", "get_order", "get_order_status"],
  air: [
    "search_airports",
    "search_flights",
    "search_inbound",
    "search_multicity",
    "create_flight_quote",
    "get_order",
    "get_order_status",
    "get_tickets",
  ],
};

/** Tools do agente: o que estiver em `ai_agents.tools_habilitadas` vence; caso
 *  contrário aplica-se o padrão do perfil. Sempre filtrado pelo catálogo. */
export function resolveToolsEnabled(role: AgentRole, configuradas: string[]): string[] {
  const permitidas = new Set(DEFAULT_TOOLS_BY_ROLE[role]);
  const existentes = new Set(N8N_TOOLS.map((t) => t.name));
  const base = configuradas.length ? configuradas : DEFAULT_TOOLS_BY_ROLE[role];
  return base.filter((t) => existentes.has(t) && permitidas.has(t));
}


export function toolsForRole(role: AgentRole): N8nTool[] {
  return N8N_TOOLS.filter((t) => t.roles.includes(role));
}

/** Só as tools cujo escopo o token do n8n realmente possui. */
export function toolsForScopes(tools: N8nTool[], scopes: string[]): N8nTool[] {
  return tools.filter((t) => scopes.includes(t.required_scope));
}
