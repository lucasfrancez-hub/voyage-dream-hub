# Integração Sky Hub ↔ API interna VIA AIR (v1)

Este documento é autossuficiente: não é preciso conhecer o código da VIA AIR para integrar.
A Sky Hub **não** implementa Oner, Asaas, OTP, sessão, WebSocket nem sincronização — apenas
consome esta API com um token próprio.

> **Escopo da v1: somente aéreo.** Estão publicados busca de voos, checkout, passageiros,
> pagamento (cartão e Pix) e pedidos. **Hotéis, carros, seguro viagem, produtos e pacotes
> ainda não têm endpoint nesta versão** — as permissões existem no modelo de token, mas
> nenhuma rota está disponível. Também não existem nesta versão: compra de assento,
> bagagem extra, refeição, prioridade, remarcação, reemissão, reembolso ou cancelamento
> de bilhete emitido.

---

## 1. Credenciais e configuração

| Variável | Valor |
| --- | --- |
| `VIAAIR_API_BASE_URL` | `https://pedidos.viaair.tur.br/api/public/internal/v1` |
| `VIAAIR_API_TOKEN` | `vai_live_xxxxxxxxxxxxxxxxx` (gerado no painel VIA AIR) |
| `VIAAIR_WEBHOOK_SECRET` | senha combinada para conferir a assinatura dos avisos |

O token é exibido **uma única vez**, no momento da criação, no painel
VIA AIR → Admin → API — Tokens. Ele não pode ser recuperado depois; se for perdido,
gere um novo (rotacionar). Nunca coloque o token em repositório, documentação ou frontend.

Ambientes: prefixo `vai_live_` (produção) e `vai_test_` (teste).

---

## 2. Autenticação

Toda chamada envia:

```
Authorization: Bearer vai_live_xxxxxxxxxxxxxxxxx
Content-Type: application/json
```

A VIA AIR valida: existência, hash, ativo, expiração, revogação e permissão (scope).
Sem token válido: `401 unauthorized`. Sem permissão: `403 forbidden`.
Acima do limite de chamadas do token: `429 rate_limited`.

Permissões do token Sky Hub: `flights:read`, `flights:write`, `checkouts:read`,
`checkouts:write`, `passengers:write`, `payments:read`, `payments:write`,
`orders:read`, `tickets:read`.

---

## 3. Cabeçalhos gerais

| Cabeçalho | Uso |
| --- | --- |
| `Idempotency-Key` | Em toda chamada que altera estado (checkout, Pix, cartão, pedido). Mesma chave + mesmo corpo devolve a mesma resposta; mesma chave + corpo diferente devolve `409 conflict`. |
| `X-Correlation-Id` | Opcional. Se não vier, a VIA AIR gera e devolve em `X-Correlation-Id`. Use sempre nos registros da Sky Hub. |

---

## 4. Modelo de erro

```json
{
  "error": {
    "code": "provider_unavailable",
    "message": "O fornecedor não respondeu a tempo.",
    "provider": "oner",
    "retryable": true,
    "correlationId": "cid_8f2a..."
  }
}
```

Códigos: `unauthorized` (401), `payment_declined` (402), `forbidden` (403),
`not_found` (404), `conflict` (409), `price_changed` (409), `invalid_request` (422),
`rate_limited` (429), `internal_error` (500), `provider_error` (502),
`provider_unavailable` (503). Repita apenas quando `retryable = true`.

---

## 5. Identificadores

A Sky Hub só trabalha com identificadores opacos da VIA AIR — os identificadores
internos do fornecedor nunca são expostos:

- `offerId` — `off_...` (oferta de voo, validade 30 minutos)
- `searchId` — `srh...`
- `checkoutId` — `chk_...` (validade 12 horas)
- `paymentId` (= `txid`) — pagamento Pix
- `orderId` — pedido VIA AIR

---

## 5.1 Monitoramento

```
GET /health
```

```json
{
  "status": "ok",
  "version": "1.0.0",
  "time": "2026-10-01T20:40:00.000Z",
  "services": { "oner": "up", "asaas": "configured" }
}
```

```
GET /oner/status
```

```json
{
  "available": true,
  "session": "active",
  "lastValidatedAt": "2026-10-01T14:02:00Z",
  "lastUsedAt": "2026-10-01T20:31:00Z",
  "expiresAt": "2026-10-01T20:02:00Z",
  "message": null
}
```

