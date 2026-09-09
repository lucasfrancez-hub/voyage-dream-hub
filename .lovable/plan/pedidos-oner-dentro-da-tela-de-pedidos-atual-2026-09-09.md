# Pedidos Oner dentro da tela de Pedidos atual

O pedido da VIA AIR passa a ser o registro único e permanente. A Oner vira apenas o fornecedor vinculado a ele. Nada de central nova, aba nova ou pedido duplicado.

## O que muda para quem usa

**Pedido que não é Oner** — tela exatamente como hoje, sem nenhuma diferença.

**Pedido Oner no cartão** — dentro do pedido aparece um bloco "Integração Oner" só informativo: carrinho, pedido F-…, venda, localizador, bilhetes, última sincronização e valores. Sem botões de comissão, sem preparação manual, sem autorizar pagamento. A comissão original nunca é zerada.

**Pedido Oner no Pix** — o mesmo bloco ganha as ações da equipe: registrar o carrinho operacional, marcar comissão zerada, informar valor líquido, registrar o Pix da Oner e, quando tudo estiver pronto, o botão **Autorizar pagamento**.

## Pedido criado antes da emissão

Assim que o cliente entra no fluxo de compra, o pedido VIA AIR já nasce com trechos, aeroportos, datas, horários, voos, companhia, conexões, bagagem, tarifa, passageiros, valor vendido e forma de pagamento. O que a Oner devolver depois apenas complementa esse mesmo pedido.

Quando o Pix do cliente é confirmado, o pedido passa a mostrar "Pagamento recebido — confirmando sua reserva", já com todos os dados da viagem visíveis.

## Valores separados

- Valor do cliente (o que aparece no pedido, sempre): ex. R$ 989,77
- Valor original da Oner
- Valor líquido a pagar à Oner: ex. R$ 920,49
- Margem VIA AIR: ex. R$ 69,28

O total do cliente nunca é substituído pelo líquido da Oner.

## Histórico de carrinhos

Um mesmo pedido pode usar mais de um carrinho na Oner (o original e outro recriado para zerar a comissão no Pix). Todos ficam guardados com finalidade e data — nada é sobrescrito — e o cliente continua vendo um pedido só.

## Autorizar pagamento

O botão só aparece no Pix e só habilita quando: Pix do cliente confirmado, carrinho operacional informado, comissão zerada, valor líquido confirmado, cobrança da Oner válida e não vencida, e fornecedor ainda não pago.

Ao clicar, abre uma confirmação dentro do próprio pedido mostrando pedido VIA AIR, carrinho Oner, recebido do cliente, valor a pagar e margem, com "Cancelar" e "Autorizar pagamento". O pagamento usa a integração bancária já existente, com trava contra duplicidade: em caso de tempo esgotado, o sistema consulta o status da transação anterior em vez de pagar de novo.

Depois: "Processando pagamento" → "Fornecedor pago ✓" → sincronização da reserva.

## Linha do tempo

No bloco Integração Oner, o histórico da operação em ordem: cotação original → Pix do cliente recebido → novo carrinho → comissão zerada → Pix Oner gerado → aguardando autorização → pagamento autorizado → fornecedor pago → pedido F-… → venda → localizador → bilhetes → concluído.

## Detalhes técnicos

1. **Banco** — nova tabela `provider_attempts` (`viaair_order_id`, `provider`, `cart_id`, `purpose` em `ORIGINAL_QUOTE | CARD_CHECKOUT | PIX_REBOOK`, `status`, timestamps) com GRANTs e RLS. Em `integration_orders`: `original_cart_id`, `fulfillment_cart_id`, `customer_total`, `provider_original_total`, `viaair_margin`, `commission_final`, `provider_pix_expires_at`, `provider_payment_authorized_at/by`, `provider_payment_reference`.

2. **Estados** — ampliar a máquina em `config.ts` com `PAYMENT_RECEIVED`, `ONER_MANUAL_PREPARATION`, `ONER_CART_READY`, `ONER_COMMISSION_ZEROED`, `ONER_PIX_READY`, `PROVIDER_PAYMENT_AUTHORIZATION_REQUIRED`, `PROVIDER_PAYMENT_PROCESSING`, `PROVIDER_PAID`, `ONER_ORDER_FOUND`, `ONER_SALE_FOUND`, `ONER_BOOKING_SYNCING`, `BOOKING_CONFIRMED`, `TICKETS_RECEIVED`, `COMPLETE`, `MANUAL_REVIEW`. Estados internos da integração; o status visual do pedido continua o atual.

3. **Criação antecipada** — server fn que cria/atualiza o pedido VIA AIR (`orders` + `order_items` + `order_passengers`) com voos/horários/bagagem/tarifa no início do checkout e cria a linha `integration_orders` com `payment_method` CARD/PIX e `ORIGINAL_QUOTE` em `provider_attempts`.

4. **Webhook Pix do cliente** — ao confirmar recebimento, marca `PAYMENT_RECEIVED` e, no caso Oner+PIX, `ONER_MANUAL_PREPARATION`.

5. **Autorização** — server fn com middleware autenticado que revalida todas as condições no servidor (não confia na UI), grava chave de idempotência antes de chamar o banco, e em timeout consulta a transação anterior pelo identificador salvo. Transições `PROVIDER_PAYMENT_PROCESSING` → `PROVIDER_PAID`.

6. **UI** — novo `src/components/admin/OnerOrderSection.tsx` renderizado condicionalmente dentro de `src/routes/admin.pedidos.$id.tsx` quando existe `integration_orders` com `provider = ONER`; variantes cartão (informativa) e Pix (operacional + timeline + autorização). O painel `admin.oner.tsx` deixa de ser central operacional: vira apenas lista/monitor com link para o pedido, e `OnerPixManual` é aposentado ou reduzido a atalho.

7. **Cartão** — `garantirComissaoPreservada()` passa a ser chamada em todo caminho automatizado de cartão em `checkout.server.ts`, bloqueando qualquer operação com comissão zerada.
