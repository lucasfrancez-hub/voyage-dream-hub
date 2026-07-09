import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  MapPin,
  Plane,
  PlaneTakeoff,
  PlaneLanding,
  Calendar,
  Hotel,
  Check,
  ArrowLeft,
  ArrowRight,
  Star,
  MessageCircle,
  Backpack,
  Briefcase,
  Luggage,
  Route as RouteIcon,
  X,
  Clock,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatBRL, formatDateBR, formatDateRange } from "@/lib/format";
import { customQuoteWhatsappUrl } from "@/lib/checkout-config";
import viaAirLogo from "@/assets/viaair-logo.png.asset.json";
import { ContactFooter } from "@/components/ContactFooter";

export const Route = createFileRoute("/pacotes/$slug/")({
  component: PackageDetails,
  errorComponent: ({ error }) => (
    <div className="min-h-screen flex items-center justify-center p-6 text-center">
      <div>
        <h1 className="text-2xl font-semibold">Não foi possível carregar o pacote</h1>
        <p className="mt-2 text-muted-foreground text-sm">{error.message}</p>
        <Link to="/pacotes" className="mt-4 inline-block text-brand-orange hover:underline">
          Voltar aos pacotes
        </Link>
      </div>
    </div>
  ),
  notFoundComponent: () => (
    <div className="min-h-screen flex items-center justify-center p-6 text-center">
      <div>
        <h1 className="text-2xl font-semibold">Pacote não encontrado</h1>
        <Link to="/pacotes" className="mt-4 inline-block text-brand-orange hover:underline">
          Ver todos os pacotes
        </Link>
      </div>
    </div>
  ),
});