Se `available` for `false`, a busca de voos e o checkout vão falhar com
`503 provider_unavailable` até a VIA AIR reconectar a sessão.

---

## 6. Fluxo aéreo completo


### 6.1 Aeroportos

```
GET /airports/search?query=rio&isDeparture=true
```

```json
```json
{
  "airports": [
    { "iata": "RIO", "name": "", "city": "RIO", "country": "", "isCity": true, "cityCode": "RIO" },
    {
      "iata": "GIG",
      "name": "Rio Galeão – Tom Jobim International Airport",
      "city": "Rio De Janeiro",
      "country": "Brasil",
      "isCity": false,
      "cityCode": "RIO"
    }
  ]
}
```

Resposta real do ambiente de produção em 2026-09-14.

### 6.2 Pesquisa

```
POST /flights/search
```

```json
{
  "origin": "GRU",
  "destination": "GIG",
  "departureDate": "2026-10-12",
  "returnDate": "2026-10-18",
  "adults": 1,
  "children": 0,
  "infants": 0
}
```

Resposta:

```json
{
  "searchId": "srh3b1c…",
  "roundTrip": true,
  "currency": "BRL",
  "totalCount": 42,
  "outbound": [
    {
      "offerId": "off_9f2c6f4b",
      "airline": { "iata": "G3", "name": "GOL" },
      "flightNumber": "1234",
      "origin": "GRU",
      "destination": "GIG",
      "departureAt": "2026-10-12T08:10:00",
      "arrivalAt": "2026-10-12T09:15:00",
      "durationMinutes": 65,
      "stops": 0,
      "price": { "amount": 412.9, "tax": 58.1, "total": 471.0, "currency": "BRL", "passengers": 1 },
      "segments": [ /* ... */ ],
      "fares": [ { "fareKey": "…", "price": 412.9, "tax": 58.1, "total": 471.0, "fareFamily": "LIGHT", "cabinClass": "ECONOMY", "checkedBaggage": false } ]
    }
  ]
}
```

Obrigatórios: `origin`, `destination`, `departureDate`. Opcionais: `returnDate`,
`adults`, `children`, `infants`, `cabinClass`, `checkedBaggage`, `maxStops`, `airlines`,
`originIsCity`, `destinationIsCity`.

### 6.3 Volta (somente ida e volta)

```
POST /flights/inbound
{ "searchId": "srh3b1c…", "outboundOfferId": "off_9f2c6f4b" }
```

```json
{ "searchId": "srh3b1c…", "outboundOfferId": "off_9f2c6f4b", "totalCount": 37, "inbound": [ /* FlightOffer */ ] }
```

### 6.4 Checkout

```
POST /checkouts
Idempotency-Key: skyhub-checkout-8271

