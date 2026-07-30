import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Plane, Search, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  onerFlightSearch,
  onerInboundSearch,
  type OnerFlight,
  type OnerSearchResult,
} from "@/lib/onertravel.functions";

export const Route = createFileRoute("/admin/voos-teste")({
  head: () => ({ meta: [{ title: "Busca de Voos (teste) — VIA AIR" }] }),
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

function FlightCard({
  f,
  selectable,
  selected,
  onSelect,
}: {
  f: OnerFlight;
  selectable?: boolean;
  selected?: boolean;
  onSelect?: () => void;
}) {
  const j = f.journey;
  const bag = j.baggagesAllowance?.map((b) => `${b.quantity ?? 1}x ${b.weight ?? ""}${b.unitDescription ?? ""} ${b.typeDescription ?? ""}`.trim());
  return (
    <div
      role={selectable ? "button" : undefined}
      tabIndex={selectable ? 0 : undefined}
      onClick={selectable ? onSelect : undefined}
      className={`rounded-xl border bg-card p-4 transition ${
        selectable ? "cursor-pointer hover:border-primary/60" : ""
      } ${selected ? "border-primary ring-2 ring-primary/30" : "border-border"}`}
    >
      <div className="flex flex-wrap items-center gap-4">
        {j.marketingAirline?.pathLogo ? (
          <img src={j.marketingAirline.pathLogo} alt={j.marketingAirline?.name ?? "Cia aérea"} className="h-8 w-8 rounded object-contain bg-white" />
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
            {j.numberOfStops === 0 ? "Direto" : `${j.numberOfStops} parada(s)`} •{" "}
            {j.marketingAirline?.name?.trim()}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {j.segments.map((s) => `${s.marketingAirline?.iata ?? ""}${s.flightNumber}`).join(" + ")}
            {j.fareClass?.airlineFareFamily ? ` • ${j.fareClass.airlineFareFamily}` : ""}
            {bag?.length ? ` • ${bag.join(", ")}` : ""}
          </div>
        </div>

        <div className="text-right">
          <div className="text-xl font-bold text-primary">{fmtMoney(f.price.total)}</div>
          <div className="text-xs text-muted-foreground">
            tarifa {fmtMoney(f.price.price)} + taxas {fmtMoney(f.price.tax + (f.price.serviceTax ?? 0))}
          </div>
          <div className="text-[11px] text-muted-foreground">{f.price.passengerCount} pax</div>
        </div>
      </div>
    </div>
  );
}

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
  const [inbound, setInbound] = useState<{ totalFlightsCount: number; flights: OnerFlight[] } | null>(null);

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
          pageSize: 10,
        },
      }),
    onSuccess: (r) => {
      setResult(r);
      setSelectedOut(null);
      setInbound(null);
      if (!r.outbound.flights.length) toast.warning("Nenhum voo retornado para esses parâmetros");
      else toast.success(`${r.outbound.totalFlightsCount} voos encontrados`);
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
          pageSize: 10,
        },
      }),
    onSuccess: (r) => {
      setInbound(r);
      if (!r.flights.length) toast.warning("Nenhuma volta disponível para essa ida");
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Erro ao buscar volta"),
  });

  function pickOutbound(key: string) {
    setSelectedOut(key);
    setInbound(null);
    if (form.returnDate) inboundMut.mutate(key);
  }

  const canSearch =
    form.departureIata.length === 3 && form.arrivalIata.length === 3 && !!form.departureDate;

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4">
      <div>
        <h1 className="text-2xl font-bold">Busca de Voos — teste</h1>
        <p className="text-sm text-muted-foreground">
          Consulta em tempo real na operadora (Comprar Viagem / VIA AIR). Pode levar de 10 a 30 segundos.
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
        <div className="space-y-6">
          <section className="space-y-3">
            <h2 className="text-lg font-semibold">
              Ida — {result.outbound.totalFlightsCount} opções
            </h2>
            {form.returnDate && (
              <p className="text-sm text-muted-foreground">
                Selecione um voo de ida para carregar as opções de volta combinadas.
              </p>
            )}
            {result.outbound.flights.map((f) => (
              <FlightCard
                key={f.key}
                f={f}
                selectable={!!form.returnDate}
                selected={selectedOut === f.key}
                onSelect={() => pickOutbound(f.key)}
              />
            ))}
            {!result.outbound.flights.length && (
              <p className="text-sm text-muted-foreground">Nada retornado.</p>
            )}
          </section>

          {form.returnDate && inboundMut.isPending && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Buscando voos de volta…
            </div>
          )}

          {inbound && (
            <section className="space-y-3">
              <h2 className="text-lg font-semibold">
                Volta — {inbound.totalFlightsCount} opções
              </h2>
              {inbound.flights.map((f) => (
                <FlightCard key={f.key} f={f} />
              ))}
              {!inbound.flights.length && (
                <p className="text-sm text-muted-foreground">Nada retornado na volta.</p>
              )}
            </section>
          )}
        </div>
      )}
    </div>
  );
}
