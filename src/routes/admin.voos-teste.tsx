import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Loader2,
  Plane,
  Search,
  ArrowRight,
  ArrowLeftRight,
  Luggage,
  BriefcaseBusiness,
  Check,
  CreditCard,
  Users,
  CalendarDays,
  MapPin,
  SlidersHorizontal,
  RotateCcw,
  Clock,
  ChevronDown,

} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import { installmentLabel, maxInstallments } from "@/lib/flight-installments";
import {
  onerFlightSearch,
  onerInboundSearch,
  flightHasBaggage,
  type OnerFlight,
  type OnerSearchResult,
  type OnerLegResult,
} from "@/lib/onertravel.functions";

export const Route = createFileRoute("/admin/voos-teste")({
  head: () => ({
    meta: [
      { title: "Motor de Voos — VIA AIR" },
      {
        name: "description",
        content:
          "Motor de busca de passagens aéreas VIA AIR: filtros por bagagem, paradas, horário e companhia, com combinação de tarifas e taxas.",
      },
      { property: "og:title", content: "Motor de Voos — VIA AIR" },
      { property: "og:description", content: "Busca de passagens com filtros e combinação de tarifas ida + volta." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: VoosPage,
});

// ---------------------------------------------------------------- utils

function fmtMoney(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtTime(t: { hour: number; minute: number }) {
  return `${String(t.hour).padStart(2, "0")}:${String(t.minute).padStart(2, "0")}`;
}
function fmtDate(d: { year: number; month: number; day: number }) {
  return `${String(d.day).padStart(2, "0")}/${String(d.month).padStart(2, "0")}`;
}
function taxesOf(f: OnerFlight) {
  return (f.price.tax ?? 0) + (f.price.serviceTax ?? 0);
}
function airlineOf(f: OnerFlight) {
  return f.journey.marketingAirline ?? f.journey.segments[0]?.marketingAirline ?? null;
}
/** minutos absolutos de um ponto (data + hora), para calcular conexões */
function absMinutes(p: { date: { year: number; month: number; day: number }; time: { hour: number; minute: number } }) {
  return Date.UTC(p.date.year, p.date.month - 1, p.date.day, p.time.hour, p.time.minute) / 60000;
}
function fmtDur(min: number) {
  const m = Math.max(0, Math.round(min));
  return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}`;
}


// ---------------------------------------------------------------- filtros

/**
 * A operadora só devolve a família tarifária mais barata de cada voo (LIGHT,
 * sem bagagem). Por isso bagagem, paradas, preço, companhia e horário de
 * partida são reaplicados NA OPERADORA (nova consulta com a mesma searchKey).
 * O horário de chegada não existe na API — esse filtramos aqui.
 */
type Filters = {
  onlyBaggage: boolean;
  maxStops: number;
  airlines: string[];
  minPrice: string;
  maxPrice: string;
  dep: [number, number];
  arr: [number, number];
};

const FULL_DAY: [number, number] = [0, 1440];

const EMPTY_FILTERS: Filters = {
  onlyBaggage: false,
  maxStops: 2,
  airlines: [],
  minPrice: "",
  maxPrice: "",
  dep: [...FULL_DAY] as [number, number],
  arr: [...FULL_DAY] as [number, number],
};

function fmtMinutes(m: number) {
  const v = Math.min(m, 1439);
  return `${String(Math.floor(v / 60)).padStart(2, "0")}:${String(v % 60).padStart(2, "0")}`;
}

function toOperatorFilters(f: Filters) {
  const min = Number(f.minPrice.replace(",", "."));
  const max = Number(f.maxPrice.replace(",", "."));
  return {
    containsDispatchBaggage: f.onlyBaggage,
    maxStops: f.maxStops,
    startPrice: f.minPrice && !Number.isNaN(min) ? min : null,
    endPrice: f.maxPrice && !Number.isNaN(max) ? max : null,
    departureFrom: f.dep[0],
    departureTo: f.dep[1],
    airlineIatas: f.airlines,
    cabinClass: null,
  };
}

/** Só o que a operadora não sabe filtrar: janela de chegada. */
function applyFilters(list: OnerFlight[], f: Filters) {
  if (f.arr[0] === FULL_DAY[0] && f.arr[1] === FULL_DAY[1]) return list;
  return list.filter((fl) => {
    const t = fl.journey.destination.time;
    const m = t.hour * 60 + t.minute;
    return m >= f.arr[0] && m <= f.arr[1];
  });
}

function activeCount(f: Filters) {
  return (
    (f.onlyBaggage ? 1 : 0) +
    (f.maxStops !== 2 ? 1 : 0) +
    f.airlines.length +
    (f.minPrice ? 1 : 0) +
    (f.maxPrice ? 1 : 0) +
    (f.dep[0] !== 0 || f.dep[1] !== 1440 ? 1 : 0) +
    (f.arr[0] !== 0 || f.arr[1] !== 1440 ? 1 : 0)
  );
}

function toggle<T>(arr: T[], v: T): T[] {
  return arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
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

function TimeRange({
  label,
  value,
  onChange,
}: {
  label: string;
  value: [number, number];
  onChange: (v: [number, number]) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</Label>
        <span className="text-[11px] font-medium text-foreground">
          {fmtMinutes(value[0])} — {fmtMinutes(value[1])}
        </span>
      </div>
      <Slider
        min={0}
        max={1440}
        step={30}
        value={value}
        onValueChange={(v) => onChange([v[0], v[1]] as [number, number])}
        aria-label={label}
      />
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>00:00</span>
        <span>12:00</span>
        <span>23:59</span>
      </div>
    </div>
  );
}

function FiltersPanel({
  title,
  flights,
  filters,
  onChange,
  loading,
  priceRange,
}: {
  title: string;
  flights: OnerFlight[];
  filters: Filters;
  onChange: (f: Filters) => void;
  loading?: boolean;
  priceRange?: { minPrice: number; maxPrice: number } | null;
}) {
  const airlines = useMemo(() => {
    const map = new Map<string, string>();
    flights.forEach((f) => {
      const a = airlineOf(f);
      if (a?.iata) map.set(a.iata, a.name?.trim() || a.iata);
    });
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [flights]);

  const prices = flights.map((f) => f.price.total);
  const lo = priceRange?.minPrice ?? (prices.length ? Math.min(...prices) : 0);
  const hi = priceRange?.maxPrice ?? (prices.length ? Math.max(...prices) : 0);
  const n = activeCount(filters);

  return (
    <section className="rounded-2xl border border-border/70 bg-card/80 p-4 backdrop-blur">
      <header className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <SlidersHorizontal className="h-4 w-4 text-primary" />
          {title}
          {n > 0 && <Badge variant="secondary">{n}</Badge>}
          {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />}
        </div>
        {n > 0 && (
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => onChange(EMPTY_FILTERS)}>
            <RotateCcw className="mr-1 h-3 w-3" /> Limpar
          </Button>
        )}
      </header>

      <div className={`space-y-5 ${loading ? "pointer-events-none opacity-60" : ""}`}>
        <div className="space-y-2">
          <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Bagagem</Label>
          <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-border/60 bg-background/40 px-3 py-2 text-sm">
            <Checkbox
              checked={filters.onlyBaggage}
              onCheckedChange={(v) => onChange({ ...filters, onlyBaggage: v === true })}
            />
            <Luggage className="h-4 w-4 text-muted-foreground" />
            Bagagem para despachar
          </label>
          <p className="text-[11px] leading-snug text-muted-foreground">
            Ao marcar, a operadora refaz a busca com as tarifas que já incluem bagagem despachada.
          </p>
        </div>

        <div className="space-y-2">
          <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Paradas</Label>
          <div className="flex flex-wrap gap-2">
            {[
              { v: 0, l: "Direto" },
              { v: 1, l: "Até 1 parada" },
              { v: 2, l: "Todos" },
            ].map((o) => (
              <Chip
                key={o.v}
                active={filters.maxStops === o.v}
                onClick={() => onChange({ ...filters, maxStops: o.v })}
              >
                {o.l}
              </Chip>
            ))}
          </div>
        </div>

        <TimeRange
          label="Horário de partida"
          value={filters.dep}
          onChange={(dep) => onChange({ ...filters, dep })}
        />

        <TimeRange
          label="Horário de chegada"
          value={filters.arr}
          onChange={(arr) => onChange({ ...filters, arr })}
        />

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

        {airlines.length > 0 && (
          <div className="space-y-2">
            <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Companhia aérea</Label>
            <div className="flex flex-wrap gap-2">
              {airlines.map(([iata, name]) => (
                <Chip
                  key={iata}
                  active={filters.airlines.includes(iata)}
                  onClick={() => onChange({ ...filters, airlines: toggle(filters.airlines, iata) })}
                >
                  {name}
                </Chip>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- stepper

function Stepper({ step, roundTrip }: { step: number; roundTrip: boolean }) {
  const steps = roundTrip
    ? ["Buscar", "Escolher ida", "Escolher volta", "Resumo"]
    : ["Buscar", "Escolher voo", "Resumo"];
  return (
    <ol className="flex flex-wrap items-center gap-2 text-xs">
      {steps.map((s, i) => {
        const done = i < step;
        const current = i === step;
        return (
          <li key={s} className="flex items-center gap-2">
            <span
              className={`flex items-center gap-2 rounded-full border px-3 py-1.5 font-medium transition ${
                current
                  ? "border-primary bg-primary/15 text-foreground"
                  : done
                    ? "border-primary/40 text-primary"
                    : "border-border/60 text-muted-foreground"
              }`}
            >
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${
                  done ? "bg-primary text-primary-foreground" : current ? "bg-primary/30" : "bg-muted"
                }`}
              >
                {done ? <Check className="h-3 w-3" /> : i + 1}
              </span>
              {s}
            </span>
            {i < steps.length - 1 && <span className="h-px w-4 bg-border" />}
          </li>
        );
      })}
    </ol>
  );
}

