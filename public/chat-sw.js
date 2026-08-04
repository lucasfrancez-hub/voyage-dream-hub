/* Service worker só de notificações da Central de Atendimento (não faz cache de app). */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let dados = { title: "VIA AIR Chat", body: "", url: "/chat/inbox" };
  try {
    if (event.data) dados = { ...dados, ...event.data.json() };
  } catch {
    if (event.data) dados.body = event.data.text();
  }
  event.waitUntil(
    self.registration.showNotification(dados.title, {
      body: dados.body,
      icon: "/icon-chat-192.png",
      badge: "/icon-chat-192.png",
      tag: dados.tag || undefined,
      renotify: !!dados.tag,
      data: { url: dados.url || "/chat/inbox" },
      vibrate: [80, 40, 80],
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const alvo = (event.notification.data && event.notification.data.url) || "/chat/inbox";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((lista) => {
      for (const c of lista) {
        if (c.url.includes("/chat") && "focus" in c) {
          if ("navigate" in c) c.navigate(alvo).catch(() => {});
          return c.focus();
        }
      }
      return self.clients.openWindow(alvo);
    }),
  );
});
