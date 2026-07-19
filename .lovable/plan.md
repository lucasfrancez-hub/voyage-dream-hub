
# Robô de Check-in Automático — Fase 1 (LATAM)

## Arquitetura

```text
[Pedido com voo LATAM]
        │
        ├── Cron (a cada 10 min) ──► detecta voos entre agora e +48h sem check-in
        │
        └── Botão "Fazer check-in agora" no pedido
                │
                ▼
        runCheckin(order_item_id)
                │
                ▼
        Browserless (Chrome na nuvem)
        → abre latam.com/check-in
        → digita localizador + sobrenome
        → recusa contato de emergência
        → baixa PDF do cartão de embarque
                │
                ▼
        Salva em Storage `boarding-passes/`
                │
                ├──► WhatsApp: envia PDF pro cliente
                └──► E-mail: template `cartao-embarque` com link
```

## O que será criado

**1. Banco de dados**
- Tabela `flight_checkins`: `order_item_id`, `passenger_id`, `cia` (LATAM/GOL/AZUL), `status` (pending/scheduled/running/success/failed), `attempts`, `boarding_pass_url`, `boarding_pass_path`, `error`, `scheduled_for`, `completed_at`, `locator`, `flight_number`, `pnr_surname`
- Storage bucket `boarding-passes` (privado, com policy pro dono do pedido ler)

**2. Backend**
- `src/lib/checkin/browserless.server.ts` — cliente HTTP pro Browserless (endpoint `/function`)
- `src/lib/checkin/latam.server.ts` — script Playwright serializado que faz o fluxo LATAM
- `src/lib/checkin/checkin.functions.ts` — `runCheckin`, `scheduleCheckin`, `listCheckins` (server functions autenticadas)
- `src/routes/api/public/hooks/run-checkins.ts` — cron: detecta voos LATAM entre agora e +48h, agenda e roda os pendentes (verifica `apikey` header)
- Cron `pg_cron` a cada 10 min

**3. UI**
- Botão **✈️ Check-in automático** em cada `order_item` do tipo voo
- Aba/painel mostrando status do check-in (agendado / sucesso / erro + botão "tentar de novo")
- Ícone de status na lista de itens do pedido

**4. Entrega**
- Template de e-mail `cartao-embarque` com link do PDF
- Envio WhatsApp via `sendWhatsappDocument` (já existe em `send-internal.server.ts`)

## Regras de negócio LATAM

- Janela: check-in abre **48h antes** da decolagem, fecha **1h antes**
- Login: **localizador + sobrenome do 1º passageiro**
- Só recusar "contato de emergência" — sem assento pago, sem bagagem extra
- 1 tentativa automática, retry em caso de falha (máx 3 tentativas com backoff)
- Se der erro persistente: notifica no chat interno e mantém botão manual

## Fora do escopo desta fase
- GOL e AZUL (fase 2, quando LATAM estiver estável)
- Seleção de assento
- Alertas de check-in não realizado 6h antes

## Detalhes técnicos

- Browserless: usa endpoint HTTP `/function?token=$BROWSERLESS_TOKEN` (Chrome remoto — funciona no Worker sem precisar de Playwright local)
- Todo o script LATAM roda dentro do Chrome do Browserless; nosso Worker só recebe o PDF em base64
- PDF salvo em Storage → gera signed URL de 30 dias pro cliente
- Idempotência: `unique(order_item_id, passenger_id)` em `flight_checkins`

## Passo seguinte

Testamos com 1 pedido LATAM real. Se funcionar limpo, ativo GOL/AZUL na fase 2 (mesma arquitetura, só troca o script de dentro do Browserless).
