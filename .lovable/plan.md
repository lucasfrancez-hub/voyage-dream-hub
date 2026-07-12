
# Reforma da aba Pedidos — estilo FRT/Infotera

Vou entregar tudo em uma passada, mas o trabalho se divide naturalmente em 4 blocos que compartilham a mesma base de dados.

## 1. Banco de dados (nova estrutura)

Novas tabelas (todas com RLS: admin gerencia tudo; cliente vê só o próprio via e-mail no JWT):

- **`order_passengers`** — passageiros do pedido
  - `order_id`, `full_name`, `passenger_type` (ADT/CHD/INF), `birth_date`, `cpf`, `document`, `ticket_number`, `sort_order`
- **`order_items`** — itens do pedido (hospedagem, aéreo, cancelado, outro)
  - `order_id`, `kind` (`hotel` | `flight` | `other`), `status` (`confirmed` | `cancelled` | `pending`), `title`, `supplier_locator`, `sort_order`
  - Campos flexíveis por tipo em `details` JSONB (trechos do aéreo, quartos do hotel, datas, cias, números de voo…)
- **`order_item_financials`** — financeiro por item
  - `order_item_id`, `supplier_name`, `sale_value`, `commission_value`, `commission_pct`, `exchange_rate`, `due_date`, `total`, `notes`

Cada CREATE TABLE já com GRANT para `authenticated` + `service_role` e políticas RLS via `has_role(admin)` + acesso do próprio cliente pelo e-mail.

## 2. Server functions (`src/lib/orders.functions.ts`)

- `getOrderDetail({ id })` — pedido + passageiros + itens + financeiros num payload só
- `upsertPassenger`, `deletePassenger`
- `upsertOrderItem`, `deleteOrderItem` (aceita `kind` e `details` livre)
- `upsertItemFinancial`, `deleteItemFinancial`
- `cancelOrderItem({ id })` — muda status pra `cancelled` (vai pra aba Cancelados)

Todas com `requireSupabaseAuth` + checagem `has_role(admin)`.

## 3. Listagem `/admin/pedidos` (reformulada)

Layout estilo FRT:
- Barra de busca compacta no topo: **Id/Localizador**, **Tipo** (Passageiro/Contato/Localizador), **período** (Inclusão/Utilização), **Status**, **Tipo de produto**.
- Tabela densa: `Id` (últimos 6 do UUID) · `Contato` (nome/email/telefone) · `Unidade` (VIA AIR + atendente) · `Produto` (resumo dos itens) · `Tipo/Status` (badge) · `Total` · `Incluído por` (data + admin).
- Clique na linha → abre `/admin/pedidos/$id` (rota nova, em vez do modal atual).

## 4. Detalhe `/admin/pedidos/$id`

Cabeçalho fixo com: Id, Contato, Email, Telefone, Atendente, Status, Criação, Total.

Abas (shadcn `Tabs`):

1. **Hospedagem** — lista de itens `kind=hotel status!=cancelled`. Cada card: hotel, endereço, quarto, regime, check-in/out, noites, hóspedes. Botão "+ Adicionar hospedagem" abre form.
2. **Aéreo** — lista de itens `kind=flight status!=cancelled`. Cada card: localizador, trechos (origem/destino/nº voo/data/hora/cabine), passageiros do trecho com nº bilhete. Botão "+ Adicionar aéreo" com sub-form de trechos.
3. **Cancelados** — mesmos cards, mas filtrando `status=cancelled`. Em qualquer aba (Hosp/Aéreo) tem botão "Cancelar item" que move pra cá.
4. **Contrato** — lista de PDFs: contrato principal + **autorização de débito** (gerada automaticamente com os dados do pedido usando `authorization-pdf.ts` já existente). Status (Emitido/Anulado) + link de download.
5. **Financeiro** — tabela: fornecedor, venda, desconto, comissão a pagar (valor + %), câmbio, vencimento, total. Totais no rodapé (comissão total, à pagar). CRUD inline.

Passageiros: seção compartilhada acima das abas, sempre visível — lista simples com nome, tipo, nascimento, CPF, nº bilhete padrão. Cada item aéreo pode referenciar quais passageiros/tickets.

## 5. Detalhes técnicos

- Rotas novas: `src/routes/admin.pedidos.tsx` (lista, reformulada) + `src/routes/admin.pedidos.$id.tsx` (detalhe com abas).
- Tudo `_authenticated` implícito via layout admin já existente.
- Query com TanStack Query: `orderDetailQueryOptions(id)` + invalidations em cada mutation.
- Mantenho a compatibilidade com pedidos antigos (que só têm `package_snapshot`): se não houver `order_items`, gero um item derivado do snapshot ao abrir a tela pela primeira vez (opcional, só pra não parecer vazio).
- Autorização de débito no Contrato: reutiliza `authorization-pdf.ts` passando dados do pedido + passageiros.

## Ordem de execução

1. Migration com as 3 tabelas + policies + grants + triggers de `updated_at`.
2. `orders.functions.ts` com todas as server fns.
3. Rota de detalhe `admin.pedidos.$id.tsx` (cabeçalho + abas + CRUD).
4. Reformulação da rota `admin.pedidos.tsx` (nova listagem/filtros + link pra detalhe).
5. Ajuste no menu admin se necessário.

Como o escopo é grande, vou entregar em blocos: **começo aprovando a migration** (passo 1) e sigo direto com os passos 2–5 na sequência. Confirma que posso tocar assim?
