/**
 * Utilitário único de redimensionamento do widget (iframe) do motor de busca.
 *
 * Duas mensagens distintas:
 *  - VIAAIR_EMBED_RESIZE  → altura REAL do formulário (o espaço que o motor ocupa
 *    na página do WordPress). Nunca inclui calendários/listas.
 *  - VIAAIR_EMBED_OVERLAY → altura extra necessária enquanto um painel flutuante
 *    está aberto. O script do widget usa isso pra sobrepor o conteúdo da página,
 *    SEM aumentar a altura do bloco do motor.
 */
const EMBED_MESSAGE_TYPE = "VIAAIR_EMBED_RESIZE";
const OVERLAY_MESSAGE_TYPE = "VIAAIR_EMBED_OVERLAY";
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
 * Altura real do conteúdo do motor — IGNORANDO os elementos flutuantes
 * (calendário, autocomplete, passageiros), que viram overlay.
 */
function getContentHeight(): number {
  if (typeof document === "undefined") return MIN_EMBED_HEIGHT;

  let height = 0;
  const candidates = document.querySelectorAll<HTMLElement>(".embed-search-page, #root > *");
  candidates.forEach((el) => {
    const rect = el.getBoundingClientRect();
    if (rect.height <= 0) return;
    height = Math.max(height, Math.round(window.scrollY + rect.bottom));
  });

  if (height <= 0) {
    const body = document.body;
    height = Math.max(body?.scrollHeight ?? 0, body?.offsetHeight ?? 0);
  }

  return height;
}

let lastSent = 0;
let lastOverlay = -1;

function clamp(height: number): number {
  return Math.min(MAX_EMBED_HEIGHT, Math.max(MIN_EMBED_HEIGHT, Math.ceil(height)));
}

function sendHeight(height: number): void {
  if (!isInsideIframe() || !isEmbedPath()) return;
  const safeHeight = clamp(height);
  if (safeHeight === lastSent) return;
  lastSent = safeHeight;
  window.parent?.postMessage({ type: EMBED_MESSAGE_TYPE, height: safeHeight }, "*");
  // compatibilidade com o snippet antigo já publicado no WordPress
  window.parent?.postMessage({ type: LEGACY_MESSAGE_TYPE, height: safeHeight }, "*");
}

function sendOverlay(height: number): void {
  if (!isInsideIframe() || !isEmbedPath()) return;
  const value = height > 0 ? clamp(height) : 0;
  if (value === lastOverlay) return;
  lastOverlay = value;
  window.parent?.postMessage({ type: OVERLAY_MESSAGE_TYPE, height: value }, "*");
}

type FloatingOwner = object;
type FloatingEntry = {
  element: HTMLElement;
  extraSpace: number;
  observer: ResizeObserver | null;
};

// Cada painel mantém seu próprio observer. Antes havia um único observer global:
// abrir um autocomplete desconectava o calendário e fechar qualquer painel zerava
// o overlay dos demais.
const floatingEntries = new Map<FloatingOwner, FloatingEntry>();
const DEFAULT_FLOATING_OWNER: FloatingOwner = {};

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

function applyFloatingState(): void {
  let overlay = 0;
  floatingEntries.forEach(({ element, extraSpace }) => {
    if (!element.isConnected) return;
    overlay = Math.max(overlay, measureFloating(element, extraSpace));
  });
  sendOverlay(overlay > 0 ? Math.max(getContentHeight(), overlay) : 0);
  sendHeight(getContentHeight());
}

/** Registra/atualiza um painel flutuante sem interferir nos demais. */
export function resizeEmbedForFloatingElement(
  element: HTMLElement | null,
  extraSpace = EXTRA_BOTTOM_SPACE,
  owner: FloatingOwner = DEFAULT_FLOATING_OWNER,
): void {
  if (typeof window === "undefined") return;
  if (!element) {
    resetEmbedHeight(owner);
    return;
  }

  const previous = floatingEntries.get(owner);
  previous?.observer?.disconnect();

  let observer: ResizeObserver | null = null;
  if (typeof ResizeObserver !== "undefined") {
    observer = new ResizeObserver(() => window.requestAnimationFrame(applyFloatingState));
    observer.observe(element);
  }
  floatingEntries.set(owner, { element, extraSpace, observer });
  window.requestAnimationFrame(applyFloatingState);
}

/** Remove somente o painel do chamador; o overlay zera apenas quando o último fecha. */
export function resetEmbedHeight(owner: FloatingOwner = DEFAULT_FLOATING_OWNER): void {
  const entry = floatingEntries.get(owner);
  entry?.observer?.disconnect();
  floatingEntries.delete(owner);
  applyFloatingState();
  updateEmbedHeight();
}

export const embedResizeMessageType = EMBED_MESSAGE_TYPE;
export const embedOverlayMessageType = OVERLAY_MESSAGE_TYPE;
