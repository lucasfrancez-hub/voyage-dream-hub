# Cadastro de Cruzeiro — Formulário Dedicado

Hoje o cadastro de pacote é um só formulário desenhado pra pacote aéreo (voos, hotel, TripAdvisor…). Quando o `kind = cruise` a maior parte disso não faz sentido, e os campos que importam pra cruzeiro (cabines, adicionais, itinerário, navio, políticas) ficam escondidos ou não têm UI. Vamos separar.

## O que muda pro usuário

Ao criar/editar um cruzeiro, a tela abre num layout próprio, dividido em abas:

1. **Básico** — Título, destino (região: Caribe, Mediterrâneo…), porto de embarque, datas ida/volta, noites, operadora (FRT, MSC, Costa…), imagem de capa, resumo, ativo/inativo.
2. **Navio** — Nome, companhia, galeria de fotos, plano de decks, vídeos, atrações (com foto), ficha técnica (comprimento, tonelagem, passageiros, cabines, ano, bandeira…).
3. **Cabines** — Lista de categorias (interna, externa, varanda, suíte). Cada linha: nome, código, tamanho, capacidade, fotos, preços por ocupação (2/3/4 pessoas + criança), taxas portuárias. Botão "Adicionar cabine".
4. **Experiências & Adicionais** — Dois blocos:
   - Experiências (pacotes fechados tipo Free at Sea, Bella, Fantastica) com benefícios e delta por pessoa.
   - Adicionais opcionais (bebidas, wifi, gorjetas, transfer, seguro, excursões) com preço + unidade (por pessoa / cabine / dia).
5. **Itinerário** — Timeline dia-a-dia: dia, data, porto, país, chegada, partida, descrição, foto. Botão "Adicionar dia". Campo pra URL do mapa da rota.
6. **Inclui / Não Inclui / Políticas** — Duas listas em bullet + editores de texto para pagamento, cancelamento, embarque, documentos, política de crianças, outros.
7. **Importar da FRT** (opcional, no topo) — Botão que abre o importador atual (URL + cookie) e preenche todas as abas de uma vez. Continua funcionando pra quem quer atalho.

O botão de salvar fica fixo no rodapé, valida os obrigatórios (título, datas, porto, preço a partir de) e grava em `packages` + `packages.cruise_details`.

## Fora do formulário de cruzeiro

O formulário atual (aéreos ida/volta, TripAdvisor, tipo de quarto, meal plan, addons de pacote) **continua igual** pra `kind = package` e `service`. Nada muda pra pacotes aéreos.

## Detalhes técnicos

- **Novo componente**: `src/components/admin/CruisePackageForm.tsx` — organiza as 7 abas usando `Tabs` do shadcn e sub-componentes (`CabinCategoryEditor`, `ExperienceEditor`, `AddonEditor`, `ItineraryDayEditor`, `ShipEditor`). Reaproveita `cruiseDetailsSchema` de `src/lib/packages/cruise.ts` pra validar via `react-hook-form` + `zodResolver`.
- **Roteamento no admin**: em `src/routes/admin.pacotes.tsx`, quando o pacote em edição tem `kind === "cruise"` (ou foi criado pelo botão "+ Cruzeiro"), renderiza `CruisePackageForm` no lugar do `PackageForm` atual. O `PackageForm` existente permanece intocado.
- **Importador FRT**: `NewCruiseImportDialog` passa a abrir o `CruisePackageForm` já preenchido em vez do form legado. Também vira um botão dentro do `CruisePackageForm` ("Importar da FRT") pra puxar/atualizar dados de uma URL sem sair da tela.
- **Persistência**: usa a mesma `saveOrder`/`upsert` de `packages` já existente. `cruise_details` continua sendo `jsonb`. Campos irrelevantes (ex: `outbound_flight`, `tripadvisor_*`) ficam `null` pra cruzeiros.
- **Preview**: sem mudança em `CruiseDetailsView.tsx` — ele já consome esse schema.

## Fora do escopo (não muda agora)

- Página pública `/cruzeiros` e `/pacotes/$slug` do cruzeiro (já refeitas antes).
- Extração via IA (`cruise-import.server.ts`) — mantém o que já foi ajustado nas últimas rodadas.
- Fluxo de checkout e mini-checkout do cruzeiro.
