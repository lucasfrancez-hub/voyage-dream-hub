/* Service worker de notificações da Central de Atendimento (não faz cache de app). */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let dados = { title: "VIA AIR Chat", body: "", url: "/chat/inbox" };
  try {
    if (event.data) dados = { ...dados, ...event.data.json() };
  } catch {
    if (event.data) dados.body = event.data.text();
  }
  const badge =
    typeof dados.unreadCount === "number" && "setAppBadge" in self.registration
      ? self.registration.setAppBadge(dados.unreadCount).catch(() => {})
      : Promise.resolve();

  event.waitUntil(
    Promise.all([
      self.registration.showNotification(dados.title, {
        body: dados.body,
        icon: "/icon-chat-192.png",
        badge: "/icon-chat-192.png",
        tag: dados.tag || undefined,
        renotify: !!dados.tag,
        data: {
          url: dados.url || "/chat/inbox",
          conversationId: dados.conversationId || null,
          messageId: dados.messageId || null,
        },
        vibrate: [80, 40, 80],
      }),
      badge,
    ]),
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

/* O app avisa quantas conversas ainda estão não lidas para acertar/limpar o badge. */
self.addEventListener("message", (event) => {
  const d = event.data || {};
  if (d.type !== "badge") return;
  const n = Number(d.count) || 0;
  if (n > 0 && "setAppBadge" in self.registration) self.registration.setAppBadge(n).catch(() => {});
  if (n === 0 && "clearAppBadge" in self.registration) self.registration.clearAppBadge().catch(() => {});
});
