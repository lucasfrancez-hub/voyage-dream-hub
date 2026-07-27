
# Repaginação da página de cruzeiros

Reformar a tela do cruzeiro individual (`/pacotes/$slug` quando `kind = "cruise"`) para o formato dinâmico do BWT/Krooze: seleção de cabine + adicionais + mini-checkout ao vivo, com modal "Ver mais" (Itinerário, Cabines, O Navio, Deck Plan, Fotos, Vídeos, Ficha técnica) e pagamento Pix Itaú/orçamento já plugado.

## O que muda pro usuário

1. Página do cruzeiro reorganizada em 3 colunas no desktop:
   - **Coluna esquerda**: seletor por tipo (Interna / Externa / Varanda / Suíte) + galeria de cabines daquele tipo.
   - **Coluna central**: bloco "Escolha uma experiência" (Free at Sea / Free at Sea Plus / Sem promoção) e adicionais opcionais.
   - **Coluna direita (sticky)**: mini-checkout ao vivo — mostra cabine, ocupação (2 ad / 3 ad / 4 ad + criança), valores por passageiro, taxas, total, "você economiza". Nada precisa ser clicado pra aparecer.
2. Botão discreto **"Ver mais"** no topo do bloco do navio abre um modal em tela cheia com abas laterais: Itinerário (mapa + timeline de portos), O Navio, Atrações, Cabines (galeria completa com fotos, m², capacidade, texto), Deck Plan, Fotos, Vídeos, Ficha técnica.
3. Botão final do mini-checkout: **"Realizar pagamento"** (Pix Itaú com QR ao vivo, igual ingressos/pacotes) e **"Incluir no orçamento"** (dispara e-mail interno).
4. Mobile: colunas empilham, mini-checkout vira barra fixa no rodapé com "ver detalhes" que expande.

## Cadastro (mínimo necessário pra funcionar)

O cadastro completo de cabines fica pra próxima leva. Nesta versão, no admin de pacotes (quando `kind = "cruise"`) libero um editor JSON estruturado (ou form simples) para preencher:

- `cabin_categories[]`: `{ id, type: interna|externa|varanda|suite, code, name, description, size_m2, capacity, photos[], categories_code[], pricing: { occ2: {per_person, third?, fourth?, child?}, occ3: {...}, occ4: {...} }, taxes_total, upgrade_from_base? }`
- `experiences[]`: `{ id, name, description, benefits[], required_choices?, delta_per_person? }`
- `ship`: `{ name, line, deck_plan_image, gallery[], videos[], data_sheet[] }`
- `itinerary[]`: `{ day, date, port, country, arrival?, departure?, description?, photos[], activities[] }`

Preços já vêm em BRL com taxas separadas. O mini-checkout usa: `total = per_person × occ + child_price × children + taxes_total + soma(experiências)`.

## Fluxo de pagamento

- **Pix**: reaproveita `src/lib/pix.functions.ts` + overlay `PixQrOverlay` que já usamos em `/pacotes/$slug/checkout`.
- **Orçamento**: reaproveita `notifyPix`/template interno para disparar e-mail admin com cabine, ocupação e adicionais selecionados.

## Arquivos afetados

```text
src/routes/pacotes.$slug.index.tsx          alt. quando kind=cruise, renderiza <CruiseDetailsView/>
src/components/cruise/CruiseDetailsView.tsx novo, layout 3 colunas + mini-checkout
src/components/cruise/CabinPicker.tsx       novo, tabs de tipo + grid de cabines
src/components/cruise/ExperiencePicker.tsx  novo, Free at Sea / Plus / sem promoção
src/components/cruise/MiniCheckout.tsx      novo, sticky com Pix + orçamento
src/components/cruise/CruiseMoreModal.tsx   novo, modal "Ver mais" com abas laterais
src/components/cruise/tabs/*.tsx            novo, Itinerary/Cabins/Ship/Attractions/Deck/Photos/Videos/DataSheet
src/lib/packages/cruise.ts                  novo, tipos + helpers de preço
src/routes/admin.pacotes.tsx                alt. quando kind=cruise, mostra editor JSON com validação Zod
supabase/migrations/*_cruise_details.sql    novo, coluna packages.cruise_details jsonb
```

## Passos técnicos

1. Migração: `alter table packages add column cruise_details jsonb default '{}'::jsonb`. Grants já herdam.
2. Tipos e Zod em `src/lib/packages/cruise.ts` cobrindo `cabin_categories`, `experiences`, `ship`, `itinerary`.
3. Componentes novos em `src/components/cruise/` (Tailwind, tokens semânticos, ícones lucide). Sem libs extras.
4. Roteamento: `pacotes.$slug.index.tsx` continua o mesmo, só delega renderização pra `<CruiseDetailsView>` quando `kind === "cruise"`.
5. Mini-checkout dispara Pix via `createPixCharge` já existente e reusa `PixQrOverlay`. "Incluir no orçamento" chama `sendInternal` com template novo `orcamento-cruzeiro-admin.tsx`.
6. Admin: aba nova "Detalhes do cruzeiro" só aparece quando `kind = "cruise"`, editor JSON com preview e validação. Sem quebrar cadastro de pacotes/ingressos.
7. SEO: `head()` do cruzeiro puxa `og:image` da primeira foto do navio.

## Regras de negócio importantes

- Criança sempre reduzida — se `pricing.occ2.child` não estiver preenchido, esconde o seletor de crianças.
- 3º/4º hóspede: se cabine não suporta, desabilita a opção e mostra tooltip.
- Free at Sea Plus soma delta por pessoa se preenchido.
- Boleto NÃO aparece em cruzeiro (regra atual: só Pix pra serviços). Cartão pode aparecer em passo seguinte se você quiser depois.
- Total exibido: `entrada + 12x sem juros` (mesma fórmula usada nos pacotes).

## O que fica de fora nesta leva

- Editor visual arrastar-e-soltar das cabines no admin (agora só JSON validado).
- Sincronização automática com Krooze/BWT (é manual, você cola os dados).
- Bloqueio de datas por cabine (todas as cabines usam a data única do cruzeiro).

## Verificação antes de fechar

- Build passa.
- `/cruzeiros` continua listando normal.
- Cruzeiro sem `cruise_details` cai no layout antigo (fallback), pra não quebrar os já cadastrados.
- Pagamento Pix abre QR ao vivo e webhook Itaú confirma.
