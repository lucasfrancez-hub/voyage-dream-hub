import type { ComboPick } from "@/lib/combo-selection";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { createOrder } from "@/lib/orders.functions";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

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
  ShoppingCart,
  ExternalLink,
  Copy,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import { AirportAutocomplete } from "@/components/search/AirportAutocomplete";
import {
  onerCreateFlightCartPublic,
  onerFlightSearchPublic,
  onerInboundSearchPublic,
} from "@/lib/onertravel-public.functions";
import { createPublicFlightLead } from "@/lib/public-lead.functions";
import { DateRangeField } from "@/components/search/DateRangeField";
import { SearchSkeleton } from "@/components/search/SearchSkeleton";
import { installmentLabel, maxInstallments } from "@/lib/flight-installments";
import {
  onerCreateFlightCart,
  onerFlightSearch,
  onerInboundSearch,
} from "@/lib/onertravel.functions";
import {
  applyFareOption,
  CABIN_OPTIONS,
  cabinIdOf,
  cabinLabelOf,
  fareCarryOnText,
  fareCheckedText,
  fareHasBaggage,
  flightCabinId,
  flightHasBaggage,
  flightSignature,
  type OnerFareOption,
  type OnerFlight,
  type OnerSearchResult,
  type OnerLegResult,
} from "@/lib/onertravel.types";


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
      {
        property: "og:description",
        content: "Busca de passagens com filtros e combinação de tarifas ida + volta.",
      },
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
/** Códigos multi-aeroporto: buscam todos os aeroportos da cidade na operadora. */
const CITY_CODES = new Set([
  "SAO",
  "RIO",
  "BHZ",
  "BUE",
  "NYC",
  "LON",
  "PAR",
  "MIL",
  "WAS",
  "TYO",
  "MOW",
  "CHI",
  "ROM",
  "STO",
  "SEL",
  "OSA",
  "YTO",
  "YMQ",
  "BER",
]);
function taxesOf(f: OnerFlight) {
  // A operadora já devolve total = price + tax (o serviceTax está embutido em tax).
  // Somar serviceTax de novo inflava as taxas exibidas.
  const total = f.price.total ?? 0;
  const fare = f.price.price ?? 0;
  const tax = f.price.tax ?? 0;
  return total && fare ? Math.max(total - fare, 0) : tax;
}
function airlineOf(f: OnerFlight) {
  return f.journey.marketingAirline ?? f.journey.segments[0]?.marketingAirline ?? null;
}
/** minutos absolutos de um ponto (data + hora), para calcular conexões */
function absMinutes(p: {
  date: { year: number; month: number; day: number };
  time: { hour: number; minute: number };
}) {
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
  depAirports: string[];
  arrAirports: string[];
  /** Classes de cabine (ECONOMY, PREMIUM_ECONOMY, BUSINESS, FIRST). */
  cabins: string[];
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
  depAirports: [],
  arrAirports: [],
  cabins: [],
};


/** A operadora às vezes devolve resposta vazia/parcial — normaliza para nunca quebrar a tela. */
function normalizeLeg(leg: unknown): OnerLegResult {
  const l = (leg ?? {}) as Partial<OnerLegResult>;
  const flights = Array.isArray(l.flights) ? l.flights : [];
  return {
    flights,
    totalFlightsCount: Number(l.totalFlightsCount ?? flights.length) || flights.length,
    priceRange: l.priceRange ?? null,
  };
}

function normalizeSearchResult(raw: unknown): OnerSearchResult | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Partial<OnerSearchResult>;
  return {
    searchKey: r.searchKey ?? "",
    outbound: normalizeLeg(r.outbound),
    inbound: r.inbound ? normalizeLeg(r.inbound) : null,
  };
}


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

/** Aeroporto real de partida/chegada (com fallback nos segmentos). */
export function depPlaceOf(fl: OnerFlight) {
  return fl.journey?.departure?.iata ? fl.journey.departure : fl.journey?.segments?.[0]?.departure;
}
export function arrPlaceOf(fl: OnerFlight) {
  const segs = fl.journey?.segments ?? [];
  return fl.journey?.destination?.iata
    ? fl.journey.destination
    : segs[segs.length - 1]?.destination;
}

/** Acha o voo por qualquer chave: a do card ou a de uma família tarifária dele. */
function findByAnyKey(list: OnerFlight[], key: string | null | undefined): OnerFlight | null {
  if (!key) return null;
  return list.find((f) => f.key === key || (f.fareOptions ?? []).some((o) => o.key === key)) ?? null;
}

/** O card está selecionado se a chave escolhida é dele ou de uma tarifa dele. */
function isSameFlight(f: OnerFlight, key: string | null): boolean {
  return !!key && (f.key === key || (f.fareOptions ?? []).some((o) => o.key === key));
}

/** Refinamentos locais que a API não representa corretamente. */

