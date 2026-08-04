/**
 * Widget PÚBLICO do motor de busca — feito pra rodar dentro de um <iframe>
 * no site do cliente (WordPress). Renderiza o MESMO motor do admin
 * (aéreo, hotel, carro, aéreo+hotel, exclusivos e seguros) em modo público.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
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
  // O redimensionamento automático é opcional. Sem `autoHeight=1`, a altura
  // definida manualmente no HTML do WordPress nunca é sobrescrita.
  useEffect(() => {
    const autoHeight = new URLSearchParams(window.location.search).get("autoHeight") === "1";
    if (!autoHeight) return;

    const post = () => {
      const h = Math.ceil(document.documentElement.scrollHeight);
      window.parent?.postMessage({ type: "viaair-embed-height", height: h }, "*");
    };
    post();
    const ro = new ResizeObserver(post);
    ro.observe(document.body);
    const t = setInterval(post, 1000);
    return () => {
      ro.disconnect();
      clearInterval(t);
    };
  }, []);

  return (
    <div className="w-full p-0">
      <style>{`
        html,body,#root{background:transparent !important;margin:0;padding:0;}
        /* remove o brilho azul de fundo dos cabeçalhos do motor no widget */
        [style*="brand-blue"]{background:none !important;opacity:0 !important;}
        header{background:transparent !important;}
        /* no widget não mostramos os avisos de "informe os locais" — só o motor */
        [data-empty-state]{display:none !important;}

      `}</style>
      <PublicEngineProvider value={true}>
        <SearchEngine publicMode embedMode initialMode="aereo" />
      </PublicEngineProvider>
    </div>
  );
}
