import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, CheckCircle2, Code2, Loader2 } from "lucide-react";
import { SupplierInput } from "@/components/packages/SupplierInput";
import { parseMultipleTourHtml } from "@/lib/packages/tour-html";
import { summarizeTourInfo } from "@/lib/packages/ai.functions";

export type BulkImportedTourDraft = {
  id?: string;
  slug: string;
  title: string;
  kind: "tour";
  destination: string;
  supplier_name: string;
  origin: string;
  image_url: string;
  price_per_person: number;
  taxes: number;
  tour_times: string[];
  tour_modalities: string[];
  includes: string[];
  meeting_point: string | null;
  services: { raw_description?: string };
  summary: string | null;
  ai_summary: string | null;
  date_mode: "flexible";
  pricing_mode: "per_unit";
  max_units: number;
  is_active: boolean;
  __pendingPrices: {
    date: string;
    modality: string;
    price_per_person: number;
    taxes: number;
  }[];
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
  supplier: initialSupplier,
  onImported,
}: {
  destination?: string | null;
  supplier?: string | null;
  onImported?: (drafts: BulkImportedTourDraft[]) => void;
}) {
  const summarize = useServerFn(summarizeTourInfo);
  const [step, setStep] = useState<0 | 1>(0);
  const [supplier, setSupplier] = useState(initialSupplier ?? "");
  const [html, setHtml] = useState("");
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState("");

  async function importAll() {
    if (html.trim().length < 50) {
      toast.error("Cole o HTML dos serviços primeiro.");
      return;
    }
    let tours;
    try {
      tours = parseMultipleTourHtml(html);
    } catch (error) {
      toast.error("Não consegui ler esse HTML: " + (error as Error).message);
      return;
    }
    if (!tours.length) {
      toast.error("Nenhum passeio encontrado nesse HTML.");
      return;
    }

    setRunning(true);
    const drafts: BulkImportedTourDraft[] = [];
    const usedSlugs = new Set<string>();
    try {
      for (const [index, tour] of tours.entries()) {
        setProgress(`${index + 1}/${tours.length} — ${tour.title}`);
        const rawDescription = tour.description.trim().slice(0, 55000);
        let ai: Awaited<ReturnType<typeof summarize>> | null = null;
        if (rawDescription.length >= 20) {
          try {
            ai = await summarize({
              data: {
                raw: rawDescription,
                title: tour.title || undefined,
                destination: initialDestination?.trim() || undefined,
              },
            });
          } catch (error) {
            console.warn("[tour-bulk-import] descrição sem enriquecimento", error);
          }
        }

        let slug = slugify(tour.title) || `passeio-${index + 1}`;
        let suffix = 2;
        while (usedSlugs.has(slug)) slug = `${slugify(tour.title)}-${suffix++}`;
        usedSlugs.add(slug);

        const minPrice = tour.prices.reduce(
          (minimum, row) =>
            minimum === 0 ? row.price_per_person : Math.min(minimum, row.price_per_person),
          0,
        );
        const aiSummary = [
          ai?.summary,
          ai?.hours_note ? `*Horário*\n${ai.hours_note}` : "",
          ai?.notes ? `*Informações importantes*\n${ai.notes}` : "",
        ]
          .filter(Boolean)
          .join("\n\n");

        drafts.push({
          slug,
          title: tour.title,
          kind: "tour",
          destination: initialDestination?.trim() || "",
          supplier_name: supplier.trim(),
          origin: "",
          image_url: tour.image_url || "",
          price_per_person: minPrice || 0,
          taxes: 0,
          tour_times: tour.times.length ? tour.times : (ai?.times ?? []),
          tour_modalities: tour.modalities.length ? tour.modalities : (ai?.modalities ?? []),
          includes: tour.includes.length ? tour.includes : (ai?.includes ?? []),
          meeting_point: ai?.meeting_point || null,
          services: rawDescription ? { raw_description: rawDescription } : {},
          summary: ai?.short || null,
          ai_summary: aiSummary || null,
          date_mode: "flexible",
          pricing_mode: "per_unit",
          max_units: 9,
          is_active: true,
          __pendingPrices: tour.prices.map((row) => ({
            date: row.date,
            modality: row.modality,
            price_per_person: row.price_per_person,
            taxes: 0,
          })),
        });
      }
      onImported?.(drafts);
      toast.success(`${drafts.length} passeio(s) importado(s). Revise cada um nas abas.`);
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setRunning(false);
      setProgress("");
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="inline-flex items-center gap-2 text-sm font-bold text-foreground">
          <Code2 className="h-4 w-4 text-brand-orange" /> Importar múltiplos passeios
        </h3>
        <span className="text-xs font-semibold text-muted-foreground">Etapa {step + 1} de 2</span>
      </div>

      <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3">
        <span className="grid h-7 w-7 place-items-center rounded-full bg-brand-orange text-xs font-bold text-primary-foreground">
          {step > 0 ? <CheckCircle2 className="h-4 w-4" /> : 1}
        </span>
        <div className="h-px bg-border" />
        <span
          className={`grid h-7 w-7 place-items-center rounded-full border text-xs font-bold ${
            step === 1
              ? "border-brand-orange text-brand-orange"
              : "border-border text-muted-foreground"
          }`}
        >
          2
        </span>
      </div>

      {step === 0 ? (
        <div className="space-y-4">
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Fornecedor
            </span>
            <SupplierInput
              value={supplier}
              onChange={setSupplier}
              placeholder="Ex.: GTA, Civitatis, Ingresso Fácil…"
            />
          </label>
          <button
            type="button"
            onClick={() => {
              if (!supplier.trim()) {
                toast.error("Informe o fornecedor.");
                return;
              }
              setStep(1);
            }}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-orange px-4 py-2 text-xs font-bold text-primary-foreground"
          >
            Continuar <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              HTML dos serviços
            </span>
            <textarea
              value={html}
              onChange={(event) => setHtml(event.target.value)}
              rows={10}
              placeholder='<div id="frmResultadoProduto...'
              className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs outline-none focus:border-brand-orange"
            />
          </label>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setStep(0)}
              disabled={running}
              className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-bold"
            >
              <ArrowLeft className="h-4 w-4" /> Voltar
            </button>
            <button
              type="button"
              onClick={() => void importAll()}
              disabled={running}
              className="inline-flex items-center gap-2 rounded-lg bg-brand-orange px-4 py-2 text-xs font-bold text-primary-foreground disabled:opacity-60"
            >
              {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Code2 className="h-4 w-4" />}
              {running ? progress || "Importando…" : "Importar e abrir editor"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}