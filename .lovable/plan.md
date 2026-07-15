## O que muda para o cliente

Na página do **link de cartão seguro** (`/pagar`, modo `secureMode`):

Antes:
1. Preenche dados + cartão
2. Aceita termos
3. Desenha assinatura no touchpad
4. Faz verificação facial (liveness) próprio em 5 passos
5. Clica "Fazer pedido"

Depois:
1. Preenche dados + cartão
2. Aceita termos
3. Clica em **"Assinar autorização com ClickSign"** → abre uma **janela embutida na própria página** (modal, sem redirect)
4. Dentro do widget faz: selfie dinâmica (prova de vida) + foto do documento + **geolocalização obrigatória** + assinatura ICP-Brasil da ClickSign
5. Widget confirma → botão "Fazer pedido" desbloqueia
6. Clica "Fazer pedido" → pedido criado com PDF da autorização **já assinado e com o carimbo/página de certificação da ClickSign** anexado

Fluxo do **admin/pedidos** continua idêntico ao atual (contrato + recibo por e-mail/WhatsApp).

## O que muda por baixo

### 1. Config do sandbox
- Aproveitar o novo secret `CLICKSIGN_SANDBOX_API_TOKEN` que você acabou de salvar
- Ler variável de ambiente `CLICKSIGN_ENV` (default `sandbox` enquanto testamos) para escolher entre sandbox e produção
- Ajustar o helper `csFetch` em `src/lib/clicksign.functions.ts` pra usar `https://sandbox.clicksign.com/api/v1` + `CLICKSIGN_SANDBOX_API_TOKEN` quando estiver em sandbox

### 2. Nova server function
`createEmbeddedAuthorization` em `src/lib/clicksign.functions.ts`:
- Recebe: dados do cliente (nome, CPF, email, telefone, nascimento) + PDF da autorização em base64 + snapshot dos dados da autorização
- Faz na ClickSign:
  - Cria documento (`/documents`)
  - Cria signer com `liveness_enabled: true`, `official_document_enabled: true`, `location_required_enabled: true` (geolocalização obrigatória), `handwritten_enabled: false`, `selfie_enabled: true`
  - Vincula ao documento (`/lists`)
  - **Não dispara notificações** (o cliente vai assinar direto no widget)
  - Gera `request_signature_key` (que é retornado pelo `/lists`)
- Persiste um registro provisório em uma nova tabela (ver item 4) para depois vincular ao pedido quando o "Fazer pedido" for clicado
- Retorna `{ pendingId, requestSignatureKey, documentKey }`

### 3. Componente `<ClickSignEmbedded />`
Novo arquivo `src/components/ClickSignEmbedded.tsx`:
- Carrega dinamicamente o script `https://cdn.clicksign.com/widget.js`
- Recebe `requestSignatureKey` e callbacks `onSigned`, `onClosed`, `onResized`
- Monta o widget em um `<div>` dentro de um `Dialog` (shadcn) — janela embutida na página, sem redirect
- Detecta o evento `signed` do widget e chama `onSigned`

### 4. Nova tabela `pending_authorization_signatures`
Antes de o pedido existir, precisamos guardar a assinatura pendente (não dá pra usar `pedido_assinaturas` porque exige `pedido_id`). Colunas:
- `id`, `clicksign_document_key`, `clicksign_signer_key`, `clicksign_request_signature_key`
- `status` (`pending` | `signed` | `refused`)
- `signed_pdf_path` (preenchido pelo webhook quando a ClickSign avisa que assinou)
- `snapshot` (jsonb com dados da autorização pra reconstruir)
- `created_at`, `updated_at`
- RLS: público pode inserir e ler pelo `id` (é fluxo público, sem auth); apenas service_role pode alterar

Quando o "Fazer pedido" for enviado com sucesso, o backend copia o PDF assinado do bucket `assinaturas` pro pedido criado e limpa o registro pendente (ou marca como consumido).

### 5. Webhook `/api/public/clicksign-webhook`
Já existe e trata `auto_close`/`close`. Estender pra:
- Se o `document_key` for de um `pending_authorization_signatures` (e não de `pedido_assinaturas`), baixar o PDF assinado, salvar em `assinaturas/pending/{id}.pdf` e marcar `status = signed`

### 6. Ajustes em `src/routes/pagar.tsx`
- Remover `SignaturePad` e `FaceLiveness` do JSX (linhas 571 e 595)
- Remover a captura de liveness/IP/geo próprios (linhas 160–256) — a ClickSign passa a coletar geolocalização
- Substituir por um botão "Assinar autorização com ClickSign" que:
  - Gera o PDF da autorização usando `buildAuthorizationBlob({ pendingSignature: true })` (já existe)
  - Chama `createEmbeddedAuthorization` → recebe `requestSignatureKey`
  - Abre modal com `<ClickSignEmbedded />`
  - Faz polling curto (a cada 3s) do status ou espera o callback `onSigned` do widget + confirma pelo backend
- Botão "Fazer pedido" só habilita quando `signatureStatus === 'signed'`
- Ao clicar "Fazer pedido", envia o `pendingId` junto no `orders.insert` (no campo `package_snapshot.card_capture.clicksign`)
- Trigger no backend (ou uma edge function chamada logo depois) copia o PDF assinado pro pedido

### 7. Manter fallback
Se `CLICKSIGN_SANDBOX_API_TOKEN` não estiver configurado ou der erro na ClickSign, mostrar mensagem clara pro cliente e admin — sem cair no fluxo antigo (senão a gente nunca sabe se tá funcionando no sandbox).

## Como testar depois de implementado

1. Abrir um link de cartão seguro (ex: `/pagar?desc=...&total=1000&pedido=...&simples=0`)
2. Preencher dados + cartão + aceitar termos
3. Clicar "Assinar autorização com ClickSign" → widget abre na tela
4. Fazer selfie, foto do documento, aprovar geolocalização
5. Widget fecha automaticamente
6. Clicar "Fazer pedido"
7. Verificar no admin que o pedido veio com PDF assinado (com o carimbo ClickSign no fim)

## Fora do escopo

- Nada muda no fluxo de contrato+recibo dos pedidos do admin (ClickSignCard)
- Não altera o link simples (`simples=1`) — continua sem exigir assinatura
- Não altera pacotes prontos, checkout de pacote, boleto, etc.
