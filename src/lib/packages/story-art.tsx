/**
 * Renderiza a arte 9:16 (Story 1080x1920) do pacote em um container
 * invisível, aguarda imagens/fontes carregarem, converte para PNG e dispara
 * o download. Chamado pelo menu "Story" no admin de pacotes.
 * Reutiliza a lógica de derivação de dados de feed-art.tsx via generatePackageFeedData.
 */
import { createRoot } from "react-dom/client";
import { PackageStoryArt } from "@/components/packages/PackageStoryArt";
import { buildFeedArtData, ensureFonts, type FeedInputPkg } from "@/lib/packages/feed-art-data";
import {
  captureArtPng,
  createArtHost,
  deliverArtPng,
  waitForArtAssets,
  type ArtDelivery,
} from "@/lib/packages/art-export";

export async function generatePackageStoryArt(pkg: FeedInputPkg): Promise<ArtDelivery> {
  const data = await buildFeedArtData(pkg);
  await ensureFonts();

  const host = createArtHost(1080, 1920);
  const root = createRoot(host);

  try {
    await new Promise<void>((resolve) => {
      root.render(<PackageStoryArt data={data} />);
      requestAnimationFrame(() => resolve());
    });

    await waitForArtAssets(host);

    const stage = host.querySelector<HTMLDivElement>(".vstory-outer");
    if (!stage) throw new Error("Falha ao montar a arte");

    const blob = await captureArtPng(stage, {
      width: 1080,
      height: 1920,
      innerSelector: ".vstory-inner",
      backgroundSelector: ".vstory-bg",
      backgroundDataUrl: data.backgroundDataUrl,
      gradientMiddle: 0.4,
      gradientTopOpacity: 0.5,
    });
    return await deliverArtPng(blob, `viaair-${pkg.slug}-story.png`);
  } finally {
    root.unmount();
    host.remove();
  }
}