function PackageDetails() {
  const { slug } = Route.useParams();

  const { data: pkg, isLoading } = useQuery({
    queryKey: ["package", slug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("packages")
        .select("*")
        .eq("slug", slug)
        .eq("is_active", true)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw notFound();
      return data;
    },
  });

  if (isLoading || !pkg) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        Carregando…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto max-w-7xl px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3">
            <img src={viaAirLogo.url} alt="Via Air" className="h-9 w-auto" />
          </Link>
          <Link
            to="/pacotes"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-brand-orange"
          >
            <ArrowLeft className="h-4 w-4" /> Todos os pacotes
          </Link>
        </div>
      </header>

      {/* Hero image */}
      <div className="relative w-full aspect-[16/7] max-h-[420px] overflow-hidden">
        {pkg.image_url && (
          <img src={pkg.image_url} alt={pkg.title} className="absolute inset-0 h-full w-full object-cover" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
        <div className="absolute inset-x-0 bottom-0">
          <div className="mx-auto max-w-7xl px-6 pb-8">
            <div className="inline-flex items-center gap-2 rounded-full bg-brand-orange px-4 py-1.5 text-xs uppercase tracking-widest text-primary-foreground">
              <MapPin className="h-3.5 w-3.5" /> {pkg.destination}
            </div>
            <h1 className="mt-4 font-display text-3xl md:text-5xl font-bold max-w-3xl">
              {pkg.title}
            </h1>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-6 py-10 grid lg:grid-cols-[1fr_360px] gap-10">
        {/* Left: content */}
        <div className="space-y-10">
          <section className="grid sm:grid-cols-3 gap-4">
            {pkg.origin && (
              <InfoTile icon={Plane} label="Saindo de" value={pkg.origin} />
            )}
            <InfoTile icon={Calendar} label="Período" value={formatDateRange(pkg.going_date, pkg.return_date)} />
            {pkg.nights != null && (
              <InfoTile icon={Calendar} label="Duração" value={`${pkg.nights} noites`} />
            )}
          </section>

          {pkg.summary && (
            <section>
              <h2 className="text-xl font-semibold">Sobre o pacote</h2>
              <p className="mt-3 text-muted-foreground leading-relaxed">{pkg.summary}</p>
            </section>
          )}

          {pkg.itinerary && (
            <section>
              <h2 className="text-xl font-semibold">Roteiro</h2>
              <pre className="mt-3 whitespace-pre-wrap font-sans text-sm text-muted-foreground leading-relaxed">
                {pkg.itinerary}
              </pre>
            </section>
          )}

          {pkg.hotel_name && (
            <section className="rounded-2xl border border-border bg-card p-6">
              <div className="flex items-start gap-4">
                <div className="h-11 w-11 rounded-xl bg-muted/50 border border-border flex items-center justify-center shrink-0">
                  <Hotel className="h-5 w-5 text-brand-orange" />
                </div>
                <div>
                  <h3 className="font-semibold">Hospedagem</h3>
                  <div className="mt-1 flex items-center gap-2">
                    <span>{pkg.hotel_name}</span>
                    {pkg.hotel_stars ? (
                      <span className="inline-flex">
                        {Array.from({ length: pkg.hotel_stars }).map((_, i) => (
                          <Star key={i} className="h-3.5 w-3.5 fill-brand-orange text-brand-orange" />
                        ))}
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>
            </section>
          )}

          {(pkg.outbound_flight || pkg.return_flight) && (
            <section>
              <h2 className="text-xl font-semibold">Voos</h2>
              <div className="mt-4 grid md:grid-cols-2 gap-4">
                {pkg.outbound_flight && (
                  <FlightCard flight={pkg.outbound_flight as FlightInfo} kind="outbound" adults={pkg.base_occupancy ?? 2} />
                )}
                {pkg.return_flight && (
                  <FlightCard flight={pkg.return_flight as FlightInfo} kind="return" adults={pkg.base_occupancy ?? 2} />
                )}
              </div>
            </section>
          )}

          {pkg.includes && pkg.includes.length > 0 && (
            <section>
              <h2 className="text-xl font-semibold">O que está incluso</h2>
              <ul className="mt-4 grid sm:grid-cols-2 gap-3">
                {pkg.includes.map((item) => (
                  <li key={item} className="flex items-start gap-2 text-sm">
                    <Check className="h-4 w-4 text-brand-orange mt-0.5 shrink-0" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        {/* Right: sticky reservation card */}
        <aside className="lg:sticky lg:top-6 h-fit">
          <div className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
            <div className="text-xs text-muted-foreground">Preço por pessoa</div>
            <div className="mt-1 text-3xl font-display font-bold text-brand-orange">
              {formatBRL(pkg.price_per_person)}
            </div>
            {pkg.taxes ? (
              <div className="text-xs text-muted-foreground mt-1">
                + {formatBRL(pkg.taxes)} de taxas
              </div>
            ) : null}

            <dl className="mt-6 space-y-3 text-sm">
              <Row label="Destino" value={pkg.destination} />
              {pkg.origin && <Row label="Origem" value={pkg.origin} />}
              {pkg.going_date && <Row label="Ida" value={formatDateBR(pkg.going_date)} />}
              {pkg.return_date && <Row label="Volta" value={formatDateBR(pkg.return_date)} />}
              {pkg.nights != null && <Row label="Noites" value={String(pkg.nights)} />}
            </dl>

            <div className="mt-5 rounded-xl border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
              Este pacote foi montado para{" "}
              <span className="text-foreground font-medium">
                {pkg.base_occupancy ?? 2} adulto{(pkg.base_occupancy ?? 2) > 1 ? "s" : ""}
              </span>
              . Precisa de outra quantidade de viajantes?{" "}
              <a
                href={customQuoteWhatsappUrl(pkg.title)}
                target="_blank"
                rel="noreferrer"
                className="text-brand-orange hover:underline font-medium"
              >
                Fale no WhatsApp
              </a>
              .
            </div>

            <Link
              to="/pacotes/$slug/checkout"
              params={{ slug: pkg.slug }}
              className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full bg-gradient-brand px-6 py-3 font-semibold text-primary-foreground shadow-[var(--shadow-glow)] hover:opacity-90 transition"
            >
              Reservar agora <ArrowRight className="h-4 w-4" />
            </Link>
            <p className="mt-3 text-[11px] text-muted-foreground text-center">
              Você preenche seus dados e finaliza o pagamento na próxima etapa.
            </p>
          </div>
        </aside>
      </div>
      <ContactFooter whatsappMessage={`Olá! Tenho interesse no pacote e quero mais informações.`} />
    </div>
  );
}

type FlightSegment = {
  airline?: string;
  flight_number?: string;
  from_iata?: string;
  from_city?: string;
  to_iata?: string;
  to_city?: string;
  depart_at?: string;
  arrive_at?: string;
  duration?: string;
  layover?: string; // tempo de conexão após este trecho (ex.: "1h 40min")
};

type FlightInfo = {
  airline?: string;
  airline_logo_url?: string;
  flight_number?: string;
  from_iata?: string;
  from_city?: string;
  to_iata?: string;
  to_city?: string;
  depart_at?: string; // ISO datetime string
  arrive_at?: string;
  duration?: string;
  stops?: number | string;
  cabin_class?: string; // Econômica, Executiva…
  carry_on?: boolean; // bagagem de mão
  checked_bag?: boolean; // bagagem despachada
  personal_item?: boolean; // item pessoal / mochila
  segments?: FlightSegment[];
};

function FlightCard({ flight, kind, adults }: { flight: FlightInfo; kind: "outbound" | "return"; adults: number }) {
  const Icon = kind === "outbound" ? PlaneTakeoff : PlaneLanding;
  const label = kind === "outbound" ? "Voo de ida" : "Voo de volta";
  const stopsN = typeof flight.stops === "string" ? Number(flight.stops) : flight.stops;
  const hasStops = stopsN != null && !Number.isNaN(stopsN) && stopsN > 0;
  const segments = flight.segments ?? [];
  const [openItin, setOpenItin] = useState(false);
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
        <Icon className="h-4 w-4 text-brand-orange" /> {label}
      </div>
      <div className="mt-3 flex items-start gap-3">
        {flight.airline_logo_url ? (
          <img
            src={flight.airline_logo_url}
            alt={flight.airline ?? "Companhia aérea"}
            className="h-12 w-12 rounded-lg object-contain bg-white p-1 border border-border shrink-0"
          />
        ) : (
          <div className="h-12 w-12 rounded-lg bg-muted flex items-center justify-center text-[10px] font-semibold text-muted-foreground shrink-0">
            {flight.airline?.slice(0, 3).toUpperCase() ?? "AIR"}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="font-semibold">
            {flight.airline ?? "Companhia"}{" "}
            {flight.flight_number && (
              <span className="text-muted-foreground font-normal">· {flight.flight_number}</span>
            )}
          </div>
          <div className="text-sm mt-0.5">
            <span className="font-medium">{flight.from_iata ?? "—"} {formatFlightTime(flight.depart_at)}</span>
            <span className="text-muted-foreground"> — </span>
            <span className="font-medium">{flight.to_iata ?? "—"} {formatFlightTime(flight.arrive_at)}</span>
          </div>
          {(flight.depart_at || flight.arrive_at) && (
            <div className="text-[11px] text-muted-foreground mt-0.5">
              {flight.depart_at && formatFlightDate(flight.depart_at)}
              {flight.arrive_at && flight.arrive_at !== flight.depart_at && ` → ${formatFlightDate(flight.arrive_at)}`}
            </div>
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
        {stopsN != null && !Number.isNaN(stopsN) && (
          <span>{stopsN === 0 ? "Direto" : `${stopsN} parada${stopsN > 1 ? "s" : ""}`}</span>
        )}
        <span>· {adults} Adulto{adults > 1 ? "s" : ""}</span>
        {flight.cabin_class && <span>· {flight.cabin_class}</span>}
        {flight.duration && <span>· {flight.duration}</span>}
      </div>

      {hasStops && (
        <button
          type="button"
          onClick={() => setOpenItin(true)}
          className="mt-3 inline-flex items-center gap-2 rounded-full border border-brand-orange/40 text-brand-orange px-3.5 py-1.5 text-xs font-medium hover:bg-brand-orange/10 transition"
          title="Ver itinerário completo"
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
        <ItineraryModal flight={flight} label={label} segments={segments} onClose={() => setOpenItin(false)} />
      )}
    </div>
  );
}

function ItineraryModal({
  flight,
  label,
  onClose,
}: {
  flight: FlightInfo;
  label: string;
  onClose: () => void;
}) {
  const segments = flight.segments ?? [];
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl border border-border bg-card shadow-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-gradient-to-r from-brand-orange to-brand-orange/70 text-white px-5 py-4 flex items-center justify-between rounded-t-2xl">
          <div>
            <div className="text-[10px] uppercase tracking-widest opacity-90">Itinerário completo</div>
            <div className="font-display font-semibold">{label}</div>
            <div className="text-xs opacity-90 mt-0.5">
              {flight.from_iata} → {flight.to_iata}
              {flight.duration && ` · ${flight.duration}`}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 hover:bg-white/20 transition"
            aria-label="Fechar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-5 space-y-3">
          {segments.map((s, i) => (
            <div key={i}>
              <div className="rounded-xl border border-border p-4">
                <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span className="uppercase tracking-widest">Trecho {i + 1}</span>
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
                          <span className="text-muted-foreground"> · {formatFlightDate(s.depart_at)}</span>
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
                          <span className="text-muted-foreground"> · {formatFlightDate(s.arrive_at)}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              {i < segments.length - 1 && (
                <div className="my-2 flex items-center gap-2 pl-4 text-xs text-muted-foreground">
                  <Clock className="h-3.5 w-3.5 text-brand-orange" />
                  <span>
                    Conexão em <strong className="text-foreground">{s.to_iata ?? "—"}</strong>
                    {s.layover ? ` · ${s.layover}` : ""}
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
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

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium text-right">{value}</dd>
    </div>
  );
}

function InfoTile({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
        <Icon className="h-3.5 w-3.5 text-brand-orange" /> {label}
      </div>
      <div className="mt-1 font-semibold">{value}</div>
    </div>
  );
}
