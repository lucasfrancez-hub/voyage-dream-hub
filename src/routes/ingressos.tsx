import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { useMemo, useState } from "react";
import {
  Ticket,
  Calendar as CalendarIcon,
  MapPin,
  Building2,
  Plane,
  Shield,
  Bus,
  Sparkles,
  ArrowRight,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { formatBRL, formatDateRange } from "@/lib/format";
import { whatsappUrl } from "@/lib/checkout-config";
import { TopBar } from "@/components/TopBar";
import { ContactFooter } from "@/components/ContactFooter";

const searchSchema = z.object({
  evento: fallback(z.string(), "").default(""),
});

export const Route = createFileRoute("/ingressos")({
  validateSearch: zodValidator(searchSchema),
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

const EVENT_CATEGORIES: { key: string; label: string; match: RegExp }[] = [
  { key: "rock-in-rio", label: "Rock in Rio", match: /rock\s*in\s*rio|cidade do rock/i },
  { key: "disney", label: "Disney", match: /disney|magic kingdom|epcot|hollywood studios|animal kingdom/i },
  { key: "universal", label: "Universal", match: /universal|islands of adventure|epic universe|volcano bay/i },
  { key: "seaworld", label: "SeaWorld", match: /sea\s*world|busch gardens|aquatica/i },
  { key: "lollapalooza", label: "Lollapalooza", match: /lollapalooza|lolla/i },
];

function detectEvent(p: any): string | null {
  const hay = [p.title, p.destination, ...(p.services?.tickets?.parks ?? [])]
    .filter(Boolean)
    .join(" | ");
  for (const cat of EVENT_CATEGORIES) {
    if (cat.match.test(hay)) return cat.key;
  }
  return null;
}

const MONTH_ABBR = [
  "JAN", "FEV", "MAR", "ABR", "MAI", "JUN",
  "JUL", "AGO", "SET", "OUT", "NOV", "DEZ",
];

function parseDateBlock(iso: string | null | undefined) {
  if (!iso) return null;
  // iso vem no formato YYYY-MM-DD — evita timezone drift criando local date
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return null;
  const dow = new Date(y, m - 1, d).toLocaleDateString("pt-BR", { weekday: "short" });
  return {
    day: String(d).padStart(2, "0"),
    month: MONTH_ABBR[m - 1] ?? "",
    year: String(y),
    dow: dow.replace(".", "").toUpperCase(),
  };
}

function IngressosPage() {
  const { data: items, isLoading } = useQuery({
    queryKey: ["services", "active"],
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from("packages")
        .select(
          "id,slug,title,destination,origin,going_date,return_date,nights,price_per_person,taxes,image_url,summary,base_occupancy,sort_order,kind,hotel_name,hotel_stars,meal_plan,services,date_mode,pricing_mode,max_units",
        )
        .eq("is_active", true)
        .eq("kind", "service")
        .or(`going_date.is.null,going_date.gte.${today}`)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const list = items ?? [];
  const { evento: activeEvent } = Route.useSearch();
  const navigate = useNavigate({ from: "/ingressos" });
  const setActiveEvent = (key: string) =>
    navigate({ search: (prev: { evento: string }) => ({ ...prev, evento: key }), replace: true });

  // Contagem por categoria — só mostra chip se houver ao menos 1 item
  const eventCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of list) {
      const key = detectEvent(p);
      if (key) counts[key] = (counts[key] ?? 0) + 1;
    }
    return counts;
  }, [list]);

  const availableCategories = EVENT_CATEGORIES.filter((c) => eventCounts[c.key] > 0);

  const filteredList = activeEvent
    ? list.filter((p) => detectEvent(p) === activeEvent)
    : list;




  return (
    <div className="min-h-screen overflow-x-hidden bg-background text-foreground">
      <TopBar backHref="https://viaair.tur.br" backLabel="Voltar ao site" />
      <main>
        {/* HERO */}
        <section className="relative overflow-hidden -mt-px">
          {/* base: mesma cor do TopBar pra colar sem linha */}
          <div className="absolute inset-0 bg-background" />
          {/* glow laranja suave saindo do topo, esvaindo pro fundo */}
          <div
            className="absolute inset-0"
            style={{
              backgroundImage:
                "radial-gradient(120% 90% at 15% -10%, hsl(var(--brand-orange-rgb, 24 90% 53%) / 0.28) 0%, transparent 55%), radial-gradient(90% 70% at 85% 20%, hsl(var(--brand-orange-rgb, 24 90% 53%) / 0.18) 0%, transparent 60%)",
            }}
          />
          {/* fade final pro background pra emendar com o grid abaixo */}
          <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-b from-transparent to-background" />
          <div className="relative mx-auto max-w-7xl px-6 pt-14 pb-10 md:pt-20 md:pb-16">
            <div className="max-w-3xl">
              <span className="inline-flex items-center gap-2 rounded-full border border-brand-orange/40 bg-brand-orange/10 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-brand-orange">
                <Sparkles className="h-3.5 w-3.5" /> Ingressos & experiências
              </span>
              <h1 className="mt-4 font-display text-4xl md:text-6xl font-bold leading-[1.05]">
                Viva o show.
                <br />
                <span className="text-gradient-brand">Nós cuidamos do resto.</span>
              </h1>
              <p className="mt-5 max-w-xl text-base md:text-lg text-muted-foreground leading-relaxed">
                Rock in Rio, Disney, Universal, parques, festivais e eventos exclusivos —
                com transfer, hospedagem e atendimento humano da Via Air.
              </p>
            </div>
          </div>
        </section>

        {/* CONTEÚDO */}
        <section className="mx-auto max-w-7xl px-6 pb-16">
          {isLoading && (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="rounded-2xl border border-border bg-card animate-pulse aspect-[4/5]"
                />
              ))}
            </div>
          )}

          {!isLoading && list.length === 0 && (
            <div className="rounded-2xl border border-border bg-card p-10 text-center">
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

          {/* FILTRO POR EVENTO */}
          {!isLoading && list.length > 0 && availableCategories.length > 0 && (
            <div className="mb-6 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setActiveEvent("")}
                className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-bold uppercase tracking-widest transition-all ${
                  activeEvent === ""
                    ? "bg-brand-orange text-primary-foreground shadow-lg"
                    : "border border-border bg-card text-muted-foreground hover:border-brand-orange/60 hover:text-foreground"
                }`}
              >
                Todos <span className="opacity-70">({list.length})</span>
              </button>
              {availableCategories.map((cat) => (
                <button
                  key={cat.key}
                  type="button"
                  onClick={() => setActiveEvent(cat.key)}
                  className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-bold uppercase tracking-widest transition-all ${
                    activeEvent === cat.key
                      ? "bg-brand-orange text-primary-foreground shadow-lg"
                      : "border border-border bg-card text-muted-foreground hover:border-brand-orange/60 hover:text-foreground"
                  }`}
                >
                  {cat.label}{" "}
                  <span className="opacity-70">({eventCounts[cat.key]})</span>
                </button>
              ))}
            </div>
          )}

          {/* GRID */}
          {list.length > 0 && filteredList.length > 0 && (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {filteredList.map((p, idx) => (
                <TicketCard key={p.id} pkg={p} eager={idx < 3} />
              ))}
            </div>
          )}

          {list.length > 0 && filteredList.length === 0 && (
            <div className="rounded-2xl border border-border bg-card p-10 text-center">
              <p className="text-muted-foreground">Nenhum ingresso nesta categoria por enquanto.</p>
            </div>
          )}



        </section>
      </main>
      <ContactFooter />
    </div>
  );
}

