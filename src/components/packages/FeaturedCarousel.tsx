/**
 * Carrossel de "Pacotes em destaque" para a página pública /pacotes.
 * - Auto-play (pausa no hover)
 * - Botões prev/next
 * - Se o usuário permitir geolocalização, reordena priorizando os pacotes
 *   cuja origem esteja mais próxima da posição atual.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { MapPin, Navigation, ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { formatBRL } from "@/lib/format";
import { selectCuratedPackages, selectMixedFeatured } from "@/lib/packages/curation-select";



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
  going_date?: string | null;
  return_date?: string | null;
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

/** Formata "2026-03-14" → "14 mar" (pt-BR, curto, sem timezone shift). */
function fmtShortDate(iso?: string | null): string | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return null;
  const months = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  return `${m[3]} ${months[Number(m[2]) - 1]}`;
}

export function FeaturedCarousel({
  packages,
  linkBaseUrl,
  hideBrandHeader = false,
  viewAllUrl,
  mixMode = false,
  cardAspect = "4/5",
}: {
  packages: PkgLite[];
  linkBaseUrl?: string;
  /** Esconde o badge/título "Pacotes em destaque" — usado no embed WordPress. */
  hideBrandHeader?: boolean;
  /** Se setado, mostra botão "Ver todos os pacotes" no topo (abre nova aba). */
  viewAllUrl?: string;
  /** Vitrine mesclada: metade BR (feriados/próximos) + metade internacional, por menor preço. */
  mixMode?: boolean;
  /** Proporção do card. "3/4" gera cards mais altos (usado no embed 496px). */
  cardAspect?: "4/5" | "3/4" | "2/3" | "3/5";
}) {

  const [userCoords, setUserCoords] = useState<[number, number] | null>(null);
  const [nearestOrigin, setNearestOrigin] = useState<string | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const pauseUntilRef = useRef(0);
  // Largura de card calculada pra caber exatamente 5 por vez.
  const [cardW, setCardW] = useState<number>(240);

  // Mede o viewport e escolhe quantos cards ficam visíveis conforme largura.
  // Mobile mostra ~1.6 cards (deixa o próximo "espiando"), tablet ~2.6, desktop 5.
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const GAP = 14;
    const recalc = () => {
      const w = el.clientWidth;
      if (!w) return;
      const visible = w < 480 ? 1.6 : w < 768 ? 2.6 : w < 1100 ? 3.6 : 5;
      const next = Math.max(150, Math.floor((w - GAP * Math.floor(visible)) / visible));
      setCardW(next);
    };
    recalc();
    const ro = new ResizeObserver(recalc);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);



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
    // mixMode: vitrine mesclada BR + internacional (widget WordPress).
    // Caso contrário, mesma seleção da aba "Curadoria de IA".
    const curated = mixMode
      ? selectMixedFeatured(packages || [], 12)
      : selectCuratedPackages(packages || []);
    const base = curated.length
      ? curated
      : (packages || []).filter((p) => p.is_active).sort(
          (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0),
        );

    if (!userCoords) return base.slice(0, 12);

    // Raio de priorização: só considera "próximo" origens até 250 km
    // (ex.: em Paranavaí pega Maringá ~75km e Londrina ~150km, mas não Curitiba ~450km).
    const RADIUS_KM = 250;
    const scored = base.map((p) => {
      const c = coordsFor(p.origin);
      const dist = c ? haversineKm(userCoords, c) : Number.POSITIVE_INFINITY;
      return { p, dist };
    });
    const near = scored.filter((s) => s.dist <= RADIUS_KM).sort((a, b) => a.dist - b.dist);
    const far = scored.filter((s) => s.dist > RADIUS_KM); // mantém ordem original (curadoria)
    const ordered = [...near, ...far];
    const nearest = near[0];
    if (nearest) setNearestOrigin(nearest.p.origin ?? null);
    else setNearestOrigin(null);
    return ordered.slice(0, 12).map((s) => s.p);
  }, [packages, userCoords, mixMode]);

  const loop = useMemo(() => [...featured, ...featured], [featured]);

  // Auto-scroll contínuo baseado em scrollLeft (permite controle manual).
  // Pausa quando hover ou quando o usuário clicou prev/next (por 4s).
  // Usa refs (não state) pra não reiniciar o rAF a cada mudança de hover.
  const hoverRef = useRef(false);
  useEffect(() => {
    const el = viewportRef.current;
    if (!el || featured.length === 0) return;
    let raf = 0;
    let last = performance.now();
    let acc = 0; // acumulador fracionário (scrollLeft é inteiro)
    const speed = 36; // px/s
    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      if (!hoverRef.current && now > pauseUntilRef.current) {
        acc += speed * dt;
        if (acc >= 1) {
          const step = Math.floor(acc);
          acc -= step;
          el.scrollLeft += step;
          const half = el.scrollWidth / 2;
          if (half > 0 && el.scrollLeft >= half) el.scrollLeft -= half;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [featured.length]);

  const nudge = (dir: 1 | -1) => {
    const el = viewportRef.current;
    if (!el) return;
    // Pausa o auto-play por 4s após qualquer interação manual.
    pauseUntilRef.current = performance.now() + 4000;
    el.scrollBy({ left: dir * (cardW + 14), behavior: "smooth" });
  };

  if (featured.length === 0) return null;

  return (
    <div
      className={`relative mb-4 overflow-hidden rounded-2xl p-6 sm:p-8 ${hideBrandHeader ? "" : "border border-border bg-card shadow-[0_12px_30px_-14px_rgba(0,0,0,0.45)]"}`}
      style={hideBrandHeader ? { background: "rgb(5, 20, 27)" } : undefined}
    >


      {/* Auras laranjas decorativas nas quinas — glow bem sutil */}
      <div className="pointer-events-none absolute -top-24 -left-24 h-64 w-64 rounded-full bg-brand-orange/[0.07] blur-[100px]" />
      <div className="pointer-events-none absolute -bottom-24 -right-24 h-64 w-64 rounded-full bg-brand-orange/[0.07] blur-[100px]" />

      <style>{`
        .vfc-viewport::-webkit-scrollbar { display: none; }
        .vfc-viewport { scrollbar-width: none; -ms-overflow-style: none; }
      `}</style>

      <div className="relative z-10 mb-6 flex items-center justify-between gap-4">
        {hideBrandHeader ? (
          <div className="min-w-0 order-2 ml-auto">
            {viewAllUrl && (
              <a
                href={viewAllUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-full bg-brand-orange px-4 py-2 text-[12px] font-bold uppercase tracking-[0.14em] text-white shadow-[0_8px_20px_rgba(242,107,31,0.35)] transition hover:brightness-110"
              >
                Ver todos os pacotes
                <span aria-hidden>→</span>
              </a>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-4 min-w-0 order-1 mr-auto">
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
        )}

        {/* Controles manuais — pausam o auto-play por 4s */}
        <div className={`flex shrink-0 gap-2 ${hideBrandHeader ? "order-1 mr-auto" : "order-2"}`}>
          <button
            type="button"
            aria-label="Anterior"
            onClick={() => nudge(-1)}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 text-white/60 transition hover:border-brand-orange/60 hover:bg-white/5 hover:text-white"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            aria-label="Próximo"
            onClick={() => nudge(1)}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 text-white/60 transition hover:border-brand-orange/60 hover:bg-white/5 hover:text-white"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>

      </div>

      <div
        ref={viewportRef}
        onMouseEnter={() => { hoverRef.current = true; }}
        onMouseLeave={() => { hoverRef.current = false; }}
        className="vfc-viewport relative overflow-x-auto overflow-y-hidden"
        style={{
          maskImage:
            "linear-gradient(to right, transparent, #000 32px, #000 calc(100% - 32px), transparent)",
          WebkitMaskImage:
            "linear-gradient(to right, transparent, #000 32px, #000 calc(100% - 32px), transparent)",
        }}
      >
        <div className="flex w-max gap-3.5 pb-1">

          {loop.map((p, i) => {
            const total = Number(p.price_per_person) * (p.base_occupancy ?? 2);
            const goStr = fmtShortDate(p.going_date);
            const retStr = fmtShortDate(p.return_date);
            const dateLabel = goStr && retStr ? `${goStr} — ${retStr}` : goStr || retStr;
            const cardClass =
              "group relative shrink-0 overflow-hidden rounded-2xl bg-[#0f1a26] ring-1 ring-white/10 transition duration-300 hover:-translate-y-0.5 hover:ring-brand-orange/60";
            const cardKey = `${p.id}-${i}`;
            const CardInner = (
              <div className={`relative ${cardAspect === "3/5" ? "aspect-[3/5]" : cardAspect === "2/3" ? "aspect-[2/3]" : cardAspect === "3/4" ? "aspect-[3/4]" : "aspect-[4/5]"} overflow-hidden`}>

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

                  {/* Chip destino — laranja da marca (canto superior esquerdo) */}
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
                    {dateLabel && (
                      <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-[#0f1a24]/85 px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-[0.12em] text-white shadow-md shadow-black/30 ring-1 ring-white/10 backdrop-blur-md">
                        <CalendarDays className="h-3 w-3 text-brand-orange" />
                        {dateLabel}
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
                style={{ width: cardW }}
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
                style={{ width: cardW }}
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


