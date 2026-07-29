import { useEffect, useMemo, useState } from "react";
import { MapPin, Plus, Clock, ChevronLeft, ChevronRight, Info } from "lucide-react";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatBRL } from "@/lib/format";
import {
  detectChildTokenFee,
  parseAgePolicy,
  agePolicyFromText,
  classifyChild,
  formatAgePolicy,
} from "@/lib/packages/child-fee";

const PAGE_SIZE = 5;

export type PriceRow = {
  package_id: string;
  date: string;
  modality: string | null;
  price_per_person: number | null;
  taxes: number | null;
  seats: number | null;
};

export type CartItem = {
  key: string;
  tourId: string;
  slug: string;
  title: string;
  date: string;
  modality: string | null;
  unit: number;
  qty: number;
};


export function TourResultCard({
  tour,
  rows,
  pax,
  adults,
  children: childCount = 0,
  childAges = [],
  from,
  to,
  onAdd,
  onReserve,
}: {
  tour: any;
  rows: PriceRow[];
  pax: number;
  adults?: number;
  children?: number;
  childAges?: number[];
  from?: string;
  to?: string;
  onAdd: (item: Omit<CartItem, "key">) => void;
  onReserve: (date: string, modality: string | null, qty: number) => void;
}) {
  const [page, setPage] = useState(0);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selDate, setSelDate] = useState<string | null>(null);
  const [selMod, setSelMod] = useState<string | null | undefined>(undefined);
  const sel =
    selDate && selMod !== undefined ? { date: selDate, modality: selMod } : null;

  const rangeLabel = useMemo(() => {
    const fmt = (iso: string) => {
      const [y, m, d] = iso.split("-").map(Number);
      return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`;
    };
    if (from && to) return `Período: ${fmt(from)} a ${fmt(to)}`;
    if (from) return `A partir de ${fmt(from)}`;
    if (to) return `Até ${fmt(to)}`;
    return "";
  }, [from, to]);


  const policy = useMemo(() => {
    const manual = parseAgePolicy(tour.services);
    if (manual) return manual;
    return agePolicyFromText(
      detectChildTokenFee(
        tour.ai_summary,
        tour.summary,
        tour.itinerary,
        typeof tour.tour_info === "string" ? tour.tour_info : JSON.stringify(tour.tour_info ?? ""),
      ),
    );
  }, [tour]);

  const childFee = policy;

  // Crianças gratuitas ou que pagam só a taxa no local não entram no valor
  const exemptChildren = useMemo(() => {
    if (!policy) return 0;
    const ages = childAges.slice(0, childCount);
    if (ages.length === 0) return 0;
    return ages.filter((age) => classifyChild(age, policy) !== "adult").length;
  }, [policy, childAges, childCount]);
  const payingPax = policy ? Math.max(1, pax - exemptChildren) : pax;




  const dates = useMemo(
    () => [...new Set(rows.map((r) => r.date))].sort(),
    [rows],
  );
  const modalities = useMemo(
    () => [...new Set(rows.map((r) => r.modality ?? ""))],
    [rows],
  );

  const cell = (modality: string, date: string) =>
    rows.find((r) => (r.modality ?? "") === modality && r.date === date);

  const unitOf = (r?: PriceRow) =>
    r ? (Number(r.price_per_person) || 0) + (Number(r.taxes) || 0) : null;

  const activeDate = selDate ?? dates[0] ?? null;
  const minUnitOnDate = (d: string) =>
    rows
      .filter((r) => r.date === d)
      .reduce<number | null>((acc, r) => {
        const v = unitOf(r)!;
        return acc == null || v < acc ? v : acc;
      }, null);

  const totalPages = Math.max(1, Math.ceil(dates.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const pageDates = dates.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  // Mantém a página sincronizada com a data selecionada
  useEffect(() => {
    if (!activeDate) return;
    const idx = dates.indexOf(activeDate);
    if (idx >= 0) setPage(Math.floor(idx / PAGE_SIZE));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDate]);



  const selected = sel ? cell(sel.modality ?? "", sel.date) : undefined;
  const selUnit = unitOf(selected);
  const minUnit = useMemo(
    () =>
      rows.reduce<number | null>((acc, r) => {
        const v = unitOf(r)!;
        return acc == null || v < acc ? v : acc;
      }, null),
    [rows],
  );
  const taxes = Number(selected?.taxes ?? rows[0]?.taxes ?? 0) || 0;

  const info = (tour.tour_info ?? {}) as any;
  const meetingPoint: string | undefined = info.meeting_point || tour.meeting_point;
  const times: string[] = Array.isArray(info.tour_times)
    ? info.tour_times
    : Array.isArray(tour.tour_times)
      ? tour.tour_times
      : [];

  const teaser = (() => {
    const raw: string =
      (tour as any).short_description ||
      (tour as any).ai_summary ||
      (tour as any).description ||
      (tour as any).itinerary ||
      "";
    if (!raw) return "";
    const clean = String(raw)
      .replace(/[#*_`>]/g, "")
      .replace(/^\s*[-•]\s*/gm, "")
      .replace(/\s+/g, " ")
      .trim();
    if (clean.length <= 180) return clean;
    const cut = clean.slice(0, 180);
    const stop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf(" "));
    return cut.slice(0, stop > 90 ? stop : 180).trim() + "…";
  })();



  return (
    <article className="overflow-hidden rounded-2xl border border-border bg-card shadow-xl">
      <div className="flex flex-col md:flex-row">
        {/* Esquerda: imagem compacta + informações */}
        <div className="flex w-full flex-col border-border p-5 md:w-[26%] md:border-r">
          <div className="relative mb-4 aspect-[4/3] w-full overflow-hidden rounded-xl bg-muted">
            {tour.image_url && (
              <img
                src={tour.image_url}
                alt={tour.title}
                loading="lazy"
                className="h-full w-full object-cover"
              />
            )}
            {tour.destination && (
              <span className="absolute left-2 top-2 rounded-full bg-brand-orange px-2.5 py-1 text-[9px] font-bold uppercase tracking-widest text-primary-foreground shadow-lg">
                {tour.destination}
              </span>
            )}
          </div>
          <div className="flex flex-1 flex-col gap-3">
            <h3 className="font-display text-lg font-bold leading-tight">{tour.title}</h3>
            {teaser && (
              <p className="-mt-1.5 line-clamp-3 text-[12.5px] leading-snug text-muted-foreground">
                {teaser}
              </p>
            )}

            <div className="space-y-1.5 text-[13px] text-muted-foreground">
              {meetingPoint && (
                <p className="flex items-start gap-2">
                  <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-orange" />
                  <span className="line-clamp-2">{meetingPoint}</span>
                </p>
              )}
              {times.length > 0 && (
                <p className="flex items-start gap-2">
                  <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-orange" />
                  <span className="line-clamp-1">Saídas: {times.join(", ")}</span>
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => setDetailsOpen(true)}
              className="mt-auto flex items-center gap-1.5 pt-3 text-[11px] font-bold uppercase tracking-wider text-brand-orange transition hover:opacity-80"
            >
              Ver detalhes do serviço
              <Info className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Centro: datas paginadas de 5 em 5 + modalidades */}
        <div className="flex w-full flex-col bg-muted/10 p-5 md:w-[48%]">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h4 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Escolha a data
              </h4>
              {rangeLabel && (
                <p className="mt-0.5 text-[11px] font-semibold text-brand-orange">{rangeLabel}</p>
              )}
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold tabular-nums text-muted-foreground">
                {safePage + 1}/{totalPages}
              </span>
              <button
                type="button"
                disabled={safePage === 0}
                onClick={() => setPage(Math.max(0, safePage - 1))}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-background transition hover:border-brand-orange hover:bg-muted disabled:opacity-30"
                aria-label="Datas anteriores"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                disabled={safePage >= totalPages - 1}
                onClick={() => setPage(Math.min(totalPages - 1, safePage + 1))}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-background transition hover:border-brand-orange hover:bg-muted disabled:opacity-30"
                aria-label="Próximas datas"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Bloquinhos de data — 5 por página */}
          <div className="grid grid-cols-5 gap-2">
            {pageDates.map((d) => {
              const u = minUnitOnDate(d);
              const [, mm, dd] = d.split("-");
              const wd = new Date(Number(d.slice(0, 4)), Number(mm) - 1, Number(dd))
                .toLocaleDateString("pt-BR", { weekday: "short" })
                .replace(".", "")
                .toUpperCase();
              const isActive = activeDate === d;
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => {
                    setSelDate(d);
                    setSelMod(undefined);
                  }}
                  className={`flex flex-col items-center justify-center rounded-xl border py-3 text-center transition ${
                    isActive
                      ? "border-brand-orange bg-brand-orange/15 shadow-[0_0_15px_rgba(242,107,31,0.2)]"
                      : "border-border bg-background hover:border-brand-orange/50"
                  }`}
                >
                  <span className="text-[9px] font-bold tracking-widest text-muted-foreground">
                    {wd}
                  </span>
                  <span
                    className={`text-base font-black leading-tight ${isActive ? "text-brand-orange" : "text-foreground"}`}
                  >
                    {dd}/{mm}
                  </span>
                  <span className="mt-0.5 text-[10px] text-muted-foreground">
                    {u != null ? formatBRL(u) : "—"}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Modalidades da data escolhida */}
          <p className="mb-2 mt-5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Modalidade
          </p>
          <div className="grid gap-2">
            {modalities.map((m) => {
              const r = activeDate ? cell(m, activeDate) : undefined;
              const u = unitOf(r);
              const isSel = sel?.date === activeDate && (sel?.modality ?? "") === m;
              return (
                <button
                  key={m || "unica"}
                  type="button"
                  disabled={u == null}
                  onClick={() => {
                    if (!activeDate) return;
                    setSelDate(activeDate);
                    setSelMod(m || null);
                  }}
                  className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left transition disabled:opacity-40 ${
                    isSel
                      ? "border-brand-orange bg-brand-orange/10"
                      : "border-border bg-background hover:border-brand-orange/50"
                  }`}
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <span
                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${isSel ? "border-brand-orange" : "border-border"}`}
                    >
                      {isSel && <span className="h-2 w-2 rounded-full bg-brand-orange" />}
                    </span>
                    <span className="text-[13px] font-medium leading-snug">
                      {m || tour.title}
                    </span>
                  </span>
                  <span
                    className={`shrink-0 text-sm font-bold ${isSel ? "text-brand-orange" : "text-foreground"}`}
                  >
                    {u != null ? formatBRL(u) : "—"}
                  </span>
                </button>
              );
            })}
          </div>



          <div className="mt-auto space-y-2 pt-4">
            <p className="text-[11px] text-muted-foreground">
              Taxas inclusas de {formatBRL(taxes)}
            </p>
            {childFee && (
              <div className="rounded-lg border border-brand-orange/30 bg-brand-orange/10 p-3">
                <p className="text-[11px] font-medium text-brand-orange">
                  {formatAgePolicy(childFee)}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Direita: reserva */}
        <aside className="flex w-full flex-col border-t border-border bg-muted/30 p-5 md:w-[26%] md:border-l md:border-t-0">
          <div className="space-y-5">
            <div>
              <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Data da atividade
              </p>
              <div className="rounded-lg border border-border bg-background px-3 py-2 text-sm">
                {sel ? (
                  <>
                    <span className="font-semibold">
                      {sel.date.split("-").reverse().join("/")}
                    </span>
                    <span className="block text-[11px] text-muted-foreground">
                      {sel.modality || tour.title}
                    </span>
                  </>
                ) : (
                  <span className="text-muted-foreground">Selecione na grade</span>
                )}
              </div>
            </div>

            <div className="border-t border-border pt-4">
              <p className="text-xs text-muted-foreground">
                {selUnit != null ? "Valor total" : "A partir de"}
              </p>
              <p className="font-display text-3xl font-black leading-none text-brand-orange">
                {formatBRL((selUnit ?? minUnit ?? 0) * payingPax)}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {formatBRL(selUnit ?? minUnit ?? 0)} por pessoa · {payingPax}{" "}
                {payingPax === 1 ? "pessoa" : "pessoas"}
                {exemptChildren > 0
                  ? ` · ${exemptChildren} ${exemptChildren === 1 ? "criança isenta" : "crianças isentas"}`
                  : ""}

              </p>
            </div>

            <div className="space-y-3 pt-1">
              <button
                type="button"
                disabled={!sel || selUnit == null}
                onClick={() => sel && onReserve(sel.date, sel.modality, payingPax)}
                className="w-full rounded-lg bg-brand-orange px-4 py-3 text-sm font-bold uppercase tracking-widest text-primary-foreground shadow-lg shadow-brand-orange/20 transition hover:opacity-90 disabled:opacity-40 disabled:shadow-none"
              >
                Reservar agora
              </button>
              <button
                type="button"
                disabled={!sel || selUnit == null}
                onClick={() =>
                  sel &&
                  selUnit != null &&
                  onAdd({
                    tourId: tour.id,
                    slug: tour.slug,
                    title: tour.title,
                    date: sel.date,
                    modality: sel.modality,
                    unit: selUnit,
                    qty: payingPax,
                  })
                }
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 py-2.5 text-xs font-bold uppercase tracking-widest transition hover:border-brand-orange/60 disabled:opacity-40"
              >
                <Plus className="h-3.5 w-3.5 text-brand-orange" /> Adicionar ao carrinho
              </button>
            </div>
          </div>
        </aside>
      </div>

      {/* Janelinha de detalhes do serviço */}
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-h-[88vh] max-w-3xl overflow-y-auto p-0">
          {tour.image_url && (
            <div className="relative h-48 w-full overflow-hidden sm:h-56">
              <img src={tour.image_url} alt={tour.title} className="h-full w-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
              {tour.destination && (
                <span className="absolute left-5 top-5 rounded-full bg-brand-orange px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-primary-foreground shadow-lg">
                  {tour.destination}
                </span>
              )}
            </div>
          )}
          <div className="space-y-6 px-6 pb-6 pt-2">
            <DialogHeader className="space-y-1 text-left">
              <p className="text-[10px] font-bold uppercase tracking-widest text-brand-orange">
                Serviço & logística
              </p>
              <DialogTitle className="font-display text-2xl font-black leading-tight">
                {tour.title}
              </DialogTitle>
            </DialogHeader>

            {(tour.summary || tour.ai_summary) && (
              <section>
                <h4 className="mb-2 border-b border-border pb-2 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                  Sobre o passeio
                </h4>
                <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                  {tour.summary || tour.ai_summary}
                </p>
              </section>
            )}

            <div className="grid gap-6 sm:grid-cols-2">
              {meetingPoint && (
                <section>
                  <h4 className="mb-2 border-b border-border pb-2 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                    Ponto de encontro
                  </h4>
                  <p className="flex gap-2 text-sm text-muted-foreground">
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brand-orange" />
                    <span>{meetingPoint}</span>
                  </p>
                </section>
              )}
              {times.length > 0 && (
                <section>
                  <h4 className="mb-2 border-b border-border pb-2 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                    Horários de saída
                  </h4>
                  <p className="flex gap-2 text-sm text-muted-foreground">
                    <Clock className="mt-0.5 h-4 w-4 shrink-0 text-brand-orange" />
                    <span>{times.join(" · ")}</span>
                  </p>
                </section>
              )}
            </div>

            {modalities.filter(Boolean).length > 0 && (
              <section>
                <h4 className="mb-2 border-b border-border pb-2 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                  Modalidades disponíveis
                </h4>
                <ul className="space-y-1.5">
                  {modalities.filter(Boolean).map((m) => (
                    <li key={m} className="flex items-center gap-2 text-sm text-muted-foreground">
                      <span className="h-1.5 w-1.5 rounded-full bg-brand-orange" />
                      {m}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {childFee && (
              <div className="rounded-lg border border-brand-orange/30 bg-brand-orange/10 p-3">
                <p className="text-[12px] font-medium text-brand-orange">
                  {formatAgePolicy(childFee)}
                </p>
              </div>
            )}

            <div className="flex flex-col gap-2 pt-2 sm:flex-row">
              <button
                type="button"
                onClick={() => setDetailsOpen(false)}
                className="flex-1 rounded-lg bg-brand-orange px-4 py-3 text-xs font-bold uppercase tracking-widest text-primary-foreground transition hover:opacity-90"
              >
                Fechar e escolher a data
              </button>
              <a
                href={`/pacotes/${tour.slug}`}
                target="_blank"
                rel="noreferrer"
                className="flex-1 rounded-lg border border-border px-4 py-3 text-center text-xs font-bold uppercase tracking-widest transition hover:border-brand-orange/60"
              >
                Abrir página completa
              </a>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </article>
  );
}

