
## O que muda

Hoje todo passageiro cadastrado no pedido aparece automaticamente em todos os serviços (aéreo, hospedagem, outros) — sem opção de desvincular de um serviço específico. A ideia é manter o vínculo automático na criação, mas permitir remover o passageiro de um serviço sem afetar os outros.

## Como vai funcionar

- Ao adicionar um passageiro no pedido, ele é vinculado automaticamente a todos os serviços que já existem (aéreo, hospedagem e outros).
- Ao adicionar um novo serviço, todos os passageiros do pedido são vinculados a ele automaticamente.
- Em cada card de serviço, cada passageiro terá um botãozinho de remover que o desvincula apenas daquele serviço. Não apaga o passageiro do pedido nem afeta outros serviços.
- Também terá um botão "Adicionar passageiro" no card do serviço, listando os passageiros do pedido que ainda não estão vinculados àquele serviço específico.
- No PDF de recibo/contrato, cada serviço passa a listar somente os passageiros efetivamente vinculados a ele.

## Detalhes técnicos

1. Nova tabela `order_item_passengers`:
   - `order_item_id` (FK → order_items, ON DELETE CASCADE)
   - `passenger_id` (FK → order_passengers, ON DELETE CASCADE)
   - `order_id` (para RLS/consulta rápida)
   - UNIQUE(order_item_id, passenger_id)
   - RLS: admin faz tudo; dono do pedido lê.
   - GRANTs para `authenticated` e `service_role`.

2. Backfill: para pedidos existentes, criar links entre todos os itens e todos os passageiros do mesmo pedido.

3. Trigger `AFTER INSERT` em `order_items` e `order_passengers` para autolinkar contrapartes existentes no mesmo pedido (mantém o comportamento "novo passageiro/serviço entra atrelado a tudo").

4. Ajustes em `src/lib/orders.functions.ts`: expor `passenger_ids` em cada `order_item` no `getOrderDetail`, e criar/expor server functions `linkPassengerToItem` / `unlinkPassengerFromItem`.

5. UI em `src/routes/admin.pedidos.$id.tsx`:
   - `FlightGroupCard`, `HotelCard` e `OtherCard` recebem lista filtrada de passageiros e mostram botão "×" em cada nome para desvincular.
   - Botão "+ Passageiro" em cada card com dropdown dos passageiros ainda não vinculados.

6. `src/lib/contract-pdf.ts`: passar a filtrar passageiros por item usando os links, em vez de repetir todos.
