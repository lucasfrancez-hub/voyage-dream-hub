import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ChevronLeft,
  ChevronRight,
  Star,
  MapPin,
  Award,
  Check,
  X,
  Loader2,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { getTripAdvisorPublicHotelInfo } from "@/lib/tripadvisor.functions";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  locationId: number;
  hotelName: string;
  // Fotos já armazenadas no pacote (fallback antes de carregar da API).
  fallbackPhotos?: string[];
  initialPhotoIndex?: number;
};

function formatDate(iso: string | null): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("pt-BR", { year: "numeric", month: "short" });
  } catch {
    return "";
  }
}

function langLabel(code: string | null | undefined): string {
  const c = (code || "").toLowerCase();
  const map: Record<string, string> = {
    en: "inglês", es: "espanhol", fr: "francês", it: "italiano", de: "alemão",
    ru: "russo", ja: "japonês", zh: "chinês", ko: "coreano", nl: "holandês",
    pl: "polonês", tr: "turco", ar: "árabe", he: "hebraico",
  };
  return map[c] || "inglês";
}

function safeText(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) {
    const primary = value.find(
      (item) => item && typeof item === "object" && (item as Record<string, unknown>).primary === true,
    );
    return safeText(primary ?? value[0]);
  }
  if (!value || typeof value !== "object") return "";
  const record = value as Record<string, unknown>;
  return safeText(
    record.value ?? record.localized_name ?? record.display_name ?? record.name ?? record.text ?? record.title,
  );
}

