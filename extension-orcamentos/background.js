/* Via Air Orçamentos — service worker.
 * Autenticação por token, fila com retry, deduplicação local e status.
 * Funciona sem o portal Via Air aberto. */

const LOG = "[Via Air Orçamentos]";
console.info(LOG, "Service worker iniciado");

const API_BASE = "https://pedidos.viaair.tur.br";
const ENDPOINT = API_BASE + "/api/public/v1/quote-imports";
const RETRY_MINUTES = [1, 5, 15, 60];

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
async function pollUntilDone(importId, token, timeoutMs = 45_000) {
  const started = Date.now();
  let last = { status: "PROCESSING" };
  while (Date.now() - started < timeoutMs) {
    await new Promise((r) => setTimeout(r, 2000));
    try {
      const res = await fetch(`${ENDPOINT}?id=${encodeURIComponent(importId)}`, {
        headers: { authorization: `Bearer ${token}` },
      });
      if (!res.ok) continue;
      last = await res.json();
      if (last.status === "READY" || last.status === "IMPORT_ERROR") return last;
    } catch (_) {
      /* tenta de novo */
    }
  }
  return last;
}

async function sendImport(url, trigger) {

  const token = await getToken();
  if (!token) {
    console.error(LOG, "token ausente — configure no popup da extensão");
    await logEvent({ event: "no_token", sourceUrl: url });
    return { status: "UNAUTHORIZED", stage: "AUTH", detail: "token_ausente" };
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
      return { status: "UNAUTHORIZED", stage: "API", httpStatus: res.status };
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

    if (final.status !== "READY") {
      console.error(LOG, "importação não concluída", { status: final.status, error: final.error });
      await logEvent({ event: "import_failed", sourceUrl: url, result: final.status, detail: final.error || "" });
      await markImported(url, { result: final.status, importId: data.importId, label });
      return {
        status: "IMPORT_ERROR",
        stage: "PARSE",
        importId: data.importId,
        quoteId: final.quoteId || null,
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
    if (r.status === "READY" || r.status === "PROCESSING") continue;
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

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || !msg.type) return;

  if (msg.type === "viaair-quotes-import") {
    sendImport(msg.url, msg.trigger).then(sendResponse);
    return true;
  }

  if (msg.type === "viaair-quotes-status") {
    read(["viaairToken", "viaairQueue", "viaairLast"]).then((d) =>
      sendResponse({
        connected: !!d.viaairToken,
        pending: (d.viaairQueue || []).length,
        last: d.viaairLast || null,
      }),
    );
    return true;
  }

  if (msg.type === "viaair-quotes-set-token") {
    store({ viaairToken: (msg.token || "").trim() }).then(() => sendResponse({ ok: true }));
    return true;
  }

  if (msg.type === "viaair-quotes-flush") {
    flushQueue().then(() => sendResponse({ ok: true }));
    return true;
  }
});
