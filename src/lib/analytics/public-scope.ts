/**
 * Escopo das métricas: só o tráfego PÚBLICO do site.
 * Acessos internos (área administrativa, chat, autenticação) e qualquer
 * navegação de usuário logado são ignorados na coleta e nos relatórios.
 */

/** Prefixos de rota considerados internos (nunca entram nas métricas). */
export const ROTAS_INTERNAS = [
  "/admin",
  "/auth",
  "/login",
  "/chat",
  "/api",
  "/agenda",
  "/conta",
] as const;

/** Domínios de teste/preview — nunca contam como tráfego real. */
export const HOSTS_INTERNOS = [
  "lovableproject.com",
  "lovable.app",
  "lovable.dev",
  "localhost",
  "127.0.0.1",
] as const;

export function isHostInterno(host?: string | null): boolean {
  if (!host) return false;
  const h = host.toLowerCase().replace(/^www\./, "").split(":")[0];
  return HOSTS_INTERNOS.some((d) => h === d || h.endsWith(`.${d}`));
}

export function isRotaInterna(path?: string | null): boolean {
  if (!path) return false;
  const p = path.toLowerCase();
  return ROTAS_INTERNAS.some((r) => p === r || p.startsWith(`${r}/`) || p.startsWith(`${r}?`));
}

/** Há sessão autenticada no navegador? (token do Supabase no localStorage) */
export function isUsuarioLogado(): boolean {
  if (typeof window === "undefined") return false;
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const k = localStorage.key(i);
      if (k && /^sb-.*-auth-token$/.test(k) && localStorage.getItem(k)) return true;
    }
  } catch {
    /* modo privado */
  }
  return false;
}

/** Deve ignorar este evento? */
export function ignorarEvento(path?: string | null): boolean {
  if (typeof window !== "undefined" && isHostInterno(window.location.hostname)) return true;
  return isRotaInterna(path) || isUsuarioLogado();
}
