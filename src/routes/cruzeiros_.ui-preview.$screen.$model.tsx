import { createFileRoute } from "@tanstack/react-router";
import { PreviewFrame } from "@/components/cruise-preview/PreviewFrame";
import { getScreen, type ModelKey } from "@/components/cruise-preview/registry";

export const Route = createFileRoute("/cruzeiros_/ui-preview/$screen/$model")({
  head: ({ params }) => {
    const s = getScreen(params.screen);
    const titulo = s ? `${s.titulo} — Modelo ${params.model.toUpperCase()}` : "Preview de Cruzeiros";
    return {
      meta: [
        { title: `${titulo} | Estudo de Interface VIA AIR` },
        { name: "description", content: "Protótipo clicável de interface do módulo de Cruzeiros da VIA AIR (ambiente interno)." },
        { name: "robots", content: "noindex" },
        { property: "og:title", content: titulo },
        { property: "og:description", content: "Protótipo clicável de interface do módulo de Cruzeiros." },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary" },
      ],
    };
  },
  component: Page,
});

function Page() {
  const { screen, model } = Route.useParams();
  const m = (["a", "b", "c"].includes(model) ? model : "a") as ModelKey;
  return <PreviewFrame slug={screen} modelo={m} />;
}
