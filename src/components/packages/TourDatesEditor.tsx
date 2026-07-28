import { useMemo, useState } from "react";
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

export function TourDatesEditor({
  packageId,
  modalities = [],
}: {
  packageId?: string;
  modalities?: string[];
}) {
  const qc = useQueryClient();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [bulk, setBulk] = useState("");
  const [bulkModality, setBulkModality] = useState("");
  const [saving, setSaving] = useState(false);

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

  const list = rows ?? data ?? [];

  const byMonth = useMemo(() => {
    const map = new Map<string, Row[]>();
    for (const r of list) {
      const key = r.date.slice(0, 7);
      map.set(key, [...(map.get(key) ?? []), r]);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [list]);

  function update(idx: number, patch: Partial<Row>) {
    const next = [...list];
    next[idx] = { ...next[idx], ...patch };
    setRows(next);
  }

  function removeAt(idx: number) {
    setRows(list.filter((_, i) => i !== idx));
  }

  function addRow() {
    setRows([
      ...list,
      {
        date: "",
        modality: bulkModality || modalities[0] || "",
        price_per_person: 0,
        taxes: 0,
        seats: null,
        is_available: true,
      },
    ]);
  }

  function applyBulk() {
    const parsed = parseBulk(bulk, new Date().getFullYear(), bulkModality);
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

  if (!packageId) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-muted/20 p-5 text-sm text-muted-foreground">
        Salve o passeio primeiro para cadastrar o calendário de datas e valores.
      </div>
    );
  }

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
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-orange px-3 py-1.5 text-xs font-bold text-white disabled:opacity-60"
          >
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Salvar datas
          </button>
        </div>
      </div>

      <div className="grid gap-2">
        <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Colar tabela do mês (uma linha por data: <code>15/03/2026 350 20 12</code> = data, valor,
          taxa, vagas)
        </label>
        <textarea
          rows={4}
          className={inp}
          placeholder={"01/03/2026 350\n02/03/2026 380 25"}
          value={bulk}
          onChange={(e) => setBulk(e.target.value)}
        />
        {modalities.length > 0 && (
          <select
            className={inp}
            value={bulkModality}
            onChange={(e) => setBulkModality(e.target.value)}
          >
            <option value="">Sem modalidade / padrão</option>
            {modalities.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        )}
        <button
          type="button"
          onClick={applyBulk}
          className="self-start rounded-lg border border-border px-3 py-1.5 text-xs font-semibold"
        >
          Carregar datas coladas
        </button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : list.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma data cadastrada ainda.</p>
      ) : (
        <div className="space-y-4">
          {byMonth.map(([month, monthRows]) => (
            <div key={month} className="space-y-2">
              <p className="text-[11px] font-bold uppercase tracking-wider text-brand-orange">
                {new Date(`${month}-01T00:00:00`).toLocaleDateString("pt-BR", {
                  month: "long",
                  year: "numeric",
                })}{" "}
                · {monthRows.length} data(s)
              </p>
              {monthRows.map((r) => {
                const idx = list.indexOf(r);
                return (
                  <div
                    key={r.id ?? `${r.date}-${r.modality}-${idx}`}
                    className="grid grid-cols-2 items-end gap-2 rounded-lg border border-border bg-background p-2 sm:grid-cols-[repeat(6,minmax(0,1fr))_auto]"
                  >
                    <input
                      type="date"
                      className={inp}
                      value={r.date}
                      onChange={(e) => update(idx, { date: e.target.value })}
                    />
                    {modalities.length > 0 ? (
                      <select
                        className={inp}
                        value={r.modality ?? ""}
                        onChange={(e) => update(idx, { modality: e.target.value })}
                      >
                        <option value="">Padrão</option>
                        {modalities.map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        className={inp}
                        placeholder="Modalidade"
                        value={r.modality ?? ""}
                        onChange={(e) => update(idx, { modality: e.target.value })}
                      />
                    )}
                    <input
                      type="number"
                      step="0.01"
                      className={inp}
                      placeholder="Valor"
                      value={r.price_per_person}
                      onChange={(e) => update(idx, { price_per_person: Number(e.target.value) })}
                    />
                    <input
                      type="number"
                      step="0.01"
                      className={inp}
                      placeholder="Taxas"
                      value={r.taxes}
                      onChange={(e) => update(idx, { taxes: Number(e.target.value) })}
                    />
                    <input
                      type="number"
                      className={inp}
                      placeholder="Vagas"
                      value={r.seats ?? ""}
                      onChange={(e) =>
                        update(idx, { seats: e.target.value === "" ? null : Number(e.target.value) })
                      }
                    />
                    <label className="inline-flex items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        checked={r.is_available !== false}
                        onChange={(e) => update(idx, { is_available: e.target.checked })}
                      />
                      Disponível
                    </label>
                    <button
                      type="button"
                      onClick={() => removeAt(idx)}
                      className="justify-self-end rounded-lg border border-border p-2 text-destructive"
                      title="Remover data"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                );
              })}
              <p className="text-[11px] text-muted-foreground">
                A partir de{" "}
                {brl(Math.min(...monthRows.map((r) => Number(r.price_per_person) || 0)))}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
