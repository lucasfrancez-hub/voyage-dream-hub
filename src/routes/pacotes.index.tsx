import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { MapPin, Calendar, Plane, SlidersHorizontal, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatBRL, formatDateRange } from "@/lib/format";
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
  head: () => ({
    meta: [
      { title: "Pacotes de viagem — Via Air" },
      {
        name: "description",
        content:
          "Pacotes de viagem prontos com aéreo, hospedagem e passeios. Reserve com atendimento humano da Via Air.",
      },
      { property: "og:title", content: "Pacotes de viagem — Via Air" },
      {
        property: "og:description",
        content:
          "Pacotes de viagem prontos com aéreo, hospedagem e passeios. Reserve com atendimento humano da Via Air.",
      },
    ],
  }),
  component: PacotesList,
});

function PacotesList() {
  const { data: packages, isLoading } = useQuery({
    queryKey: ["packages", "active"],
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from("packages")
        .select("*")
        .eq("is_active", true)
        .or(`going_date.is.null,going_date.gte.${today}`)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const [originFilter, setOriginFilter] = useState<string>("all");
  const [destinationFilter, setDestinationFilter] = useState<string>("all");

  const origins = useMemo(
    () => Array.from(new Set((packages || []).map((p) => p.origin).filter(Boolean))).sort(),
    [packages],
  );
  const destinations = useMemo(
    () => Array.from(new Set((packages || []).map((p) => p.destination).filter(Boolean))).sort(),
    [packages],
  );

  const filteredPackages = useMemo(() => {
    return (packages || []).filter((p) => {
      const originMatch = originFilter === "all" || p.origin === originFilter;
      const destinationMatch = destinationFilter === "all" || p.destination === destinationFilter;
      return originMatch && destinationMatch;
    });
  }, [packages, originFilter, destinationFilter]);

  const hasActiveFilters = originFilter !== "all" || destinationFilter !== "all";

  const clearFilters = () => {
    setOriginFilter("all");
    setDestinationFilter("all");
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <TopBar backHref="https://viaair.tur.br" backLabel="Voltar ao site" />

      <section className="mx-auto max-w-7xl px-6 py-12 md:py-16">
        <div className="max-w-2xl">
          <span className="text-brand-orange text-sm uppercase tracking-widest">
            Pacotes disponíveis
          </span>
          <h1 className="mt-2 font-display text-4xl md:text-5xl font-bold">
            Roteiros prontos para <span className="text-gradient-brand">embarcar</span>
          </h1>
          <p className="mt-4 text-muted-foreground">
            Aéreo, hospedagem, traslados e passeios em um único orçamento. Escolha o destino
            e finalize a reserva com nosso time.
          </p>
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
              <SelectTrigger className="w-full">
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
              <SelectTrigger className="w-full">
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
            Mostrando {filteredPackages.length} de {packages?.length ?? 0} roteiro
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
            <div className="col-span-full rounded-2xl border border-dashed border-border p-12 text-center text-muted-foreground">
              {hasActiveFilters ? (
                <>
                  Nenhum roteiro encontrado com esses filtros.{" "}
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="text-brand-orange underline hover:no-underline"
                  >
                    Limpar filtros
                  </button>
                </>
              ) : (
                <>
                  Nenhum pacote disponível no momento. Fale com a gente no WhatsApp para um roteiro
                  sob medida.
                </>
              )}
            </div>
          )}

          {filteredPackages.map((p) => (
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
                    loading="lazy"
                    className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-110"
                  />
                ) : (
                  <div className="absolute inset-0 bg-muted" />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-background/70 to-transparent" />
                <div className="absolute top-3 left-3 inline-flex items-center gap-1 rounded-full bg-brand-orange px-3 py-1 text-[11px] font-medium uppercase tracking-wider text-primary-foreground">
                  <MapPin className="h-3 w-3" /> {p.destination}
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

      <ContactFooter />
    </div>
  );
}
