import { useMemo, useState } from "react";
import { MapPin, Plus, Clock, ChevronLeft, ChevronRight } from "lucide-react";

import { formatBRL } from "@/lib/format";
import { detectChildTokenFee, formatChildTokenFee } from "@/lib/packages/child-fee";

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

const PAGE = 5;

function dayHeader(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const wd = dt.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "");
  const md = dt.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }).replace(".", "");
  return `${wd}, ${md}`.toUpperCase();
}

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
  const stripRef = useRef<HTMLDivElement>(null);
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


  const childFee = useMemo(
    () =>
      detectChildTokenFee(
        tour.ai_summary,
        tour.summary,
        tour.itinerary,
        typeof tour.tour_info === "string" ? tour.tour_info : JSON.stringify(tour.tour_info ?? ""),
      ),
    [tour],
  );

  // Criança dentro da faixa isenta (idade informada) não entra no valor do passeio
  const exemptChildren = useMemo(() => {
    if (!childFee) return 0;
    const ages = childAges.slice(0, childCount);
    if (ages.length === 0) return childCount;
    return ages.filter((age) => {
      const okMin = childFee.minAge == null || age >= childFee.minAge;
      const okMax = childFee.maxAge == null || age <= childFee.maxAge;
      return okMin && okMax;
    }).length;
  }, [childFee, childAges, childCount]);
  const payingPax = childFee ? Math.max(1, pax - exemptChildren) : pax;



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

  return (
    <article className="overflow-hidden rounded-2xl border border-border bg-card shadow-xl">
      <div className="flex flex-col md:flex-row">
        {/* Esquerda: imagem + informações */}
        <div className="flex w-full flex-col border-border md:w-1/3 md:border-r">
          <div className="relative h-52 w-full bg-muted md:h-60">
            {tour.image_url && (
              <img
                src={tour.image_url}
                alt={tour.title}
                loading="lazy"
                className="h-full w-full object-cover"
              />
            )}
            {tour.destination && (
              <span className="absolute left-3 top-3 rounded-full bg-brand-orange px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-primary-foreground shadow-lg">
                {tour.destination}
              </span>
            )}
          </div>
          <div className="space-y-4 p-5">
            <h3 className="font-display text-xl font-bold leading-tight">{tour.title}</h3>
            <div className="space-y-2 text-sm text-muted-foreground">
              {meetingPoint && (
                <p className="flex items-start gap-2">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brand-orange" />
                  <span>Ponto de encontro: {meetingPoint}</span>
                </p>
              )}
              {times.length > 0 && (
                <p className="flex items-start gap-2">
                  <Clock className="mt-0.5 h-4 w-4 shrink-0 text-brand-orange" />
                  <span>Saídas: {times.join(", ")}</span>
                </p>
              )}
              {tour.summary && (
                <p className="line-clamp-3 leading-relaxed">{tour.summary}</p>
              )}
            </div>
            <a
              href={`/pacotes/${tour.slug}`}
              className="inline-block text-xs font-semibold text-brand-orange hover:underline"
            >
              Ver detalhes do serviço
            </a>
          </div>
        </div>

        {/* Centro: modalidades e preços */}
        <div className="flex w-full flex-col bg-muted/10 p-5 md:w-[45%]">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h4 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Modalidades e preços
              </h4>
              {rangeLabel && (
                <p className="mt-0.5 text-[11px] font-semibold text-brand-orange">{rangeLabel}</p>
              )}
            </div>

            <div className="flex gap-1">
              <button
                type="button"
                disabled={offset === 0}
                onClick={() => setOffset(Math.max(0, offset - PAGE))}
                className="rounded-md border border-border p-1 disabled:opacity-30"
                aria-label="Datas anteriores"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                disabled={offset + PAGE >= dates.length}
                onClick={() => setOffset(offset + PAGE)}
                className="rounded-md border border-border p-1 disabled:opacity-30"
                aria-label="Próximas datas"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  <th className="min-w-[150px] pb-4">Modalidade</th>
                  {visible.map((d) => (
                    <th key={d} className="min-w-[92px] pb-4 text-center">
                      {dayHeader(d)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {modalities.map((m) => (
                  <tr key={m || "unica"}>
                    <td className="py-3 pr-3">
                      <p className="text-sm font-medium leading-snug">{m || tour.title}</p>
                    </td>
                    {visible.map((d) => {
                      const r = cell(m, d);
                      const u = unitOf(r);
                      const isSel = sel?.date === d && (sel?.modality ?? "") === m;
                      return (
                        <td key={d} className="p-1 text-center">
                          {u == null ? (
                            <span className="text-xs text-muted-foreground/50">—</span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setSel({ date: d, modality: m || null })}
                              className={`w-full rounded-md px-2 py-2 text-[13px] font-semibold transition ${
                                isSel
                                  ? "bg-brand-orange text-primary-foreground"
                                  : "text-foreground hover:bg-brand-orange/10 hover:text-brand-orange"
                              }`}
                            >
                              {formatBRL(u)}
                            </button>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-auto space-y-2 pt-4">
            <p className="text-[11px] text-muted-foreground">
              Taxas inclusas de {formatBRL(taxes)}
            </p>
            {childFee && (
              <div className="rounded-lg border border-brand-orange/30 bg-brand-orange/10 p-3">
                <p className="text-[11px] font-medium text-brand-orange">
                  {formatChildTokenFee(childFee)}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Direita: reserva */}
        <aside className="flex w-full flex-col border-t border-border bg-muted/30 p-5 md:w-[25%] md:border-l md:border-t-0">
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
    </article>
  );
}

