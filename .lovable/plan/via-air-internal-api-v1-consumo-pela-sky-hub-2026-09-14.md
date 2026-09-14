# Via Air Internal API v1 (consumo pela Sky Hub)

Fachada HTTP sobre os serviços Oner/Asaas que já existem. Nenhuma regra de negócio é copiada ou reescrita: os handlers chamam os módulos atuais. O portal continua funcionando exatamente como hoje.

## A. Arquitetura

```text
SKY HUB → Bearer vai_live_... → Via Air Internal API (rotas HTTP)
                                   ├── src/lib/onertravel*.server.ts      (busca)
                                   ├── src/lib/integrations/oner/*.server (checkout/pagto/pix/sync)
                                   ├── src/lib/pix-cobranca.server.ts     (Pix Asaas do cliente)
                                   └── Banco Via Air (tabelas atuais)
```

Observação de rota: no hosting, só `/api/public/*` aceita chamada externa sem sessão. A API fica em `src/routes/api/public/internal/v1/...` → URL `https://<dominio>/api/public/internal/v1/...`. Toda rota exige o token próprio; nada fica aberto.

## B/C. Endpoints e o serviço que cada um reutiliza

| Endpoint | Reutiliza |
|---|---|
| GET health, GET oner/status | `session.server.ts` |
| GET airports/search | `onertravel.server.searchAirports` |
| POST flights/search, flights/inbound, flights/multicity/search | `searchFlights`, `searchInboundFlights` |
| POST checkouts | `createFlightCart` + `store.criarOperacao` |
| GET checkouts/{id} | `checkout.lerCarrinho` / `resumirCarrinho` |
| PUT checkouts/{id}/passengers | `checkout.enviarPassageiros` |
| POST checkouts/{id}/revalidate | `checkout.revalidarPreco` |
| GET payment-methods / POST installments | `payment.consultarFormasPagamento`, `consultarParcelas` |
| POST payments/card-token | `payment.guardarCartaoNoCofre` |
| POST payments/card | `salvarPagador` + `pagarComCartoes` (1–3 cartões) |
| POST payments/pix | `pix-cobranca.criarPixParaPedido` (Asaas Via Air) |
| GET payments/{paymentId} | `pix_cobrancas` |
| POST payments/cancel | `payment.cancelarPagamento` |
| POST checkouts/{id}/order | `checkout.criarPedido` |
| GET orders/{id}, /status, /tickets, /documents | `store.server.ts` + `sync.server.ts` |
| hotels / cars / travel-insurance / products / packages | `onertravel-hotels/-cars/-extras/-combo` (só o que já existe) |

Não entram: assento, bagagem paga, SSR, void, reembolso, remarcação — não existem hoje.

## D. Arquivos novos

- `src/lib/api/auth.server.ts` — validação de token, scopes, rate limit, last_used.
- `src/lib/api/respond.ts` — envelope de erro, correlation id, CORS.
- `src/lib/api/idempotency.server.ts` — `Idempotency-Key`.
- `src/lib/api/refs.server.ts` — offerId/checkoutId/paymentId opacos.
- `src/lib/api/normalize.ts` — DTOs normalizados (voos, checkout, pedido, ticket).
- `src/lib/api/webhooks.server.ts` — envio assinado + retry para a Sky Hub.
- `src/lib/api/tokens.functions.ts` + `src/components/admin/ApiTokens.tsx` + rota `admin.api-tokens.tsx`.
- `src/routes/api/public/internal/v1/**` — um arquivo por recurso.
- `src/lib/viaair-api-client/` — SDK TypeScript.
- `openapi.yaml`, `docs/SKYHUB_INTEGRATION.md`, `docs/ViaAir-Internal-API.postman_collection.json`, `docs/skyhub.env.example`.
- `tests/api/*.test.ts`.

## E. Arquivos alterados

Apenas adições pontuais: link "API → Tokens" no menu admin e um gatilho de webhook dentro de `store.mudarEtapa` / `sync.server.ts` (enfileira evento; não muda o fluxo). Nada mais do portal é tocado.

## F. Migrations

`api_clients`, `api_request_logs`, `api_idempotency_keys`, `api_webhook_endpoints`, `api_webhook_events`, `api_webhook_attempts`, `api_offer_refs`. Todas com RLS (leitura só admin) e GRANT; acesso da API é via service role.

## G/H/I/J. api_clients e token

Campos: id, name, client_code, environment, token_prefix, token_hash, token_last4, scopes[], active, expires_at, revoked_at, last_used_at, rate_limit_per_min, created_by, created_at, updated_at.

Geração: 32 bytes aleatórios → `vai_live_<base62>`. Guardamos só SHA-256 (comparação timing-safe) + prefixo e 4 últimos dígitos. Exibido uma única vez na criação. Sky Hub usa `VIAAIR_API_TOKEN` no header `Authorization: Bearer`.

