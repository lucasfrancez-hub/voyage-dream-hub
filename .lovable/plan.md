## Objetivo

Adicionar ao pedido dois botões — **Orçamento (PDF)** e **Copiar link do orçamento** — que geram uma peça bonita, moderna, mostrando aéreo + hotel + serviços, **totais sem comissão**, com uma seção de **condições de pagamento** configuráveis pelo agente (Pix com desconto, cartão em X vezes).

---

## 1. Botões no pedido

Em `src/routes/admin.pedidos.$id.tsx`, ao lado dos botões atuais de Voucher/Contrato:

- **Orçamento PDF** — gera e baixa PDF
- **Link do orçamento** — abre modal com: link público, botão copiar, botão WhatsApp e o painel de **condições de pagamento** (abaixo)

Ambos usam a mesma configuração salva no pedido (novo campo JSONB `quote_config`), pra PDF e web mostrarem o mesmo conteúdo.

## 2. Configuração de pagamento do orçamento

Modal com formulário:

- ☑ Aceita **Pix** — desconto % (default 5%)
- ☑ Aceita **Cartão de crédito** — parcelamento máximo (default 10x), campo "juros a partir de N vezes" (opcional, ex.: a partir de 4x com juros)
- ☑ Aceita **Boleto** — parcelamento máximo (default 1x)
- Campo livre "Observações do orçamento" (validade, políticas)
- Campo "Validade do orçamento" (data)

Salva em `orders.quote_config` (jsonb). Se nunca configurado, usa defaults.

## 3. Rota pública `/orcamento/$token`

Novo arquivo `src/routes/orcamento.$token.tsx` — público, sem auth.

Token opaco: `base64url(orderId) + "." + hmacSha256(orderId, QUOTE_LINK_SECRET).slice(0,16)`. Não adivinhável, não expira, não precisa de nova tabela.

Layout inspirado no exemplo da FRT/Infotravel:

```text
┌─────────────────────────────────────────────────┐
│ [logo Via Air]        Início Serviço Resumo     │
│                       Valores  Pagamento Contato│
├─────────────────────────────────────────────────┤
│ Orçamento — Nº 12345678                         │
│ Válido até 20/07/2026                           │
│ *Reservas ainda não efetivadas                  │
│                                                 │
│ ── Serviço ──                                   │
│  ✈  Ida  GRU → GIG  15/08 08:00                │
│      Latam LA3200 — 2 adultos                   │
│  ✈  Volta GIG → GRU 22/08 18:30                │
│  🏨 Hotel Fasano — 7 noites, café da manhã     │
│  🎫 City tour Rio                               │
│                                                 │
│ ── Resumo ──                                    │
│  2 adultos · 15/08 → 22/08 · 7 noites          │
│                                                 │
│ ── Valores ──                                   │
│  Total: R$ 8.500,00                             │
│                                                 │
│ ── Formas de pagamento ──                       │
│  Pix (5% desc)     R$ 8.075,00                  │
│  Cartão à vista    R$ 8.500,00                  │
│  2x sem juros      R$ 4.250,00                  │
│  ...                                            │
│  10x sem juros     R$   850,00                  │
│                                                 │
│ ── Contato ──                                   │
│  WhatsApp / e-mail da agência                   │
└─────────────────────────────────────────────────┘
```

Loader usa server function pública `getPublicQuote({ token })` que valida o HMAC e carrega com `supabaseAdmin`, retornando DTO **sanitizado**:
- ✅ itens (título, rota, datas, hotel, noites)
- ✅ total, quote_config
- ✅ nº do pedido, nome do cliente
- ❌ comissão, custo, markup, valores líquidos, cartão, CPF completo

Head da rota: `noindex`.

## 4. PDF do orçamento

Novo `src/lib/quote-pdf.ts`, mesmo padrão de `voucher-pdf.ts`, com o **mesmo conteúdo e layout** da página web (aéreo, hotel, serviços, total, formas de pagamento).

## 5. Segurança

- RLS continua fechado. A única forma de leitura pública é via server function que exige token HMAC válido.
- Secret `QUOTE_LINK_SECRET` gerado automaticamente (32 bytes).
- DTO nunca projeta colunas de custo/comissão nem cartão/CPF.
- Página tem `robots: noindex`.

---

## Fora do escopo

- Botão **"Pagar agora"** dentro do orçamento (o FRT tem `shouldShowPay=true`). Se você quiser depois, dá pra gerar direto o link de pagamento a partir do orçamento.
- Envio automático por e-mail. Fica pra quando você configurar os templates transacionais.

Confirma que sigo?