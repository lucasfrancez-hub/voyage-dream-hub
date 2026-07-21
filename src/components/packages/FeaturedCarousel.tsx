/**
 * Carrossel de "Pacotes em destaque" para a página pública /pacotes.
 * - Auto-play (pausa no hover)
 * - Botões prev/next
 * - Se o usuário permitir geolocalização, reordena priorizando os pacotes
 *   cuja origem esteja mais próxima da posição atual.
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { MapPin, Navigation } from "lucide-react";
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

  // Marquee 100% CSS — mais confiável que rAF. A trilha (`.vfc-track`) tem
  // 2x a lista (loop) e desliza -50% em N segundos, infinito e linear. No
  // hover, pausa via `animation-play-state`.
  if (featured.length === 0) return null;
  const loop = [...featured, ...featured];
  const durationSec = Math.max(30, featured.length * 4.5);

  return (
    <div className="relative mb-6 overflow-hidden rounded-[2rem] border border-white/5 bg-[#0B1218] p-6 shadow-[0_32px_64px_-16px_rgba(0,0,0,0.6)] sm:p-8">
      {/* Auras laranjas decorativas nas quinas — glow bem sutil */}
      <div className="pointer-events-none absolute -top-24 -left-24 h-64 w-64 rounded-full bg-brand-orange/[0.07] blur-[100px]" />
      <div className="pointer-events-none absolute -bottom-24 -right-24 h-64 w-64 rounded-full bg-brand-orange/[0.07] blur-[100px]" />

      <style>{`
        @keyframes vfc-marquee {
          from { transform: translate3d(0, 0, 0); }
          to   { transform: translate3d(-50%, 0, 0); }
        }
        .vfc-track {
          animation: vfc-marquee ${durationSec}s linear infinite;
          will-change: transform;
        }
        .vfc-viewport:hover .vfc-track { animation-play-state: paused; }
      `}</style>

      <div className="relative z-10 mb-6 flex items-center gap-4">
        {/* Badge do ícone com glow laranja atrás */}
        <div className="relative shrink-0">
          <div className="absolute inset-0 rounded-2xl bg-brand-orange opacity-25 blur-xl" />
          <div className="relative flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-orange shadow-[0_8px_16px_rgba(242,107,31,0.25)]">
            <MapPin className="h-5 w-5 text-white" strokeWidth={2.4} />
          </div>
        </div>
        <div className="min-w-0">
          <div className="text-[13px] font-extrabold uppercase tracking-[0.2em] text-brand-orange">
            Pacotes em destaque
          </div>
          {nearestOrigin ? (
            <div className="mt-0.5 flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-white/40">
              <Navigation className="h-3 w-3" />
              Priorizando saídas próximas de você
            </div>
          ) : (
            <div className="mt-0.5 text-[11px] font-medium uppercase tracking-wide text-white/40">
              Ofertas escolhidas a dedo pra sua próxima viagem
            </div>
          )}
        </div>
      </div>



      <div
        className="vfc-viewport relative overflow-hidden"
        style={{
          maskImage:
            "linear-gradient(to right, transparent, #000 32px, #000 calc(100% - 32px), transparent)",
          WebkitMaskImage:
            "linear-gradient(to right, transparent, #000 32px, #000 calc(100% - 32px), transparent)",
        }}
      >
        <div className="vfc-track flex w-max gap-3.5 pb-1">

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

                  {/* Chip destino — laranja da marca */}
                  <div className="absolute top-2.5 left-2.5 inline-flex items-center gap-1 rounded-full bg-brand-orange px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-white shadow-lg shadow-black/30 ring-1 ring-white/20">
                    <MapPin className="h-2.5 w-2.5 text-white" />
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

