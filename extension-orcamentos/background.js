/* Via Air Orçamentos — service worker.
 * Autenticação por token, fila com retry, deduplicação local e status.
 * Funciona sem o portal Via Air aberto. */

const LOG = "[Via Air Orçamentos]";
console.info(LOG, "Service worker iniciado");

const API_BASE = "https://pedidos.viaair.tur.br";
const ENDPOINT = API_BASE + "/api/public/v1/quote-imports";
const PAIR_ENDPOINT = API_BASE + "/api/public/v1/extension-pair";
const PORTAL_MATCHES = ["https://pedidos.viaair.tur.br/*", "https://*.lovable.app/*"];
const RETRY_MINUTES = [1, 5, 15, 60];
const diagnosticTabs = new Map();

function extractQuoteFromNavigation(rawUrl) {
  if (!rawUrl) return null;
  let value = String(rawUrl);
  for (let i = 0; i < 3; i++) {
    try {
      const next = decodeURIComponent(value);
      if (next === value) break;
      value = next;
    } catch (_) { break; }
  }
  const match = value.match(/https?:\/\/[^\s"'<>]*infotravel\.com\.br\/[^\s"'<>]*(?:orcamento-web|orcamento|proposta|quote)[^\s"'<>]*/i);
  return match ? match[0].replace(/[).,;]+$/, "") : null;
}

function relayToTop(tabId, payload) {
  if (typeof tabId !== "number") return;
  chrome.tabs.sendMessage(tabId, payload, { frameId: 0 }, () => void chrome.runtime.lastError);
}

function mostRecentDiagnosticTab(windowId) {
  let selected = null;
  for (const [tabId, info] of diagnosticTabs.entries()) {
    if (Date.now() - info.at > 5 * 60_000) { diagnosticTabs.delete(tabId); continue; }
    if (typeof windowId === "number" && info.windowId !== windowId) continue;
    if (!selected || info.at > selected.info.at) selected = { tabId, info };
  }
  return selected;
}

/* Intenção de envio: armada quando o usuário clica em "Enviar orçamento".
 * Sem intenção ativa, abrir/navegar no site da operadora não importa nada. */
const sendIntents = new Map();
const INTENT_TTL = 90_000;
function armIntent(windowId) {
  sendIntents.set(typeof windowId === "number" ? windowId : -1, Date.now());
}
function intentActive(windowId) {
  const now = Date.now();
  for (const [k, at] of sendIntents) if (now - at > INTENT_TTL) sendIntents.delete(k);
  const own = sendIntents.get(typeof windowId === "number" ? windowId : -1);
  const any = sendIntents.get(-1);
  return !!(own && now - own <= INTENT_TTL) || !!(any && now - any <= INTENT_TTL);
}

/** Importa sozinho, sem depender do content script nem de aba aberta. */
const autoImportSeen = new Map();
async function autoImport(url, mechanism) {
  if (!url) return;
  const last = autoImportSeen.get(url);
  if (last && Date.now() - last < 10 * 60_000) return;
  // dedupe persistente (24h): sobrevive ao reinício do service worker
  const { viaairImported } = await chrome.storage.local.get(["viaairImported"]);
  const map = viaairImported || {};
  if (map[url] && Date.now() - map[url] < 24 * 60 * 60_000) return;
  autoImportSeen.set(url, Date.now());
  map[url] = Date.now();
  const trimmed = Object.fromEntries(
    Object.entries(map).filter(([, at]) => Date.now() - at < 24 * 60 * 60_000).slice(-200),
  );
  await chrome.storage.local.set({ viaairImported: trimmed });
  console.info(LOG, "Importação automática (background)", { url, mechanism });
  broadcastToTabs({ type: "viaair-import-progress", stage: "start", url, mechanism });
  sendImport(url, mechanism || "background/auto").then((r) => {
    broadcastToTabs({ type: "viaair-import-progress", stage: "done", url, result: r });
    if (r && r.status !== "READY") {
      autoImportSeen.delete(url);
      chrome.storage.local.get(["viaairImported"]).then(({ viaairImported }) => {
        const m = viaairImported || {};
        delete m[url];
        chrome.storage.local.set({ viaairImported: m });
      });
    }
  });
}

function broadcastToTabs(payload) {
  chrome.tabs.query({}, (tabs) =>
    tabs.forEach((t) => t.id && chrome.tabs.sendMessage(t.id, payload, () => void chrome.runtime.lastError)),
  );
}

