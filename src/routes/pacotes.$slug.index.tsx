import { createFileRoute, Link, notFound, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Calendar as CalendarUI } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

import {
  MapPin,
  Plane,
  Calendar,
  Hotel,
  Check,
  ArrowLeft,
  AlertTriangle,

  ArrowRight,
  Star,
  MessageCircle,
  Eye,
  Coffee,
  Utensils,
  UtensilsCrossed,
  BedDouble,
  Bed,
  Sparkles,
  Crown,
  Home,
  DoorOpen,
  Ticket,
  Bus,
  Minus,
  Plus,
  ShieldCheck,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatBRL, formatDateBR, formatDateRange } from "@/lib/format";
import { customQuoteWhatsappUrl } from "@/lib/checkout-config";
import { ContactFooter } from "@/components/ContactFooter";
import { TopBar } from "@/components/TopBar";
import { FlightCard, type FlightInfo } from "@/components/FlightCard";
import { HotelDetailsDialog } from "@/components/HotelDetailsDialog";
import { WhatsAppText } from "@/lib/wa-format";

function cleanHotelDetail(value: string | null | undefined) {
  const cleaned = value
    ?.trim()
    .replace(/^(regime(?: de alimenta[cç][aã]o)?|tipo de cama|cama|tipo de quarto|quarto|categoria|vista)\s*:\s*/i, "")
    // remove jargão comercial de broker/operadora (Frete, Broker, Tarifa, Net, etc.)
    .replace(/\b(frete|broker|tarifa|net|pacote|comiss(?:ão|ao)|comission|comm|fee|markup|contratada?|contrato|revenda|operadora|distribui[çc][aã]o)\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s,;/|.\-–—]+|[\s,;/|.\-–—]+$/g, "")
    .trim();

  return cleaned && cleaned !== "—" ? cleaned : null;
}

function mealIcon(value: string): LucideIcon {
  const v = value.toLocaleLowerCase("pt-BR");
  if (/all\s*inclusive|tudo incluso|all in/.test(v)) return Utensils;
  if (/pens[aã]o completa|full board/.test(v)) return UtensilsCrossed;
  if (/meia pens[aã]o|half board/.test(v)) return UtensilsCrossed;
  if (/caf[eé]\s*da\s*manh[aã]|breakfast|bed\s*&?\s*breakfast|b&b/.test(v)) return Coffee;
  if (/almo[cç]o|jantar|refei[cç]|lunch|dinner/.test(v)) return Utensils;
  return Utensils;
}

function bedIcon(value: string): LucideIcon {
  const v = value.toLocaleLowerCase("pt-BR");
  if (/solteiro|single|individual/.test(v)) return Bed;
  return BedDouble;
}

function roomTypeIcon(value: string): LucideIcon {
  const v = value.toLocaleLowerCase("pt-BR");
  if (/su[ií]te|suite/.test(v)) return DoorOpen;
  return Home;
}

function roomCategoryIcon(value: string): LucideIcon {
  const v = value.toLocaleLowerCase("pt-BR");
  if (/vista|frente|mar|oceano|piscina|montanha|jardim|cidade/.test(v)) return Eye;
  if (/luxo|luxury|premium|deluxe|superior|master|presidencial/.test(v)) return Crown;
  return Sparkles;
}