## K/L. Scopes e rate limit

Scopes conforme pedido (`flights:read`, `checkouts:write`, `payments:write`, `orders:read`, …). Sky Hub começa com leitura de voos, checkout, passageiros, pagamentos e pedidos. Rate limit por `api_client` (padrão 120 req/min, configurável), contagem em janela deslizante no banco.

## M–P. Identificadores opacos

- `off_...` → guarda searchKey/flightKey/fareId em `api_offer_refs` (TTL 30 min).
- `chk_...` → mapeia para `cartId` + `integration_orders.id`.
- `pay_...` → `pix_cobrancas.id` ou pagamento de cartão.
- `ord_...` → `integration_orders.id`; `F-...` e `saleId` só aparecem como dados de leitura.

## Q. Idempotência

`Idempotency-Key` obrigatório em todo POST/PUT mutável; resposta original é reenviada em repetição. Pagamento ao fornecedor usa chave fixa `{checkoutId}:ONER_PIX`.

## R. Webhooks Via Air → Sky Hub

Eventos da lista (checkout.updated … order.completed). `X-ViaAir-Signature: sha256=HMAC(timestamp.body)` + `X-ViaAir-Timestamp`. Retry exponencial (1m, 5m, 15m, 1h, 6h, 24h), tentativas persistidas, evento nunca perdido.

## S. Fluxo Pix

Sky Hub cria Pix → cobrança Asaas Via Air → QR sempre Via Air → cliente paga → `asaas-webhook` atual confirma → `customer_payment_status=PAID` → gera/obtém BR Code Oner (WebSocket `PAY-{cartId}`) → valida TLV, valor, beneficiário, validade, duplicidade → paga a Oner via Asaas → `supplier_payment_status=PAID` → acompanha PNR/bilhete. Qualquer divergência → `SUPPLIER_PAYMENT_REVIEW` (sem pagar). O pagamento automático fica ligado apenas para pedidos originados pela API; o portal segue com autorização humana.

## T. Fluxo cartão

vault (token por cartão) → parcelas da Oner → salvar pagador → payNotification, com 1–3 cartões e soma validada. PAN/CVV nunca persistidos, logados ou retornados.

## U. Segurança

Token de alta entropia, hash, timing-safe, revogação, expiração, rotação, scopes, rate limit, auditoria sem dados sensíveis, nenhum segredo no frontend, sem exposição direta de Oner/Asaas.

## V. Erros

`{ error: { code, message, provider, retryable, correlationId } }` com catálogo fechado (UNAUTHORIZED, FORBIDDEN_SCOPE, RATE_LIMITED, VALIDATION_ERROR, OFFER_EXPIRED, PRICE_CHANGED, PAYMENT_DECLINED, PROVIDER_UNAVAILABLE, SUPPLIER_PAYMENT_REVIEW, NOT_FOUND, CONFLICT, INTERNAL_ERROR).

## W/X/Y/Z. Entregáveis de documentação

`openapi.yaml` (3.1, com schemas, enums, exemplos, webhooks, scopes), Postman collection com `base_url`/`api_token`, `docs/skyhub.env.example`, SDK TypeScript com os métodos e tipos pedidos, e `docs/SKYHUB_INTEGRATION.md` escrito do zero para quem não conhece o código interno (introdução, credenciais, configuração, autenticação, fluxo aéreo, Pix, cartão, webhooks, idempotência, erros, exemplos ponta a ponta).

## AA. Testes

Vitest cobrindo token (válido/inválido/revogado/expirado/scope), idempotência, assinatura de webhook e retry, normalização de oferta/checkout/pedido, validação do BR Code (valor e beneficiário divergentes, duplicidade) e máquina de status. Chamadas reais à Oner ficam mockadas; o teste ponta a ponta com tarifa real é manual.

## AB. Riscos

Expiração de oferta/carrinho na Oner entre busca e checkout; sessão Oner exigindo código por e-mail no meio de uma chamada da Sky Hub (a API responde `PROVIDER_UNAVAILABLE` e a equipe é avisada); pagamento automático ao fornecedor — mitigado pelas validações e pela idempotência.

## AC. Portal atual

Nenhuma rota, tela ou função do portal muda de comportamento. A API é camada nova sobre os mesmos serviços; a única alteração em código existente é enfileirar eventos de webhook.

## AD. Arquivos para enviar à Sky Hub

`openapi.yaml`, `docs/SKYHUB_INTEGRATION.md`, `docs/ViaAir-Internal-API.postman_collection.json`, `docs/skyhub.env.example`, pasta do SDK `src/lib/viaair-api-client/`.
