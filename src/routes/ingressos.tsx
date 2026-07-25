import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Ticket, Calendar as CalendarIcon, MapPin, Building2, Plane, Shield, Bus } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { formatBRL, formatDateRange } from "@/lib/format";
import { whatsappUrl } from "@/lib/checkout-config";
import { TopBar } from "@/components/TopBar";
import { ContactFooter } from "@/components/ContactFooter";

export const Route = createFileRoute("/ingressos")({
  head: () => {
    const url = "https://pedidos.viaair.tur.br/ingressos";
    const desc =
      "Ingressos para shows, parques e eventos com atendimento humano da Via Air.";
    return {
      meta: [
        { title: "Ingressos e Serviços — Via Air" },
        { name: "description", content: desc },
        { property: "og:title", content: "Ingressos e Serviços — Via Air" },
        { property: "og:description", content: desc },
        { property: "og:url", content: url },
        { property: "og:type", content: "website" },
      ],
      links: [{ rel: "canonical", href: url }],
    };
  },
  component: IngressosPage,
});

function IngressosPage() {
  const { data: items, isLoading } = useQuery({
    queryKey: ["services", "active"],
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from("packages")
        .select("id,slug,title,destination,origin,going_date,return_date,nights,price_per_person,taxes,image_url,summary,base_occupancy,sort_order,kind,hotel_name,hotel_stars,meal_plan,services")
        .eq("is_active", true)
        .eq("kind", "service")
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
              Ingressos & serviços
            </span>
            <h1 className="mt-2 font-display text-4xl md:text-5xl font-bold">
              Ingressos para <span className="text-gradient-brand">shows, parques e eventos</span>
            </h1>
            <p className="mt-4 text-muted-foreground leading-relaxed">
              Rock in Rio, Disney, Universal e muito mais. Compre com segurança e atendimento
              humano da Via Air.
            </p>
          </div>

          <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {isLoading &&
              Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="rounded-2xl border border-border bg-card animate-pulse aspect-[4/5]" />
              ))}

            {!isLoading && (items ?? []).length === 0 && (
              <div className="col-span-full rounded-2xl border border-border bg-card p-10 text-center">
                <Ticket className="mx-auto h-10 w-10 text-brand-orange" />
                <h3 className="mt-3 text-xl font-bold">Nenhum ingresso disponível no momento</h3>
                <p className="mt-2 text-muted-foreground">
                  Fale com nossa equipe para pedidos personalizados.
                </p>
                <a
                  href={whatsappUrl("Olá! Gostaria de comprar ingressos com a Via Air.")}
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
                  <div className="absolute top-3 left-3 inline-flex items-center gap-1 rounded-full bg-brand-orange px-3 py-1 text-[11px] font-medium uppercase tracking-wider text-primary-foreground">
                    <Ticket className="h-3 w-3" /> Ingresso
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
                      {p.nights ? <span>· {p.nights} noites</span> : null}
                    </div>
                  )}
                  {(() => {
                    const svc = (p as any).services || {};
                    const chips: { icon: any; label: string }[] = [];
                    if (p.hotel_name) chips.push({ icon: Building2, label: p.hotel_name });
                    if (p.origin) chips.push({ icon: Plane, label: `Aéreo de ${p.origin}` });
                    if (svc?.transfer?.enabled) chips.push({ icon: Bus, label: "Transfer" });
                    if (svc?.insurance?.enabled) chips.push({ icon: Shield, label: "Seguro" });
                    return chips.length ? (
                      <div className="flex flex-wrap gap-1.5">
                        {chips.map((c, i) => (
                          <span key={i} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                            <c.icon className="h-3 w-3 text-brand-orange" /> {c.label}
                          </span>
                        ))}
                      </div>
                    ) : null;
                  })()}
                  <div className="mt-auto pt-3 border-t border-border">
                    <div className="text-xs text-muted-foreground">a partir de</div>
                    <div className="text-2xl font-display font-bold text-brand-orange">
                      {formatBRL(Number(p.price_per_person) * (p.base_occupancy ?? 1))}
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