// ---------------------------------------------------------------- card

/** Detalhamento de trechos e tempo de conexão. */
function SegmentsDetail({ f }: { f: OnerFlight }) {
  const segs = f.journey.segments;
  return (
    <div className="mt-3 space-y-3 rounded-xl border border-border/60 bg-background/50 p-3">
      {segs.map((s, i) => {
        const prev = segs[i - 1];
        const layover = prev ? absMinutes(s.departure) - absMinutes(prev.destination) : 0;
        return (
          <div key={`${s.segmentNumber}-${s.flightNumber}`} className="space-y-3">
            {prev && (
              <div className="flex items-center gap-2 text-[11px] font-medium text-muted-foreground">
                <span className="h-px flex-1 bg-border" />
                <Clock className="h-3 w-3" />
                Conexão em {prev.destination.iata} • {fmtDur(layover)}
                <span className="h-px flex-1 bg-border" />
              </div>
            )}
            <div className="flex flex-wrap items-center gap-3 text-xs">
              {s.marketingAirline?.pathLogo ? (
                <img
                  src={s.marketingAirline.pathLogo}
                  alt={s.marketingAirline?.name ?? "Companhia aérea"}
                  className="h-5 w-5 rounded bg-white object-contain"
                  loading="lazy"
                />
              ) : (
                <Plane className="h-4 w-4 text-muted-foreground" />
              )}
              <span className="font-semibold">
                {s.marketingAirline?.iata ?? ""}
                {s.flightNumber}
              </span>
              <span>
                <strong>{fmtTime(s.departure.time)}</strong> {s.departure.iata}
                <span className="text-muted-foreground"> ({fmtDate(s.departure.date)})</span>
              </span>
              <ArrowRight className="h-3 w-3 text-muted-foreground" />
              <span>
                <strong>{fmtTime(s.destination.time)}</strong> {s.destination.iata}
                <span className="text-muted-foreground"> ({fmtDate(s.destination.date)})</span>
              </span>
              <span className="text-muted-foreground">
                {fmtDur(absMinutes(s.destination) - absMinutes(s.departure))}
                {s.cabinClass ? ` • ${s.cabinClass}` : ""}
                {s.airlineFareFamily ? ` • ${s.airlineFareFamily}` : ""}
              </span>
            </div>
            <div className="text-[11px] text-muted-foreground">
              {s.departure.name} → {s.destination.name}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Barra compacta do trecho já escolhido, com botão de editar (volta ao passo). */

function SelectedLegBar({ label, f, onEdit }: { label: string; f: OnerFlight; onEdit: () => void }) {
  const j = f.journey;
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-primary/40 bg-primary/5 p-3">
      <Badge className="gap-1">
        <Check className="h-3 w-3" /> {label}
      </Badge>
      {j.marketingAirline?.pathLogo ? (
        <img
          src={j.marketingAirline.pathLogo}
          alt={j.marketingAirline?.name ?? "Companhia aérea"}
          className="h-6 w-6 rounded bg-white object-contain"
          loading="lazy"
        />
      ) : (
        <Plane className="h-4 w-4 text-muted-foreground" />
      )}
      <div className="text-sm font-semibold">
        {j.departure.iata} {fmtTime(j.departure.time)} → {j.destination.iata} {fmtTime(j.destination.time)}
      </div>
      <span className="text-xs text-muted-foreground">
        {fmtDate(j.departure.date)} • {j.numberOfStops === 0 ? "direto" : `${j.numberOfStops} conexão(ões)`} •{" "}
        {flightHasBaggage(f) ? "com bagagem" : "só mão"}
      </span>
      <div className="ml-auto flex items-center gap-3">
        <span className="text-sm font-bold text-primary">{fmtMoney(f.price.total)}</span>
        <Button size="sm" variant="outline" onClick={onEdit} className="gap-1">
          <RotateCcw className="h-3.5 w-3.5" /> Editar
        </Button>
      </div>
    </div>
  );
}

function FlightCard({
  f,
  selected,
  onSelect,
  cheapest,
  readOnly,
  label,
}: {
  f: OnerFlight;
  selected?: boolean;
  onSelect?: () => void;
  cheapest?: boolean;
  readOnly?: boolean;
  label?: string;
}) {
  const j = f.journey;
  const withBag = flightHasBaggage(f);
  const [open, setOpen] = useState(false);
  const interactive = !readOnly && !!onSelect;
  return (
    <div
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={interactive ? onSelect : undefined}
      onKeyDown={(e) => {
        if (interactive && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onSelect?.();
        }
      }}
      className={`group relative overflow-hidden rounded-2xl border bg-card/80 p-4 backdrop-blur transition ${
        interactive ? "cursor-pointer hover:-translate-y-0.5 hover:border-primary/60 hover:shadow-[var(--shadow-card)]" : ""
      } ${selected ? "border-primary ring-2 ring-primary/30" : "border-border/70"}`}
    >
      {label && (
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
      )}

      {cheapest && (
        <span className="absolute right-0 top-0 rounded-bl-xl bg-primary px-2 py-1 text-[10px] font-semibold text-primary-foreground">
          Menor preço
        </span>
      )}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border/60 bg-background/60">
          {j.marketingAirline?.pathLogo ? (
            <img
              src={j.marketingAirline.pathLogo}
              alt={j.marketingAirline?.name ?? "Companhia aérea"}
              className="h-7 w-7 rounded bg-white object-contain"
              loading="lazy"
            />
          ) : (
            <Plane className="h-5 w-5 text-muted-foreground" />
          )}
        </div>

        <div className="min-w-[240px] flex-1">
          <div className="flex items-center gap-3">
            <div className="text-center">
              <div className="text-lg font-bold leading-none">{fmtTime(j.departure.time)}</div>
              <div className="text-[11px] text-muted-foreground">{j.departure.iata}</div>
            </div>
            <div className="flex flex-1 items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" />
              <span className="h-px flex-1 bg-border" />
              <span className="whitespace-nowrap rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                {j.numberOfStops === 0 ? "direto" : `${j.numberOfStops} conexão(ões)`}
              </span>
              <span className="h-px flex-1 bg-border" />
              <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            </div>
            <div className="text-center">
              <div className="text-lg font-bold leading-none">{fmtTime(j.destination.time)}</div>
              <div className="text-[11px] text-muted-foreground">{j.destination.iata}</div>
            </div>
          </div>

          <div className="mt-2 text-xs text-muted-foreground">
            {fmtDate(j.departure.date)} • {j.flyingTime.hour}h{String(j.flyingTime.minute).padStart(2, "0")} •{" "}
            {j.marketingAirline?.name?.trim()} •{" "}
            {j.segments.map((s) => `${s.marketingAirline?.iata ?? ""}${s.flightNumber}`).join(" + ")}
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge variant={withBag ? "default" : "secondary"} className="gap-1">
              {withBag ? <Luggage className="h-3 w-3" /> : <BriefcaseBusiness className="h-3 w-3" />}
              {withBag ? "Bagagem despachada" : "Só bagagem de mão"}
            </Badge>
            {j.fareClass?.airlineFareFamily && <Badge variant="outline">{j.fareClass.airlineFareFamily}</Badge>}
            {selected && (
              <Badge className="gap-1">
                <Check className="h-3 w-3" /> Selecionado
              </Badge>
            )}
          </div>
        </div>

        <div className="ml-auto text-right">
          <div className="text-xl font-bold text-primary">{fmtMoney(f.price.total)}</div>
          <div className="text-xs text-muted-foreground">
            tarifa {fmtMoney(f.price.price)} + taxas {fmtMoney(taxesOf(f))}
          </div>
          <div className="text-[11px] text-muted-foreground">
            {f.price.passengerCount} pax • {installmentLabel(f.price.total, airlineOf(f))}
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        aria-expanded={open}
        className="mt-3 flex items-center gap-1 text-xs font-medium text-primary hover:underline"
      >
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
        {open
          ? "Ocultar detalhes"
          : j.numberOfStops === 0
            ? "Ver detalhes do voo"
            : `Ver ${j.numberOfStops} conexão(ões)`}
      </button>
      {open && <SegmentsDetail f={f} />}
    </div>

  );
}

// ---------------------------------------------------------------- resumo

function SummaryCard({ out, inb }: { out: OnerFlight; inb: OnerFlight | null }) {
  const fare = out.price.price + (inb?.price.price ?? 0);
  const taxes = taxesOf(out) + (inb ? taxesOf(inb) : 0);
  const total = out.price.total + (inb?.price.total ?? 0);
  const pax = out.price.passengerCount || 1;
  const n = Math.min(maxInstallments(airlineOf(out)), inb ? maxInstallments(airlineOf(inb)) : 99);

  const Leg = ({ label, f }: { label: string; f: OnerFlight }) => (
    <div className="space-y-1">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label} • {airlineOf(f)?.name?.trim() ?? "—"}
      </div>
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">Tarifa</span>
        <span>{fmtMoney(f.price.price)}</span>
      </div>
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">Taxas e serviço</span>
        <span>{fmtMoney(taxesOf(f))}</span>
      </div>
      <div className="flex justify-between text-sm font-semibold">
        <span>Subtotal</span>
        <span>{fmtMoney(f.price.total)}</span>
      </div>
    </div>
  );

  return (
    <div className="rounded-2xl border border-primary/40 bg-card/95 p-5 shadow-[var(--shadow-card)] backdrop-blur">
      <div className="mb-4 flex items-center gap-2 text-sm font-semibold">
        <Plane className="h-4 w-4 text-primary" /> Voos selecionados
      </div>
      <div className="mb-5 space-y-3">
        <FlightCard f={out} label={inb ? "Ida" : "Voo"} readOnly />
        {inb && <FlightCard f={inb} label="Volta" readOnly />}
      </div>

      <div className="mb-4 flex items-center gap-2 text-sm font-semibold">
        <CreditCard className="h-4 w-4 text-primary" /> Resumo do preço
      </div>
      <div className="grid gap-5 md:grid-cols-[1fr_auto_1fr]">

        <div className="space-y-4">
          <Leg label="Ida" f={out} />
          {inb && (
            <>
              <Separator />
              <Leg label="Volta" f={inb} />
            </>
          )}
        </div>

        <Separator orientation="vertical" className="hidden md:block" />

        <div className="space-y-1 rounded-xl border border-border/60 bg-background/50 p-4">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Aéreo ({pax} pax)</span>
            <span>{fmtMoney(fare)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Taxas e serviço</span>
            <span>{fmtMoney(taxes)}</span>
          </div>
          <Separator className="my-2" />
          <div className="flex items-end justify-between">
            <span className="font-semibold">Total à vista</span>
            <span className="text-2xl font-bold text-primary">{fmtMoney(total)}</span>
          </div>
          <div className="text-xs text-muted-foreground">
            {n}x de {fmtMoney(total / n)} sem juros
          </div>
          <div className="text-xs text-muted-foreground">Por passageiro: {fmtMoney(total / pax)}</div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- página

function VoosPage() {
  const search = useServerFn(onerFlightSearch);
  const searchInbound = useServerFn(onerInboundSearch);
  const [form, setForm] = useState({
    departureIata: "CWB",
    arrivalIata: "GRU",
    departureDate: "",
    returnDate: "",
    adults: 1,
    children: 0,
    infants: 0,
  });
  const [result, setResult] = useState<OnerSearchResult | null>(null);
  const [selectedOut, setSelectedOut] = useState<string | null>(null);
  const [selectedIn, setSelectedIn] = useState<string | null>(null);
  const [inbound, setInbound] = useState<OnerLegResult | null>(null);
  const [outFilters, setOutFilters] = useState<Filters>(EMPTY_FILTERS);
  const [inFilters, setInFilters] = useState<Filters>(EMPTY_FILTERS);
  const [isRoundTrip, setIsRoundTrip] = useState(false);
  /** companhias da primeira busca (sem filtro), para os chips não sumirem */
  const [airlinePool, setAirlinePool] = useState<OnerFlight[]>([]);

  const paxData = () => ({
    departureIata: form.departureIata.trim().toUpperCase(),
    arrivalIata: form.arrivalIata.trim().toUpperCase(),
    departureDate: form.departureDate,
    adults: Number(form.adults),
    children: Number(form.children),
    infants: Number(form.infants),
    pageSize: 30,
  });

  const mut = useMutation({
    mutationFn: (opts: { searchKey?: string | null; filters: Filters }) =>
      search({
        data: {
          ...paxData(),
          returnDate: form.returnDate || null,
          searchKey: opts.searchKey ?? null,
          filters: toOperatorFilters(opts.filters),
        },
      }),
    onSuccess: (r, vars) => {
      setResult(r);
      if (!vars.searchKey) {
        setSelectedOut(null);
        setSelectedIn(null);
        setInbound(null);
        setOutFilters(EMPTY_FILTERS);
        setInFilters(EMPTY_FILTERS);
        setIsRoundTrip(!!form.returnDate);
        setAirlinePool(r.outbound.flights);
        if (!r.outbound.flights.length) toast.warning("Nenhum voo retornado para esses parâmetros");
        else toast.success(`${r.outbound.flights.length} voos encontrados`);
      } else if (!r.outbound.flights.length) {
        toast.warning("Nenhum voo com esses filtros");
      }
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Erro na busca"),
  });

  const inboundMut = useMutation({
    mutationFn: (opts: { flightKey: string; filters: Filters }) =>
      searchInbound({
        data: {
          ...paxData(),
          returnDate: form.returnDate,
          searchKey: result!.searchKey,
          flightKey: opts.flightKey,
          filters: toOperatorFilters(opts.filters),
        },
      }),
    onSuccess: (r, vars) => {
      setInbound(r);
      if (!r.flights.length) toast.warning("Nenhuma volta disponível com esses filtros");
      void vars;
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Erro ao buscar volta"),
  });

  function pickOutbound(key: string) {
    setSelectedOut(key);
    setSelectedIn(null);
    setInbound(null);
    if (isRoundTrip) inboundMut.mutate({ flightKey: key, filters: inFilters });
  }

  // Filtros de operadora (bagagem, paradas, preço, companhia, partida) exigem
  // nova consulta — reaplicamos com debounce sempre que o usuário mexe.
  const firstOut = useRef(true);
  const outSig = JSON.stringify(toOperatorFilters(outFilters));
  useEffect(() => {
    if (firstOut.current) {
      firstOut.current = false;
      return;
    }
    if (!result?.searchKey) return;
    const t = setTimeout(() => mut.mutate({ searchKey: result.searchKey, filters: outFilters }), 500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outSig]);

  const firstIn = useRef(true);
  const inSig = JSON.stringify(toOperatorFilters(inFilters));
  useEffect(() => {
    if (firstIn.current) {
      firstIn.current = false;
      return;
    }
    if (!result?.searchKey || !selectedOut) return;
    const t = setTimeout(() => inboundMut.mutate({ flightKey: selectedOut, filters: inFilters }), 500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inSig]);

  const refiltering = mut.isPending && !!result;
  const outFlights = result ? applyFilters(result.outbound.flights, outFilters) : [];
  const inFlights = inbound ? applyFilters(inbound.flights, inFilters) : [];
  const outFlight = result?.outbound.flights.find((f) => f.key === selectedOut) ?? null;
  const inFlight = inbound?.flights.find((f) => f.key === selectedIn) ?? null;
  const showSummary = !!outFlight && (!isRoundTrip || !!inFlight);
  const inboundPhase = isRoundTrip && !!selectedOut;
  function editOutbound() {
    setSelectedOut(null);
    setSelectedIn(null);
    setInbound(null);
  }

  const cheapestOut = outFlights.length ? Math.min(...outFlights.map((f) => f.price.total)) : null;
  const cheapestIn = inFlights.length ? Math.min(...inFlights.map((f) => f.price.total)) : null;

  const step = !result ? 0 : showSummary ? (isRoundTrip ? 3 : 2) : outFlight && isRoundTrip ? 2 : 1;
  const canSearch = form.departureIata.length === 3 && form.arrivalIata.length === 3 && !!form.departureDate;
  const paxTotal = Number(form.adults) + Number(form.children) + Number(form.infants);


  return (
    <div className="min-h-screen bg-background">
      {/* motor de busca */}
      <header className="relative overflow-hidden border-b border-border/60">
        <div
          className="absolute inset-0 opacity-60"
          style={{ background: "radial-gradient(1200px 400px at 20% -10%, var(--brand-blue), transparent 70%)" }}
          aria-hidden
        />
        <div className="relative mx-auto max-w-7xl px-4 py-8">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
                <Plane className="h-6 w-6 text-primary" /> Motor de Voos
              </h1>
              <p className="text-sm text-muted-foreground">
                Busca em tempo real na operadora — tarifas, taxas e parcelamento por companhia.
              </p>
            </div>
            <Stepper step={step} roundTrip={isRoundTrip} />
          </div>

          <div className="rounded-2xl border border-border/70 bg-card/85 p-4 shadow-[var(--shadow-card)] backdrop-blur">
            <div className="grid gap-3 lg:grid-cols-[1fr_1fr_auto]">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                    <MapPin className="h-3 w-3" /> Origem
                  </Label>
                  <Input
                    className="h-11 text-base font-semibold uppercase"
                    value={form.departureIata}
                    maxLength={3}
                    onChange={(e) => setForm({ ...form, departureIata: e.target.value.toUpperCase() })}
                    placeholder="CWB"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                    <ArrowLeftRight className="h-3 w-3" /> Destino
                  </Label>
                  <Input
                    className="h-11 text-base font-semibold uppercase"
                    value={form.arrivalIata}
                    maxLength={3}
                    onChange={(e) => setForm({ ...form, arrivalIata: e.target.value.toUpperCase() })}
                    placeholder="GRU"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                    <CalendarDays className="h-3 w-3" /> Ida
                  </Label>
                  <Input
                    className="h-11"
                    type="date"
                    value={form.departureDate}
                    onChange={(e) => setForm({ ...form, departureDate: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                    <CalendarDays className="h-3 w-3" /> Volta (opcional)
                  </Label>
                  <Input
                    className="h-11"
                    type="date"
                    value={form.returnDate}
                    onChange={(e) => setForm({ ...form, returnDate: e.target.value })}
                  />
                </div>
              </div>

              <div className="flex items-end">
                <Button
                  size="lg"
                  className="h-11 w-full lg:w-auto"
                  disabled={!canSearch || mut.isPending}
                  onClick={() => mut.mutate({ searchKey: null, filters: EMPTY_FILTERS })}
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
                <Users className="h-3 w-3" /> {paxTotal} passageiro(s)
              </span>
              {[
                { k: "adults" as const, l: "Adultos", min: 1 },
                { k: "children" as const, l: "Crianças", min: 0 },
                { k: "infants" as const, l: "Bebês", min: 0 },
              ].map((p) => (
                <div key={p.k} className="w-24 space-y-1">
                  <Label className="text-[11px] text-muted-foreground">{p.l}</Label>
                  <Input
                    className="h-9"
                    type="number"
                    min={p.min}
                    max={9}
                    value={form[p.k]}
                    onChange={(e) => setForm({ ...form, [p.k]: Number(e.target.value) })}
                  />
                </div>
              ))}
              <span className="text-[11px] text-muted-foreground">
                Paradas, bagagem e horários ficam nos filtros ao lado depois da busca.
              </span>

            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6">
        {mut.isPending && !result && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Consultando fornecedores… pode levar até 30 segundos
            </div>
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-28 w-full rounded-2xl" />
            ))}
          </div>
        )}

        {result && (
          <div className={`grid gap-6 ${showSummary ? "" : "lg:grid-cols-[280px_1fr]"}`}>
            {!showSummary && (
              <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
                {!inboundPhase ? (
                  <FiltersPanel
                    title={isRoundTrip ? "Filtros da ida" : "Filtros"}
                    flights={airlinePool.length ? airlinePool : result.outbound.flights}
                    filters={outFilters}
                    onChange={setOutFilters}
                    loading={refiltering}
                    priceRange={result.outbound.priceRange}
                  />
                ) : (
                  inbound && (
                    <FiltersPanel
                      title="Filtros da volta"
                      flights={inbound.flights}
                      filters={inFilters}
                      onChange={setInFilters}
                      loading={inboundMut.isPending}
                      priceRange={inbound.priceRange}
                    />
                  )
                )}
              </aside>
            )}

            <div className="space-y-6">
              {/* trechos já escolhidos, com botão de editar */}
              {outFlight && (isRoundTrip || showSummary) && (
                <SelectedLegBar label="Ida escolhida" f={outFlight} onEdit={editOutbound} />
              )}
              {inFlight && <SelectedLegBar label="Volta escolhida" f={inFlight} onEdit={() => setSelectedIn(null)} />}

              {/* passo 1 — ida */}
              {!inboundPhase && (
                <section className={`space-y-3 ${refiltering ? "opacity-60" : ""}`}>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h2 className="text-lg font-semibold">
                      {isRoundTrip ? "1. Escolha a ida" : "Voos disponíveis"}
                    </h2>
                    <span className="flex items-center gap-2 text-xs text-muted-foreground">
                      {refiltering && <Loader2 className="h-3 w-3 animate-spin text-primary" />}
                      {refiltering
                        ? "Reaplicando filtros na operadora…"
                        : `${outFlights.length} de ${result.outbound.flights.length} opções`}
                    </span>
                  </div>

                  {isRoundTrip && (
                    <p className="text-sm text-muted-foreground">
                      Ao escolher a ida, a operadora carrega as voltas combinadas com essa tarifa.
                    </p>
                  )}
                  {outFlights.map((f) => (
                    <FlightCard
                      key={f.key}
                      f={f}
                      selected={selectedOut === f.key}
                      cheapest={f.price.total === cheapestOut}
                      onSelect={() => pickOutbound(f.key)}
                    />
                  ))}
                  {!outFlights.length && (
                    <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                      Nenhum voo com esses filtros.
                    </p>
                  )}
                </section>
              )}

              {/* passo 2 — volta */}
              {inboundPhase && inboundMut.isPending && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> Combinando voltas para a ida selecionada…
                  </div>
                  <Skeleton className="h-28 w-full rounded-2xl" />
                </div>
              )}

              {inboundPhase && inbound && !inFlight && (
                <section className={`space-y-3 ${inboundMut.isPending ? "opacity-60" : ""}`}>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h2 className="text-lg font-semibold">2. Escolha a volta</h2>
                    <span className="text-xs text-muted-foreground">
                      {inFlights.length} de {inbound.flights.length} opções
                    </span>
                  </div>
                  {inFlights.map((f) => (
                    <FlightCard
                      key={f.key}
                      f={f}
                      selected={selectedIn === f.key}
                      cheapest={f.price.total === cheapestIn}
                      onSelect={() => setSelectedIn(f.key)}
                    />
                  ))}
                  {!inFlights.length && (
                    <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                      Nenhuma volta com esses filtros.
                    </p>
                  )}
                </section>
              )}

              {showSummary && <SummaryCard out={outFlight!} inb={inFlight} />}
            </div>
          </div>
        )}


        {!result && !mut.isPending && (
          <div className="rounded-2xl border border-dashed border-border p-12 text-center">
            <ArrowRight className="mx-auto mb-3 h-6 w-6 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Preencha o motor de busca acima. Os filtros aparecem aqui na lateral depois da pesquisa.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
