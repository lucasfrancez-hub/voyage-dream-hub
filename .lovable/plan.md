# Catálogo Cativa (Viajando com Desconto) — importação automática

## O que descobri

O site `viajandocomdesconto.com` não é a fonte real dos dados: ele lê três planilhas públicas do Google (CSV, sem bloqueio):

- **Tradicionais/nacionais** — ~6.900 linhas (um card por origem)
- **Eventos/ingressos** — ~780 linhas
- **Internacionais** — ~3.400 linhas

Cada linha traz: nome do pacote, categoria, origem (IATA), destino, data da viagem, outras datas, aéreo "de/por", taxas, o que inclui, até N hotéis (valor, taxas, criança, regime, promoção), observação, data da cotação e **o link do orçamento na Infotravel** (`premium.infotravel.com.br/orcamento-web/pt/link?token=...`).

Esse link é exatamente o formato que o nosso importador Infotravel já lê hoje (`src/lib/quotes/infotravel-api.server.ts`), que devolve as **opções comerciais com voos completos** (cia, número, horários, conexões, bagagem), hotéis e valores. Ou seja: as opções de voo de cada pacote vêm por API, sem scraping frágil.

O site da Cativa (`cativaoperadora.com.br`) bloqueia acesso por IP de datacenter (403), então ele **não** será usado como fonte — só os "Grupos com Guia" apontam para lá, e esses ficam de fora nesta etapa (ver Fase 4).

## O que vou construir

### 1. Banco (novas tabelas `cativa_*`)
- `cativa_pacotes` — identidade estável do pacote. Chave = **fingerprint** de `fonte + categoria + nome_normalizado + origem + destino + data_viagem + token_infotravel`. Guarda também `source_row_key` (ID/linha da planilha, separado, só para rastreio), preço aéreo, taxas, hotéis (JSON), incluso, link do orçamento, `content_hash` (hash só dos campos comerciais), `status` (`ativo`, `esgotado`, `removido`), `primeira_vez_em`, `visto_em`, `voos_atualizado_em`.
- `cativa_pacote_voos` — opções de voo por pacote, vindas da Infotravel (trechos, cia, horários, conexões, bagagem, valor da opção).
- `cativa_pacote_historico` — cada mudança detectada (preço subiu/caiu, hotel saiu, token trocou, pacote esgotou), com valor anterior e novo.
- `cativa_import_runs` — execuções do robô (linhas lidas, novas, alteradas, chamadas Infotravel feitas/evitadas, erros, duração).
RLS: leitura pública apenas de pacotes `ativo` (para o site), escrita só via service role.

Assim, mudança de preço **não** cria pacote novo: atualiza a linha existente e gera histórico. Mesmo nome/origem/data com hotel ou orçamento diferente vira pacote distinto, porque o token da Infotravel entra na chave.

### 2. Importador (sincronização das planilhas)
`src/lib/cativa/*.server.ts`: baixa os 3 CSVs, normaliza (moeda BR, datas `dd/mm/aaaa`, IATA → cidade/UF, "outras datas", acentos/caixa no nome), calcula `fingerprint` + `content_hash` e faz **upsert com diff**:
- linha nova → insere como `ativo` e registra "novo";
- `content_hash` igual → só atualiza `visto_em` (nada mais é gravado);
- `content_hash` diferente → atualiza e grava no histórico exatamente o que mudou;
- fingerprint que sumiu da planilha → marca `esgotado`/`removido` (nunca apaga).

### 3. Enriquecimento com voos (Infotravel) — só quando necessário
São ~11.000 linhas; o robô **não** consulta a Infotravel para todas a cada rodada. A consulta só é agendada quando:
- o pacote é **novo**;
- o **token/link da Infotravel mudou**;
- mudou algum **dado comercial relevante** (preço aéreo, taxas, datas, hotéis) — nesse caso a reconsulta entra com prioridade baixa;
- o pacote está `ativo` e passou do prazo de revalidação (padrão 7 dias), para pegar voo que esgotou sem a planilha mudar.

Se nada disso ocorreu, zero requisições. A fila roda com concorrência limitada, prioriza novos > token trocado > dado alterado > revalidação por idade, e cada rodada tem teto de chamadas. Falha entra em retry com backoff e aparece no painel.

### 4. Robô contínuo
Endpoint `POST /api/public/cativa/sync` (protegido por segredo) chamado por cron:
- planilhas a cada 30 min (barato, detecta preço/esgotado rápido e alimenta a fila);
- fila de voos em lotes contínuos, respeitando o teto por rodada.


### 5. Painel admin `/admin/pacotes-cativa`
Lista com busca por origem/destino/categoria, status de cada pacote, preço atual vs anterior, quantidade de opções de voo, últimas execuções do robô, erros e botões "sincronizar agora" e "reprocessar voos deste pacote".

### 6. Publicação no nosso site
Os pacotes ativos alimentam a listagem pública de pacotes (com preço VIA AIR, seleção de origem, hotéis e escolha da opção de voo), reaproveitando os componentes de pacote já existentes.

## Fora do escopo agora
- "Grupos com Guia" (23) — dependem do site da Cativa, que bloqueia robôs; entram depois via Browserless se você quiser.
- Reserva/emissão automática: continua manual, isto é só catálogo e cotação.

## Ordem de entrega
1. Tabelas + importador das planilhas + primeira carga completa
2. Enriquecimento de voos via Infotravel
3. Cron contínuo + histórico de alterações
4. Painel admin
5. Vitrine pública no nosso site
