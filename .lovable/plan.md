# Integração ClickSign — Contrato + Recibo

## Fluxo de ponta a ponta

```text
Pedido no painel
   │
   ├─► [Botão "Enviar p/ assinatura"]
   │      │
   │      ├─ Gera PDF (contrato + recibo) no servidor
   │      ├─ POST /api/v1/documents          → cria documento na ClickSign
   │      ├─ POST /api/v1/signers  (x2)      → cliente + agência
   │      ├─ POST /api/v1/lists               → vincula signers ao doc
   │      │     (auths=["email"], selfie_enabled + handwritten opcional,
   │      │      cliente: has_documentation=true, cpf+birthday obrigatórios)
   │      └─ POST /api/v1/notifications       → dispara email ClickSign
   │
   ▼
Cliente recebe email → preenche CPF+nascimento → assina biometria dinâmica
   │
   ▼
ClickSign chama webhook  ──►  /api/public/clicksign-webhook
                                │
                                ├─ Verifica HMAC-SHA256 (header Content-Hmac)
                                ├─ Evento "sign"      → marca signatário como assinado
                                ├─ Evento "auto_close"→ baixa PDF final assinado,
                                │                       salva no storage, status="Assinado"
                                └─ Evento "refusal"   → status="Recusado"
   │
   ▼
Painel do pedido: badge de status + botão "Baixar assinado" + timeline
```

## O que vou construir

### 1. Banco (migration)
- `pedido_assinaturas`: `id`, `pedido_id`, `clicksign_document_key`, `status` (`draft|running|closed|refused|canceled`), `deadline_at`, `signed_pdf_url`, `created_at`, `updated_at`
- `pedido_assinatura_signers`: `id`, `assinatura_id`, `clicksign_signer_key`, `nome`, `email`, `cpf`, `nascimento`, `papel` (`cliente|agencia|testemunha`), `signed_at`, `refused_at`
- RLS + GRANTs padrão (authenticated); webhook usa `supabaseAdmin`.

### 2. Server functions (`src/lib/clicksign.functions.ts`)
- `createSignatureRequest({ pedidoId })` — gera PDF, cria doc + signers + list + dispara email. Protegido por `requireSupabaseAuth`.
- `getSignatureStatus({ pedidoId })` — retorna status + signers para o painel.
- `cancelSignatureRequest({ assinaturaId })` — cancela na ClickSign.
- `resendSignerEmail({ signerKey })` — reenvia link.

### 3. Server route pública (`src/routes/api/public/clicksign-webhook.ts`)
- Verifica HMAC com `CLICKSIGN_HMAC_SECRET` (timing-safe).
- Trata eventos: `sign`, `auto_close`, `refusal`, `cancel`, `deadline`.
- Em `auto_close`: baixa PDF assinado da ClickSign, sobe pro bucket `assinaturas`, salva URL.

### 4. UI (dentro do pedido, `admin.pedidos.$id.tsx`)
- Card "Assinatura Digital" com:
  - Estado vazio: botão **"Enviar contrato + recibo para assinatura"**
  - Em andamento: badge amarelo, lista de signatários com status individual, botão "Reenviar link", "Cancelar"
  - Assinado: badge verde, data/hora, botão **"Baixar PDF assinado"**
- Auto-refresh a cada 15s enquanto status = `running` (via TanStack Query `refetchInterval`).

### 5. Storage
- Bucket `assinaturas` (privado) para armazenar os PDFs assinados.

## Configuração ClickSign (você faz 1x)

1. Painel ClickSign → **Configurações → API** → gerar **Access Token de produção**.
2. Painel ClickSign → **Configurações → Webhooks** → cadastrar:
   - URL: `https://pedidos.viaair.tur.br/api/public/clicksign-webhook`
   - Eventos: `sign`, `auto_close`, `refusal`, `cancel`, `deadline`
   - Copiar o **HMAC Secret** que ele gera.
3. Me passar via formulário seguro:
   - `CLICKSIGN_API_TOKEN`
   - `CLICKSIGN_HMAC_SECRET`

## Detalhes técnicos relevantes

- **API base**: `https://app.clicksign.com/api/v1` (produção).
- **Autenticação**: `?access_token=<TOKEN>` na querystring (padrão ClickSign v1).
- **Upload do PDF**: enviado como base64 no campo `content_base64` (formato `data:application/pdf;base64,...`).
- **Biometria dinâmica**: no signer do cliente, `has_documentation: true`, `documentation: <CPF>`, `birthday: YYYY-MM-DD`, e no `list.sign_as: "sign"` com `auths: ["email"]` + `selfie_enabled: true` — ClickSign combina esses campos e aplica a autenticação biométrica dinâmica automaticamente.
- **Agência (contra-assinatura)**: signer separado com email fixo (secret `AGENCIA_EMAIL_ASSINATURA`), `sign_as: "contest"`, sem biometria.
- **Ordem**: `list.skip_email: false`, `list.refusable: true`. Auto-close automático quando todos assinam.

## Fora do escopo (podemos fazer depois)
- Reenvio por WhatsApp/SMS.
- Templates personalizados de layout do PDF (por ora usa o gerador atual do pedido).
- Múltiplos passageiros como signatários adicionais.

Depois que você aprovar, o próximo passo é você me passar o **CLICKSIGN_API_TOKEN**, **CLICKSIGN_HMAC_SECRET** e o **email da agência** que vai contra-assinar.