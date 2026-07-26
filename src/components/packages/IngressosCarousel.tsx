/**
 * Carrossel de "Ingressos & experiências" para embed em WordPress.
 * Estilo visual alinhado à página /ingressos (card com data em bloco).
 * Ordem aleatória (embaralhada a cada carregamento) — distribui uniformemente
 * entre todos os itens ativos.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Ticket, MapPin, ChevronLeft, ChevronRight, Sparkles, ArrowRight } from "lucide-react";
import { formatBRL } from "@/lib/format";

type TicketLite = {
  id: string;
  slug: string;
  title: string;
  destination: string | null;
  going_date: string | null;
  return_date: string | null;
  price_per_person: number | string;
  base_occupancy: number | null;
  pricing_mode: string | null;
  date_mode: string | null;
  image_url: string | null;
  is_active: boolean;
};

const MONTH_ABBR = [
  "JAN","FEV","MAR","ABR","MAI","JUN","JUL","AGO","SET","OUT","NOV","DEZ",
];

function parseDateBlock(iso: string | null | undefined) {
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return null;
  const dow = new Date(y, m - 1, d).toLocaleDateString("pt-BR", { weekday: "short" });
  return {
    day: String(d).padStart(2, "0"),
    month: MONTH_ABBR[m - 1] ?? "",
    dow: dow.replace(".", "").toUpperCase(),
  };
}

function priceFrom(p: TicketLite) {
  const mult = p.pricing_mode === "per_unit" ? 1 : p.base_occupancy ?? 1;
  return Number(p.price_per_person) * mult;
}

/** Fisher–Yates */
function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function IngressosCarousel({
  items,
  linkBaseUrl,
  viewAllUrl,
}: {
  items: TicketLite[];
  linkBaseUrl: string;
  viewAllUrl?: string;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const pauseUntilRef = useRef(0);
  const hoverRef = useRef(false);
  const [cardW, setCardW] = useState(240);

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

  const shuffled = useMemo(
    () => shuffle((items || []).filter((p) => p.is_active)).slice(0, 20),
    [items],
  );
  const loop = useMemo(() => [...shuffled, ...shuffled], [shuffled]);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el || shuffled.length === 0) return;
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    const speed = 36;
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
  }, [shuffled.length]);

  const nudge = (dir: 1 | -1) => {
    const el = viewportRef.current;
    if (!el) return;
    pauseUntilRef.current = performance.now() + 4000;
    el.scrollBy({ left: dir * (cardW + 14), behavior: "smooth" });
  };

  if (shuffled.length === 0) return null;

  return (
    <div
      className="relative mb-4 overflow-hidden rounded-2xl p-6 sm:p-8"
      style={{ background: "rgb(5, 20, 27)" }}
    >
      <div className="pointer-events-none absolute -top-24 -left-24 h-64 w-64 rounded-full bg-brand-orange/[0.08] blur-[100px]" />
      <div className="pointer-events-none absolute -bottom-24 -right-24 h-64 w-64 rounded-full bg-brand-orange/[0.08] blur-[100px]" />

      <style>{`
        .vic-viewport::-webkit-scrollbar { display: none; }
        .vic-viewport { scrollbar-width: none; -ms-overflow-style: none; }
      `}</style>

      <div className="relative z-10 mb-6 flex items-center justify-between gap-4">
        <div className="flex shrink-0 gap-2 order-1 mr-auto">
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
        {viewAllUrl && (
          <a
            href={viewAllUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-full bg-brand-orange px-4 py-2 text-[12px] font-bold uppercase tracking-[0.14em] text-white shadow-[0_8px_20px_rgba(242,107,31,0.35)] transition hover:brightness-110 order-2 ml-auto"
          >
            Ver todos os ingressos
            <ArrowRight className="h-3.5 w-3.5" />
          </a>
        )}
      </div>

      <div
        ref={viewportRef}
        onMouseEnter={() => { hoverRef.current = true; }}
        onMouseLeave={() => { hoverRef.current = false; }}
        className="vic-viewport relative overflow-x-auto overflow-y-hidden"
        style={{
          maskImage:
            "linear-gradient(to right, transparent, #000 32px, #000 calc(100% - 32px), transparent)",
          WebkitMaskImage:
            "linear-gradient(to right, transparent, #000 32px, #000 calc(100% - 32px), transparent)",
        }}
      >
        <div className="flex w-max gap-3.5 pb-1">
          {loop.map((p, i) => {
            const dateBlock = parseDateBlock(p.going_date);
            const total = priceFrom(p);
            const cardKey = `${p.id}-${i}`;
            return (
              <a
                key={cardKey}
                href={`${linkBaseUrl.replace(/\/$/, "")}/pacotes/${p.slug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="group relative shrink-0 overflow-hidden rounded-2xl bg-[#0f1a26] ring-1 ring-white/10 transition duration-300 hover:-translate-y-0.5 hover:ring-brand-orange/60"
                style={{ width: cardW }}
              >
                <div className="relative aspect-[3/4] overflow-hidden">
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
                  <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/40 to-transparent" />

                  <div className="absolute top-2.5 left-2.5 inline-flex items-center gap-1 rounded-full bg-brand-orange px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-white shadow-lg shadow-black/30 ring-1 ring-white/20">
                    <Ticket className="h-2.5 w-2.5 text-white" />
                    Ingresso
                  </div>

                  {p.destination && (
                    <div className="absolute top-2.5 right-2.5 inline-flex items-center gap-1 rounded-full bg-black/60 backdrop-blur px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-white ring-1 ring-white/10">
                      <MapPin className="h-2.5 w-2.5" /> {p.destination}
                    </div>
                  )}

                  {dateBlock ? (
                    <div className="absolute bottom-[92px] left-2.5 rounded-xl bg-background/95 backdrop-blur px-2.5 py-1.5 shadow-xl border border-border">
                      <div className="text-[9px] font-bold uppercase tracking-widest text-brand-orange leading-none">
                        {dateBlock.dow}
                      </div>
                      <div className="flex items-baseline gap-1 leading-none mt-1">
                        <span className="font-display text-xl font-black text-foreground">{dateBlock.day}</span>
                        <span className="font-display text-[11px] font-bold text-brand-orange">{dateBlock.month}</span>
                      </div>
                    </div>
                  ) : p.date_mode === "flexible" ? (
                    <div className="absolute bottom-[92px] left-2.5 inline-flex items-center gap-1 rounded-full bg-background/95 backdrop-blur px-2.5 py-1 text-[10px] font-bold text-foreground border border-border">
                      <Sparkles className="h-3 w-3 text-brand-orange" /> Data flexível
                    </div>
                  ) : null}

                  <div className="absolute bottom-0 left-0 right-0 p-3.5">
                    <div
                      className="line-clamp-2 text-[15px] font-bold text-white leading-tight tracking-[-0.01em]"
                      style={{ textShadow: "0 2px 12px rgba(0,0,0,0.7)" }}
                    >
                      {p.title}
                    </div>
                    <div className="mt-2 flex items-baseline gap-1.5">
                      <span className="text-[10px] uppercase tracking-wider text-white/55">
                        a partir de
                      </span>
                    </div>
                    <div className="text-[17px] font-extrabold text-brand-orange leading-none tracking-tight">
                      {formatBRL(total)}
                    </div>
                  </div>
                </div>
              </a>
            );
          })}
        </div>
      </div>
    </div>
  );
}
