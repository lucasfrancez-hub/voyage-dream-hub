# Motor único: Aéreo + Hotel em etapas, e novo motor de Carros

## O que muda para você

### 1. Aéreo + Hotel vira um fluxo em etapas (igual Comprar Viagem)
Hoje o modo "Aéreo + Hotel" mostra os dois motores um embaixo do outro. Vai passar a ser um passo a passo:

```text
[ Aéreo ]  ->  [ Hospedagem ]  ->  [ Revise seu pedido ]
 escolha         escolha             confirma e
 ida e volta     hotel + quarto      Fazer pedido
```

- Barra de etapas no topo, com selo "Em andamento" na etapa atual e botão "Editar" para voltar ao aéreo.
- Depois de escolher ida e volta, a barra mostra o resumo dos voos (trecho, horários, bagagem, direto/conexões) e o fluxo avança sozinho para a hospedagem.
- Na etapa de hospedagem entram os filtros laterais (estrelas, nome, preço, refeições) e, em cada hotel, a lista de quartos disponíveis com regime e política de cancelamento — dá para escolher o quarto (botão "Escolher outro quarto" / "Reservar essa opção").
- Etapa final "Revise seu pedido": voos + hotel + quarto, total do pacote, e o botão principal é **Fazer pedido** (não "colocar no carrinho"), aproveitando a integração de pedidos já existente.

### 2. Novo modo: Carros
Nova aba no motor de busca, ao lado de Aéreo / Hotel / Aéreo + Hotel:

- Busca por local de retirada e devolução (autocomplete), data e hora de retirada e de devolução.
- Resultado no mesmo padrão visual: foto do carro, categoria, locadora, preço total e preço por dia.
- Informações completas: lugares, malas, ar-condicionado, câmbio, quilometragem, cobertura/proteção incluída, local exato de retirada e devolução.
- "Ver todos os detalhes" abre um modal com cobertura completa, regras e termos.
- Filtros laterais: preço, categoria, transmissão, malas, quilometragem, ar-condicionado.

## Detalhes técnicos

- `src/routes/admin.buscar.tsx`: modo `combo` passa a controlar as fases (`aereo` -> `hotel` -> `revisao`) e um estado de carrinho local (voo ida, voo volta, hotel, tarifa de quarto). Nova aba `carro`.
- `src/routes/admin.voos-teste.tsx` e `admin.hoteis-teste.tsx`: ganham callback `onSelectionComplete` para devolver a escolha ao fluxo do combo; a seleção de quarto (`OnerRoomRate`, já retornada pelo motor de hotéis) passa a ser explícita no card.
- Novo `src/lib/onertravel-cars.functions.ts` + `onertravel-cars.server.ts`, seguindo o mesmo padrão dos hotéis (init de busca -> polling paginado -> normalização), com tipos em `onertravel.types.ts`.
- Nova página `src/routes/admin.carros.tsx` e componente de card/modal de detalhes do carro.
- Componente compartilhado `ComboSteps` para a barra de etapas e `OrderReview` para a revisão final.

## Observação
Os endpoints de carros da operadora ainda precisam ser mapeados (a mesma técnica usada em aéreo e hotel). Se algum campo não vier da API, ele aparece como indisponível em vez de valor inventado.