{ "offerId": "off_9f2c6f4b", "inboundOfferId": "off_1a77bd20" }
```

```json
{ "checkoutId": "chk_01H8XK3P2Q", "status": "CREATED", "roundTrip": true, "createdAt": "2026-10-01T20:48:00.000Z" }
```

Consulta:

```
GET /checkouts/{checkoutId}
```

```json
{
  "checkoutId": "chk_01H8XK3P2Q",
  "status": "ACTIVE",
  "currency": "BRL",
  "amount": { "fare": 412.9, "taxes": 58.1, "total": 471.0 },
  "passengersCount": { "adults": 1, "children": 0, "infants": 0 },
  "flights": [ /* trechos conforme o carrinho */ ],
  "prices": { /* composição de preços do carrinho */ },
  "installments": [ /* parcelamento sugerido pelo carrinho */ ],
  "passengers": [],
  "passengersSaved": false
}
```

### 6.5 Passageiros

```
PUT /checkouts/{checkoutId}/passengers
```

```json
{
  "passengers": [
    {
      "firstName": "Maria",
      "lastName": "Souza",
      "type": "ADT",
      "gender": "F",
      "birthDate": "1990-04-21",
      "documentNumber": "12345678901",
      "documentType": 1,
      "nationalityCountryId": 30,
      "email": "maria@exemplo.com",
      "phone": "44999999999"
    }
  ]
}
```

```json
{ "checkoutId": "chk_01H8XK3P2Q", "passengersSaved": 1 }
```

Obrigatórios por passageiro: `firstName`, `lastName`, `gender`, `birthDate`,
`documentNumber`. Opcionais: `type` (padrão `ADT`), `documentType` (padrão `1` = CPF),
`nationalityCountryId` (padrão `30` = Brasil), `email` e `phone`.
Somente o **primeiro** passageiro envia `email` e `phone`. O tratamento (Sr./Sra./Srta.)
é derivado automaticamente pela VIA AIR a partir de sexo e tipo de passageiro.

### 6.6 Reconferência de tarifa

```
POST /checkouts/{checkoutId}/revalidate
{ "expectedAmount": 471.00 }
```

```json
{ "status": "PRICE_CHANGED", "previousAmount": 471.0, "currentAmount": 512.4, "difference": 41.4 }
```

Outros retornos: `{ "status": "VALID", "amount": 471.0 }` e
`{ "status": "EXPIRED", "previousAmount": 471.0, "currentAmount": null }`.

### 6.7 Formas de pagamento

```
GET /checkouts/{checkoutId}/payment-methods
```

```json
{
  "checkoutId": "chk_01H8XK3P2Q",
  "methods": [
    { "method": "CARD", "maxCards": 3, "holderDocumentRequired": true },
    { "method": "PIX", "provider": "VIAAIR_ASAAS" }
  ],
  "pixOnly": false,
  "pixOnlyReason": null
}
```

As formas vêm da configuração real do carrinho. Voos com embarque em até 72 horas
liberam **somente Pix**: `CARD` some da lista, `pixOnly` vem `true` e `pixOnlyReason`
explica que o parcelamento no cartão é tratado pelo WhatsApp da VIA AIR.

---

## 7. Fluxo de pagamento com cartão

1. `POST /checkouts/{checkoutId}/payments/card-token` — tokeniza cada cartão.

```json
{ "holderName": "MARIA SOUZA", "number": "5555444433332222", "cvv": "123",
  "expirationMonth": "12", "expirationYear": "2029", "documentType": 1,
  "documentNumber": "12345678901" }
```

```json
{ "cardToken": "…", "cardKey": "…", "brand": "MASTERCARD", "cardBin": "555544", "lastDigits": "2222" }
```

2. `POST /checkouts/{checkoutId}/installments` — parcelamento informado pela operadora,
   usando o cartão já tokenizado. Nunca calcule parcelas por conta própria.

```json
{ "amount": 471.00, "cardToken": "…", "cardKey": "…", "multipleCards": false }
```

```json
{
  "installments": [
    { "installment": 3, "installmentsValue": 157.0, "total": 471.0, "interestRate": 0,
      "hasRate": false, "firstInstallmentAddition": 0, "split": false }
  ]
}
```

3. `POST /checkouts/{checkoutId}/payments/card` — 1 a 3 cartões, quando permitido.
   Cada cartão tem valor e parcelamento próprios; a soma de `cards[].amount` precisa
   ser exatamente `totalAmount`.

```json
{
  "cards": [
    {
      "cardToken": "…", "cardKey": "…", "brand": "MASTERCARD", "cardBin": "555544",
      "lastDigits": "2222", "holderName": "MARIA SOUZA", "documentType": 1,
      "documentNumber": "12345678901", "expirationMonth": 12, "expirationYear": 2029,
      "amount": 471.00, "installments": 3, "interestRate": 0
    }
  ],
  "totalAmount": 471.00,
  "payer": {
    "firstName": "Maria", "lastName": "Souza", "documentNumber": "12345678901",
    "birthDate": "1990-04-21", "email": "maria@exemplo.com", "phone": "44999999999",
    "zipCode": "87700000", "street": "Rua X", "number": "100", "complement": "",
    "neighborhood": "Centro", "city": "Paranavaí", "state": "PR"
  }
}
```

```json
{ "status": "PAID", "method": "CARD", "amount": 471.0, "locator": "ABCDEF", "orderId": "…" }
```

Recusa devolve `402 payment_declined`; tarifa alterada devolve `409 price_changed`.

### 7.1 Observação sobre PCI DSS (decisão registrada)

Hoje PAN e CVV passam pelo backend da VIA AIR em **uma única chamada**
(`/payments/card-token`), sobre TLS, e seguem direto para o cofre (Vault) da operadora.
Eles **não** são gravados em banco, não entram em log, não são auditados e não voltam na
resposta — apenas `cardToken`, `cardKey`, `brand`, `cardBin` e `lastDigits`.

Mesmo assim, esse desenho coloca a Sky Hub e a VIA AIR no escopo SAQ-D de PCI DSS, porque
os dados do cartão trafegam pelos dois sistemas. A alternativa é tokenizar direto do
navegador do cliente contra um componente seguro do fornecedor, o que reduziria o escopo
a SAQ-A. A operadora hoje não oferece esse componente público para uso por terceiros,
por isso a decisão atual foi mantida. **Nada foi alterado**: esta seção registra a decisão
e o impacto, para reavaliação quando a operadora publicar um componente de captura.

---

## 8. Fluxo Pix

O cliente **sempre** recebe o QR Code da VIA AIR (Asaas). O Pix pago à operadora é
interno e não aparece para a Sky Hub a não ser como situação do pedido.

```
POST /checkouts/{checkoutId}/payments/pix
Idempotency-Key: skyhub-pix-8271

