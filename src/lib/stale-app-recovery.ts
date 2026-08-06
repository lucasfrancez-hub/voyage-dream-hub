/**
 * Recuperação de "versão antiga" (iPhone / PWA na tela de início).
 *
 * No Safari/iOS o HTML e os chunks ficam presos no cache do navegador depois de
 * um deploy. O app carrega um bundle velho e quebra com "Invalid server function ID"
 * ou erro de chunk. Um reload simples costuma reservir o mesmo HTML cacheado —
 * por isso aqui limpamos Cache Storage e recarregamos com um parâmetro novo na URL.
 */

const STALE_CODE_PATTERNS = [
  "Invalid server function ID",
  "Failed to fetch dynamically imported module",
  "Importing a module script failed",
  "error loading dynamically imported module",
  "Unable to preload CSS",
  "ChunkLoadError",
  "Loading chunk",
  "Loading CSS chunk",
];

const CHAVE = "__viaair_stale_reload__";
/** Se a última tentativa foi há mais de 5 min, pode tentar de novo. */
const JANELA_MS = 5 * 60 * 1000;

export function isStaleCodeError(error: unknown): boolean {
  const msg =
    error instanceof Error ? `${error.name}: ${error.message}` : String(error ?? "");
  return STALE_CODE_PATTERNS.some((p) => msg.includes(p));
}

function podeTentar(): boolean {
  try {
    const bruto = sessionStorage.getItem(CHAVE);
    const ultimo = bruto ? Number(bruto) : 0;
    if (ultimo && Date.now() - ultimo < JANELA_MS) return false;
    sessionStorage.setItem(CHAVE, String(Date.now()));
    return true;
  } catch {
    return false;
  }
}

/** Limpa caches do app e recarrega forçando o servidor a devolver o HTML novo. */
export async function hardRefreshApp(): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    if ("caches" in window) {
      const nomes = await window.caches.keys().catch(() => [] as string[]);
      await Promise.all(nomes.map((nome) => window.caches.delete(nome).catch(() => false)));
    }
  } catch {
    /* segue mesmo assim */
  }
  const url = new URL(window.location.href);
  url.searchParams.set("v", Date.now().toString(36));
  window.location.replace(url.toString());
}

/** Tenta recuperar uma vez por janela de tempo; devolve true se vai recarregar. */
export function tentarRecuperarVersaoAntiga(error: unknown): boolean {
  if (typeof window === "undefined") return false;
  if (!isStaleCodeError(error)) return false;
  if (!podeTentar()) return false;
  void hardRefreshApp();
  return true;
}

let instalado = false;

/** Escuta erros globais (fora do error boundary) e recupera sozinho. */
export function instalarRecuperacaoVersaoAntiga(): () => void {
  if (typeof window === "undefined" || instalado) return () => {};
  instalado = true;

  const onError = (ev: ErrorEvent) => {
    tentarRecuperarVersaoAntiga(ev.error ?? ev.message);
  };
  const onRejection = (ev: PromiseRejectionEvent) => {
    tentarRecuperarVersaoAntiga(ev.reason);
  };
  const onPreloadError = (ev: Event) => {
    tentarRecuperarVersaoAntiga((ev as CustomEvent<Error>).detail ?? "ChunkLoadError");
  };

  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);
  window.addEventListener("vite:preloadError", onPreloadError);

  return () => {
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onRejection);
    window.removeEventListener("vite:preloadError", onPreloadError);
    instalado = false;
  };
}
