/**
 * Embed público do explorador "Passagens aéreas baratas" — feito pra rodar
 * dentro de um <iframe> no WordPress do cliente. Sem header/footer, sem o
 * passo a passo (trilha) e com os filtros de origem e mês no topo.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { PassagensBaratasExplorer } from "@/routes/admin.passagens-baratas";

const PUBLIC_SITE_URL = "https://pedidos.viaair.tur.br";

export const Route = createFileRoute("/embed/passagens-baratas")({
  head: () => ({
    meta: [
      { title: "Passagens aéreas baratas · VIA AIR" },
      {
        name: "description",
        content:
          "Ofertas de passagens aéreas coletadas nas últimas 24 horas, com busca direta no motor VIA AIR.",
      },
      { property: "og:title", content: "Passagens aéreas baratas · VIA AIR" },
      {
        property: "og:description",
        content: "Veja as passagens que encontramos nas últimas 24 horas.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
    ],
  }),
  component: EmbedPassagensBaratas,
});

function EmbedPassagensBaratas() {
  // Avisa o site que hospeda o iframe da altura real, pra ele ajustar sozinho.
  useEffect(() => {
    const enviar = () => {
      const h = document.documentElement.scrollHeight;
      window.parent?.postMessage({ type: "viaair:embed-height", height: h }, "*");
    };
    enviar();
    const ro = new ResizeObserver(enviar);
    ro.observe(document.body);
    const t = setInterval(enviar, 1500);
    return () => {
      ro.disconnect();
      clearInterval(t);
    };
  }, []);

  return (
    <div className="w-full p-3 sm:p-4">
      <style>{`html,body,#root{background:transparent !important;margin:0;padding:0;}`}</style>
      <PassagensBaratasExplorer
        hideTrail
        linkVoos={({ origem, destino, ida, volta }) => {
          const p = new URLSearchParams({ origem, destino, ida });
          if (volta) p.set("volta", volta);
          return `${PUBLIC_SITE_URL}/voar?${p.toString()}`;
        }}
      />
    </div>
  );
}
