/**
 * Carrossel de "Pacotes em destaque" para a página pública /pacotes.
 * - Auto-play (pausa no hover)
 * - Botões prev/next
 * - Se o usuário permitir geolocalização, reordena priorizando os pacotes
 *   cuja origem esteja mais próxima da posição atual.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { MapPin, Flame, Navigation } from "lucide-react";
import { formatBRL } from "@/lib/format";



/**
 * Quando `linkBaseUrl` é passado, os cards viram <a target="_blank"> apontando
 * pra {linkBaseUrl}/pacotes/{slug} — usado no embed que roda em iframe fora
 * da SPA (WordPress etc).
 */


type PkgLite = {
  id: string;
  slug: string;
  title: string;
  destination: string;
  origin: string | null;
  price_per_person: number | string;
  base_occupancy: number | null;
  image_url: string | null;
  sort_order: number | null;
  is_active: boolean;
};

/** Coordenadas aproximadas das cidades de origem que usamos nos pacotes. */
const ORIGIN_COORDS: Record<string, [number, number]> = {
  maringa: [-23.4205, -51.9331],
  londrina: [-23.3103, -51.1628],
  curitiba: [-25.4284, -49.2733],
  foz: [-25.5163, -54.5854],
  cascavel: [-24.9578, -53.4595],
  "sao paulo": [-23.5505, -46.6333],
  guarulhos: [-23.4356, -46.4731],
  campinas: [-22.9099, -47.0626],
  "rio de janeiro": [-22.9068, -43.1729],
  "belo horizonte": [-19.9167, -43.9345],
  brasilia: [-15.7939, -47.8828],
  salvador: [-12.9714, -38.5014],
  recife: [-8.0476, -34.8770],
  fortaleza: [-3.7319, -38.5267],
  "porto alegre": [-30.0346, -51.2177],
  florianopolis: [-27.5949, -48.5482],
  goiania: [-16.6864, -49.2643],
  cuiaba: [-15.6014, -56.0979],
  manaus: [-3.1190, -60.0217],
  belem: [-1.4558, -48.5039],
  navegantes: [-26.8797, -48.6516],
  joinville: [-26.3044, -48.8487],
  chapeco: [-27.1000, -52.6152],
};

