import { useState } from "react";
import {
  Plane,
  PlaneTakeoff,
  PlaneLanding,
  Backpack,
  Briefcase,
  Luggage,
  Route as RouteIcon,
  X,
  Clock,
} from "lucide-react";
import { AirlineLogo } from "@/components/AirlineLogo";

export type FlightSegment = {
  airline?: string;
  flight_number?: string;
  from_iata?: string;
  from_city?: string;
  to_iata?: string;
  to_city?: string;
  depart_at?: string;
  arrive_at?: string;
  duration?: string;
  layover?: string;
};

export type FlightInfo = {
  airline?: string;
  airline_logo_url?: string;
  flight_number?: string;
  from_iata?: string;
  from_city?: string;
  to_iata?: string;
  to_city?: string;
  depart_at?: string;
  arrive_at?: string;
  duration?: string;
  stops?: number | string;
  cabin_class?: string;
  carry_on?: boolean;
  checked_bag?: boolean;
  personal_item?: boolean;
  segments?: FlightSegment[];
};

export function FlightCard({
  flight,
  kind,
  adults,
  airlineLocator,
}: {
  flight: FlightInfo;
  kind: "outbound" | "return";
  adults: number;
  airlineLocator?: string | null;
}) {
  const Icon = kind === "outbound" ? PlaneTakeoff : PlaneLanding;
  const label = kind === "outbound" ? "Voo de ida" : "Voo de volta";
  const segments = getDisplaySegments(flight);
  const first = segments[0];
  const last = segments[segments.length - 1];
  const fromIata = first?.from_iata ?? flight.from_iata;
  const fromCity = first?.from_city ?? flight.from_city;
  const toIata = last?.to_iata ?? flight.to_iata;
  const toCity = last?.to_city ?? flight.to_city;
  const departAt = first?.depart_at ?? flight.depart_at;
  const arriveAt = last?.arrive_at ?? flight.arrive_at;
  const stopsN = Math.max(0, segments.length - 1);
  const hasStops = stopsN > 0;
  const totalDuration = computeTotalDuration(departAt, arriveAt) || flight.duration;
  const connectionLabel = hasStops ? `${stopsN} conexão${stopsN > 1 ? "es" : ""}` : "Voo direto";
  const [openItin, setOpenItin] = useState(false);
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center justify-between gap-2 text-xs uppercase tracking-widest text-muted-foreground">
        <span className="inline-flex items-center gap-2">
          <Icon className="h-4 w-4 text-brand-orange" /> {label}
        </span>
        {airlineLocator && (
          <span className="inline-flex items-center gap-1.5 rounded-md border border-brand-orange/40 bg-brand-orange/10 px-2 py-0.5 text-[10px] font-mono font-bold tracking-widest text-brand-orange normal-case">
            <Plane className="h-3 w-3" /> {airlineLocator}
          </span>
        )}
      </div>
      <div className="mt-3 flex items-start gap-3">
        {flight.airline_logo_url ? (
          <img
            src={flight.airline_logo_url}
            alt={flight.airline ?? "Companhia aérea"}
            className="h-12 w-12 rounded-lg object-contain bg-white p-1 border border-border shrink-0"
          />
        ) : (
          <AirlineLogo airline={flight.airline ?? first?.airline} size={48} />
        )}
        <div className="flex-1 min-w-0">
          <div className="font-semibold">
            {flight.airline ?? first?.airline ?? "Companhia"}{" "}
            {(flight.flight_number || first?.flight_number) && (
              <span className="text-muted-foreground font-normal">
                · {flight.flight_number ?? first?.flight_number}
              </span>
            )}
          </div>
          <div className="text-sm mt-0.5">
            <span className="font-medium">
              {fromIata ?? "—"} {formatFlightTime(departAt)}
            </span>
            <span className="text-muted-foreground"> — </span>
            <span className="font-medium">
              {toIata ?? "—"} {formatFlightTime(arriveAt)}
            </span>
          </div>
          {(fromCity || toCity) && (
            <div className="text-[11px] text-muted-foreground mt-0.5">
              {fromCity ?? ""}
              {fromCity && toCity ? " → " : ""}
              {toCity ?? ""}
            </div>
          )}
          {(departAt || arriveAt) && (
            <div className="text-[11px] text-muted-foreground mt-0.5">
              {departAt && formatFlightDate(departAt)}
              {arriveAt && arriveAt !== departAt && ` → ${formatFlightDate(arriveAt)}`}
            </div>
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
        <span>{connectionLabel}</span>
        <span>· {adults} Adulto{adults > 1 ? "s" : ""}</span>
        {flight.cabin_class && <span>· {flight.cabin_class}</span>}
        {totalDuration && <span>· {totalDuration}</span>}
      </div>

      {segments.length > 0 && (
        <button
          type="button"
          onClick={() => setOpenItin(true)}
          className="mt-3 inline-flex items-center gap-2 rounded-full border border-brand-orange/40 text-brand-orange px-3.5 py-1.5 text-xs font-medium hover:bg-brand-orange/10 transition"
          title="Ver itinerário"
        >
          <RouteIcon className="h-3.5 w-3.5" />
          Ver itinerário
        </button>
      )}

      {(flight.personal_item || flight.carry_on || flight.checked_bag) && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
          <BagIcon label="Bolsa/mochila" active={!!flight.personal_item} icon={Backpack} />
          <BagIcon label="Bagagem de mão" active={!!flight.carry_on} icon={Briefcase} />
          <BagIcon label="Bagagem despachada" active={!!flight.checked_bag} icon={Luggage} />
        </div>
      )}

      {openItin && (
        <ItineraryModal
          flight={flight}
          kind={kind}
          totalDuration={totalDuration}
          onClose={() => setOpenItin(false)}
        />
      )}
    </div>
  );
}