function inspectNavigation(tabId, windowId, rawUrl, event) {
  if (!rawUrl) return;
  const target = mostRecentDiagnosticTab(windowId);
  const quoteUrl = extractQuoteFromNavigation(rawUrl);
  if (!target && !quoteUrl) return;
  const destinationTab = target ? target.tabId : tabId;
  relayToTop(destinationTab, {
    type: "viaair-tab-candidate",
    event,
    tabUrl: rawUrl,
    quoteUrl,
    mechanism: /whatsapp|wa\.me/i.test(rawUrl) ? "background/WhatsApp text=" : "background/nova aba",
  });
  const isWhats = /whatsapp|wa\.me/i.test(rawUrl);
  // só importa com intenção de envio (clique em "Enviar orçamento") ou quando
  // o próprio destino é o compartilhamento do orçamento (WhatsApp).
  if (quoteUrl && (isWhats || intentActive(windowId))) autoImport(quoteUrl, /whatsapp|wa\.me/i.test(rawUrl) ? "background/WhatsApp text=" : "background/nova aba");
}

chrome.tabs.onCreated.addListener((tab) => {
  inspectNavigation(tab.id, tab.windowId, tab.pendingUrl || tab.url || "", "tab-created");
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  const url = changeInfo.url || tab.url || "";
  if (changeInfo.url || changeInfo.status === "complete") inspectNavigation(tabId, tab.windowId, url, "tab-updated");
});

async function store(patch) {
  const cur = await chrome.storage.local.get(null);
  await chrome.storage.local.set({ ...cur, ...patch });
}
async function read(keys) {
  return await chrome.storage.local.get(keys);
}

async function getToken() {
  const { viaairToken } = await read(["viaairToken"]);
  return viaairToken || null;
}

/** Troca o access token da sessão do portal por um token permanente da extensão. */
async function pairWithAccessToken(accessToken) {
  if (!accessToken || String(accessToken).length < 20) return false;
  try {
    const res = await fetch(PAIR_ENDPOINT, {
      method: "POST",
      headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
      body: "{}",
    });
    if (!res.ok) {
      await logEvent({ event: "auto_pair_failed", httpStatus: res.status });
      return false;
    }
    const data = await res.json();
    if (!data || !data.token) return false;
    await store({ viaairToken: data.token, viaairTokenInvalid: false, viaairAccount: data.email || null });
    await logEvent({ event: "auto_pair_ok", detail: data.email || "" });
    console.info(LOG, "Pareado automaticamente com a Via Air", data.email || "");
    return true;
  } catch (e) {
    await logEvent({ event: "auto_pair_error", detail: String(e && e.message ? e.message : e) });
    return false;
  }
}

/** Procura uma aba aberta do portal Via Air e lê a sessão logada de lá. */
async function autoPairFromPortalTabs() {
  let tabs = [];
  try {
    tabs = await chrome.tabs.query({ url: PORTAL_MATCHES });
  } catch (_) {
    return false;
  }
  for (const tab of tabs) {
    if (typeof tab.id !== "number") continue;
    try {
      const [result] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          try {
            for (let i = 0; i < localStorage.length; i++) {
              const key = localStorage.key(i) || "";
              if (!/^sb-.*-auth-token$/.test(key)) continue;
              let raw = localStorage.getItem(key);
              if (!raw) continue;
              if (raw.startsWith("base64-")) raw = atob(raw.slice(7));
              const obj = JSON.parse(raw);
              const t = obj && (obj.access_token || (obj.currentSession && obj.currentSession.access_token));
              if (t && String(t).length > 20) return String(t);
            }
          } catch (_) { /* ignore */ }
          return null;
        },
      });
      if (result && result.result && (await pairWithAccessToken(result.result))) return true;
    } catch (_) { /* aba sem permissão */ }
  }
  return false;
}

/** Garante um token válido: usa o salvo ou pareia sozinho pelo portal. */
async function ensureToken() {
  const existing = await getToken();
  if (existing) return existing;
  if (await autoPairFromPortalTabs()) return await getToken();
  return null;
}

async function logEvent(entry) {
  const { viaairLogs = [] } = await read(["viaairLogs"]);
  viaairLogs.unshift({ timestamp: new Date().toISOString(), ...entry });
  await store({ viaairLogs: viaairLogs.slice(0, 50) });
}

async function markImported(url, info) {
  const { viaairImported = {} } = await read(["viaairImported"]);
  viaairImported[url] = { at: Date.now(), ...info };
  await store({ viaairImported, viaairLast: { label: info.label || url, result: info.result } });
}

async function queueAdd(item) {
  const { viaairQueue = [] } = await read(["viaairQueue"]);
  if (viaairQueue.some((q) => q.url === item.url)) return;
  viaairQueue.push({ ...item, attempts: 0, nextAt: Date.now() + 60_000 });
  await store({ viaairQueue });
  chrome.alarms.create("viaair-quotes-retry", { periodInMinutes: 1 });
}

async function queueRemove(url) {
  const { viaairQueue = [] } = await read(["viaairQueue"]);
  await store({ viaairQueue: viaairQueue.filter((q) => q.url !== url) });
}