type Pkg = NonNullable<ReturnType<typeof useQuery<any>>["data"]> extends (infer T)[] ? T : any;

function priceFrom(p: any) {
  const mult = p.pricing_mode === "per_unit" ? 1 : p.base_occupancy ?? 1;
  return Number(p.price_per_person) * mult;
}

function chipsFor(p: any) {
  const svc = p.services || {};
  const isTicket = p.kind === "service";
  const chips: { icon: any; label: string }[] = [];
  // Para ingressos não faz sentido mostrar "Aéreo de X" — a origem é
  // apenas ponto de referência do transfer.
  if (!isTicket && p.hotel_name) chips.push({ icon: Building2, label: p.hotel_name });
  if (!isTicket && p.origin) chips.push({ icon: Plane, label: `Aéreo de ${p.origin}` });
  if (isTicket && p.hotel_name) chips.push({ icon: Building2, label: p.hotel_name });
  if (svc?.tickets?.enabled) {
    chips.push({ icon: Ticket, label: "Ingresso" });
  }

  if (svc?.transfer?.enabled) chips.push({ icon: Bus, label: "Transfer" });
  if (svc?.insurance?.enabled) chips.push({ icon: Shield, label: "Seguro" });
  return chips;
}


function FeaturedTicket({ pkg: p }: { pkg: any }) {
  const dateBlock = parseDateBlock(p.going_date);
  const chips = chipsFor(p);
  return (
    <Link
      to="/pacotes/$slug"
      params={{ slug: p.slug }}
      className="group relative block overflow-hidden rounded-3xl border border-border bg-card"
    >
      <div className="grid md:grid-cols-[1.3fr_1fr]">
        {/* IMAGEM */}
        <div className="relative aspect-[16/10] md:aspect-auto md:min-h-[380px] overflow-hidden">
          {p.image_url ? (
            <img
              src={p.image_url}
              alt={p.title}
              loading="eager"
              className="absolute inset-0 h-full w-full object-cover transition-transform duration-[900ms] group-hover:scale-105"
            />
          ) : (
            <div className="absolute inset-0 bg-muted" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
          <div className="absolute top-4 left-4 flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-brand-orange px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-primary-foreground shadow-lg">
              <Sparkles className="h-3 w-3" /> Destaque
            </span>
            {p.destination && (
              <span className="inline-flex items-center gap-1 rounded-full bg-black/60 backdrop-blur px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-white">
                <MapPin className="h-3 w-3" /> {p.destination}
              </span>
            )}
          </div>
          {dateBlock && (
            <div className="absolute bottom-4 left-4 rounded-2xl bg-background/95 backdrop-blur px-4 py-3 shadow-2xl border border-border">
              <div className="text-[10px] font-bold uppercase tracking-widest text-brand-orange">
                {dateBlock.dow}
              </div>
              <div className="flex items-baseline gap-1.5 leading-none">
                <span className="font-display text-4xl font-black">{dateBlock.day}</span>
                <span className="font-display text-lg font-bold text-brand-orange">{dateBlock.month}</span>
              </div>
              <div className="text-[10px] text-muted-foreground mt-0.5">{dateBlock.year}</div>
            </div>
          )}
        </div>

        {/* CONTEÚDO */}
        <div className="relative p-6 md:p-8 flex flex-col gap-4">
          <h2 className="font-display text-2xl md:text-3xl font-bold leading-tight">{p.title}</h2>
          {p.summary && (
            <p className="text-sm text-muted-foreground line-clamp-3 leading-relaxed">{p.summary}</p>
          )}
          {chips.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {chips.map((c, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-[11px] text-muted-foreground"
                >
                  <c.icon className="h-3 w-3 text-brand-orange" /> {c.label}
                </span>
              ))}
            </div>
          )}
          <div className="mt-auto pt-4 border-t border-border flex items-end justify-between gap-3">
            <div>
              <div className="text-[11px] uppercase tracking-widest text-muted-foreground">a partir de</div>
              <div className="text-3xl font-display font-black text-brand-orange leading-none mt-1">
                {formatBRL(priceFrom(p))}
              </div>
              {p.pricing_mode === "per_unit" && (
                <div className="text-[11px] text-muted-foreground mt-1">por unidade</div>
              )}
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-orange px-4 py-2 text-xs font-bold uppercase tracking-widest text-primary-foreground group-hover:gap-2.5 transition-all">
              Ver <ArrowRight className="h-3.5 w-3.5" />
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}

function TicketCard({ pkg: p, eager = false }: { pkg: any; eager?: boolean }) {
  const dateBlock = parseDateBlock(p.going_date);
  const chips = chipsFor(p).slice(0, 3);
  return (
    <Link
      to="/pacotes/$slug"
      params={{ slug: p.slug }}
      className="group relative flex flex-col rounded-2xl overflow-hidden border border-border bg-card hover:border-brand-orange/60 hover:shadow-[0_20px_60px_-20px_hsl(var(--brand-orange-rgb,24_90%_53%)/0.4)] transition-all"
    >
      {/* IMAGEM */}
      <div className="relative aspect-[4/3] overflow-hidden">
        {p.image_url ? (
          <img
            src={p.image_url}
            alt={p.title}
            loading={eager ? "eager" : "lazy"}
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-110"
          />
        ) : (
          <div className="absolute inset-0 bg-muted" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />

        {/* selo tipo */}
        <div className="absolute top-3 left-3 inline-flex items-center gap-1 rounded-full bg-brand-orange px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-primary-foreground shadow-lg">
          <Ticket className="h-3 w-3" /> Ingresso
        </div>

        {p.destination && (
          <div className="absolute top-3 right-3 inline-flex items-center gap-1 rounded-full bg-black/60 backdrop-blur px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-white">
            <MapPin className="h-3 w-3" /> {p.destination}
          </div>
        )}

        {/* bloco de data flutuante */}
        {dateBlock ? (
          <div className="absolute bottom-3 left-3 rounded-xl bg-background/95 backdrop-blur px-3 py-2 shadow-xl border border-border">
            <div className="text-[9px] font-bold uppercase tracking-widest text-brand-orange leading-none">
              {dateBlock.dow}
            </div>
            <div className="flex items-baseline gap-1 leading-none mt-1">
              <span className="font-display text-2xl font-black">{dateBlock.day}</span>
              <span className="font-display text-xs font-bold text-brand-orange">{dateBlock.month}</span>
            </div>
          </div>
        ) : p.date_mode === "flexible" ? (
          <div className="absolute bottom-3 left-3 inline-flex items-center gap-1.5 rounded-full bg-background/95 backdrop-blur px-3 py-1.5 text-[11px] font-bold text-foreground border border-border">
            <CalendarIcon className="h-3 w-3 text-brand-orange" /> Data à escolher
          </div>
        ) : null}
      </div>

      {/* PICOTE tipo ingresso */}
      <div className="relative h-4 bg-card">
        <div className="absolute -left-2 top-1/2 -translate-y-1/2 h-4 w-4 rounded-full bg-background border-r border-border" />
        <div className="absolute -right-2 top-1/2 -translate-y-1/2 h-4 w-4 rounded-full bg-background border-l border-border" />
        <div className="absolute inset-x-4 top-1/2 -translate-y-1/2 border-t border-dashed border-border" />
      </div>

      {/* CORPO */}
      <div className="p-5 flex flex-col gap-3 flex-1">
        <h2 className="font-semibold text-lg leading-snug line-clamp-2">{p.title}</h2>
        {chips.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {chips.map((c, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
              >
                <c.icon className="h-3 w-3 text-brand-orange" /> {c.label}
              </span>
            ))}
          </div>
        )}
        <div className="mt-auto pt-3 border-t border-dashed border-border flex items-end justify-between gap-2">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">a partir de</div>
            <div className="text-2xl font-display font-black text-brand-orange leading-none mt-0.5">
              {formatBRL(priceFrom(p))}
            </div>
            {p.pricing_mode === "per_unit" && (
              <div className="text-[10px] text-muted-foreground mt-0.5">por unidade</div>
            )}
          </div>
          <span className="inline-flex items-center gap-1 rounded-full border border-brand-orange/40 bg-brand-orange/10 px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest text-brand-orange group-hover:bg-brand-orange group-hover:text-primary-foreground transition-colors">
            Ver <ArrowRight className="h-3 w-3" />
          </span>
        </div>
      </div>
    </Link>
  );
}