export function HotelDetailsDialog({
  open,
  onOpenChange,
  locationId,
  hotelName,
  fallbackPhotos = [],
  initialPhotoIndex = 0,
}: Props) {
  const fetchInfo = useServerFn(getTripAdvisorPublicHotelInfo);
  const { data, isLoading } = useQuery({
    queryKey: ["ta-public-hotel", locationId],
    queryFn: () => fetchInfo({ data: { locationId } }),
    enabled: open && locationId > 0,
    staleTime: 1000 * 60 * 30,
  });

  const photos = data?.photos?.length ? data.photos : fallbackPhotos;
  const [activePhoto, setActivePhoto] = useState(initialPhotoIndex);
  const [lightbox, setLightbox] = useState<number | null>(null);

  useEffect(() => {
    if (open) setActivePhoto(initialPhotoIndex);
  }, [open, initialPhotoIndex]);

  useEffect(() => {
    if (lightbox == null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightbox(null);
      if (e.key === "ArrowRight") setLightbox((i) => (i == null ? i : (i + 1) % photos.length));
      if (e.key === "ArrowLeft") setLightbox((i) => (i == null ? i : (i - 1 + photos.length) % photos.length));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox, photos.length]);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto p-0 gap-0">
          <DialogHeader className="px-6 pt-6 pb-3 border-b border-border">
            <DialogTitle className="text-xl">{safeText(data?.name) || hotelName}</DialogTitle>
            <DialogDescription className="sr-only">
              Fotos, avaliações e informações do hotel
            </DialogDescription>
            <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground mt-1">
              {data?.hotel_class ? (
                <span className="inline-flex items-center">
                  {Array.from({ length: data.hotel_class }).map((_, i) => (
                    <Star key={i} className="h-3.5 w-3.5 fill-brand-orange text-brand-orange" />
                  ))}
                </span>
              ) : null}
              {data?.rating ? (
                <span className="inline-flex items-center gap-1">
                  <span className="rounded bg-brand-orange px-1.5 py-0.5 text-xs font-semibold text-primary-foreground">
                    {data.rating.toFixed(1)}
                  </span>
                  {data.num_reviews ? (
                    <span className="text-xs">
                      {data.num_reviews.toLocaleString("pt-BR")} avaliações
                    </span>
                  ) : null}
                </span>
              ) : null}
              {data?.address && (
                <span className="inline-flex items-start gap-1 text-xs">
                  <MapPin className="h-3.5 w-3.5 mt-0.5 text-brand-orange" />
                  {safeText(data.address)}
                </span>
              )}
              {data?.ranking && (
                <span className="inline-flex items-center gap-1 text-xs">
                  <Award className="h-3.5 w-3.5 text-brand-orange" />
                  {safeText(data.ranking)}
                </span>
              )}
            </div>
          </DialogHeader>

          <div className="px-6 py-5 space-y-6">
            {isLoading && !photos.length && (
              <div className="flex items-center justify-center py-16 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin mr-2" /> Carregando informações...
              </div>
            )}

            {/* Galeria de fotos */}
            {photos.length > 0 && (
              <section>
                <div className="relative aspect-[16/10] overflow-hidden rounded-xl bg-muted">
                  <img
                    src={photos[activePhoto]}
                    alt={`${hotelName} — foto ${activePhoto + 1}`}
                    className="absolute inset-0 h-full w-full object-cover cursor-zoom-in"
                    onClick={() => setLightbox(activePhoto)}
                  />
                  {photos.length > 1 && (
                    <>
                      <button
                        type="button"
                        onClick={() => setActivePhoto((i) => (i - 1 + photos.length) % photos.length)}
                        className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-black/50 hover:bg-black/70 text-white p-2 transition"
                        aria-label="Foto anterior"
                      >
                        <ChevronLeft className="h-5 w-5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setActivePhoto((i) => (i + 1) % photos.length)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-black/50 hover:bg-black/70 text-white p-2 transition"
                        aria-label="Próxima foto"
                      >
                        <ChevronRight className="h-5 w-5" />
                      </button>
                      <div className="absolute bottom-3 right-3 rounded-full bg-black/60 text-white text-xs px-2.5 py-1">
                        {activePhoto + 1} / {photos.length}
                      </div>
                    </>
                  )}
                </div>
                {photos.length > 1 && (
                  <div className="mt-3 grid grid-cols-6 sm:grid-cols-8 md:grid-cols-10 gap-1.5">
                    {photos.map((src, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setActivePhoto(i)}
                        className={`relative aspect-square overflow-hidden rounded-md border-2 transition ${
                          i === activePhoto ? "border-brand-orange" : "border-transparent opacity-70 hover:opacity-100"
                        }`}
                      >
                        <img src={src} alt="" className="absolute inset-0 h-full w-full object-cover" />
                      </button>
                    ))}
                  </div>
                )}
              </section>
            )}

            {/* Descrição */}
            {data?.description && (
              <section>
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="font-semibold text-sm">Sobre o hotel</h3>
                  {data.description_translated_from && (
                    <span className="rounded-full bg-brand-orange/10 text-brand-orange text-[10px] px-2 py-0.5 uppercase tracking-wide">
                      Traduzido do {langLabel(data.description_translated_from)}
                    </span>
                  )}
                </div>
                <p className="text-sm text-muted-foreground whitespace-pre-line leading-relaxed">
                   {safeText(data.description)}
                </p>
              </section>
            )}

            {/* Subratings */}
            {data?.subratings && data.subratings.length > 0 && (
              <section>
                <h3 className="font-semibold text-sm mb-3">Avaliações por categoria</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {data.subratings.map((s) => (
                    <div key={s.name} className="rounded-lg border border-border bg-card p-3">
                       <div className="text-xs text-muted-foreground">{safeText(s.name)}</div>
                      <div className="mt-1 flex items-center gap-2">
                        <div className="text-lg font-semibold">{s.value.toFixed(1)}</div>
                        <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full bg-brand-orange"
                            style={{ width: `${Math.min(100, (s.value / 5) * 100)}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Amenidades */}
            {data?.amenities && data.amenities.length > 0 && (
              <section>
                <h3 className="font-semibold text-sm mb-3">O que este hotel oferece</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-2 gap-x-4">
                   {data.amenities.map((a, index) => (
                     <div key={`${safeText(a)}-${index}`} className="flex items-start gap-2 text-sm">
                      <Check className="h-4 w-4 text-brand-orange mt-0.5 shrink-0" />
                       <span>{safeText(a)}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Prêmios */}
            {data?.awards && data.awards.length > 0 && (
              <section>
                <h3 className="font-semibold text-sm mb-3">Reconhecimentos</h3>
                <div className="flex flex-wrap gap-2">
                  {data.awards.map((a, i) => (
                    <span
                      key={`${a.name}-${i}`}
                      className="inline-flex items-center gap-1.5 rounded-full border border-brand-orange/40 bg-brand-orange/10 px-3 py-1.5 text-xs text-brand-orange"
                    >
                      <Award className="h-3.5 w-3.5" />
                       {safeText(a.name)}{a.year ? ` · ${safeText(a.year)}` : ""}
                    </span>
                  ))}
                </div>
              </section>
            )}

            {/* Avaliações */}
            {data?.reviews && data.reviews.length > 0 && (
              <section>
                <h3 className="font-semibold text-sm mb-3">
                  Avaliações de hóspedes
                </h3>
                <div className="space-y-4">
                  {data.reviews.map((r) => (
                    <article key={r.id} className="rounded-lg border border-border bg-card p-4">
                      <header className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          {r.rating != null && (
                            <span className="inline-flex">
                              {Array.from({ length: Math.round(r.rating) }).map((_, i) => (
                                <Star key={i} className="h-3.5 w-3.5 fill-brand-orange text-brand-orange" />
                              ))}
                            </span>
                          )}
                           {r.title && <span className="font-semibold text-sm">{safeText(r.title)}</span>}
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {formatDate(r.published_date)}
                        </span>
                      </header>
                      {r.text && (
                        <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                           {safeText(r.text)}
                        </p>
                      )}
                      <footer className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                         {r.user_name && <span>— {safeText(r.user_name)}</span>}
                         {r.user_location && <span>· {safeText(r.user_location)}</span>}
                         {r.trip_type && <span>· {safeText(r.trip_type)}</span>}
                      </footer>
                    </article>
                  ))}
                </div>
                {data.tripadvisor_url && (
                  <p className="mt-4 text-xs text-muted-foreground">
                    Fonte: TripAdvisor. As avaliações são de hóspedes verificados.
                  </p>
                )}
              </section>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Lightbox — imagem em tela cheia */}
      {lightbox != null && photos[lightbox] && (
        <div
          className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center"
          onClick={() => setLightbox(null)}
        >
          <button
            type="button"
            className="absolute top-4 right-4 rounded-full bg-white/10 hover:bg-white/20 text-white p-2"
            onClick={(e) => { e.stopPropagation(); setLightbox(null); }}
            aria-label="Fechar"
          >
            <X className="h-5 w-5" />
          </button>
          {photos.length > 1 && (
            <>
              <button
                type="button"
                className="absolute left-4 rounded-full bg-white/10 hover:bg-white/20 text-white p-3"
                onClick={(e) => {
                  e.stopPropagation();
                  setLightbox((i) => (i == null ? i : (i - 1 + photos.length) % photos.length));
                }}
                aria-label="Foto anterior"
              >
                <ChevronLeft className="h-6 w-6" />
              </button>
              <button
                type="button"
                className="absolute right-4 rounded-full bg-white/10 hover:bg-white/20 text-white p-3"
                onClick={(e) => {
                  e.stopPropagation();
                  setLightbox((i) => (i == null ? i : (i + 1) % photos.length));
                }}
                aria-label="Próxima foto"
              >
                <ChevronRight className="h-6 w-6" />
              </button>
            </>
          )}
          <img
            src={photos[lightbox]}
            alt=""
            className="max-h-[92vh] max-w-[92vw] object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-white/10 text-white text-xs px-3 py-1.5">
            {lightbox + 1} / {photos.length}
          </div>
        </div>
      )}
    </>
  );
}
