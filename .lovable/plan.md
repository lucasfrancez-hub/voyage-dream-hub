
# Robô de check-in automático — LATAM / GOL / AZUL

Robô que abre a página oficial "Minhas Viagens" da cia ~48h antes do voo, faz check-in usando localizador + sobrenome, baixa os cartões de embarque em PDF e manda pro passageiro por WhatsApp + e-mail. Sem login de conta — só fluxo público.

## Arquitetura

```text
pg_cron (a cada 5min)
    ↓
/api/public/hooks/checkin-scheduler  (TSS route)
    ↓ (pega jobs cujo run_at <= now())
Playwright em Browserless.io  (Chrome headless remoto via WSS)
    ↓
Baixa PDFs → sobe pro bucket order-documents/checkin/{order}/{passenger}.pdf
    ↓
Camila (WhatsApp) + template transacional "cartao-embarque-disponivel" (e-mail)
    ↓
Marca job = done; grava log
```

Playwright roda **no Browserless** (`wss://production-sfo.browserless.io?token=...`), não no Worker. Nosso servidor só conecta via `playwright.chromium.connect()`, executa o roteiro, recebe PDFs e fecha. Zero binário nativo no Cloudflare — só um WebSocket.

## Trabalho

### 1. Secret + config
- Novo secret: `BROWSERLESS_TOKEN` (via `add_secret` — o usuário cria conta em browserless.io, plano ~US$50/mês, cola o token).
- `src/lib/checkin/browserless.server.ts`: helper `withBrowser(fn)` que abre/fecha conexão e trata timeout.

### 2. Tabela `checkin_jobs` (nova migration)
Colunas: `id`, `order_id`, `order_item_id` (voo), `passenger_id`, `airline` (LA/G3/AD), `locator`, `last_name`, `origin_iata`, `flight_number`, `depart_at`, `run_at` (quando tentar), `status` (pending/running/done/failed/manual), `attempt_count`, `last_error`, `pdf_path` (storage), `sent_whatsapp_at`, `sent_email_at`, `created_at`, `updated_at`.
RLS: só admin lê/edita; `service_role` full. Trigger em `order_items` (kind=flight) cria/atualiza job pendente por passageiro quando o voo é salvo/importado com `depart_at`, `locator`, e nome do passageiro. `run_at = depart_at - X` (LA=48h, G3=72h, AD=60h). Se voo alterar/cancelar → cancela jobs futuros.

### 3. Scrapers por cia (`src/lib/checkin/airlines/`)
Um arquivo por cia — cada um exporta `runCheckin(page, ctx) → { boardingPassPdf: Buffer, seat?: string, warnings: string[] } | { needsManual: reason }`.
- `latam.ts`: abre `/minhas-viagens/second-detail?orderId=...&lastname=...` → clica "Fazer check-in" → aceita termos → sem escolha de assento → "Continuar" → baixa PDF em "Cartão de embarque".
- `gol.ts`: `voegol.com.br/checkin/localizador` → PNR + sobrenome + origem → seleciona todos passageiros → aceita assento sugerido → baixa PDF.
- `azul.ts`: fluxo equivalente na Azul.

Se aparecer captcha, pedido de senha, cobrança de assento/bagagem, ou qualquer coisa fora do fluxo grátis → retorna `needsManual` com o motivo. Nunca preenche cartão.

### 4. Runner (`src/lib/checkin/runner.server.ts`)
`processCheckinJob(jobId)`:
1. Marca `running`.
2. Chama scraper da cia.
3. Se `needsManual` → status `manual`, notifica sino do admin.
4. Se PDF → sobe pro bucket `order-documents` (path `checkin/{order_id}/{passenger_id}-{flight_number}.pdf`), grava `pdf_path`, `status = done`.
5. Se erro transitório → incrementa `attempt_count`, reagenda `run_at + 10min` até 5 tentativas.
6. Se `status = done` e ainda não enviou → dispara WhatsApp (Camila anexa PDF) + e-mail.

### 5. Rota cron `src/routes/api/public/hooks/checkin-scheduler.ts`
`pg_cron` chama a cada 5min. Pega até 5 jobs `pending` com `run_at <= now()`, processa em paralelo (limite pra não estourar sessão Browserless). Verifica `apikey` = anon key.

### 6. Envio ao cliente
- **WhatsApp**: novo tool no `camila-runner` — quando `checkin_jobs` completa, cria mensagem "Seu check-in foi feito automaticamente ✈️ Seguem os cartões de embarque:" + anexo PDF por passageiro.
- **E-mail**: novo template `cartao-embarque-disponivel.tsx` em `src/lib/email-templates/` + registro em `registry.ts`. Anexa PDFs.
- Também aparece em **Documentos** do pedido (integra com `OrderDocuments.tsx`).

### 7. UI no pedido
- Aba "Check-in automático" dentro do pedido mostrando cada voo × passageiro: status (agendado / feito / falhou / manual), horário previsto, PDF, botão "Tentar agora", botão "Cancelar agendamento", botão "Fazer manual" (marca como resolvido e permite upload do PDF).
- Sino de notificação quando job vira `manual` ou `failed`.

### 8. Cron
Migration via `insert` tool: agenda `pg_cron` a cada 5 min chamando `/api/public/hooks/checkin-scheduler` com header `apikey`.

## Trade-offs importantes que você precisa saber

- **~US$50/mês do Browserless** + eventual scraping quebrando quando as cias mudam HTML (fase de manutenção contínua — cada cia é uma mini-integração viva).
- **Sem login = limitado**: se a cia exigir senha da conta pra baixar o PDF (Azul às vezes faz isso), o job vira `manual` e você conclui na mão. Não vejo isso quebrando >20% dos casos hoje, mas é o risco real.
- **Cias detectam automação**: usamos User-Agent realista + delays humanos, mas se começarem a bloquear IP do Browserless a gente pode precisar migrar pra residential proxy (custo extra).
- **Assento**: aceita o que a cia oferecer grátis (conforme você escolheu). Se cair em "escolha seu assento" com todos pagos, marca `manual`.

## Escopo desta implementação
Nacionais: **LATAM (LA), GOL (G3), AZUL (AD)** — sem internacionais. Envio duplo (WhatsApp + e-mail + Documentos). Só check-in básico. Só fluxo público (localizador + sobrenome), sem login de conta.

## Não incluso (fase 2, se quiser depois)
- Escolha inteligente de assento (janela/corredor).
- Internacionais (AA, LATAM internacional, Copa, etc.).
- Rescheduling automático quando cia altera voo.
- Login com conta do passageiro pra cias que exigem.
