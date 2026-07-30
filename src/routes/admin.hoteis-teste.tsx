import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  onerHotelDestinations,
  onerHotelSearch,
  type OnerHotel,
  type OnerHotelPoint,
  type OnerHotelSearchResult,
  type OnerRoomRate,
} from "@/lib/onertravel-hotels.functions";

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

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
        active
          ? "border-primary bg-primary text-primary-foreground shadow-[var(--shadow-glow)]"
          : "border-border bg-background/40 text-muted-foreground hover:border-primary/50 hover:text-foreground"
      }`}
    >
      {children}
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
  const meals = useMemo(() => {
    const set = new Set<string>();
    hotels.forEach((h) => h.rates.forEach((r) => set.add(r.mealPlanLabel)));
    return [...set].sort();
  }, [hotels]);

  const prices = hotels.map((h) => h.lowestTotal).filter(Boolean);
  const lo = prices.length ? Math.min(...prices) : 0;
  const hi = prices.length ? Math.max(...prices) : 0;
  const n = activeCount(filters);

  return (
    <section className="rounded-2xl border border-border/70 bg-card/80 p-4 backdrop-blur">
      <header className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <SlidersHorizontal className="h-4 w-4 text-primary" /> Filtros
          {n > 0 && <Badge variant="secondary">{n}</Badge>}
        </div>
        {n > 0 && (
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => onChange(EMPTY)}>
            <RotateCcw className="mr-1 h-3 w-3" /> Limpar
          </Button>
        )}
      </header>

      <div className="space-y-5">
        <div className="space-y-2">
          <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Nome da hospedagem</Label>
          <Input
            className="h-9"
            placeholder="Ex.: Deville"
            value={filters.name}
            onChange={(e) => onChange({ ...filters, name: e.target.value })}
          />
        </div>

        <div className="space-y-2">
          <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Estrelas</Label>
          <div className="flex flex-wrap gap-2">
            {[1, 2, 3, 4, 5].map((s) => (
              <Chip
                key={s}
                active={filters.stars.includes(s)}
                onClick={() => onChange({ ...filters, stars: toggle(filters.stars, s) })}
              >
                {s}★
              </Chip>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Preço total</Label>
          <div className="text-xs text-muted-foreground">
            {fmtMoney(lo)} — {fmtMoney(hi)}
          </div>
          <div className="flex gap-2">
            <Input
              className="h-9"
              placeholder="De"
              inputMode="decimal"
              value={filters.minPrice}
              onChange={(e) => onChange({ ...filters, minPrice: e.target.value })}
            />
            <Input
              className="h-9"
              placeholder="Até"
              inputMode="decimal"
              value={filters.maxPrice}
              onChange={(e) => onChange({ ...filters, maxPrice: e.target.value })}
            />
          </div>
        </div>

        {meals.length > 0 && (
          <div className="space-y-2">
            <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Refeições</Label>
            <div className="flex flex-wrap gap-2">
              {meals.map((m) => (
                <Chip
                  key={m}
                  active={filters.meals.includes(m)}
                  onClick={() => onChange({ ...filters, meals: toggle(filters.meals, m) })}
                >
                  {m}
                </Chip>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-2">
          <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Cancelamento</Label>
          <Chip
            active={filters.onlyRefundable}
            onClick={() => onChange({ ...filters, onlyRefundable: !filters.onlyRefundable })}
          >
            Somente reembolsável
          </Chip>
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
}: {
  h: OnerHotel;
  rate: OnerRoomRate;
  nights: number;
  selected: boolean;
  onSelect: (rateKey: string) => void;
  cheapest: boolean;
}) {
  const [openRooms, setOpenRooms] = useState(false);
  return (
    <article
      className={`relative overflow-hidden rounded-2xl border bg-card/80 backdrop-blur transition hover:-translate-y-0.5 hover:border-primary/60 hover:shadow-[var(--shadow-card)] ${
        selected ? "border-primary ring-2 ring-primary/30" : "border-border/70"
      }`}
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

          {h.rates.length > 1 && (
            <Button
              variant="ghost"
              size="sm"
              className="mt-2 h-7 px-2 text-xs"
              onClick={() => setOpenRooms((v) => !v)}
            >
              {openRooms ? "Ocultar quartos" : `Ver outros ${h.rates.length - 1} quarto(s)`}
            </Button>
          )}
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
          <Button size="sm" variant={selected ? "default" : "outline"} onClick={() => onSelect(rate.key)}>
            {selected ? (
              <>
                <Check className="mr-1 h-3.5 w-3.5" /> Selecionado
              </>
            ) : (
              "Selecionar"
            )}
          </Button>
        </div>
      </div>
    </article>
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
}: {
  header?: React.ReactNode;
  hideForm?: boolean;
  preset?: HotelPreset;
  runToken?: number;
} = {}) {
  const searchDest = useServerFn(onerHotelDestinations);
  const searchHotels = useServerFn(onerHotelSearch);

  const [destQuery, setDestQuery] = useState("");
  const [point, setPoint] = useState<OnerHotelPoint | null>(null);
  const [options, setOptions] = useState<OnerHotelPoint[]>([]);
  const [form, setForm] = useState({ checkIn: "", checkOut: "", adults: 2, children: 0, rooms: 1 });
  const [result, setResult] = useState<OnerHotelSearchResult | null>(null);
  const [filters, setFilters] = useState<Filters>(EMPTY);
  const [selected, setSelected] = useState<{ hotelId: number; rateKey: string } | null>(null);
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

  const destMut = useMutation({
    mutationFn: () => searchDest({ data: { query: destQuery.trim() } }),
    onSuccess: (r) => {
      setOptions(r);
      if (!r.length) toast.warning("Nenhum destino encontrado");
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Erro ao buscar destino"),
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
        const r = await searchDest({ data: { query: preset.destination.trim() } });
        if (!alive) return;
        if (!r.length) {
          toast.warning("Nenhum destino de hospedagem encontrado");
          return;
        }
        setPoint(r[0]);
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
                <p className="text-sm text-muted-foreground">
                  Hospedagens em tempo real na operadora — tarifas por noite, refeições e política de cancelamento.
                </p>
              </>
            )}
          </div>

          <div className="rounded-2xl border border-border/70 bg-card/85 p-4 shadow-[var(--shadow-card)] backdrop-blur">
            <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr_auto]">
              <div className="space-y-1">
                <Label className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                  <MapPin className="h-3 w-3" /> Destino
                </Label>
                <div className="flex gap-2">
                  <Input
                    className="h-11"
                    placeholder="Cidade ou ponto de interesse"
                    value={point ? `${point.name}${point.description ? ` — ${point.description}` : ""}` : destQuery}
                    onChange={(e) => {
                      setPoint(null);
                      setDestQuery(e.target.value);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && destQuery.trim().length >= 3) destMut.mutate();
                    }}
                  />
                  <Button
                    variant="outline"
                    className="h-11"
                    disabled={destQuery.trim().length < 3 || destMut.isPending}
                    onClick={() => destMut.mutate()}
                  >
                    {destMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  </Button>
                </div>
                {!point && options.length > 0 && (
                  <div className="mt-1 max-h-44 overflow-auto rounded-xl border border-border/70 bg-popover p-1">
                    {options.map((o) => (
                      <button
                        key={`${o.type}-${o.id}`}
                        type="button"
                        onClick={() => {
                          setPoint(o);
                          setOptions([]);
                        }}
                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-muted"
                      >
                        <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="font-medium">{o.name}</span>
                        <span className="text-xs text-muted-foreground">{o.description}</span>
                      </button>
                    ))}
                  </div>
                )}
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
        {mut.isPending && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Consultando fornecedores… pode levar até 30 segundos
            </div>
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-40 w-full rounded-2xl" />
            ))}
          </div>
        )}

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
                  onSelect={(rateKey) => setSelected({ hotelId: h.hotelId, rateKey })}
                />
              ))}

              {!filtered.length && (
                <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                  Nenhuma hospedagem com esses filtros.
                </p>
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


              {selectedEntry && selectedRate && (
                <div className="sticky bottom-4 z-10 rounded-2xl border border-primary/40 bg-card/95 p-5 shadow-[var(--shadow-card)] backdrop-blur">
                  <div className="mb-3 text-sm font-semibold">Resumo da hospedagem</div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-1 text-sm">
                      <div className="font-medium">{selectedEntry.h.name}</div>
                      <div className="text-muted-foreground">{selectedRate.name}</div>
                      <div className="text-muted-foreground">
                        {selectedRate.mealPlanLabel} •{" "}
                        {selectedRate.refundable ? "Reembolsável" : "Não reembolsável"}
                      </div>
                      <div className="text-muted-foreground">
                        {form.checkIn.split("-").reverse().join("/")} a{" "}
                        {form.checkOut.split("-").reverse().join("/")} • {nights} noite(s) • {form.rooms} quarto(s)
                      </div>
                    </div>
                    <div className="space-y-1 rounded-xl border border-border/60 bg-background/50 p-4 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Diária média</span>
                        <span>{fmtMoney(selectedRate.price.totalPerNight)}</span>
                      </div>
                      <Separator className="my-2" />
                      <div className="flex items-end justify-between">
                        <span className="font-semibold">Total da hospedagem</span>
                        <span className="text-2xl font-bold text-primary">
                          {fmtMoney(selectedRate.price.total)}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground">Taxas e impostos inclusos</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {!result && !mut.isPending && (
          <div className="rounded-2xl border border-dashed border-border p-12 text-center">
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
