import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { MapPin, Calendar, Plane, SlidersHorizontal, X, ArrowUpDown, Ticket, Compass } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatBRL, formatDateRange } from "@/lib/format";
import { whatsappUrl } from "@/lib/checkout-config";

import { ContactFooter } from "@/components/ContactFooter";
import { TopBar } from "@/components/TopBar";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/pacotes/")({
  head: () => {
    const url = "https://pedidos.viaair.tur.br/pacotes";
    const desc =
      "Pacotes de viagem prontos com aéreo, hospedagem e passeios. Reserve com atendimento humano da Via Air.";
    return {
      meta: [
        { title: "Pacotes de viagem — Via Air" },
        { name: "description", content: desc },
        { property: "og:title", content: "Pacotes de viagem — Via Air" },
        { property: "og:description", content: desc },
        { property: "og:url", content: url },
        { property: "og:type", content: "website" },
      ],
      links: [{ rel: "canonical", href: url }],
    };
  },
  component: PacotesList,
});

function PacotesList() {
  const { data: packages, isLoading } = useQuery({
    queryKey: ["packages", "active"],
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from("packages")
        .select("id,slug,title,destination,origin,going_date,return_date,nights,price_per_person,taxes,image_url,summary,itinerary,includes,hotel_name,hotel_stars,meal_plan,is_active,sort_order,base_occupancy,outbound_flight,return_flight,created_at,updated_at")
        .eq("is_active", true)
        .or(`going_date.is.null,going_date.gte.${today}`)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const [originFilter, setOriginFilter] = useState<string>("all");
  const [destinationFilter, setDestinationFilter] = useState<string>("all");
  const [monthFilter, setMonthFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<
    "sort_order" | "price_asc" | "price_desc" | "date_asc" | "date_desc"
  >("price_asc");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 12;


  const origins = useMemo(
    () => Array.from(new Set((packages || []).map((p) => p.origin).filter(Boolean))).sort(),
    [packages],
  );
  const destinations = useMemo(
    () => Array.from(new Set((packages || []).map((p) => p.destination).filter(Boolean))).sort(),
    [packages],
  );

  const MONTH_NAMES = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
  ];
  const months = useMemo(() => {
    const keys = new Set<string>();
    for (const p of packages || []) {
      if (!p.going_date) continue;
      const d = new Date(String(p.going_date) + "T12:00:00");
      if (isNaN(d.getTime())) continue;
      keys.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    }
    return Array.from(keys)
      .sort()
      .map((k) => {
        const [y, m] = k.split("-");
        return { value: k, label: `${MONTH_NAMES[Number(m) - 1]} ${y}` };
      });
  }, [packages]);

  const filteredPackages = useMemo(() => {
    const filtered = (packages || []).filter((p) => {
      const originMatch = originFilter === "all" || p.origin === originFilter;
      const destinationMatch = destinationFilter === "all" || p.destination === destinationFilter;
      let monthMatch = true;
      if (monthFilter !== "all") {
        if (!p.going_date) monthMatch = false;
        else {
          const d = new Date(String(p.going_date) + "T12:00:00");
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
          monthMatch = key === monthFilter;
        }
      }
      return originMatch && destinationMatch && monthMatch;
    });

    const sorted = [...filtered];
    switch (sortBy) {
      case "price_asc":
        sorted.sort(
          (a, b) =>
            Number(a.price_per_person) * (a.base_occupancy ?? 2) -
            Number(b.price_per_person) * (b.base_occupancy ?? 2),
        );
        break;
      case "price_desc":
        sorted.sort(
          (a, b) =>
            Number(b.price_per_person) * (b.base_occupancy ?? 2) -
            Number(a.price_per_person) * (a.base_occupancy ?? 2),
        );
        break;
      case "date_asc":
        sorted.sort((a, b) => {
          if (!a.going_date && !b.going_date) return 0;
          if (!a.going_date) return 1;
          if (!b.going_date) return -1;
          return new Date(a.going_date).getTime() - new Date(b.going_date).getTime();
        });
        break;
      case "date_desc":
        sorted.sort((a, b) => {
          if (!a.going_date && !b.going_date) return 0;
          if (!a.going_date) return 1;
          if (!b.going_date) return -1;
          return new Date(b.going_date).getTime() - new Date(a.going_date).getTime();
        });
        break;
      case "sort_order":
      default:
        sorted.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
        break;
    }
    return sorted;
  }, [packages, originFilter, destinationFilter, monthFilter, sortBy]);

  const hasActiveFilters =
    originFilter !== "all" ||
    destinationFilter !== "all" ||
    monthFilter !== "all" ||
    sortBy !== "sort_order";

  const clearFilters = () => {
    setOriginFilter("all");
    setDestinationFilter("all");
    setMonthFilter("all");
    setSortBy("sort_order");
  };


  return (
    <div className="min-h-screen bg-background text-foreground">
      <TopBar backHref="https://viaair.tur.br" backLabel="Voltar ao site" />

      <main>
      <section className="mx-auto max-w-7xl px-6 py-12 md:py-16">

        <div className="max-w-prose">
          <span className="text-brand-orange text-sm uppercase tracking-widest">
            Pacotes disponíveis
          </span>
          <h1 className="mt-2 font-display text-4xl md:text-5xl font-bold">
            Roteiros prontos para <span className="text-gradient-brand">embarcar</span>
          </h1>
          <p className="mt-4 text-muted-foreground leading-relaxed">
            Aéreo, hospedagem, transfer e passeio inclusos no orçamento. Escolha o destino
            e finalize a reserva com o nosso time.
          </p>
          <p className="mt-6 text-xs text-muted-foreground/80 leading-loose">
            Garanta seu pacote com tranquilidade: o valor anunciado não sofre alteração
            conforme a proximidade da data de embarque. As reservas estão sujeitas apenas
            à disponibilidade de vagas.
          </p>
          <div className="mt-6">
            <Link
              to="/minhas-reservas"
              className="inline-flex items-center gap-2 rounded-full border border-brand-orange/40 bg-brand-orange/10 px-4 py-2 text-sm font-semibold text-brand-orange hover:bg-brand-orange hover:text-white transition"
            >
              <Ticket className="h-4 w-4" />
              Ver minhas reservas
            </Link>
          </div>
        </div>

        <div className="mt-8 flex flex-col gap-4 rounded-2xl border border-border bg-card p-4 sm:flex-row sm:items-end">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground sm:pb-2.5">
            <SlidersHorizontal className="h-4 w-4 text-brand-orange" />
            Filtrar por
          </div>

          <div className="flex-1">
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Origem
            </label>
            <Select value={originFilter} onValueChange={setOriginFilter}>
              <SelectTrigger className="w-full focus:ring-brand-orange focus:border-brand-orange">
                <SelectValue placeholder="Todas as origens" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as origens</SelectItem>
                {origins.map((origin) => (
                  <SelectItem key={origin} value={origin!}>
                    {origin}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex-1">
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Destino
            </label>
            <Select value={destinationFilter} onValueChange={setDestinationFilter}>
              <SelectTrigger className="w-full focus:ring-brand-orange focus:border-brand-orange">
                <SelectValue placeholder="Todos os destinos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os destinos</SelectItem>
                {destinations.map((destination) => (
                  <SelectItem key={destination} value={destination!}>
                    {destination}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex-1">
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Data da viagem
            </label>
            <Select value={monthFilter} onValueChange={setMonthFilter}>
              <SelectTrigger className="w-full focus:ring-brand-orange focus:border-brand-orange">
                <div className="flex items-center gap-2">
                  <Calendar className="h-3.5 w-3.5 text-brand-orange" />
                  <SelectValue placeholder="Todos os meses" />
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os meses</SelectItem>
                {months.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex-1">

            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Ordenar por
            </label>
            <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
              <SelectTrigger className="w-full focus:ring-brand-orange focus:border-brand-orange">
                <div className="flex items-center gap-2">
                  <ArrowUpDown className="h-3.5 w-3.5 text-brand-orange" />
                  <SelectValue placeholder="Ordenar por" />
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sort_order">Ordem de exibição</SelectItem>
                <SelectItem value="price_asc">Menor preço</SelectItem>
                <SelectItem value="price_desc">Maior preço</SelectItem>
                <SelectItem value="date_asc">Data de ida mais próxima</SelectItem>
                <SelectItem value="date_desc">Data de ida mais distante</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {hasActiveFilters && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={clearFilters}
              aria-label="Limpar filtros"
              className="shrink-0"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>

        {hasActiveFilters && !isLoading && (
          <div className="mt-4 text-sm text-muted-foreground">
            {filteredPackages.length} de {packages?.length ?? 0} roteiro
            {filteredPackages.length === 1 ? "" : "s"} encontrado
            {filteredPackages.length === 1 ? "" : "s"}
          </div>
        )}

        <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {isLoading &&
            Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="rounded-2xl border border-border bg-card animate-pulse aspect-[4/5]"
              />
            ))}

          {!isLoading && filteredPackages.length === 0 && (
            <div className="col-span-full relative overflow-hidden rounded-2xl border border-white/5 bg-[#0a1622] p-10 text-center shadow-2xl">
              <div className="pointer-events-none absolute -top-24 -right-24 h-48 w-48 rounded-full bg-brand-orange/10 blur-3xl" />
              <div className="pointer-events-none absolute -bottom-24 -left-24 h-48 w-48 rounded-full bg-[#25D366]/10 blur-3xl" />

              <div className="relative z-10">
                <div className="mb-6 inline-flex h-16 w-16 items-center justify-center rounded-full border border-white/10 bg-white/5">
                  <Compass className="h-8 w-8 text-brand-orange" strokeWidth={1.5} />
                </div>

                <h3 className="mb-3 text-2xl font-bold text-white">
                  {hasActiveFilters
                    ? "Não encontrou o roteiro ideal?"
                    : "Vamos montar sua próxima viagem?"}
                </h3>
                <p className="mx-auto mb-8 max-w-md text-lg text-muted-foreground">
                  {hasActiveFilters ? (
                    <>
                      Nenhum roteiro corresponde aos seus filtros, mas podemos criar um{" "}
                      <span className="font-medium text-white">pacote personalizado</span> exclusivo
                      para você.
                    </>
                  ) : (
                    <>
                      Fale com a gente no WhatsApp e montamos um{" "}
                      <span className="font-medium text-white">roteiro sob medida</span> pra você.
                    </>
                  )}
                </p>

                <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
                  <a
                    href={whatsappUrl(
                      "Olá! Não encontrei um roteiro com os filtros que apliquei no site. Vocês conseguem montar um pacote personalizado pra mim?",
                    )}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#25D366] px-8 py-4 font-bold text-white shadow-lg shadow-[#25D366]/20 transition-all hover:bg-[#20bd5a] active:scale-95 sm:w-auto"
                  >
                    <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                    </svg>
                    Conversar no WhatsApp
                  </a>

                  {hasActiveFilters && (
                    <button
                      type="button"
                      onClick={clearFilters}
                      className="w-full px-8 py-4 font-medium text-brand-orange transition-colors hover:text-orange-300 sm:w-auto"
                    >
                      Limpar filtros
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}


          {filteredPackages.map((p, idx) => (
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
                    width={800}
                    height={600}
                    loading={idx === 0 ? "eager" : "lazy"}
                    fetchPriority={idx === 0 ? "high" : "auto"}
                    decoding="async"
                    className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-110"
                  />

                ) : (
                  <div className="absolute inset-0 bg-muted" />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-background/70 to-transparent" />
                <div className="absolute top-3 left-3 inline-flex items-center gap-1 rounded-full bg-brand-orange px-3 py-1 text-[11px] font-medium uppercase tracking-wider text-primary-foreground">
                  <MapPin className="h-3 w-3" /> {p.destination}
                </div>
                <div className="absolute top-3 right-3 inline-flex items-center gap-1 rounded-full bg-emerald-500 px-3 py-1 text-[11px] font-medium uppercase tracking-wider text-white">
                  5% off no Pix
                </div>
              </div>
              <div className="p-5 flex flex-col gap-3 flex-1">
                <h2 className="font-semibold text-lg leading-snug">{p.title}</h2>
                {p.origin && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Plane className="h-3.5 w-3.5 text-brand-orange" /> Saindo de {p.origin}
                  </div>
                )}
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Calendar className="h-3.5 w-3.5 text-brand-orange" />
                  {formatDateRange(p.going_date, p.return_date)}
                  {p.nights ? ` · ${p.nights} noites` : ""}
                </div>
                <div className="mt-auto pt-3 border-t border-border">
                  <div className="text-xs text-muted-foreground">a partir de</div>
                  <div className="text-2xl font-display font-bold text-brand-orange">
                    {formatBRL(Number(p.price_per_person) * (p.base_occupancy ?? 2))}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    para {p.base_occupancy === 1 ? "1 pessoa" : `${p.base_occupancy ?? 2} pessoas`}
                  </div>
                  <div className="mt-2 rounded-md bg-muted/40 px-2 py-1.5 text-[11px] text-muted-foreground">
                    Pacote para <span className="text-foreground font-medium">{p.base_occupancy ?? 2} adulto{(p.base_occupancy ?? 2) > 1 ? "s" : ""}</span>. Para outra quantidade, fale no WhatsApp.
                  </div>
                  <div className="mt-2 text-[10px] text-muted-foreground text-center">
                    Sujeito à disponibilidade.
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
