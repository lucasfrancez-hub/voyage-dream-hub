/* Via Air — background service worker.
 * Content scripts não podem chamar chrome.tabs.captureVisibleTab —
 * então centralizamos a captura aqui. */
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === "viaair-capture") {
    chrome.tabs.captureVisibleTab(sender.tab && sender.tab.windowId, { format: "jpeg", quality: 60 }, (dataUrl) => {
      if (chrome.runtime.lastError) {
        sendResponse({ error: chrome.runtime.lastError.message });
      } else {
        sendResponse({ dataUrl });
      }
    });
    return true; // async response
  }
});
