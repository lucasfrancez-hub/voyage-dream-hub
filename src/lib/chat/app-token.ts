/**
 * Token do app instalado (link secreto /admin/app/<token>).
 * Guardado no aparelho pra que o app volte sempre pra própria URL do app,
 * nunca pra tela de login do site.
 */
const CHAVE = "viaair-admin-app-token";

export function lembrarTokenApp(token: string) {
  const limpo = String(token || "").replace(/[^a-zA-Z0-9_-]/g, "");
  if (!limpo) return;
  try {
    window.localStorage.setItem(CHAVE, limpo);
  } catch {
    /* Safari privado: ignora */
  }
  try {
    // Fallback de 1 ano caso o Storage seja limpo pelo iOS.
    document.cookie = `${CHAVE}=${limpo}; path=/; max-age=31536000; samesite=lax`;
  } catch {
    /* noop */
  }
}

export function tokenAppLembrado(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const v = window.localStorage.getItem(CHAVE);
    if (v) return v;
  } catch {
    /* noop */
  }
  try {
    const m = document.cookie.match(new RegExp(`(?:^|; )${CHAVE}=([^;]+)`));
    return m ? decodeURIComponent(m[1]) : null;
  } catch {
    return null;
  }
}

export function esquecerTokenApp() {
  try {
    window.localStorage.removeItem(CHAVE);
  } catch {
    /* noop */
  }
  try {
    document.cookie = `${CHAVE}=; path=/; max-age=0; samesite=lax`;
  } catch {
    /* noop */
  }
}

/** App instalado na tela de início (PWA standalone). */
export function ehAppStandalone(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return (
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true
    );
  } catch {
    return false;
  }
}

/**
 * Marca de que o PIN já foi digitado NESTE aparelho.
 * Sem essa marca o link do app sempre pede o PIN, mesmo com sessão ativa
 * (evita instalar o app e entrar direto sem PIN).
 */
const CHAVE_PIN = "viaair-admin-app-pin-ok";

export function marcarPinValidado(token: string) {
  const limpo = String(token || "").replace(/[^a-zA-Z0-9_-]/g, "");
  if (!limpo) return;
  try {
    window.localStorage.setItem(CHAVE_PIN, limpo);
  } catch {
    /* noop */
  }
  try {
    document.cookie = `${CHAVE_PIN}=${limpo}; path=/; max-age=31536000; samesite=lax`;
  } catch {
    /* noop */
  }
}

export function pinJaValidado(token: string): boolean {
  if (typeof window === "undefined") return false;
  const limpo = String(token || "").replace(/[^a-zA-Z0-9_-]/g, "");
  if (!limpo) return false;
  try {
    if (window.localStorage.getItem(CHAVE_PIN) === limpo) return true;
  } catch {
    /* noop */
  }
  try {
    const m = document.cookie.match(new RegExp(`(?:^|; )${CHAVE_PIN}=([^;]+)`));
    return !!m && decodeURIComponent(m[1]) === limpo;
  } catch {
    return false;
  }
}
