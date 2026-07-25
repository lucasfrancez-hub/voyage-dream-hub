## O que vai mudar

### 1. Classificar cada registro por tipo
Adiciono uma coluna `kind` na tabela `packages` com três valores:
- `package` — pacote completo (o que já existe)
- `service` — serviço/ingresso (Rock in Rio, transfers, etc.), pode ter hotel opcional
- `cruise` — cruzeiro

Migração: adiciona a coluna com default `package`, backfill em todos os registros atuais como `package`.

### 2. Botão "+" no admin de pacotes
O botão + vira um menu dropdown com três opções:
- **Pacote** (fluxo atual, aéreo + hotel)
- **Serviço / Ingresso** (destino como cidade/evento, imagem, preço, descrição, hotel opcional, transfers/ingressos via `services`; sem aéreo obrigatório)
- **Cruzeiro** (navio, cabine, porto embarque/desembarque, noites — reaproveita `hotel_name`/`destination` como navio/porto por enquanto, com rótulos ajustados no formulário)

Cada opção abre o mesmo `PackageEditor` com o `kind` já definido e campos irrelevantes ocultos.

### 3. Filtro por tipo na listagem admin
Na lista `/admin/pacotes`, adiciono abas rápidas: **Pacotes** · **Ingressos** · **Cruzeiros**. Cada aba filtra por `kind`.

### 4. Duas páginas públicas novas, bem-feitas

**`/ingressos`** — vitrine exclusiva de serviços/ingressos
- Layout tipo grid de cards, hero destacando "Ingressos e experiências"
- Cada card: imagem grande, título do evento/serviço, cidade, data, "a partir de R$ X", botão "Reservar"
- Clique leva para `/pacotes/[slug]` (fluxo de checkout já existe e funciona com qualquer pacote)

**`/cruzeiros`** — vitrine exclusiva de cruzeiros
- Layout mais imersivo (foto grande do navio, chips com noites/porto/cabine)
- Cards: imagem do navio, nome do cruzeiro, porto de embarque → desembarque, noites a bordo, "a partir de R$ X"
- Clique leva para `/pacotes/[slug]`

Ambas com `head()` próprio (title/description/og) e responsivas.

### 5. Página `/pacotes` continua igual
Mostra apenas `kind = 'package'`. Ingressos e cruzeiros saem daqui e ganham suas próprias vitrines. O carrossel embed e a busca da IA (Camila) continuam considerando só pacotes por enquanto — se depois quiser incluir, é fácil.

### 6. Menu de navegação
No header público adiciono links **Pacotes · Ingressos · Cruzeiros** para os clientes acharem as novas páginas.

## Detalhes técnicos

- Reuso `packages` (não crio tabelas novas) — mais simples de manter, e o checkout/pedido já funciona
- Campos escondidos por tipo no editor:
  - `service`: some aéreo obrigatório e categoria de quarto; mantém hotel opcional
  - `cruise`: rótulos de "hotel" viram "navio/cabine", "destino" vira "porto"
- Vitrines novas usam o mesmo query hook, filtrando por `kind` no lado do cliente
- Slugs continuam únicos entre todos os tipos

## O que fica fora deste passo (podemos fazer depois se quiser)
- Widget embed separado para ingressos/cruzeiros no WordPress
- Broadcast/IA reconhecer ingressos e cruzeiros como categoria diferente
- Campos 100% dedicados a cruzeiro (companhia marítima, itinerário porto a porto por dia)