export const Route = createFileRoute("/pacotes/$slug/")({
  validateSearch: (s: Record<string, unknown>) => ({
    preview: s.preview === "1" || s.preview === 1 || s.preview === true ? true : undefined,
  }),
  loader: async ({ params }) => {
    const slugs = params.slug.includes("#")
      ? [params.slug, params.slug.replace(/#/g, "-")]
      : [params.slug];
    const { data } = await supabase
      .from("packages")
      .select("title,destination,origin,summary,image_url,nights,price_per_person,base_occupancy")
      .in("slug", slugs)
      .eq("is_active", true)
      .maybeSingle();
    return { pkg: data };
  },
  head: ({ params, loaderData }) => {
    const url = `https://pedidos.viaair.tur.br/pacotes/${params.slug}`;
    const p = loaderData?.pkg;
    if (!p) {
      return {
        meta: [
          { title: "Pacote — Via Air" },
          { property: "og:url", content: url },
          { property: "og:type", content: "product" },
        ],
        links: [{ rel: "canonical", href: url }],
      };
    }
    const title = `${p.title} — ${p.destination} | Via Air`;
    const desc =
      p.summary?.slice(0, 155) ||
      `Pacote para ${p.destination}${p.origin ? ` saindo de ${p.origin}` : ""}${p.nights ? `, ${p.nights} noites` : ""}. Reserve com a Via Air.`;
    const img = p.image_url && /^https?:\/\//i.test(p.image_url) ? p.image_url : undefined;
    return {
      meta: [
        { title },
        { name: "description", content: desc },
        { property: "og:title", content: title },
        { property: "og:description", content: desc },
        { property: "og:type", content: "product" },
        { property: "og:url", content: url },
        ...(img
          ? [
              { property: "og:image", content: img },
              { property: "og:image:secure_url", content: img },
              { property: "og:image:width", content: "1200" },
              { property: "og:image:height", content: "630" },
              { property: "og:image:alt", content: p.title },
            ]
          : []),
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: desc },
        ...(img ? [{ name: "twitter:image", content: img }] : []),
      ],
      links: [{ rel: "canonical", href: url }],
    };
  },
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
  const { preview } = Route.useSearch();

  const { data: pkg, isLoading } = useQuery({
    queryKey: ["package", slug, preview ? "preview" : "public"],
    queryFn: async () => {
      const slugs = slug.includes("#") ? [slug, slug.replace(/#/g, "-")] : [slug];
      let query = supabase.from("packages").select("id,slug,title,destination,origin,going_date,return_date,nights,price_per_person,taxes,image_url,summary,itinerary,includes,hotel_name,hotel_stars,meal_plan,room_type,room_category,bed_type,is_active,sort_order,base_occupancy,outbound_flight,return_flight,created_at,updated_at,tripadvisor_location_id,tripadvisor_url,tripadvisor_address,tripadvisor_photos,kind,pricing_mode,date_mode,services").in("slug", slugs);
      if (!preview) query = query.eq("is_active", true);
      const { data, error } = await query.maybeSingle();
      if (error) throw error;
      if (!data) throw notFound();
      return data;
    },
  });

  const [hotelDialogOpen, setHotelDialogOpen] = useState(false);
  const [dialogPhotoIndex, setDialogPhotoIndex] = useState(0);

  if (isLoading || !pkg) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        Carregando…
      </div>
    );
  }

  const baseOccupancy = pkg.base_occupancy ?? 2;
  const isTicket = (pkg as any).kind === "service";
  const isPerUnit = (pkg as any).pricing_mode === "per_unit";
  const isFlexibleDate = (pkg as any).date_mode === "flexible";
  const eventDateLabel = isFlexibleDate
    ? "Data à escolher"
    : pkg.going_date
      ? formatDateBR(pkg.going_date)
      : null;

  const hotelDetails = Array.from(
    new Map(
      [
        { value: cleanHotelDetail(pkg.meal_plan), icon: null as LucideIcon | null, resolve: mealIcon },
        { value: cleanHotelDetail(pkg.bed_type), icon: null as LucideIcon | null, resolve: bedIcon },
        { value: cleanHotelDetail(pkg.room_type), icon: null as LucideIcon | null, resolve: roomTypeIcon },
        { value: cleanHotelDetail(pkg.room_category), icon: null as LucideIcon | null, resolve: roomCategoryIcon },
      ]
        .filter((detail): detail is { value: string; icon: LucideIcon | null; resolve: (v: string) => LucideIcon } => Boolean(detail.value))
        .map((detail) => [detail.value.toLocaleLowerCase("pt-BR"), { value: detail.value, icon: detail.icon ?? detail.resolve(detail.value) }]),
    ).values(),
  );

  if (isTicket) {
    return <TicketDetailsView pkg={pkg} eventDateLabel={eventDateLabel} />;
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <TopBar backTo="/pacotes" backLabel="Todos os pacotes" />

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

            {!isTicket && pkg.origin && (
              <InfoTile icon={Plane} label="Saindo de" value={pkg.origin} />
            )}
            <InfoTile
              icon={Calendar}
              label={isTicket ? "Data do evento" : "Período"}
              value={
                isTicket
                  ? eventDateLabel ?? "—"
                  : formatDateRange(pkg.going_date, pkg.return_date)
              }
            />
            {!isTicket && pkg.nights != null && (
              <InfoTile icon={Calendar} label="Duração" value={`${pkg.nights} noites`} />
            )}
          </section>

          {pkg.summary && (
            <section>
              <h2 className="text-xl font-semibold">Sobre o pacote</h2>
              <p className="mt-3 text-muted-foreground leading-relaxed whitespace-pre-line">{pkg.summary}</p>
            </section>
          )}

          {pkg.itinerary && (
            <section>
              <h2 className="text-xl font-semibold">Roteiro</h2>
              <WhatsAppText className="mt-3">{pkg.itinerary}</WhatsAppText>
            </section>
          )}

          {pkg.hotel_name && (
            <section className="rounded-2xl border border-border bg-card p-6">
              <div className="flex items-start gap-4">
                <div className="h-11 w-11 rounded-xl bg-muted/50 border border-border flex items-center justify-center shrink-0">
                  <Hotel className="h-5 w-5 text-brand-orange" />
                </div>
                <div className="flex-1 min-w-0">
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
                  {(pkg as unknown as { tripadvisor_address?: string | null }).tripadvisor_address && (
                    <div className="mt-1 text-xs text-muted-foreground flex items-start gap-1.5">
                      <MapPin className="h-3.5 w-3.5 text-brand-orange mt-0.5 shrink-0" />
                      <span>{(pkg as unknown as { tripadvisor_address: string }).tripadvisor_address}</span>
                    </div>
                  )}
                  {hotelDetails.length > 0 && (
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      {hotelDetails.map(({ value, icon: DetailIcon }) => (
                        <span
                          key={value}
                          className="inline-flex items-center gap-1.5 rounded-full border border-brand-orange/40 bg-brand-orange/10 px-2.5 py-1 text-xs text-brand-orange"
                        >
                          <DetailIcon className="h-3.5 w-3.5" />
                          {value}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {(() => {
                const photos = ((pkg as unknown as { tripadvisor_photos?: string[] | null }).tripadvisor_photos) ?? [];
                const taUrl = (pkg as unknown as { tripadvisor_url?: string | null }).tripadvisor_url ?? null;
                const taId = (pkg as unknown as { tripadvisor_location_id?: number | null }).tripadvisor_location_id ?? null;
                if (photos.length === 0 && !taUrl) return null;
                return (
                  <div className="mt-4">
                    {photos.length > 0 && (
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {photos.slice(0, 4).map((src, i) => (
                          <button
                            type="button"
                            key={i}
                            onClick={() => {
                              if (taId) {
                                setDialogPhotoIndex(i);
                                setHotelDialogOpen(true);
                              } else if (taUrl) {
                                window.open(taUrl, "_blank", "noreferrer");
                              }
                            }}
                            className="relative aspect-[4/3] overflow-hidden rounded-lg border border-border group cursor-pointer"
                          >
                            <img
                              src={src}
                              alt={`${pkg.hotel_name} — foto ${i + 1}`}
                              loading="lazy"
                              className="absolute inset-0 h-full w-full object-cover group-hover:scale-105 transition"
                            />
                          </button>
                        ))}
                      </div>
                    )}
                    <div className="mt-3 flex justify-end">
                      {taId ? (
                        <button
                          type="button"
                          onClick={() => {
                            setDialogPhotoIndex(0);
                            setHotelDialogOpen(true);
                          }}
                          className="inline-flex items-center gap-1.5 rounded-full border border-brand-orange/40 bg-brand-orange/10 px-3 py-1.5 text-xs font-medium text-brand-orange hover:bg-brand-orange/20 transition"
                        >
                          Ver fotos e avaliações <ArrowRight className="h-3.5 w-3.5" />
                        </button>
                      ) : taUrl ? (
                        <a
                          href={taUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-full border border-brand-orange/40 bg-brand-orange/10 px-3 py-1.5 text-xs font-medium text-brand-orange hover:bg-brand-orange/20 transition"
                        >
                          Ver mais <ArrowRight className="h-3.5 w-3.5" />
                        </a>
                      ) : null}
                    </div>
                  </div>
                );
              })()}
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
            <div className="text-xs text-muted-foreground">
              {isPerUnit
                ? "Preço por ingresso"
                : `Preço para ${baseOccupancy === 1 ? "1 pessoa" : `${baseOccupancy} pessoas`}`}
            </div>
            <div className="mt-1 text-3xl font-display font-bold text-brand-orange">
              {formatBRL(Number(pkg.price_per_person) * (isPerUnit ? 1 : baseOccupancy))}
            </div>
            {pkg.taxes ? (
              <div className="text-xs text-muted-foreground mt-1">
                Já com as taxas inclusas de {formatBRL(Number(pkg.taxes))}
              </div>
            ) : null}

            <dl className="mt-6 space-y-3 text-sm">
              <Row label="Destino" value={pkg.destination} />
              {isTicket ? (
                eventDateLabel && <Row label="Data do evento" value={eventDateLabel} />
              ) : (
                <>
                  {pkg.origin && <Row label="Origem" value={pkg.origin} />}
                  {pkg.going_date && <Row label="Ida" value={formatDateBR(pkg.going_date)} />}
                  {pkg.return_date && <Row label="Volta" value={formatDateBR(pkg.return_date)} />}
                  {pkg.nights != null && <Row label="Noites" value={String(pkg.nights)} />}
                </>
              )}
            </dl>

            {!isPerUnit && (
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
            )}

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
            {!isTicket && (
              <div className="mt-4 rounded-xl border border-border bg-muted/30 p-3 text-[11px] text-muted-foreground leading-relaxed">
                <span className="text-foreground font-medium">Também parcelamos no boleto bancário.</span>{" "}
                Essa modalidade não é finalizada de forma online — a solicitação é feita diretamente com nosso consultor{" "}
                <a
                  href={customQuoteWhatsappUrl(pkg.title)}
                  target="_blank"
                  rel="noreferrer"
                  className="text-brand-orange hover:underline font-medium"
                >
                  pelo WhatsApp
                </a>
                .
              </div>
            )}
            <p className="mt-3 text-[10px] text-muted-foreground text-center">
              Sujeito à disponibilidade de voos e hospedagem.
            </p>
          </div>
        </aside>
      </div>
      <ContactFooter whatsappMessage={`Olá! Tenho interesse no pacote e quero mais informações.`} />
      {(() => {
        const taId = (pkg as unknown as { tripadvisor_location_id?: number | null }).tripadvisor_location_id ?? null;
        const photos = ((pkg as unknown as { tripadvisor_photos?: string[] | null }).tripadvisor_photos) ?? [];
        if (!taId) return null;
        return (
          <HotelDetailsDialog
            open={hotelDialogOpen}
            onOpenChange={setHotelDialogOpen}
            locationId={taId}
            hotelName={pkg.hotel_name ?? ""}
            fallbackPhotos={photos}
            initialPhotoIndex={dialogPhotoIndex}
          />
        );
      })()}
    </div>
  );
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

// ---------------------------------------------------------------------------
// Ticket / event detail view (kind === "service")
// ---------------------------------------------------------------------------

const MONTHS_ABBR = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];
const WEEK_ABBR = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];

function parseEventDate(iso: string | null | undefined) {
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  return {
    day: String(d).padStart(2, "0"),
    month: MONTHS_ABBR[m - 1],
    year: String(y),
    dow: WEEK_ABBR[date.getUTCDay()],
  };
}

function chipIconForInclude(text: string): LucideIcon {
  const v = text.toLocaleLowerCase("pt-BR");
  if (/transfer|traslado|van|\btransporte\b/.test(v)) return Bus;
  if (/seguro/.test(v)) return ShieldCheck;
  if (/hotel|hosped|pousada|resort/.test(v)) return Hotel;
  if (/ingresso|entrada|acesso|pulseira|credencial/.test(v)) return Ticket;
  if (/embarque|ponto de encontro/.test(v)) return MapPin;
  return Check;
}

function TicketDetailsView({
  pkg,
  eventDateLabel,
}: {
  pkg: any;
  eventDateLabel: string | null;
}) {
  const services = (pkg.services ?? {}) as any;
  const transferSvc = services.transfer ?? {};
  const insuranceSvc = services.insurance ?? {};
  const pickupPoints: string[] = Array.isArray(transferSvc?.pickup_points)
    ? transferSvc.pickup_points.filter((s: any) => typeof s === "string" && s.trim())
    : typeof transferSvc?.pickup_points === "string"
      ? String(transferSvc.pickup_points)
          .split(/\r?\n/)
          .map((s) => s.trim())
          .filter(Boolean)
      : [];

  const dateBlock = parseEventDate(pkg.going_date);
  const price = Number(pkg.price_per_person) || 0;
  const includes: string[] = Array.isArray(pkg.includes) ? pkg.includes : [];

  const [qty, setQty] = useState(1);
  const maxUnits = Math.max(1, Math.min(9, Number(pkg.max_units) || 9));
  const isFlexibleDate = pkg?.date_mode === "flexible";
  const rawAddons: any[] = Array.isArray(services?.addons) ? services.addons : [];
  const hasAddons = rawAddons.some(
    (a) => a && a.name && (Number(a.price) > 0 || (a.price_by_weekday ?? []).some((t: any) => Number(t?.price) > 0)),
  );
  const [preOpen, setPreOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <TopBar backTo="/ingressos" backLabel="Todos os ingressos" />

      <div className="mx-auto max-w-6xl w-full px-4 md:px-6 py-8 md:py-12 flex flex-col lg:flex-row gap-8">
        {/* Main column */}
        <div className="flex-1 space-y-10 min-w-0">
          {/* Hero split */}
          <div className="relative bg-card rounded-3xl overflow-hidden border border-border shadow-[var(--shadow-card)]">
            <div className="flex flex-col md:flex-row">
              <div className="md:w-1/2 relative min-h-[280px] md:min-h-[380px]">
                {pkg.image_url && (
                  <img
                    src={pkg.image_url}
                    alt={pkg.title}
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent md:bg-gradient-to-r md:from-transparent md:to-card/40" />
                <div className="absolute top-5 left-5 flex flex-wrap gap-2">
                  <span className="inline-flex items-center gap-1.5 bg-brand-orange text-primary-foreground text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-widest shadow-lg">
                    <Ticket className="h-3 w-3" /> Ingresso
                  </span>
                  {pkg.destination && (
                    <span className="inline-flex items-center gap-1.5 bg-black/60 backdrop-blur-md text-white text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-widest border border-white/10">
                      <MapPin className="h-3 w-3" /> {pkg.destination}
                    </span>
                  )}
                </div>
                {dateBlock && (
                  <div className="absolute bottom-5 left-5 bg-card border border-border p-3 rounded-xl flex flex-col items-center min-w-[92px] shadow-2xl">
                    <span className="text-brand-orange text-[10px] font-extrabold uppercase tracking-widest">
                      {dateBlock.dow}
                    </span>
                    <span className="font-display text-3xl font-black leading-none my-1">
                      {dateBlock.day}
                    </span>
                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-tighter">
                      {dateBlock.month} / {dateBlock.year}
                    </span>
                  </div>
                )}
              </div>

              <div className="md:w-1/2 p-7 md:p-10 flex flex-col justify-center">
                <h1 className="font-display text-3xl md:text-4xl font-extrabold leading-tight mb-4">
                  {pkg.title}
                </h1>
                {/* resumo removido — aparece apenas em "Sobre o ingresso" */}

                <div className="flex flex-wrap gap-2">
                  {eventDateLabel && (
                    <div className="bg-muted/40 border border-border px-3 py-2 rounded-xl flex items-center gap-2 text-xs font-semibold">
                      <Calendar className="h-4 w-4 text-brand-orange" />
                      {eventDateLabel}
                    </div>
                  )}
                  {pkg.destination && (
                    <div className="bg-muted/40 border border-border px-3 py-2 rounded-xl flex items-center gap-2 text-xs font-semibold">
                      <MapPin className="h-4 w-4 text-brand-orange" />
                      {pkg.destination}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Sobre o ingresso */}
          {pkg.summary && (
            <section>
              <SectionHeader>Sobre o ingresso</SectionHeader>
              <p className="text-muted-foreground leading-relaxed whitespace-pre-line">{pkg.summary}</p>
            </section>
          )}

          {/* O que está incluso */}
          {includes.length > 0 && (
            <section>
              <SectionHeader>O que está incluso</SectionHeader>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {includes.map((item) => {
                  const Icon = chipIconForInclude(item);
                  return (
                    <div
                      key={item}
                      className="bg-card p-4 rounded-2xl border border-border flex items-start gap-3"
                    >
                      <div className="w-10 h-10 rounded-xl bg-brand-orange/10 flex items-center justify-center text-brand-orange shrink-0">
                        <Icon className="w-5 h-5" />
                      </div>
                      <div className="text-sm font-medium leading-snug pt-1.5">
                        {item}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Ponto de encontro / Transfer */}
          {(pickupPoints.length > 0 || pkg.itinerary || transferSvc?.enabled) && (
            <section>
              <SectionHeader>Detalhes do serviço</SectionHeader>
              <div className="bg-card border border-border rounded-3xl p-6 md:p-8 space-y-6">
                {pickupPoints.length > 0 && (
                  <div>
                    <h3 className="text-sm font-black uppercase tracking-widest text-muted-foreground mb-3">
                      Locais de embarque
                    </h3>
                    <ul className="grid sm:grid-cols-2 gap-2">
                      {pickupPoints.map((point) => (
                        <li
                          key={point}
                          className="flex items-start gap-3 text-sm bg-muted/30 border border-border rounded-xl px-3 py-2.5"
                        >
                          <MapPin className="h-4 w-4 mt-0.5 text-brand-orange shrink-0" />
                          <span>{point}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {pkg.itinerary && (
                  <div>
                    <h3 className="text-sm font-black uppercase tracking-widest text-muted-foreground mb-3">
                      Detalhes do serviço
                    </h3>
                    <WhatsAppText className="text-sm text-muted-foreground leading-relaxed">
                      {pkg.itinerary}
                    </WhatsAppText>
                  </div>
                )}
              </div>
            </section>
          )}

          {insuranceSvc?.enabled && (
            <section>
              <SectionHeader>Seguro incluso</SectionHeader>
              <div className="bg-card border border-border rounded-2xl p-5 flex items-start gap-4">
                <div className="w-11 h-11 rounded-xl bg-brand-orange/10 flex items-center justify-center text-brand-orange shrink-0">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <div className="text-sm">
                  <p className="font-semibold">Seguro de eventos</p>
                  {insuranceSvc?.coverage && (
                    <p className="text-muted-foreground mt-1">
                      Cobertura: {insuranceSvc.coverage}
                    </p>
                  )}
                </div>
              </div>
            </section>
          )}
        </div>

        {/* Reservation sidebar */}
        <aside className="lg:w-[380px] shrink-0">
          <div className="lg:sticky lg:top-6 bg-card border border-border p-7 md:p-8 rounded-[2rem] shadow-[var(--shadow-card)]">
            <div className="mb-6">
              <p className="text-muted-foreground text-[10px] font-black uppercase tracking-[0.2em] mb-2">
                Preço por ingresso
              </p>
              <div className="flex items-baseline gap-2">
                <span className="text-brand-orange text-2xl font-bold">R$</span>
                <span className="font-display text-4xl md:text-5xl font-black">
                  {price.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
              {eventDateLabel && (
                <div className="mt-3 inline-flex items-center gap-1.5 bg-brand-orange/10 text-brand-orange text-[10px] font-bold px-2.5 py-1 rounded uppercase tracking-wider">
                  <Calendar className="h-3 w-3" /> {eventDateLabel}
                </div>
              )}
            </div>

            <div className="space-y-3">
              <label className="text-[10px] font-black text-foreground uppercase tracking-widest block">
                Quantidade
              </label>
              <div className="flex items-center justify-between bg-muted/40 border border-border p-2 rounded-2xl">
                <button
                  type="button"
                  onClick={() => setQty((n) => Math.max(1, n - 1))}
                  disabled={qty <= 1}
                  className="w-11 h-11 flex items-center justify-center bg-background hover:bg-muted rounded-xl transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  aria-label="Diminuir quantidade"
                >
                  <Minus className="w-4 h-4" />
                </button>
                <span className="font-display text-2xl font-black tabular-nums">
                  {String(qty).padStart(2, "0")}
                </span>
                <button
                  type="button"
                  onClick={() => setQty((n) => Math.min(maxUnits, n + 1))}
                  disabled={qty >= maxUnits}
                  className="w-11 h-11 flex items-center justify-center bg-brand-orange text-primary-foreground hover:opacity-90 rounded-xl transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  aria-label="Aumentar quantidade"
                >
                  <Plus className="w-4 h-4" />
                </button>

              </div>
              <p className="text-[11px] text-muted-foreground text-center">
                Total: <strong className="text-foreground">{(price * qty).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</strong>
              </p>
              {qty >= maxUnits && (
                <div className="mt-2 flex items-start gap-2 rounded-xl border border-yellow-500/40 bg-yellow-500/10 px-3 py-2 text-[11px] text-yellow-200">
                  <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  <span>Limite por pedido — para mais, faça um novo pedido.</span>
                </div>
              )}

            </div>

            {isFlexibleDate || hasAddons ? (
              <button
                type="button"
                onClick={() => setPreOpen(true)}
                className="mt-6 inline-flex w-full items-center justify-center gap-3 rounded-2xl bg-brand-orange px-6 py-4 font-bold uppercase tracking-widest text-sm text-primary-foreground shadow-[var(--shadow-glow)] hover:opacity-90 transition group"
              >
                Reservar agora
                <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
              </button>
            ) : (
              <Link
                to="/pacotes/$slug/checkout"
                params={{ slug: pkg.slug }}
                search={{ qty }}
                className="mt-6 inline-flex w-full items-center justify-center gap-3 rounded-2xl bg-brand-orange px-6 py-4 font-bold uppercase tracking-widest text-sm text-primary-foreground shadow-[var(--shadow-glow)] hover:opacity-90 transition group"
              >
                Reservar agora
                <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
              </Link>
            )}

            <p className="mt-3 text-[11px] text-muted-foreground text-center leading-relaxed">
              Você preenche seus dados e finaliza o pagamento na próxima etapa.
            </p>

            <p className="mt-4 pt-4 border-t border-border text-[11px] text-muted-foreground/80 text-center">
              Sujeito à disponibilidade.
            </p>

          </div>
        </aside>
      </div>

      <PreCheckoutDialog
        open={preOpen}
        onOpenChange={setPreOpen}
        pkg={pkg}
        qty={qty}
        basePrice={price}
        isFlexibleDate={isFlexibleDate}
        rawAddons={rawAddons}
      />

      <ContactFooter whatsappMessage={`Olá! Tenho interesse no ingresso ${pkg.title} e quero mais informações.`} />
    </div>
  );
}

function PreCheckoutDialog({
  open,
  onOpenChange,
  pkg,
  qty,
  basePrice,
  isFlexibleDate,
  rawAddons,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  pkg: any;
  qty: number;
  basePrice: number;
  isFlexibleDate: boolean;
  rawAddons: any[];
}) {
  const navigate = useNavigate();
  const [date, setDate] = useState<string>(isFlexibleDate ? "" : (pkg.going_date ?? ""));
  const [selected, setSelected] = useState<Record<string, boolean>>({});

  const weekday = useMemo<number | null>(() => {
    const raw = date || pkg?.going_date || "";
    const m = String(raw).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return null;
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getDay();
  }, [date, pkg]);

  const addons = useMemo(() => {
    return rawAddons
      .filter((a: any) => {
        if (!a || !a.name) return false;
        const tiers = (a.price_by_weekday ?? []) as any[];
        return Number(a.price) > 0 || tiers.some((t) => Number(t?.price) > 0);
      })
      .map((a: any, i: number) => {
        const tiers = (a.price_by_weekday ?? []) as any[];
        const tier =
          weekday != null
            ? tiers.find((t: any) => (t.days ?? []).includes(weekday))
            : null;
        // Preço assumido quando a data ainda não foi escolhida:
        // usa o preço base se >0, senão o menor preço configurado nas faixas.
        const tierPrices = tiers.map((t) => Number(t?.price)).filter((n) => n > 0);
        const assumed = Number(a.price) > 0 ? Number(a.price) : (tierPrices.length ? Math.min(...tierPrices) : 0);
        const price = tier ? Number(tier.price) : assumed;
        return {
          ...a,
          key: a.id || `${a.name}-${i}`,
          per: (a.per ?? "unit") as "unit" | "order",
          price,
          tierLabel: tier?.label ?? null,
          hasWeekdayPricing: tiers.length > 0,
          assumedFromMin: !tier && Number(a.price) <= 0 && tierPrices.length > 0,
        };
      });
  }, [rawAddons, weekday]);

  const addonsTotal = useMemo(() => {
    return addons.reduce((sum, a) => {
      if (!selected[a.key]) return sum;
      const units = a.per === "order" ? 1 : Math.max(1, qty);
      return sum + a.price * units;
    }, 0);
  }, [addons, selected, qty]);

  const total = basePrice * qty + addonsTotal;
  const canContinue = !isFlexibleDate || !!date;

  function handleContinue() {
    if (isFlexibleDate && !date) {
      toast.error("Escolha uma data para continuar");
      return;
    }
    const selectedKeys = Object.entries(selected).filter(([, v]) => v).map(([k]) => k);
    navigate({
      to: "/pacotes/$slug/checkout",
      params: { slug: pkg.slug },
      search: {
        qty,
        ...(date ? { date } : {}),
        ...(selectedKeys.length ? { addons: selectedKeys.join(",") } : {}),
      },
    });
  }

  const hasAddons = addons.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">
            Escolha sua data{hasAddons ? " e adicionais" : ""}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2 max-h-[60vh] overflow-y-auto">
          {isFlexibleDate && (
            <div className="space-y-2">
              <label className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">
                Data desejada
              </label>
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className={cn(
                      "w-full flex items-center justify-between rounded-xl border border-border bg-background px-4 py-3 text-sm text-left hover:border-brand-orange/60 transition",
                      !date && "text-muted-foreground",
                    )}
                  >
                    <span className="inline-flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-brand-orange" />
                      {date
                        ? format(new Date(date + "T00:00:00"), "PPP", { locale: ptBR })
                        : "Selecione uma data"}
                    </span>
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarUI
                    mode="single"
                    locale={ptBR}
                    selected={date ? new Date(date + "T00:00:00") : undefined}
                    onSelect={(d) => {
                      if (!d) return;
                      const y = d.getFullYear();
                      const m = String(d.getMonth() + 1).padStart(2, "0");
                      const day = String(d.getDate()).padStart(2, "0");
                      setDate(`${y}-${m}-${day}`);
                    }}
                    disabled={{ before: new Date() }}
                    initialFocus
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
            </div>
          )}

          {hasAddons && (
            <div className="space-y-2">
              <label className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">
                Serviços adicionais (opcional)
              </label>
              <div className="space-y-2">
                {addons.map((a) => {
                  const isSel = !!selected[a.key];
                  const units = a.per === "order" ? 1 : Math.max(1, qty);
                  const line = a.price * units;
                  const priceIsAssumed = a.hasWeekdayPricing && weekday == null;
                  return (
                    <button
                      key={a.key}
                      type="button"
                      onClick={() => setSelected((s) => ({ ...s, [a.key]: !s[a.key] }))}
                      className={`w-full text-left rounded-2xl border p-4 transition ${
                        isSel
                          ? "border-brand-orange bg-brand-orange/5"
                          : "border-border bg-card hover:border-brand-orange/40"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-semibold text-sm">{a.name}</div>
                          {a.description && (
                            <div className="text-xs text-muted-foreground mt-0.5">{a.description}</div>
                          )}
                          {a.tierLabel && (
                            <div className="mt-1 inline-block text-[10px] font-bold uppercase tracking-wider text-brand-orange">
                              {a.tierLabel}
                            </div>
                          )}
                          {priceIsAssumed && (
                            <div className="mt-1 text-[10px] text-muted-foreground">
                              O valor final depende do dia da semana escolhido.
                            </div>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <div className="font-bold text-sm">
                            {priceIsAssumed && <span className="text-[10px] font-normal text-muted-foreground mr-1">a partir de</span>}
                            {formatBRL(line)}
                          </div>
                          <div className="text-[10px] text-muted-foreground">
                            {a.per === "order" ? "por reserva" : `${formatBRL(a.price)} × ${units}`}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="border-t border-border pt-4 flex items-center justify-between">
            <span className="text-xs uppercase tracking-widest text-muted-foreground font-bold">
              Total estimado
            </span>
            <span className="font-display text-2xl font-black text-brand-orange">
              {formatBRL(total)}
            </span>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Voltar
          </Button>
          <Button
            onClick={handleContinue}
            disabled={!canContinue}
            className="bg-brand-orange text-primary-foreground hover:opacity-90"
          >
            Continuar para checkout <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-4 mb-5">
      <h2 className="text-brand-orange text-sm font-black uppercase tracking-[0.3em]">
        {children}
      </h2>
      <div className="h-px flex-1 bg-gradient-to-r from-brand-orange/30 to-transparent" />
    </div>
  );
}
