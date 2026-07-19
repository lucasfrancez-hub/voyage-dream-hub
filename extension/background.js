/* Via Air — background service worker.
 * Content scripts não podem chamar chrome.tabs.captureVisibleTab —
 * então centralizamos a captura aqui. */
let captureQueue = Promise.resolve();
let lastCaptureAt = 0;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function captureTab(windowId) {
  // O Chrome limita captureVisibleTab a duas chamadas por segundo. Serializar
  // aqui também protege contra mensagens simultâneas vindas dos iframes.
  const elapsed = Date.now() - lastCaptureAt;
  if (elapsed < 650) await wait(650 - elapsed);

  return new Promise((resolve) => {
    chrome.tabs.captureVisibleTab(windowId, { format: "jpeg", quality: 60 }, (dataUrl) => {
      lastCaptureAt = Date.now();
      const error = chrome.runtime.lastError;
      resolve(error ? { error: error.message } : { dataUrl });
    });
  });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === "viaair-capture") {
    if (!sender.tab || typeof sender.tab.windowId !== "number") {
      sendResponse({ error: "A aba ativa não foi identificada. Recarregue a página da reserva." });
      return false;
    }
    captureQueue = captureQueue
      .then(() => captureTab(sender.tab.windowId))
      .catch((error) => ({ error: String(error && error.message ? error.message : error) }));
    captureQueue.then(sendResponse);
    return true; // async response
  }
});