{ "amount": 471.00,
  "payer": { "name": "Maria Souza", "documentNumber": "12345678901", "email": "maria@exemplo.com" } }
```

```json
{
  "paymentId": "…",
  "txid": "…",
  "orderId": "…",
  "amount": 471.0,
  "currency": "BRL",
  "qrCode": "00020126…5802BR…6304ABCD",
  "qrCodeImage": "data:image/png;base64,iVBORw0KGgoAAAANS…",
  "invoiceUrl": "https://…",
  "expiresAt": "2026-10-01T21:30:00Z",
  "status": "ACTIVE",
  "provider": "VIAAIR_ASAAS"
}
```

`qrCodeImage` é sempre uma **Data URI completa** (`data:image/png;base64,…`), pronta para
usar em `<img src>` — não é base64 puro. `qrCode` é o copia-e-cola (EMV).

Acompanhamento: `GET /payments/{paymentId}` ou `GET /checkouts/{checkoutId}/payments/pix`
(mesmo formato de resposta). Situações: `ACTIVE`, `PAID`, `EXPIRED`, `CANCELLED`, `REFUNDED`.
A cobrança vale 30 minutos; pedir de novo dentro da validade devolve a mesma cobrança.

Sequência completa:

```text
cliente -> checkout Sky Hub
        -> VIA AIR cria a cobrança Pix (Asaas)
        -> API devolve o QR Code VIA AIR
        -> cliente paga
        -> Asaas confirma para a VIA AIR  => customer.payment.paid
        -> VIA AIR paga a operadora e acompanha => supplier.payment.paid
        -> localizador e bilhetes          => order.locator.received / order.ticket.received
```

**Pagamento do cliente pago não significa venda finalizada.** A venda só evolui depois do
pagamento à operadora e da emissão. Por isso o pedido carrega dois campos separados:
`customerPaymentStatus` e `supplierPaymentStatus`. Divergência na conferência do pagamento
à operadora coloca o pedido em revisão (`SUPPLIER_PAYMENT_REVIEW` / `MANUAL_REVIEW`).

---

## 9. Pedido, bilhetes e documentos

```
POST /checkouts/{checkoutId}/order  -> { "orderId": "…", "providerOrderNumber": "F-…", "status": "CREATED" }
GET  /orders/{orderId}              -> pedido completo
GET  /orders/{orderId}/status       -> situação resumida
GET  /orders/{orderId}/tickets      -> bilhetes por passageiro
GET  /orders/{orderId}/documents    -> documentos com link temporário (900 s)
```

`GET /orders/{orderId}/status`:

```json
{
  "orderId": "…",
  "status": "LOCATOR_RECEIVED",
  "detail": "Localizador recebido",
  "customerPaymentStatus": "PAID",
  "supplierPaymentStatus": "PAID",
  "locator": "ABCDEF",
  "providerOrderNumber": "F-202609104483048",
  "updatedAt": "2026-10-01T21:42:11Z"
}
```

Situações do pedido: `CREATED`, `AWAITING_PAYMENT`, `CUSTOMER_PAYMENT_PAID`,
`SUPPLIER_PAYMENT_PENDING`, `SUPPLIER_PAYMENT_PAID`, `SUPPLIER_PAYMENT_REVIEW`,
`WAITING_RESERVATION`, `LOCATOR_RECEIVED`, `TICKETS_RECEIVED`, `COMPLETE`,
`PRICE_CHANGED`, `MANUAL_REVIEW`, `FAILED`, `CANCELLED`.

Cancelamento:

```
POST /checkouts/{checkoutId}/payments/cancel
-> { "checkoutId": "chk_…", "status": "CANCELLED", "ticketsAffected": false }
```

**Não** cancela bilhete já emitido.

---

## 10. Avisos (webhook VIA AIR → Sky Hub)

A Sky Hub publica um endereço próprio e informa a senha de assinatura à VIA AIR
(cadastrada no painel). Formato da chamada:

```
POST https://skyhub.exemplo.com/webhooks/viaair
Content-Type: application/json
X-ViaAir-Event: order.locator.received
X-ViaAir-Timestamp: 1790000000
X-ViaAir-Signature: sha256=9c1f…
```

```json
{
  "id": "evt_01H…",
  "event": "order.locator.received",
  "createdAt": "2026-10-01T21:42:11Z",
  "data": { "orderId": "…", "status": "LOCATOR_RECEIVED", "detail": "Localizador recebido" }
}
```

Eventos: `checkout.updated`, `customer.payment.paid`, `customer.payment.failed`,
`supplier.payment.pending`, `supplier.payment.paid`, `supplier.payment.failed`,
`order.created`, `order.locator.received`, `order.ticket.received`,
`order.completed`, `order.failed`.

**Assinatura:** HMAC-SHA256 de `timestamp + "." + corpo bruto`, com a
`VIAAIR_WEBHOOK_SECRET`, em hexadecimal, prefixado por `sha256=`. Confira sempre
usando o corpo bruto, antes de qualquer parse, e rejeite timestamps com mais de 5 minutos.

```ts
import { createHmac, timingSafeEqual } from "node:crypto";

