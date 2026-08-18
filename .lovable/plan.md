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
- `cativa_pacotes` — um registro por (pacote + origem + data), com preço aéreo, taxas, hotéis (JSON), incluso, categoria, link do orçamento, `fingerprint`, `status` (`ativo`, `esgotado`, `removido`), `primeira_vez_em`, `visto_em`.
- `cativa_pacote_voos` — opções de voo por pacote, vindas da Infotravel (trechos, cia, horários, conexões, bagagem, valor da opção).
- `cativa_pacote_historico` — cada mudança detectada (preço subiu/caiu, hotel saiu, pacote esgotou).
- `cativa_import_runs` — execuções do robô (contagens, erros, duração).
RLS: leitura pública apenas de pacotes `ativo` (para o site), escrita só via service role.

### 2. Importador (sincronização das planilhas)
`src/lib/cativa/*.server.ts`: baixa os 3 CSVs, normaliza (moeda BR, datas `dd/mm/aaaa`, IATA → cidade/UF, "outras datas"), gera fingerprint por linha e faz **upsert com diff**:
- linha nova → insere e registra "novo";
- linha alterada → atualiza e grava histórico do que mudou;
- linha que sumiu da planilha → marca `esgotado`/`removido` (nunca apaga).

### 3. Enriquecimento com voos (Infotravel)
Fila em segundo plano que, para cada link de orçamento, chama o importador Infotravel já existente e grava as opções de voo em `cativa_pacote_voos`. Reprocessa por prioridade (pacotes novos primeiro, depois os mais desatualizados), com limite de concorrência para não derrubar a fonte. Link que falhar entra em retry com backoff e fica visível no painel.

### 4. Robô contínuo
Endpoint `POST /api/public/cativa/sync` (protegido por segredo) chamado por cron:
- planilhas a cada 30 min (barato, detecta preço/esgotado rápido);
- voos Infotravel em lotes contínuos, cada pacote revalidado a cada ~12 h.

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
