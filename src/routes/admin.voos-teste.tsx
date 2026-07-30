import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, Plane, Search, ArrowRight, Luggage, BriefcaseBusiness, Check, CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { installmentLabel, maxInstallments } from "@/lib/flight-installments";
import {
  onerFlightSearch,
  onerInboundSearch,
  flightHasBaggage,
  type OnerFlight,
  type OnerSearchResult,
} from "@/lib/onertravel.functions";

export const Route = createFileRoute("/admin/voos-teste")({
  head: () => ({
    meta: [
      { title: "Busca de Voos — VIA AIR" },
      { name: "description", content: "Busca de voos em tempo real na operadora com filtros e combinação de tarifas." },
    ],
  }),
  component: VoosTestePage,
});

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

// ---------------------------------------------------------------- filtros

type Filters = {
  onlyBaggage: boolean;
  stops: number[]; // 0,1,2 (2 = duas ou mais)
  periods: string[]; // madrugada|manha|tarde|noite
  airlines: string[];
  minPrice: string;
  maxPrice: string;
};

const EMPTY_FILTERS: Filters = {
  onlyBaggage: false,
  stops: [],
  periods: [],
  airlines: [],
  minPrice: "",
  maxPrice: "",
};

const PERIODS: Array<{ id: string; label: string; from: number; to: number }> = [
  { id: "madrugada", label: "Madrugada", from: 0, to: 5 },
  { id: "manha", label: "Manhã", from: 6, to: 11 },
  { id: "tarde", label: "Tarde", from: 12, to: 17 },
  { id: "noite", label: "Noite", from: 18, to: 23 },
];

function applyFilters(list: OnerFlight[], f: Filters) {
  return list.filter((fl) => {
    if (f.onlyBaggage && !flightHasBaggage(fl)) return false;
    if (f.stops.length) {
      const s = fl.journey.numberOfStops;
      const bucket = s >= 2 ? 2 : s;
      if (!f.stops.includes(bucket)) return false;
    }
    if (f.periods.length) {
      const h = fl.journey.departure.time.hour;
      const ok = f.periods.some((id) => {
        const p = PERIODS.find((x) => x.id === id)!;
        return h >= p.from && h <= p.to;
      });
      if (!ok) return false;
    }
    if (f.airlines.length) {
      const name = airlineOf(fl)?.name?.trim() ?? "";
      if (!f.airlines.includes(name)) return false;
    }
    const min = Number(f.minPrice.replace(",", "."));
    const max = Number(f.maxPrice.replace(",", "."));
    if (f.minPrice && !Number.isNaN(min) && fl.price.total < min) return false;
    if (f.maxPrice && !Number.isNaN(max) && fl.price.total > max) return false;
    return true;
  });
}

function toggle<T>(arr: T[], v: T): T[] {
  return arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
}

