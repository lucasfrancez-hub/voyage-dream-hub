/**
 * Utilitário único de redimensionamento do widget (iframe) do motor de busca.
 * Elementos flutuantes (calendário, autocomplete) não conseguem ultrapassar o
 * iframe, então avisamos a página pai qual altura o widget precisa ter.
 */
const EMBED_MESSAGE_TYPE = "VIAAIR_EMBED_RESIZE";
const LEGACY_MESSAGE_TYPE = "viaair-embed-height";
const DEFAULT_EMBED_HEIGHT = 420;
const MAX_EMBED_HEIGHT = 2400;
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

function getDocumentHeight(): number {
  if (typeof document === "undefined") return DEFAULT_EMBED_HEIGHT;
  const body = document.body;
  const html = document.documentElement;
  return Math.max(
    body?.scrollHeight ?? 0,
    body?.offsetHeight ?? 0,
    html?.clientHeight ?? 0,
    html?.scrollHeight ?? 0,
    html?.offsetHeight ?? 0,
    DEFAULT_EMBED_HEIGHT,
  );
}

let lastSent = 0;

function sendHeight(height: number): void {
  if (!isInsideIframe() || !isEmbedPath()) return;
  const withFloor = Math.max(height, floatingFloor);
  const safeHeight = Math.min(
    MAX_EMBED_HEIGHT,
    Math.max(DEFAULT_EMBED_HEIGHT, Math.ceil(withFloor)),
  );
  if (safeHeight === lastSent) return;
  lastSent = safeHeight;
  const payload = { type: EMBED_MESSAGE_TYPE, height: safeHeight };
  window.parent?.postMessage(payload, "*");
  // compatibilidade com o snippet antigo já publicado no WordPress
  window.parent?.postMessage({ type: LEGACY_MESSAGE_TYPE, height: safeHeight }, "*");
}

/**
 * Piso de altura enquanto um elemento flutuante (calendário/dropdown) está
 * aberto. Sem isso, o observador global da página encolhe o iframe logo depois
 * e o navegador cria a barra de rolagem interna.
 */
let floatingFloor = 0;
let floatingObserver: ResizeObserver | null = null;

export function resizeEmbedToContent(extraSpace = 0): void {
  if (typeof window === "undefined") return;
  window.requestAnimationFrame(() => {
    sendHeight(getDocumentHeight() + extraSpace);
  });
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
    resizeEmbedToContent();
    return;
  }
  const apply = () => {
    floatingFloor = measureFloating(element, extraSpace);
    sendHeight(Math.max(getDocumentHeight(), floatingFloor));
  };
  window.requestAnimationFrame(apply);

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
  resizeEmbedToContent();
}

export const embedResizeMessageType = EMBED_MESSAGE_TYPE;

