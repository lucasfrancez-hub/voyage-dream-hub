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

function isSafari() {
  const ua = navigator.userAgent;
  // Safari (desktop e iOS) — exclui Chrome/Edge/Firefox/Opera que também têm "Safari" no UA.
  return /^((?!chrome|android|crios|fxios|edgios|edg|opr).)*safari/i.test(ua) || isAppleMobile();
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

function offerPreviewSheet(file: File, opts: { canShare: boolean }): Promise<ArtDelivery> {
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
      "align-items:center",
      "justify-content:center",
      "padding:24px",
      "background:rgba(15,23,42,.72)",
      "backdrop-filter:blur(20px) saturate(150%)",
      "-webkit-backdrop-filter:blur(20px) saturate(150%)",
      "-webkit-font-smoothing:antialiased",
      "animation:viaair-art-fade .18s ease-out",
    ].join(";");

    // Injeta keyframes uma única vez.
    if (!document.getElementById("viaair-art-export-styles")) {
      const style = document.createElement("style");
      style.id = "viaair-art-export-styles";
      style.textContent = `
        @keyframes viaair-art-fade { from { opacity: 0 } to { opacity: 1 } }
        @keyframes viaair-art-pop { from { opacity: 0; transform: translateY(12px) scale(.98) } to { opacity: 1; transform: none } }
        .viaair-art-btn { transition: transform .12s ease, filter .12s ease, box-shadow .12s ease, background-color .12s ease; }
        .viaair-art-btn:hover { filter: brightness(1.03); }
        .viaair-art-btn:active { transform: scale(.985); }
        .viaair-art-cancel:hover { background: rgba(228,228,231,.9) !important; }
      `;
      document.head.appendChild(style);
    }

    const panel = document.createElement("div");
    panel.style.cssText = [
      "width:min(100%,400px)",
      "max-height:88dvh",
      "display:flex",
      "flex-direction:column",
      "overflow:hidden",
      "background:transparent",
      "color:#ffffff",
      "font-family:'Plus Jakarta Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,sans-serif",
      "animation:viaair-art-pop .22s cubic-bezier(.2,.9,.3,1)",
    ].join(";");

    // Cabeçalho
    const header = document.createElement("div");
    header.style.cssText = "padding:24px 24px 18px;text-align:center;flex-shrink:0";
    const title = document.createElement("h2");
    title.textContent = "Sua arte está pronta!";
    title.style.cssText = "margin:0;font-size:20px;font-weight:700;letter-spacing:-.01em;color:#ffffff";
    const subtitle = document.createElement("p");
    subtitle.textContent = "Revise o flyer gerado para o pacote VIA AIR";
    subtitle.style.cssText = "margin:6px 0 0;font-size:14px;color:rgba(255,255,255,.75)";
    header.append(title, subtitle);

    // Área da prévia
    const previewWrap = document.createElement("div");
    previewWrap.style.cssText = "padding:0 24px 20px;flex:1 1 auto;min-height:0;display:flex";
    const previewBox = document.createElement("div");
    previewBox.style.cssText = [
      "position:relative",
      "width:100%",
      "flex:1 1 auto",
      "min-height:0",
      "background:rgba(255,255,255,.04)",
      "border-radius:18px",
      "overflow:hidden",
      "border:1px solid rgba(255,255,255,.08)",
      "display:flex",
      "align-items:center",
      "justify-content:center",
    ].join(";");
    const preview = document.createElement("img");
    preview.src = previewUrl;
    preview.alt = "Prévia da arte pronta";
    preview.style.cssText = "display:block;max-width:100%;max-height:100%;width:auto;height:auto;object-fit:contain";
    previewBox.append(preview);
    previewWrap.append(previewBox);

    // Ações
    const actions = document.createElement("div");
    actions.style.cssText = "padding:0 32px 20px;display:flex;flex-direction:column;gap:12px;flex-shrink:0";

    const primaryButton = document.createElement("button");
    primaryButton.type = "button";
    primaryButton.className = "viaair-art-btn";
    primaryButton.textContent = opts.canShare ? "Salvar ou compartilhar" : "Baixar imagem";
    primaryButton.style.cssText = [
      "width:100%",
      "min-height:52px",
      "padding:0 24px",
      "border:0",
      "border-radius:9999px",
      "background:#F26B1F",
      "color:#ffffff",
      "font:700 16px inherit",
      "cursor:pointer",
      "box-shadow:0 10px 24px -6px rgba(242,107,31,.5)",
    ].join(";");

    const cancelButton = document.createElement("button");
    cancelButton.type = "button";
    cancelButton.className = "viaair-art-btn viaair-art-cancel";
    cancelButton.textContent = "Cancelar";
    cancelButton.style.cssText = [
      "width:100%",
      "min-height:48px",
      "padding:0 24px",
      "border:0",
      "border-radius:9999px",
      "background:rgba(244,244,245,.8)",
      "color:#52525b",
      "font:600 14px inherit",
      "cursor:pointer",
    ].join(";");

    actions.append(primaryButton, cancelButton);

    // Marca discreta
    const brand = document.createElement("div");
    brand.style.cssText = "padding:0 0 18px;display:flex;justify-content:center;gap:6px;align-items:center;opacity:.3;flex-shrink:0";
    const dot = document.createElement("span");
    dot.style.cssText = "width:6px;height:6px;border-radius:9999px;background:#F26B1F;display:inline-block";
    const brandText = document.createElement("span");
    brandText.textContent = "VIA AIR ADMIN";
    brandText.style.cssText = "font:700 10px inherit;letter-spacing:.2em;color:#18181b";
    brand.append(dot, brandText);

    const finish = (delivery: ArtDelivery) => {
      overlay.remove();
      URL.revokeObjectURL(previewUrl);
      resolve(delivery);
    };

    primaryButton.addEventListener("click", async () => {
      if (opts.canShare) {
        try {
          await navigator.share({ files: [file] });
          finish("shared");
          return;
        } catch (error) {
          if (error instanceof DOMException && error.name === "AbortError") {
            finish("cancelled");
            return;
          }
          // Fallback: cai para o download dentro do mesmo clique.
        }
      }
      downloadBlob(file, file.name);
      finish("downloaded");
    });
    cancelButton.addEventListener("click", () => finish("cancelled"));
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) finish("cancelled");
    });

    panel.append(header, previewWrap, actions, brand);
    overlay.append(panel);
    document.body.appendChild(overlay);
    primaryButton.focus();
  });
}


export async function deliverArtPng(blob: Blob, filename: string): Promise<ArtDelivery> {
  const file = new File([blob], filename, { type: "image/png" });

  // A geração da arte é assíncrona e pode perder a ativação original do clique.
  // Alguns navegadores então ignoram anchor.click() silenciosamente, embora a
  // interface informe sucesso. A prévia cria um novo clique válido e só retorna
  // "downloaded" depois que a pessoa aciona explicitamente o salvamento.
  const canShareFiles = Boolean(navigator.canShare?.({ files: [file] }));
  return offerPreviewSheet(file, {
    canShare: canShareFiles && (isAppleMobile() || isSafari()),
  });
}