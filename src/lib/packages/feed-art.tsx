/**
 * Renderiza a arte 3:4 do pacote em um container invisível, aguarda as
 * imagens carregarem, converte para PNG (1080x1440) e dispara o download.
 * Chamado pelo menu "Feed" no admin de pacotes.
 */
import { createRoot } from "react-dom/client";
import { PackageFeedArt } from "@/components/packages/PackageFeedArt";
import { buildFeedArtData, ensureFonts, type FeedInputPkg } from "@/lib/packages/feed-art-data";
import {
  captureArtPng,
  createArtHost,
  deliverArtPng,
  waitForArtAssets,
  type ArtDelivery,
} from "@/lib/packages/art-export";

/** Gera a arte 3:4 e devolve o PNG em memória (sem baixar). */
export async function renderPackageFeedArtBlob(pkg: FeedInputPkg): Promise<Blob> {
  const data = await buildFeedArtData(pkg);
  await ensureFonts();

  const host = createArtHost(1080, 1440);
  const root = createRoot(host);

  try {
    await new Promise<void>((resolve) => {
      root.render(<PackageFeedArt data={data} />);
      requestAnimationFrame(() => resolve());
    });

    await waitForArtAssets(host);

    const stage = host.querySelector<HTMLDivElement>(".vfeed-outer");
    if (!stage) throw new Error("Falha ao montar a arte");

    return await captureArtPng(stage, {
      width: 1080,
      height: 1440,
      innerSelector: ".vfeed-inner",
      backgroundSelector: ".vfeed-bg",
      backgroundDataUrl: data.backgroundDataUrl,
      gradientMiddle: 0.45,
      gradientTopOpacity: 0.6,
    });
  } finally {
    root.unmount();
    host.remove();
  }
}

export async function generatePackageFeedArt(pkg: FeedInputPkg): Promise<ArtDelivery> {
  const blob = await renderPackageFeedArtBlob(pkg);
  return await deliverArtPng(blob, `viaair-${pkg.slug}-feed.png`);
}

