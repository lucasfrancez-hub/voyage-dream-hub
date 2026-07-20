## O que vai ser construído

Um segundo canal de WhatsApp **só pra disparo administrativo**, totalmente separado do WhatsApp Meta que roda a IA/protocolos. Baseado em **Evolution API** (não-oficial, QR Code), sem janela de 24h e sem templates.

## Fluxo

```text
Admin → /admin/whatsapp-disparo
        ├── Conectar (QR Code da Evolution)
        ├── Templates salvos (CRUD com variáveis {{nome}}, {{pedido}}, ...)
        └── Enviar
             ├── Individual: botão "WhatsApp (disparo)" no pedido/passageiro
             └── Em massa: seleção por filtro/lista de pedidos → fila
```

## Backend

- **Tabelas novas** (schema `public`, com GRANTs + RLS admin-only):
  - `wa_disparo_config` — URL da instância Evolution, nome, status (conectado/desconectado), last_qr.
  - `wa_disparo_templates` — nome, corpo com `{{variáveis}}`, categoria.
  - `wa_disparo_envios` — histórico (destinatário, mensagem, anexo, status, erro, order_id opcional).
- **Server functions** (`src/lib/wa-disparo.functions.ts`, admin-only via `has_role`):
  - `getDisparoStatus` / `connectDisparoQR` (retorna QR base64)
  - `listTemplates` / `saveTemplate` / `deleteTemplate`
  - `sendDisparo({ to, message, mediaUrl?, orderId? })` — chama `POST {url}/message/sendText` ou `/sendMedia` da Evolution
  - `sendDisparoBulk({ recipients[], templateId, variables })` — enfileira envios com throttle 3s
- **Secrets**: `EVOLUTION_API_URL`, `EVOLUTION_API_KEY`, `EVOLUTION_INSTANCE_NAME` — pedidos via `add_secret` depois do plano aprovado.

## Frontend

- **Nova rota** `src/routes/_authenticated/admin.whatsapp-disparo.tsx`:
  - Card de conexão (status + botão "Gerar QR Code" que abre modal com QR)
  - Aba **Templates**: lista + editor com preview de variáveis
  - Aba **Histórico**: últimos envios com filtro por status
- **Botão de disparo individual** em `OrderDetailDialog` e ficha do passageiro: modal com seleção de template, edição do texto, campo pra anexar PDF (reusa `boarding-passes`/`order-documents`), pré-visualização.
- **Envio em massa**: na lista de pedidos, checkbox por linha + botão "Disparar WhatsApp" → modal com template + confirmação (`confirmThen`).

## Regras

- Zero acoplamento com `wa_conversations` / IA / protocolos existentes.
- Números normalizados pra E.164 (55 + DDD + número).
- Anexos: upload pro bucket `order-documents`, gera signed URL de 1h, envia via `/sendMedia`.
- Throttle no bulk (3s entre envios) pra não derrubar a instância.
- Botões usam `confirm`/`confirmThen` de `@/lib/confirm` (nunca `window.confirm`).

## Ordem de entrega

1. Migração (3 tabelas + GRANTs + RLS admin).
2. `add_secret` pra credenciais Evolution.
3. Server functions + integração HTTP com Evolution.
4. Rota `/admin/whatsapp-disparo` com conexão, templates e histórico.
5. Botão de disparo individual no pedido + passageiro.
6. Seleção múltipla e disparo em massa na lista de pedidos.
