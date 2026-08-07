/**
 * Renderiza a arte 9:16 (Story 1080x1920) do pacote em um container
 * invisível, aguarda imagens/fontes carregarem, converte para PNG e dispara
 * o download. Chamado pelo menu "Story" no admin de pacotes.
 * Reutiliza a lógica de derivação de dados de feed-art.tsx via generatePackageFeedData.
 */
import { createRoot } from "react-dom/client";
import { PackageStoryArt } from "@/components/packages/PackageStoryArt";
import { StoryArtVariant, artModeFromKind } from "@/components/packages/StoryArtVariants";
import { buildFeedArtData, ensureFonts, type FeedInputPkg } from "@/lib/packages/feed-art-data";
import {
  captureArtPng,
  createArtHost,
  deliverArtPng,
  waitForArtAssets,
  type ArtDelivery,
} from "@/lib/packages/art-export";

/** Gera a arte 9:16 e devolve o PNG em memória (sem baixar). */
export async function renderPackageStoryArtBlob(pkg: FeedInputPkg): Promise<Blob> {
  const data = await buildFeedArtData(pkg);
  await ensureFonts();

  // Passeio e ingresso usam o modelo 2 (faixa laranja + título do produto)
  const isAvulso = data.kind === "tour" || data.kind === "service";
  const host = createArtHost(1080, 1920);
  const root = createRoot(host);

  try {
    await new Promise<void>((resolve) => {
      root.render(
        isAvulso ? (
          <StoryArtVariant data={data} mode={artModeFromKind(data.kind)} variant={2} format="story" />
        ) : (
          <PackageStoryArt data={data} />
        ),
      );
      requestAnimationFrame(() => resolve());
    });

    await waitForArtAssets(host);

    const stage = host.querySelector<HTMLDivElement>(isAvulso ? ".vsv-outer" : ".vstory-outer");
    if (!stage) throw new Error("Falha ao montar a arte");

    return await captureArtPng(stage, {
      width: 1080,
      height: 1920,
      innerSelector: isAvulso ? ".vsv-inner" : ".vstory-inner",
      backgroundSelector: isAvulso ? ".vsv-bg" : ".vstory-bg",
      backgroundDataUrl: data.backgroundDataUrl,
      gradientMiddle: 0.4,
      gradientTopOpacity: 0.5,
    });
  } finally {
    root.unmount();
    host.remove();
  }
}

export async function generatePackageStoryArt(pkg: FeedInputPkg): Promise<ArtDelivery> {
  const blob = await renderPackageStoryArtBlob(pkg);
  return await deliverArtPng(blob, `viaair-${pkg.slug}-story.png`);
}

