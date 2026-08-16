/**
 * MULTI-TRECHO VIA AIR
 *
 * Camada de orquestração: o cliente monta uma única viagem com vários trechos,
 * o motor pesquisa cada trecho como "somente ida" (sequencialmente), o cliente
 * escolhe um voo por trecho e, no fim, vê tudo junto — com preço, parcelamento
 * e botão de compra INDEPENDENTES por trecho.
 *
 * Nada aqui altera o fluxo atual de ida e volta / só ida.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  ArrowLeftRight,
  Check,
  CheckCircle2,
  ChevronDown,
  Info,
  Loader2,
  MapPin,
  Plane,
  Plus,
  RotateCcw,
  Search,
  ShoppingCart,
  TriangleAlert,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AirportAutocomplete } from "@/components/search/AirportAutocomplete";
import { SingleDateField } from "@/components/search/SingleDateField";
import { NoResults } from "@/components/flights/NoResults";
import {
  MAX_SEGMENTS,
  MIN_SEGMENTS,
  encodeSegments,
  isSegmentComplete,
  newSegment,
  validateSegments,
  type MultiPick,
  type MultiSegmentInput,
  type SavedPick,
} from "@/lib/multicity";
import {
  AVISO_VALIDADE_TARIFA,
  extendedText,
  getAirfarePaymentConditions,
  maxInstallmentText,
} from "@/lib/airfare-conditions";
import { onerCreateFlightCart, onerFlightSearch } from "@/lib/onertravel.functions";
import {
  onerCreateFlightCartPublic,
  onerFlightSearchPublic,
} from "@/lib/onertravel-public.functions";
import { applyFareOption, flightHasBaggage, type OnerFlight, type OnerSearchResult } from "@/lib/onertravel.types";

/** Peças visuais do motor atual, injetadas para reaproveitar o mesmo design. */
export type FlightUi = {
  FlightCard: React.ComponentType<{
    f: OnerFlight;
    selected?: boolean;
    onSelect?: () => void;
    cheapest?: boolean;
    readOnly?: boolean;
    label?: string;
  }>;
  SegmentsDetail: React.ComponentType<{ f: OnerFlight }>;
  BagChip: React.ComponentType<{
    icon: React.ComponentType<{ className?: string }>;
    kicker: string;
    value: string;
    active: boolean;
  }>;
  fmtMoney: (v: number) => string;
  fmtTime: (t: { hour: number; minute: number }) => string;
  fmtDate: (d: { year: number; month: number; day: number }) => string;
  airlineOf: (f: OnerFlight) => { iata?: string; name?: string } | null | undefined;
  taxesOf: (f: OnerFlight) => number;
  normalizeSearchResult: (raw: unknown) => OnerSearchResult | null;
  findByAnyKey: (list: OnerFlight[], key: string | null | undefined) => OnerFlight | null;
  FiltersPanel: React.ComponentType<{
    title: string;
    flights: OnerFlight[];
    filters: any;
    onChange: (f: any) => void;
    loading?: boolean;
    priceRange?: { minPrice: number; maxPrice: number } | null;
  }>;
  EMPTY_FILTERS: any;
  applyFilters: (list: OnerFlight[], f: any) => OnerFlight[];
  cityCodes: Set<string>;
  BriefcaseIcon: React.ComponentType<{ className?: string }>;
  LuggageIcon: React.ComponentType<{ className?: string }>;
};

export type MultiPax = { adults: number; children: number; infants: number };

// ------------------------------------------------------------------ botão

export function MultiTrechoToggle({
  active,
  onToggle,
}: {
  active: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={active}
      className={`inline-flex h-11 shrink-0 items-center gap-2 rounded-xl border px-4 text-xs font-bold uppercase tracking-widest transition ${
        active
          ? "border-primary bg-primary/10 text-primary"
          : "border-border/60 bg-background/40 text-muted-foreground hover:border-primary/50 hover:text-foreground"
      }`}
    >
      {active ? <RotateCcw className="h-4 w-4" /> : <ArrowLeftRight className="h-4 w-4" />}
      {active ? "Ida e volta" : "Multi-trecho"}
    </button>
  );
}

// ------------------------------------------------------------- construtor

