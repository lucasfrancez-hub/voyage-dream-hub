/**
 * Embed público do carrossel "Pacotes em destaque" — feito pra rodar dentro
 * de um <iframe> em sites externos (WordPress do cliente etc). Sem header,
 * sem footer, fundo transparente e links abrem em nova aba apontando pro
 * domínio de produção.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { FeaturedCarousel } from "@/components/packages/FeaturedCarousel";

const PUBLIC_SITE_URL = "https://pedidos.viaair.tur.br";

export const Route = createFileRoute("/embed/pacotes-destaque")({
  head: () => ({
    meta: [
      { title: "Pacotes em destaque · VIA AIR" },
      { name: "robots", content: "noindex" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
    ],
  }),
  component: EmbedFeatured,
});

function EmbedFeatured() {
  const { data: packages, isLoading } = useQuery({
    queryKey: ["packages", "embed-featured"],
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from("packages")
        .select(
          "id,slug,title,destination,origin,price_per_person,image_url,is_active,sort_order,base_occupancy,going_date,return_date",
        )
        .eq("is_active", true)
        .or(`going_date.is.null,going_date.gte.${today}`)
        .order("sort_order", { ascending: true })
        .limit(20);
      if (error) throw error;
      return data;
    },
  });

  return (
    <div style={{ background: "transparent" }} className="w-full p-0">
      {isLoading && (
        <div className="rounded-2xl border border-white/5 bg-[#0a1622] p-6 text-center text-sm text-muted-foreground">
          Carregando pacotes…
        </div>
      )}
      {!isLoading && packages && packages.length > 0 && (
        <FeaturedCarousel
          packages={packages as any}
          linkBaseUrl={PUBLIC_SITE_URL}
          hideBrandHeader
          viewAllUrl={`${PUBLIC_SITE_URL}/pacotes`}
          mixMode
          cardAspect="3/4"
        />
      )}
    </div>
  );
}