function FiltersPanel({
  flights,
  filters,
  onChange,
}: {
  flights: OnerFlight[];
  filters: Filters;
  onChange: (f: Filters) => void;
}) {
  const airlines = useMemo(() => {
    const set = new Set<string>();
    flights.forEach((f) => {
      const n = airlineOf(f)?.name?.trim();
      if (n) set.add(n);
    });
    return [...set].sort();
  }, [flights]);

  const prices = flights.map((f) => f.price.total);
  const lo = prices.length ? Math.min(...prices) : 0;
  const hi = prices.length ? Math.max(...prices) : 0;

  return (
    <aside className="space-y-5 rounded-xl border border-border bg-card p-4 text-sm">
      <div className="flex items-center justify-between">
        <span className="font-semibold">Filtros</span>
        <Button variant="ghost" size="sm" onClick={() => onChange(EMPTY_FILTERS)}>
          Limpar
        </Button>
      </div>

      <div className="space-y-2">
        <Label className="text-xs uppercase text-muted-foreground">Bagagem</Label>
        <label className="flex cursor-pointer items-center gap-2">
          <Checkbox
            checked={filters.onlyBaggage}
            onCheckedChange={(v) => onChange({ ...filters, onlyBaggage: v === true })}
          />
          Bagagem para despachar
        </label>
      </div>

      <div className="space-y-2">
        <Label className="text-xs uppercase text-muted-foreground">Número de paradas</Label>
        <div className="flex flex-wrap gap-2">
          {[
            { v: 0, l: "Voo direto" },
            { v: 1, l: "1 parada" },
            { v: 2, l: "2 ou mais" },
          ].map((o) => (
            <Button
              key={o.v}
              type="button"
              size="sm"
              variant={filters.stops.includes(o.v) ? "default" : "outline"}
              onClick={() => onChange({ ...filters, stops: toggle(filters.stops, o.v) })}
            >
              {o.l}
            </Button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-xs uppercase text-muted-foreground">Horário de partida</Label>
        <div className="flex flex-wrap gap-2">
          {PERIODS.map((p) => (
            <Button
              key={p.id}
              type="button"
              size="sm"
              variant={filters.periods.includes(p.id) ? "default" : "outline"}
              onClick={() => onChange({ ...filters, periods: toggle(filters.periods, p.id) })}
            >
              {p.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-xs uppercase text-muted-foreground">Preço total</Label>
        <div className="text-xs text-muted-foreground">
          {fmtMoney(lo)} — {fmtMoney(hi)}
        </div>
        <div className="flex gap-2">
          <Input
            placeholder="De"
            value={filters.minPrice}
            onChange={(e) => onChange({ ...filters, minPrice: e.target.value })}
          />
          <Input
            placeholder="Até"
            value={filters.maxPrice}
            onChange={(e) => onChange({ ...filters, maxPrice: e.target.value })}
          />
        </div>
      </div>

      {airlines.length > 0 && (
        <div className="space-y-2">
          <Label className="text-xs uppercase text-muted-foreground">Companhia aérea</Label>
          <div className="flex flex-wrap gap-2">
            {airlines.map((a) => (
              <Button
                key={a}
                type="button"
                size="sm"
                variant={filters.airlines.includes(a) ? "default" : "outline"}
                onClick={() => onChange({ ...filters, airlines: toggle(filters.airlines, a) })}
              >
                {a}
              </Button>
            ))}
          </div>
        </div>
      )}
    </aside>
  );
}

// ---------------------------------------------------------------- card

function FlightCard({
  f,
  selected,
  onSelect,
}: {
  f: OnerFlight;
  selected?: boolean;
  onSelect?: () => void;
}) {
  const j = f.journey;
  const withBag = flightHasBaggage(f);
  const bag = j.baggagesAllowance?.map((b) =>
    `${b.quantity ?? 1}x ${b.weight ?? ""}${b.unitDescription ?? ""} ${b.typeDescription ?? ""}`.trim(),
  );
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect?.();
        }
      }}
      className={`cursor-pointer rounded-xl border bg-card p-4 transition hover:border-primary/60 ${
        selected ? "border-primary ring-2 ring-primary/30" : "border-border"
      }`}
    >
      <div className="flex flex-wrap items-center gap-4">
        {j.marketingAirline?.pathLogo ? (
          <img
            src={j.marketingAirline.pathLogo}
            alt={j.marketingAirline?.name ?? "Cia aérea"}
            className="h-8 w-8 rounded bg-white object-contain"
          />
        ) : (
          <Plane className="h-6 w-6 text-muted-foreground" />
        )}

        <div className="min-w-[220px] flex-1">
          <div className="flex items-center gap-3">
            <div className="text-lg font-semibold">{fmtTime(j.departure.time)}</div>
            <div className="text-xs text-muted-foreground">{j.departure.iata}</div>
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
            <div className="text-lg font-semibold">{fmtTime(j.destination.time)}</div>
            <div className="text-xs text-muted-foreground">{j.destination.iata}</div>
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {fmtDate(j.departure.date)} • {j.flyingTime.hour}h{String(j.flyingTime.minute).padStart(2, "0")} •{" "}
            {j.numberOfStops === 0 ? "Direto" : `${j.numberOfStops} parada(s)`} • {j.marketingAirline?.name?.trim()}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge variant={withBag ? "default" : "secondary"} className="gap-1">
              {withBag ? <Luggage className="h-3 w-3" /> : <BriefcaseBusiness className="h-3 w-3" />}
              {withBag ? "Com bagagem despachada" : "Só bagagem de mão"}
            </Badge>
            {j.fareClass?.airlineFareFamily && <Badge variant="outline">{j.fareClass.airlineFareFamily}</Badge>}
            {selected && (
              <Badge className="gap-1">
                <Check className="h-3 w-3" /> Selecionado
              </Badge>
            )}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {j.segments.map((s) => `${s.marketingAirline?.iata ?? ""}${s.flightNumber}`).join(" + ")}
            {bag?.length ? ` • ${bag.join(", ")}` : ""}
          </div>
        </div>

        <div className="text-right">
          <div className="text-xl font-bold text-primary">{fmtMoney(f.price.total)}</div>
          <div className="text-xs text-muted-foreground">
            tarifa {fmtMoney(f.price.price)} + taxas {fmtMoney(taxesOf(f))}
          </div>
          <div className="text-[11px] text-muted-foreground">
            {f.price.passengerCount} pax • {installmentLabel(f.price.total, airlineOf(f))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- resumo

function SummaryCard({ out, inb }: { out: OnerFlight; inb: OnerFlight | null }) {
  const fare = out.price.price + (inb?.price.price ?? 0);
  const taxes = taxesOf(out) + (inb ? taxesOf(inb) : 0);
  const total = out.price.total + (inb?.price.total ?? 0);
  const pax = out.price.passengerCount || 1;

  // parcelamento manda o mais restritivo entre as cias envolvidas
  const nOut = maxInstallments(airlineOf(out));
  const nIn = inb ? maxInstallments(airlineOf(inb)) : nOut;
  const n = Math.min(nOut, nIn);

  return (
    <div className="sticky bottom-4 rounded-xl border border-primary/40 bg-card p-4 shadow-lg">
      <div className="mb-3 text-sm font-semibold">Resumo do preço</div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Tarifa ida ({airlineOf(out)?.name?.trim() ?? "—"})</span>
            <span>{fmtMoney(out.price.price)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Taxas ida</span>
            <span>{fmtMoney(taxesOf(out))}</span>
          </div>
          <div className="flex justify-between font-medium">
            <span>Subtotal ida</span>
            <span>{fmtMoney(out.price.total)}</span>
          </div>
          {inb && (
            <>
              <Separator className="my-2" />
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tarifa volta ({airlineOf(inb)?.name?.trim() ?? "—"})</span>
                <span>{fmtMoney(inb.price.price)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Taxas volta</span>
                <span>{fmtMoney(taxesOf(inb))}</span>
              </div>
              <div className="flex justify-between font-medium">
                <span>Subtotal volta</span>
                <span>{fmtMoney(inb.price.total)}</span>
              </div>
            </>
          )}
        </div>

        <div className="space-y-1 rounded-lg bg-muted/40 p-3 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Aéreo ({pax} pax)</span>
            <span>{fmtMoney(fare)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Taxas e serviço</span>
            <span>{fmtMoney(taxes)}</span>
          </div>
          <Separator className="my-2" />
          <div className="flex items-end justify-between">
            <span className="font-semibold">Total à vista</span>
            <span className="text-2xl font-bold text-primary">{fmtMoney(total)}</span>
          </div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <CreditCard className="h-3 w-3" />
            {n}x de {fmtMoney(total / n)} sem juros
          </div>
          <div className="text-xs text-muted-foreground">
            Por passageiro: {fmtMoney(total / pax)}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- página

function VoosTestePage() {
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
    maxStops: 0,
  });
  const [result, setResult] = useState<OnerSearchResult | null>(null);
  const [selectedOut, setSelectedOut] = useState<string | null>(null);
  const [selectedIn, setSelectedIn] = useState<string | null>(null);
  const [inbound, setInbound] = useState<{ totalFlightsCount: number; flights: OnerFlight[] } | null>(null);
  const [outFilters, setOutFilters] = useState<Filters>(EMPTY_FILTERS);
  const [inFilters, setInFilters] = useState<Filters>(EMPTY_FILTERS);
  const [isRoundTrip, setIsRoundTrip] = useState(false);

  const mut = useMutation({
    mutationFn: () =>
      search({
        data: {
          departureIata: form.departureIata.trim().toUpperCase(),
          arrivalIata: form.arrivalIata.trim().toUpperCase(),
          departureDate: form.departureDate,
          returnDate: form.returnDate || null,
          adults: Number(form.adults),
          children: Number(form.children),
          infants: Number(form.infants),
          maxStops: Number(form.maxStops),
          pageSize: 30,
          onlyWithBaggage: false,
        },
      }),
    onSuccess: (r) => {
      setResult(r);
      setSelectedOut(null);
      setSelectedIn(null);
      setInbound(null);
      setOutFilters(EMPTY_FILTERS);
      setInFilters(EMPTY_FILTERS);
      setIsRoundTrip(!!form.returnDate);
      if (!r.outbound.flights.length) toast.warning("Nenhum voo retornado para esses parâmetros");
      else toast.success(`${r.outbound.flights.length} voos encontrados`);
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Erro na busca"),
  });

  const inboundMut = useMutation({
    mutationFn: (flightKey: string) =>
      searchInbound({
        data: {
          searchKey: result!.searchKey,
          flightKey,
          departureIata: form.departureIata.trim().toUpperCase(),
          arrivalIata: form.arrivalIata.trim().toUpperCase(),
          departureDate: form.departureDate,
          returnDate: form.returnDate,
          adults: Number(form.adults),
          children: Number(form.children),
          infants: Number(form.infants),
          maxStops: Number(form.maxStops),
          pageSize: 30,
          onlyWithBaggage: false,
        },
      }),
    onSuccess: (r) => {
      setInbound(r);
      setInFilters(EMPTY_FILTERS);
      if (!r.flights.length) toast.warning("Nenhuma volta disponível para essa ida");
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Erro ao buscar volta"),
  });

  function pickOutbound(key: string) {
    setSelectedOut(key);
    setSelectedIn(null);
    setInbound(null);
    if (isRoundTrip) inboundMut.mutate(key);
  }

  const outFlights = result ? applyFilters(result.outbound.flights, outFilters) : [];
  const inFlights = inbound ? applyFilters(inbound.flights, inFilters) : [];
  const outFlight = result?.outbound.flights.find((f) => f.key === selectedOut) ?? null;
  const inFlight = inbound?.flights.find((f) => f.key === selectedIn) ?? null;
  const showSummary = !!outFlight && (!isRoundTrip || !!inFlight);

  const canSearch = form.departureIata.length === 3 && form.arrivalIata.length === 3 && !!form.departureDate;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4">
      <div>
        <h1 className="text-2xl font-bold">Busca de Voos</h1>
        <p className="text-sm text-muted-foreground">
          Consulta em tempo real na operadora. Os filtros aparecem depois da pesquisa.
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <div>
            <Label>Origem (IATA)</Label>
            <Input
              value={form.departureIata}
              maxLength={3}
              onChange={(e) => setForm({ ...form, departureIata: e.target.value.toUpperCase() })}
              placeholder="CWB"
            />
          </div>
          <div>
            <Label>Destino (IATA)</Label>
            <Input
              value={form.arrivalIata}
              maxLength={3}
              onChange={(e) => setForm({ ...form, arrivalIata: e.target.value.toUpperCase() })}
              placeholder="GRU"
            />
          </div>
          <div>
            <Label>Data ida</Label>
            <Input
              type="date"
              value={form.departureDate}
              onChange={(e) => setForm({ ...form, departureDate: e.target.value })}
            />
          </div>
          <div>
            <Label>Data volta (opcional)</Label>
            <Input
              type="date"
              value={form.returnDate}
              onChange={(e) => setForm({ ...form, returnDate: e.target.value })}
            />
          </div>
          <div>
            <Label>Adultos</Label>
            <Input
              type="number"
              min={1}
              max={9}
              value={form.adults}
              onChange={(e) => setForm({ ...form, adults: Number(e.target.value) })}
            />
          </div>
          <div>
            <Label>Crianças</Label>
            <Input
              type="number"
              min={0}
              max={9}
              value={form.children}
              onChange={(e) => setForm({ ...form, children: Number(e.target.value) })}
            />
          </div>
          <div>
            <Label>Bebês</Label>
            <Input
              type="number"
              min={0}
              max={9}
              value={form.infants}
              onChange={(e) => setForm({ ...form, infants: Number(e.target.value) })}
            />
          </div>
          <div>
            <Label>Paradas (0 = direto)</Label>
            <Input
              type="number"
              min={0}
              max={2}
              value={form.maxStops}
              onChange={(e) => setForm({ ...form, maxStops: Number(e.target.value) })}
            />
          </div>
        </div>

        <Button className="mt-4" disabled={!canSearch || mut.isPending} onClick={() => mut.mutate()}>
          {mut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
          Buscar voos
        </Button>
      </div>

      {mut.isPending && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Consultando a operadora…
        </div>
      )}

      {result && (
        <div className="grid gap-6 md:grid-cols-[260px_1fr]">
          <div className="space-y-4">
            <FiltersPanel
              flights={result.outbound.flights}
              filters={outFilters}
              onChange={setOutFilters}
            />
            {inbound && (
              <div>
                <div className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Filtros da volta</div>
                <FiltersPanel flights={inbound.flights} filters={inFilters} onChange={setInFilters} />
              </div>
            )}
          </div>

          <div className="space-y-6">
            <section className="space-y-3">
              <h2 className="text-lg font-semibold">
                Ida — {outFlights.length} de {result.outbound.flights.length} opções
              </h2>
              {isRoundTrip && (
                <p className="text-sm text-muted-foreground">
                  Selecione um voo de ida para carregar as opções de volta combinadas.
                </p>
              )}
              {outFlights.map((f) => (
                <FlightCard
                  key={f.key}
                  f={f}
                  selected={selectedOut === f.key}
                  onSelect={() => pickOutbound(f.key)}
                />
              ))}
              {!outFlights.length && (
                <p className="text-sm text-muted-foreground">Nenhum voo com esses filtros.</p>
              )}
            </section>

            {isRoundTrip && inboundMut.isPending && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Buscando voos de volta…
              </div>
            )}

            {inbound && (
              <section className="space-y-3">
                <h2 className="text-lg font-semibold">
                  Volta — {inFlights.length} de {inbound.flights.length} opções
                </h2>
                <p className="text-sm text-muted-foreground">Selecione a volta para ver o valor final combinado.</p>
                {inFlights.map((f) => (
                  <FlightCard
                    key={f.key}
                    f={f}
                    selected={selectedIn === f.key}
                    onSelect={() => setSelectedIn(f.key)}
                  />
                ))}
                {!inFlights.length && (
                  <p className="text-sm text-muted-foreground">Nenhuma volta com esses filtros.</p>
                )}
              </section>
            )}

            {showSummary && <SummaryCard out={outFlight!} inb={inFlight} />}
          </div>
        </div>
      )}
    </div>
  );
}
