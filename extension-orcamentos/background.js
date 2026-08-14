/* Via Air Orçamentos — service worker.
 * Autenticação por token, fila com retry, deduplicação local e status.
 * Funciona sem o portal Via Air aberto. */

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

async function sendImport(url, trigger) {
  const token = await getToken();
  if (!token) return { status: "UNAUTHORIZED" };

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

    if (res.status === 401) {
      await logEvent({ event: "unauthorized", sourceUrl: url });
      return { status: "UNAUTHORIZED" };
    }
    if (!res.ok) throw new Error("http_" + res.status);

    const data = await res.json();
    const label = data.quote ? `#${data.quote.quote_number} ${data.quote.destination || data.quote.title || ""}` : url;
    await markImported(url, { result: data.status, importId: data.importId, label });
    await queueRemove(url);
    await logEvent({ event: "imported", sourceUrl: url, result: data.status, importId: data.importId });
    chrome.tabs.query({}, (tabs) =>
      tabs.forEach((t) => t.id && chrome.tabs.sendMessage(t.id, { type: "viaair-quotes-updated" }, () => void chrome.runtime.lastError)),
    );
    return { status: data.status, duplicate: data.duplicate || !!already, importId: data.importId };
  } catch (e) {
    await queueAdd({ url, trigger });
    await logEvent({ event: "queued", sourceUrl: url, result: String(e && e.message ? e.message : e) });
    return { status: "QUEUED" };
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
