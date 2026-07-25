import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Ship, Calendar as CalendarIcon, MapPin } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { formatBRL, formatDateRange } from "@/lib/format";
import { whatsappUrl } from "@/lib/checkout-config";
import { TopBar } from "@/components/TopBar";
import { ContactFooter } from "@/components/ContactFooter";

export const Route = createFileRoute("/cruzeiros")({
  head: () => {
    const url = "https://pedidos.viaair.tur.br/cruzeiros";
    const desc =
      "Cruzeiros marítimos com aéreo, cabines e passeios. Reserve com atendimento humano da Via Air.";
    return {
      meta: [
        { title: "Cruzeiros — Via Air" },
        { name: "description", content: desc },
        { property: "og:title", content: "Cruzeiros — Via Air" },
        { property: "og:description", content: desc },
        { property: "og:url", content: url },
        { property: "og:type", content: "website" },
      ],
      links: [{ rel: "canonical", href: url }],
    };
  },
  component: CruzeirosPage,
});

function CruzeirosPage() {
  const { data: items, isLoading } = useQuery({
    queryKey: ["cruises", "active"],
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from("packages")
        .select("id,slug,title,destination,origin,going_date,return_date,nights,price_per_person,image_url,summary,base_occupancy,sort_order,kind")
        .eq("is_active", true)
        .eq("kind", "cruise")
        .or(`going_date.is.null,going_date.gte.${today}`)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  return (
    <div className="min-h-screen overflow-x-hidden bg-background text-foreground">
      <TopBar backHref="https://viaair.tur.br" backLabel="Voltar ao site" />
      <main>
        <section className="mx-auto max-w-7xl px-6 py-12 md:py-16">
          <div className="max-w-prose">
            <span className="text-brand-orange text-sm uppercase tracking-widest">
              Cruzeiros marítimos
            </span>
            <h1 className="mt-2 font-display text-4xl md:text-5xl font-bold">
              Navegue com a <span className="text-gradient-brand">Via Air</span>
            </h1>
            <p className="mt-4 text-muted-foreground leading-relaxed">
              Cabines, bordo, passeios e aéreo. Reserve o seu cruzeiro com condições
              especiais.
            </p>
          </div>

          <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {isLoading &&
              Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="rounded-2xl border border-border bg-card animate-pulse aspect-[4/5]" />
              ))}

            {!isLoading && (items ?? []).length === 0 && (
              <div className="col-span-full rounded-2xl border border-border bg-card p-10 text-center">
                <Ship className="mx-auto h-10 w-10 text-brand-orange" />
                <h3 className="mt-3 text-xl font-bold">Nenhum cruzeiro disponível no momento</h3>
                <p className="mt-2 text-muted-foreground">
                  Fale com nossa equipe para cotações personalizadas.
                </p>
                <a
                  href={whatsappUrl("Olá! Gostaria de cotar um cruzeiro com a Via Air.")}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#25D366] px-6 py-3 font-bold text-white"
                >
                  Falar no WhatsApp
                </a>
              </div>
            )}

            {(items ?? []).map((p, idx) => (
              <Link
                key={p.id}
                to="/pacotes/$slug"
                params={{ slug: p.slug }}
                className="group rounded-2xl overflow-hidden border border-border bg-card hover:border-brand-orange/50 transition flex flex-col"
              >
                <div className="relative aspect-[4/3] overflow-hidden">
                  {p.image_url ? (
                    <img
                      src={p.image_url}
                      alt={p.title}
                      loading={idx === 0 ? "eager" : "lazy"}
                      className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-110"
                    />
                  ) : (
                    <div className="absolute inset-0 bg-muted" />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-background/70 to-transparent" />
                  <div className="absolute top-3 left-3 inline-flex items-center gap-1 rounded-full bg-sky-600 px-3 py-1 text-[11px] font-medium uppercase tracking-wider text-white">
                    <Ship className="h-3 w-3" /> Cruzeiro
                  </div>
                  {p.destination && (
                    <div className="absolute top-3 right-3 inline-flex items-center gap-1 rounded-full bg-black/50 px-3 py-1 text-[11px] font-medium uppercase tracking-wider text-white">
                      <MapPin className="h-3 w-3" /> {p.destination}
                    </div>
                  )}
                </div>
                <div className="p-5 flex flex-col gap-3 flex-1">
                  <h2 className="font-semibold text-lg leading-snug">{p.title}</h2>
                  {p.going_date && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <CalendarIcon className="h-3.5 w-3.5 text-brand-orange" />
                      {formatDateRange(p.going_date, p.return_date)}
                      {p.nights ? ` · ${p.nights} noites` : ""}
                    </div>
                  )}
                  <div className="mt-auto pt-3 border-t border-border">
                    <div className="text-xs text-muted-foreground">a partir de</div>
                    <div className="text-2xl font-display font-bold text-brand-orange">
                      {formatBRL(Number(p.price_per_person) * (p.base_occupancy ?? 2))}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      para {p.base_occupancy ?? 2} passageiros
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      </main>
      <ContactFooter />
    </div>
  );
}
