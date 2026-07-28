import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  MapPin,
  Search,
  Sparkles,
  ArrowRight,
  Calendar as CalendarIcon,
  Users,
  Bus,
  Shield,
  Compass,
} from "lucide-react";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

import { supabase } from "@/integrations/supabase/client";
import { formatBRL } from "@/lib/format";
import { whatsappUrl } from "@/lib/checkout-config";
import { TopBar } from "@/components/TopBar";
import { ContactFooter } from "@/components/ContactFooter";

export const Route = createFileRoute("/passeios")({
  head: () => {
    const url = "https://pedidos.viaair.tur.br/passeios";
    const desc =
      "Busque passeios e experiências por destino e data e veja o valor exato de cada dia com a Via Air.";
    return {
      meta: [
        { title: "Passeios e Experiências — Via Air" },
        { name: "description", content: desc },
        { property: "og:title", content: "Passeios e Experiências — Via Air" },
        { property: "og:description", content: desc },
        { property: "og:url", content: url },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary_large_image" },
      ],
      links: [{ rel: "canonical", href: url }],
    };
  },
  component: PasseiosPage,
});

const todayISO = () => new Date().toISOString().slice(0, 10);

function fmtDayLabel(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
  });
}

function PasseiosPage() {
  const navigate = useNavigate();
  const [destQuery, setDestQuery] = useState("");
  const [destOpen, setDestOpen] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(0);
  const [infants, setInfants] = useState(0);
  const [searched, setSearched] = useState(false);
  const pax = adults + children;

  const { data: tours = [], isLoading } = useQuery({
    queryKey: ["tours", "active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("packages")
        .select(
          "id,slug,title,destination,origin,price_per_person,taxes,image_url,summary,services,sort_order,kind,pricing_mode,date_mode,max_units",
        )
        .eq("is_active", true)
        .eq("kind", "tour")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: prices = [] } = useQuery({
    queryKey: ["tour-prices", tours.map((t: any) => t.id).join(",")],
    enabled: tours.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("package_date_prices")
        .select("package_id,date,modality,price_per_person,taxes,seats,is_available")
        .in(
          "package_id",
          tours.map((t: any) => t.id),
        )
        .eq("is_available", true)
        .gte("date", todayISO())
        .order("date");
      if (error) throw error;
      return data ?? [];
    },
  });

  const destinations = useMemo(
    () => [...new Set(tours.map((t: any) => t.destination).filter(Boolean))].sort(),
    [tours],
  );

  const tourById = useMemo(
    () => new Map(tours.map((t: any) => [t.id, t])),
    [tours],
  );

  const minPriceByTour = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of prices as any[]) {
      const cur = map.get(p.package_id);
      const v = (Number(p.price_per_person) || 0) + (Number(p.taxes) || 0);
      if (cur == null || v < cur) map.set(p.package_id, v);
    }
    return map;
  }, [prices]);

  const destMatch = (t: any) => {
    const q = destQuery.trim().toLowerCase();
    if (!q) return true;
    const hay = `${t.destination ?? ""} ${t.title ?? ""} ${t.origin ?? ""}`.toLowerCase();
    return q.split(/[,\s]+/).filter(Boolean).some((w) => hay.includes(w));
  };

  const destSuggestions = useMemo(() => {
    const q = destQuery.trim().toLowerCase();
    if (!q) return [];
    return (destinations as string[])
      .filter((d) => d.toLowerCase().includes(q))
      .slice(0, 6);
  }, [destQuery, destinations]);

  const results = useMemo(() => {
    if (!searched) return [];
    return (prices as any[])
      .filter((p) => {
        const tour = tourById.get(p.package_id) as any;
        if (!tour) return false;
        if (!destMatch(tour)) return false;
        if (from && p.date < from) return false;
        if (to && p.date > to) return false;
        if (p.seats != null && p.seats < pax) return false;
        return true;
      })
      .slice(0, 120);
  }, [searched, prices, tourById, destQuery, from, to, pax]);

  const catalog = useMemo(
    () => (tours as any[]).filter(destMatch),
    [tours, destQuery],
  );

  return (
    <div className="min-h-screen overflow-x-hidden bg-background text-foreground">
      <TopBar backHref="https://viaair.tur.br" backLabel="Voltar ao site" />
      <main>
        {/* HERO + BUSCA */}
        <section className="relative overflow-hidden -mt-px">
          <div className="absolute inset-0 bg-background" />
          <div
            className="absolute inset-0"
            style={{
              backgroundImage:
                "radial-gradient(120% 90% at 15% -10%, hsl(var(--brand-orange-rgb, 24 90% 53%) / 0.28) 0%, transparent 55%), radial-gradient(90% 70% at 85% 20%, hsl(var(--brand-orange-rgb, 24 90% 53%) / 0.18) 0%, transparent 60%)",
            }}
          />
          <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-b from-transparent to-background" />
          <div className="relative mx-auto max-w-7xl px-6 pt-14 pb-8 md:pt-20 md:pb-12">
            <div className="max-w-3xl">
              <span className="inline-flex items-center gap-2 rounded-full border border-brand-orange/40 bg-brand-orange/10 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-brand-orange">
                <Compass className="h-3.5 w-3.5" /> Passeios & experiências
              </span>
              <h1 className="mt-4 font-display text-4xl md:text-6xl font-bold leading-[1.05]">
                Escolha o dia.
                <br />
                <span className="text-gradient-brand">O valor aparece na hora.</span>
              </h1>
              <p className="mt-5 max-w-xl text-base md:text-lg text-muted-foreground leading-relaxed">
                Busque por destino e período: mostramos as datas disponíveis com o preço exato de
                cada dia.
              </p>
            </div>

            {/* MOTOR DE BUSCA */}
            <div className="mt-8 rounded-3xl border border-border bg-card/80 p-4 backdrop-blur-xl shadow-[var(--shadow-card)] md:p-5">
              <div className="grid gap-3 md:grid-cols-[1.4fr_1fr_1fr_auto_auto]">
                <div className="relative flex flex-col gap-1">
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Destino
                  </label>
                  <div className="flex h-11 items-center gap-2 rounded-lg border border-border bg-background px-3">
                    <MapPin className="h-4 w-4 shrink-0 text-brand-orange" />
                    <input
                      value={destQuery}
                      onChange={(e) => {
                        setDestQuery(e.target.value);
                        setDestOpen(true);
                      }}
                      onFocus={() => setDestOpen(true)}
                      onBlur={() => setTimeout(() => setDestOpen(false), 150)}
                      placeholder="Ex.: Lisboa, Portugal ou Orlando"
                      className="w-full bg-transparent text-sm outline-none"
                    />
                  </div>
                  {destOpen && destSuggestions.length > 0 && (
                    <div className="absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden rounded-lg border border-border bg-popover shadow-lg">
                      {destSuggestions.map((d) => (
                        <button
                          key={d}
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            setDestQuery(d);
                            setDestOpen(false);
                          }}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
                        >
                          <MapPin className="h-3.5 w-3.5 text-brand-orange" /> {d}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    De
                  </label>
                  <input
                    type="date"
                    min={todayISO()}
                    value={from}
                    onChange={(e) => setFrom(e.target.value)}
                    className="h-11 rounded-lg border border-border bg-background px-3 text-sm"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Até
                  </label>
                  <input
                    type="date"
                    min={from || todayISO()}
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                    className="h-11 rounded-lg border border-border bg-background px-3 text-sm"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Passageiros
                  </label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className="flex h-11 items-center gap-2 rounded-lg border border-border bg-background px-3 text-sm"
                      >
                        <Users className="h-4 w-4 text-brand-orange" />
                        {adults + children + infants}{" "}
                        {adults + children + infants === 1 ? "Passageiro" : "Passageiros"}
                      </button>
                    </PopoverTrigger>
                    <PopoverContent align="start" className="w-72 p-3">
                      {[
                        {
                          label: "Adulto",
                          hint: "18+",
                          value: adults,
                          set: setAdults,
                          min: 1,
                        },
                        {
                          label: "Criança",
                          hint: "2 a 17 anos",
                          value: children,
                          set: setChildren,
                          min: 0,
                        },
                        {
                          label: "Bebê",
                          hint: "0 a 2 anos",
                          value: infants,
                          set: setInfants,
                          min: 0,
                        },
                      ].map((row) => (
                        <div
                          key={row.label}
                          className="flex items-center justify-between py-2"
                        >
                          <div>
                            <div className="text-sm font-medium">{row.label}</div>
                            <div className="text-[11px] text-muted-foreground">
                              {row.hint}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              disabled={row.value <= row.min}
                              onClick={() => row.set(row.value - 1)}
                              className="h-7 w-7 rounded-md border border-border text-sm disabled:opacity-40"
                            >
                              −
                            </button>
                            <span className="w-5 text-center text-sm">{row.value}</span>
                            <button
                              type="button"
                              disabled={adults + children >= 9}
                              onClick={() => row.set(row.value + 1)}
                              className="h-7 w-7 rounded-md border border-border text-sm disabled:opacity-40"
                            >
                              +
                            </button>
                          </div>
                        </div>
                      ))}
                    </PopoverContent>
                  </Popover>
                </div>
                <button
                  type="button"
                  onClick={() => setSearched(true)}
                  className="mt-auto inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-brand-orange px-6 text-sm font-bold uppercase tracking-widest text-primary-foreground transition hover:opacity-90"
                >
                  <Search className="h-4 w-4" /> Buscar
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-6 pb-16">
          {/* RESULTADOS DA BUSCA */}
          {searched && (
            <div className="mb-12">
              <h2 className="mb-4 font-display text-2xl font-bold">
                {results.length > 0
                  ? `${results.length} data(s) disponível(is)`
                  : "Nenhuma data encontrada"}
              </h2>
              {results.length === 0 ? (
                <div className="rounded-2xl border border-border bg-card p-8 text-center">
                  <p className="text-muted-foreground">
                    Tente outro período ou destino — ou fale com nosso time.
                  </p>
                  <a
                    href={whatsappUrl("Olá! Procuro um passeio com a Via Air.")}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#25D366] px-6 py-3 font-bold text-white"
                  >
                    Falar no WhatsApp
                  </a>
                </div>
              ) : (
                <div className="grid gap-3">
                  {results.map((r: any) => {
                    const tour = tourById.get(r.package_id) as any;
                    const unit = (Number(r.price_per_person) || 0) + (Number(r.taxes) || 0);
                    return (
                      <button
                        key={`${r.package_id}-${r.date}-${r.modality ?? ""}`}
                        type="button"
                        onClick={() =>
                          navigate({
                            to: "/pacotes/$slug/checkout",
                            params: { slug: tour.slug },
                            search: {
                              qty: pax,
                              date: r.date,
                              ...(r.modality ? { modality: r.modality } : {}),
                            },
                          })
                        }
                        className="group flex flex-wrap items-center gap-4 rounded-2xl border border-border bg-card p-3 text-left transition hover:border-brand-orange/60"
                      >
                        <div className="h-16 w-24 shrink-0 overflow-hidden rounded-xl bg-muted">
                          {tour.image_url && (
                            <img
                              src={tour.image_url}
                              alt={tour.title}
                              loading="lazy"
                              className="h-full w-full object-cover"
                            />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-semibold">{tour.title}</p>
                          <p className="mt-0.5 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                            <span className="inline-flex items-center gap-1">
                              <MapPin className="h-3 w-3 text-brand-orange" /> {tour.destination}
                            </span>
                            <span className="inline-flex items-center gap-1">
                              <CalendarIcon className="h-3 w-3 text-brand-orange" />{" "}
                              {fmtDayLabel(r.date)}
                            </span>
                            {r.seats != null && <span>{r.seats} vagas</span>}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-[11px] uppercase tracking-widest text-muted-foreground">
                            {pax} {pax === 1 ? "pessoa" : "pessoas"}
                          </p>
                          <p className="font-display text-2xl font-black text-brand-orange leading-none">
                            {formatBRL(unit * pax)}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            {formatBRL(unit)} por pessoa
                          </p>
                        </div>
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-orange px-4 py-2 text-xs font-bold uppercase tracking-widest text-primary-foreground transition-all group-hover:gap-2.5">
                          Reservar <ArrowRight className="h-3.5 w-3.5" />
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* CATÁLOGO */}
          <h2 className="mb-4 font-display text-2xl font-bold">Catálogo de passeios</h2>
          {isLoading && (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="aspect-[4/5] animate-pulse rounded-2xl border border-border bg-card"
                />
              ))}
            </div>
          )}
          {!isLoading && catalog.length === 0 && (
            <div className="rounded-2xl border border-border bg-card p-10 text-center">
              <Compass className="mx-auto h-10 w-10 text-brand-orange" />
              <h3 className="mt-3 text-xl font-bold">Nenhum passeio disponível no momento</h3>
              <p className="mt-2 text-muted-foreground">
                Fale com nossa equipe para montar uma experiência sob medida.
              </p>
            </div>
          )}
          {catalog.length > 0 && (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {catalog.map((t: any, idx: number) => (
                <TourCard
                  key={t.id}
                  tour={t}
                  minPrice={minPriceByTour.get(t.id) ?? (Number(t.price_per_person) || 0)}
                  eager={idx < 3}
                />
              ))}
            </div>
          )}
        </section>
      </main>
      <ContactFooter whatsappMessage="Olá! Gostaria de reservar um passeio com a Via Air." />
    </div>
  );
}

function TourCard({
  tour: t,
  minPrice,
  eager,
}: {
  tour: any;
  minPrice: number;
  eager?: boolean;
}) {
  const svc = t.services || {};
  return (
    <Link
      to="/pacotes/$slug"
      params={{ slug: t.slug }}
      className="group relative flex flex-col rounded-2xl bg-card transition-all hover:shadow-[0_20px_60px_-20px_hsl(var(--brand-orange-rgb,24_90%_53%)/0.4)]"
    >
      <div className="relative aspect-[4/3] overflow-hidden rounded-t-2xl border border-b-0 border-border transition-colors group-hover:border-brand-orange/60">
        {t.image_url ? (
          <img
            src={t.image_url}
            alt={t.title}
            loading={eager ? "eager" : "lazy"}
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
          />
        ) : (
          <div className="absolute inset-0 bg-muted" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
        <span className="absolute left-4 top-4 inline-flex items-center gap-1 rounded-full bg-brand-orange px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-primary-foreground shadow-lg">
          <Sparkles className="h-3 w-3" /> Passeio
        </span>
        {t.destination && (
          <span className="absolute bottom-4 left-4 inline-flex items-center gap-1 rounded-full bg-black/60 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-white backdrop-blur">
            <MapPin className="h-3 w-3" /> {t.destination}
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-3 rounded-b-2xl border border-t-0 border-border p-5 transition-colors group-hover:border-brand-orange/60">
        <h3 className="font-display text-lg font-bold leading-tight">{t.title}</h3>
        {t.summary && (
          <p className="line-clamp-2 text-sm text-muted-foreground">{t.summary}</p>
        )}
        <div className="flex flex-wrap gap-1.5">
          {svc?.transfer?.enabled && (
            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-[11px] text-muted-foreground">
              <Bus className="h-3 w-3 text-brand-orange" /> Transfer
            </span>
          )}
          {svc?.insurance?.enabled && (
            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-[11px] text-muted-foreground">
              <Shield className="h-3 w-3 text-brand-orange" /> Seguro
            </span>
          )}
        </div>
        <div className="mt-auto flex items-end justify-between gap-3 border-t border-border pt-4">
          <div>
            <div className="text-[11px] uppercase tracking-widest text-muted-foreground">
              a partir de
            </div>
            <div className="mt-1 font-display text-2xl font-black leading-none text-brand-orange">
              {formatBRL(minPrice)}
            </div>
            <div className="mt-1 text-[11px] text-muted-foreground">por pessoa</div>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-orange px-4 py-2 text-xs font-bold uppercase tracking-widest text-primary-foreground transition-all group-hover:gap-2.5">
            Ver datas <ArrowRight className="h-3.5 w-3.5" />
          </span>
        </div>
      </div>
    </Link>
  );
}
