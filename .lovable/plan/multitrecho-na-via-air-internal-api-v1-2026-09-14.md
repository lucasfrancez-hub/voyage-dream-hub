# Multitrecho na Via Air Internal API (v1)

Extensão da API v1 já existente. Nada dos endpoints atuais muda.

## 1. Como a lógica atual será reaproveitada

O projeto já trata multitrecho como composição de buscas só-ida, uma por perna, na ordem informada
(`src/lib/multicity.ts`: `MIN_SEGMENTS = 2`, `MAX_SEGMENTS = 6`, validação de rota e ordem cronológica).
A API vai reutilizar exatamente isso:

- limites 2 a 6 pernas vêm de `MIN_SEGMENTS`/`MAX_SEGMENTS` (nada inventado);
- cada perna chama `searchFlights` (`src/lib/onertravel.server.ts`) em modo só-ida, o mesmo já usado por `/flights/search`;
- cada checkout de perna chama `createFlightCart` só-ida, o mesmo já usado por `/checkouts`;
- passageiros, revalidação, pagamento, pedido, Pix e bilhetes continuam sendo os endpoints por checkout que já existem.

Nenhuma integração nova com a Oner, nenhuma duplicação de Asaas, OTP, sessão ou sincronização.

## 2. Endpoints novos

| Método | Rota | Escopo |
| --- | --- | --- |
| POST | `/flights/multicity/search` | `flights:read` |
| POST | `/multicity/checkouts` | `flights:write` + `checkouts:write` |
| GET | `/multicity/groups/{groupId}` | `checkouts:read` |
| PUT | `/multicity/groups/{groupId}/passengers` | `passengers:write` |
| POST | `/multicity/groups/{groupId}/revalidate` | `checkouts:write` |

Todas passam por `withApi` (token Bearer, scopes, rate limit, correlation ID, log em `api_request_logs`,
erros normalizados) e ficam em `src/routes/api/public/internal/v1/`, mantendo o prefixo público exigido pelo hosting.
Os mutáveis passam por `comIdempotencia`.

## 3. searchId e offerId por perna

- `searchId` novo prefixo `mcs_` (mesma função de geração opaca de `refs.server.ts`).
- cada perna executa a busca e grava suas ofertas com `guardarOfertas`, reaproveitando `api_offer_refs`
  com o mesmo `search_id = mcs_...`; o payload de cada oferta ganha `sequence` (1, 2, 3...), além de
  `searchKey`, `fareId`, `itineraryId` e contexto da perna.
- cada oferta recebe seu próprio `offerId` (`off_...`, validade 30 min). A Sky Hub nunca vê
  `searchKey`, `fareId`, `itineraryId` nem `cartId`.
- na criação do grupo, valida-se que o `offerId` pertence ao `searchId` informado e que o `sequence`
  bate com o da oferta — assim nenhuma oferta cai na perna errada.

## 4. Resposta da busca

`{ searchId, type: "MULTICITY", passengers, currency, legs: [{ sequence, origin, destination, departureDate, totalCount, offers: [...], error? }] }`.
Ofertas nunca são misturadas entre pernas. Perna sem resultado devolve `offers: []`;
perna com falha do fornecedor devolve `offers: []` + `error: { code, message }` — a falha aparece, não é escondida.

## 5. groupId e agrupamento dos checkouts

`POST /multicity/checkouts` recebe `{ searchId, offers: [{ sequence, offerId }] }`, cria um carrinho por perna
(na ordem) e devolve `{ groupId: "grp_...", type: "MULTICITY", reservations: [...], totalAmount, status }`.
Cada perna vira um `checkoutId` independente — sem tentar forçar tudo num único carrinho da Oner.
Se alguma perna falhar, as demais permanecem e o grupo fica `PARTIALLY_CREATED`, com o erro da perna
registrado no item; a Sky Hub pode repetir só aquela perna.

## 6. Migration

Duas tabelas novas (sem duplicar o que já está em `integration_orders`):