function applyFilters(list: OnerFlight[], f: Filters) {
  return list.filter((fl) => {
    if (f.maxStops < 2 && fl.journey.numberOfStops > f.maxStops) return false;
    const depIata = depPlaceOf(fl)?.iata;
    const arrIata = arrPlaceOf(fl)?.iata;
    if (f.depAirports.length && (!depIata || !f.depAirports.includes(depIata))) return false;
    if (f.arrAirports.length && (!arrIata || !f.arrAirports.includes(arrIata))) return false;
    if (f.cabins.length) {
      // A classe pode estar só em alguma família tarifária do mesmo voo.
      const cabins = new Set(
        [
          flightCabinId(fl),
          ...(fl.fareOptions ?? []).map((o) => cabinIdOf(o.cabinClass)),
        ].filter(Boolean) as string[],
      );
      if (!cabins.size) cabins.add("ECONOMY");
      if (!f.cabins.some((c) => cabins.has(c))) return false;
    }
    if (f.arr[0] !== FULL_DAY[0] || f.arr[1] !== FULL_DAY[1]) {
      const t = fl.journey.destination.time;
      const m = t.hour * 60 + t.minute;
      if (m < f.arr[0] || m > f.arr[1]) return false;
    }
    return true;
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
    (f.arr[0] !== 0 || f.arr[1] !== 1440 ? 1 : 0) +
    f.depAirports.length +
    f.arrAirports.length +
    f.cabins.length
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

  const depAirports = useMemo(() => {
    const map = new Map<string, string>();
    flights.forEach((f) => {
      const p = depPlaceOf(f);
      if (p?.iata) map.set(p.iata, p.city?.trim() || p.name?.trim() || p.iata);
    });
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [flights]);

  const arrAirports = useMemo(() => {
    const map = new Map<string, string>();
    flights.forEach((f) => {
      const p = arrPlaceOf(f);
      if (p?.iata) map.set(p.iata, p.city?.trim() || p.name?.trim() || p.iata);
    });
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [flights]);

  const prices = flights.map((f) => f.price.total);
  const lo = priceRange?.minPrice ?? (prices.length ? Math.min(...prices) : 0);
  const hi = priceRange?.maxPrice ?? (prices.length ? Math.max(...prices) : 0);
  const n = activeCount(filters);

  const chip = (active: boolean) =>
    `rounded-full border px-3 py-1.5 text-[10px] font-bold uppercase tracking-tight transition-all active:scale-95 ${
      active
        ? "border-primary bg-primary/10 text-primary"
        : "border-border/60 bg-muted/30 text-muted-foreground hover:border-primary/40 hover:text-foreground"
    }`;

  const SectionLabel = ({ children }: { children: React.ReactNode }) => (
    <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70">
      {children}
    </Label>
  );

  return (
    <section className="overflow-hidden rounded-[2rem] border border-border/50 bg-card/70 shadow-2xl backdrop-blur-2xl">
      <header className="flex items-center justify-between gap-2 border-b border-border/40 px-6 py-4">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-base font-bold">{title}</span>
          {n > 0 && (
            <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-primary-foreground">
              {n}
            </span>
          )}
          {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />}
        </div>
        {n > 0 && (
          <button
            type="button"
            onClick={() => onChange(EMPTY_FILTERS)}
            className="shrink-0 text-xs font-semibold text-primary transition-opacity hover:opacity-80"
          >
            Limpar tudo
          </button>
        )}
      </header>

      <div className={`space-y-7 p-6 ${loading ? "pointer-events-none opacity-60" : ""}`}>
        {/* Bagagem — toggle simples, sem card */}
        <label className="flex cursor-pointer items-center justify-between gap-3">
          <span className="flex items-center gap-2 text-sm font-medium text-foreground/80">
            <Luggage
              className={`h-4 w-4 ${filters.onlyBaggage ? "text-primary" : "text-muted-foreground"}`}
            />
            Bagagem para despachar
          </span>
          <Switch
            checked={filters.onlyBaggage}
            onCheckedChange={(v) => onChange({ ...filters, onlyBaggage: v })}
          />
        </label>

        <div className="space-y-3">
          <SectionLabel>Paradas</SectionLabel>
          <div className="grid grid-cols-3 gap-1 rounded-2xl border border-border/40 bg-muted/30 p-1">
            {[
              { v: 0, l: "Direto" },
              { v: 1, l: "Até 1" },
              { v: 2, l: "Todos" },
            ].map((o) => (
              <button
                key={o.v}
                type="button"
                onClick={() => onChange({ ...filters, maxStops: o.v })}
                className={`rounded-xl px-1 py-2 text-[11px] font-bold transition-all ${
                  filters.maxStops === o.v
                    ? "bg-primary text-primary-foreground shadow-[var(--shadow-glow)]"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {o.l}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-end justify-between">
            <SectionLabel>Faixa de preço</SectionLabel>
            <span className="text-xs font-semibold">
              {fmtMoney(lo)} — {fmtMoney(hi)}
            </span>
          </div>
          <div className="flex gap-2">
            <Input
              className="h-9 rounded-xl border-border/50 bg-muted/30"
              placeholder="De"
              inputMode="decimal"
              value={filters.minPrice}
              onChange={(e) => onChange({ ...filters, minPrice: e.target.value })}
            />
            <Input
              className="h-9 rounded-xl border-border/50 bg-muted/30"
              placeholder="Até"
              inputMode="decimal"
              value={filters.maxPrice}
              onChange={(e) => onChange({ ...filters, maxPrice: e.target.value })}
            />
          </div>
        </div>

        <div className="space-y-3">
          <SectionLabel>Classes</SectionLabel>
          <div className="grid grid-cols-2 gap-1 rounded-2xl border border-border/40 bg-muted/30 p-1">
            {CABIN_OPTIONS.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => onChange({ ...filters, cabins: toggle(filters.cabins, c.id) })}
                className={`rounded-xl px-1 py-2 text-[11px] font-bold transition-all ${
                  filters.cabins.includes(c.id)
                    ? "bg-primary text-primary-foreground shadow-[var(--shadow-glow)]"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>



        <div className="space-y-6">
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
        </div>

        {airlines.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <SectionLabel>Companhia aérea</SectionLabel>
              {filters.airlines.length > 0 && (
                <span className="text-[10px] text-muted-foreground/60">
                  {filters.airlines.length} selecionada{filters.airlines.length > 1 ? "s" : ""}
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {airlines.map(([iata, name]) => (
                <button
                  key={iata}
                  type="button"
                  className={chip(filters.airlines.includes(iata))}
                  onClick={() => onChange({ ...filters, airlines: toggle(filters.airlines, iata) })}
                >
                  {name}
                </button>
              ))}
            </div>
          </div>
        )}

        {depAirports.length > 0 && (
          <div className="space-y-3">
            <SectionLabel>Aeroporto de partida</SectionLabel>
            <div className="flex flex-wrap gap-2">
              {depAirports.map(([iata, name]) => (
                <button
                  key={iata}
                  type="button"
                  className={chip(filters.depAirports.includes(iata))}
                  onClick={() =>
                    onChange({ ...filters, depAirports: toggle(filters.depAirports, iata) })
                  }
                >
                  {iata} — {name}
                </button>
              ))}
            </div>
          </div>
        )}

        {arrAirports.length > 0 && (
          <div className="space-y-3">
            <SectionLabel>Aeroporto de chegada</SectionLabel>
            <div className="flex flex-wrap gap-2">
              {arrAirports.map(([iata, name]) => (
                <button
                  key={iata}
                  type="button"
                  className={chip(filters.arrAirports.includes(iata))}
                  onClick={() =>
                    onChange({ ...filters, arrAirports: toggle(filters.arrAirports, iata) })
                  }
                >
                  {iata} — {name}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- card

/** Detalhamento de trechos e tempo de conexão — trilho vertical de precisão. */
function SegmentsDetail({ f }: { f: OnerFlight }) {
  const segs = f.journey.segments;
  return (
    <div className="mt-3 space-y-0 rounded-xl border border-border/60 bg-background/50 p-5">
      {segs.map((s, i) => {
        const prev = segs[i - 1];
        const layover = prev ? absMinutes(s.departure) - absMinutes(prev.destination) : 0;
        const isLast = i === segs.length - 1;
        return (
          <div key={`${s.segmentNumber}-${s.flightNumber}`}>
            {prev && (
              <div className="relative py-6 pl-8">
                <div className="absolute bottom-0 left-[9px] top-0 w-0 border-l-2 border-dashed border-border" />
                <div className="flex w-fit items-center gap-3 rounded-xl border border-border/60 bg-muted/30 p-3 pr-6 backdrop-blur-sm">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-primary/25 bg-primary/10">
                    <Clock className="h-4 w-4 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="mb-1 text-[10px] font-bold uppercase leading-none tracking-[0.2em] text-muted-foreground">
                      Conexão em {prev.destination.iata}
                    </p>
                    <p className="text-sm font-semibold text-foreground">
                      Aguarde <span className="font-mono text-primary">{fmtDur(layover)}</span> no
                      aeroporto
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="flex flex-col">
              <div className="mb-4 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                <div className="flex min-w-0 items-center gap-3">
                  {s.marketingAirline?.pathLogo ? (
                    <img
                      src={s.marketingAirline.pathLogo}
                      alt={s.marketingAirline?.name ?? "Companhia aérea"}
                      className="h-5 w-5 shrink-0 rounded bg-white object-contain"
                      loading="lazy"
                    />
                  ) : (
                    <Plane className="h-4 w-4 shrink-0" />
                  )}
                  <span className="h-3 w-px shrink-0 bg-border" />
                  <span className="truncate">
                    {s.marketingAirline?.iata ?? ""}
                    {s.flightNumber}
                    {s.cabinClass ? ` • ${s.cabinClass}` : ""}
                    {s.airlineFareFamily ? ` • ${s.airlineFareFamily}` : ""}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-2 text-foreground/70">
                  <Clock className="h-3.5 w-3.5 text-primary" />
                  <span className="font-mono">
                    {fmtDur(absMinutes(s.destination) - absMinutes(s.departure))}
                  </span>
                </div>
              </div>

              <div className="relative pl-8">
                <div className="absolute bottom-2 left-[9px] top-2 w-[2px] rounded-full bg-primary" />

                <div className="relative mb-8">
                  <div className="absolute -left-[28px] top-1.5 h-[11px] w-[11px] rounded-full border-2 border-background bg-primary ring-1 ring-primary/30" />
                  <div className="flex items-baseline gap-3">
                    <span className="text-xl font-bold tracking-tight">
                      {fmtTime(s.departure.time)}
                    </span>
                    <span className="text-2xl font-black tracking-tighter">{s.departure.iata}</span>
                  </div>
                  <p className="mt-0.5 text-xs font-medium text-muted-foreground">
                    {s.departure.name} • {fmtDate(s.departure.date)}
                  </p>
                </div>

                <div className="relative">
                  {isLast ? (
                    <div className="absolute -left-[30px] top-1.5 h-[15px] w-[15px] rounded-full border-[3.5px] border-background bg-primary ring-1 ring-primary" />
                  ) : (
                    <div className="absolute -left-[28px] top-1.5 h-[11px] w-[11px] rounded-full border-2 border-background bg-foreground" />
                  )}
                  <div className="flex items-baseline gap-3">
                    <span className="text-xl font-bold tracking-tight">
                      {fmtTime(s.destination.time)}
                    </span>
                    <span className="text-2xl font-black tracking-tighter">
                      {s.destination.iata}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs font-medium text-muted-foreground">
                    {s.destination.name} • {fmtDate(s.destination.date)}
                  </p>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Barra compacta do trecho já escolhido, com botão de editar (volta ao passo). */

function SelectedLegBar({
  label,
  f,
  onEdit,
}: {
  label: string;
  f: OnerFlight;
  onEdit: () => void;
}) {
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
        {j.departure.iata} {fmtTime(j.departure.time)} → {j.destination.iata}{" "}
        {fmtTime(j.destination.time)}
      </div>
      <span className="text-xs text-muted-foreground">
        {fmtDate(j.departure.date)} •{" "}
        {j.numberOfStops === 0 ? "direto" : `${j.numberOfStops} conexão(ões)`} •{" "}
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

function BagChip({
  icon: Icon,
  kicker,
  value,
  active,
}: {
  icon: React.ComponentType<{ className?: string }>;
  kicker: string;
  value: string;
  active: boolean;
}) {
  return (
    <div className={`flex items-center gap-2.5 ${active ? "" : "opacity-40"}`}>
      <div
        className={`flex h-9 w-9 items-center justify-center rounded-lg border ${
          active ? "border-primary/40 bg-primary/10" : "border-border/60 bg-background/40"
        }`}
      >
        <Icon className={`h-4 w-4 ${active ? "text-primary" : "text-muted-foreground"}`} />
      </div>
      <div className="flex flex-col leading-tight">
        <span className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground">
          {kicker}
        </span>
        <span className="text-xs font-semibold">{value}</span>
      </div>
    </div>
  );
}

/**
 * "Mais opções para seu voo" — famílias tarifárias (LIGHT / CLASSIC / FLEX) do
 * mesmo itinerário. A chave escolhida aqui é a que vai para a operadora
 * (combinação da volta e geração do carrinho).
 */
function FareOptionsDialog({
  f,
  label,
  open,
  onOpenChange,
  onConfirm,
}: {
  f: OnerFlight | null;
  label: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onConfirm: (key: string) => void;
}) {
  const options = useMemo<OnerFareOption[]>(() => f?.fareOptions ?? [], [f]);
  const [picked, setPicked] = useState<string | null>(null);
  useEffect(() => {
    if (open) setPicked(options[0]?.key ?? null);
  }, [open, options]);

  const base = options[0]?.total ?? 0;
  const chosen = options.find((o) => o.key === picked) ?? options[0];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold">
            Mais opções para seu voo de {label.toLowerCase()}
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {options.map((o, i) => {
            const active = o.key === picked;
            const delta = o.total - base;
            return (
              <div
                key={o.key}
                className={`relative flex flex-col rounded-2xl border-2 p-4 transition ${
                  active ? "border-primary bg-primary/5" : "border-border/70 bg-card/60"
                }`}
              >
                <span className="absolute right-3 top-3 rounded-full bg-primary/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-primary">
                  {label}
                </span>
                <p className="mb-1 text-center text-lg font-black uppercase tracking-tight">
                  {o.fareFamily?.trim() || `Tarifa ${i + 1}`}
                </p>
                <p className="mb-4 text-center text-xs text-muted-foreground">
                  {cabinLabelOf(cabinIdOf(o.cabinClass) ?? "ECONOMY")}
                </p>

                <div className="space-y-2 border-y border-border/60 py-3 text-xs">
                  <div className="flex items-center gap-2">
                    <BriefcaseBusiness className="h-4 w-4 shrink-0 text-primary" />
                    <span>{fareCarryOnText(o)}</span>
                  </div>
                  <div
                    className={`flex items-center gap-2 ${
                      fareHasBaggage(o) ? "" : "text-muted-foreground"
                    }`}
                  >
                    <Luggage
                      className={`h-4 w-4 shrink-0 ${
                        fareHasBaggage(o) ? "text-primary" : "text-muted-foreground"
                      }`}
                    />
                    <span>{fareCheckedText(o)}</span>
                  </div>
                </div>

                <div className="mt-3 text-center">
                  <p className="text-xs font-bold text-primary">
                    {delta > 0 ? `+ ${fmtMoney(delta)}` : fmtMoney(0)}{" "}
                    <span className="font-medium text-muted-foreground">/ diferença</span>
                  </p>
                  <p className="mt-1 text-2xl font-black tracking-tight">{fmtMoney(o.total)}</p>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    Total da {label.toLowerCase()}
                  </p>
                </div>

                <Button
                  variant={active ? "default" : "outline"}
                  className="mt-4 w-full rounded-full text-xs font-bold uppercase tracking-wide"
                  onClick={() => setPicked(o.key)}
                >
                  {active ? (
                    <>
                      <Check className="h-4 w-4" /> Selecionado
                    </>
                  ) : (
                    "Selecionar"
                  )}
                </Button>
              </div>
            );
          })}
        </div>

        <DialogFooter className="flex-col items-stretch gap-3 border-t border-border/60 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-md text-[11px] leading-snug text-muted-foreground">
            Taxas de não comparecimento, cancelamento ou alteração, acúmulo de milhas, reembolso e
            marcação de assento conforme as regras da companhia para cada tipo de tarifa.
          </p>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                Total da {label.toLowerCase()}
              </p>
              <p className="text-xl font-black tracking-tight">
                {fmtMoney(chosen?.total ?? f?.price.total ?? 0)}
              </p>
            </div>
            <Button
              className="rounded-full px-6 font-bold"
              disabled={!chosen}
              onClick={() => {
                if (chosen) onConfirm(chosen.key);
                onOpenChange(false);
              }}
            >
              Prosseguir
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
  const n = maxInstallments(airlineOf(f));
  return (
    <div
      className={`group relative overflow-hidden rounded-2xl border bg-card/80 backdrop-blur transition ${
        interactive ? "hover:border-primary/60 hover:shadow-[var(--shadow-card)]" : ""
      } ${selected ? "border-primary ring-2 ring-primary/30" : "border-border/70"}`}
    >
      {cheapest && (
        <span className="absolute left-0 top-0 z-10 rounded-br-xl bg-primary px-2 py-1 text-[10px] font-semibold text-primary-foreground">
          Menor preço
        </span>
      )}

      <div className="flex flex-col md:flex-row">
        {/* ---- lado esquerdo: cartão de embarque ---- */}
        <div className="flex flex-1 flex-col gap-5 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 rounded-full border border-border/60 bg-background/50 px-3 py-1">
              <span className="h-2 w-2 rounded-full bg-primary" />
              <span className="text-[10px] font-bold uppercase tracking-widest">
                {label ?? "Voo"} • {fmtDate(j.departure.date)}
              </span>
            </div>
            <div className="flex items-center gap-2.5 rounded-lg border border-border/50 bg-background/50 px-3 py-1.5">
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
              <div className="flex flex-col leading-tight">
                <span className="text-xs font-bold">
                  {j.marketingAirline?.name?.trim() ?? "Companhia"}
                </span>
                <span className="text-[9px] uppercase tracking-tight text-muted-foreground">
                  {j.segments
                    .map((s) => `${s.marketingAirline?.iata ?? ""}${s.flightNumber}`)
                    .join(" + ")}
                </span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 items-center gap-4">
            <div className="text-left">
              <div className="text-3xl font-bold leading-none tracking-tight">
                {fmtTime(j.departure.time)}
              </div>
              <div className="mt-1 text-lg font-black uppercase leading-none text-primary">
                {j.departure.iata}
              </div>
              <div className="truncate text-[10px] font-medium text-muted-foreground">
                {j.departure.name}
              </div>
            </div>

            <div className="flex flex-col items-center gap-2">
              <div className="text-[9px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                {j.flyingTime.hour}h{String(j.flyingTime.minute).padStart(2, "0")}
              </div>
              <div className="relative flex w-full items-center px-2">
                <div className="h-px w-full bg-border" />
                <span className="absolute left-0 h-1.5 w-1.5 rounded-full bg-primary" />
                <span className="absolute right-0 h-1.5 w-1.5 rounded-full border border-border bg-background" />
                <span className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap rounded border border-border/60 bg-background px-2 py-0.5 text-[9px] font-bold uppercase tracking-tight">
                  {j.numberOfStops === 0 ? "Direto" : `${j.numberOfStops} conexão(ões)`}
                </span>
              </div>
              {j.fareClass?.airlineFareFamily && (
                <span className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {j.fareClass.airlineFareFamily}
                </span>
              )}
            </div>

            <div className="text-right">
              <div className="text-3xl font-bold leading-none tracking-tight">
                {fmtTime(j.destination.time)}
              </div>
              <div className="mt-1 text-lg font-black uppercase leading-none text-primary">
                {j.destination.iata}
              </div>
              <div className="truncate text-[10px] font-medium text-muted-foreground">
                {j.destination.name}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/50 pt-4">
            <div className="flex items-center gap-6">
              <BagChip icon={BriefcaseBusiness} kicker="Mão" value="10kg incluída" active />
              <BagChip
                icon={Luggage}
                kicker="Despachada"
                value={withBag ? "23kg incluída" : "Não inclusa"}
                active={withBag}
              />
            </div>
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground transition hover:text-primary"
            >
              {open ? "Ocultar" : "Detalhes"}
              <ChevronDown className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`} />
            </button>
          </div>

          {open && <SegmentsDetail f={f} />}
        </div>

        {/* ---- coluna de preço ---- */}
        <div className="flex w-full flex-col border-t border-border/60 bg-background/40 p-5 md:w-72 md:border-l md:border-t-0">
          <div className="flex-1 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase text-muted-foreground">Tarifa</span>
              <span className="text-sm font-medium">{fmtMoney(f.price.price)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase text-muted-foreground">Taxas</span>
              <span className="text-sm font-medium">{fmtMoney(taxesOf(f))}</span>
            </div>

            <div className="mt-2 border-t border-border/60 pt-4">
              <div className="mb-1 text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
                Valor final • {f.price.passengerCount} pax
              </div>
              <div className="text-3xl font-black leading-none tracking-tight">
                {fmtMoney(f.price.total)}
              </div>
              <div className="mt-1 text-[9px] font-bold uppercase text-primary">
                Em até {n}x de {fmtMoney(f.price.total / n)}
              </div>
            </div>
          </div>

          {!readOnly && onSelect && (
            <Button
              onClick={onSelect}
              className="mt-6 w-full py-6 text-xs font-black uppercase tracking-[0.15em]"
            >
              {selected ? (
                <>
                  <Check className="h-4 w-4" /> Selecionado
                </>
              ) : (
                "Selecionar"
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- resumo

/** Card compacto de um trecho dentro do modal de seleção. */
function SummaryLeg({ label, f }: { label: string; f: OnerFlight }) {
  const j = f.journey;
  const withBag = flightHasBaggage(f);
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-2xl border border-border/60 bg-background/40 p-4">
      <div className="mb-4 flex items-start justify-between gap-3">
        <span className="rounded-md bg-primary/15 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-primary">
          {label} • {fmtDate(j.departure.date)}
        </span>
        <div className="flex items-center gap-2">
          {j.marketingAirline?.pathLogo ? (
            <img
              src={j.marketingAirline.pathLogo}
              alt={j.marketingAirline?.name ?? "Companhia aérea"}
              className="h-5 w-5 rounded bg-white object-contain"
              loading="lazy"
            />
          ) : (
            <Plane className="h-3.5 w-3.5 text-muted-foreground" />
          )}
          <span className="text-[10px] font-medium uppercase tracking-tight text-muted-foreground">
            {j.segments.map((s) => `${s.marketingAirline?.iata ?? ""}${s.flightNumber}`).join(" + ")}
          </span>
        </div>
      </div>

      <div className="mb-5 flex items-center justify-between gap-3">
        <div className="flex flex-col">
          <span className="text-2xl font-bold leading-none tracking-tight">
            {fmtTime(j.departure.time)}
          </span>
          <span className="mt-1 text-sm font-black uppercase leading-none text-primary">
            {j.departure.iata}
          </span>
          <span className="max-w-[110px] truncate text-[10px] leading-tight text-muted-foreground">
            {j.departure.name}
          </span>
        </div>

        <div className="flex flex-1 flex-col items-center px-2">
          <span className="mb-1.5 text-[9px] font-bold uppercase tracking-tight text-muted-foreground">
            {j.flyingTime.hour}h{String(j.flyingTime.minute).padStart(2, "0")}
          </span>
          <div className="relative flex w-full items-center">
            <div className="h-px w-full bg-border" />
            <span className="absolute left-0 h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_8px_hsl(var(--primary)/0.5)]" />
            <span className="absolute right-0 h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_8px_hsl(var(--primary)/0.5)]" />
          </div>
          <span className="mt-1.5 text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
            {j.numberOfStops === 0 ? "Direto" : `${j.numberOfStops} conexão(ões)`}
          </span>
        </div>

        <div className="flex flex-col text-right">
          <span className="text-2xl font-bold leading-none tracking-tight">
            {fmtTime(j.destination.time)}
          </span>
          <span className="mt-1 text-sm font-black uppercase leading-none text-primary">
            {j.destination.iata}
          </span>
          <span className="ml-auto max-w-[110px] truncate text-[10px] leading-tight text-muted-foreground">
            {j.destination.name}
          </span>
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-border/50 pt-4">
        <div className="flex gap-5">
          <BagChip icon={BriefcaseBusiness} kicker="Mão" value="10kg inclusa" active />
          <BagChip
            icon={Luggage}
            kicker="Despachada"
            value={withBag ? "23kg inclusa" : "Não inclusa"}
            active={withBag}
          />
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-primary transition hover:brightness-125"
        >
          {open ? "Ocultar" : "Detalhes"}
          <ChevronDown className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
      </div>

      {open && <SegmentsDetail f={f} />}
    </div>
  );
}

type CartContext = {
  departureIata: string;
  arrivalIata: string;
  departureDate: string;
  returnDate: string | null;
  adults: number;
  children: number;
  infants: number;
  departureIsCity: boolean;
  arrivalIsCity: boolean;
};

function SummaryCard({
  out,
  inb,
  searchKey,
  ctx,
  open,
  onOpenChange,
  onComboSelect,
  publicMode = false,
}: {
  out: OnerFlight;
  inb: OnerFlight | null;
  searchKey: string | null;
  ctx: CartContext;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onComboSelect?: (pick: ComboPick) => void;
  /** Motor público: "Comprar agora" registra o pedido pendente e manda direto pro carrinho. */
  publicMode?: boolean;
}) {


  const fare = out.price.price + (inb?.price.price ?? 0);
  const taxes = taxesOf(out) + (inb ? taxesOf(inb) : 0);
  const total = out.price.total + (inb?.price.total ?? 0);
  const pax = out.price.passengerCount || 1;
  const n = Math.min(maxInstallments(airlineOf(out)), inb ? maxInstallments(airlineOf(inb)) : 99);
  const [orderOpen, setOrderOpen] = useState(false);
  const [cartUrl, setCartUrl] = useState<string | null>(null);
  const createCart = useServerFn(publicMode ? onerCreateFlightCartPublic : onerCreateFlightCart);
  const logLead = useServerFn(createPublicFlightLead);
  const [buyingPublic, setBuyingPublic] = useState(false);

  // Gera o carrinho oficial do Comprar Viagem (agência VIA AIR na URL),
  // para o cliente concluir o pagamento no ambiente da operadora.
  const cartMut = useMutation({
    mutationFn: () =>
      createCart({
        data: {
          searchKey: searchKey ?? "",
          outboundFareId: out.key,
          outboundItineraryId: out.journey.key,
          inboundFareId: inb?.key ?? null,
          inboundItineraryId: inb?.journey.key ?? null,
          isRoundTrip: !!inb,
          ...ctx,

        },
      }),
    onSuccess: (r) => {
      setCartUrl(r.url);
      if (!publicMode) window.open(r.url, "_blank", "noopener");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao gerar carrinho"),
  });

  const legText = (label: string, f: OnerFlight) => {
    const j = f.journey;
    return `${label}: ${j.departure.iata} ${fmtTime(j.departure.time)} → ${j.destination.iata} ${fmtTime(
      j.destination.time,
    )} • ${fmtDate(j.departure.date)} • ${airlineOf(f)?.name?.trim() ?? "—"} • ${
      j.numberOfStops === 0 ? "direto" : `${j.numberOfStops} conexão(ões)`
    } • ${flightHasBaggage(f) ? "com bagagem despachada" : "só bagagem de mão"} • ${fmtMoney(f.price.total)}`;
  };
  const summaryText = [legText(inb ? "Ida" : "Voo", out), inb ? legText("Volta", inb) : null]
    .filter(Boolean)
    .join("\n");

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex max-h-[90vh] max-w-[460px] flex-col gap-0 overflow-hidden rounded-3xl border-border/60 bg-card p-0">
          <DialogHeader className="border-b border-border/50 bg-background/40 px-5 py-4 text-left">
            <DialogTitle className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
              <Plane className="h-3.5 w-3.5 text-primary" /> Voos selecionados
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 space-y-4 overflow-y-auto p-5">
            <SummaryLeg label={inb ? "Ida" : "Voo"} f={out} />
            {inb && <SummaryLeg label="Volta" f={inb} />}

            <div className="space-y-3 pt-2">
              <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                Resumo do preço
              </h3>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Tarifa ({pax} pax)</span>
                <span className="font-medium">{fmtMoney(fare)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Taxas e serviços</span>
                <span className="font-medium">{fmtMoney(taxes)}</span>
              </div>

              <div className="mt-2 border-t border-border/50 pt-4">
                <div className="mb-1 flex items-baseline justify-between">
                  <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
                    Valor total
                  </span>
                  <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
                    {pax} pax
                  </span>
                </div>
                <div className="flex items-end justify-between">
                  <div>
                    <div className="text-3xl font-black leading-none tracking-tight">
                      {fmtMoney(total)}
                    </div>
                    <div className="mt-1 text-[11px] font-semibold uppercase tracking-tight text-primary">
                      Em até {n}x de {fmtMoney(total / n)} sem juros
                    </div>
                  </div>
                  <span className="mb-1 text-[10px] font-medium text-muted-foreground">
                    {fmtMoney(total / pax)} / passageiro
                  </span>
                </div>
              </div>
            </div>

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
                          `Segue o link para concluir a reserva:\n${cartUrl}`,
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

          <div className="space-y-3 border-t border-border/50 bg-background/40 p-5">
            {onComboSelect ? (
              <Button
                className="w-full py-6 text-xs font-black uppercase tracking-[0.15em]"
                onClick={() => {
                  onComboSelect({
                    title: `${out.journey.departure.iata} \u2192 ${out.journey.destination.iata}${inb ? " \u2022 ida e volta" : ""}`,
                    summary: summaryText,
                    total,
                    card: (
                      <div className="space-y-3">
                        <FlightCard f={out} readOnly label={inb ? "Ida" : "Voo"} />
                        {inb ? <FlightCard f={inb} readOnly label="Volta" /> : null}
                      </div>
                    ),
                    buy: async () => {
                      const r = await cartMut.mutateAsync();
                      return r.url;
                    },
                    flightBooking: {
                      searchKey: searchKey ?? "",
                      outboundFareId: out.key,
                      outboundItineraryId: out.journey.key ?? "",
                      inboundFareId: inb?.key ?? null,
                      inboundItineraryId: inb?.journey.key ?? null,
                      isRoundTrip: !!inb,
                      departureIata: ctx.departureIata,
                      arrivalIata: ctx.arrivalIata,
                      departureDate: ctx.departureDate,
                      returnDate: ctx.returnDate,
                      adults: ctx.adults,
                      children: ctx.children,
                      infants: ctx.infants,
                    },
                  });
                  onOpenChange(false);
                }}
              >
                Continuar para hospedagem
              </Button>
            ) : publicMode ? (
              <Button
                disabled={!searchKey || buyingPublic}
                onClick={async () => {
                  if (!searchKey) return;
                  setBuyingPublic(true);
                  // abre a aba ANTES do await pra não ser bloqueada pelo navegador
                  const tab = window.open("", "_blank", "noopener");
                  try {
                    const r = await cartMut.mutateAsync();
                    // Log do interesse: entra em /admin/pedidos como pendente.
                    try {
                      await logLead({
                        data: {
                          departureIata: ctx.departureIata,
                          arrivalIata: ctx.arrivalIata,
                          departureDate: ctx.departureDate,
                          returnDate: ctx.returnDate ?? null,
                          adults: ctx.adults,
                          children: ctx.children,
                          infants: ctx.infants,
                          total,
                          summary: summaryText,
                          cartUrl: r.url,
                        },
                      });
                    } catch (e) {
                      // o log nunca pode travar a compra do cliente
                      console.error("[public-lead] falha ao registrar pedido pendente", e);
                    }
                    if (tab) tab.location.href = r.url;
                    else window.open(r.url, "_blank", "noopener");
                    setBuyingPublic(false);
                  } catch {
                    tab?.close();
                    setBuyingPublic(false);
                  }
                }}
                className="w-full py-6 text-xs font-black uppercase tracking-[0.15em]"
              >
                {buyingPublic ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ShoppingCart className="h-4 w-4" />
                )}
                Comprar agora
              </Button>
            ) : (
            <>
            <Button
              onClick={() => setOrderOpen(true)}
              className="w-full py-6 text-xs font-black uppercase tracking-[0.15em]"
            >
              <ShoppingCart className="h-4 w-4" /> Fazer pedido
            </Button>
            <Button
              variant="outline"
              disabled={!searchKey || cartMut.isPending}
              onClick={() => cartMut.mutate()}
              className="w-full py-5 text-[10px] font-black uppercase tracking-[0.15em]"
            >
              {cartMut.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ExternalLink className="h-4 w-4" />
              )}
              Comprar viagem
            </Button>
            </>
            )}

          </div>
        </DialogContent>
      </Dialog>

      <NewOrderFromFlightsDialog
        open={orderOpen}
        onOpenChange={setOrderOpen}
        total={total}
        pax={pax}
        summary={summaryText}
      />
    </>
  );
}


/** Cria o pedido já com o valor e o resumo dos voos escolhidos. */
export function NewOrderFromFlightsDialog({
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
          <div className="rounded-xl border border-border/60 bg-muted/40 p-3 text-xs whitespace-pre-line">
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
              <Input
                value={form.cpf}
                onChange={(e) => setForm((f) => ({ ...f, cpf: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>E-mail</Label>
              <Input
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Telefone</Label>
              <Input
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              />
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
            {mut.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ShoppingCart className="h-4 w-4" />
            )}
            Criar pedido
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------- página

export type FlightPreset = {
  departureIata: string;
  arrivalIata: string;
  departureDate: string;
  returnDate: string;
  adults: number;
  children: number;
  infants: number;
};

export function VoosPage({
  header,
  hideForm,
  preset,
  runToken,
  onComboSelect,
  publicMode = false,
}: {
  header?: React.ReactNode;
  hideForm?: boolean;
  preset?: FlightPreset;
  runToken?: number;
  onComboSelect?: (pick: ComboPick) => void;
  /** Motor aberto ao cliente final (sem login). */
  publicMode?: boolean;
} = {}) {
  const search = useServerFn(publicMode ? onerFlightSearchPublic : onerFlightSearch);
  const searchInbound = useServerFn(publicMode ? onerInboundSearchPublic : onerInboundSearch);
  const [form, setForm] = useState({
    departureIata: "CWB",
    arrivalIata: "GRU",
    departureDate: "",
    returnDate: "",
    adults: 1,
    children: 0,
    infants: 0,
  });
  const [pendingRun, setPendingRun] = useState(0);

  const [result, setResult] = useState<OnerSearchResult | null>(null);
  const [selectedOut, setSelectedOut] = useState<string | null>(null);
  const [selectedIn, setSelectedIn] = useState<string | null>(null);
  const [inbound, setInbound] = useState<OnerLegResult | null>(null);
  /** Tarifa da ida efetivamente usada quando a mais barata não combina volta. */
  const [outFareOverride, setOutFareOverride] = useState<{ key: string; total: number | null } | null>(
    null,
  );
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
    pageSize: 50,
    // Códigos de cidade (SAO, RIO...) buscam todos os aeroportos da cidade.
    departureIsCity: CITY_CODES.has(form.departureIata.trim().toUpperCase()),
    arrivalIsCity: CITY_CODES.has(form.arrivalIata.trim().toUpperCase()),
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
    onSuccess: (raw, vars) => {
      const r = normalizeSearchResult(raw);
      if (!r) {
        toast.error("A operadora não respondeu a busca. Tente novamente.");
        return;
      }
      setResult(r);
      if (!vars.searchKey) {
        setSelectedOut(null);
        setSelectedIn(null);
        setInbound(null);
        setOutFareOverride(null);
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


  // "Ver mais voos": a operadora libera os fornecedores em ondas, então uma nova
  // consulta com a MESMA busca costuma trazer opções (e tarifas menores) que
  // ainda não tinham chegado. Os voos novos são somados aos já exibidos.
  const moreMut = useMutation({
    mutationFn: () =>
      search({
        data: {
          ...paxData(),
          returnDate: form.returnDate || null,
          searchKey: result?.searchKey ?? null,
          filters: toOperatorFilters(outFilters),
        },
      }),
    onSuccess: (raw) => {
      const r = normalizeSearchResult(raw);
      if (!r) {
        toast.info("A operadora não respondeu agora, tente de novo em instantes");
        return;
      }
      setResult((prev) => {
        if (!prev) return r;
        const map = new Map(prev.outbound.flights.map((f) => [flightSignature(f), f]));
        let novos = 0;
        for (const f of r.outbound.flights) {
          const signature = flightSignature(f);
          const atual = map.get(signature);
          if (!atual) novos++;
          if (!atual || f.price.total < atual.price.total) map.set(signature, f);
        }
        const flights = [...map.values()].sort((a, b) => a.price.total - b.price.total);
        toast[novos ? "success" : "info"](
          novos ? `+${novos} voos encontrados` : "Nenhuma opção nova por enquanto",
        );
        setAirlinePool(flights);
        return {
          ...prev,
          outbound: {
            ...prev.outbound,
            flights,
            totalFlightsCount: Math.max(prev.outbound.totalFlightsCount, flights.length),
            priceRange: r.outbound.priceRange ?? prev.outbound.priceRange,
          },
        };
      });
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Erro ao carregar mais voos"),
  });

  const inboundMut = useMutation({
    // A operadora combina ida + volta POR TARIFA (fornecedor). Se a tarifa mais
    // barata da ida não tem volta combinável, a lista volta vazia mesmo
    // existindo voos. Então tentamos, em ordem de preço, as demais tarifas do
    // MESMO voo antes de dizer que não há volta.
    mutationFn: async (opts: { flightKey: string; filters: Filters }) => {
      const base = findByAnyKey(result?.outbound.flights ?? [], opts.flightKey);
      const keys = [
        opts.flightKey,
        ...(base?.altKeys ?? []).filter((k) => k && k !== opts.flightKey),
      ].slice(0, 4);
      let last: OnerLegResult = { flights: [], totalFlightsCount: 0, priceRange: null };
      for (const key of keys) {
        const raw = await searchInbound({
          data: {
            ...paxData(),
            returnDate: form.returnDate,
            searchKey: result?.searchKey ?? "",
            flightKey: key,
            filters: toOperatorFilters(opts.filters),
          },
        });
        last = normalizeLeg(raw);
        if (last.flights.length) {
          const idx = base?.altKeys?.indexOf(key) ?? -1;
          return { leg: last, fareKey: key, fareTotal: base?.altTotals?.[idx] ?? null };
        }
      }
      return { leg: last, fareKey: opts.flightKey, fareTotal: null };
    },
    onSuccess: (r) => {
      setInbound(r.leg);
      if (r.fareKey !== selectedOut) {
        setOutFareOverride({ key: r.fareKey, total: r.fareTotal });
        if (r.leg.flights.length)
          toast.info("A tarifa mais barata da ida não combinava volta — usamos a tarifa seguinte");
      } else {
        setOutFareOverride(null);
      }
      if (!r.leg.flights.length)
        toast.warning("Nenhuma volta disponível para esse voo (nenhuma tarifa combina)");
    },

    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Erro ao buscar volta"),
  });


  // "Ver mais voltas": mesma lógica da ida — a operadora libera fornecedores em
  // ondas, então uma nova consulta soma opções (e tarifas menores) que faltavam.
  const moreInboundMut = useMutation({
    mutationFn: () =>
      searchInbound({
        data: {
          ...paxData(),
          returnDate: form.returnDate,
          searchKey: result?.searchKey ?? "",
          flightKey: outFareOverride?.key ?? selectedOut ?? "",
          filters: toOperatorFilters(inFilters),
        },
      }),
    onSuccess: (raw) => {
      const r = normalizeLeg(raw);
      setInbound((prev) => {
        if (!prev) return r;
        const map = new Map(prev.flights.map((f) => [flightSignature(f), f]));
        let novos = 0;
        for (const f of r.flights) {
          const signature = flightSignature(f);
          const atual = map.get(signature);
          if (!atual) novos++;
          if (!atual || f.price.total < atual.price.total) map.set(signature, f);
        }
        const flights = [...map.values()].sort((a, b) => a.price.total - b.price.total);
        toast[novos ? "success" : "info"](
          novos ? `+${novos} voltas encontradas` : "Nenhuma volta nova por enquanto",
        );
        return {
          ...prev,
          flights,
          totalFlightsCount: Math.max(prev.totalFlightsCount, flights.length),
          priceRange: r.priceRange ?? prev.priceRange,
        };
      });
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Erro ao carregar mais voltas"),
  });

  function pickOutbound(key: string) {
    setSelectedOut(key);
    setSelectedIn(null);
    setInbound(null);
    setOutFareOverride(null);
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
    const t = setTimeout(
      () => mut.mutate({ searchKey: result.searchKey, filters: outFilters }),
      500,
    );
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
    const t = setTimeout(
      () => inboundMut.mutate({ flightKey: selectedOut, filters: inFilters }),
      500,
    );
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inSig]);

  const refiltering = mut.isPending && !!result;
  const outFlights = result ? applyFilters(result.outbound.flights, outFilters) : [];
  const inFlights = inbound ? applyFilters(inbound.flights, inFilters) : [];
  const outFlightRaw = findByAnyKey(result?.outbound.flights ?? [], selectedOut);
  // A tarifa escolhida no modal (LIGHT/CLASSIC/FLEX) define preço e bagagem.
  const outFlightBase =
    outFlightRaw && selectedOut ? applyFareOption(outFlightRaw, selectedOut) : outFlightRaw;
  // Se a volta só combinou com outra tarifa do mesmo voo, o carrinho e o resumo
  // precisam usar essa tarifa (chave e preço reais).
  const outFlight: OnerFlight | null =
    outFlightBase && outFareOverride
      ? {
          ...outFlightBase,
          key: outFareOverride.key,
          price: outFareOverride.total
            ? {
                ...outFlightBase.price,
                total: outFareOverride.total,
                price: Math.max(0, outFareOverride.total - (outFlightBase.price.tax ?? 0)),
              }
            : outFlightBase.price,
        }
      : outFlightBase;
  const inFlightRaw = findByAnyKey(inbound?.flights ?? [], selectedIn);
  const inFlight =
    inFlightRaw && selectedIn ? applyFareOption(inFlightRaw, selectedIn) : inFlightRaw;

  const showSummary = !!outFlight && (!isRoundTrip || !!inFlight);
  const [summaryOpen, setSummaryOpen] = useState(false);
  // Abre o modal assim que a seleção fica completa.
  useEffect(() => {
    if (showSummary) setSummaryOpen(true);
  }, [showSummary]);
  const inboundPhase = isRoundTrip && !!selectedOut;

  function editOutbound() {
    setSelectedOut(null);
    setSelectedIn(null);
    setInbound(null);
    setOutFareOverride(null);
  }

  const cheapestOut = outFlights.length ? Math.min(...outFlights.map((f) => f.price.total)) : null;
  const cheapestIn = inFlights.length ? Math.min(...inFlights.map((f) => f.price.total)) : null;

  const step = !result ? 0 : showSummary ? (isRoundTrip ? 3 : 2) : outFlight && isRoundTrip ? 2 : 1;
  const canSearch =
    form.departureIata.length === 3 && form.arrivalIata.length === 3 && !!form.departureDate;
  const paxTotal = Number(form.adults) + Number(form.children) + Number(form.infants);

  // Motor único: aplica os parâmetros vindos do formulário compartilhado e busca.
  useEffect(() => {
    if (!preset || !runToken) return;
    setForm((f) => ({ ...f, ...preset }));
    setPendingRun(runToken);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runToken]);

  useEffect(() => {
    if (!pendingRun) return;
    if (canSearch) {
      setPendingRun(0);
      mut.mutate({ searchKey: null, filters: EMPTY_FILTERS });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingRun, canSearch]);

  return (
    <div className={header ? "" : "min-h-screen bg-background"}>
      {/* motor de busca */}
      {!hideForm && (
      <header className="relative overflow-hidden border-b border-border/60">
        <div
          className="absolute inset-0 opacity-60"
          style={{
            background:
              "radial-gradient(1200px 400px at 20% -10%, var(--brand-blue), transparent 70%)",
          }}
          aria-hidden
        />
        <div className="relative mx-auto max-w-7xl px-4 py-8">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
            {header ?? (
              <div>
                <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
                  <Plane className="h-6 w-6 text-primary" /> Motor de Voos
                </h1>
              </div>
            )}
          </div>

          {!hideForm && (
            <div className="rounded-[32px] border border-border/50 bg-card/60 p-6 shadow-2xl backdrop-blur-xl md:p-8">
              <div className="grid grid-cols-12 items-end gap-4">
                <div className="col-span-12 space-y-2 md:col-span-3">
                  <Label className="flex items-center gap-2 px-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    <MapPin className="h-3 w-3 text-primary" /> Origem
                  </Label>
                  <AirportAutocomplete
                    value={form.departureIata}
                    publicMode={publicMode}
                    isDeparture
                    placeholder="Cidade ou IATA (ex.: Curitiba / CWB)"
                    className="h-12 rounded-xl border-border/40 bg-muted/40 px-4 text-base font-semibold uppercase transition-all focus-visible:ring-2 focus-visible:ring-primary/50"
                    onSelect={(iata) => setForm({ ...form, departureIata: iata })}
                  />
                </div>

                <div className="col-span-12 space-y-2 md:col-span-3">
                  <Label className="flex items-center gap-2 px-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    <ArrowLeftRight className="h-3 w-3 text-primary" /> Destino
                  </Label>
                  <AirportAutocomplete
                    value={form.arrivalIata}
                    publicMode={publicMode}
                    isDeparture={false}
                    placeholder="Cidade ou IATA (ex.: São Paulo / GRU)"
                    className="h-12 rounded-xl border-border/40 bg-muted/40 px-4 text-base font-semibold uppercase transition-all focus-visible:ring-2 focus-visible:ring-primary/50"
                    onSelect={(iata) => setForm({ ...form, arrivalIata: iata })}
                  />
                </div>

                <div className="col-span-12 space-y-2 md:col-span-4">
                  <Label className="flex items-center gap-2 px-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    <CalendarDays className="h-3 w-3 text-primary" /> Ida e volta
                  </Label>
                  <DateRangeField
                    departureDate={form.departureDate}
                    returnDate={form.returnDate}
                    onChange={(departureDate, returnDate) =>
                      setForm({ ...form, departureDate, returnDate })
                    }
                  />
                </div>

                <div className="col-span-12 md:col-span-2">
                  <Button
                    size="lg"
                    className="h-12 w-full rounded-xl font-bold shadow-xl shadow-primary/25 transition-all hover:scale-[1.02] active:scale-95"
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

                <div className="col-span-12 mt-2 flex flex-col items-start gap-6 border-t border-border/40 pt-6 md:flex-row md:items-center md:justify-between">
                  <div className="flex flex-wrap items-center gap-6">
                    <span className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                      <Users className="h-5 w-5" /> {paxTotal} passageiro(s)
                    </span>
                    <div className="flex items-center gap-4">
                      {[
                        { k: "adults" as const, l: "Adultos", min: 1 },
                        { k: "children" as const, l: "Crianças", min: 0 },
                        { k: "infants" as const, l: "Bebês", min: 0 },
                      ].map((p) => (
                        <div key={p.k} className="flex flex-col">
                          <span className="mb-1 text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                            {p.l}
                          </span>
                          <Input
                            className="h-8 w-16 rounded-lg border-border/50 bg-muted/40 px-2 text-center"
                            type="number"
                            min={p.min}
                            max={9}
                            value={form[p.k]}
                            onChange={(e) => setForm({ ...form, [p.k]: Number(e.target.value) })}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </header>
      )}

      <main className="mx-auto max-w-7xl px-4 py-6">
        {mut.isPending && !result && <SearchSkeleton />}

        {!result && !mut.isPending && (
          <div data-empty-state className="rounded-2xl border border-dashed border-border p-12 text-center">
            <Plane className="mx-auto mb-3 h-6 w-6 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Informe os locais de origem e destino e as datas. Os filtros aparecem na lateral
              depois da pesquisa.
            </p>
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
              {inFlight && (
                <SelectedLegBar
                  label="Volta escolhida"
                  f={inFlight}
                  onEdit={() => setSelectedIn(null)}
                />
              )}

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
                  <Button
                    variant="outline"
                    className="w-full"
                    disabled={moreMut.isPending || mut.isPending}
                    onClick={() => moreMut.mutate()}
                  >
                    {moreMut.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Buscando mais companhias…
                      </>
                    ) : (
                      `Ver mais voos (${outFlights.length} exibidos)`
                    )}
                  </Button>
                </section>
              )}

              {/* passo 2 — volta */}
              {inboundPhase && inboundMut.isPending && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> Combinando voltas para a ida
                    selecionada…
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
                  <Button
                    variant="outline"
                    className="w-full"
                    disabled={moreInboundMut.isPending || inboundMut.isPending}
                    onClick={() => moreInboundMut.mutate()}
                  >
                    {moreInboundMut.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Buscando mais companhias…
                      </>
                    ) : (
                      `Ver mais voltas (${inFlights.length} exibidas)`
                    )}
                  </Button>
                </section>
              )}

              {showSummary && (
                <>
                  <div className="sticky bottom-4 z-20 flex items-center justify-between gap-3 rounded-2xl border border-primary/40 bg-card/95 p-4 shadow-[var(--shadow-card)] backdrop-blur">
                    <div className="min-w-0">
                      <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                        Seleção pronta
                      </div>
                      <div className="truncate text-sm font-semibold">
                        {outFlight!.journey.departure.iata} → {outFlight!.journey.destination.iata}
                        {inFlight ? " • ida e volta" : ""}
                      </div>
                    </div>
                    <Button
                      onClick={() => setSummaryOpen(true)}
                      className="shrink-0 text-xs font-black uppercase tracking-[0.15em]"
                    >
                      Ver seleção
                    </Button>
                  </div>
                  <SummaryCard
                    out={outFlight!}
                    inb={inFlight}
                    searchKey={result?.searchKey ?? null}
                    ctx={{ ...paxData(), returnDate: form.returnDate || null }}

                    open={summaryOpen}
                    onOpenChange={setSummaryOpen}
                    onComboSelect={onComboSelect}
                    publicMode={publicMode}
                  />
                </>
              )}

            </div>
          </div>
        )}

      </main>
    </div>
  );
}

