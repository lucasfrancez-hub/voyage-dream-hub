# Integração Pix Itaú (QR Code no checkout)

## Visão geral

Cliente escolhe Pix no checkout → nosso servidor pede um QR pro Itaú → mostra QR + copia-e-cola na tela de sucesso e manda por e-mail → quando o cliente paga, o Itaú avisa nosso webhook → pedido vira "pago" automaticamente.

O único obstáculo é que o Itaú exige certificado digital (mTLS) em toda chamada, e o servidor do Lovable não aceita esse tipo de certificado. Solução: um mini-servidor externo (proxy) que segura o certificado e repassa as chamadas.

---

## O que você (usuário) precisa fazer

**1. Reunir credenciais do Itaú** (já tem na maioria):
- `client_id` e `client_secret` — planilha `Token.xlsx`
- `x-itau-apikey` — planilha `Token.xlsx`
- Certificado emitido: arquivos `.crt` (público) e `.key` (privado)
- Chave Pix cadastrada no Itaú PJ (CNPJ, e-mail, celular ou aleatória)

**Se ainda não gerou o certificado:** o processo é CSR → Itaú aprova → CRT. Uso as coleções Postman que você mandou pra te guiar passo a passo (uma vez só).

**2. Criar conta no Render** (grátis pra começar, ~US$7/mês depois):
- render.com → sign up com GitHub
- Vou entregar o código do proxy pronto num repositório
- Clique em "Deploy" e cole as credenciais nos campos indicados

**3. Cadastrar a URL do webhook no Itaú** (te passo o link exato depois do deploy):
- Portal Itaú Devportal → sua aplicação Pix → Webhook → colar URL

Depois disso não precisa mexer em mais nada. Todas as alterações futuras (mensagens, expiração, layout do QR) faço direto no Lovable.

---

## O que eu vou construir

### Parte A — Proxy mTLS externo (repositório separado)

Mini servidor Node/Express (~150 linhas) que fica entre nosso app e o Itaú:

- 3 endpoints internos protegidos por chave compartilhada:
  - `POST /pix/cobranca` — cria QR imediato
  - `GET /pix/status/:txid` — consulta se foi pago
  - `POST /pix/webhook-config` — registra webhook (roda uma vez)
- Anexa certificado `.crt/.key` em toda chamada pro Itaú via `https.Agent`
- Cache do OAuth token (renova a cada 55min)
- Logs estruturados
- README com instruções de deploy no Render (5 cliques)

### Parte B — Backend do Lovable (dentro deste projeto)

1. **Server function `criarCobrancaPix`** (`src/lib/pix.functions.ts`)
   - Recebe `orderId` + `valor` + dados do pagador
   - Chama o proxy → recebe `qr_code_string` + `qr_code_imagem_base64` + `txid` + `expira_em`
   - Salva na tabela `pix_cobrancas` (nova)
   - Retorna QR pro frontend

2. **Rota webhook pública** (`src/routes/api/public/itau-pix-webhook.ts`)
   - Recebe callback do Itaú quando alguém paga
   - Valida assinatura mTLS via header do proxy
   - Atualiza `orders.status = 'paid'`
   - Dispara e-mails: confirmação pro cliente + notificação pro admin

3. **Migração de banco:**
   ```sql
   CREATE TABLE public.pix_cobrancas (
     txid text PRIMARY KEY,
     order_id uuid REFERENCES orders(id),
     valor numeric(10,2) NOT NULL,
     qr_code text NOT NULL,
     status text NOT NULL DEFAULT 'ativa',  -- ativa|concluida|expirada|removida
     expira_em timestamptz NOT NULL,
     pago_em timestamptz,
     e2eid text,  -- ID único do pagamento no Bacen
     raw_response jsonb,
     created_at timestamptz DEFAULT now()
   );
   -- + GRANT + RLS (admin lê tudo; ninguém escreve pelo client)
   ```

4. **Secrets no Lovable Cloud:**
   - `PIX_PROXY_URL` — URL do Render (ex.: `https://viaair-pix-proxy.onrender.com`)
   - `PIX_PROXY_SECRET` — chave compartilhada gerada pelo próprio Lovable
   - `PIX_CHAVE` — sua chave Pix cadastrada no Itaú

### Parte C — Frontend (checkout)

Substituir a tela de sucesso atual do Pix (`src/routes/pacotes.$slug.checkout.tsx`) por uma tela dedicada:

```text
┌──────────────────────────────────────┐
│  ✓ Pedido criado — pague via Pix     │
│                                      │
│      [QR CODE 240×240px]             │
│                                      │
│  Total: R$ 12.480,00                 │
│  Expira em: 29:47 (contador)         │
│                                      │
│  ┌────────────────────────────────┐  │
│  │ 00020126360014BR.GOV...       │  │
│  │              [Copiar código]  │  │
│  └────────────────────────────────┘  │
│                                      │
│  Assim que pagar, você recebe        │
│  confirmação por e-mail.             │
│                                      │
│  ⟳ Verificando pagamento...          │
└──────────────────────────────────────┘
```

- Contador regressivo de expiração
- Polling do status a cada 5s (backup do webhook)
- Ao confirmar pagamento: modal "Pagamento aprovado" + redireciona pra minhas reservas
- Se expirar: botão "Gerar novo QR"

### Parte D — E-mail com QR pro cliente

Novo template `src/lib/email-templates/pix-qr-cliente.tsx`:
- QR embutido como imagem inline
- Código copia-e-cola formatado
- Valor + prazo de expiração
- Botão "Voltar pro pedido"

E ajuste no template `pedido-pix-admin` (já existe) pra incluir o `txid`.

---

## Decisões já tomadas (baseado nas suas respostas)

- ✅ **Cobrança imediata** com expiração
- ⏱️ **Expira em 30 min** (padrão de mercado) — configurável depois
- 🔔 **Confirmação automática via webhook** + polling de segurança

---

## Ordem de execução

1. Migração da tabela `pix_cobrancas` + secrets
2. Código do proxy mTLS (repo separado que eu entrego)
3. Server function `criarCobrancaPix` + webhook público
4. Tela nova do QR no checkout
5. Template de e-mail
6. Você faz deploy do proxy no Render + cadastra webhook no Itaú
7. Teste em sandbox → testa em produção com R$ 0,01

---

## O que fica pra fora deste plano

- **Pix com vencimento** (cobv) — só imediato por enquanto
- **Devolução automática** (estorno) — se precisar cancelar, faz manual pelo app do Itaú
- **Reconciliação de extrato bancário** — o webhook cobre 99% dos casos
- **Split de pagamento** (marketplace) — não é caso aqui

Se aprovar, começo pela migração e proxy em paralelo.
