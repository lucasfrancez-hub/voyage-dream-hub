/* VIA AIR — Exportar Cruzeiro: service worker.
 * Guarda o token da extensão, consulta o cruzeiro com importação ativa
 * e envia as capturas para a VIA AIR. */
const API_BASE = "https://pedidos.viaair.tur.br";
const ENDPOINT = API_BASE + "/api/public/v1/cruise-import";
const PAIR_ENDPOINT = API_BASE + "/api/public/v1/extension-pair";

async function getToken() {
  const { token } = await chrome.storage.local.get("token");
  return token || null;
}

async function pair(accessToken) {
  const res = await fetch(PAIR_ENDPOINT, {
    method: "POST",
    headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
    body: "{}",
  });
  if (!res.ok) return null;
  const json = await res.json();
  if (json.token) await chrome.storage.local.set({ token: json.token, email: json.email || null });
  return json.token || null;
}

async function activeCruise() {
  const token = await getToken();
  if (!token) return { error: "no_token" };
  const res = await fetch(`${ENDPOINT}?_=${Date.now()}`, {
    cache: "no-store",
    headers: {
      authorization: `Bearer ${token}`,
      "cache-control": "no-cache",
    },
  });
  if (res.status === 401) return { error: "no_token" };
  if (!res.ok) return { error: "http_" + res.status };
  return await res.json();
}

async function sendCapture(payload, sessionToken) {
  const token = await getToken();
  if (!token) return { error: "no_token" };
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ ...payload, session_token: sessionToken || undefined }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) return { error: json.error || "http_" + res.status, detail: json };
  return json;
}

async function finishImport() {
  const token = await getToken();
  if (!token) return { error: "no_token" };
  const res = await fetch(ENDPOINT, { method: "DELETE", headers: { authorization: `Bearer ${token}` } });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) return { error: json.error || "http_" + res.status };
  return json;
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg) return;
  if (msg.type === "viaair-cruise-pair") {
    pair(msg.accessToken).then((t) => sendResponse({ token: t })).catch(() => sendResponse({}));
    return true;
  }
  if (msg.type === "viaair-cruise-active") {
    activeCruise().then(sendResponse).catch((e) => sendResponse({ error: String(e) }));
    return true;
  }
  if (msg.type === "viaair-cruise-finish") {
    finishImport().then(sendResponse).catch((e) => sendResponse({ error: String(e) }));
    return true;
  }
  if (msg.type === "viaair-cruise-send") {
    sendCapture(msg.payload, msg.sessionToken).then(sendResponse).catch((e) =>
      sendResponse({ error: String(e) }),
    );
    return true;
  }
});