- `api_multicity_groups`: `id`, `api_client_id`, `search_id`, `status`, `total_amount`, `currency`, `created_at`, `updated_at`
- `api_multicity_group_items`: `id`, `group_id`, `sequence`, `checkout_id`, `order_id`, `origin`, `destination`,
  `departure_date`, `amount`, `status`, `last_error`, `created_at`, `updated_at`; único por (`group_id`, `sequence`)

Padrão já usado nas tabelas da API: GRANT para `service_role`, leitura admin, RLS ligada, trigger de `updated_at`.
Valor, localizador, bilhete, PNR e status de pagamento continuam sendo lidos de `integration_orders` na hora da consulta.

## 7. Passageiros do grupo

`PUT /multicity/groups/{groupId}/passengers` recebe a mesma lista já aceita por checkout e aplica em cada
checkout do grupo, em sequência, reaproveitando a rotina de envio de passageiros existente. A resposta traz o
resultado por reserva (`sequence`, `checkoutId`, `status: APPLIED | FAILED`, `error`), então uma perna que exija
tratamento diferente falha isoladamente, sem derrubar as outras.

## 8. Revalidação do grupo

`POST /multicity/groups/{groupId}/revalidate` revalida cada checkout e devolve
`{ groupId, status, reservations: [{ checkoutId, sequence, status: VALID | PRICE_CHANGED | UNAVAILABLE, previousAmount, currentAmount }], previousTotal, currentTotal }`.
Basta uma perna mudar de preço para o grupo deixar de ser `VALID`.

## 9. Status do grupo e falha parcial

Estados: `CREATED`, `PARTIALLY_CREATED`, `AWAITING_PAYMENT`, `PARTIALLY_PAID`, `PAID`, `PARTIALLY_ISSUED`,
`COMPLETE`, `MANUAL_REVIEW`, `FAILED`. O status é derivado das reservas a cada leitura — `COMPLETE` só quando
todas as reservas estão concluídas. Pagamento continua por checkout: nenhuma transação única falsa.
Reserva paga nunca é recobrada; o retry acontece só na reserva que falhou.

`GET /multicity/groups/{groupId}` devolve o resumo com `orderId`, `paymentStatus`, `supplierPaymentStatus`,
`locator` e `ticketStatus` por reserva.

## 10. Webhooks

Ao enfileirar um evento cujo pedido pertence a um grupo, o payload ganha `groupId` e `sequence`, além de
`checkoutId` e `orderId` já existentes. Sem fila nova, sem evento novo: o mesmo despachante, a mesma assinatura
`X-ViaAir-Signature` e o mesmo retry.

## 11. Pacote de entrega

Atualizados e mantidos idênticos entre si (o teste automático de consistência passa a cobrir também o multitrecho):

- `docs/openapi.yaml` — 5 rotas novas + schemas `MultiCity*`
- `docs/SKYHUB_INTEGRATION.md` — seção MULTITRECHO com o fluxo ponta a ponta
- `docs/ViaAir-Internal-API.postman_collection.json` — pesquisa, grupo, passageiros, revalidação, consulta
- SDK: `searchMultiCity`, `createMultiCityCheckouts`, `getMultiCityGroup`, `setMultiCityPassengers`,
  `revalidateMultiCityGroup` e os tipos `MultiCitySearchRequest`, `MultiCitySearchResponse`, `MultiCityLeg`,
  `MultiCityOffer`, `MultiCityGroup`, `MultiCityReservation`
- `docs/skyhub.env.example` sem mudança (mesmas 3 variáveis)
- ZIP final regerado em `/mnt/documents/skyhub-api/`

## 12. Testes

`tests/api-multitrecho.test.ts`: 2 e 3 pernas, datas fora de ordem, origem igual ao destino, menos de 2 pernas,
mais de 6, perna sem resultado, criação parcial, falha de uma reserva, mudança de preço em uma perna só,
propagação de passageiros, idempotência (mesma chave não duplica checkouts), payload de webhook com `groupId`,
pagamento parcial, emissão parcial e conclusão total. Mais o teste de consistência entre OpenAPI, docs, Postman e SDK.

## 13. Não muda

`/flights/search`, `/flights/inbound`, `/checkouts`, `/payments/*`, `/orders/*`, o checkout do portal e a
Busca Ideal continuam exatamente como estão.
