/**
 * Embed público do carrossel "Ingressos & experiências" — feito pra rodar
 * dentro de um <iframe> em sites externos (WordPress do cliente etc).
 * Ordem aleatória entre todos os ingressos ativos.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { IngressosCarousel } from "@/components/packages/IngressosCarousel";

const PUBLIC_SITE_URL = "https://pedidos.viaair.tur.br";

export const Route = createFileRoute("/embed/ingressos-destaque")({
  head: () => ({
    meta: [
      { title: "Ingressos em destaque · VIA AIR" },
      { name: "robots", content: "noindex" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
    ],
  }),
  component: EmbedIngressos,
});

function EmbedIngressos() {
  const { data: items, isLoading } = useQuery({
    queryKey: ["ingressos", "embed"],
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from("packages")
        .select(
          "id,slug,title,destination,going_date,return_date,price_per_person,base_occupancy,pricing_mode,date_mode,image_url,is_active",
        )
        .eq("is_active", true)
        .eq("kind", "service")
        .or(`going_date.is.null,going_date.gte.${today}`)
        .limit(200);
      if (error) throw error;
      return data;
    },
  });

  return (
    <div style={{ background: "rgb(5, 20, 27)" }} className="w-full p-0">
      <style>{`html,body,#root{background:rgb(5,20,27) !important;margin:0;padding:0;}`}</style>

      {isLoading && (
        <div className="rounded-2xl border border-white/5 bg-[#0a1622] p-6 text-center text-sm text-muted-foreground">
          Carregando ingressos…
        </div>
      )}
      {!isLoading && items && items.length > 0 && (
        <IngressosCarousel
          items={items as any}
          linkBaseUrl={PUBLIC_SITE_URL}
          viewAllUrl={`${PUBLIC_SITE_URL}/ingressos`}
        />
      )}
    </div>
  );
}
