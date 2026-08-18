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
import { CruiseDetailsView } from "@/components/cruise/CruiseDetailsView";

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
  validateSearch: (s: Record<string, unknown>): { preview?: true } => ({
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
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@graph": [
              {
                "@type": "Product",
                name: p.title,
                description: desc,
                ...(img ? { image: img } : {}),
                brand: { "@type": "Brand", name: "VIA AIR" },
                category: "Pacote de viagem",
                url,
                ...(p.price_per_person
                  ? {
                      offers: {
                        "@type": "Offer",
                        price: String(p.price_per_person),
                        priceCurrency: "BRL",
                        availability: "https://schema.org/InStock",
                        url,
                      },
                    }
                  : {}),
              },
              {
                "@type": "BreadcrumbList",
                itemListElement: [
                  {
                    "@type": "ListItem",
                    position: 1,
                    name: "Início",
                    item: "https://pedidos.viaair.tur.br/",
                  },
                  {
                    "@type": "ListItem",
                    position: 2,
                    name: "Pacotes",
                    item: "https://pedidos.viaair.tur.br/pacotes",
                  },
                  { "@type": "ListItem", position: 3, name: p.title, item: url },
                ],
              },
            ],
          }),
        },
      ],
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
      let query = supabase.from("packages").select("id,slug,title,destination,origin,going_date,return_date,nights,price_per_person,taxes,image_url,summary,itinerary,includes,hotel_name,hotel_options,hotel_stars,meal_plan,room_type,room_category,bed_type,is_active,sort_order,base_occupancy,outbound_flight,return_flight,created_at,updated_at,tripadvisor_location_id,tripadvisor_url,tripadvisor_address,tripadvisor_photos,kind,pricing_mode,date_mode,services,cruise_details,meeting_point,tour_times,tour_modalities,ai_summary,flexible_dates").in("slug", slugs);
      if (!preview) query = query.eq("is_active", true);
      const { data, error } = await query.maybeSingle();
      if (error) throw error;
      if (!data) throw notFound();
      return data;
    },
  });

  const { data: datePrices = [] } = useQuery({
    queryKey: ["package-date-prices", pkg?.id],
    enabled: !!pkg?.id && (pkg as any)?.kind === "tour",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("package_date_prices")
        .select("date,modality,price_per_person,taxes,seats,is_available")
        .eq("package_id", (pkg as any).id)
        .eq("is_available", true)
        .gte("date", new Date().toISOString().slice(0, 10))
        .order("date");
      if (error) throw error;
      return data ?? [];
    },
  });

  const [hotelDialogOpen, setHotelDialogOpen] = useState(false);
  const [dialogPhotoIndex, setDialogPhotoIndex] = useState(0);
  const [preOpen, setPreOpen] = useState(false);
  const [hotelIdx, setHotelIdx] = useState(0);


  if (isLoading || !pkg) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        Carregando…
      </div>
    );
  }

  const baseOccupancy = pkg.base_occupancy ?? 2;
  const isTour = (pkg as any).kind === "tour";
  const isTicket = (pkg as any).kind === "service" || isTour;
  const isCruise = (pkg as any).kind === "cruise";
  if (isCruise) {
    if (typeof window !== "undefined") window.location.replace("/pacotes");
    return null;
  }
  const isPerUnit = (pkg as any).pricing_mode === "per_unit" || isTicket;

  const flexibleDates = !!(pkg as unknown as { flexible_dates?: boolean }).flexible_dates;
  const isFlexibleDate = (pkg as any).date_mode === "flexible" || flexibleDates;
  const eventDateLabel = isFlexibleDate
    ? "Data à escolher"
    : pkg.going_date
      ? formatDateBR(pkg.going_date)
      : null;

  // Hospedagens alternativas: mesmos voos e datas, hotéis diferentes.
  type HotelOpcao = {
    hotel_name: string;
    room_type?: string | null;
    meal_plan?: string | null;
    price_per_person?: number | null;
  };
  const hotelOptions = (
    Array.isArray((pkg as any).hotel_options) ? ((pkg as any).hotel_options as HotelOpcao[]) : []
  ).filter((h) => h?.hotel_name);
  const hasHotelChoice = hotelOptions.length > 1;
  const selHotel = hasHotelChoice ? (hotelOptions[Math.min(hotelIdx, hotelOptions.length - 1)] ?? null) : null;
  const hotelName = selHotel?.hotel_name || pkg.hotel_name;
  const isBaseHotel = !hasHotelChoice || hotelIdx === 0;
  const pricePerPerson = Number(selHotel?.price_per_person || pkg.price_per_person) || 0;

  const hotelDetails = Array.from(
    new Map(
      [
        { value: cleanHotelDetail(selHotel?.meal_plan || pkg.meal_plan), icon: null as LucideIcon | null, resolve: mealIcon },
        { value: cleanHotelDetail(pkg.bed_type), icon: null as LucideIcon | null, resolve: bedIcon },
        { value: cleanHotelDetail(selHotel?.room_type || pkg.room_type), icon: null as LucideIcon | null, resolve: roomTypeIcon },
        { value: cleanHotelDetail(selHotel ? null : pkg.room_category), icon: null as LucideIcon | null, resolve: roomCategoryIcon },
      ]
        .filter((detail): detail is { value: string; icon: LucideIcon | null; resolve: (v: string) => LucideIcon } => Boolean(detail.value))
        .map((detail) => [detail.value.toLocaleLowerCase("pt-BR"), { value: detail.value, icon: detail.icon ?? detail.resolve(detail.value) }]),
    ).values(),
  );


  if (isCruise) {
    return <CruiseDetailsView pkg={pkg as any} />;
  }

  if (isTicket) {
    return (
      <TicketDetailsView
        pkg={pkg}
        eventDateLabel={isTour ? null : eventDateLabel}
        isTour={isTour}
        datePrices={datePrices as any[]}
      />
    );
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
              label={isTicket ? "Data do evento" : flexibleDates ? "Datas" : "Período"}
              value={
                isTicket
                  ? eventDateLabel ?? "—"
                  : flexibleDates
                    ? "Você escolhe a data"
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
                    <span>{hotelName}</span>
                    {isBaseHotel && pkg.hotel_stars ? (
                      <span className="inline-flex">
                        {Array.from({ length: pkg.hotel_stars }).map((_, i) => (
                          <Star key={i} className="h-3.5 w-3.5 fill-brand-orange text-brand-orange" />
                        ))}
                      </span>
                    ) : null}
                  </div>
                  {isBaseHotel && (pkg as unknown as { tripadvisor_address?: string | null }).tripadvisor_address && (

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

              {hasHotelChoice && (
                <div className="mt-5 rounded-xl border border-border bg-muted/20 p-4">
                  <div className="text-sm font-semibold">Escolha a hospedagem</div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Mesmos voos e datas — muda apenas o hotel. Já deixamos selecionada a opção mais econômica.
                  </p>
                  <div className="mt-3 space-y-2">
                    {hotelOptions.map((h, i) => {
                      const ativo = i === Math.min(hotelIdx, hotelOptions.length - 1);
                      const base = Number(hotelOptions[0]?.price_per_person) || 0;
                      const preco = Number(h.price_per_person) || 0;
                      const dif = preco - base;
                      return (
                        <button
                          type="button"
                          key={`${h.hotel_name}-${i}`}
                          onClick={() => setHotelIdx(i)}
                          className={`w-full rounded-xl border p-3 text-left transition ${
                            ativo
                              ? "border-brand-orange bg-brand-orange/10"
                              : "border-border bg-card hover:border-brand-orange/50"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-sm font-medium">{h.hotel_name}</div>
                              <div className="text-xs text-muted-foreground">
                                {[h.room_type, h.meal_plan].filter(Boolean).join(" · ")}
                              </div>
                            </div>
                            <div className="text-right shrink-0">
                              <div className="text-sm font-semibold text-brand-orange">
                                {formatBRL(preco * baseOccupancy)}
                              </div>
                              <div className="text-[11px] text-muted-foreground">
                                {i === 0 ? "Mais econômico" : dif > 0 ? `+ ${formatBRL(dif * baseOccupancy)}` : "—"}
                              </div>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {(() => {
                if (!isBaseHotel) return null;
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

          <OtherDatesBlock
            pkg={{
              id: pkg.id,
              slug: pkg.slug,
              origin: pkg.origin,
              destination: pkg.destination,
              going_date: pkg.going_date,
              return_date: pkg.return_date,
              nights: pkg.nights,
              hotel_name: hotelName,
              price_per_person: pricePerPerson,
              base_occupancy: baseOccupancy,
            }}
          />


          <TicketRules services={pkg.services} />

        </div>

        {/* Right: sticky reservation card */}
        <aside className="lg:sticky lg:top-6 h-fit">
          <div className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
            <div className="text-xs text-muted-foreground">
              {isPerUnit
                ? (isTour ? "Preço por pessoa" : "Preço por ingresso")
                : `Preço para ${baseOccupancy === 1 ? "1 pessoa" : `${baseOccupancy} pessoas`}`}
            </div>
            <div className="mt-1 text-3xl font-display font-bold text-brand-orange">
              {formatBRL(pricePerPerson * (isPerUnit ? 1 : baseOccupancy))}
            </div>
            {hasHotelChoice && hotelName ? (
              <div className="text-xs text-muted-foreground mt-1">Com hospedagem no {hotelName}</div>
            ) : null}

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
                  {flexibleDates ? (
                    <Row label="Datas" value="Você escolhe" />
                  ) : (
                    <>
                      {pkg.going_date && <Row label="Ida" value={formatDateBR(pkg.going_date)} />}
                      {pkg.return_date && <Row label="Volta" value={formatDateBR(pkg.return_date)} />}
                    </>
                  )}
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

            {flexibleDates ? (
              <button
                type="button"
                onClick={() => setPreOpen(true)}
                className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full bg-gradient-brand px-6 py-3 font-semibold text-primary-foreground shadow-[var(--shadow-glow)] hover:opacity-90 transition"
              >
                Reservar agora <ArrowRight className="h-4 w-4" />
              </button>
            ) : (
              <Link
                to="/pacotes/$slug/checkout"
                params={{ slug: pkg.slug }}
                search={hasHotelChoice ? ({ hotel: Math.min(hotelIdx, hotelOptions.length - 1) } as any) : undefined}

                className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full bg-gradient-brand px-6 py-3 font-semibold text-primary-foreground shadow-[var(--shadow-glow)] hover:opacity-90 transition"
              >
                Reservar agora <ArrowRight className="h-4 w-4" />
              </Link>
            )}
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
              {(pkg as unknown as { flexible_dates?: boolean }).flexible_dates
                ? "Datas flexíveis — sujeitas à disponibilidade e alteração de valor sem aviso prévio."
                : "Sujeito à disponibilidade de voos e hospedagem."}
            </p>

          </div>
        </aside>
      </div>
      {flexibleDates && (
        <PreCheckoutDialog
          open={preOpen}
          onOpenChange={setPreOpen}
          pkg={pkg}
          qty={baseOccupancy}
          basePrice={(Number(pkg.price_per_person) || 0) + (Number(pkg.taxes) || 0)}
          isFlexibleDate
          rawAddons={((pkg as any)?.services?.addons ?? []) as any[]}
          stayNights={Number(pkg.nights) || 2}
          birthdayEnabled={!!(pkg as any)?.services?.birthday?.enabled}
          birthdayCondicao={((pkg as any)?.services?.birthday?.condicao ?? "") as string}
          unitNoun="pessoa"
        />
      )}
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

/**
 * Resumo amigável das regras dos ingressos (cortesia de aniversariante,
 * antecedência, no-show…) extraídas do orçamento do operador.
 */
function TicketRules({ services }: { services: any }) {
  const rules: any[] = Array.isArray(services?.ticket_rules) ? services.ticket_rules : [];
  const items = rules
    .map((r) => ({
      name: String(r?.name ?? "").trim(),
      usage_date: String(r?.usage_date ?? "").trim(),
      validity: String(r?.validity ?? "").trim(),
      bullets: (Array.isArray(r?.rules) ? r.rules : [])
        .map((b: any) => String(b ?? "").trim())
        .filter(Boolean),
    }))
    .filter((r) => r.name || r.bullets.length);

  if (!items.length) return null;

  return (
    <section>
      <h2 className="text-xl font-semibold">Regras dos ingressos</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Resumo do que vale para cada ingresso — leia antes de confirmar.
      </p>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {items.map((item, index) => (
          <div
            key={`${item.name}-${index}`}
            className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)]"
          >
            <div className="flex items-start gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-orange/10 text-brand-orange">
                <Ticket className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <h3 className="text-sm font-bold leading-snug">{item.name || "Ingresso"}</h3>
                {(item.usage_date || item.validity) && (
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {item.usage_date && (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                        Uso em {item.usage_date}
                      </span>
                    )}
                    {item.validity && (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                        Válido até {item.validity}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
            {item.bullets.length > 0 && (
              <ul className="mt-4 space-y-2">
                {item.bullets.map((bullet: string, i: number) => (
                  <li key={i} className="flex items-start gap-2 text-sm leading-relaxed">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-orange" />
                    <span>{bullet}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </section>
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
  isTour = false,
  datePrices = [],
}: {
  pkg: any;
  eventDateLabel: string | null;
  isTour?: boolean;
  datePrices?: any[];
}) {
  const tourFrom = datePrices.length
    ? Math.min(
        ...datePrices.map((d) => (Number(d.price_per_person) || 0) + (Number(d.taxes) || 0)),
      )
    : 0;
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

  const dateBlock = isTour ? null : parseEventDate(pkg.going_date);
  const price = isTour
    ? tourFrom || Number(pkg.price_per_person) || 0
    : Number(pkg.price_per_person) || 0;
  const includes: string[] = Array.isArray(pkg.includes) ? pkg.includes : [];

  const [qty, setQty] = useState(1);
  const maxUnits = Math.max(1, Math.min(9, Number(pkg.max_units) || 9));
  const isFlexibleDate = isTour || pkg?.date_mode === "flexible";
  const rawAddons: any[] = Array.isArray(services?.addons) ? services.addons : [];
  const hasAddons = rawAddons.some(
    (a) => a && a.name && (Number(a.price) > 0 || (a.price_by_weekday ?? []).some((t: any) => Number(t?.price) > 0)),
  );
  const [preOpen, setPreOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <TopBar
        backTo={isTour ? "/passeios" : "/ingressos"}
        backLabel={isTour ? "Todos os passeios" : "Todos os ingressos"}
      />

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
                    <Ticket className="h-3 w-3" /> {isTour ? "Passeio" : "Ingresso"}
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
          {(() => {
            const rawDesc =
              typeof (pkg.services as any)?.raw_description === "string"
                ? ((pkg.services as any).raw_description as string).trim()
                : "";
            const body = pkg.ai_summary || pkg.summary || rawDesc;
            if (!body) return null;
            return (
              <section>
                <SectionHeader>{isTour ? "Sobre o passeio" : "Sobre o ingresso"}</SectionHeader>
                {pkg.ai_summary ? (
                  <WhatsAppText className="text-muted-foreground leading-relaxed">
                    {pkg.ai_summary}
                  </WhatsAppText>
                ) : (
                  <p className="text-muted-foreground leading-relaxed whitespace-pre-line">
                    {pkg.summary || rawDesc}
                  </p>
                )}
                {rawDesc && (pkg.ai_summary || pkg.summary) && (
                  <details className="mt-4 group">
                    <summary className="cursor-pointer text-xs font-bold uppercase tracking-widest text-brand-orange">
                      Ver descrição completa do operador
                    </summary>
                    <p className="mt-3 text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
                      {rawDesc}
                    </p>
                  </details>
                )}
              </section>
            );
          })()}

          <TicketRules services={pkg.services} />


          {(pkg.meeting_point || (pkg.tour_times ?? []).length > 0) && (
            <section>
              <SectionHeader>Ponto de encontro e horários</SectionHeader>
              <div className="bg-card border border-border rounded-3xl p-6 space-y-4">
                {pkg.meeting_point && (
                  <div className="flex items-start gap-3 text-sm">
                    <MapPin className="h-4 w-4 mt-0.5 text-brand-orange shrink-0" />
                    <span className="leading-relaxed">{pkg.meeting_point}</span>
                  </div>
                )}
                {(pkg.tour_times ?? []).length > 0 && (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                      Horários de saída
                    </span>
                    {(pkg.tour_times as string[]).map((t) => (
                      <span
                        key={t}
                        className="rounded-full bg-brand-orange/10 px-3 py-1 text-xs font-bold text-brand-orange"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                )}
              </div>
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
                {isTour ? "A partir de (por pessoa)" : "Preço por ingresso"}
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
        datePrices={isTour ? datePrices : undefined}
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
  datePrices,
  stayNights = 0,
  birthdayEnabled = false,
  birthdayCondicao = "",
  unitNoun = "ingresso",
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  pkg: any;
  qty: number;
  basePrice: number;
  isFlexibleDate: boolean;
  rawAddons: any[];
  datePrices?: any[];
  stayNights?: number;
  birthdayEnabled?: boolean;
  birthdayCondicao?: string;
  unitNoun?: string;
}) {
  const navigate = useNavigate();
  const [date, setDate] = useState<string>(isFlexibleDate ? "" : (pkg.going_date ?? ""));
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const tourModalities: string[] = Array.isArray(pkg?.tour_modalities) ? pkg.tour_modalities : [];
  const tourTimes: string[] = Array.isArray(pkg?.tour_times) ? pkg.tour_times : [];
  const [modality, setModality] = useState<string>("");
  const [time, setTime] = useState<string>(tourTimes[0] ?? "");
  const maxNights = Math.min(2, Math.max(1, stayNights || 2));
  const [nights, setNights] = useState<number>(maxNights);
  const [isBirthday, setIsBirthday] = useState(false);

  const checkoutDate = useMemo(() => {
    if (!stayNights || !date) return "";
    const m = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return "";
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + nights);
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  }, [date, nights, stayNights]);



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
      })
      .sort((a: any, b: any) => (b.recommended ? 1 : 0) - (a.recommended ? 1 : 0));
  }, [rawAddons, weekday]);

  const addonsTotal = useMemo(() => {
    return addons.reduce((sum, a) => {
      if (!selected[a.key]) return sum;
      const units = a.per === "order" ? 1 : Math.max(1, qty);
      return sum + a.price * units;
    }, 0);
  }, [addons, selected, qty]);

  const norm = (s: any) => String(s ?? "").trim().toLowerCase();

  // preço por modalidade -> por data
  const pricesByModality = useMemo(() => {
    const map = new Map<string, Map<string, number>>();
    for (const d of datePrices ?? []) {
      const mod = norm(d.modality);
      const price = (Number(d.price_per_person) || 0) + (Number(d.taxes) || 0);
      if (!map.has(mod)) map.set(mod, new Map());
      const inner = map.get(mod)!;
      const key = String(d.date);
      const prev = inner.get(key);
      if (prev == null || price < prev) inner.set(key, price);
    }
    return map;
  }, [datePrices]);

  const priceByDate = useMemo(() => {
    if (tourModalities.length && modality) {
      return pricesByModality.get(norm(modality)) ?? new Map<string, number>();
    }
    const all = new Map<string, number>();
    for (const inner of pricesByModality.values()) {
      for (const [k, v] of inner) {
        const prev = all.get(k);
        if (prev == null || v < prev) all.set(k, v);
      }
    }
    return all;
  }, [pricesByModality, modality, tourModalities.length]);

  const unitPrice = (date && priceByDate.get(date)) || basePrice;
  const total = unitPrice * qty + addonsTotal;
  const needsModality = tourModalities.length > 0;
  const canContinue = (!isFlexibleDate || !!date) && (!needsModality || !!modality);


  function handleContinue() {
    if (isFlexibleDate && !date) {
      toast.error("Escolha uma data para continuar");
      return;
    }
    if (needsModality && !modality) {
      toast.error("Escolha a modalidade para continuar");
      return;
    }

    const selectedKeys = Object.entries(selected).filter(([, v]) => v).map(([k]) => k);
    navigate({
      to: "/pacotes/$slug/checkout",
      params: { slug: pkg.slug },
      search: {
        qty,
        ...(date ? { date } : {}),
        ...(modality ? { modality } : {}),
        ...(time ? { time } : {}),
        ...(stayNights ? { nights } : {}),
        ...(isBirthday ? { birthday: 1 } : {}),
        ...(selectedKeys.length ? { addons: selectedKeys.join(",") } : {}),
      },
    });
  }

  const hasAddons = addons.length > 0;

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] sm:w-full max-w-4xl p-0 gap-0 overflow-hidden border-border bg-card/80 backdrop-blur-2xl shadow-2xl rounded-3xl flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-6 py-5 shrink-0 border-b border-border/60 flex items-start justify-between gap-4">
          <DialogHeader className="text-left space-y-1">
            <DialogTitle className="font-display text-xl leading-tight tracking-tight">
              Escolha sua data{hasAddons ? " e adicionais" : ""}
            </DialogTitle>
            <p className="text-sm text-muted-foreground">
              Personalize sua experiência para o dia da visita
            </p>
          </DialogHeader>
        </div>

        {/* Split content */}
        <div
          className={cn(
            "flex-1 overflow-y-auto grid grid-cols-1",
            isFlexibleDate && (hasAddons || needsModality || birthdayEnabled || tourTimes.length > 0)
              ? "lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-border/60"
              : "",
          )}
        >
          {/* Left: Calendar */}
          {isFlexibleDate && (
            <div className="p-5 lg:p-6 flex flex-col">

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
                      const isoKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
                      if (priceByDate.size > 0 && !priceByDate.has(isoKey)) {
                        toast.error("Data sem disponibilidade", {
                          description: "Escolha uma das datas destacadas no calendário.",
                        });
                        return;
                      }
                      if (d > maxDate) {
                        toast.error("Data indisponível", {
                          description: "Só aceitamos reservas com até 11 meses de antecedência.",
                        });
                        return;
                      }
                      const y = d.getFullYear();
                      const m = String(d.getMonth() + 1).padStart(2, "0");
                      const day = String(d.getDate()).padStart(2, "0");
                      setDate(`${y}-${m}-${day}`);
                    }}
                    disabled={{ before: new Date() }}
                    modifiers={{
                      tooFar: { after: maxDate },
                      ...(priceByDate.size > 0
                        ? {
                            hasPrice: [...priceByDate.keys()].map(
                              (k) => new Date(`${k}T00:00:00`),
                            ),
                          }
                        : {}),
                    }}
                    modifiersClassNames={{
                      tooFar: "text-destructive line-through opacity-70 hover:!bg-destructive/10",
                      hasPrice:
                        "font-bold text-brand-orange ring-1 ring-brand-orange/40 rounded-md",
                    }}
                    initialFocus
                    captionLayout="dropdown"
                    fromYear={today.getFullYear()}
                    toYear={today.getFullYear() + 3}
                    className={cn("p-0 pointer-events-auto w-full [--cell-size:2.1rem] sm:[--cell-size:2.4rem]")}
                    classNames={{
                      root: "w-full",
                      months: "w-full",
                      month: "w-full flex flex-col gap-4",
                      nav: "hidden",
                      button_previous: "hidden",
                      button_next: "hidden",
                    }}
                  />
                )}
              </CalendarMonthNav>
                );
              })()}

              {priceByDate.size > 0 && (
                <div className="mt-4 rounded-xl border border-border bg-muted/30 px-4 py-3 text-sm">
                  {date && priceByDate.has(date) ? (
                    <>
                      <span className="text-muted-foreground">
                        {new Date(`${date}T00:00:00`).toLocaleDateString("pt-BR", {
                          day: "2-digit",
                          month: "long",
                        })}
                        {" · "}
                      </span>
                      <strong className="text-brand-orange">
                        {formatBRL(priceByDate.get(date) ?? 0)}
                      </strong>{" "}
                      por pessoa
                    </>
                  ) : (
                    <span className="text-muted-foreground">
                      Selecione uma das datas destacadas para ver o valor.
                    </span>
                  )}
                </div>
              )}

              {stayNights > 0 && (
                <div className="mt-4 rounded-xl border border-border bg-muted/30 px-4 py-3 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                      Noites
                    </span>
                    <div className="flex gap-1">
                      {Array.from({ length: maxNights }, (_, i) => i + 1).map((n) => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => setNights(n)}
                          className={cn(
                            "rounded-full px-3 py-1 text-xs font-bold transition",
                            nights === n
                              ? "bg-brand-orange text-primary-foreground"
                              : "border border-border text-muted-foreground hover:text-foreground",
                          )}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {date ? (
                      <>
                        Entrada{" "}
                        <strong className="text-foreground">
                          {new Date(`${date}T00:00:00`).toLocaleDateString("pt-BR", {
                            day: "2-digit",
                            month: "2-digit",
                          })}
                        </strong>{" "}
                        · Saída <strong className="text-foreground">{checkoutDate}</strong>
                      </>
                    ) : (
                      "Escolha a data de entrada no calendário."
                    )}{" "}
                    Limite de {maxNights} noite{maxNights > 1 ? "s" : ""}.
                  </p>
                </div>
              )}

              <div className="mt-auto pt-5 text-[11px] text-muted-foreground/80">
                * Preços podem variar de acordo com a data selecionada
              </div>
            </div>
          )}

          {/* Right: Modalidades / horários */}
          {(needsModality || tourTimes.length > 0 || birthdayEnabled) && (
            <div className="p-5 lg:p-6 bg-background/40 space-y-5">
              {birthdayEnabled && (
                <button
                  type="button"
                  onClick={() => setIsBirthday((v) => !v)}
                  className={cn(
                    "w-full rounded-2xl border bg-card p-4 text-left transition-all",
                    isBirthday
                      ? "border-brand-orange/60 ring-1 ring-brand-orange/40"
                      : "border-border/70 hover:border-brand-orange/40",
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-sm font-bold">
                        <Sparkles className="h-4 w-4 text-brand-orange" />
                        Cortesia de aniversariante
                      </div>
                      <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
                        {birthdayCondicao || "Opcional e sem custo. Confirmamos os dados na próxima etapa."}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-600">
                      Grátis
                    </span>
                  </div>
                </button>
              )}
              {needsModality && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
                      Modalidade
                    </h3>
                    <span
                      className={cn(
                        "px-2 py-0.5 text-[10px] font-bold rounded-full uppercase tracking-wider",
                        modality
                          ? "bg-brand-orange/10 text-brand-orange"
                          : "bg-destructive/10 text-destructive",
                      )}
                    >
                      {modality ? "Selecionada" : "Obrigatório"}
                    </span>
                  </div>
                  <div className="space-y-3">
                    {tourModalities.map((m) => {
                      const inner = pricesByModality.get(norm(m));
                      const priceForDate = date ? inner?.get(date) : undefined;
                      const min = inner && inner.size ? Math.min(...inner.values()) : undefined;
                      const isSel = norm(modality) === norm(m);
                      const unavailable = !!date && inner != null && inner.size > 0 && priceForDate == null;
                      return (
                        <button
                          key={m}
                          type="button"
                          onClick={() => setModality(m)}
                          className={cn(
                            "w-full p-4 rounded-2xl text-left transition-all bg-card border",
                            isSel
                              ? "border-brand-orange/60 ring-1 ring-brand-orange/40 shadow-[0_8px_24px_-12px_rgba(242,107,31,0.45)]"
                              : "border-border/70 hover:border-brand-orange/40",
                          )}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <span className="text-sm font-semibold leading-snug">{m}</span>
                            <span className="text-right shrink-0">
                              {priceForDate != null ? (
                                <>
                                  <span className="block text-sm font-bold text-brand-orange">
                                    {formatBRL(priceForDate)}
                                  </span>
                                  <span className="block text-[10px] uppercase tracking-wider text-muted-foreground">
                                    por pessoa
                                  </span>
                                </>
                              ) : unavailable ? (
                                <span className="text-[11px] text-muted-foreground">
                                  Sem preço nesta data
                                </span>
                              ) : min != null ? (
                                <>
                                  <span className="block text-sm font-bold text-brand-orange">
                                    {formatBRL(min)}
                                  </span>
                                  <span className="block text-[10px] uppercase tracking-wider text-muted-foreground">
                                    a partir de
                                  </span>
                                </>
                              ) : null}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {tourTimes.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
                    Horário de saída
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {tourTimes.map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setTime(t)}
                        className={cn(
                          "px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors",
                          time === t
                            ? "border-brand-orange/60 bg-brand-orange/10 text-brand-orange"
                            : "border-border/70 text-muted-foreground hover:border-brand-orange/40",
                        )}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}




          {/* Right: Addons */}
          {hasAddons && (
            <div className="p-6 lg:p-8 bg-background/40 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
                  Serviços adicionais
                </h3>
                {weekdayShortName ? (
                  <span className="px-2 py-0.5 bg-brand-orange/10 text-brand-orange text-[10px] font-bold rounded-full uppercase tracking-wider">
                    {weekdayShortName}
                  </span>
                ) : isFlexibleDate ? (
                  <span className="px-2 py-0.5 bg-muted text-muted-foreground text-[10px] font-bold rounded-full uppercase tracking-wider">
                    Escolha a data
                  </span>
                ) : null}
              </div>

              <div className="space-y-3">
                {addons.map((a) => {
                  const isSel = !!selected[a.key];
                  const units = a.per === "order" ? 1 : Math.max(1, qty);
                  const priceIsAssumed = a.hasWeekdayPricing && weekday == null;
                  const Icon = pickIcon(a.name);
                  const isRecommended = !!a.recommended;
                  return (
                    <button
                      key={a.key}
                      type="button"
                      onClick={() => setSelected((s) => ({ ...s, [a.key]: !s[a.key] }))}
                      className={cn(
                        "relative w-full p-4 rounded-2xl text-left transition-all bg-card border",
                        isSel
                          ? "border-brand-orange/60 ring-1 ring-brand-orange/40 shadow-[0_8px_24px_-12px_rgba(242,107,31,0.45)]"
                          : isRecommended
                            ? "border-emerald-500/50 ring-1 ring-emerald-500/20 hover:border-emerald-500/70"
                            : "border-border/70 hover:border-border",
                      )}
                    >
                      {isRecommended && (
                        <div className="absolute -top-2 left-4 flex items-center gap-1 rounded-full bg-emerald-500 text-white px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider shadow-md">
                          <Sparkles className="h-3 w-3" />
                          Recomendado
                        </div>
                      )}
                      <div className="flex items-start gap-4 pr-14">
                        <div
                          className={cn(
                            "w-12 h-12 rounded-xl flex items-center justify-center shrink-0 bg-muted border border-border/60 transition-colors",
                          )}
                        >
                          <Icon
                            className={cn(
                              "h-5 w-5 transition-colors",
                              isSel ? "text-brand-orange" : isRecommended ? "text-emerald-600" : "text-muted-foreground",
                            )}
                          />
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-bold text-foreground break-words leading-tight">
                            {a.name}
                          </div>
                          {a.description && (
                            <p className="text-[11px] text-muted-foreground mt-1 leading-snug whitespace-pre-line break-words">
                              {a.description}
                            </p>
                          )}
                          {isRecommended && a.recommended_reason && (
                            <p className="mt-2 inline-flex items-start gap-1 rounded-md bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 px-2 py-1 text-[11px] font-medium leading-snug">
                              <Sparkles className="h-3 w-3 mt-[2px] shrink-0" />
                              <span className="break-words">{a.recommended_reason}</span>
                            </p>
                          )}

                          <div className="mt-2 flex items-baseline gap-1 flex-wrap">
                            {priceIsAssumed && (
                              <span className="text-[10px] text-muted-foreground">A partir de</span>
                            )}
                            <span className="text-sm font-bold text-foreground">{formatBRL(a.price)}</span>
                            <span className="text-[10px] text-muted-foreground">
                              {a.per === "order" ? "por reserva" : `× ${units}`}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Toggle */}
                      <div className="absolute top-4 right-4">
                        <div
                          className={cn(
                            "w-10 h-5 rounded-full relative transition-colors",
                            isSel ? "bg-brand-orange" : "bg-muted border border-border",
                          )}
                        >
                          <div
                            className={cn(
                              "absolute top-[2px] w-4 h-4 rounded-full transition-all shadow-sm",
                              isSel ? "left-[calc(100%-1.125rem)] bg-white" : "left-[2px] bg-muted-foreground/60",
                            )}
                          />
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-5 lg:p-6 bg-muted/30 border-t border-border shrink-0">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">
                  Total estimado
                </span>
                <span className="text-[10px] bg-brand-orange/10 text-brand-orange px-2 py-0.5 rounded-full font-bold">
                  {qty} {qty === 1 ? unitNoun : `${unitNoun}s`}
                  {selectedCount > 0 && ` + ${selectedCount} ${selectedCount === 1 ? "adicional" : "adicionais"}`}
                </span>
              </div>
              <div className="font-display text-2xl lg:text-3xl font-black text-foreground leading-tight mt-1">
                {formatBRL(total)}
              </div>
            </div>
            <Button
              onClick={handleContinue}
              disabled={!canContinue}
              className="flex-1 sm:flex-none sm:min-w-[240px] bg-brand-orange hover:bg-brand-orange/90 text-primary-foreground font-bold py-4 h-auto px-6 rounded-2xl transition-all shadow-[0_8px_30px_rgba(242,107,31,0.3)] active:scale-[0.98] group"
            >
              Continuar para checkout
              <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Button>
          </div>
          <p className="text-center text-[10px] text-muted-foreground/80 mt-4 uppercase tracking-widest font-medium">
            Sujeito à disponibilidade • Cancelamento conforme política
          </p>
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
