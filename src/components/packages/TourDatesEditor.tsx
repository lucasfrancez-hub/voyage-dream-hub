import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Plus, Trash2, CalendarRange } from "lucide-react";

type Row = {
  id?: string;
  date: string;
  modality: string;
  price_per_person: number;
  taxes: number;
  seats: number | null;
  is_available: boolean;
};

const inp =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-brand-orange";

function brl(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function shortMoney(n: number) {
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

/** Converte "15/03/2026 350" | "15/03 350,00" | "2026-03-15;350;90" em linhas. */
function parseBulk(text: string, fallbackYear: number, modality: string): Row[] {
  const out: Row[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    let date = "";
    let rest = line;
    const iso = line.match(/^(\d{4})-(\d{2})-(\d{2})/);
    const br = line.match(/^(\d{1,2})[/.](\d{1,2})(?:[/.](\d{2,4}))?/);
    if (iso) {
      date = `${iso[1]}-${iso[2]}-${iso[3]}`;
      rest = line.slice(iso[0].length);
    } else if (br) {
      const y = br[3] ? (br[3].length === 2 ? 2000 + Number(br[3]) : Number(br[3])) : fallbackYear;
      date = `${y}-${String(Number(br[2])).padStart(2, "0")}-${String(Number(br[1])).padStart(2, "0")}`;
      rest = line.slice(br[0].length);
    } else continue;
    const nums = (rest.match(/-?[\d.]*\d(?:,\d{1,2})?/g) ?? []).map((n) =>
      Number(n.replace(/\./g, "").replace(",", ".")),
    );
    if (!nums.length) continue;
    out.push({
      date,
      modality,
      price_per_person: nums[0] ?? 0,
      taxes: nums[1] ?? 0,
      seats: nums[2] != null ? Math.round(nums[2]) : null,
      is_available: true,
    });
  }
  return out;
}

const WEEKDAYS = ["D", "S", "T", "Q", "Q", "S", "S"];

export function TourDatesEditor({
  packageId,
  modalities = [],
  pendingRows = [],
}: {
  packageId?: string;
  modalities?: string[];
  /** Preços importados ainda não salvos (passeio novo). */
  pendingRows?: { date: string; modality: string; price_per_person: number }[];
}) {
  const qc = useQueryClient();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [bulk, setBulk] = useState("");
  const [saving, setSaving] = useState(false);
  const [modality, setModality] = useState<string>(modalities[0] ?? "");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["package-date-prices", packageId],
    enabled: !!packageId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("package_date_prices")
        .select("id,date,modality,price_per_person,taxes,seats,is_available")
        .eq("package_id", packageId!)
        .order("date");
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const pending = useMemo<Row[]>(
    () =>
      pendingRows.map((p) => ({
        date: p.date,
        modality: p.modality ?? "",
        price_per_person: p.price_per_person,
        taxes: 0,
        seats: null,
        is_available: true,
      })),
    [pendingRows],
  );

  const saved = packageId ? (data ?? []) : [];
  const list = rows ?? (saved.length ? saved : pending);

  /** Modalidades vindas do cadastro + as que existem nos preços salvos. */
  const allModalities = useMemo(() => {
    const set = new Set<string>(modalities.filter(Boolean));
    for (const r of list) if (r.modality) set.add(r.modality);
    return [...set];
  }, [modalities, list]);


  useEffect(() => {
    if (modality && (allModalities.includes(modality) || modality === "")) return;
    setModality(allModalities[0] ?? "");
  }, [allModalities.join("|")]);

  const filtered = useMemo(
    () => list.filter((r) => (r.modality ?? "") === (modality ?? "")),
    [list, modality],
  );

  const months = useMemo(() => {
    const set = new Set(filtered.map((r) => r.date.slice(0, 7)).filter((m) => /^\d{4}-\d{2}$/.test(m)));
    return [...set].sort();
  }, [filtered]);

  const byDate = useMemo(() => {
    const map = new Map<string, Row>();
    for (const r of filtered) map.set(r.date, r);
    return map;
  }, [filtered]);

  const selected = selectedDate ? byDate.get(selectedDate) : undefined;
  const selectedIdx = selected ? list.indexOf(selected) : -1;

  function update(idx: number, patch: Partial<Row>) {
    if (idx < 0) return;
    const next = [...list];
    next[idx] = { ...next[idx], ...patch };
    setRows(next);
  }

  function removeAt(idx: number) {
    if (idx < 0) return;
    setRows(list.filter((_, i) => i !== idx));
    setSelectedDate(null);
  }

  function addRow() {
    const today = new Date().toISOString().slice(0, 10);
    const date = selectedDate ?? today;
    if (byDate.has(date)) {
      setSelectedDate(date);
      return;
    }
    setRows([
      ...list,
      { date, modality: modality ?? "", price_per_person: 0, taxes: 0, seats: null, is_available: true },
    ]);
    setSelectedDate(date);
  }

  function applyBulk() {
    const parsed = parseBulk(bulk, new Date().getFullYear(), modality ?? "");
    if (!parsed.length) {
      toast.error("Não consegui ler nenhuma data. Use: 15/03/2026 350");
      return;
    }
    const key = (r: Row) => `${r.date}|${r.modality ?? ""}`;
    const map = new Map(list.map((r) => [key(r), r]));
    for (const p of parsed) map.set(key(p), { ...map.get(key(p)), ...p });
    setRows(
      [...map.values()].sort(
        (a, b) => a.date.localeCompare(b.date) || (a.modality ?? "").localeCompare(b.modality ?? ""),
      ),
    );
    setBulk("");
    toast.success(`${parsed.length} data(s) carregada(s) — clique em salvar datas.`);
  }

  async function saveDates() {
    if (!packageId) return;
    const valid = list.filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.date));
    setSaving(true);
    try {
      const { data: current } = await supabase
        .from("package_date_prices")
        .select("id,date,modality")
        .eq("package_id", packageId);
      const keep = new Set(valid.map((r) => `${r.date}|${r.modality ?? ""}`));
      const toDelete = (current ?? [])
        .filter((c) => !keep.has(`${c.date}|${c.modality ?? ""}`))
        .map((c) => c.id);
      if (toDelete.length) {
        await supabase.from("package_date_prices").delete().in("id", toDelete);
      }
      if (valid.length) {
        const { error } = await supabase.from("package_date_prices").upsert(
          valid.map((r) => ({
            package_id: packageId,
            date: r.date,
            modality: r.modality ?? "",
            price_per_person: Number(r.price_per_person) || 0,
            taxes: Number(r.taxes) || 0,
            seats: r.seats == null || Number.isNaN(r.seats) ? null : Number(r.seats),
            is_available: r.is_available !== false,
          })),
          { onConflict: "package_id,date,modality" },
        );
        if (error) throw error;
      }
      toast.success("Datas e preços salvos");
      setRows(null);
      qc.invalidateQueries({ queryKey: ["package-date-prices", packageId] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const unsaved = !packageId;

  return (
    <div className="space-y-4 rounded-xl border border-border bg-card/60 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
          <CalendarRange className="h-4 w-4 text-brand-orange" /> Calendário de datas e valores
        </h3>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={addRow}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold"
          >
            <Plus className="h-3.5 w-3.5" /> Adicionar data
          </button>
          <button
            type="button"
            onClick={saveDates}
            disabled={saving || unsaved}
            title={unsaved ? "Salve o passeio para gravar o calendário" : undefined}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-orange px-3 py-1.5 text-xs font-bold text-white disabled:opacity-60"
          >
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Salvar datas
          </button>
        </div>
      </div>

      {unsaved && (
        <p className="rounded-lg border border-dashed border-border bg-muted/20 px-3 py-2 text-[11px] text-muted-foreground">
          Prévia do que foi importado — o calendário é gravado junto quando você salvar o passeio.
        </p>
      )}

      {/* Modalidades — uma por linha, clique para abrir o calendário */}
      {allModalities.length > 0 ? (
        <div className="divide-y divide-border overflow-hidden rounded-xl border border-border">
          {allModalities.map((m) => {
            const mRows = list.filter((r) => (r.modality ?? "") === m);
            const prices = mRows.map((r) => Number(r.price_per_person) || 0).filter((n) => n > 0);
            const avg = prices.length ? prices.reduce((a, b) => a + b, 0) / prices.length : 0;
            const min = prices.length ? Math.min(...prices) : 0;
            const max = prices.length ? Math.max(...prices) : 0;
            const isOpen = expanded && (modality ?? "") === m;
            return (
              <div key={m || "default"}>
                <button
                  type="button"
                  onClick={() => {
                    if (isOpen) {
                      setExpanded(false);
                      return;
                    }
                    setModality(m);
                    setExpanded(true);
                    setSelectedDate(null);
                  }}
                  className={`flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition ${
                    isOpen ? "bg-brand-orange/10" : "hover:bg-muted/40"
                  }`}
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <ChevronRight
                      className={`h-4 w-4 shrink-0 text-brand-orange transition-transform ${isOpen ? "rotate-90" : ""}`}
                    />
                    <span className="truncate text-sm font-semibold">{m || "Padrão"}</span>
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      · {mRows.length} data(s)
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-xs font-bold text-brand-orange">
                      base {brl(avg)}
                    </span>
                    {max > min && (
                      <span className="block text-[10px] text-muted-foreground">
                        {brl(min)} – {brl(max)}
                      </span>
                    )}
                  </span>
                </button>
                {isOpen && (
                  <div className="border-t border-border bg-background/50 p-3">
                    {renderCalendar()}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Nenhuma modalidade encontrada. Importe o HTML do serviço ou adicione datas manualmente.
        </p>
      )}
    </div>
  );

  function renderCalendar() {
    return isLoading ? (
      <p className="text-sm text-muted-foreground">Carregando…</p>
    ) : months.length === 0 ? (
      <p className="text-sm text-muted-foreground">
        Nenhuma data cadastrada para esta modalidade ainda.
      </p>
    ) : (

        <div className="grid gap-4 md:grid-cols-2">
          {months.map((month) => {
            const first = new Date(`${month}-01T00:00:00`);
            const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
            const offset = first.getDay();
            const monthRows = filtered.filter((r) => r.date.startsWith(month));
            const min = Math.min(...monthRows.map((r) => Number(r.price_per_person) || 0));
            return (
              <div key={month} className="rounded-xl border border-border bg-background p-3">
                <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-brand-orange">
                  {first.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })} ·{" "}
                  {monthRows.length} data(s) · a partir de {brl(min)}
                </p>
                <div className="grid grid-cols-7 gap-1 text-center">
                  {WEEKDAYS.map((w, i) => (
                    <span key={i} className="text-[10px] font-bold text-muted-foreground">
                      {w}
                    </span>
                  ))}
                  {Array.from({ length: offset }).map((_, i) => (
                    <span key={`e${i}`} />
                  ))}
                  {Array.from({ length: daysInMonth }).map((_, i) => {
                    const day = i + 1;
                    const iso = `${month}-${String(day).padStart(2, "0")}`;
                    const row = byDate.get(iso);
                    const active = selectedDate === iso;
                    const off = row && row.is_available === false;
                    return (
                      <button
                        key={iso}
                        type="button"
                        disabled={!row}
                        onClick={() => setSelectedDate(iso)}
                        className={`flex min-h-[46px] flex-col items-center justify-center rounded-md border px-0.5 py-1 text-[11px] transition ${
                          !row
                            ? "border-transparent text-muted-foreground/40"
                            : active
                              ? "border-brand-orange bg-brand-orange/15 text-brand-orange"
                              : off
                                ? "border-border bg-muted/40 text-muted-foreground line-through"
                                : "border-border hover:border-brand-orange/60"
                        }`}
                      >
                        <span className="font-semibold">{day}</span>
                        {row && (
                          <span className="text-[9px] leading-tight opacity-80">
                            {shortMoney(Number(row.price_per_person) || 0)}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selected && (
        <div className="space-y-3 rounded-xl border border-brand-orange/40 bg-brand-orange/5 p-3">
          <p className="text-xs font-bold text-brand-orange">
            {new Date(`${selected.date}T00:00:00`).toLocaleDateString("pt-BR", {
              weekday: "long",
              day: "2-digit",
              month: "long",
              year: "numeric",
            })}
            {modality ? ` · ${modality}` : ""}
          </p>
          <div className="grid gap-2 sm:grid-cols-4">
            <label className="space-y-1">
              <span className="text-[10px] font-semibold uppercase text-muted-foreground">Data</span>
              <input
                type="date"
                className={inp}
                value={selected.date}
                onChange={(e) => {
                  update(selectedIdx, { date: e.target.value });
                  setSelectedDate(e.target.value);
                }}
              />
            </label>
            <label className="space-y-1">
              <span className="text-[10px] font-semibold uppercase text-muted-foreground">Valor</span>
              <input
                type="number"
                step="0.01"
                className={inp}
                value={selected.price_per_person}
                onChange={(e) => update(selectedIdx, { price_per_person: Number(e.target.value) })}
              />
            </label>
            <label className="space-y-1">
              <span className="text-[10px] font-semibold uppercase text-muted-foreground">Taxas</span>
              <input
                type="number"
                step="0.01"
                className={inp}
                value={selected.taxes}
                onChange={(e) => update(selectedIdx, { taxes: Number(e.target.value) })}
              />
            </label>
            <label className="space-y-1">
              <span className="text-[10px] font-semibold uppercase text-muted-foreground">Vagas</span>
              <input
                type="number"
                className={inp}
                value={selected.seats ?? ""}
                onChange={(e) =>
                  update(selectedIdx, { seats: e.target.value === "" ? null : Number(e.target.value) })
                }
              />
            </label>
          </div>
          <div className="flex items-center justify-between">
            <label className="inline-flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={selected.is_available !== false}
                onChange={(e) => update(selectedIdx, { is_available: e.target.checked })}
              />
              Disponível
            </label>
            <button
              type="button"
              onClick={() => removeAt(selectedIdx)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" /> Remover data
            </button>
          </div>
        </div>
      )}

      <details className="rounded-lg border border-dashed border-border p-3">
        <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Colar tabela manualmente (15/03/2026 350 20 12)
        </summary>
        <div className="mt-2 grid gap-2">
          <textarea
            rows={4}
            className={inp}
            placeholder={"01/03/2026 350\n02/03/2026 380 25"}
            value={bulk}
            onChange={(e) => setBulk(e.target.value)}
          />
          <button
            type="button"
            onClick={applyBulk}
            className="self-start rounded-lg border border-border px-3 py-1.5 text-xs font-semibold"
          >
            Carregar datas coladas na modalidade “{modality || "Padrão"}”
          </button>
        </div>
      </details>
    </div>
  );
}
