/**
 * Renderiza a arte 3:4 do pacote em um container invisível, aguarda as
 * imagens carregarem, converte para PNG (1080x1440) e dispara o download.
 * Chamado pelo menu "Feed" no admin de pacotes.
 */
import { createRoot } from "react-dom/client";
import { toPng } from "html-to-image";
import { PackageFeedArt } from "@/components/packages/PackageFeedArt";
import { buildFeedArtData, ensureFonts, type FeedInputPkg } from "@/lib/packages/feed-art-data";

export async function generatePackageFeedArt(pkg: FeedInputPkg) {
  const data = await buildFeedArtData(pkg);
  await ensureFonts();

  // Container invisível fora da tela — 1080x1440 exatos
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;left:-99999px;top:0;width:1080px;height:1440px;pointer-events:none;";
  document.body.appendChild(host);
  const root = createRoot(host);

  try {
    await new Promise<void>((resolve) => {
      root.render(<PackageFeedArt data={data} />);
      requestAnimationFrame(() => setTimeout(resolve, 120));
    });

    // Aguarda todas as <img> internas (logo é a única remota; bg é data URL)
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

    // Garante que as webfonts terminaram de carregar antes do snapshot
    try { await (document as any).fonts?.ready; } catch { /* noop */ }

    const stage = host.querySelector<HTMLDivElement>(".vfeed-outer");
    if (!stage) throw new Error("Falha ao montar a arte");

    // cacheBust:false + skipFonts:true evita refetch pesado e enumeração de webfonts,
    // que é o principal gargalo do html-to-image em árvores grandes com backdrop-filter.
    const dataUrl = await toPng(stage, {
      width: 1080,
      height: 1440,
      canvasWidth: 1080,
      canvasHeight: 1440,
      pixelRatio: 1,
      cacheBust: false,
      skipFonts: true,
      backgroundColor: "#000000",
    });

    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `viaair-${pkg.slug}-feed.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    root.unmount();
    host.remove();
  }
}
