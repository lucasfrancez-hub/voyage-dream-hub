/**
 * Widget PÚBLICO do motor de busca — feito pra rodar dentro de um <iframe>
 * no site do cliente (WordPress). Renderiza o MESMO motor do admin
 * (aéreo, hotel, carro, aéreo+hotel, exclusivos e seguros) em modo público.
 */
import { createFileRoute } from "@tanstack/react-router";
import { PublicEngineProvider } from "@/lib/public-engine";
import { useEmbedAutoResize } from "@/hooks/use-embed-auto-resize";
import { SearchEngine } from "./admin.buscar";

export const Route = createFileRoute("/embed/motor-busca")({
  head: () => ({
    meta: [
      { title: "Buscar viagens · VIA AIR" },
      { name: "robots", content: "noindex" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
    ],
  }),
  component: EmbedMotorBusca,
});

function EmbedMotorBusca() {
  useEmbedAutoResize();

  return (
    <div className="embed-search-page w-full p-0">
      <style>{`
        html,body,#root{background:transparent !important;margin:0;padding:0;width:100%;height:auto !important;min-height:0 !important;overflow-x:hidden !important;overflow-y:visible !important;}
        .embed-search-page{width:100%;height:auto;min-height:0;overflow:visible;}
        /* painéis flutuantes sempre por cima e nunca cortados */
        [data-radix-popper-content-wrapper],.viaair-floating-layer{z-index:2147483000 !important;}
        .embed-search-page .h-screen,.embed-search-page .min-h-screen{height:auto !important;min-height:0 !important;}
        .embed-search-page .overflow-y-auto,.embed-search-page .overflow-auto{overflow:visible !important;}

        [style*="brand-blue"]{background:none !important;opacity:0 !important;}
        header{background:transparent !important;overflow:visible !important;}
        /* no widget não mostramos os avisos de "informe os locais" — só o motor */
        [data-empty-state]{display:none !important;}
      `}</style>
      <PublicEngineProvider value={true}>
        <SearchEngine publicMode embedMode initialMode="aereo" />
      </PublicEngineProvider>
    </div>
  );
}
