import { toBlob } from "html-to-image";

export type ArtDelivery = "downloaded" | "shared" | "cancelled";

type CaptureOptions = {
  width: number;
  height: number;
  innerSelector: string;
  backgroundSelector: string;
  backgroundDataUrl: string;
  gradientMiddle: number;
  gradientTopOpacity: number;
};

function nextPaint() {
  return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

function loadImage(src: string, label: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "sync";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Não foi possível carregar ${label}.`));
    image.src = src;
  });
}

export function createArtHost(width: number, height: number) {
  const host = document.createElement("div");
  // O Safari deixa de rasterizar imagens em elementos posicionados muito longe
  // da viewport. Mantemos a arte renderizada na origem, atrás da aplicação.
  host.style.cssText = [
    "position:fixed",
    "left:0",
    "top:0",
    `width:${width}px`,
    `height:${height}px`,
    "pointer-events:none",
    "z-index:-2147483647",
    "overflow:hidden",
    "contain:layout paint",
  ].join(";");
  document.body.appendChild(host);
  return host;
}

export async function waitForArtAssets(host: HTMLElement) {
  const images = Array.from(host.querySelectorAll<HTMLImageElement>("img"));
  await Promise.all(
    images.map(async (image) => {
      if (!image.complete) {
        await new Promise<void>((resolve, reject) => {
          image.addEventListener("load", () => resolve(), { once: true });
          image.addEventListener("error", () => reject(new Error("Uma imagem da arte não carregou.")), {
            once: true,
          });
        });
      }
      if (image.naturalWidth === 0) throw new Error("Uma imagem da arte não carregou.");
      try {
        await image.decode();
      } catch {
        // Alguns Safari antigos rejeitam decode() mesmo depois do evento load.
      }
    }),
  );
  try {
    await document.fonts?.ready;
  } catch {
    // As fontes têm fallback local e não devem bloquear a exportação.
  }
  await nextPaint();
  await nextPaint();
}

function drawCover(context: CanvasRenderingContext2D, image: HTMLImageElement, width: number, height: number) {
  const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
  const sourceWidth = width / scale;
  const sourceHeight = height / scale;
  const sourceX = (image.naturalWidth - sourceWidth) / 2;
  // O layout usa object-position:center top.
  context.drawImage(image, sourceX, 0, sourceWidth, sourceHeight, 0, 0, width, height);
}

export async function captureArtPng(stage: HTMLElement, options: CaptureOptions): Promise<Blob> {
  const inner = stage.querySelector<HTMLElement>(options.innerSelector);
  const background = stage.querySelector<HTMLElement>(options.backgroundSelector);
  if (!inner || !background) throw new Error("Falha ao montar as camadas da arte.");

  const photo = await loadImage(options.backgroundDataUrl, "a foto de fundo");
  const previousStageBackground = stage.style.background;
  const previousInnerBackground = inner.style.background;
  const previousBackgroundDisplay = background.style.display;

  let foregroundBlob: Blob | null = null;
  try {
    // A foto é composta diretamente no canvas. Isso evita a falha do WebKit ao
    // serializar data URLs grandes dentro do SVG usado pelo html-to-image.
    stage.style.background = "transparent";
    inner.style.background = "transparent";
    background.style.display = "none";
    await nextPaint();

    foregroundBlob = await toBlob(stage, {
      width: options.width,
      height: options.height,
      canvasWidth: options.width,
      canvasHeight: options.height,
      pixelRatio: 1,
      cacheBust: false,
      skipFonts: true,
      backgroundColor: "transparent",
    });
  } finally {
    stage.style.background = previousStageBackground;
    inner.style.background = previousInnerBackground;
    background.style.display = previousBackgroundDisplay;
  }

  if (!foregroundBlob) throw new Error("O navegador não conseguiu gerar o PNG.");
  const foregroundUrl = URL.createObjectURL(foregroundBlob);
  try {
    const foreground = await loadImage(foregroundUrl, "a composição da arte");
    const canvas = document.createElement("canvas");
    canvas.width = options.width;
    canvas.height = options.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("O navegador não conseguiu preparar a imagem.");

    drawCover(context, photo, options.width, options.height);
    const gradient = context.createLinearGradient(0, 0, 0, options.height);
    gradient.addColorStop(0, `rgba(0,0,0,${options.gradientTopOpacity})`);
    gradient.addColorStop(options.gradientMiddle, "rgba(0,0,0,0)");
    gradient.addColorStop(1, "rgba(0,0,0,0.95)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, options.width, options.height);
    context.drawImage(foreground, 0, 0, options.width, options.height);

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("O navegador não conseguiu finalizar o PNG."))),
        "image/png",
      );
    });
  } finally {
    URL.revokeObjectURL(foregroundUrl);
  }
}

function isAppleMobile() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function offerAppleShare(file: File): Promise<ArtDelivery> {
  return new Promise((resolve) => {
    const previewUrl = URL.createObjectURL(file);
    const overlay = document.createElement("div");
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", "Salvar arte");
    overlay.style.cssText = [
      "position:fixed",
      "inset:0",
      "z-index:2147483647",
      "display:flex",
      "align-items:flex-end",
      "justify-content:center",
      "padding:16px",
      "background:color-mix(in srgb,var(--foreground) 55%,transparent)",
    ].join(";");

    const panel = document.createElement("div");
    panel.style.cssText = [
      "width:min(100%,420px)",
      "max-height:92dvh",
      "overflow:auto",
      "padding:16px",
      "border-radius:8px",
      "background:var(--background)",
      "color:var(--foreground)",
      "box-shadow:0 24px 64px rgba(0,0,0,.35)",
    ].join(";");

    const preview = document.createElement("img");
    preview.src = previewUrl;
    preview.alt = "Prévia da arte pronta";
    preview.style.cssText = "display:block;width:100%;max-height:68dvh;object-fit:contain;border-radius:6px;background:var(--muted)";

    const actions = document.createElement("div");
    actions.style.cssText = "display:grid;grid-template-columns:1fr auto;gap:10px;margin-top:14px";

    const shareButton = document.createElement("button");
    shareButton.type = "button";
    shareButton.textContent = "Salvar ou compartilhar";
    shareButton.style.cssText = [
      "min-height:48px",
      "padding:0 18px",
      "border:0",
      "border-radius:6px",
      "background:var(--primary)",
      "color:var(--primary-foreground)",
      "font:600 15px inherit",
    ].join(";");

    const cancelButton = document.createElement("button");
    cancelButton.type = "button";
    cancelButton.textContent = "Cancelar";
    cancelButton.style.cssText = [
      "min-height:48px",
      "padding:0 16px",
      "border:1px solid var(--border)",
      "border-radius:6px",
      "background:var(--secondary)",
      "color:var(--secondary-foreground)",
      "font:600 15px inherit",
    ].join(";");

    const finish = (delivery: ArtDelivery) => {
      overlay.remove();
      URL.revokeObjectURL(previewUrl);
      resolve(delivery);
    };

    shareButton.addEventListener("click", async () => {
      try {
        await navigator.share({ files: [file] });
        finish("shared");
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          finish("cancelled");
          return;
        }
        // Ainda dentro do clique do usuário: o download via Blob URL é aceito
        // mesmo em versões do Safari sem compartilhamento de arquivos.
        downloadBlob(file, file.name);
        finish("downloaded");
      }
    });
    cancelButton.addEventListener("click", () => finish("cancelled"));

    actions.append(shareButton, cancelButton);
    panel.append(preview, actions);
    overlay.append(panel);
    document.body.appendChild(overlay);
    shareButton.focus();
  });
}

export async function deliverArtPng(blob: Blob, filename: string): Promise<ArtDelivery> {
  const file = new File([blob], filename, { type: "image/png" });

  // A geração assíncrona perde a ativação do clique no WebKit. Mostramos uma
  // prévia com um segundo botão, cujo clique abre a folha de compartilhamento
  // e permite “Salvar Imagem” de forma confiável.
  if (isAppleMobile() && navigator.canShare?.({ files: [file] })) {
    return offerAppleShare(file);
  }

  downloadBlob(blob, filename);
  return "downloaded";
}