function ItineraryModal({
  flight,
  kind,
  totalDuration,
  onClose,
}: {
  flight: FlightInfo;
  kind: "outbound" | "return";
  totalDuration?: string;
  onClose: () => void;
}) {
  const segments = getDisplaySegments(flight);
  const first = segments[0];
  const last = segments[segments.length - 1];
  const fromIata = first?.from_iata ?? flight.from_iata;
  const toIata = last?.to_iata ?? flight.to_iata;
  const headline =
    kind === "outbound"
      ? "Aqui está o seu itinerário completo de ida"
      : "Aqui está o seu itinerário completo da volta";
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl border border-border bg-card shadow-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-[#7a2f0a] text-white px-5 py-4 flex items-center justify-between rounded-t-2xl">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-white/80 font-semibold">
              Itinerário completo
            </div>
            <div className="font-display font-bold text-white text-lg leading-tight mt-0.5">
              {headline}
            </div>
            <div className="text-xs text-white/90 mt-1">
              {fromIata} → {toIata}
              {totalDuration && ` · ${totalDuration}`}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 hover:bg-white/20 transition text-white"
            aria-label="Fechar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-5 space-y-3">
          {segments.map((s, i, arr) => (
            <div key={i}>
              <div className="rounded-xl border border-border p-4">
                <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span className="uppercase tracking-widest">
                    {arr.length === 1 ? "Voo direto" : `Trecho ${i + 1}`}
                  </span>
                  {s.duration && <span>{s.duration}</span>}
                </div>
                <div className="mt-2 flex items-center gap-2 text-sm font-semibold">
                  {s.airline ?? "Companhia"}
                  {s.flight_number && (
                    <span className="text-muted-foreground font-normal">· {s.flight_number}</span>
                  )}
                </div>
                <div className="mt-3 grid grid-cols-[1fr_auto_1fr] gap-2 items-center">
                  <div>
                    <div className="text-lg font-display font-bold">{s.from_iata ?? "—"}</div>
                    <div className="text-xs text-muted-foreground">{s.from_city ?? ""}</div>
                    <div className="text-xs mt-1">
                      {s.depart_at && (
                        <>
                          <span className="font-medium">{formatFlightTime(s.depart_at)}</span>
                          <span className="text-muted-foreground">
                            {" "}· {formatFlightDate(s.depart_at)}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  <Plane className="h-4 w-4 text-brand-orange rotate-90 sm:rotate-0" />
                  <div className="text-right">
                    <div className="text-lg font-display font-bold">{s.to_iata ?? "—"}</div>
                    <div className="text-xs text-muted-foreground">{s.to_city ?? ""}</div>
                    <div className="text-xs mt-1">
                      {s.arrive_at && (
                        <>
                          <span className="font-medium">{formatFlightTime(s.arrive_at)}</span>
                          <span className="text-muted-foreground">
                            {" "}· {formatFlightDate(s.arrive_at)}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              {i < arr.length - 1 &&
                (() => {
                  const nextDepart = arr[i + 1]?.depart_at;
                  const auto = computeLayover(s.arrive_at, nextDepart);
                  const layoverText = s.layover?.trim() || auto;
                  return (
                    <div className="my-2 flex items-center gap-2 pl-4 text-xs text-muted-foreground">
                      <Clock className="h-3.5 w-3.5 text-brand-orange" />
                      <span>
                        Tempo de conexão em{" "}
                        <strong className="text-foreground">{s.to_iata ?? "—"}</strong>
                        {layoverText ? (
                          <>
                            : <strong className="text-foreground">{layoverText}</strong>
                          </>
                        ) : null}
                      </span>
                    </div>
                  );
                })()}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function getDisplaySegments(flight: FlightInfo): FlightSegment[] {
  const filledSegments = (flight.segments ?? []).filter(hasSegmentData);
  if (filledSegments.length > 0) return filledSegments;
  const fallbackSegment: FlightSegment = {
    airline: flight.airline,
    flight_number: flight.flight_number,
    from_iata: flight.from_iata,
    from_city: flight.from_city,
    to_iata: flight.to_iata,
    to_city: flight.to_city,
    depart_at: flight.depart_at,
    arrive_at: flight.arrive_at,
    duration: flight.duration,
  };
  return hasSegmentData(fallbackSegment) ? [fallbackSegment] : [];
}

function hasSegmentData(segment: FlightSegment): boolean {
  return Object.values(segment).some((v) => v !== "" && v !== null && v !== undefined);
}

function BagIcon({
  label,
  active,
  icon: Icon,
}: {
  label: string;
  active: boolean;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <span
      title={label}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition ${
        active
          ? "border-brand-orange/40 bg-brand-orange/10 text-brand-orange"
          : "border-border text-muted-foreground/60 line-through decoration-1"
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
      <span>{label}</span>
    </span>
  );
}

function computeLayover(arrive?: string, nextDepart?: string): string {
  if (!arrive || !nextDepart) return "";
  const a = new Date(arrive).getTime();
  const b = new Date(nextDepart).getTime();
  if (Number.isNaN(a) || Number.isNaN(b) || b <= a) return "";
  const minsTotal = Math.round((b - a) / 60000);
  const h = Math.floor(minsTotal / 60);
  const m = minsTotal % 60;
  if (h === 0) return `${m}min`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}min`;
}

function computeTotalDuration(depart?: string, arrive?: string): string {
  if (!depart || !arrive) return "";
  const a = new Date(depart).getTime();
  const b = new Date(arrive).getTime();
  if (Number.isNaN(a) || Number.isNaN(b) || b <= a) return "";
  const minsTotal = Math.round((b - a) / 60000);
  const h = Math.floor(minsTotal / 60);
  const m = minsTotal % 60;
  if (h === 0) return `${m}min`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}min`;
}

function formatFlightTime(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}
function formatFlightDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}
