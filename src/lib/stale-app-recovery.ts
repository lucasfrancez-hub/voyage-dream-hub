/**
 * Recuperação de "versão antiga" (iPhone / PWA na tela de início).
 *
 * Causa raiz tratada aqui: depois de um deploy, o aparelho continua com o
 * documento HTML antigo aberto (o iOS restaura o app exatamente como estava).
 * Ao navegar para uma rota, o app tenta importar um chunk que já não existe
 * (`/assets/chat.inbox-<hash>.js` → 404) e o React não monta a tela.
 *
 * Estratégia:
 *  1. detectar qualquer falha de import/chunk (não depende de uma frase exata);
 *  2. recarregar IMEDIATAMENTE na primeira falha, com cache-busting na URL;
 *  3. contar tentativas pela própria URL (funciona sem sessionStorage);
 *  4. no máximo 2 recuperações automáticas — depois disso, botão manual.
 *
 * Nada aqui apaga sessão, cookie `via_chat_dev`, PIN, tema ou push.
 */

const PARAM_REFRESH = "__app_refresh";
const PARAM_RECOVERY = "__app_recovery";
const MAX_TENTATIVAS = 2;

const PADROES = [
  "invalid server function id",
  "failed to fetch dynamically imported module",
  "error loading dynamically imported module",
  "importing a module script failed",
  "failed to load module script",
  "expected a javascript module script",
  "unable to preload css",
  "chunkloaderror",
  "loading chunk",
  "loading css chunk",
  "dynamically imported module",
  "module script failed",
];

/** Detecta erro de código velho sem depender da mensagem exata do navegador. */
export function isStaleCodeError(error: unknown): boolean {
  const msg = (
    error instanceof Error ? `${error.name}: ${error.message}` : String(error ?? "")
  ).toLowerCase();
  if (!msg) return false;
  if (PADROES.some((p) => msg.includes(p))) return true;
  // "Failed to fetch"/"Load failed" apontando para um asset com hash.
  if (/\/assets\/[\w.-]+\.(js|mjs|css)/.test(msg)) return true;
  if ((msg.includes("failed to fetch") || msg.includes("load failed")) && msg.includes(".js"))
    return true;
  return false;
}

/* ------------------------------------------------------------------ *
 * Contador de tentativas: URL (sempre funciona) + memória + storage.  *
 * ------------------------------------------------------------------ */

let tentativasMemoria = 0;

