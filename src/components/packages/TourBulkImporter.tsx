import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Code2, CheckCircle2, Pencil } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { DestinationInput } from "@/components/packages/DestinationInput";
import { parseMultipleTourHtml, type ParsedTour } from "@/lib/packages/tour-html";

type SavedTour = {
  id: string;
  title: string;
  destination: string;
  image_url: string;
  price_per_person: number;
  taxes: number;
  times: string[];
  includes: string[];
  meeting_point: string;
  raw_description: string;
};

function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70);
}

export function TourBulkImporter({
  destination: initialDestination,
  onDone,
}: {
  destination?: string | null;
  onDone?: () => void;
}) {
  const qc = useQueryClient();
  const [html, setHtml] = useState("");
  const [destination, setDestination] = useState(initialDestination ?? "");
  const [tours, setTours] = useState<ParsedTour[]>([]);
  const [selected, setSelected] = useState<Record<number, boolean>>({});
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState("");
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const [saved, setSaved] = useState<SavedTour[] | null>(null);
  const [savedTab, setSavedTab] = useState(0);
  const [savingAll, setSavingAll] = useState(false);
  const [extras, setExtras] = useState<Record<number, string>>({});

  function patchSaved(i: number, next: Partial<SavedTour>) {
    setSaved((list) => (list ? list.map((t, idx) => (idx === i ? { ...t, ...next } : t)) : list));
  }

  async function saveAllSaved() {
    if (!saved?.length) return;
    setSavingAll(true);
    try {
      for (const s of saved) {
        const { error } = await supabase
          .from("packages")
          .update({
            title: s.title,
            destination: s.destination,
            image_url: s.image_url || null,
            price_per_person: s.price_per_person,
            taxes: s.taxes,
            times: undefined,
            tour_times: s.times,
            includes: s.includes,
            meeting_point: s.meeting_point || null,
            services: s.raw_description ? { raw_description: s.raw_description } : {},
          } as any)
          .eq("id", s.id);
        if (error) toast.error(`${s.title}: ${error.message}`);
      }
      await qc.invalidateQueries({ queryKey: ["admin-packages"] });
      await qc.invalidateQueries({ queryKey: ["packages"] });
      toast.success("Alterações salvas.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSavingAll(false);
    }
  }

  function patchTour(i: number, next: Partial<ParsedTour>) {
    setTours((list) => list.map((t, idx) => (idx === i ? { ...t, ...next } : t)));
  }

  function readHtml() {
    try {
      const list = parseMultipleTourHtml(html);
      if (!list.length) {
        toast.error("Nenhum serviço encontrado nesse HTML.");
        return;
      }
      setTours(list);
      setSaved(null);
      setOpenIdx(list.length === 1 ? 0 : null);
      setSelected(Object.fromEntries(list.map((_, i) => [i, true])));
      setExtras({});
      toast.success(`${list.length} passeio(s) encontrado(s).`);
    } catch (e) {
      toast.error("Não consegui ler esse HTML: " + (e as Error).message);
    }
  }

  async function importAll() {
    const chosen = tours.filter((_, i) => selected[i]);
    if (!chosen.length) return;
    if (!destination.trim()) {
      toast.error("Informe o destino (ex.: Orlando).");
      return;
    }
    setRunning(true);
    let ok = 0;
    const savedRows: SavedTour[] = [];
    try {
      const { data: existing } = await supabase.from("packages").select("slug");
      const used = new Set((existing ?? []).map((r: any) => r.slug));

      const extraByTitle = new Map<string, string>();
      tours.forEach((t, i) => {
        const v = (extras[i] ?? "").trim();
        if (v) extraByTitle.set(t.title, v);
      });

      for (const [idx, t] of chosen.entries()) {
        setProgress(`${idx + 1}/${chosen.length} — ${t.title}`);
        let slug = slugify(t.title) || `passeio-${Date.now()}`;
        let n = 2;
        while (used.has(slug)) slug = `${slugify(t.title)}-${n++}`;
        used.add(slug);

        const minPrice = t.prices.reduce(
          (m, p) => (m === 0 ? p.price_per_person : Math.min(m, p.price_per_person)),
          0,
        );

        const rawDescription = [t.description, extraByTitle.get(t.title)]
          .filter(Boolean)
          .join("\n\n")
          .slice(0, 55000);

        const { data: inserted, error } = await supabase
          .from("packages")
          .insert({
            slug,
            title: t.title,
            destination: destination.trim(),
            image_url: t.image_url || null,
            summary: null,
            ai_summary: null,
            includes: t.includes,
            tour_modalities: t.modalities,
            tour_times: t.times ?? [],
            meeting_point: null,
            services: rawDescription ? { raw_description: rawDescription } : {},
            price_per_person: minPrice || 0,
            taxes: t.tax_per_person || 0,
            kind: "tour",
            date_mode: "flexible",
            pricing_mode: "per_unit",
            max_units: 9,
            is_active: true,
          } as any)
          .select("id")
          .single();

        if (error) {
          toast.error(`${t.title}: ${error.message}`);
          continue;
        }

        if (t.prices.length) {
          const rows = t.prices.map((x) => ({
            package_id: inserted.id,
            date: x.date,
            modality: x.modality,
            price_per_person: x.price_per_person,
            taxes: t.tax_per_person || 0,
            seats: null,
          }));
          const { error: perr } = await supabase
            .from("package_date_prices")
            .upsert(rows, { onConflict: "package_id,date,modality" });
          if (perr) toast.error(`${t.title} (preços): ${perr.message}`);
        }
        ok += 1;
        savedRows.push({
          id: inserted.id,
          title: t.title,
          destination: destination.trim(),
          image_url: t.image_url || "",
          price_per_person: minPrice || 0,
          taxes: t.tax_per_person || 0,
          times: t.times ?? [],
          includes: t.includes ?? [],
          meeting_point: "",
          raw_description: rawDescription,
        });
      }
      await qc.invalidateQueries({ queryKey: ["admin-packages"] });
      await qc.invalidateQueries({ queryKey: ["packages"] });
      toast.success(`${ok} passeio(s) importado(s).`);
      if (ok > 0) {
        setSaved(savedRows);
        setSavedTab(0);
        setTours([]);
        setSelected({});
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setRunning(false);
      setProgress("");
    }
  }

  return (
    <div className="rounded-xl border border-brand-orange/30 bg-brand-orange/5 p-5 space-y-4">
      <div className="flex items-center gap-2 text-brand-orange">
        <Code2 className="h-4 w-4" />
        <h3 className="text-sm font-bold uppercase tracking-wide">Importar múltiplos passeios</h3>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-bold uppercase text-muted-foreground sm:col-span-2">
          Cidade de destino (digite e escolha)
          <DestinationInput
            value={destination}
            onChange={setDestination}
            className="mt-1"
          />
        </label>
        <label className="text-xs font-bold uppercase text-muted-foreground sm:col-span-2">
          Cole o HTML da lista inteira de serviços
          <textarea
            value={html}
            onChange={(e) => setHtml(e.target.value)}
            rows={6}
            placeholder='<div id="frmResultadoProduto...'
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs normal-case"
          />
        </label>
        <p className="text-[11px] text-muted-foreground sm:col-span-2">
          A descrição de cada passeio é gravada como texto do operador — depois é só abrir o
          passeio e clicar em <strong>Gerar descrição com IA</strong>.
        </p>

      </div>

      <button
        type="button"
        onClick={readHtml}
        disabled={!html.trim() || running}
        className="rounded-full bg-brand-orange px-5 py-2 text-sm font-bold text-white disabled:opacity-50"
      >
        Ler HTML
      </button>

      {saved && saved.length > 0 && (
        <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm space-y-3">
          <p className="font-bold text-emerald-600">
            {saved.length} passeio(s) cadastrado(s) — ajuste o que precisar e salve todos
          </p>

          <div className="flex flex-wrap gap-1.5">
            {saved.map((s, i) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setSavedTab(i)}
                className={`rounded-full px-3 py-1 text-[11px] font-bold transition-colors ${
                  savedTab === i
                    ? "bg-brand-orange text-white"
                    : "border border-border bg-background text-muted-foreground hover:text-foreground"
                }`}
              >
                {i + 1}. {s.title.slice(0, 28)}
              </button>
            ))}
          </div>

          {saved[savedTab] && (
            <div className="grid gap-3 rounded-lg border border-border bg-background/70 p-3 sm:grid-cols-2">
              <label className="text-[11px] font-bold uppercase text-muted-foreground sm:col-span-2">
                Título
                <input
                  value={saved[savedTab].title}
                  onChange={(e) => patchSaved(savedTab, { title: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm normal-case"
                />
              </label>
              <label className="text-[11px] font-bold uppercase text-muted-foreground">
                Destino
                <input
                  value={saved[savedTab].destination}
                  onChange={(e) => patchSaved(savedTab, { destination: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm normal-case"
                />
              </label>
              <label className="text-[11px] font-bold uppercase text-muted-foreground">
                Ponto de encontro
                <input
                  value={saved[savedTab].meeting_point}
                  onChange={(e) => patchSaved(savedTab, { meeting_point: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm normal-case"
                />
              </label>
              <label className="text-[11px] font-bold uppercase text-muted-foreground">
                Preço por pessoa (a partir de)
                <input
                  type="number"
                  step="0.01"
                  value={saved[savedTab].price_per_person}
                  onChange={(e) =>
                    patchSaved(savedTab, { price_per_person: Number(e.target.value) || 0 })
                  }
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm normal-case"
                />
              </label>
              <label className="text-[11px] font-bold uppercase text-muted-foreground">
                Taxa por pessoa
                <input
                  type="number"
                  step="0.01"
                  value={saved[savedTab].taxes}
                  onChange={(e) => patchSaved(savedTab, { taxes: Number(e.target.value) || 0 })}
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm normal-case"
                />
              </label>
              <label className="text-[11px] font-bold uppercase text-muted-foreground sm:col-span-2">
                URL da imagem
                <input
                  value={saved[savedTab].image_url}
                  onChange={(e) => patchSaved(savedTab, { image_url: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs normal-case"
                />
              </label>
              <label className="text-[11px] font-bold uppercase text-muted-foreground sm:col-span-2">
                Horários (separados por vírgula)
                <input
                  value={saved[savedTab].times.join(", ")}
                  onChange={(e) =>
                    patchSaved(savedTab, {
                      times: e.target.value
                        .split(",")
                        .map((s) => s.trim())
                        .filter(Boolean),
                    })
                  }
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm normal-case"
                />
              </label>
              <label className="text-[11px] font-bold uppercase text-muted-foreground sm:col-span-2">
                Inclui (um por linha)
                <textarea
                  value={saved[savedTab].includes.join("\n")}
                  onChange={(e) =>
                    patchSaved(savedTab, {
                      includes: e.target.value
                        .split("\n")
                        .map((s) => s.trim())
                        .filter(Boolean),
                    })
                  }
                  rows={3}
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-xs normal-case"
                />
              </label>
              <label className="text-[11px] font-bold uppercase text-muted-foreground sm:col-span-2">
                Texto do operador
                <textarea
                  value={saved[savedTab].raw_description}
                  onChange={(e) => patchSaved(savedTab, { raw_description: e.target.value })}
                  rows={6}
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-xs normal-case"
                />
              </label>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={saveAllSaved}
              disabled={savingAll}
              className="inline-flex items-center gap-2 rounded-full bg-brand-orange px-5 py-2 text-xs font-bold text-white disabled:opacity-60"
            >
              {savingAll ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5" />
              )}
              Salvar todos
            </button>
            <button
              type="button"
              onClick={() => {
                setSaved(null);
                setHtml("");
                onDone?.();
              }}
              className="rounded-full border border-border px-4 py-2 text-xs font-bold"
            >
              Fechar e ver a lista
            </button>
          </div>
        </div>
      )}

      {tours.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-bold uppercase text-muted-foreground">
            Revise e edite antes de confirmar
          </p>
          <div className="max-h-[28rem] space-y-2 overflow-y-auto pr-1">
            {tours.map((t, i) => (
              <div key={i} className="rounded-lg border border-border bg-background/60 p-3">
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={!!selected[i]}
                    onChange={(e) => setSelected((s) => ({ ...s, [i]: e.target.checked }))}
                  />
                  {t.image_url ? (
                    <img
                      src={t.image_url}
                      alt={t.title}
                      className="h-10 w-16 rounded object-cover"
                      loading="lazy"
                    />
                  ) : null}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold">{t.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {t.modalities.length} modalidade(s) · {t.prices.length} preço(s) ·{" "}
                      {t.dates.length} data(s)
                      {t.times.length ? ` · ${t.times.length} horário(s)` : ""}
                      {(extras[i] ?? "").trim() ? " · texto ok" : " · sem texto"}
                      {t.tax_per_person ? ` · taxa ${t.tax_per_person.toFixed(2)}` : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setOpenIdx(openIdx === i ? null : i)}
                    className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1 text-xs font-bold"
                  >
                    <Pencil className="h-3 w-3" />
                    {openIdx === i ? "Fechar" : "Editar"}
                  </button>
                </div>

                {openIdx === i && (
                  <div className="mt-3 grid gap-3 border-t border-border pt-3 sm:grid-cols-2">
                    <label className="text-[11px] font-bold uppercase text-muted-foreground sm:col-span-2">
                      Título
                      <input
                        value={t.title}
                        onChange={(e) => patchTour(i, { title: e.target.value })}
                        className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm normal-case"
                      />
                    </label>
                    <label className="text-[11px] font-bold uppercase text-muted-foreground sm:col-span-2">
                      URL da imagem
                      <input
                        value={t.image_url}
                        onChange={(e) => patchTour(i, { image_url: e.target.value })}
                        className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs normal-case"
                      />
                    </label>
                    <label className="text-[11px] font-bold uppercase text-muted-foreground">
                      Horários (separados por vírgula)
                      <input
                        value={t.times.join(", ")}
                        onChange={(e) =>
                          patchTour(i, {
                            times: e.target.value
                              .split(",")
                              .map((s) => s.trim())
                              .filter(Boolean),
                          })
                        }
                        className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm normal-case"
                      />
                    </label>
                    <label className="text-[11px] font-bold uppercase text-muted-foreground">
                      Taxa por pessoa
                      <input
                        type="number"
                        step="0.01"
                        value={t.tax_per_person}
                        onChange={(e) =>
                          patchTour(i, { tax_per_person: Number(e.target.value) || 0 })
                        }
                        className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm normal-case"
                      />
                    </label>
                    <label className="text-[11px] font-bold uppercase text-muted-foreground sm:col-span-2">
                      Descrição do operador
                      <textarea
                        value={t.description}
                        onChange={(e) => patchTour(i, { description: e.target.value })}
                        rows={5}
                        className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-xs normal-case"
                      />
                    </label>
                    <label className="text-[11px] font-bold uppercase text-muted-foreground sm:col-span-2">
                      Texto complementar da operadora (colar o textão deste passeio)
                      <textarea
                        value={extras[i] ?? ""}
                        onChange={(e) => setExtras((x) => ({ ...x, [i]: e.target.value }))}
                        rows={5}
                        placeholder="Cole aqui o textão da operadora deste passeio…"
                        className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-xs normal-case"
                      />
                    </label>
                    <label className="text-[11px] font-bold uppercase text-muted-foreground sm:col-span-2">
                      Inclui (um por linha)
                      <textarea
                        value={t.includes.join("\n")}
                        onChange={(e) =>
                          patchTour(i, {
                            includes: e.target.value
                              .split("\n")
                              .map((s) => s.trim())
                              .filter(Boolean),
                          })
                        }
                        rows={3}
                        className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-xs normal-case"
                      />
                    </label>
                    {t.prices.length > 0 && (
                      <div className="sm:col-span-2">
                        <p className="text-[11px] font-bold uppercase text-muted-foreground">
                          Preços por data ({t.prices.length})
                        </p>
                        <div className="mt-1 max-h-40 space-y-1 overflow-y-auto">
                          {t.prices.map((p, pi) => (
                            <div key={pi} className="flex items-center gap-2 text-xs">
                              <span className="w-24 shrink-0 text-muted-foreground">{p.date}</span>
                              <span className="min-w-0 flex-1 truncate">{p.modality}</span>
                              <input
                                type="number"
                                step="0.01"
                                value={p.price_per_person}
                                onChange={(e) =>
                                  patchTour(i, {
                                    prices: t.prices.map((x, xi) =>
                                      xi === pi
                                        ? { ...x, price_per_person: Number(e.target.value) || 0 }
                                        : x,
                                    ),
                                  })
                                }
                                className="w-28 rounded border border-border bg-background px-2 py-1 text-right"
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={importAll}
            disabled={running}
            className="inline-flex items-center gap-2 rounded-full bg-brand-orange px-5 py-2 text-sm font-bold text-white disabled:opacity-60"
          >
            {running ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            {running
              ? progress || "Importando..."
              : `Confirmar e cadastrar ${Object.values(selected).filter(Boolean).length} passeio(s)`}
          </button>
        </div>
      )}
    </div>
  );
}