/** Aguarda a Via Air concluir o parsing dos dados reais (READY/IMPORT_ERROR). */
async function pollUntilDone(importId, token, timeoutMs = 120_000) {
  const started = Date.now();
  let last = { status: "PROCESSING" };
  while (Date.now() - started < timeoutMs) {
    await new Promise((r) => setTimeout(r, 2000));
    try {
      const res = await fetch(`${ENDPOINT}?id=${encodeURIComponent(importId)}`, {
        headers: { authorization: `Bearer ${token}` },
      });
      if (!res.ok) continue;
      const current = await res.json();
      // mantém o melhor resultado conhecido: nunca troca um sucesso por erro
      if (last.status !== "READY" && !last.quoteId) last = current;
      if (current.status === "READY" || current.quoteId) return current;
      if (current.status === "IMPORT_ERROR" && !current.quoteId) return current;
    } catch (_) {
      /* tenta de novo */
    }
  }
  return last;
}


const inflight = new Map();
async function sendImport(url, trigger) {
  if (inflight.has(url)) return inflight.get(url);
  const run = sendImportInner(url, trigger).finally(() => inflight.delete(url));
  inflight.set(url, run);
  return run;
}

async function sendImportInner(url, trigger) {

  const token = await ensureToken();
  if (!token) {
    console.error(LOG, "sem sessão Via Air — abra o portal pedidos.viaair.tur.br logado");
    await logEvent({ event: "no_token", sourceUrl: url });
    return { status: "UNAUTHORIZED", stage: "AUTH", detail: "sessao_ausente" };
  }
  console.info(LOG, "Enviando importação", { endpoint: ENDPOINT, url, trigger, tokenPreview: token.slice(0, 4) + "…" });

  // deduplicação local
  const { viaairImported = {} } = await read(["viaairImported"]);
  const already = viaairImported[url];

  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({
        source: "INFOTRAVEL",
        sourceUrl: url,
        detectedAt: new Date().toISOString(),
        browserExtension: true,
      }),
    });

    console.info(LOG, "API respondeu HTTP", res.status);
    if (res.status === 401 || res.status === 403) {
      const body = await res.text().catch(() => "");
      console.error(LOG, "autenticação recusada", res.status, body.slice(0, 200));
      await logEvent({ event: "unauthorized", sourceUrl: url, httpStatus: res.status, detail: body.slice(0, 200) });
      // token revogado/inválido: limpa para o popup mostrar "Token não configurado"
      await store({ viaairToken: "", viaairTokenInvalid: true });
      // tenta reparear sozinho com a sessão do portal e refaz o envio uma vez
      if (!trigger || trigger !== "retry-after-pair") {
        if (await autoPairFromPortalTabs()) return await sendImportInner(url, "retry-after-pair");
      }
      return { status: "UNAUTHORIZED", stage: "API", httpStatus: res.status, detail: "token_revogado" };
    }
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(LOG, "API recusou", res.status, body.slice(0, 300));
      throw new Error("http_" + res.status + " " + body.slice(0, 200));
    }

    const data = await res.json();

    // Sucesso só quando a Via Air terminar de importar os dados reais (status READY).
    let final = data;
    if (data.status === "PROCESSING" && data.importId) {
      final = await pollUntilDone(data.importId, token);
    }

    const label = final.quote
      ? `#${final.quote.quote_number} ${final.quote.destination || final.quote.title || ""}`
      : url;

    // Só é erro quando NÃO existe orçamento criado. Se veio quoteId, a importação foi.
    const ok = final.status === "READY" || !!final.quoteId;
    if (!ok) {
      const stillProcessing = final.status === "PROCESSING";
      console.error(LOG, "importação não concluída", { status: final.status, error: final.error });
      await logEvent({ event: "import_failed", sourceUrl: url, result: final.status, detail: final.error || "" });
      await markImported(url, { result: final.status, importId: data.importId, label });
      return {
        status: stillProcessing ? "PROCESSING" : "IMPORT_ERROR",
        stage: "PARSE",
        importId: data.importId,
        quoteId: null,
        detail: final.error || final.status,
      };
    }


    await markImported(url, { result: "READY", importId: data.importId, label });
    await queueRemove(url);
    await logEvent({ event: "imported", sourceUrl: url, result: "READY", importId: data.importId });
    console.info(LOG, "Importação concluída", { importId: data.importId, quoteId: final.quoteId });
    chrome.tabs.query({}, (tabs) =>
      tabs.forEach((t) => t.id && chrome.tabs.sendMessage(t.id, { type: "viaair-quotes-updated" }, () => void chrome.runtime.lastError)),
    );
    return {
      status: "READY",
      duplicate: !!data.duplicate || !!already,
      importId: data.importId,
      quoteId: final.quoteId || null,
      quoteUrl: final.quoteId ? `${API_BASE}/admin/orcamentos/${final.quoteId}` : `${API_BASE}/admin/orcamentos`,
      label,
    };

  } catch (e) {
    // AUDITORIA: erro completo, sem mascarar
    console.error(LOG, "falha ao enviar para a Via Air", { message: e?.message, stack: e?.stack, url, trigger });
    await queueAdd({ url, trigger });
    await logEvent({
      event: "queued",
      sourceUrl: url,
      result: String(e && e.message ? e.message : e),
      stack: String(e?.stack || "").slice(0, 500),
    });
    return { status: "QUEUED", stage: "NETWORK", detail: String(e?.message || e) };
  }
}

