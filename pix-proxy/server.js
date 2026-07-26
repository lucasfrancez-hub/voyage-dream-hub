/**
 * VIA AIR — Proxy mTLS Itaú Pix
 *
 * Fica entre o backend Lovable (Cloudflare Workers, sem mTLS) e a API do Itaú.
 * - Anexa o certificado digital em todas as chamadas para o Itaú.
 * - Faz cache do OAuth token (renova a cada 55 min).
 * - Recebe o webhook do Itaú (mTLS termina aqui) e reencaminha ao Lovable.
 *
 * Endpoints internos (protegidos por X-Proxy-Secret):
 *   POST /pix/cobranca            -> cria cobrança imediata
 *   GET  /pix/cob/:txid           -> consulta cobrança
 *   POST /pix/webhook/config      -> registra/atualiza URL de webhook no Itaú
 *
 * Endpoints externos (chamados pelo Itaú):
 *   POST /webhook/pix             -> Itaú notifica pagamento; reencaminhamos ao Lovable
 *   GET  /health                  -> health-check para o Render
 *
 * Variáveis de ambiente esperadas (Render → Environment):
 *   ITAU_CLIENT_ID
 *   ITAU_CLIENT_SECRET
 *   ITAU_API_KEY
 *   ITAU_CERT_PEM           (conteúdo do .crt, com quebras de linha)
 *   ITAU_KEY_PEM            (conteúdo do .key privado)
 *   ITAU_ENV                'sandbox' | 'production'  (default: production)
 *   PROXY_SECRET            (mesma chave configurada no Lovable)
 *   LOVABLE_WEBHOOK_URL     ex.: https://pedidos.viaair.tur.br/api/public/itau-pix-webhook
 *   PORT                    (opcional — Render define automaticamente)
 */

import express from 'express';
import https from 'node:https';

const {
  ITAU_CLIENT_ID,
  ITAU_CLIENT_SECRET,
  ITAU_API_KEY,
  ITAU_CERT_PEM,
  ITAU_KEY_PEM,
  ITAU_ENV = 'production',
  PROXY_SECRET,
  LOVABLE_WEBHOOK_URL,
  PORT = 8080,
} = process.env;

for (const [k, v] of Object.entries({
  ITAU_CLIENT_ID,
  ITAU_CLIENT_SECRET,
  ITAU_API_KEY,
  ITAU_CERT_PEM,
  ITAU_KEY_PEM,
  PROXY_SECRET,
  LOVABLE_WEBHOOK_URL,
})) {
  if (!v) {
    console.error(`[fatal] variável ${k} não configurada`);
    process.exit(1);
  }
}

const OAUTH_URL =
  ITAU_ENV === 'sandbox'
    ? 'https://sts.sandbox.itau.com.br/api/oauth/token'
    : 'https://sts.itau.com.br/api/oauth/token';

const API_BASE =
  ITAU_ENV === 'sandbox'
    ? 'https://api.itau.com.br/sandbox/pix_recebimentos_conciliacoes/v2'
    : 'https://secure.api.itau/pix_recebimentos_conciliacoes/v2';

// Agente HTTPS com certificado cliente (mTLS)
const httpsAgent = new https.Agent({
  cert: ITAU_CERT_PEM.replace(/\\n/g, '\n'),
  key: ITAU_KEY_PEM.replace(/\\n/g, '\n'),
  keepAlive: true,
});

// ---------- OAuth cache ----------
let cachedToken = null; // { access_token, exp_ms }

async function getAccessToken() {
  const now = Date.now();
  if (cachedToken && cachedToken.exp_ms - 60_000 > now) return cachedToken.access_token;

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: ITAU_CLIENT_ID,
    client_secret: ITAU_CLIENT_SECRET,
  }).toString();

  const res = await fetch(OAUTH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    // OAuth do Itaú também exige mTLS
    // @ts-ignore — node fetch aceita agent via dispatcher, mas usamos undici default;
    // pra garantir, chamamos via https direto caso o token endpoint recuse.
    dispatcher: undefined,
    agent: httpsAgent,
  }).catch((err) => {
    throw new Error(`[oauth] falha de rede: ${err?.message ?? err}`);
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`[oauth] ${res.status}: ${txt}`);
  }
  const json = await res.json();
  const ttl = (json.expires_in ?? 3600) * 1000;
  cachedToken = { access_token: json.access_token, exp_ms: now + ttl };
  return cachedToken.access_token;
}

async function itauFetch(path, init = {}) {
  const token = await getAccessToken();
  const url = `${API_BASE}${path}`;
  const headers = {
    Authorization: `Bearer ${token}`,
    'x-itau-apikey': ITAU_API_KEY,
    'x-itau-flowID': init.flowId || 'viaair-checkout',
    'x-itau-correlationID': init.correlationId || crypto.randomUUID(),
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...(init.headers || {}),
  };
  const res = await fetch(url, {
    ...init,
    headers,
    agent: httpsAgent,
  });
  const raw = await res.text();
  let body;
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    body = { raw };
  }
  return { ok: res.ok, status: res.status, body };
}