function tentativasNaUrl(): number {
  try {
    const v = new URL(window.location.href).searchParams.get(PARAM_RECOVERY);
    const n = v ? Number(v) : 0;
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

function tentativasNoStorage(): number {
  try {
    const n = Number(sessionStorage.getItem(PARAM_RECOVERY) ?? "0");
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

export function tentativasDeRecuperacao(): number {
  if (typeof window === "undefined") return 0;
  return Math.max(tentativasNaUrl(), tentativasNoStorage(), tentativasMemoria);
}

/** Já esgotamos as recuperações automáticas desta navegação? */
export function recuperacaoEsgotada(): boolean {
  return tentativasDeRecuperacao() >= MAX_TENTATIVAS;
}

/* ------------------------------------------------------------------ *
 * Diagnóstico (sem PIN, sem token, sem cookie).                       *
 * ------------------------------------------------------------------ */

export function registrarDiagnostico(extra: Record<string, unknown>): void {
  if (typeof window === "undefined") return;
  let buildId = "desconhecida";
  try {
    // import estático evitado de propósito: este módulo é carregado no boot.
    buildId = (globalThis as { __APP_BUILD_ID__?: string }).__APP_BUILD_ID__ ?? "desconhecida";
  } catch {
    /* segue */
  }
  const standalone =
    (typeof matchMedia === "function" && matchMedia("(display-mode: standalone)").matches) ||
    (navigator as unknown as { standalone?: boolean }).standalone === true;
  const info = {
    escopo: "atualizacao-app",
    versaoAberta: buildId,
    rota: window.location.pathname,
    navegador: navigator.userAgent.slice(0, 120),
    plataforma: navigator.platform,
    modo: standalone ? "standalone" : "navegador",
    tentativas: tentativasDeRecuperacao(),
    quando: new Date().toISOString(),
    ...extra,
  };
  console.warn("[VIA AIR]", info);
  void import("./lovable-error-reporting")
    .then(({ reportLovableError }) =>
      reportLovableError(new Error(`atualizacao-app: ${String(extra.motivo ?? extra.tipo ?? "")}`), {
        boundary: "stale_app_recovery",
        ...info,
      } as Record<string, unknown>),
    )
    .catch(() => {});
}

/* ------------------------------------------------------------------ *
 * Atualização propriamente dita.                                      *
 * ------------------------------------------------------------------ */

/**
 * Navegação completa com cache-busting: obriga o navegador a buscar de novo
 * o HTML, o manifesto de módulos e os bundles atuais. Não usa reload(),
 * que pode reaproveitar o mesmo documento antigo no iOS.
 */
export async function hardRefreshApp(): Promise<void> {
  if (typeof window === "undefined") return;
  const tentativa = tentativasDeRecuperacao() + 1;
  tentativasMemoria = tentativa;
  try {
    sessionStorage.setItem(PARAM_RECOVERY, String(tentativa));
  } catch {
    /* fallback já garantido pela URL e pela memória */
  }
  const url = new URL(window.location.href);
  url.searchParams.set(PARAM_REFRESH, Date.now().toString(36));
  url.searchParams.set(PARAM_RECOVERY, String(tentativa));
  window.location.replace(url.toString());
  // dá tempo da navegação começar antes de qualquer outra coisa rodar
  await new Promise((r) => setTimeout(r, 400));
}

/** Recupera na primeira falha; devolve true se a página vai ser recarregada. */
export function tentarRecuperarVersaoAntiga(error: unknown): boolean {
  if (typeof window === "undefined") return false;
  if (!isStaleCodeError(error)) return false;
  if (recuperacaoEsgotada()) {
    registrarDiagnostico({
      tipo: "recuperacao-esgotada",
      motivo: "chunk-404",
      erro: error instanceof Error ? error.message : String(error ?? ""),
      recuperado: false,
    });
    return false;
  }
  registrarDiagnostico({
    tipo: "chunk-antigo",
    motivo: "chunk-404",
    erro: error instanceof Error ? error.message : String(error ?? ""),
    refreshAutomatico: true,
  });
  void hardRefreshApp();
  return true;
}

/**
 * Depois que o app abriu bem, tira os parâmetros técnicos da URL
 * (sem recarregar) e zera o contador.
 */
export function limparMarcasDeRecuperacao(): void {
  if (typeof window === "undefined") return;
  try {
    const url = new URL(window.location.href);
    const tinha = url.searchParams.has(PARAM_REFRESH) || url.searchParams.has(PARAM_RECOVERY);
    if (tinha) {
      registrarDiagnostico({ tipo: "recuperacao-ok", motivo: "boot-apos-refresh", recuperado: true });
      url.searchParams.delete(PARAM_REFRESH);
      url.searchParams.delete(PARAM_RECOVERY);
      window.history.replaceState(window.history.state, "", url.toString());
    }
    tentativasMemoria = 0;
    try {
      sessionStorage.removeItem(PARAM_RECOVERY);
    } catch {
      /* ok */
    }
  } catch {
    /* ok */
  }
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
  // Falha de carregamento de <script>/<link> não vira ErrorEvent com mensagem:
  // só aparece na fase de captura, no próprio elemento.
  const onResourceError = (ev: Event) => {
    const alvo = ev.target as HTMLElement | null;
    if (!alvo) return;
    const src =
      (alvo as HTMLScriptElement).src ?? (alvo as HTMLLinkElement).href ?? "";
    if (typeof src === "string" && /\/assets\/[\w.-]+\.(js|mjs|css)/.test(src)) {
      tentarRecuperarVersaoAntiga(`Failed to load module script: ${src}`);
    }
  };

  window.addEventListener("error", onError);
  window.addEventListener("error", onResourceError, true);
  window.addEventListener("unhandledrejection", onRejection);
  window.addEventListener("vite:preloadError", onPreloadError);

  return () => {
    window.removeEventListener("error", onError);
    window.removeEventListener("error", onResourceError, true);
    window.removeEventListener("unhandledrejection", onRejection);
    window.removeEventListener("vite:preloadError", onPreloadError);
    instalado = false;
  };
}
