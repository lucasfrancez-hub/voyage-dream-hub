/**
 * Utilitário único de redimensionamento do widget (iframe) do motor de busca.
 * NUNCA envia altura fixa: sempre mede a altura real do conteúdo renderizado.
 */
const EMBED_MESSAGE_TYPE = "VIAAIR_EMBED_RESIZE";
const LEGACY_MESSAGE_TYPE = "viaair-embed-height";
const MIN_EMBED_HEIGHT = 120;
const MAX_EMBED_HEIGHT = 6000;
const EXTRA_BOTTOM_SPACE = 24;

export function isInsideIframe(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

export function isEmbedPath(): boolean {
  if (typeof window === "undefined") return false;
  return window.location.pathname.startsWith("/embed/");
}

/**
 * Altura real do conteúdo. Como html/body podem estar com altura travada pelo
 * próprio iframe, medimos também o wrapper e todos os elementos flutuantes
 * (portais de calendário/dropdown) que ficam fora do fluxo.
 */
function getContentHeight(): number {
  if (typeof document === "undefined") return MIN_EMBED_HEIGHT;
  const body = document.body;
  const html = document.documentElement;

  let height = Math.max(
    body?.scrollHeight ?? 0,
    body?.offsetHeight ?? 0,
    html?.scrollHeight ?? 0,
    html?.offsetHeight ?? 0,
  );

  const candidates = document.querySelectorAll<HTMLElement>(
    ".embed-search-page, #root > *, [data-radix-popper-content-wrapper], .viaair-floating-layer",
  );
  candidates.forEach((el) => {
    const rect = el.getBoundingClientRect();
    if (rect.height <= 0) return;
    height = Math.max(height, Math.round(window.scrollY + rect.bottom));
  });

  return height;
}

let lastSent = 0;

function sendHeight(height: number): void {
  if (!isInsideIframe() || !isEmbedPath()) return;
  const withFloor = Math.max(height, floatingFloor);
  const safeHeight = Math.min(
    MAX_EMBED_HEIGHT,
    Math.max(MIN_EMBED_HEIGHT, Math.ceil(withFloor)),
  );
  if (safeHeight === lastSent) return;
  lastSent = safeHeight;
  window.parent?.postMessage({ type: EMBED_MESSAGE_TYPE, height: safeHeight }, "*");
  // compatibilidade com o snippet antigo já publicado no WordPress
  window.parent?.postMessage({ type: LEGACY_MESSAGE_TYPE, height: safeHeight }, "*");
}

/** Piso enquanto um elemento flutuante está aberto (medido, nunca fixo). */
let floatingFloor = 0;
let floatingObserver: ResizeObserver | null = null;

/** Função única: mede e envia a altura real, com re-checagens após o render. */
export function updateEmbedHeight(extraSpace = 0): void {
  if (typeof window === "undefined") return;
  const run = () => window.requestAnimationFrame(() => sendHeight(getContentHeight() + extraSpace));
  run();
  window.setTimeout(run, 50);
  window.setTimeout(run, 150);
}

export function resizeEmbedToContent(extraSpace = 0): void {
  updateEmbedHeight(extraSpace);
}

function measureFloating(element: HTMLElement, extraSpace: number): number {
  const rect = element.getBoundingClientRect();
  return window.scrollY + rect.bottom + extraSpace;
}

export function resizeEmbedForFloatingElement(
  element: HTMLElement | null,
  extraSpace = EXTRA_BOTTOM_SPACE,
): void {
  if (typeof window === "undefined") return;
  if (!element) {
    updateEmbedHeight();
    return;
  }
  const apply = () => {
    floatingFloor = measureFloating(element, extraSpace);
    sendHeight(Math.max(getContentHeight(), floatingFloor));
  };
  window.requestAnimationFrame(apply);
  window.setTimeout(apply, 50);
  window.setTimeout(apply, 150);

  // Recalcula sozinho quando o painel muda de tamanho (troca de mês, mais
  // sugestões na lista, 1 ou 2 meses no desktop, etc.).
  floatingObserver?.disconnect();
  if (typeof ResizeObserver !== "undefined") {
    floatingObserver = new ResizeObserver(() => apply());
    floatingObserver.observe(element);
  }
}

export function resetEmbedHeight(): void {
  floatingObserver?.disconnect();
  floatingObserver = null;
  floatingFloor = 0;
  updateEmbedHeight();
}

export const embedResizeMessageType = EMBED_MESSAGE_TYPE;