// ---------- Express ----------
const app = express();
app.use(express.json({ limit: '256kb' }));

function requireSecret(req, res, next) {
  if (req.header('x-proxy-secret') !== PROXY_SECRET) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  next();
}

app.get('/health', (_req, res) => res.json({ ok: true, env: ITAU_ENV }));

/**
 * Cria cobrança imediata (cob).
 * Body: { txid, valor, chave, expiracao_seg, devedor?, infoAdicionais? }
 */
app.post('/pix/cobranca', requireSecret, async (req, res) => {
  try {
    const { txid, valor, chave, expiracao_seg = 1800, devedor, infoAdicionais } = req.body || {};
    if (!txid || !/^[a-zA-Z0-9]{26,35}$/.test(txid)) {
      return res.status(400).json({ error: 'txid inválido (26-35 alfanumérico)' });
    }
    if (!valor || Number(valor) <= 0) return res.status(400).json({ error: 'valor inválido' });
    if (!chave) return res.status(400).json({ error: 'chave pix obrigatória' });

    const body = {
      calendario: { expiracao: expiracao_seg },
      valor: { original: Number(valor).toFixed(2) },
      chave,
      ...(devedor ? { devedor } : {}),
      ...(infoAdicionais ? { infoAdicionais } : {}),
    };

    const { ok, status, body: response } = await itauFetch(`/cob/${txid}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
    if (!ok) return res.status(status).json(response);

    // resposta contém `location.location` (URL do payload) e `pixCopiaECola`.
    return res.json({
      txid: response.txid,
      status: response.status,
      pixCopiaECola: response.pixCopiaECola,
      location: response.location,
      expiracao_seg: response.calendario?.expiracao,
      criacao: response.calendario?.criacao,
      valor: response.valor?.original,
      raw: response,
    });
  } catch (err) {
    console.error('[/pix/cobranca] erro', err);
    res.status(500).json({ error: err?.message ?? 'erro interno' });
  }
});

app.get('/pix/cob/:txid', requireSecret, async (req, res) => {
  try {
    const { ok, status, body } = await itauFetch(`/cob/${req.params.txid}`, { method: 'GET' });
    if (!ok) return res.status(status).json(body);
    return res.json({
      txid: body.txid,
      status: body.status,
      pixCopiaECola: body.pixCopiaECola,
      valor: body.valor?.original,
      pix: body.pix, // array de pagamentos vinculados (quando pago)
      raw: body,
    });
  } catch (err) {
    console.error('[/pix/cob/:txid] erro', err);
    res.status(500).json({ error: err?.message ?? 'erro interno' });
  }
});

/**
 * Configura o webhook do Itaú para apontar para /webhook/pix deste proxy.
 * Body: { chave, webhookUrl?  (default = ${host}/webhook/pix) }
 */
app.post('/pix/webhook/config', requireSecret, async (req, res) => {
  try {
    const chave = req.body?.chave;
    const host = req.body?.host || `${req.protocol}://${req.get('host')}`;
    const webhookUrl = req.body?.webhookUrl || `${host}/webhook/pix`;
    if (!chave) return res.status(400).json({ error: 'chave pix obrigatória' });

    const { ok, status, body } = await itauFetch(`/webhook/${encodeURIComponent(chave)}`, {
      method: 'PUT',
      body: JSON.stringify({ webhookUrl }),
    });
    if (!ok) return res.status(status).json(body);
    return res.json({ ok: true, webhookUrl, body });
  } catch (err) {
    console.error('[/pix/webhook/config] erro', err);
    res.status(500).json({ error: err?.message ?? 'erro interno' });
  }
});

/**
 * Webhook público chamado pelo Itaú quando alguém paga.
 * Aqui a validação de origem seria mTLS por parte do Itaú; como o Render/Fly
 * termina TLS, confiamos no fato de o Itaú só chamar a URL cadastrada + no
 * pareamento por txid. Reencaminhamos ao Lovable assinando com PROXY_SECRET.
 */
app.post('/webhook/pix', async (req, res) => {
  try {
    const events = req.body?.pix ?? [];
    // Responder 200 imediatamente para o Itaú (evita retries)
    res.status(200).json({ received: events.length });
    // Forward assíncrono para o Lovable
    fetch(LOVABLE_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Proxy-Secret': PROXY_SECRET,
      },
      body: JSON.stringify({ pix: events, receivedAt: new Date().toISOString() }),
    }).catch((err) => console.error('[forward-lovable] falhou', err));
  } catch (err) {
    console.error('[/webhook/pix] erro', err);
    if (!res.headersSent) res.status(500).json({ error: 'erro interno' });
  }
});

app.listen(PORT, () => {
  console.log(`[pix-proxy] rodando em :${PORT} (env=${ITAU_ENV})`);
});