async function flushQueue() {
  const { viaairQueue = [] } = await read(["viaairQueue"]);
  if (!viaairQueue.length) return;
  const now = Date.now();
  for (const item of [...viaairQueue]) {
    if (item.nextAt > now) continue;
    const r = await sendImport(item.url, item.trigger);
    if (r.status === "READY") continue;
    if (r.status === "IMPORT_ERROR") {
      // dados da fonte não puderam ser lidos: não adianta repetir em loop
      await queueRemove(item.url);
      continue;
    }
    const { viaairQueue: current = [] } = await read(["viaairQueue"]);
    const updated = current.map((q) => {
      if (q.url !== item.url) return q;
      const attempts = (q.attempts || 0) + 1;
      const delay = RETRY_MINUTES[Math.min(attempts, RETRY_MINUTES.length - 1)];
      return { ...q, attempts, nextAt: Date.now() + delay * 60_000 };
    });
    await store({ viaairQueue: updated });
  }
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "viaair-quotes-retry") flushQueue();
});
chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create("viaair-quotes-retry", { periodInMinutes: 1 });
  flushQueue();
});
chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create("viaair-quotes-retry", { periodInMinutes: 1 });
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || !msg.type) return;

  if (msg.type === "viaair-quotes-import") {
    sendImport(msg.url, msg.trigger).then(sendResponse);
    return true;
  }

  if (msg.type === "viaair-send-intent") {
    armIntent(sender.tab?.windowId);
    sendResponse({ ok: true });
    return false;
  }

  if (msg.type === "viaair-diagnostic-arm") {
    if (typeof sender.tab?.id === "number") diagnosticTabs.set(sender.tab.id, { at: Date.now(), windowId: sender.tab.windowId });
    sendResponse({ ok: true });
    return false;
  }

  if (msg.type === "viaair-diagnostic-event") {
    if (typeof sender.tab?.id === "number" && sender.frameId !== 0) {
      relayToTop(sender.tab.id, {
        type: "viaair-diagnostic-relay",
        kind: msg.kind,
        detail: msg.detail,
        frame: `iframe (${msg.frameUrl || "URL indisponível"})`,
      });
    }
    sendResponse({ ok: true });
    return false;
  }

  if (msg.type === "viaair-quotes-status") {
    read(["viaairToken", "viaairQueue", "viaairLast", "viaairTokenInvalid", "viaairAccount"]).then((d) =>
      sendResponse({
        connected: !!d.viaairToken,
        account: d.viaairAccount || null,
        tokenInvalid: !!d.viaairTokenInvalid && !d.viaairToken,
        pending: (d.viaairQueue || []).length,
        last: d.viaairLast || null,
      }),
    );
    return true;
  }

  if (msg.type === "viaair-quotes-auto-pair") {
    (async () => {
      const current = await getToken();
      if (current) { sendResponse({ ok: true, already: true }); return; }
      const ok = await pairWithAccessToken(msg.accessToken);
      sendResponse({ ok });
    })();
    return true;
  }

  if (msg.type === "viaair-quotes-pair-now") {
    autoPairFromPortalTabs().then((ok) => sendResponse({ ok }));
    return true;
  }

  if (msg.type === "viaair-quotes-set-token") {
    const token = (msg.token || "").trim();
    (async () => {
      let valid = false;
      let detail = "";
      try {
        const res = await fetch(`${ENDPOINT}?id=validacao`, { headers: { authorization: `Bearer ${token}` } });
        // 401/403 = token recusado; qualquer outra resposta significa que a autenticação passou
        valid = res.status !== 401 && res.status !== 403;
        detail = "http_" + res.status;
      } catch (e) {
        detail = String(e && e.message ? e.message : e);
      }
      if (valid) {
        await store({ viaairToken: token, viaairTokenInvalid: false });
      } else {
        await store({ viaairToken: "", viaairTokenInvalid: true });
      }
      await logEvent({ event: valid ? "token_ok" : "token_invalid", detail });
      sendResponse({ ok: valid, detail });
    })();
    return true;
  }

  if (msg.type === "viaair-quotes-flush") {
    flushQueue().then(() => sendResponse({ ok: true }));
    return true;
  }
});
