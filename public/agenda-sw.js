/* Service worker só de notificações da Agenda VIA AIR (não faz cache de app). */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let dados = { title: "Agenda VIA AIR", body: "", url: "/" };
  try {
    if (event.data) dados = { ...dados, ...event.data.json() };
  } catch {
    if (event.data) dados.body = event.data.text();
  }
  event.waitUntil(
    self.registration.showNotification(dados.title, {
      body: dados.body,
      icon: "/mockups/agenda-icon-192.png",
      badge: "/mockups/agenda-icon-192.png",
      tag: dados.tag || undefined,
      data: { url: dados.url || "/" },
      vibrate: [80, 40, 80],
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const alvo = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((lista) => {
      for (const c of lista) {
        if (c.url.includes("/agenda/") && "focus" in c) return c.focus();
      }
      return self.clients.openWindow(alvo);
    }),
  );
});
