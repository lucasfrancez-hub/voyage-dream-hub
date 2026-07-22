import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ChevronLeft,
  ChevronRight,
  Star,
  MapPin,
  X,
  Loader2,
  ExternalLink,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { getTripAdvisorPublicHotelInfo, type TAPublicHotelInfo } from "@/lib/tripadvisor.functions";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  locationId: number;
  hotelName: string;
  fallbackPhotos?: string[];
  initialPhotoIndex?: number;
};

function formatRelative(iso: string | null): string {
  if (!iso) return "";
  try {
    const d = new Date(iso).getTime();
    if (Number.isNaN(d)) return "";
    const diff = Date.now() - d;
    const day = 24 * 60 * 60 * 1000;
    if (diff < day) return "HOJE";
    if (diff < 2 * day) return "ONTEM";
    if (diff < 7 * day) return `HÁ ${Math.floor(diff / day)} DIAS`;
    if (diff < 30 * day) return `HÁ ${Math.floor(diff / (7 * day))} SEMANAS`;
    if (diff < 365 * day) return `HÁ ${Math.floor(diff / (30 * day))} MESES`;
    return `HÁ ${Math.floor(diff / (365 * day))} ANOS`;
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

function initials(name: string | null | undefined): string {
  const n = (name || "").trim();
  if (!n) return "?";
  const parts = n.split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || n[0]!.toUpperCase();
}

function Stars({ value }: { value: number | null }) {
  const r = Math.max(0, Math.min(5, Math.round(value ?? 0)));
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={`h-3.5 w-3.5 ${i <= r ? "fill-[hsl(var(--brand-orange))] text-[hsl(var(--brand-orange))]" : "text-white/15"}`}
        />
      ))}
    </div>
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
  const { data, isLoading } = useQuery<TAPublicHotelInfo>({
    queryKey: ["ta-public-hotel", locationId],
    queryFn: () => fetchInfo({ data: { locationId } }) as Promise<TAPublicHotelInfo>,
    enabled: open && locationId > 0,
    staleTime: 1000 * 60 * 60,
    gcTime: 1000 * 60 * 60 * 24,
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

  const displayName = safeText(data?.name) || hotelName;
  const tripUrl = data?.tripadvisor_url ?? null;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-7xl w-[96vw] h-[88vh] p-0 gap-0 border border-white/10 bg-[#0A0A0B] rounded-[28px] overflow-hidden [&>button]:hidden">
          <DialogTitle className="sr-only">{displayName}</DialogTitle>
          <DialogDescription className="sr-only">
            Fotos, descrição e avaliações do hotel
          </DialogDescription>

          <div className="flex h-full flex-col text-zinc-100">
            {/* Header */}
            <header className="flex-none px-6 md:px-8 py-5 border-b border-white/5 flex items-center justify-between gap-4 bg-gradient-to-r from-white/[0.02] to-transparent">
              <div className="min-w-0 space-y-1.5">
                <div className="flex flex-wrap items-center gap-3">
                  <h1 className="text-xl md:text-2xl font-bold text-white tracking-tight truncate">
                    {displayName}
                  </h1>
                  {data?.rating != null && (
                    <div className="flex items-center gap-1.5 bg-[hsl(var(--brand-orange))]/10 border border-[hsl(var(--brand-orange))]/25 px-2 py-0.5 rounded-md">
                      <span className="text-[hsl(var(--brand-orange))] font-bold text-sm">
                        {data.rating.toFixed(1)}
                      </span>
                      <Stars value={data.rating} />
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-zinc-400">
                  {data?.num_reviews != null && (
                    <span className="underline decoration-zinc-700 underline-offset-4">
                      {data.num_reviews.toLocaleString("pt-BR")} avaliações
                    </span>
                  )}
                  {data?.address && (
                    <div className="flex items-center gap-2 min-w-0">
                      <MapPin className="h-4 w-4 text-zinc-500 shrink-0" />
                      <span className="truncate">{safeText(data.address)}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                {tripUrl && (
                  <a
                    href={tripUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="hidden md:inline-flex items-center gap-2 bg-[hsl(var(--brand-orange))] hover:bg-[hsl(var(--brand-orange))]/90 text-white px-5 py-2.5 rounded-2xl font-bold text-sm transition-all shadow-lg shadow-[hsl(var(--brand-orange))]/25 active:scale-95"
                  >
                    Ver todas as fotos e reviews no TripAdvisor
                    <ExternalLink className="h-4 w-4" />
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => onOpenChange(false)}
                  aria-label="Fechar"
                  className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-white/10 text-zinc-400 hover:text-white transition-all"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </header>

            {/* Split workspace */}
            <div className="flex-1 flex flex-col md:flex-row overflow-hidden min-h-0">
              {/* LEFT — gallery */}
              <div className="md:w-[65%] flex flex-col p-5 md:p-6 gap-5 min-h-0">
                {/* Main image */}
                <div className="relative flex-1 min-h-0 group rounded-2xl overflow-hidden border border-white/5 bg-white/5">
                  {isLoading && !photos.length ? (
                    <div className="absolute inset-0 flex items-center justify-center text-zinc-500">
                      <Loader2 className="h-6 w-6 animate-spin" />
                    </div>
                  ) : photos.length > 0 ? (
                    <>
                      <img
                        src={photos[activePhoto]}
                        alt={`${displayName} — foto ${activePhoto + 1}`}
                        className="absolute inset-0 h-full w-full object-cover cursor-zoom-in"
                        onClick={() => setLightbox(activePhoto)}
                      />
                      {photos.length > 1 && (
                        <>
                          <div className="absolute inset-y-0 left-0 flex items-center pl-4 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); setActivePhoto((i) => (i - 1 + photos.length) % photos.length); }}
                              className="w-11 h-11 rounded-full bg-black/60 backdrop-blur-md flex items-center justify-center border border-white/10 text-white hover:bg-[hsl(var(--brand-orange))] transition-colors"
                              aria-label="Foto anterior"
                            >
                              <ChevronLeft className="h-6 w-6" />
                            </button>
                          </div>
                          <div className="absolute inset-y-0 right-0 flex items-center pr-4 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); setActivePhoto((i) => (i + 1) % photos.length); }}
                              className="w-11 h-11 rounded-full bg-black/60 backdrop-blur-md flex items-center justify-center border border-white/10 text-white hover:bg-[hsl(var(--brand-orange))] transition-colors"
                              aria-label="Próxima foto"
                            >
                              <ChevronRight className="h-6 w-6" />
                            </button>
                          </div>
                        </>
                      )}
                      <div className="absolute bottom-4 right-4 px-3 py-1.5 bg-black/60 backdrop-blur-md rounded-xl text-white text-xs font-bold border border-white/10">
                        {activePhoto + 1} / {photos.length}
                      </div>
                    </>
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center text-zinc-500 text-sm">
                      Sem fotos disponíveis
                    </div>
                  )}
                </div>

                {/* Filmstrip */}
                {photos.length > 1 && (
                  <div className="flex-none overflow-x-auto no-scrollbar pb-1">
                    <div className="flex gap-3">
                      {photos.map((src, i) => (
                        <button
                          key={`${src}-${i}`}
                          type="button"
                          onClick={() => setActivePhoto(i)}
                          className={`flex-none w-28 h-20 md:w-32 md:h-[88px] rounded-xl overflow-hidden transition-all ${
                            i === activePhoto
                              ? "ring-2 ring-[hsl(var(--brand-orange))]"
                              : "border border-white/10 opacity-60 hover:opacity-100 hover:scale-105"
                          }`}
                        >
                          <img src={src} alt="" loading="lazy" className="w-full h-full object-cover" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* RIGHT — content & reviews */}
              <div className="md:w-[35%] flex flex-col border-t md:border-t-0 md:border-l border-white/5 min-h-0">
                {/* About (fixed) */}
                {(data?.description || isLoading) && (
                  <section className="p-6 md:p-7 flex-none border-b border-white/5 bg-gradient-to-b from-white/[0.02] to-transparent">
                    <div className="flex items-center justify-between gap-3 mb-3">
                      <h2 className="text-base font-bold text-white">Sobre o hotel</h2>
                      {data?.description_translated_from && (
                        <span className="text-[10px] uppercase font-bold tracking-widest text-zinc-400 bg-zinc-900 border border-white/5 px-2 py-1 rounded">
                          Traduzido do {langLabel(data.description_translated_from)}
                        </span>
                      )}
                    </div>
                    {isLoading && !data?.description ? (
                      <div className="space-y-2">
                        <div className="h-3 w-full rounded bg-white/5 animate-pulse" />
                        <div className="h-3 w-11/12 rounded bg-white/5 animate-pulse" />
                        <div className="h-3 w-4/5 rounded bg-white/5 animate-pulse" />
                      </div>
                    ) : (
                      <p className="text-sm text-zinc-400 leading-relaxed max-h-40 overflow-y-auto custom-scrollbar pr-2">
                        {safeText(data?.description)}
                      </p>
                    )}
                  </section>
                )}

                {/* Reviews feed */}
                <div className="flex-1 overflow-y-auto px-6 md:px-7 py-4 space-y-4 custom-scrollbar min-h-0">
                  <div className="sticky top-0 z-10 py-2 -mx-1 px-1 bg-[#0A0A0B]">
                    <h2 className="text-xs font-bold text-zinc-500 uppercase tracking-widest">
                      Avaliações recentes
                    </h2>
                  </div>

                  {isLoading && !data?.reviews?.length && (
                    <div className="flex items-center gap-2 text-zinc-500 text-sm py-4">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Carregando avaliações…
                    </div>
                  )}

                  {data?.reviews?.map((r) => (
                    <article
                      key={r.id}
                      className="p-5 rounded-2xl bg-white/[0.03] border border-white/5 hover:bg-white/[0.05] transition-colors group"
                    >
                      <div className="flex justify-between items-start mb-3 gap-2">
                        <Stars value={r.rating} />
                        <time className="text-[10px] font-bold text-zinc-500 tracking-wider">
                          {formatRelative(r.published_date)}
                        </time>
                      </div>
                      {r.title && (
                        <h3 className="font-bold text-white mb-2 group-hover:text-[hsl(var(--brand-orange))] transition-colors leading-snug">
                          {safeText(r.title)}
                        </h3>
                      )}
                      {r.text && (
                        <p className="text-sm text-zinc-400 leading-snug mb-4 whitespace-pre-line">
                          {safeText(r.text)}
                        </p>
                      )}
                      {r.translated_from && (
                        <div className="mb-3">
                          <span className="text-[10px] uppercase font-bold tracking-widest text-[hsl(var(--brand-orange))] bg-[hsl(var(--brand-orange))]/10 px-2 py-0.5 rounded">
                            Traduzido do {langLabel(r.translated_from)}
                          </span>
                        </div>
                      )}
                      {(r.user_name || r.trip_type || r.user_location) && (
                        <div className="flex items-center gap-3 pt-3 border-t border-white/5">
                          <div className="w-8 h-8 rounded-full bg-[hsl(var(--brand-orange))]/15 flex items-center justify-center text-[10px] font-bold text-[hsl(var(--brand-orange))] border border-[hsl(var(--brand-orange))]/20">
                            {initials(r.user_name)}
                          </div>
                          <div className="min-w-0">
                            {r.user_name && (
                              <p className="text-xs font-bold text-zinc-200 truncate">
                                {safeText(r.user_name)}
                              </p>
                            )}
                            <p className="text-[10px] text-zinc-500 uppercase tracking-wider truncate">
                              {[safeText(r.trip_type), safeText(r.user_location)].filter(Boolean).join(" · ")}
                            </p>
                          </div>
                        </div>
                      )}
                    </article>
                  ))}

                  {!isLoading && !data?.reviews?.length && (
                    <p className="text-sm text-zinc-500 py-4">Nenhuma avaliação disponível.</p>
                  )}

                  {tripUrl && (
                    <div className="py-4 text-center">
                      <a
                        href={tripUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 text-[11px] font-bold text-zinc-500 hover:text-[hsl(var(--brand-orange))] uppercase tracking-widest transition-colors"
                      >
                        Ver todos no TripAdvisor <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  )}
                </div>

                {/* Mobile CTA */}
                {tripUrl && (
                  <div className="md:hidden p-4 border-t border-white/5">
                    <a
                      href={tripUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center justify-center gap-2 w-full bg-[hsl(var(--brand-orange))] hover:bg-[hsl(var(--brand-orange))]/90 text-white px-4 py-3 rounded-2xl font-bold text-sm transition-all"
                    >
                      Ver todas as fotos e reviews no TripAdvisor
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </div>
                )}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Lightbox */}
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
