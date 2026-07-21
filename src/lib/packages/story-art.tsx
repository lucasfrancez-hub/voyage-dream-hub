/**
 * Renderiza a arte 9:16 (Story 1080x1920) do pacote em um container
 * invisível, aguarda imagens/fontes carregarem, converte para PNG e dispara
 * o download. Chamado pelo menu "Story" no admin de pacotes.
 * Reutiliza a lógica de derivação de dados de feed-art.tsx via generatePackageFeedData.
 */
import { createRoot } from "react-dom/client";
import { toPng } from "html-to-image";
import { PackageStoryArt } from "@/components/packages/PackageStoryArt";
import { buildFeedArtData, ensureFonts, type FeedInputPkg } from "@/lib/packages/feed-art-data";

export async function generatePackageStoryArt(pkg: FeedInputPkg) {
  const data = await buildFeedArtData(pkg);
  await ensureFonts();

  const host = document.createElement("div");
  host.style.cssText = "position:fixed;left:-99999px;top:0;width:1080px;height:1920px;pointer-events:none;";
  document.body.appendChild(host);
  const root = createRoot(host);

  try {
    await new Promise<void>((resolve) => {
      root.render(<PackageStoryArt data={data} />);
      requestAnimationFrame(() => setTimeout(resolve, 120));
    });

    const imgs = Array.from(host.querySelectorAll("img"));
    await Promise.all(
      imgs.map(
        (img) =>
          new Promise<void>((res) => {
            if ((img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth > 0) return res();
            img.addEventListener("load", () => res(), { once: true });
            img.addEventListener("error", () => res(), { once: true });
          }),
      ),
    );
    try { await (document as any).fonts?.ready; } catch { /* noop */ }

    const stage = host.querySelector<HTMLDivElement>(".vstory-outer");
    if (!stage) throw new Error("Falha ao montar a arte");

    const dataUrl = await toPng(stage, {
      width: 1080,
      height: 1920,
      canvasWidth: 1080,
      canvasHeight: 1920,
      pixelRatio: 1,
      cacheBust: false,
      skipFonts: true,
      backgroundColor: "#000000",
    });

    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `viaair-${pkg.slug}-story.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    root.unmount();
    host.remove();
  }
}