const esperado =
  "sha256=" +
  createHmac("sha256", process.env.VIAAIR_WEBHOOK_SECRET!)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");

const a = Buffer.from(esperado);
const b = Buffer.from(assinaturaRecebida);
const valido = a.length === b.length && timingSafeEqual(a, b);
```

**Resposta esperada:** HTTP 2xx. Sem 2xx, a VIA AIR repete em 1 min, 5 min, 15 min,
1 h, 6 h e 24 h. Trate o `id` do evento como chave de idempotência — o mesmo evento
pode chegar mais de uma vez.

---

## 11. Exemplo ponta a ponta (SDK TypeScript)

```ts
import { ViaAirApi } from "@viaair/api-client";

const api = new ViaAirApi({
  baseUrl: process.env.VIAAIR_API_BASE_URL!,
  token: process.env.VIAAIR_API_TOKEN!,
});

const busca = await api.searchFlights({
  origin: "GRU",
  destination: "GIG",
  departureDate: "2026-10-12",
  adults: 1,
});

const ida = busca.outbound[0];
const { checkoutId } = await api.createCheckout({ offerId: ida.offerId }, `chk-${pedidoLocal}`);

await api.setPassengers(checkoutId, [
  {
    firstName: "Maria",
    lastName: "Souza",
    type: "ADT",
    gender: "F",
    birthDate: "1990-04-21",
    documentNumber: "12345678901",
    email: "maria@exemplo.com",
    phone: "44999999999",
  },
]);

const conferencia = await api.revalidate(checkoutId, ida.price.total);
if (conferencia.status === "PRICE_CHANGED") {
  // mostrar o novo valor ao cliente antes de cobrar
}

const formas = await api.getPaymentMethods(checkoutId);

const pix = await api.createPix(
  checkoutId,
  {
    amount: ida.price.total,
    payer: { name: "Maria Souza", documentNumber: "12345678901", email: "maria@exemplo.com" },
  },
  `pix-${pedidoLocal}`,
);

// exiba pix.qrCode (copia-e-cola) e <img src={pix.qrCodeImage} />; acompanhe por webhook
const situacao = await api.getPayment(pix.paymentId);

// pagamento com cartão (quando formas.pixOnly === false)
const cartao = await api.createCardToken(checkoutId, {
  holderName: "MARIA SOUZA",
  number: "5555444433332222",
  cvv: "123",
  expirationMonth: "12",
  expirationYear: "2029",
  documentNumber: "12345678901",
});

const parcelas = await api.getInstallments(checkoutId, {
  amount: ida.price.total,
  cardToken: cartao.cardToken,
  cardKey: cartao.cardKey,
});
```

---

## 12. Arquivos entregues à Sky Hub

- `docs/SKYHUB_INTEGRATION.md` (este arquivo)
- `docs/openapi.yaml`
- `docs/ViaAir-Internal-API.postman_collection.json`
- `docs/skyhub.env.example`
- SDK TypeScript: `src/lib/viaair-api-client/` (`index.ts` + `types.ts`)

Nenhum desses arquivos contém token real.