export function MultiCityForm({
  segments,
  onChange,
  onSearch,
  onCancel,
  searching,
  publicMode = false,
  externalSearch = false,
  pax,
}: {
  segments: MultiSegmentInput[];
  onChange: (s: MultiSegmentInput[]) => void;
  onSearch: () => void;
  onCancel: () => void;
  searching?: boolean;
  publicMode?: boolean;
  /** Widget: a busca abre /voar em outra aba (mesmo comportamento do modo normal). */
  externalSearch?: boolean;
  pax: MultiPax;
}) {
  const errors = validateSegments(segments);
  const preenchidos = segments.filter(isSegmentComplete).length;
  const podeBuscar = preenchidos === segments.length && Object.keys(errors).length === 0;

  function patch(id: string, data: Partial<MultiSegmentInput>) {
    onChange(segments.map((s) => (s.id === id ? { ...s, ...data } : s)));
  }

  function addSegment() {
    if (segments.length >= MAX_SEGMENTS) return;
    const last = segments[segments.length - 1];
    onChange([...segments, newSegment({ origin: last?.destination ?? "" })]);
  }

  function removeSegment(id: string) {
    if (segments.length <= MIN_SEGMENTS) return;
    onChange(segments.filter((s) => s.id !== id));
  }

  const searchButton = (
    <Button
      type={externalSearch ? "submit" : "button"}
      size="lg"
      disabled={!podeBuscar || !!searching}
      onClick={externalSearch ? undefined : onSearch}
      className="h-12 w-full rounded-xl font-bold shadow-xl shadow-primary/25 transition-all hover:scale-[1.02] active:scale-95 md:w-auto md:px-8"
    >
      {searching ? (
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      ) : (
        <Search className="mr-2 h-4 w-4" />
      )}
      Buscar trechos
    </Button>
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <MultiTrechoToggle active onToggle={onCancel} />
      </div>

      <div className="space-y-2">
        {segments.map((s, i) => {
          const erro = errors[s.id];
          const minDate = i > 0 ? segments[i - 1]?.date || undefined : undefined;
          return (
            <div
              key={s.id}
              className="rounded-2xl border border-border/50 bg-background/30 p-3"
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary">
                  Trecho {i + 1}
                </span>
                {segments.length > MIN_SEGMENTS && (
                  <button
                    type="button"
                    onClick={() => removeSegment(s.id)}
                    aria-label={`Remover trecho ${i + 1}`}
                    className="grid h-8 w-8 place-items-center rounded-full border border-border/60 text-muted-foreground transition hover:text-destructive"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              <div className="grid gap-2 md:grid-cols-[1fr_auto_1fr_1fr]">
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-2 px-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    <MapPin className="h-3 w-3 text-primary" /> Origem
                  </Label>
                  <AirportAutocomplete
                    value={s.origin}
                    publicMode={publicMode}
                    isDeparture
                    placeholder="De onde sai?"
                    className="h-12 rounded-xl border-border/40 bg-muted/40 px-4 text-base font-semibold uppercase"
                    onSelect={(iata) => patch(s.id, { origin: iata })}
                  />
                </div>

                <div className="hidden items-end pb-1 md:flex">
                  <button
                    type="button"
                    aria-label="Inverter origem e destino"
                    onClick={() => patch(s.id, { origin: s.destination, destination: s.origin })}
                    className="grid h-9 w-9 place-items-center rounded-full border border-border/60 bg-card text-muted-foreground transition hover:text-primary active:scale-95"
                  >
                    <ArrowLeftRight className="h-4 w-4" />
                  </button>
                </div>

                <div className="space-y-1.5">
                  <Label className="flex items-center gap-2 px-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    <ArrowLeftRight className="h-3 w-3 text-primary" /> Destino
                  </Label>
                  <AirportAutocomplete
                    value={s.destination}
                    publicMode={publicMode}
                    isDeparture={false}
                    placeholder="Para onde vai?"
                    className="h-12 rounded-xl border-border/40 bg-muted/40 px-4 text-base font-semibold uppercase"
                    onSelect={(iata) => {
                      const next = segments.map((x, idx) =>
                        x.id === s.id
                          ? { ...x, destination: iata }
                          : // preenchimento inteligente: só sugere quando o próximo está vazio
                            idx === i + 1 && !x.origin
                            ? { ...x, origin: iata }
                            : x,
                      );
                      onChange(next);
                    }}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="flex items-center gap-2 px-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    Data
                  </Label>
                  <SingleDateField
                    value={s.date}
                    min={minDate}
                    label="Escolher data"
                    onChange={(iso) => patch(s.id, { date: iso })}
                  />
                </div>
              </div>

              {erro && (
                <p className="mt-2 flex items-center gap-1.5 text-[11px] font-medium text-destructive">
                  <TriangleAlert className="h-3.5 w-3.5" /> {erro}
                </p>
              )}
            </div>
          );
        })}
      </div>

      <button
        type="button"
        onClick={addSegment}
        disabled={segments.length >= MAX_SEGMENTS}
        className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-border/70 py-2.5 text-sm font-semibold text-primary transition hover:border-primary/60 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Plus className="h-4 w-4" /> Adicionar trecho
      </button>

      {externalSearch ? (
        <form action="/voar" method="get" target="_blank" className="flex justify-end">
          <input type="hidden" name="m" value="aereo" />
          <input type="hidden" name="ms" value={encodeSegments(segments)} />
          <input type="hidden" name="ad" value={pax.adults} />
          <input type="hidden" name="ch" value={pax.children} />
          <input type="hidden" name="inf" value={pax.infants} />
          {searchButton}
        </form>
      ) : (
        <div className="flex justify-end">{searchButton}</div>
      )}
    </div>
  );
}

/** Filtro local do multi-trecho (não há reconsulta na operadora por trecho). */
function refineLocal(list: OnerFlight[], f: any, ui: FlightUi): OnerFlight[] {
  let out = ui.applyFilters(list, f);
  if (f?.onlyBaggage) out = out.filter((fl) => flightHasBaggage(fl));
  if (f?.airlines?.length) {
    out = out.filter((fl) => {
      const a = ui.airlineOf(fl);
      return !!a?.iata && f.airlines.includes(a.iata);
    });
  }
  const min = Number(String(f?.minPrice ?? "").replace(",", "."));
  const max = Number(String(f?.maxPrice ?? "").replace(",", "."));
  if (f?.minPrice && Number.isFinite(min)) out = out.filter((fl) => fl.price.total >= min);
  if (f?.maxPrice && Number.isFinite(max)) out = out.filter((fl) => fl.price.total <= max);
  const dep = f?.dep as [number, number] | undefined;
  if (dep && (dep[0] !== 0 || dep[1] !== 1440)) {
    out = out.filter((fl) => {
      const t = fl.journey.departure.time;
      const m = t.hour * 60 + t.minute;
      return m >= dep[0] && m <= dep[1];
    });
  }
  return out;
}

// -------------------------------------------------------------- resultados

type SegState = {
  input: MultiSegmentInput;
  status: "idle" | "loading" | "done" | "empty" | "error";
  result: OnerSearchResult | null;
  selectedKey: string | null;
  error?: string;
};

/**
 * Voo indicado no link da promoção (cia + horário de partida). Sem casamento
 * exato, cai no mais barato do trecho — o cliente nunca vê a lista vazia de
 * seleção quando o link prometeu um carrinho pronto.
 */
function escolherVooDoLink(
  flights: OnerFlight[],
  pick: MultiPick | undefined,
  ui: FlightUi,
): string | null {
  if (!pick || !flights.length) return null;
  const hhmm = (f: OnerFlight) => {
    const t = f.journey?.departure?.time ?? f.journey?.segments?.[0]?.departure?.time;
    return t ? `${String(t.hour).padStart(2, "0")}:${String(t.minute).padStart(2, "0")}` : "";
  };
  const cia = (f: OnerFlight) => (ui.airlineOf(f)?.iata ?? "").toUpperCase();
  const alvoCia = (pick.airline ?? "").toUpperCase();

  const exato = flights.find((f) => (!alvoCia || cia(f) === alvoCia) && (!pick.time || hhmm(f) === pick.time));
  const porCia = alvoCia ? flights.filter((f) => cia(f) === alvoCia) : [];
  const maisBarato = (list: OnerFlight[]) =>
    list.reduce<OnerFlight | null>((a, f) => (!a || f.price.total < a.price.total ? f : a), null);

  const alvo = exato ?? maisBarato(porCia) ?? maisBarato(flights);
  return alvo?.key ?? null;
}

/** Assinatura forte do voo salvo na cotação (link pronto). */
export function pickFromFlight(f: OnerFlight, ui: FlightUi): SavedPick {
  const t = f.journey?.departure?.time ?? f.journey?.segments?.[0]?.departure?.time;
  const segs = f.journey?.segments ?? [];
  const chegada = f.journey?.destination?.time ?? segs[segs.length - 1]?.destination?.time;
  const hhmm = (x?: { hour: number; minute: number }) =>
    x ? `${String(x.hour).padStart(2, "0")}:${String(x.minute).padStart(2, "0")}` : null;
  const a = ui.airlineOf(f);
  return {
    airline: a?.iata ?? null,
    airlineName: a?.name ?? null,
    flightNumber: segs[0]?.flightNumber ?? null,
    time: hhmm(t),
    arrival: hhmm(chegada),
    fareKey: f.key ?? null,
    total: f.price?.total ?? null,
    baggage: flightHasBaggage(f),
  };
}

/**
 * Casa o voo salvo com a nova pesquisa: tarifa exata → cia + número do voo →
 * cia + horário → mais barato da cia → mais barato do trecho. Assim o link
 * pronto abre sempre a mesma viagem, mesmo depois da tarifa ser reconsultada.
 */
function escolherVooSalvo(
  flights: OnerFlight[],
  pick: SavedPick | undefined,
  ui: FlightUi,
): string | null {
  if (!pick || !flights.length) return null;
  const hhmm = (f: OnerFlight) => {
    const t = f.journey?.departure?.time ?? f.journey?.segments?.[0]?.departure?.time;
    return t ? `${String(t.hour).padStart(2, "0")}:${String(t.minute).padStart(2, "0")}` : "";
  };
  const cia = (f: OnerFlight) => (ui.airlineOf(f)?.iata ?? "").toUpperCase();
  const num = (f: OnerFlight) => (f.journey?.segments?.[0]?.flightNumber ?? "").trim();
  const alvoCia = (pick.airline ?? "").toUpperCase();

  if (pick.fareKey) {
    const exato = ui.findByAnyKey(flights, pick.fareKey);
    if (exato) return pick.fareKey;
  }
  const porNumero =
    pick.flightNumber && alvoCia
      ? flights.find((f) => cia(f) === alvoCia && num(f) === pick.flightNumber)
      : null;
  const porHora = flights.find(
    (f) => (!alvoCia || cia(f) === alvoCia) && (!pick.time || hhmm(f) === pick.time),
  );
  const maisBarato = (list: OnerFlight[]) =>
    list.reduce<OnerFlight | null>((a, f) => (!a || f.price.total < a.price.total ? f : a), null);
  const porCia = alvoCia ? flights.filter((f) => cia(f) === alvoCia) : [];

  const alvo = porNumero ?? porHora ?? maisBarato(porCia) ?? maisBarato(flights);
  return alvo?.key ?? null;
}

export function MultiCityResults({
  segments,
  pax,
  runToken,
  publicMode = false,
  preselect,
  savedPicks,
  quoteToken,
  ui,
}: {
  segments: MultiSegmentInput[];
  pax: MultiPax;
  runToken: number;
  publicMode?: boolean;
  /** Voo já escolhido por trecho (link de promoção multi-trecho). */
  preselect?: MultiPick[];
  /** Cotação salva no backend: seleção completa, abre direto a tela final. */
  savedPicks?: SavedPick[];
  quoteToken?: string;
  ui: FlightUi;
}) {
  const linkPronto = !!savedPicks?.length;

  const search = useServerFn(publicMode ? onerFlightSearchPublic : onerFlightSearch);
  const [segs, setSegs] = useState<SegState[]>([]);
  const [active, setActive] = useState(0);
  const [finalOpen, setFinalOpen] = useState(false);
  const [purchased, setPurchased] = useState<Record<string, boolean>>({});
  const [filters, setFilters] = useState<Record<number, any>>({});
  const runRef = useRef(0);

  const paxFor = (s: MultiSegmentInput) => ({
    departureIata: s.origin.trim().toUpperCase(),
    arrivalIata: s.destination.trim().toUpperCase(),
    departureDate: s.date,
    returnDate: null,
    adults: pax.adults,
    children: pax.children,
    infants: pax.infants,
    pageSize: 50 as const,
    searchKey: null,
    departureIsCity: ui.cityCodes.has(s.origin.trim().toUpperCase()),
    arrivalIsCity: ui.cityCodes.has(s.destination.trim().toUpperCase()),
  });

  // Busca SEQUENCIAL (estabilidade primeiro): trecho 1 → trecho 2 → trecho 3.
  useEffect(() => {
    if (!runToken || !segments.length) return;
    const run = ++runRef.current;
    setPurchased({});
    setFilters({});
    setFinalOpen(false);
    setActive(0);
    setSegs(
      segments.map((input) => ({ input, status: "idle", result: null, selectedKey: null })),
    );

    (async () => {
      for (let i = 0; i < segments.length; i++) {
        if (runRef.current !== run) return;
        const input = segments[i]!;
        setSegs((prev) =>
          prev.map((s, idx) => (idx === i ? { ...s, status: "loading" } : s)),
        );
        try {
          const raw = await search({ data: paxFor(input) });
          if (runRef.current !== run) return;
          const r = ui.normalizeSearchResult(raw);
          const escolhido = escolherVooDoLink(r?.outbound.flights ?? [], preselect?.[i], ui);
          setSegs((prev) =>
            prev.map((s, idx) =>
              idx === i
                ? {
                    ...s,
                    result: r,
                    selectedKey: escolhido ?? s.selectedKey,
                    status: r && r.outbound.flights.length ? "done" : "empty",
                  }
                : s,
            ),
          );
        } catch (e) {
          if (runRef.current !== run) return;
          setSegs((prev) =>
            prev.map((s, idx) =>
              idx === i
                ? {
                    ...s,
                    status: "error",
                    error: e instanceof Error ? e.message : "Erro na busca",
                  }
                : s,
            ),
          );
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runToken]);

  /** Reconsulta apenas um trecho (tarifa expirada, sem opções, data alterada). */
  async function researchOne(i: number) {
    const input = segs[i]?.input;
    if (!input) return;
    const run = runRef.current;
    setSegs((prev) =>
      prev.map((s, idx) =>
        idx === i ? { ...s, status: "loading", selectedKey: null, result: null } : s,
      ),
    );
    try {
      const raw = await search({ data: paxFor(input) });
      if (runRef.current !== run) return;
      const r = ui.normalizeSearchResult(raw);
      setSegs((prev) =>
        prev.map((s, idx) =>
          idx === i
            ? { ...s, result: r, status: r && r.outbound.flights.length ? "done" : "empty" }
            : s,
        ),
      );
    } catch (e) {
      setSegs((prev) =>
        prev.map((s, idx) =>
          idx === i
            ? { ...s, status: "error", error: e instanceof Error ? e.message : "Erro na busca" }
            : s,
        ),
      );
    }
  }

  const selectedFlights = useMemo(
    () =>
      segs.map((s) => {
        const raw = ui.findByAnyKey(s.result?.outbound.flights ?? [], s.selectedKey);
        return raw && s.selectedKey ? applyFareOption(raw, s.selectedKey) : raw;
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [segs],
  );

  const todosSelecionados = segs.length > 0 && selectedFlights.every(Boolean);
  const total = selectedFlights.reduce((acc, f) => acc + (f?.price.total ?? 0), 0);

  useEffect(() => {
    if (todosSelecionados) setFinalOpen(true);
  }, [todosSelecionados]);

  function pick(i: number, key: string) {
    setSegs((prev) => prev.map((s, idx) => (idx === i ? { ...s, selectedKey: key } : s)));
    const proximo = segs.findIndex((s, idx) => idx !== i && !s.selectedKey);
    if (proximo >= 0) setActive(proximo);
  }

  if (!segs.length) return null;

  const carregando = segs.some((s) => s.status === "loading" || s.status === "idle");
  const atual = segs[active];
  const todosVoos = atual?.result?.outbound.flights ?? [];
  const filtroAtual = filters[active] ?? ui.EMPTY_FILTERS;
  const flights = todosVoos.length ? refineLocal(todosVoos, filtroAtual, ui) : todosVoos;
  const cheapest = flights.length ? Math.min(...flights.map((f) => f.price.total)) : null;

  return (
    <div className="space-y-6">
      {/* progresso da pesquisa por trecho */}
      <section className="rounded-2xl border border-border/60 bg-card/70 p-4 md:p-5">
        <h2 className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
          <Plane className="h-3.5 w-3.5 text-primary" /> Consultando sua viagem
        </h2>
        <ul className="space-y-2">
          {segs.map((s, i) => (
            <li
              key={s.input.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm"
            >
              <span className="text-[10px] font-bold uppercase tracking-widest text-primary">
                Trecho {i + 1}
              </span>
              <span className="font-semibold">
                {s.input.origin} → {s.input.destination}
              </span>
              <span className="text-xs text-muted-foreground">
                {s.input.date.split("-").reverse().join("/")}
              </span>
              <span className="ml-auto flex items-center gap-1.5 text-xs">
                {s.status === "loading" && (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                    <span className="text-muted-foreground">Consultando companhias aéreas…</span>
                  </>
                )}
                {s.status === "idle" && <span className="text-muted-foreground">Na fila…</span>}
                {s.status === "done" && (
                  <span className="flex items-center gap-1.5 font-semibold text-primary">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    {s.selectedKey ? "Voo selecionado" : "Opções encontradas"}
                  </span>
                )}
                {s.status === "empty" && (
                  <span className="flex items-center gap-1.5 text-amber-500">
                    <TriangleAlert className="h-3.5 w-3.5" /> Não encontramos opções nesta data
                  </span>
                )}
                {s.status === "error" && (
                  <span className="flex items-center gap-1.5 text-destructive">
                    <TriangleAlert className="h-3.5 w-3.5" /> {s.error ?? "Erro na consulta"}
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* abas dos trechos */}
      <div className="flex flex-wrap gap-2">
        {segs.map((s, i) => {
          const on = i === active;
          return (
            <button
              key={s.input.id}
              type="button"
              onClick={() => setActive(i)}
              className={`flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-bold uppercase tracking-wide transition ${
                on
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border/60 text-muted-foreground hover:text-foreground"
              }`}
            >
              {s.selectedKey ? <Check className="h-3.5 w-3.5" /> : null}
              Trecho {i + 1} • {s.input.origin}→{s.input.destination}
            </button>
          );
        })}
      </div>

      {atual && (
        <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
          <aside className="space-y-4 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:self-start lg:overflow-y-auto lg:overscroll-contain lg:pr-1">
            <ui.FiltersPanel
              title={`Filtros • Trecho ${active + 1}`}
              flights={todosVoos}
              filters={filtroAtual}
              onChange={(f) => setFilters((prev) => ({ ...prev, [active]: f }))}
              priceRange={atual.result?.outbound.priceRange ?? null}
            />
          </aside>
        <section className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-semibold">
              Trecho {active + 1} — {atual.input.origin} → {atual.input.destination}
            </h2>
            <span className="text-xs text-muted-foreground">
              {flights.length ? `${flights.length} opções` : ""}
            </span>
          </div>

          {(atual.status === "loading" || atual.status === "idle") && (
            <div className="space-y-3">
              <Skeleton className="h-28 w-full rounded-2xl" />
              <Skeleton className="h-28 w-full rounded-2xl" />
            </div>
          )}

          {atual.status === "done" &&
            flights.map((f) => (
              <ui.FlightCard
                key={f.key}
                f={f}
                selected={f.key === atual.selectedKey}
                cheapest={f.price.total === cheapest}
                onSelect={() => pick(active, f.key)}
              />
            ))}

          {(atual.status === "empty" || atual.status === "error") && (
            <div className="space-y-3">
              <NoResults
                title={
                  atual.status === "error"
                    ? "Não conseguimos consultar este trecho."
                    : "Não encontramos opções para este trecho."
                }
                hint="Os demais trechos continuam salvos. Você pode buscar novamente somente este trecho."
              />
              <Button variant="outline" className="w-full" onClick={() => researchOne(active)}>
                <RotateCcw className="mr-2 h-4 w-4" /> Buscar nova opção para este trecho
              </Button>
            </div>
          )}

          {atual.status === "done" && !flights.length && (
            <NoResults
              title="Nenhuma opção com esses filtros."
              hint="Ajuste os filtros deste trecho para ver mais voos."
            />
          )}
        </section>
        </div>
      )}

      {todosSelecionados && !carregando && (
        <div className="sticky bottom-4 z-20 flex items-center justify-between gap-3 rounded-2xl border border-primary/40 bg-card/95 p-4 shadow-[var(--shadow-card)] backdrop-blur">
          <div className="min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              Viagem montada
            </div>
            <div className="truncate text-sm font-semibold">
              {segs.length} trechos • {ui.fmtMoney(total)}
            </div>
          </div>
          <Button
            onClick={() => setFinalOpen(true)}
            className="shrink-0 text-xs font-black uppercase tracking-[0.15em]"
          >
            Ver viagem
          </Button>
        </div>
      )}

      <MultiCitySummaryDialog
        open={finalOpen}
        onOpenChange={setFinalOpen}
        segs={segs}
        flights={selectedFlights}
        pax={pax}
        publicMode={publicMode}
        ui={ui}
        purchased={purchased}
        onPurchased={(id) => setPurchased((p) => ({ ...p, [id]: true }))}
        onResearch={researchOne}
      />
    </div>
  );
}

// ----------------------------------------------------------- tela final

function MultiCitySummaryDialog({
  open,
  onOpenChange,
  segs,
  flights,
  pax,
  publicMode,
  ui,
  purchased,
  onPurchased,
  onResearch,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  segs: SegState[];
  flights: (OnerFlight | null)[];
  pax: MultiPax;
  publicMode: boolean;
  ui: FlightUi;
  purchased: Record<string, boolean>;
  onPurchased: (id: string) => void;
  onResearch: (i: number) => void;
}) {
  const validos = flights.filter(Boolean) as OnerFlight[];
  const total = validos.reduce((a, f) => a + f.price.total, 0);
  const comprados = segs.filter((s) => purchased[s.input.id]);
  const jaComprado = comprados.reduce(
    (a, s) => a + (flights[segs.indexOf(s)]?.price.total ?? 0),
    0,
  );
  const paxTotal = pax.adults + pax.children + pax.infants;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] w-[calc(100vw-1.5rem)] max-w-[720px] flex-col gap-0 overflow-hidden rounded-3xl border-border/60 bg-card p-0">
        <DialogHeader className="border-b border-border/50 bg-background/40 px-5 py-4 text-left">
          <DialogTitle className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
            <Plane className="h-3.5 w-3.5 text-primary" /> Sua viagem multi-trecho
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 space-y-4 overflow-y-auto p-4 md:p-5">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-primary">
            <CheckCircle2 className="h-3.5 w-3.5" />
            {validos.length === segs.length
              ? "Todos os trechos selecionados"
              : `${validos.length} de ${segs.length} trechos selecionados`}
          </div>

          <div className="grid gap-3 rounded-2xl border border-border/60 bg-background/40 p-4 sm:grid-cols-3">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                {segs.length} trechos
              </div>
              <div className="text-sm font-semibold">{validos.length} voos</div>
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Valor total
              </div>
              <div className="text-lg font-black text-primary">{ui.fmtMoney(total)}</div>
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                {paxTotal} passageiro(s)
              </div>
              <div className="text-sm font-semibold">
                {pax.adults} adulto(s)
                {pax.children ? ` • ${pax.children} criança(s)` : ""}
                {pax.infants ? ` • ${pax.infants} bebê(s)` : ""}
              </div>
            </div>
          </div>

          {segs.map((s, i) => (
            <TrechoCard
              key={s.input.id}
              index={i}
              seg={s}
              f={flights[i] ?? null}
              pax={pax}
              publicMode={publicMode}
              ui={ui}
              purchased={!!purchased[s.input.id]}
              onPurchased={() => onPurchased(s.input.id)}
              onResearch={() => {
                onOpenChange(false);
                onResearch(i);
              }}
            />
          ))}

          <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4">
            <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              Valor total da viagem
            </div>
            <div className="text-3xl font-black tracking-tight">{ui.fmtMoney(total)}</div>
            <div className="mt-1 text-[11px] text-muted-foreground">
              Soma dos trechos selecionados
            </div>
            {comprados.length > 0 && (
              <div className="mt-3 grid gap-1 border-t border-border/50 pt-3 text-[11px]">
                <div className="font-semibold text-primary">
                  {comprados.length} de {segs.length} trechos comprados
                  {comprados.length === segs.length ? " ✓" : ""}
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Já comprado</span>
                  <span>{ui.fmtMoney(jaComprado)}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Restante</span>
                  <span>{ui.fmtMoney(Math.max(0, total - jaComprado))}</span>
                </div>
              </div>
            )}
          </div>

          <div className="flex items-start gap-2 rounded-2xl border border-border/60 bg-background/40 p-4 text-[11px] leading-relaxed text-muted-foreground">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <span>
              <strong className="font-semibold text-foreground">Informações importantes:</strong>{" "}
              cada trecho será emitido separadamente e pode ter regras tarifárias, condições de
              bagagem e parcelamento diferentes. {AVISO_VALIDADE_TARIFA}
            </span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function TrechoCard({
  index,
  seg,
  f,
  pax,
  publicMode,
  ui,
  purchased,
  onPurchased,
  onResearch,
}: {
  index: number;
  seg: SegState;
  f: OnerFlight | null;
  pax: MultiPax;
  publicMode: boolean;
  ui: FlightUi;
  purchased: boolean;
  onPurchased: () => void;
  onResearch: () => void;
}) {
  const [open, setOpen] = useState(false);
  const createCart = useServerFn(publicMode ? onerCreateFlightCartPublic : onerCreateFlightCart);

  const cartMut = useMutation({
    mutationFn: async () => {
      if (!f) throw new Error("Trecho sem voo selecionado");
      return createCart({
        data: {
          searchKey: seg.result?.searchKey ?? "",
          outboundFareId: f.key,
          outboundItineraryId: f.journey.key ?? "",
          inboundFareId: null,
          inboundItineraryId: null,
          isRoundTrip: false,
          departureIata: seg.input.origin.trim().toUpperCase(),
          arrivalIata: seg.input.destination.trim().toUpperCase(),
          departureDate: seg.input.date,
          returnDate: null,
          adults: pax.adults,
          children: pax.children,
          infants: pax.infants,
          departureIsCity: ui.cityCodes.has(seg.input.origin.trim().toUpperCase()),
          arrivalIsCity: ui.cityCodes.has(seg.input.destination.trim().toUpperCase()),
        },
      });
    },
    onSuccess: (r: { url: string }) => {
      onPurchased();
      window.open(r.url, "_blank", "noopener");
    },
    onError: (e) =>
      toast.error(
        e instanceof Error && e.message
          ? `Trecho ${index + 1}: ${e.message}`
          : `Trecho ${index + 1}: esta tarifa pode não estar mais disponível`,
      ),
  });

  if (!f) {
    return (
      <div className="space-y-3 rounded-2xl border border-amber-500/40 bg-amber-500/5 p-4">
        <div className="text-[10px] font-bold uppercase tracking-widest text-amber-500">
          Trecho {index + 1} • {seg.input.origin} → {seg.input.destination}
        </div>
        <p className="text-xs text-muted-foreground">
          Esta tarifa não está mais disponível ou o voo ainda não foi escolhido.
        </p>
        <Button variant="outline" size="sm" onClick={onResearch}>
          <RotateCcw className="mr-2 h-3.5 w-3.5" /> Buscar nova opção para este trecho
        </Button>
      </div>
    );
  }

  const j = f.journey;
  const withBag = flightHasBaggage(f);
  const cond = getAirfarePaymentConditions({
    total: f.price.total,
    passengers: f.price.passengerCount || 1,
    airline: ui.airlineOf(f),
  });

  return (
    <div className="rounded-2xl border border-border/60 bg-background/40 p-4 md:p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary">
          Trecho {index + 1}
        </span>
        <span
          className={`flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide ${
            purchased ? "text-primary" : "text-muted-foreground"
          }`}
        >
          <CheckCircle2 className="h-3.5 w-3.5" /> {purchased ? "Comprado" : "Selecionado"}
        </span>
      </div>

      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-col">
          <span className="text-2xl font-bold leading-none tracking-tight">
            {ui.fmtTime(j.departure.time)}
          </span>
          <span className="mt-1 text-sm font-black uppercase leading-none text-primary">
            {j.departure.iata}
          </span>
          <span className="mt-0.5 text-[10px] leading-tight text-muted-foreground">
            {j.departure.name}
          </span>
        </div>

        <div className="flex flex-1 flex-col items-center px-2">
          <span className="mb-1.5 text-[9px] font-bold uppercase text-muted-foreground">
            {j.flyingTime.hour}h{String(j.flyingTime.minute).padStart(2, "0")}
          </span>
          <div className="relative flex w-full items-center">
            <div className="h-px w-full bg-border" />
            <span className="absolute left-0 h-1.5 w-1.5 rounded-full bg-primary" />
            <span className="absolute right-0 h-1.5 w-1.5 rounded-full bg-primary" />
          </div>
          <span className="mt-1.5 text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
            {j.numberOfStops === 0 ? "Direto" : `${j.numberOfStops} conexão(ões)`}
          </span>
        </div>

        <div className="flex min-w-0 flex-col items-end text-right">
          <span className="text-2xl font-bold leading-none tracking-tight">
            {ui.fmtTime(j.destination.time)}
          </span>
          <span className="mt-1 text-sm font-black uppercase leading-none text-primary">
            {j.destination.iata}
          </span>
          <span className="mt-0.5 text-[10px] leading-tight text-muted-foreground">
            {j.destination.name}
          </span>
        </div>
      </div>

      <div className="mb-3 flex items-center gap-2 text-[10px] font-medium uppercase tracking-tight text-muted-foreground">
        {j.marketingAirline?.pathLogo ? (
          <img
            src={j.marketingAirline.pathLogo}
            alt={j.marketingAirline?.name ?? "Companhia aérea"}
            className="h-5 w-5 rounded bg-white object-contain"
            loading="lazy"
          />
        ) : (
          <Plane className="h-3.5 w-3.5" />
        )}
        {j.segments.map((s) => `${s.marketingAirline?.iata ?? ""}${s.flightNumber}`).join(" + ")}
        <span className="ml-auto normal-case">{ui.fmtDate(j.departure.date)}</span>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/50 pt-4">
        <div className="flex gap-5">
          <ui.BagChip icon={ui.BriefcaseIcon} kicker="Mão" value="10kg inclusa" active />
          <ui.BagChip
            icon={ui.LuggageIcon}
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

      {open && (
        <>
          <ui.SegmentsDetail f={f} />
          <div className="mt-3 space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Tarifa</span>
              <span className="font-medium">{ui.fmtMoney(f.price.price)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Taxas e serviços</span>
              <span className="font-medium">{ui.fmtMoney(ui.taxesOf(f))}</span>
            </div>
          </div>
        </>
      )}

      <div className="mt-4 flex flex-col gap-3 border-t border-border/50 pt-4 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Valor do trecho
          </div>
          <div className="text-2xl font-black leading-none tracking-tight">
            {ui.fmtMoney(f.price.total)}
          </div>
        </div>

        <div className="min-w-0 md:flex-1 md:px-4">
          <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Melhor condição
          </div>
          <div className="text-sm font-semibold text-primary">
            {cond.payment.pixOnly
              ? "Pagamento somente via Pix"
              : cond.interestFree.available
                ? `${cond.interestFree.installments}x de ${ui.fmtMoney(cond.interestFree.installmentValue)} sem juros`
                : `À vista ${ui.fmtMoney(f.price.total)}`}
          </div>
          {!cond.payment.pixOnly && maxInstallmentText(f.price.total) ? (
            <div className="text-[10px] text-muted-foreground">
              {maxInstallmentText(f.price.total)}
            </div>
          ) : null}
          {extendedText(cond) ? (
            <div className="text-[10px] text-muted-foreground">{extendedText(cond)}</div>
          ) : null}

        </div>

        <Button
          disabled={cartMut.isPending}
          onClick={() => cartMut.mutate()}
          className="shrink-0 text-xs font-black uppercase tracking-[0.15em]"
        >
          {cartMut.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <ShoppingCart className="mr-2 h-4 w-4" />
          )}
          {purchased ? "Abrir carrinho" : "Comprar"}
        </Button>
      </div>
    </div>
  );
}

