/** Utilidades de Web Push usadas no navegador (Chat). */

export const SW_URL = "/chat-sw.js";

export function b64urlParaUint8(base64: string) {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + pad).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function ehStandalone() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

export function ehIOS() {
  if (typeof navigator === "undefined") return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

export function suportaPush() {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

/** Nome amigável do aparelho, só para o usuário reconhecer na lista. */
export function nomeDoAparelho() {
  if (typeof navigator === "undefined") return "Aparelho";
  const ua = navigator.userAgent;
  const so = /iPhone/.test(ua)
    ? "iPhone"
    : /iPad/.test(ua)
      ? "iPad"
      : /Android/.test(ua)
        ? "Android"
        : /Mac/.test(ua)
          ? "Mac"
          : /Windows/.test(ua)
            ? "Windows"
            : "Computador";
  const nav = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "Navegador";
  return `${so} · ${nav}`;
}

/** Manda o total de não lidas pro service worker acertar o badge do ícone. */
export async function atualizarBadge(total: number) {
  try {
    if ("setAppBadge" in navigator && total > 0) {
      await (navigator as Navigator & { setAppBadge(n: number): Promise<void> }).setAppBadge(total);
    } else if ("clearAppBadge" in navigator && total === 0) {
      await (navigator as Navigator & { clearAppBadge(): Promise<void> }).clearAppBadge();
    }
    const reg = await navigator.serviceWorker?.getRegistration(SW_URL);
    reg?.active?.postMessage({ type: "badge", count: total });
  } catch {
    /* badge é opcional */
  }
}
