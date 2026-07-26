# VIA AIR — Proxy mTLS Itaú Pix

Mini-servidor que fica entre o app Lovable (Cloudflare Workers, sem suporte a
mTLS) e a API Pix do Itaú. Anexa o certificado digital em toda chamada e
reencaminha o webhook do Itaú para o backend do Lovable.

## Deploy no Render (5 passos)

1. Crie conta em https://render.com (grátis).
2. Faça upload deste diretório para um repositório privado no GitHub.
3. No Render: **New → Web Service → conecte o repositório**.
4. **Build Command:** `npm install` &nbsp; **Start Command:** `npm start`.
5. Aba **Environment** → adicione as variáveis abaixo e clique **Save**.

### Variáveis de ambiente obrigatórias

| Variável | Onde encontrar |
|---|---|
| `ITAU_CLIENT_ID` | Planilha `Token.xlsx` |
| `ITAU_CLIENT_SECRET` | Planilha `Token.xlsx` |
| `ITAU_API_KEY` | Planilha `Token.xlsx` (`x-itau-apikey`) |
| `ITAU_CERT_PEM` | Conteúdo do arquivo `.crt` (inclusive `-----BEGIN CERTIFICATE-----`) |
| `ITAU_KEY_PEM` | Conteúdo do arquivo `.key` privado |
| `ITAU_ENV` | `sandbox` ou `production` |
| `PROXY_SECRET` | Chave gerada pelo Lovable (`PIX_PROXY_SECRET`) |
| `LOVABLE_WEBHOOK_URL` | `https://pedidos.viaair.tur.br/api/public/itau-pix-webhook` |

> No Render, quando colar `ITAU_CERT_PEM`/`ITAU_KEY_PEM`, marque a opção
> **"Multi-line"** para preservar as quebras de linha do PEM. Se não
> aparecer essa opção, substitua as quebras de linha por `\n` literal
> (o servidor traduz automaticamente).

## Depois do deploy

O Render vai gerar uma URL do tipo `https://viaair-pix-proxy.onrender.com`.

1. Cole essa URL no Lovable como o secret **`PIX_PROXY_URL`**.
2. Registre o webhook do Itaú executando (uma vez só) — pelo terminal ou
   ferramenta tipo Postman/curl:

   ```bash
   curl -X POST https://SEU-PROXY.onrender.com/pix/webhook/config \
     -H "X-Proxy-Secret: SEU_PROXY_SECRET" \
     -H "Content-Type: application/json" \
     -d '{"chave":"SUA_CHAVE_PIX"}'
   ```

3. Confira o health-check: `https://SEU-PROXY.onrender.com/health` deve
   retornar `{"ok":true,"env":"production"}`.

## Endpoints (referência)

| Método | Path | Uso |
|---|---|---|
| POST | `/pix/cobranca` | Criar cobrança imediata |
| GET | `/pix/cob/:txid` | Consultar status |
| POST | `/pix/webhook/config` | (uma vez) registrar webhook |
| POST | `/webhook/pix` | Itaú chama aqui quando alguém paga |
| GET | `/health` | Health-check |

Todos os endpoints internos exigem header `X-Proxy-Secret`.
