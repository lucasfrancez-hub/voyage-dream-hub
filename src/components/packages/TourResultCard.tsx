import { useMemo, useState } from "react";
import { Info, MapPin, Plus, ChevronLeft, ChevronRight } from "lucide-react";

import { formatBRL } from "@/lib/format";

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
  onAdd,
  onReserve,
}: {
  tour: any;
  rows: PriceRow[];
  pax: number;
  onAdd: (item: Omit<CartItem, "key">) => void;
  onReserve: (date: string, modality: string | null) => void;
}) {
  const [offset, setOffset] = useState(0);
  const [sel, setSel] = useState<{ date: string; modality: string | null } | null>(null);

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

  const visible = dates.slice(offset, offset + PAGE);

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

  return (
    <article className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex flex-col lg:flex-row">
        {/* Conteúdo principal */}
        <div className="flex-1 p-5">
          <div className="flex gap-4">
            <div className="hidden h-24 w-40 shrink-0 overflow-hidden rounded-xl bg-muted sm:block">
              {tour.image_url && (
                <img
                  src={tour.image_url}
                  alt={tour.title}
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
              )}
            </div>
            <div className="min-w-0">
              <h3 className="font-display text-lg font-bold leading-tight">{tour.title}</h3>
              {tour.destination && (
                <p className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <MapPin className="h-3 w-3 text-brand-orange" /> {tour.destination}
                </p>
              )}
              {tour.summary && (
                <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-muted-foreground">
                  {tour.summary}
                </p>
              )}
              <a
                href={`/pacotes/${tour.slug}`}
                className="mt-2 inline-block text-xs font-semibold text-brand-orange hover:underline"
              >
                Ver detalhes do serviço
              </a>
            </div>
          </div>

          {/* Grade modalidade x datas */}
          <div className="mt-5 overflow-hidden rounded-xl border border-border">
            <div className="flex items-center justify-between border-b border-border bg-muted/40 px-3 py-2">
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Modalidade
              </span>
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
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr>
                    <th className="min-w-[190px] border-b border-border px-3 py-2 text-left text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                      Serviço
                    </th>
                    {visible.map((d) => (
                      <th
                        key={d}
                        className="min-w-[110px] border-b border-l border-border px-2 py-2 text-center text-[10px] font-bold uppercase tracking-wider text-muted-foreground"
                      >
                        {dayHeader(d)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {modalities.map((m) => (
                    <tr key={m || "unica"}>
                      <td className="border-b border-border px-3 py-2.5">
                        <span className="inline-flex items-center gap-1.5 text-[13px]">
                          <Info className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          <span className="line-clamp-1">{m || tour.title}</span>
                        </span>
                      </td>
                      {visible.map((d) => {
                        const r = cell(m, d);
                        const u = unitOf(r);
                        const isSel =
                          sel?.date === d && (sel?.modality ?? "") === m;
                        return (
                          <td
                            key={d}
                            className="border-b border-l border-border p-1 text-center"
                          >
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
          </div>
        </div>

        {/* Coluna de preço / ações */}
        <aside className="w-full shrink-0 border-t border-border bg-muted/20 p-5 lg:w-64 lg:border-l lg:border-t-0">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            {selUnit != null ? "Preço" : "A partir de"}
          </p>
          <p className="mt-1 font-display text-3xl font-black leading-none text-brand-orange">
            {formatBRL((selUnit ?? minUnit ?? 0) * pax)}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {formatBRL(selUnit ?? minUnit ?? 0)} por pessoa · {pax}{" "}
            {pax === 1 ? "pessoa" : "pessoas"}
          </p>

          <div className="my-4 border-t border-border pt-3 text-[11px] leading-relaxed text-muted-foreground">
            <p>Taxas inclusas de {formatBRL(taxes)}</p>
            {sel ? (
              <p className="mt-2 text-foreground">
                {sel.modality || tour.title}
                <br />
                <span className="text-muted-foreground">
                  Utilização: {sel.date.split("-").reverse().join("/")}
                </span>
              </p>
            ) : (
              <p className="mt-2">Selecione uma data na grade ao lado.</p>
            )}
          </div>

          <button
            type="button"
            disabled={!sel || selUnit == null}
            onClick={() => sel && onReserve(sel.date, sel.modality)}
            className="w-full rounded-lg bg-brand-orange px-4 py-3 text-sm font-bold uppercase tracking-widest text-primary-foreground transition hover:opacity-90 disabled:opacity-40"
          >
            Reservar
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
                qty: pax,
              })
            }
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 py-2.5 text-xs font-bold uppercase tracking-widest transition hover:border-brand-orange/60 disabled:opacity-40"
          >
            <Plus className="h-3.5 w-3.5 text-brand-orange" /> Adicionar
          </button>
        </aside>
      </div>
    </article>
  );
}