function norm(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

function coordsFor(origin: string | null | undefined): [number, number] | null {
  if (!origin) return null;
  const key = norm(origin);
  if (ORIGIN_COORDS[key]) return ORIGIN_COORDS[key];
  for (const k of Object.keys(ORIGIN_COORDS)) {
    if (key.includes(k) || k.includes(key)) return ORIGIN_COORDS[k];
  }
  return null;
}

function haversineKm(a: [number, number], b: [number, number]) {
  const R = 6371;
  const toRad = (v: number) => (v * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]);
  const dLon = toRad(b[1] - a[1]);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export function FeaturedCarousel({
  packages,
  linkBaseUrl,
}: {
  packages: PkgLite[];
  linkBaseUrl?: string;
}) {

  const [userCoords, setUserCoords] = useState<[number, number] | null>(null);
  const [nearestOrigin, setNearestOrigin] = useState<string | null>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(false);

  // Solicita geolocalização silenciosamente (o navegador pede permissão).
  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setUserCoords([pos.coords.latitude, pos.coords.longitude]),
      () => {},
      { maximumAge: 10 * 60 * 1000, timeout: 4000, enableHighAccuracy: false },
    );
  }, []);

  const featured = useMemo(() => {
    const active = (packages || []).filter((p) => p.is_active);
    // "Destaques" = os de menor sort_order (mais no topo do admin).
    const base = [...active].sort(
      (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0),
    );

    if (!userCoords) return base.slice(0, 12);

    // Ranking por proximidade: cada pacote recebe a distância da origem
    // até o usuário; sem origem conhecida ficam no fim.
    const scored = base.map((p) => {
      const c = coordsFor(p.origin);
      const dist = c ? haversineKm(userCoords, c) : Number.POSITIVE_INFINITY;
      return { p, dist };
    });
    scored.sort((a, b) => a.dist - b.dist);
    const nearest = scored.find((s) => Number.isFinite(s.dist));
    if (nearest) setNearestOrigin(nearest.p.origin ?? null);
    return scored.slice(0, 12).map((s) => s.p);
  }, [packages, userCoords]);

  // Auto-scroll contínuo (marquee) via requestAnimationFrame. Pausa no hover
  // e enquanto o usuário arrasta com prev/next. Lista é duplicada pra loop
  // sem "salto" visível.
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el || featured.length === 0) return;
    let raf = 0;
    let last = performance.now();
    const SPEED = 28; // px por segundo — bem suave, contínuo

    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      if (!paused) {
        const half = el.scrollWidth / 2;
        let next = el.scrollLeft + SPEED * dt;
        if (next >= half) next -= half;
        el.scrollLeft = next;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [paused, featured.length]);

  if (featured.length === 0) return null;

  // Duplica os cards pra formar um loop visualmente contínuo.
  const loop = [...featured, ...featured];

  const scrollBy = (dir: 1 | -1) => {
    const el = scrollerRef.current;
    if (!el) return;
    const step = el.querySelector<HTMLElement>("[data-card]")?.offsetWidth ?? 220;
    el.scrollBy({ left: dir * (step + 14) * 2, behavior: "smooth" });
  };

  return (
    <div
      className="mb-6 overflow-hidden rounded-2xl border border-white/5 bg-gradient-to-br from-[#12202f] to-[#0a1622] p-4 shadow-lg"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-orange/20">
            <Sparkles className="h-4 w-4 text-brand-orange" />
          </div>
          <div>
            <div className="text-[13px] font-bold uppercase tracking-[0.18em] text-brand-orange">
              Pacotes em destaque
            </div>
            {nearestOrigin && (
              <div className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                <Navigation className="h-3 w-3" />
                Priorizando saídas próximas de você · {nearestOrigin}
              </div>
            )}
          </div>
        </div>
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => scrollBy(-1)}
            className="rounded-full border border-white/10 bg-white/5 p-2 text-muted-foreground transition hover:border-brand-orange/60 hover:text-brand-orange"
            aria-label="Anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => scrollBy(1)}
            className="rounded-full border border-white/10 bg-white/5 p-2 text-muted-foreground transition hover:border-brand-orange/60 hover:text-brand-orange"
            aria-label="Próximo"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Máscara nas bordas pra dar sensação de fluxo contínuo */}
      <div
        className="relative"
        style={{
          maskImage:
            "linear-gradient(to right, transparent, #000 32px, #000 calc(100% - 32px), transparent)",
          WebkitMaskImage:
            "linear-gradient(to right, transparent, #000 32px, #000 calc(100% - 32px), transparent)",
        }}
      >
        <div
          ref={scrollerRef}
          className="flex gap-3.5 overflow-x-auto pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
        >
          {loop.map((p, i) => {
            const total = Number(p.price_per_person) * (p.base_occupancy ?? 2);
            const cardClass =
              "group relative w-[230px] shrink-0 overflow-hidden rounded-2xl bg-[#0f1a26] ring-1 ring-white/10 transition duration-300 hover:-translate-y-0.5 hover:ring-brand-orange/60";
            const cardKey = `${p.id}-${i}`;
            const CardInner = (
              <div className="relative aspect-[4/5] overflow-hidden">

                  {p.image_url ? (
                    <img
                      src={p.image_url}
                      alt={p.title}
                      loading="lazy"
                      decoding="async"
                      className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.08]"
                    />
                  ) : (
                    <div className="absolute inset-0 bg-muted" />
                  )}
                  {/* Gradient forte no rodapé pra dar contraste ao texto */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/40 to-transparent" />

                  {/* Chip destino — glass, discreto */}
                  <div className="absolute top-2.5 left-2.5 inline-flex items-center gap-1 rounded-full bg-black/45 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-white backdrop-blur-md ring-1 ring-white/15">
                    <MapPin className="h-2.5 w-2.5 text-brand-orange" />
                    {p.destination}
                  </div>

                  <div className="absolute bottom-0 left-0 right-0 p-3.5">
                    <div
                      className="line-clamp-2 text-[15px] font-bold text-white leading-tight tracking-[-0.01em]"
                      style={{ textShadow: "0 2px 12px rgba(0,0,0,0.7)" }}
                    >
                      {p.title}
                    </div>
                    {p.origin && (
                      <div className="mt-1 text-[11px] font-medium text-white/85">
                        Saindo de {p.origin}
                      </div>
                    )}
                    <div className="mt-2.5 flex items-baseline gap-1.5">
                      <span className="text-[10px] uppercase tracking-wider text-white/55">
                        a partir de
                      </span>
                    </div>
                    <div className="text-[17px] font-extrabold text-brand-orange leading-none tracking-tight">
                      {formatBRL(total)}
                    </div>
                  </div>
                </div>
            );
            return linkBaseUrl ? (
              <a
                key={cardKey}
                href={`${linkBaseUrl.replace(/\/$/, "")}/pacotes/${p.slug}`}
                target="_blank"
                rel="noopener noreferrer"
                data-card
                className={cardClass}
              >
                {CardInner}
              </a>
            ) : (
              <Link
                key={cardKey}
                to="/pacotes/$slug"
                params={{ slug: p.slug }}
                data-card
                className={cardClass}
              >
                {CardInner}
              </Link>
            );
          })}

        </div>
      </div>
    </div>
  );
}

