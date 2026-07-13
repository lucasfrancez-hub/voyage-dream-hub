# Banco de Cadastro de Pessoas

Objetivo: ter um cadastro único (PF + PJ) que serve como fonte de clientes e passageiros, com importação em massa e reaproveitamento em pedidos manuais.

Como você disse "por enquanto, manter o banco de cadastro pronto", entrego em **3 fases**. Faço a Fase 1 agora; as outras entram nos próximos turnos, quando quiser.

---

## Fase 1 — Cadastro + tela de gestão (agora)

**Nova tabela `public.people`** com todos os campos do Monde:

- Identificação: `kind` (PF/PJ), `code` (nº sequencial), `name`, `legal_name` (razão social PJ), `gender`, `birth_date`/`foundation_date`
- Documentos: `cpf`, `cnpj`, `rg`, `passport_number`, `passport_expiration`, `state_registration`, `municipal_registration`
- Contato: `email`, `phone`, `mobile_phone`, `business_phone`, `website`
- Endereço: `zip`, `address`, `number`, `complement`, `district`, `city`, `state`, `country`, `is_foreign`
- Extras: `notes`, `seller_name`, `charge_boleto_fee`, `monde_id` (para dedupe na importação), `created_by`, `created_by_name`

**Nova tabela `public.people_cards`** para "Dados Financeiros":
- `person_id`, `nickname`, `holder_name`, `brand`, `last4`, `expiry`, `is_travel_card`
- `number_ciphertext` (número completo cifrado com AES-256-GCM usando um segredo do servidor — a UI só mostra `**** 1234` por padrão, e apenas o próprio painel logado consegue revelar via server fn)

**Nova rota `/admin/pessoas`:**
- Lista com busca (nome, CPF/CNPJ, e-mail, telefone) e filtro PF/PJ
- Botão "Novo cadastro" com abas espelhando o Monde: Detalhes, Endereço, Documentos, Dados Financeiros (cartões), Observações
- Edição inline por pessoa; botão "Ver cartões" mostra mascarado + ação "Revelar" (com confirm) que chama server fn
- Card no /admin dashboard: "Pessoas cadastradas" com contador e atalho

**Server fns** (`src/lib/people.functions.ts`): `listPeople`, `getPerson`, `upsertPerson`, `deletePerson`, `addPersonCard`, `deletePersonCard`, `revealPersonCardNumber`.

**Cripto de cartão**: helper `src/lib/card-crypto.server.ts` usando `PEOPLE_CARD_ENC_KEY` (gero via `generate_secret`, 64 chars base64).

---

## Fase 2 — Importação de planilha (próximo turno)

- Tela `/admin/pessoas/importar`: upload de `.xlsx`/`.csv` exportado do Monde
- Preview das primeiras 20 linhas com mapeamento automático de colunas (nome → name, CPF → cpf etc.) e opção de ajustar
- Dedupe por CPF/CNPJ/monde_id (atualiza em vez de duplicar)
- Relatório final: X criados, Y atualizados, Z ignorados
- Você me manda 1 export de exemplo pra eu travar o parser no formato exato

## Fase 3 — Uso em pedidos e passageiros (turno seguinte)

- No formulário de pedido manual e no cadastro de passageiros: campo com autocomplete "Buscar pessoa" (mesmo padrão do MondePersonSearchDialog, mas contra a base local)
- Ao escolher, preenche todos os campos automaticamente e vincula `person_id` no `order_passengers`/`orders`
- Aba futura "Importar vendas do dia" a partir de export — mapeamento definido depois de ver o formato

---

## Detalhes técnicos

**Banco (Fase 1):**
- Migration cria `people` e `people_cards`, com `GRANT` para `authenticated`/`service_role`, RLS habilitado, políticas exigindo `has_role(auth.uid(),'admin') OR has_role(auth.uid(),'user')` (qualquer usuário interno logado pode gerenciar — nada de acesso `anon`).
- Índices: `people(cpf)`, `people(cnpj)`, `people(monde_id)`, `people(lower(name))`, `people(lower(email))`.
- Trigger `set_updated_at` nas duas tabelas.
- Sequência para `code` (auto-incremento visível ao usuário).

**Cripto de cartão:**
- AES-256-GCM, mesmo padrão do `connectionKeyCrypto` já usado no template.
- `PEOPLE_CARD_ENC_KEY` gerado via `secrets--generate_secret` (nunca exposto ao cliente).
- Coluna `number_ciphertext text NOT NULL`. Nunca retornar em listagens — só via `revealPersonCardNumber` que exige admin logado e loga o acesso em `audit` (opcional na Fase 1, obrigatório se você quiser).

**Segurança do "revelar cartão":**
Guardar número completo de cartão tem risco PCI mesmo cifrado. Vou implementar como você pediu, mas recomendo em produção usar tokenização do gateway (Pagar.me/Stripe) em vez de armazenar PAN. Podemos migrar depois.

**Arquivos novos:**
- `supabase/migrations/…_people.sql`
- `src/lib/people.functions.ts`
- `src/lib/card-crypto.server.ts`
- `src/routes/admin.pessoas.tsx` (lista)
- `src/routes/admin.pessoas.$id.tsx` (form completo)
- Atualização em `src/routes/admin.tsx` e `src/routes/admin.dashboard.tsx` pro card/atalho

**Fora do escopo desta fase:** importação de planilha, autocomplete em pedidos, importação de vendas.

Confirma que posso tocar a Fase 1 assim?
