const cartId = process.env["CART_ID"]!;
const ws = new WebSocket("wss://event.onertravel.com/production");
ws.addEventListener("open", () => {
  ws.send(JSON.stringify({ action: "OnSubscribe", SubscriptionKey: `PAY-${cartId}`, GetLastMessage: true }));
});
ws.addEventListener("message", (e) => console.log("EV", String(e.data).slice(0, 1200)));
setTimeout(() => process.exit(0), 45_000);
