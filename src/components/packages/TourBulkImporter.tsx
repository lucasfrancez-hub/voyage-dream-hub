import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Code2, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { DestinationInput } from "@/components/packages/DestinationInput";
import { parseMultipleTourHtml, type ParsedTour } from "@/lib/packages/tour-html";

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
  const [done, setDone] = useState<string[] | null>(null);

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
      setDone(null);
      setOpenIdx(list.length === 1 ? 0 : null);
      setSelected(Object.fromEntries(list.map((_, i) => [i, true])));
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
    const okTitles: string[] = [];
    try {
      const { data: existing } = await supabase.from("packages").select("slug");
      const used = new Set((existing ?? []).map((r: any) => r.slug));

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
            tour_times: [],
            meeting_point: null,
            services: t.description ? { raw_description: t.description.slice(0, 55000) } : {},
            price_per_person: minPrice || 0,
            taxes: 0,
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
            taxes: 0,
            seats: null,
          }));
          const { error: perr } = await supabase
            .from("package_date_prices")
            .upsert(rows, { onConflict: "package_id,date,modality" });
          if (perr) toast.error(`${t.title} (preços): ${perr.message}`);
        }
        ok += 1;
        okTitles.push(t.title);
      }
      await qc.invalidateQueries({ queryKey: ["admin-packages"] });
      await qc.invalidateQueries({ queryKey: ["packages"] });
      toast.success(`${ok} passeio(s) importado(s).`);
      if (ok > 0) {
        setDone(okTitles);
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

      {tours.length > 0 && (
        <div className="space-y-2">
          <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
            {tours.map((t, i) => (
              <label
                key={i}
                className="flex items-center gap-3 rounded-lg border border-border bg-background/60 p-3"
              >
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
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold">{t.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {t.modalities.length} modalidade(s) · {t.prices.length} preço(s) ·{" "}
                    {t.dates.length} data(s)
                  </p>
                </div>
              </label>
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
              : `Importar ${Object.values(selected).filter(Boolean).length} passeio(s)`}
          </button>
        </div>
      )}
    </div>
  );
}
