import type { ComboPick } from "@/lib/combo-selection";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Loader2,
  Search,
  BedDouble,
  Star,
  MapPin,
  CalendarDays,
  Users,
  Utensils,
  ShieldCheck,
  ShieldOff,
  Check,
  SlidersHorizontal,
  RotateCcw,
  Hotel,
  ShoppingCart,
  ExternalLink,
  Copy,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { NoResults } from "@/components/flights/NoResults";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { createOrder } from "@/lib/orders.functions";
import { SearchSkeleton } from "@/components/search/SearchSkeleton";
import { DestinationAutocomplete } from "@/components/search/DestinationAutocomplete";
import {
  onerHotelDestinations,
  onerHotelSearch,
  onerHotelRooms,
  onerCreateHotelCart,

  type OnerHotel,
  type OnerHotelPoint,
  type OnerHotelSearchResult,
  type OnerRoomRate,
} from "@/lib/onertravel-hotels.functions";
import { onerAirportSearch } from "@/lib/onertravel.functions";
import {
  onerHotelDestinationsPublic,
  onerHotelSearchPublic,
  onerHotelRoomsPublic,
  onerCreateHotelCartPublic,
  onerAirportSearchPublic,
} from "@/lib/onertravel-public.functions";


export const Route = createFileRoute("/admin/hoteis-teste")({
  head: () => ({
    meta: [
      { title: "Motor de Hotéis — VIA AIR" },
      {
        name: "description",
        content:
          "Busca de hospedagens em tempo real na operadora, com filtros de estrelas, refeições, preço e política de cancelamento.",
      },
      { property: "og:title", content: "Motor de Hotéis — VIA AIR" },
      { property: "og:description", content: "Hospedagens em tempo real com filtros e valores por noite." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: HoteisPage,
});

function fmtMoney(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// ---------------------------------------------------------------- filtros

type Filters = {
  name: string;
  stars: number[];
  meals: string[];
  onlyRefundable: boolean;
  minPrice: string;
  maxPrice: string;
};

const EMPTY: Filters = { name: "", stars: [], meals: [], onlyRefundable: false, minPrice: "", maxPrice: "" };

function toggle<T>(arr: T[], v: T) {
  return arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
}

function bestRate(h: OnerHotel, f: Filters): OnerRoomRate | null {
  const rates = h.rates.filter((r) => {
    if (f.meals.length && !f.meals.includes(r.mealPlanLabel)) return false;
    if (f.onlyRefundable && !r.refundable) return false;
    return true;
  });
  if (!rates.length) return null;
  return rates.reduce((a, b) => (b.price.total < a.price.total ? b : a));
}

function applyFilters(list: OnerHotel[], f: Filters) {
  const min = Number(f.minPrice.replace(",", "."));
  const max = Number(f.maxPrice.replace(",", "."));
  return list
    .map((h) => ({ h, rate: bestRate(h, f) }))
    .filter(({ h, rate }) => {
      if (!rate) return false;
      if (f.name && !h.name.toLowerCase().includes(f.name.toLowerCase())) return false;
      if (f.stars.length && !f.stars.includes(h.stars)) return false;
      if (f.minPrice && !Number.isNaN(min) && rate.price.total < min) return false;
      if (f.maxPrice && !Number.isNaN(max) && rate.price.total > max) return false;
      return true;
    });
}

function activeCount(f: Filters) {
  return (
    (f.name ? 1 : 0) +
    f.stars.length +
    f.meals.length +
    (f.onlyRefundable ? 1 : 0) +
    (f.minPrice ? 1 : 0) +
    (f.maxPrice ? 1 : 0)
  );
}

function StarChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 rounded-lg border py-1.5 text-xs font-semibold transition ${
        active
          ? "border-primary/40 bg-primary/10 text-primary"
          : "border-border/60 text-muted-foreground hover:bg-muted/40 hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function CheckRow({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full items-center gap-3 text-left"
    >
      <span
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border transition ${
          active ? "border-primary bg-primary/15" : "border-border/70 bg-background/60 group-hover:border-primary/50"
        }`}
      >
        {active && <span className="h-2.5 w-2.5 rounded-[2px] bg-primary" />}
      </span>
      <span className={`text-sm leading-snug ${active ? "text-foreground" : "text-muted-foreground group-hover:text-foreground"}`}>
        {label}
      </span>
    </button>
  );
}

function FiltersPanel({
  hotels,
  filters,
  onChange,
}: {
  hotels: OnerHotel[];
  filters: Filters;
  onChange: (f: Filters) => void;
}) {
  const [allMeals, setAllMeals] = useState(false);

  const meals = useMemo(() => {
    const map = new Map<string, number>();
    hotels.forEach((h) => h.rates.forEach((r) => map.set(r.mealPlanLabel, (map.get(r.mealPlanLabel) ?? 0) + 1)));
    return [...map.entries()].sort((a, b) => b[1] - a[1]).map(([label]) => label);
  }, [hotels]);

  const shownMeals = allMeals ? meals : meals.slice(0, 5);

  const prices = hotels.map((h) => h.lowestTotal).filter(Boolean);
  const lo = prices.length ? Math.min(...prices) : 0;
  const hi = prices.length ? Math.max(...prices) : 0;
  const n = activeCount(filters);

  return (
    <section className="rounded-2xl border border-border/60 bg-card/60 p-5 backdrop-blur">
      <header className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-2 text-base font-semibold">
          <SlidersHorizontal className="h-4 w-4 text-primary" /> Filtros
          {n > 0 && <Badge variant="secondary">{n}</Badge>}
        </div>
        {n > 0 && (
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => onChange(EMPTY)}>
            <RotateCcw className="mr-1 h-3 w-3" /> Limpar
          </Button>
        )}
      </header>

      <div className="space-y-6">
        <div className="space-y-2">
          <Label className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Nome da hospedagem
          </Label>
          <Input
            className="h-9 rounded-lg bg-background/60"
            placeholder="Ex.: Deville"
            value={filters.name}
            onChange={(e) => onChange({ ...filters, name: e.target.value })}
          />
        </div>

        <div className="space-y-2">
          <Label className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Estrelas
          </Label>
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5].map((s) => (
              <StarChip
                key={s}
                active={filters.stars.includes(s)}
                onClick={() => onChange({ ...filters, stars: toggle(filters.stars, s) })}
              >
                {s}★
              </StarChip>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Preço total
          </Label>
          <div className="text-xs text-muted-foreground">
            {fmtMoney(lo)} — {fmtMoney(hi)}
          </div>
          <div className="flex gap-2">
            <Input
              className="h-9 rounded-lg bg-background/60"
              placeholder="De"
              inputMode="decimal"
              value={filters.minPrice}
              onChange={(e) => onChange({ ...filters, minPrice: e.target.value })}
            />
            <Input
              className="h-9 rounded-lg bg-background/60"
              placeholder="Até"
              inputMode="decimal"
              value={filters.maxPrice}
              onChange={(e) => onChange({ ...filters, maxPrice: e.target.value })}
            />
          </div>
        </div>

        {meals.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Refeições
              </Label>
              {filters.meals.length > 0 && (
                <button
                  type="button"
                  className="text-[10px] font-semibold uppercase text-primary hover:underline"
                  onClick={() => onChange({ ...filters, meals: [] })}
                >
                  Limpar
                </button>
              )}
            </div>
            <div className="space-y-2.5">
              {shownMeals.map((m) => (
                <CheckRow
                  key={m}
                  label={m}
                  active={filters.meals.includes(m)}
                  onClick={() => onChange({ ...filters, meals: toggle(filters.meals, m) })}
                />
              ))}
            </div>
            {meals.length > 5 && (
              <button
                type="button"
                onClick={() => setAllMeals((v) => !v)}
                className="text-[11px] font-semibold uppercase tracking-tight text-primary hover:underline"
              >
                {allMeals ? "− Ver menos" : `+ Ver todas as opções (${meals.length})`}
              </button>
            )}
          </div>
        )}

        <div className="space-y-2.5">
          <Label className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Cancelamento
          </Label>
          <CheckRow
            label="Somente reembolsável"
            active={filters.onlyRefundable}
            onClick={() => onChange({ ...filters, onlyRefundable: !filters.onlyRefundable })}
          />
        </div>
      </div>
    </section>
  );
}


// ---------------------------------------------------------------- card

function Stars({ n }: { n: number }) {
  return (
    <span className="flex items-center gap-0.5">
      {Array.from({ length: n }).map((_, i) => (
        <Star key={i} className="h-3.5 w-3.5 fill-primary text-primary" />
      ))}
    </span>
  );
}

function HotelCard({
  h,
  rate,
  nights,
  selected,
  onSelect,
  cheapest,
  readOnly,
}: {
  h: OnerHotel;
  rate: OnerRoomRate;
  nights: number;
  selected: boolean;
  onSelect: (rateKey: string) => void;
  cheapest: boolean;
  readOnly?: boolean;
}) {
  const [openRooms, setOpenRooms] = useState(false);
  return (
    <article
      className={`relative overflow-hidden rounded-2xl border bg-card/80 backdrop-blur transition ${
        readOnly ? "" : "hover:-translate-y-0.5 hover:border-primary/60 hover:shadow-[var(--shadow-card)]"
      } ${selected ? "border-primary ring-2 ring-primary/30" : "border-border/70"}`}
    >
      {cheapest && (
        <span className="absolute right-0 top-0 z-10 rounded-bl-xl bg-primary px-2 py-1 text-[10px] font-semibold text-primary-foreground">
          Menor preço
        </span>
      )}
      <div className="flex flex-col gap-4 p-4 sm:flex-row">
        <div className="h-32 w-full shrink-0 overflow-hidden rounded-xl border border-border/60 bg-muted sm:w-48">
          {h.images[0] ? (
            <img
              src={h.images[0]}
              alt={`Foto do ${h.name}`}
              loading="lazy"
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <Hotel className="h-7 w-7 text-muted-foreground" />
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold">{h.name}</h3>
            <Stars n={h.stars} />
            {h.tags.map((t) => (
              <Badge key={t} variant="secondary" className="text-[10px]">
                {t}
              </Badge>
            ))}
          </div>
          {(h.address || h.city) && (
            <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
              <MapPin className="h-3 w-3" /> {[h.city, h.address].filter(Boolean).join(" — ")}
            </p>
          )}

          <div className="mt-3 rounded-xl border border-border/60 bg-background/40 p-3">
            <div className="text-sm font-medium">{rate.name}</div>
            <div className="mt-1 flex flex-wrap items-center gap-3 text-xs">
              <span className="flex items-center gap-1 text-muted-foreground">
                <Utensils className="h-3 w-3" /> {rate.mealPlanLabel}
              </span>
              <span
                className={`flex items-center gap-1 ${rate.refundable ? "text-primary" : "text-muted-foreground"}`}
              >
                {rate.refundable ? <ShieldCheck className="h-3 w-3" /> : <ShieldOff className="h-3 w-3" />}
                {rate.refundable ? "Reembolsável" : "Não reembolsável"}
              </span>
            </div>
            {rate.cancelPolicy && (
              <p className="mt-2 text-[11px] leading-snug text-muted-foreground">{rate.cancelPolicy}</p>
            )}
          </div>

          {/* a busca em lista só traz a tarifa mais barata; a lista completa
              é carregada no resumo do hotel */}
          <Button
            variant="ghost"
            size="sm"
            className={`mt-2 h-7 px-2 text-xs ${readOnly ? "hidden" : ""}`}
            onClick={() => (h.rates.length > 1 ? setOpenRooms((v) => !v) : onSelect(rate.key))}
          >
            {h.rates.length > 1
              ? openRooms
                ? "Ocultar quartos"
                : `Ver outros ${h.rates.length - 1} quarto(s)`
              : "Ver todos os quartos"}
          </Button>

          {openRooms && (
            <div className="mt-2 space-y-2">
              {h.rates.map((r) => (
                <button
                  key={r.key}
                  type="button"
                  onClick={() => onSelect(r.key)}
                  className="flex w-full items-center justify-between gap-3 rounded-lg border border-border/60 bg-background/30 px-3 py-2 text-left text-xs transition hover:border-primary/60"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{r.name}</span>
                    <span className="text-muted-foreground">
                      {r.mealPlanLabel} • {r.refundable ? "Reembolsável" : "Não reembolsável"}
                    </span>
                  </span>
                  <span className="whitespace-nowrap font-semibold text-primary">{fmtMoney(r.price.total)}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex shrink-0 flex-col items-end justify-between gap-3 text-right">
          <div>
            <div className="text-xl font-bold text-primary">{fmtMoney(rate.price.total)}</div>
            <div className="text-xs text-muted-foreground">
              {fmtMoney(rate.price.totalPerNight)} / noite • {nights || h.numberOfNights} noite(s)
            </div>
            <div className="text-[11px] text-muted-foreground">Taxas e impostos inclusos</div>
          </div>
          {!readOnly && (
            <Button size="sm" variant={selected ? "default" : "outline"} onClick={() => onSelect(rate.key)}>
              {selected ? (
                <>
                  <Check className="mr-1 h-3.5 w-3.5" /> Selecionado
                </>
              ) : (
                "Selecionar"
              )}
            </Button>
          )}
        </div>
      </div>
    </article>
  );
}

// -------------------------------------------- resumo da hospedagem (modal)

function HotelSummaryDialog({
  open,
  onOpenChange,
  hotel,
  rate: baseRate,

  nights,
  rooms,
  checkIn,
  checkOut,
  adults,
  children,
  point,
  searchKey,
  onChangeRate,
  onComboSelect,
  publicMode = false,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  hotel: OnerHotel | null;
  rate: OnerRoomRate | null;
  nights: number;
  rooms: number;
  checkIn: string;
  checkOut: string;
  adults: number;
  children: number;
  point: OnerHotelPoint | null;
  searchKey: string;
  onChangeRate: (rateKey: string) => void;
  onComboSelect?: (pick: ComboPick) => void;
  publicMode?: boolean;
}) {
  const createCart = useServerFn(publicMode ? onerCreateHotelCartPublic : onerCreateHotelCart);
  const loadRooms = useServerFn(publicMode ? onerHotelRoomsPublic : onerHotelRooms);
  const [cartUrl, setCartUrl] = useState<string | null>(null);
  const [roomsOpen, setRoomsOpen] = useState(true);
  const [orderOpen, setOrderOpen] = useState(false);
  const [buyingPublic, setBuyingPublic] = useState(false);
  /* tarifa escolhida na lista completa de acomodações (busca dedicada) */
  const [pickedRate, setPickedRate] = useState<OnerRoomRate | null>(null);

  const adultsPerRoom = Math.max(1, Math.ceil(adults / Math.max(1, rooms)));
  const childrenPerRoom = Math.max(0, Math.floor(children / Math.max(1, rooms)));

  // A listagem só traz a tarifa mais barata: aqui buscamos TODOS os quartos
  // do hotel, igual à página de detalhe da operadora.
  const roomsQuery = useQuery({
    queryKey: ["oner-hotel-rooms", hotel?.hotelId, checkIn, checkOut, rooms, adultsPerRoom, childrenPerRoom],
    enabled: open && !!hotel && !!checkIn && !!checkOut,
    staleTime: 5 * 60 * 1000,
    retry: false,
    queryFn: () =>
      loadRooms({
        data: {
          hotelId: hotel!.hotelId,
          checkIn,
          checkOut,
          rooms: Array.from({ length: Math.max(1, rooms) }).map(() => ({
            adults: adultsPerRoom,
            children: childrenPerRoom,
            childrenAges: [] as number[],
          })),
        },
      }),
  });

  const allRates = roomsQuery.data?.rates ?? hotel?.rates ?? [];
  const activeRate = pickedRate ?? baseRate;
  // a chave de tarifa precisa vir da mesma busca que gerou a tarifa
  const activeSearchKey = pickedRate ? (roomsQuery.data?.searchKey ?? searchKey) : searchKey;

  useEffect(() => {
    setCartUrl(null);
  }, [baseRate?.key, pickedRate?.key]);


  useEffect(() => {
    setPickedRate(null);
  }, [hotel?.hotelId, checkIn, checkOut]);

  const cartMut = useMutation({
    mutationFn: () =>
      createCart({
        data: {
          searchKey: activeSearchKey,
          hotelId: hotel!.hotelId,
          rateKeys: [activeRate!.key],
          cityName: point?.name ?? hotel!.city ?? "",
          pointId: point?.id ?? "",
          pointType: point?.type ?? 1,
          checkIn,
          checkOut,
          adults,
          children,
          rooms,
        },
      }),
    onSuccess: (r) => {
      setCartUrl(r.url);
      if (!publicMode) {
        window.open(r.url, "_blank", "noopener");
        toast.success("Link do Comprar Viagem gerado");
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!hotel || !activeRate) return null;
  const rate = activeRate;


  const period = `${checkIn.split("-").reverse().join("/")} a ${checkOut.split("-").reverse().join("/")}`;
  const summaryText = [
    `Hospedagem: ${hotel.name} (${hotel.stars}★)`,
    hotel.city ? `Local: ${[hotel.city, hotel.address].filter(Boolean).join(" — ")}` : null,
    `Quarto: ${rate.name}`,
    `${rate.mealPlanLabel} • ${rate.refundable ? "Reembolsável" : "Não reembolsável"}`,
    `${period} • ${nights} noite(s) • ${rooms} quarto(s)`,
    `Diária média: ${fmtMoney(rate.price.totalPerNight)}`,
    `Total: ${fmtMoney(rate.price.total)} (taxas inclusas)`,
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex max-h-[90vh] max-w-3xl flex-col gap-0 overflow-hidden rounded-3xl border-border/60 bg-card p-0">
          <DialogHeader className="border-b border-border/50 bg-background/40 px-6 py-5 text-left">
            <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-primary">
              Resumo da hospedagem
            </span>
            <DialogTitle className="mt-1 flex items-center gap-2 text-xl font-bold">
              {hotel.name}
              <Stars n={hotel.stars} />
            </DialogTitle>
          </DialogHeader>

          <div className="grid flex-1 gap-6 overflow-y-auto p-6 md:grid-cols-12">
            <div className="space-y-6 md:col-span-7">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-xl border border-border/60 bg-background/50 p-4">
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Período
                  </span>
                  <p className="mt-1 text-sm font-medium">{period}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {nights} noite(s) • {rooms} quarto(s) • {adults} adulto(s)
                  </p>
                </div>
                <div className="rounded-xl border border-border/60 bg-background/50 p-4">
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Status da tarifa
                  </span>
                  <p className="mt-1 flex items-center gap-1 text-sm font-medium">
                    <Utensils className="h-3 w-3 text-muted-foreground" /> {rate.mealPlanLabel}
                  </p>
                  <p
                    className={`flex items-center gap-1 text-[11px] ${
                      rate.refundable ? "text-primary" : "text-destructive"
                    }`}
                  >
                    {rate.refundable ? <ShieldCheck className="h-3 w-3" /> : <ShieldOff className="h-3 w-3" />}
                    {rate.refundable ? "Reembolsável" : "Não reembolsável"}
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Acomodações disponíveis
                  {roomsQuery.isFetching ? (
                    <span className="flex items-center gap-1 normal-case tracking-normal text-primary">
                      <Loader2 className="h-3 w-3 animate-spin" /> buscando todos os quartos…
                    </span>
                  ) : (
                    <span className="normal-case tracking-normal">({allRates.length})</span>
                  )}
                </Label>
                <button
                  type="button"
                  onClick={() => setRoomsOpen((v) => !v)}
                  className="flex w-full items-center justify-between gap-3 rounded-xl border border-border/70 bg-background/60 p-4 text-left transition hover:border-primary/60"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{rate.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {rate.mealPlanLabel} • {fmtMoney(rate.price.total)}
                    </span>
                  </span>
                  <ChevronDown
                    className={`h-5 w-5 shrink-0 text-muted-foreground transition ${roomsOpen ? "rotate-180" : ""}`}
                  />
                </button>

                {roomsQuery.isError && (
                  <p className="rounded-lg border border-destructive/40 bg-destructive/5 p-2 text-[11px] text-destructive">
                    Não consegui abrir a lista completa de quartos deste hotel. Mostrando só a tarifa da busca.
                  </p>
                )}

                {roomsOpen && (
                  <div className="max-h-72 space-y-2 overflow-y-auto rounded-xl border border-border/60 bg-background/40 p-2">
                    {roomsQuery.isFetching && !roomsQuery.data && (
                      <div className="space-y-2 p-1">
                        <Skeleton className="h-11 w-full rounded-lg" />
                        <Skeleton className="h-11 w-full rounded-lg" />
                        <Skeleton className="h-11 w-full rounded-lg" />
                      </div>
                    )}
                    {allRates.map((r) => {
                      const active = r.key === rate.key;
                      const diff = r.price.total - rate.price.total;
                      return (
                        <button
                          key={r.key}
                          type="button"
                          onClick={() => {
                            if (roomsQuery.data?.rates.some((x) => x.key === r.key)) setPickedRate(r);
                            else {
                              setPickedRate(null);
                              onChangeRate(r.key);
                            }
                          }}
                          className={`flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-left transition ${
                            active
                              ? "border-primary bg-primary/10"
                              : "border-border/60 hover:border-primary/50 hover:bg-muted/30"
                          }`}
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-xs font-medium">{r.name}</span>
                            <span className="block text-[11px] text-muted-foreground">
                              {r.mealPlanLabel} • {r.refundable ? "Reembolsável" : "Não reembolsável"}
                            </span>
                          </span>
                          <span className="shrink-0 text-right">
                            <span className="block text-xs font-bold text-primary">
                              {fmtMoney(r.price.total)}
                            </span>
                            {!active && diff !== 0 && (
                              <span className="block text-[10px] text-muted-foreground">
                                {diff > 0 ? "+" : "−"} {fmtMoney(Math.abs(diff))}
                              </span>
                            )}
                            {active && <span className="block text-[10px] text-primary">Atual</span>}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>


              {rate.cancelPolicy && (
                <p className="rounded-xl border border-border/50 bg-muted/20 p-3 text-[11px] leading-snug text-muted-foreground">
                  {rate.cancelPolicy}
                </p>
              )}

              {cartUrl && !publicMode && (
                <div className="space-y-2 rounded-xl border border-primary/30 bg-primary/5 p-3">
                  <div className="text-xs font-semibold">Link do carrinho</div>
                  <div className="break-all text-[11px] text-muted-foreground">{cartUrl}</div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      className="flex-1"
                      onClick={() => {
                        navigator.clipboard.writeText(cartUrl);
                        toast.success("Link copiado");
                      }}
                    >
                      <Copy className="h-3.5 w-3.5" /> Copiar
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      className="flex-1"
                      onClick={() =>
                        window.open(
                          `https://wa.me/?text=${encodeURIComponent(
                            `Segue o link para concluir a reserva da hospedagem:\n${cartUrl}`,
                          )}`,
                          "_blank",
                          "noopener",
                        )
                      }
                    >
                      WhatsApp
                    </Button>
                  </div>
                </div>
              )}
            </div>

            <div className="flex flex-col justify-between gap-6 md:col-span-5">
              <div className="rounded-2xl border border-border/60 bg-background/60 p-5">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Diária média</span>
                  <span className="font-medium">{fmtMoney(rate.price.totalPerNight)}</span>
                </div>
                <Separator className="my-4" />
                <span className="text-xs text-muted-foreground">Total da hospedagem</span>
                <div className="text-3xl font-black tracking-tight text-primary">
                  {fmtMoney(rate.price.total)}
                </div>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  Taxas e impostos inclusos no valor total
                </p>
              </div>

              <div className="flex flex-col gap-3">
                {onComboSelect ? (
                  <Button
                    className="w-full py-6 text-xs font-black uppercase tracking-[0.15em]"
                    onClick={() => {
                      onComboSelect({
                        title: `${hotel.name} \u2022 ${rate.name}`,
                        summary: summaryText,
                        total: rate.price.total,
                        card: (
                          <HotelCard
                            h={hotel}
                            rate={rate}
                            nights={nights}
                            selected={false}
                            cheapest={false}
                            readOnly
                            onSelect={() => {}}
                          />
                        ),
                        buy: async () => {
                          const r = await cartMut.mutateAsync();
                          return r.url;
                        },
                        hotelBooking: {
                          searchKey: activeSearchKey,
                          hotelId: hotel.hotelId,
                          rateKeys: [rate.key],
                          pointId: point?.id ?? "",
                          pointType: point?.type ?? 1,
                          checkIn,
                          checkOut,
                          adults,
                          children,
                          rooms,
                        },
                      });
                      onOpenChange(false);
                    }}
                  >
                    Revisar pedido
                  </Button>
                ) : publicMode ? (
                <Button
                  className="w-full py-6 text-xs font-black uppercase tracking-[0.15em]"
                  disabled={buyingPublic}
                  onClick={async () => {
                    setBuyingPublic(true);
                    try {
                      const r = await cartMut.mutateAsync();
                      window.location.href = r.url;
                    } catch {
                      setBuyingPublic(false);
                    }
                  }}
                >
                  {buyingPublic ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ShoppingCart className="h-4 w-4" />
                  )}
                  Comprar viagem
                </Button>
                ) : (
                <>
                <Button
                  className="w-full py-6 text-xs font-black uppercase tracking-[0.15em]"
                  disabled={cartMut.isPending}
                  onClick={() => cartMut.mutate()}
                >
                  {cartMut.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ExternalLink className="h-4 w-4" />
                  )}
                  Comprar viagem
                </Button>
                <Button
                  variant="outline"
                  className="w-full py-5 text-[10px] font-black uppercase tracking-[0.15em]"
                  onClick={() => setOrderOpen(true)}
                >
                  <ShoppingCart className="h-4 w-4" /> Fazer pedido
                </Button>
                </>
                )}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {!publicMode && (
        <NewOrderFromHotelDialog
          open={orderOpen}
          onOpenChange={setOrderOpen}
          total={rate.price.total}
          pax={Math.max(1, adults)}
          summary={summaryText}
        />
      )}
    </>
  );
}

/** Cria o pedido interno já com o valor e o resumo da hospedagem escolhida. */
function NewOrderFromHotelDialog({
  open,
  onOpenChange,
  total,
  pax,
  summary,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  total: number;
  pax: number;
  summary: string;
}) {
  const navigate = useNavigate();
  const create = useServerFn(createOrder);
  const [form, setForm] = useState({ full_name: "", cpf: "", email: "", phone: "" });

  const mut = useMutation({
    mutationFn: async () =>
      create({
        data: {
          full_name: form.full_name,
          cpf: form.cpf,
          email: form.email,
          phone: form.phone,
          payment_method: "other",
          expected_total: total,
          total_price: total,
          adults: pax,
          notes: summary,
          supplier_name: "Comprar Viagem",
        },
      }),
    onSuccess: (r: { id: string; order_number: string | number }) => {
      toast.success(`Pedido ${r.order_number} criado`);
      onOpenChange(false);
      navigate({ to: "/admin/pedidos/$id", params: { id: r.id } });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao criar pedido"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Fazer pedido</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="whitespace-pre-line rounded-xl border border-border/60 bg-muted/40 p-3 text-xs">
            {summary}
          </div>
          <div className="flex items-center justify-between rounded-xl border border-primary/40 bg-primary/5 px-3 py-2">
            <span className="text-sm text-muted-foreground">Total do pedido</span>
            <span className="text-lg font-bold text-primary">{fmtMoney(total)}</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Nome completo</Label>
              <Input
                value={form.full_name}
                onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>CPF</Label>
              <Input value={form.cpf} onChange={(e) => setForm((f) => ({ ...f, cpf: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>E-mail</Label>
              <Input value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Telefone</Label>
              <Input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            disabled={mut.isPending}
            onClick={() => {
              if (!form.full_name.trim()) return toast.error("Preencha o nome completo");
              if (!form.cpf.trim()) return toast.error("Informe o CPF");
              mut.mutate();
            }}
          >
            {mut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShoppingCart className="h-4 w-4" />}
            Criar pedido
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


// ---------------------------------------------------------------- página

export type HotelPreset = {
  destination: string;
  checkIn: string;
  checkOut: string;
  adults: number;
  children: number;
  rooms: number;
};

export function HoteisPage({
  header,
  hideForm,
  preset,
  runToken,
  onComboSelect,
  publicMode = false,
}: {
  header?: React.ReactNode;
  hideForm?: boolean;
  preset?: HotelPreset;
  runToken?: number;
  onComboSelect?: (pick: ComboPick) => void;
  publicMode?: boolean;
} = {}) {
  const searchDest = useServerFn(publicMode ? onerHotelDestinationsPublic : onerHotelDestinations);
  const searchAirports = useServerFn(publicMode ? onerAirportSearchPublic : onerAirportSearch);
  const searchHotels = useServerFn(publicMode ? onerHotelSearchPublic : onerHotelSearch);

  const [destQuery, setDestQuery] = useState("");
  const [point, setPoint] = useState<OnerHotelPoint | null>(null);
  const [options, setOptions] = useState<OnerHotelPoint[]>([]);
  const [form, setForm] = useState({ checkIn: "", checkOut: "", adults: 2, children: 0, rooms: 1 });
  const [result, setResult] = useState<OnerHotelSearchResult | null>(null);
  const [filters, setFilters] = useState<Filters>(EMPTY);
  const [selected, setSelected] = useState<{ hotelId: number; rateKey: string } | null>(null);
  const [summaryOpen, setSummaryOpen] = useState(false);

  const [pendingRun, setPendingRun] = useState(0);
  const [page, setPage] = useState(1);

  const PER_PAGE = 20;

  const buildPayload = (targetPage: number, searchKey?: string | null) => ({
    pointId: point!.id,
    pointType: point!.type,
    cityName: point!.name,
    checkIn: form.checkIn,
    checkOut: form.checkOut,
    rooms: Array.from({ length: Number(form.rooms) }).map(() => ({
      adults: Number(form.adults),
      children: Number(form.children),
      childrenAges: [] as number[],
    })),
    page: targetPage,
    perPage: PER_PAGE,
    searchKey: searchKey ?? null,
    hotelName: "",
    stars: [] as number[],
    priceBegin: null,
    priceEnd: null,
    mealPlans: [] as number[],
    sortingCode: "",
  });


  const mut = useMutation({
    mutationFn: () => searchHotels({ data: buildPayload(1) }),
    onSuccess: (r) => {
      setResult(r);
      setPage(1);
      setFilters(EMPTY);
      setSelected(null);
      if (!r.hotels.length) toast.warning("Nenhuma hospedagem retornada");
      else toast.success(`${r.count} hotéis encontrados`);
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Erro na busca"),
  });

  // "Ver mais": pede a próxima página reaproveitando a mesma busca e anexa
  // os hotéis novos à lista atual (sem repetir os já exibidos).
  const moreMut = useMutation({
    mutationFn: () => searchHotels({ data: buildPayload(page + 1, result?.searchKey) }),
    onSuccess: (r) => {
      setPage((p) => p + 1);
      setResult((prev) => {
        if (!prev) return r;
        const seen = new Set(prev.hotels.map((h) => h.hotelId));
        const novos = r.hotels.filter((h) => !seen.has(h.hotelId));
        if (!novos.length) toast.info("Não há mais hospedagens para carregar");
        return {
          ...prev,
          count: Math.max(prev.count, r.count),
          haveMore: r.haveMore && novos.length > 0,
          hotels: [...prev.hotels, ...novos],
        };
      });
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Erro ao carregar mais hospedagens"),
  });


  const nights = useMemo(() => {
    if (!form.checkIn || !form.checkOut) return 0;
    const a = new Date(form.checkIn).getTime();
    const b = new Date(form.checkOut).getTime();
    return Math.max(0, Math.round((b - a) / 86400000));
  }, [form.checkIn, form.checkOut]);

  const filtered = result ? applyFilters(result.hotels, filters) : [];
  const cheapest = filtered.length ? Math.min(...filtered.map((x) => x.rate!.price.total)) : null;
  const selectedEntry = filtered.find((x) => x.h.hotelId === selected?.hotelId) ?? null;
  const selectedRate =
    selectedEntry?.h.rates.find((r) => r.key === selected?.rateKey) ?? selectedEntry?.rate ?? null;

  const canSearch = !!point && !!form.checkIn && !!form.checkOut && nights > 0;

  // Motor único: recebe os parâmetros do formulário compartilhado e dispara a busca.
  useEffect(() => {
    if (!preset || !runToken) return;
    let alive = true;
    setForm((f) => ({
      ...f,
      checkIn: preset.checkIn,
      checkOut: preset.checkOut,
      adults: preset.adults,
      children: preset.children,
      rooms: preset.rooms,
    }));
    (async () => {
      try {
        const raw = preset.destination.trim();
        // Um IATA ("MCO") não é destino de hotel na operadora — resolve a cidade do aeroporto antes.
        const queries: string[] = [];
        if (/^[A-Za-z]{3}$/.test(raw)) {
          try {
            const airports = await searchAirports({ data: { query: raw, isDeparture: false } });
            const hit = airports.find((a) => a.iata?.toUpperCase() === raw.toUpperCase()) ?? airports[0];
            if (hit?.city) queries.push(hit.city);
            if (hit?.name && hit.name !== hit.city) queries.push(hit.name);
          } catch {
            /* segue com o texto original */
          }
        }
        queries.push(raw);

        let chosen: OnerHotelPoint | null = null;
        for (const q of queries) {
          if (!alive) return;
          if (q.trim().length < 3) continue;
          const r = await searchDest({ data: { query: q.trim() } });
          if (!r.length) continue;
          // type 1 = cidade (traz o inventário completo); 3 = hotel específico (traz 1-2 resultados)
          const cities = r.filter((p) => p.type === 1);
          const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
          const exact = cities.find((p) => norm(p.name) === norm(q));
          chosen = exact ?? cities[0] ?? r.find((p) => p.type === 2) ?? null;
          if (chosen) break;
        }
        if (!alive) return;
        if (!chosen) {
          toast.warning("Nenhuma cidade de hospedagem encontrada para o destino");
          return;
        }
        setPoint(chosen);
        setOptions([]);
        setPendingRun(runToken);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erro ao buscar destino");
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runToken]);

  useEffect(() => {
    if (!pendingRun) return;
    if (canSearch) {
      setPendingRun(0);
      mut.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingRun, canSearch]);


  return (
    <div className={header ? "" : "min-h-screen bg-background"}>
      {!hideForm && (
      <header className="relative overflow-hidden border-b border-border/60">
        <div
          className="absolute inset-0 opacity-60"
          style={{ background: "radial-gradient(1200px 400px at 20% -10%, var(--brand-blue), transparent 70%)" }}
          aria-hidden
        />
        <div className="relative mx-auto max-w-7xl px-4 py-8">
          <div className="mb-6">
            {header ?? (
              <>
                <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
                  <BedDouble className="h-6 w-6 text-primary" /> Motor de Hotéis
                </h1>
                <p className="text-sm text-muted-foreground">Hospedagens em tempo real na operadora.</p>

              </>
            )}
          </div>

          <div className="rounded-[32px] border border-border/50 bg-card/60 p-6 shadow-2xl backdrop-blur-xl">
            <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr_auto]">
              <div className="space-y-2">
                <Label className="flex items-center gap-2 px-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  <MapPin className="h-3 w-3 text-primary" /> Destino
                </Label>
                <DestinationAutocomplete
                  point={point}
                  onSelect={(p) => {
                    setPoint(p);
                    setOptions([]);
                    setDestQuery(p?.name ?? "");
                  }}
                  placeholder="Cidade, região ou nome do hotel"
                  className="h-12 rounded-xl border-border/40 bg-muted/40 px-4 text-base font-semibold transition-all focus-visible:ring-2 focus-visible:ring-primary/50"
                />
              </div>


              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                    <CalendarDays className="h-3 w-3" /> Check-in
                  </Label>
                  <Input
                    className="h-11"
                    type="date"
                    value={form.checkIn}
                    onChange={(e) => setForm({ ...form, checkIn: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                    <CalendarDays className="h-3 w-3" /> Check-out
                  </Label>
                  <Input
                    className="h-11"
                    type="date"
                    value={form.checkOut}
                    onChange={(e) => setForm({ ...form, checkOut: e.target.value })}
                  />
                </div>
              </div>

              <div className="flex items-end">
                <Button
                  size="lg"
                  className="h-11 w-full lg:w-auto"
                  disabled={!canSearch || mut.isPending}
                  onClick={() => mut.mutate()}
                >
                  {mut.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Search className="mr-2 h-4 w-4" />
                  )}
                  Buscar
                </Button>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-end gap-3 border-t border-border/60 pt-3">
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Users className="h-3 w-3" /> {form.rooms} quarto(s) • {form.adults * form.rooms} adulto(s)
                {nights > 0 && ` • ${nights} noite(s)`}
              </span>
              {[
                { k: "rooms" as const, l: "Quartos", min: 1, max: 5 },
                { k: "adults" as const, l: "Adultos/quarto", min: 1, max: 9 },
                { k: "children" as const, l: "Crianças/quarto", min: 0, max: 6 },
              ].map((p) => (
                <div key={p.k} className="w-32 space-y-1">
                  <Label className="text-[11px] text-muted-foreground">{p.l}</Label>
                  <Input
                    className="h-9"
                    type="number"
                    min={p.min}
                    max={p.max}
                    value={form[p.k]}
                    onChange={(e) => setForm({ ...form, [p.k]: Number(e.target.value) })}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      </header>
      )}


      <main className="mx-auto max-w-7xl px-4 py-6">
        {mut.isPending && <SearchSkeleton kind="hotel" rows={3} />}

        {result && !mut.isPending && (
          <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
            <aside className="lg:sticky lg:top-4 lg:self-start">
              <FiltersPanel hotels={result.hotels} filters={filters} onChange={setFilters} />
            </aside>

            <div className="space-y-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-lg font-semibold">Hospedagens</h2>
                <span className="text-xs text-muted-foreground">
                  {filtered.length} de {result.hotels.length} exibidos • {result.count} encontrados
                </span>
              </div>

              {filtered.map(({ h, rate }) => (
                <HotelCard
                  key={h.hotelId}
                  h={h}
                  rate={rate!}
                  nights={nights}
                  cheapest={rate!.price.total === cheapest}
                  selected={selected?.hotelId === h.hotelId}
                  onSelect={(rateKey) => {
                    setSelected({ hotelId: h.hotelId, rateKey });
                    setSummaryOpen(true);
                  }}

                />
              ))}

              {!filtered.length && (
                <NoResults
                  title="Desculpe, nenhuma hospedagem foi encontrada."
                  hint="Nenhuma opção com esses filtros. Selecione outra opção de filtro."
                />
              )}


              {result.hotels.length < result.count && (
                <Button
                  variant="outline"
                  className="w-full"
                  disabled={moreMut.isPending}
                  onClick={() => moreMut.mutate()}
                >
                  {moreMut.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Carregando mais hospedagens…
                    </>
                  ) : (
                    `Ver mais hospedagens (${result.hotels.length} de ${result.count})`
                  )}
                </Button>
              )}


              <HotelSummaryDialog
                open={summaryOpen && !!selectedEntry && !!selectedRate}
                onOpenChange={setSummaryOpen}
                hotel={selectedEntry?.h ?? null}
                rate={selectedRate}
                nights={nights}
                rooms={form.rooms}
                checkIn={form.checkIn}
                checkOut={form.checkOut}
                adults={form.adults * form.rooms}
                children={form.children * form.rooms}
                point={point}
                searchKey={result.searchKey}
                onChangeRate={(key) =>
                  selectedEntry && setSelected({ hotelId: selectedEntry.h.hotelId, rateKey: key })
                }
                onComboSelect={onComboSelect}
                publicMode={publicMode}
              />

            </div>
          </div>
        )}

        {!result && !mut.isPending && (
          <div data-empty-state className="rounded-2xl border border-dashed border-border p-12 text-center">
            <BedDouble className="mx-auto mb-3 h-6 w-6 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Escolha o destino e as datas. Os filtros aparecem na lateral depois da pesquisa.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
