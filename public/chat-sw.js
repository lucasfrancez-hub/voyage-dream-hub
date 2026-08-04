/* Service worker de notificações VIA AIR (mensagens + agenda). Não faz cache de app. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let dados = {};
  try {
    dados = event.data ? event.data.json() : {};
  } catch {
    dados = { body: event.data ? event.data.text() : "Você tem um novo aviso." };
  }

  const ehAgenda = dados.type === "calendar_reminder" || dados.type === "calendar_all_day";
  const titulo = dados.title || (ehAgenda ? "Lembrete da agenda" : "VIA AIR Chat");
  const url = dados.url || (ehAgenda ? "/chat/agenda" : "/chat/inbox");

  const badge =
    typeof dados.unreadCount === "number" && "setAppBadge" in self.registration
      ? self.registration.setAppBadge(dados.unreadCount).catch(() => {})
      : Promise.resolve();

  event.waitUntil(
    Promise.all([
      self.registration.showNotification(titulo, {
        body: dados.body || "Você tem um novo aviso.",
        icon: dados.icon || "/icon-chat-192.png",
        badge: dados.badge || "/icon-chat-192.png",
        tag: dados.tag || `${dados.type || "aviso"}-${Date.now()}`,
        renotify: true,
        timestamp: dados.eventTimestamp || Date.now(),
        data: {
          type: dados.type || null,
          url,
          eventId: dados.eventId || null,
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
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (lista) => {
      for (const c of lista) {
        if ("focus" in c) {
          if ("navigate" in c) await c.navigate(alvo).catch(() => {});
          return c.focus();
        }
      }
      return self.clients.openWindow(alvo);
    }),
  );
});

/* O app avisa quantas conversas/compromissos ainda estão pendentes para acertar o badge. */
self.addEventListener("message", (event) => {
  const d = event.data || {};
  if (d.type !== "badge") return;
  const n = Number(d.count) || 0;
  if (n > 0 && "setAppBadge" in self.registration) self.registration.setAppBadge(n).catch(() => {});
  if (n === 0 && "clearAppBadge" in self.registration) self.registration.clearAppBadge().catch(() => {});
});
