/**
 * Widget PÚBLICO do motor de busca — feito pra rodar dentro de um <iframe>
 * no site do cliente (WordPress). Renderiza o MESMO motor do admin
 * (aéreo, hotel, carro, aéreo+hotel, exclusivos e seguros) em modo público.
 */
import { createFileRoute } from "@tanstack/react-router";
import { PublicEngineProvider } from "@/lib/public-engine";
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
  return (
    <div className="w-full p-0">
      <style>{`
        html,body,#root{background:transparent !important;margin:0;padding:0;}
        /* remove o brilho azul de fundo dos cabeçalhos do motor no widget */
        [style*="brand-blue"]{background:none !important;opacity:0 !important;}
        header{background:transparent !important;}
      `}</style>
      <PublicEngineProvider value={true}>
        <SearchEngine publicMode initialMode="aereo" />
      </PublicEngineProvider>
    </div>
  );
}
