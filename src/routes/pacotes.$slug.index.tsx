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
  ChevronLeft,
  ChevronRight,
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
  Calendar as CalendarIcon,
  Check,
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

function CalendarMonthNav({
  children,
  maxMonth,
}: {
  children: (month: Date, setMonth: (d: Date) => void) => React.ReactNode;
  maxMonth?: Date;
}) {
  const [month, setMonth] = useState<Date>(() => {
    const d = new Date();
    d.setDate(1);
    return d;
  });
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(1);
    return d;
  }, []);
  const canGoBack =
    month.getFullYear() > today.getFullYear() ||
    (month.getFullYear() === today.getFullYear() && month.getMonth() > today.getMonth());
  const canGoForward =
    !maxMonth ||
    month.getFullYear() < maxMonth.getFullYear() ||
    (month.getFullYear() === maxMonth.getFullYear() && month.getMonth() < maxMonth.getMonth());
  const go = (delta: number) => {
    const next = new Date(month);
    next.setMonth(next.getMonth() + delta);
    setMonth(next);
  };
  return (
    <div className="relative w-full">
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex h-[--cell-size] items-center justify-between">
        <Button
          type="button"
          variant="default"
          size="icon"
          className="pointer-events-auto h-10 w-10 rounded-full shadow-md"
          onClick={() => go(-1)}
          disabled={!canGoBack}
          aria-label="Mês anterior"
          title="Mês anterior"
        >
          <ChevronLeft className="h-6 w-6" strokeWidth={3} />
        </Button>
        <Button
          type="button"
          variant="default"
          size="icon"
          className="pointer-events-auto h-10 w-10 rounded-full shadow-md"
          onClick={() => go(1)}
          disabled={!canGoForward}
          aria-label="Próximo mês"
          title="Próximo mês"
        >
          <ChevronRight className="h-6 w-6" strokeWidth={3} />
        </Button>
      </div>
      {children(month, setMonth)}
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
  const [addonDates, setAddonDates] = useState<Record<string, string>>({});
  const [activeDateKey, setActiveDateKey] = useState<string>("__pkg");
  const [stepIdx, setStepIdx] = useState(0);


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
        const subs = (a.sub_options ?? []) as any[];
        const hasSubPrice = subs.some((s) => Number(s?.price) > 0);
        return Number(a.price) > 0 || tiers.some((t) => Number(t?.price) > 0) || hasSubPrice;
      })
      .map((a: any, i: number) => {
        const key = a.id || `${a.name}-${i}`;
        const tiers = (a.price_by_weekday ?? []) as any[];
        const addonDateStr = addonDates[key] || date || pkg?.going_date || "";
        const m = String(addonDateStr).match(/^(\d{4})-(\d{2})-(\d{2})/);
        const wd = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getDay() : null;
        const tier = wd != null ? tiers.find((t: any) => (t.days ?? []).includes(wd)) : null;
        const tierPrices = tiers.map((t) => Number(t?.price)).filter((n) => n > 0);
        const assumed = Number(a.price) > 0 ? Number(a.price) : (tierPrices.length ? Math.min(...tierPrices) : 0);
        const price = tier ? Number(tier.price) : assumed;
        const subs = ((a.sub_options ?? []) as any[])
          .filter((s) => s && s.name && Number(s.price) >= 0)
          .map((s, j) => ({
            ...s,
            key: `${key}::${s.id || `${s.name}-${j}`}`,
            price: Number(s.price) || 0,
            per: (s.per ?? "unit") as "unit" | "order",
          }));
        return {
          ...a,
          key,
          per: (a.per ?? "unit") as "unit" | "order",
          price,
          tierLabel: tier?.label ?? null,
          hasWeekdayPricing: tiers.length > 0,
          assumedFromMin: !tier && Number(a.price) <= 0 && tierPrices.length > 0,
          addonDate: addonDates[key] || "",
          subs,
        };
      })
      .sort((a: any, b: any) => (b.recommended ? 1 : 0) - (a.recommended ? 1 : 0));
  }, [rawAddons, weekday, addonDates, date, pkg]);


  const addonsTotal = useMemo(() => {
    return addons.reduce((sum, a) => {
      if (!selected[a.key]) return sum;
      const units = a.per === "order" ? 1 : Math.max(1, qty);
      let s = sum + a.price * units;
      for (const sub of a.subs) {
        if (!selected[sub.key]) continue;
        const subUnits = sub.per === "order" ? 1 : Math.max(1, qty);
        s += sub.price * subUnits;
      }
      return s;
    }, 0);
  }, [addons, selected, qty]);

  const total = basePrice * qty + addonsTotal;

  const hasAddons = addons.length > 0;
  const selectedAddons = useMemo(() => addons.filter((a) => selected[a.key]), [addons, selected]);
  const hasSubs = selectedAddons.some((a) => a.subs.length > 0);
  const anySelectedNeedsDate = selectedAddons.length > 0;
  const showDateStep = isFlexibleDate || anySelectedNeedsDate;


  // Build step flow dynamically
  const steps = useMemo(() => {
    const list: { id: "addons" | "date" | "subs" | "summary"; label: string }[] = [];
    if (hasAddons) list.push({ id: "addons", label: "Opcionais" });
    if (showDateStep) list.push({ id: "date", label: "Datas" });
    if (hasSubs) list.push({ id: "subs", label: "Extras" });
    list.push({ id: "summary", label: "Resumo" });
    return list;
  }, [hasAddons, showDateStep, hasSubs]);

  const currentStep = steps[Math.min(stepIdx, steps.length - 1)]?.id ?? "summary";
  const isFirstStep = stepIdx === 0;
  const isLastStep = stepIdx >= steps.length - 1;

  const missingAddonDates = useMemo(
    () => selectedAddons.filter((a) => !addonDates[a.key]),
    [selectedAddons, addonDates],
  );

  const canAdvance = useMemo(() => {
    if (currentStep === "date") {
      if (isFlexibleDate && !date) return false;
      if (missingAddonDates.length > 0) return false;
    }
    return true;
  }, [currentStep, date, isFlexibleDate, missingAddonDates]);

  function handleNext() {
    if (currentStep === "date") {
      if (isFlexibleDate && !date) {
        toast.error("Escolha a data do pacote");
        return;
      }
      if (missingAddonDates.length > 0) {
        toast.error("Escolha a data de cada adicional", {
          description: missingAddonDates.map((a) => a.name).join(", "),
        });
        return;
      }
    }
    setStepIdx((i) => Math.min(i + 1, steps.length - 1));
  }
  function handleBack() {
    setStepIdx((i) => Math.max(i - 1, 0));
  }

  function handleContinue() {
    if (isFlexibleDate && !date) {
      toast.error("Escolha uma data para continuar");
      return;
    }
    const missing = selectedAddons.filter((a) => !addonDates[a.key]);
    if (missing.length > 0) {
      toast.error("Escolha a data de cada adicional", {
        description: missing.map((a) => a.name).join(", "),
      });
      return;
    }
    const selectedKeys: string[] = [];
    const datePairs: string[] = [];
    for (const a of addons) {
      if (!selected[a.key]) continue;
      selectedKeys.push(a.key);
      if (addonDates[a.key]) datePairs.push(`${a.key}:${addonDates[a.key]}`);
      for (const sub of a.subs) {
        if (selected[sub.key]) selectedKeys.push(sub.key);
      }
    }
    navigate({
      to: "/pacotes/$slug/checkout",
      params: { slug: pkg.slug },
      search: {
        qty,
        ...(date ? { date } : {}),
        ...(selectedKeys.length ? { addons: selectedKeys.join(",") } : {}),
        ...(datePairs.length ? { addonDates: datePairs.join(",") } : {}),
      },
    });
  }


  const weekdayShortName = useMemo(() => {
    if (weekday == null) return null;
    return ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"][weekday];
  }, [weekday]);

  const selectedCount = Object.values(selected).filter(Boolean).length;

  const pickIcon = (name: string): LucideIcon => {
    const n = name.toLowerCase();
    if (/express|fura|fast|skip|vip|priorit/.test(n)) return Zap;
    if (/refei|meal|almo|jant|food|bebid/.test(n)) return Utensils;
    if (/transfer|traslado|bus|van/.test(n)) return Bus;
    if (/hotel|quarto|cama|room/.test(n)) return BedDouble;
    if (/seguro|shield|proteç/.test(n)) return ShieldCheck;
    return Sparkles;
  };

  const isPackageKind = (pkg?.kind ?? "package") === "package";

  // Non-package (ingressos, cruzeiros, serviços): manter dialog simples (sem wizard)
  if (!isPackageKind) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="w-[calc(100vw-2rem)] sm:w-full max-w-4xl p-0 gap-0 overflow-hidden border-border bg-card/80 backdrop-blur-2xl shadow-2xl rounded-3xl flex flex-col max-h-[92vh]">
          <div className="px-6 py-5 shrink-0 border-b border-border/60">
            <DialogHeader className="text-left space-y-1">
              <DialogTitle className="font-display text-xl leading-tight tracking-tight">
                Escolha sua data{hasAddons ? " e adicionais" : ""}
              </DialogTitle>
              <p className="text-sm text-muted-foreground">Personalize sua experiência para o dia da visita</p>
            </DialogHeader>
          </div>

          <div className={cn("flex-1 overflow-y-auto grid grid-cols-1", isFlexibleDate && hasAddons ? "lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-border/60" : "")}>
            {isFlexibleDate && (
              <div className="p-6 lg:p-8 flex flex-col">
                {(() => {
                  const today = new Date();
                  today.setHours(0, 0, 0, 0);
                  const maxDate = new Date(today);
                  maxDate.setMonth(maxDate.getMonth() + 11);
                  return (
                    <CalendarMonthNav>
                      {(month, setMonth) => (
                        <CalendarUI
                          mode="single"
                          locale={ptBR}
                          month={month}
                          onMonthChange={setMonth}
                          selected={date ? new Date(date + "T00:00:00") : undefined}
                          onDayClick={(d, mods) => {
                            if (mods?.disabled) return;
                            if (d > maxDate) {
                              toast.error("Data indisponível", { description: "Só aceitamos reservas com até 11 meses de antecedência." });
                              return;
                            }
                            const y = d.getFullYear();
                            const m = String(d.getMonth() + 1).padStart(2, "0");
                            const day = String(d.getDate()).padStart(2, "0");
                            setDate(`${y}-${m}-${day}`);
                          }}
                          disabled={{ before: new Date() }}
                          modifiers={{ tooFar: { after: maxDate } }}
                          modifiersClassNames={{ tooFar: "text-destructive line-through opacity-70 hover:!bg-destructive/10" }}
                          initialFocus
                          captionLayout="dropdown"
                          fromYear={today.getFullYear()}
                          toYear={today.getFullYear() + 3}
                          className={cn("p-0 pointer-events-auto w-full [--cell-size:2.75rem] sm:[--cell-size:3.25rem]")}
                          classNames={{ root: "w-full", months: "w-full", month: "w-full flex flex-col gap-4", nav: "hidden", button_previous: "hidden", button_next: "hidden" }}
                        />
                      )}
                    </CalendarMonthNav>
                  );
                })()}
                <div className="mt-auto pt-5 text-[11px] text-muted-foreground/80">* Preços podem variar de acordo com a data selecionada</div>
              </div>
            )}

            {hasAddons && (
              <div className="p-6 lg:p-8 bg-background/40 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Serviços adicionais</h3>
                  {weekdayShortName ? (
                    <span className="px-2 py-0.5 bg-brand-orange/10 text-brand-orange text-[10px] font-bold rounded-full uppercase tracking-wider">{weekdayShortName}</span>
                  ) : isFlexibleDate ? (
                    <span className="px-2 py-0.5 bg-muted text-muted-foreground text-[10px] font-bold rounded-full uppercase tracking-wider">Escolha a data</span>
                  ) : null}
                </div>
                <div className="space-y-3">
                  {addons.map((a) => {
                    const isSel = !!selected[a.key];
                    const units = a.per === "order" ? 1 : Math.max(1, qty);
                    const Icon = pickIcon(a.name);
                    return (
                      <div key={a.key} className="space-y-2">
                        <button
                          type="button"
                          onClick={() => setSelected((s) => ({ ...s, [a.key]: !s[a.key] }))}
                          className={cn("relative w-full p-4 rounded-2xl text-left transition-all bg-card border", isSel ? "border-brand-orange/60 ring-1 ring-brand-orange/40" : "border-border/70 hover:border-border")}
                        >
                          <div className="flex items-start gap-4 pr-14">
                            <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 bg-muted border border-border/60">
                              <Icon className={cn("h-5 w-5", isSel ? "text-brand-orange" : "text-muted-foreground")} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-bold text-foreground break-words leading-tight">{a.name}</div>
                              {a.description && <p className="text-[11px] text-muted-foreground mt-1 leading-snug whitespace-pre-line break-words">{a.description}</p>}
                              <div className="mt-2 flex items-baseline gap-1 flex-wrap">
                                <span className="text-sm font-bold text-foreground">{formatBRL(a.price)}</span>
                                <span className="text-[10px] text-muted-foreground">{a.per === "order" ? "por reserva" : `× ${units}`}</span>
                              </div>
                            </div>
                          </div>
                          <div className="absolute top-4 right-4">
                            <div className={cn("w-10 h-5 rounded-full relative transition-colors", isSel ? "bg-brand-orange" : "bg-muted border border-border")}>
                              <div className={cn("absolute top-[2px] w-4 h-4 rounded-full transition-all shadow-sm", isSel ? "left-[calc(100%-1.125rem)] bg-white" : "left-[2px] bg-muted-foreground/60")} />
                            </div>
                          </div>
                        </button>
                        {isSel && a.subs.length > 0 && (
                          <div className="ml-4 pl-4 border-l-2 border-brand-orange/30 space-y-2">
                            <div className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider pt-1">Complementos para "{a.name}"</div>
                            {a.subs.map((sub: any) => {
                              const subSel = !!selected[sub.key];
                              const subUnits = sub.per === "order" ? 1 : Math.max(1, qty);
                              return (
                                <button
                                  key={sub.key}
                                  type="button"
                                  onClick={() => setSelected((s) => ({ ...s, [sub.key]: !s[sub.key] }))}
                                  className={cn("relative w-full p-3 rounded-xl text-left transition-all bg-card border", subSel ? "border-brand-orange/60 ring-1 ring-brand-orange/40" : "border-border/70 hover:border-border")}
                                >
                                  <div className="flex items-start gap-3 pr-12">
                                    <div className="flex-1 min-w-0">
                                      <div className="text-xs font-bold text-foreground break-words leading-tight">{sub.name}</div>
                                      {sub.description && <p className="text-[11px] text-muted-foreground mt-1 leading-snug whitespace-pre-line break-words">{sub.description}</p>}
                                      <div className="mt-1.5 flex items-baseline gap-1 flex-wrap">
                                        <span className="text-xs font-bold text-foreground">{formatBRL(sub.price)}</span>
                                        <span className="text-[10px] text-muted-foreground">{sub.per === "order" ? "por reserva" : `× ${subUnits}`}</span>
                                      </div>
                                    </div>
                                  </div>
                                  <div className="absolute top-3 right-3">
                                    <div className={cn("rounded-full relative transition-colors", subSel ? "bg-brand-orange" : "bg-muted border border-border")} style={{ width: 36, height: 18 }}>
                                      <div className={cn("absolute top-[2px] w-3.5 h-3.5 rounded-full transition-all shadow-sm", subSel ? "left-[calc(100%-1rem)] bg-white" : "left-[2px] bg-muted-foreground/60")} />
                                    </div>
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <div className="p-5 lg:p-6 bg-muted/30 border-t border-border shrink-0">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Total estimado</span>
                  <span className="text-[10px] bg-brand-orange/10 text-brand-orange px-2 py-0.5 rounded-full font-bold">
                    {qty} {qty === 1 ? "ingresso" : "ingressos"}
                    {selectedCount > 0 && ` + ${selectedCount} ${selectedCount === 1 ? "adicional" : "adicionais"}`}
                  </span>
                </div>
                <div className="font-display text-2xl lg:text-3xl font-black text-foreground leading-tight mt-1">{formatBRL(total)}</div>
              </div>
              <Button
                onClick={handleContinue}
                disabled={isFlexibleDate && !date}
                className="flex-1 sm:flex-none sm:min-w-[240px] bg-brand-orange hover:bg-brand-orange/90 text-primary-foreground font-bold py-4 h-auto px-6 rounded-2xl transition-all shadow-[0_8px_30px_rgba(242,107,31,0.3)] active:scale-[0.98] group"
              >
                Continuar para checkout
                <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (

    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) setStepIdx(0); }}>
      <DialogContent className="w-[calc(100vw-2rem)] sm:w-full max-w-5xl p-0 gap-0 overflow-hidden border-white/10 bg-[#0a0a0a]/95 backdrop-blur-2xl shadow-[0_32px_64px_-16px_rgba(0,0,0,0.6)] rounded-[2rem] flex flex-col max-h-[92vh] relative">
        {/* Ambient glows */}
        <div className="pointer-events-none absolute -bottom-24 -left-24 w-64 h-64 bg-brand-orange/10 blur-[120px] rounded-full" />
        <div className="pointer-events-none absolute -top-24 -right-24 w-64 h-64 bg-brand-orange/5 blur-[120px] rounded-full" />

        {/* Header */}
        <div className="px-6 md:px-10 pt-8 pb-5 shrink-0 border-b border-white/5 relative">
          <div className="flex justify-between items-start gap-4 mb-6">
            <DialogHeader className="text-left space-y-1">
              <span className="text-brand-orange text-[10px] md:text-xs font-bold tracking-[0.2em] uppercase">
                VIA AIR Experience
              </span>
              <DialogTitle className="font-display text-xl md:text-3xl font-bold tracking-tight text-white">
                Personalize sua viagem
              </DialogTitle>
            </DialogHeader>
            <div className="text-right shrink-0 hidden sm:block">
              <div className="text-white/40 text-[10px] uppercase tracking-widest">Total estimado</div>
              <div className="text-xl md:text-2xl font-bold text-white">{formatBRL(total)}</div>
            </div>
          </div>

          {/* Stepper */}
          <div className="flex items-center gap-2 md:gap-4 overflow-x-auto">
            {steps.map((s, i) => {
              const isActive = i === stepIdx;
              const isDone = i < stepIdx;
              return (
                <div key={s.id} className="flex items-center gap-2 md:gap-4 shrink-0">
                  <div className={cn("flex items-center gap-2 md:gap-3", !isActive && !isDone && "opacity-30")}>
                    <div
                      className={cn(
                        "w-8 h-8 md:w-10 md:h-10 rounded-full flex items-center justify-center text-xs md:text-sm font-bold transition-all",
                        isActive
                          ? "bg-brand-orange text-black shadow-[0_0_20px_rgba(242,107,31,0.4)]"
                          : isDone
                            ? "bg-brand-orange/20 text-brand-orange border border-brand-orange/40"
                            : "border border-white/30 text-white",
                      )}
                    >
                      {isDone ? <Check className="h-4 w-4" /> : i + 1}
                    </div>
                    <span className={cn("text-xs md:text-sm font-medium whitespace-nowrap", isActive ? "text-white" : "text-white/70")}>
                      {s.label}
                    </span>
                  </div>
                  {i < steps.length - 1 && <div className="h-px bg-white/10 w-6 md:w-16" />}
                </div>
              );
            })}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 md:p-10">
          {currentStep === "addons" && (
            <div className="animate-fade-in">
              <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <h3 className="text-white text-lg md:text-xl font-bold">Escolha seus opcionais</h3>
                  <p className="text-white/50 text-sm mt-1">Selecione o que quer incluir. Você escolhe as datas no próximo passo.</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSelected({});
                    setStepIdx((i) => Math.min(i + 1, steps.length - 1));
                  }}
                  className="text-xs md:text-sm text-white/60 hover:text-white underline underline-offset-4 decoration-white/30 hover:decoration-white transition-colors whitespace-nowrap"
                >
                  Não quero adicionais →
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">

                {addons.map((a) => {
                  const isSel = !!selected[a.key];
                  const units = a.per === "order" ? 1 : Math.max(1, qty);
                  const Icon = pickIcon(a.name);
                  const isRecommended = !!a.recommended;
                  return (
                    <button
                      key={a.key}
                      type="button"
                      onClick={() => setSelected((s) => ({ ...s, [a.key]: !s[a.key] }))}
                      className={cn(
                        "relative group cursor-pointer text-left p-5 rounded-3xl border transition-all duration-300",
                        isSel
                          ? "bg-gradient-to-br from-white/10 to-transparent border-brand-orange/60 shadow-[0_0_40px_rgba(242,107,31,0.15)]"
                          : "bg-white/5 hover:bg-white/10 border-white/5 hover:border-white/20",
                      )}
                    >
                      {isSel && (
                        <div className="absolute -top-3 -right-3 bg-brand-orange text-black text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-tight">
                          Selecionado
                        </div>
                      )}
                      {!isSel && isRecommended && (
                        <div className="absolute -top-3 left-4 bg-emerald-500 text-white text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-tight flex items-center gap-1">
                          <Sparkles className="h-3 w-3" /> Recomendado
                        </div>
                      )}
                      <div className={cn("w-12 h-12 md:w-14 md:h-14 rounded-2xl flex items-center justify-center mb-4 transition-colors", isSel ? "bg-brand-orange/20" : "bg-white/5 group-hover:bg-brand-orange/10")}>
                        <Icon className={cn("h-6 w-6 md:h-7 md:w-7 transition-colors", isSel ? "text-brand-orange" : "text-white/40 group-hover:text-brand-orange")} />
                      </div>
                      <h4 className="text-white font-bold text-base md:text-lg mb-1 leading-tight">{a.name}</h4>
                      {a.description && (
                        <p className="text-white/50 text-xs leading-relaxed mb-4 line-clamp-3">{a.description}</p>
                      )}
                      <div className="flex justify-between items-end mt-4">
                        <div>
                          {a.hasWeekdayPricing && (
                            <span className="block text-[10px] text-white/30 uppercase tracking-widest">A partir de</span>
                          )}
                          <span className="text-lg font-bold text-white">{formatBRL(a.price)}</span>
                          <span className="ml-1 text-[10px] text-white/40">{a.per === "order" ? "por reserva" : `× ${units}`}</span>
                        </div>
                        <div className={cn("w-8 h-8 rounded-full flex items-center justify-center transition-all", isSel ? "bg-brand-orange" : "border border-white/20 group-hover:border-brand-orange")}>
                          {isSel ? <Check className="h-5 w-5 text-black" strokeWidth={3} /> : <Plus className="h-4 w-4 text-white/40 group-hover:text-brand-orange" />}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {currentStep === "date" && (() => {
            const slots: { key: string; label: string; sub: string; value: string; setValue: (v: string) => void; needsWeekday: boolean }[] = [];
            if (isFlexibleDate) {
              slots.push({
                key: "__pkg",
                label: pkg.title || pkg.name || "Pacote",
                sub: "Data principal",
                value: date,
                setValue: setDate,
                needsWeekday: false,
              });
            }
            for (const a of selectedAddons) {
              slots.push({
                key: a.key,
                label: a.name,
                sub: a.hasWeekdayPricing ? "Preço varia por dia" : "Adicional",
                value: addonDates[a.key] || "",
                setValue: (v: string) => setAddonDates((prev) => ({ ...prev, [a.key]: v })),
                needsWeekday: a.hasWeekdayPricing,
              });
            }
            const activeKey = slots.find((s) => s.key === activeDateKey) ? activeDateKey : slots[0]?.key ?? "__pkg";
            const active = slots.find((s) => s.key === activeKey) ?? slots[0];
            if (!active) return null;
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const maxDate = new Date(today);
            maxDate.setMonth(maxDate.getMonth() + 11);
            const activeWd = (() => {
              const m = active.value.match(/^(\d{4})-(\d{2})-(\d{2})/);
              if (!m) return null;
              return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getDay();
            })();
            const activeWdLabel = activeWd == null ? null : ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"][activeWd];

            return (
              <div className="animate-fade-in">
                <div className="mb-6">
                  <h3 className="text-white text-lg md:text-xl font-bold">Escolha as datas</h3>
                  <p className="text-white/50 text-sm mt-1">
                    {slots.length > 1
                      ? "Cada adicional pode ter uma data diferente. Selecione abaixo e escolha o dia."
                      : "Selecione o dia da sua visita."}
                  </p>
                </div>

                {slots.length > 1 && (
                  <div className="mb-5 flex flex-wrap gap-2">
                    {slots.map((s) => {
                      const isActive = s.key === activeKey;
                      const filled = !!s.value;
                      return (
                        <button
                          key={s.key}
                          type="button"
                          onClick={() => setActiveDateKey(s.key)}
                          className={cn(
                            "group flex items-center gap-2.5 px-3.5 py-2.5 rounded-2xl border text-left transition-all",
                            isActive
                              ? "bg-brand-orange/15 border-brand-orange/60 shadow-[0_0_20px_rgba(242,107,31,0.15)]"
                              : filled
                                ? "bg-white/5 border-emerald-500/40 hover:border-emerald-500/60"
                                : "bg-white/5 border-white/10 hover:border-white/25",
                          )}
                        >
                          <div className={cn(
                            "w-7 h-7 rounded-lg flex items-center justify-center shrink-0",
                            isActive ? "bg-brand-orange text-black" : filled ? "bg-emerald-500/20 text-emerald-400" : "bg-white/10 text-white/50",
                          )}>
                            {filled ? <Check className="h-4 w-4" strokeWidth={3} /> : <CalendarIcon className="h-3.5 w-3.5" />}
                          </div>
                          <div className="min-w-0">
                            <div className="text-white text-xs font-bold leading-tight truncate max-w-[180px]">{s.label}</div>
                            <div className="text-[10px] text-white/50 leading-tight mt-0.5">
                              {filled ? format(new Date(s.value + "T00:00:00"), "dd 'de' MMM", { locale: ptBR }) : s.sub}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
                  <div className="bg-white/5 border border-white/10 rounded-3xl p-4 md:p-6">
                    <div className="mb-3 text-white/60 text-xs uppercase tracking-widest font-bold">
                      Data de: <span className="text-brand-orange">{active.label}</span>
                    </div>
                    <CalendarMonthNav>
                      {(month, setMonth) => (
                        <CalendarUI
                          key={active.key}
                          mode="single"
                          locale={ptBR}
                          month={month}
                          onMonthChange={setMonth}
                          selected={active.value ? new Date(active.value + "T00:00:00") : undefined}
                          onDayClick={(d, mods) => {
                            if (mods?.disabled) return;
                            if (d > maxDate) {
                              toast.error("Data indisponível", { description: "Só aceitamos reservas com até 11 meses de antecedência." });
                              return;
                            }
                            const y = d.getFullYear();
                            const m = String(d.getMonth() + 1).padStart(2, "0");
                            const day = String(d.getDate()).padStart(2, "0");
                            active.setValue(`${y}-${m}-${day}`);
                            // Auto-advance to next empty slot
                            const nextEmpty = slots.find((s) => s.key !== active.key && !s.value && s.key !== active.key);
                            if (nextEmpty && slots.length > 1) {
                              setTimeout(() => setActiveDateKey(nextEmpty.key), 200);
                            }
                          }}
                          disabled={{ before: new Date() }}
                          modifiers={{ tooFar: { after: maxDate } }}
                          modifiersClassNames={{ tooFar: "text-destructive line-through opacity-70 hover:!bg-destructive/10" }}
                          initialFocus
                          captionLayout="dropdown"
                          fromYear={today.getFullYear()}
                          toYear={today.getFullYear() + 3}
                          className={cn("p-0 pointer-events-auto w-full [--cell-size:2.75rem] sm:[--cell-size:3.25rem]")}
                          classNames={{ root: "w-full", months: "w-full", month: "w-full flex flex-col gap-4", nav: "hidden", button_previous: "hidden", button_next: "hidden" }}
                        />
                      )}
                    </CalendarMonthNav>
                  </div>
                  <div className="space-y-3">
                    <div className="bg-white/5 border border-white/10 rounded-3xl p-5">
                      <div className="text-white/40 text-[10px] uppercase tracking-widest">Data para {active.label}</div>
                      <div className="text-white text-xl font-bold mt-1">
                        {active.value ? format(new Date(active.value + "T00:00:00"), "dd 'de' MMMM", { locale: ptBR }) : "—"}
                      </div>
                      {activeWdLabel && (
                        <span className="mt-2 inline-block px-2 py-0.5 bg-brand-orange/15 text-brand-orange text-[10px] font-bold rounded-full uppercase tracking-wider">
                          {activeWdLabel}
                        </span>
                      )}
                    </div>
                    {missingAddonDates.length > 0 && (
                      <div className="bg-amber-500/5 border border-amber-500/20 rounded-3xl p-4 text-xs text-white/70 leading-relaxed">
                        Falta escolher a data de: <span className="text-white font-semibold">{missingAddonDates.map((a) => a.name).join(", ")}</span>
                      </div>
                    )}
                    {anySelectedNeedsDate && missingAddonDates.length === 0 && (
                      <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-3xl p-4 text-xs text-white/70 leading-relaxed">
                        Todas as datas foram escolhidas. Você pode avançar.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })()}


          {currentStep === "subs" && (
            <div className="animate-fade-in space-y-6">
              <div>
                <h3 className="text-white text-lg md:text-xl font-bold">Adicione extras</h3>
                <p className="text-white/50 text-sm mt-1">Complementos para os opcionais que você selecionou.</p>
              </div>
              {selectedAddons.filter((a) => a.subs.length > 0).map((a) => (
                <div key={a.key} className="bg-white/5 border border-white/10 rounded-3xl p-5">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-xl bg-brand-orange/20 flex items-center justify-center">
                      {(() => { const I = pickIcon(a.name); return <I className="h-5 w-5 text-brand-orange" />; })()}
                    </div>
                    <div>
                      <div className="text-white font-bold text-sm md:text-base">Complementos para "{a.name}"</div>
                      <div className="text-white/40 text-xs">Escolha um ou mais opcionais abaixo</div>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {a.subs.map((sub: any) => {
                      const subSel = !!selected[sub.key];
                      const subUnits = sub.per === "order" ? 1 : Math.max(1, qty);
                      return (
                        <button
                          key={sub.key}
                          type="button"
                          onClick={() => setSelected((s) => ({ ...s, [sub.key]: !s[sub.key] }))}
                          className={cn(
                            "relative text-left p-4 rounded-2xl border transition-all",
                            subSel
                              ? "bg-gradient-to-br from-white/10 to-transparent border-brand-orange/60 shadow-[0_0_30px_rgba(242,107,31,0.1)]"
                              : sub.recommended
                                ? "bg-white/5 border-emerald-500/40 hover:border-emerald-500/60"
                                : "bg-white/5 border-white/10 hover:border-white/20",
                          )}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-white font-bold text-sm">{sub.name}</span>
                                {sub.recommended && (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 text-emerald-400 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider">
                                    <Sparkles className="h-2.5 w-2.5" /> Recomendado
                                  </span>
                                )}
                              </div>
                              {sub.description && <p className="text-white/50 text-[11px] mt-1 leading-snug">{sub.description}</p>}
                              <div className="mt-2 text-sm font-bold text-white">
                                {formatBRL(sub.price)}
                                <span className="ml-1 text-[10px] text-white/40">{sub.per === "order" ? "por reserva" : `× ${subUnits}`}</span>
                              </div>
                            </div>
                            <div className={cn("w-8 h-8 rounded-full flex items-center justify-center shrink-0", subSel ? "bg-brand-orange" : "border border-white/20")}>
                              {subSel ? <Check className="h-5 w-5 text-black" strokeWidth={3} /> : <Plus className="h-4 w-4 text-white/40" />}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {currentStep === "summary" && (
            <div className="animate-fade-in space-y-5">
              <div>
                <h3 className="text-white text-lg md:text-xl font-bold">Revise seu pedido</h3>
                <p className="text-white/50 text-sm mt-1">Confirme os detalhes antes de continuar para o pagamento.</p>
              </div>

              <div className="bg-white/5 border border-white/10 rounded-3xl p-5 space-y-3">
                <div className="flex justify-between items-start gap-4">
                  <div className="min-w-0">
                    <div className="text-white font-bold text-base">{pkg.title || pkg.name}</div>
                    <div className="text-white/40 text-xs mt-1">
                      {qty} {qty === 1 ? "ingresso" : "ingressos"}
                      {date && ` • ${format(new Date(date + "T00:00:00"), "dd/MM/yyyy", { locale: ptBR })}`}
                    </div>
                  </div>
                  <div className="text-white font-bold shrink-0">{formatBRL(basePrice * qty)}</div>
                </div>

                {selectedAddons.length > 0 && (
                  <div className="border-t border-white/10 pt-3 space-y-2">
                    {selectedAddons.map((a) => {
                      const units = a.per === "order" ? 1 : Math.max(1, qty);
                      return (
                        <div key={a.key}>
                          <div className="flex justify-between items-baseline gap-4">
                            <span className="text-white/80 text-sm min-w-0 truncate">{a.name}</span>
                            <span className="text-white text-sm font-semibold shrink-0">{formatBRL(a.price * units)}</span>
                          </div>
                          {a.subs.filter((s: any) => selected[s.key]).map((sub: any) => {
                            const subUnits = sub.per === "order" ? 1 : Math.max(1, qty);
                            return (
                              <div key={sub.key} className="flex justify-between items-baseline gap-4 pl-4 mt-1">
                                <span className="text-white/50 text-xs min-w-0 truncate">+ {sub.name}</span>
                                <span className="text-white/70 text-xs shrink-0">{formatBRL(sub.price * subUnits)}</span>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="border-t border-white/10 pt-3 flex justify-between items-baseline">
                  <span className="text-white/60 text-xs uppercase tracking-widest font-bold">Total</span>
                  <span className="text-brand-orange text-2xl font-black">{formatBRL(total)}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 md:px-10 py-5 md:py-6 bg-black/40 border-t border-white/5 shrink-0 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={handleBack}
            disabled={isFirstStep}
            className="px-4 md:px-6 py-3 text-white/40 hover:text-white transition-colors text-sm font-semibold tracking-wide disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Voltar
          </button>
          <div className="flex items-center gap-4 md:gap-6">
            <div className="hidden sm:block text-right">
              <div className="text-[10px] text-white/40 uppercase tracking-widest">
                {qty} {qty === 1 ? "ingresso" : "ingressos"}{selectedCount > 0 ? ` + ${selectedCount}` : ""}
              </div>
              <div className="text-sm text-white font-bold">{formatBRL(total)}</div>
            </div>
            {isLastStep ? (
              <Button
                onClick={handleContinue}
                className="bg-brand-orange hover:bg-[#ff7a2e] text-black px-6 md:px-10 py-3 md:py-4 h-auto rounded-2xl font-bold text-sm transition-all shadow-[0_10px_30px_-5px_rgba(242,107,31,0.4)] active:scale-95"
              >
                Continuar para pagamento
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            ) : (
              <Button
                onClick={handleNext}
                disabled={!canAdvance}
                className="bg-brand-orange hover:bg-[#ff7a2e] text-black px-6 md:px-10 py-3 md:py-4 h-auto rounded-2xl font-bold text-sm transition-all shadow-[0_10px_30px_-5px_rgba(242,107,31,0.4)] active:scale-95 disabled:opacity-50"
              >
                Próximo passo
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
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
