## Objetivo

Separar pedidos criados por **agências parceiras** (ex.: Zonet Viagens) dos seus pedidos próprios. O parceiro entra com o e-mail dele, cria/gerencia só os pedidos dele. Você (admin) vê tudo, mas dividido em duas abas.

## 1. Modelo de dados

Migration:

- Nova role `partner` no enum `app_role`.
- Nova tabela `public.partner_agencies` — 1 linha por parceiro:
  - `user_id` (FK `auth.users`, único)
  - `agency_name`, `agency_email`, `agency_phone`, `agency_cnpj`
  - `logo_url`, `brand_primary`, `brand_secondary` (cores do voucher — preenche depois)
- Coluna nova em `public.orders`:
  - `owner_user_id uuid` (quem "dono" do pedido — parceiro ou você).
  - Backfill: todos os pedidos existentes → seu user_id.
  - Trigger `BEFORE INSERT`: se `owner_user_id` for null, usa `auth.uid()`.

## 2. Regras de acesso (RLS)

- **Admin** (você): vê e mexe em todos.
- **Partner**: vê/mexe **apenas** onde `orders.owner_user_id = auth.uid()` (e mesmos filtros propagados para `order_items`, `order_passengers`, docs etc. via join com o pedido dono).
- Sem role → sem acesso (como já é hoje).

As checagens em `orders.functions.ts` ganham um branch: se `partner`, força `owner_user_id = userId` em toda leitura/escrita; se `admin`, mantém o comportamento atual.

## 3. Navegação (dropdown "Pedidos")

Igual ao Dashboard: um `PedidosNav` com setinha e duas opções:

```
Pedidos ▾
 ├─ Meus pedidos          → /admin/pedidos          (filtro: owner = você)
 └─ Pedidos de terceiro   → /admin/pedidos/terceiros (filtro: owner ≠ você)
```

- Parceiro logado: dropdown some, vira link simples "Meus pedidos" apontando para `/admin/pedidos` (que já traz só os dele por RLS).
- Você: `/admin/pedidos` mostra só os seus; `/admin/pedidos/terceiros` mostra os dos parceiros com uma coluna extra "Agência" (nome do parceiro dono).

## 4. Voucher com marca da agência parceira

Só o encanamento nesta etapa (sem trocar cores ainda):

- `voucher-pdf` recebe os dados de agência do dono do pedido: se `owner_user_id` for um parceiro, carrega `partner_agencies` daquele user e usa `agency_name/email/phone/logo/cores` no lugar dos dados fixos da Via Air.
- Se for você, mantém Via Air como hoje.

Depois você me manda os dados/cores da Zonet e eu ajusto os tokens de cor + logo do PDF.

## 5. Fluxo pra cadastrar o parceiro

Depois que a migration rodar, você me passa o e-mail da conta dele e:

1. Crio/atribuo a role `partner` para aquele `user_id`.
2. Insiro a linha em `partner_agencies` com nome "Zonet Viagens" + contatos (branding fica em branco até você mandar).
3. Ele loga → só enxerga os pedidos dele; do seu lado eles aparecem em "Pedidos de terceiro".

## Fora do escopo (fica pra depois)

- Cores/logo/CNPJ definitivos da Zonet — você me manda e eu troco.
- Convite automático por e-mail para o parceiro.
- Relatório financeiro consolidado misturando os dois grupos.

## Confirmação

Confirma que sigo com essa estrutura? Assim que aprovar a migration, já implemento a navegação, a rota `/admin/pedidos/terceiros` e o carregamento da marca no voucher.
