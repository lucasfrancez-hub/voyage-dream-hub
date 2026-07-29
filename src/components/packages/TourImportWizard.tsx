import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, CheckCircle2, Code2, Loader2 } from "lucide-react";

import { SupplierInput } from "@/components/packages/SupplierInput";
import { DestinationInput } from "@/components/packages/DestinationInput";
import { parseMultipleTourHtml, type ParsedTour } from "@/lib/packages/tour-html";
import { summarizeTourInfo } from "@/lib/packages/ai.functions";
import type { BulkImportedTourDraft } from "@/components/packages/TourBulkImporter";

function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70);
}

export function TourImportWizard({
  destination: initialDestination,
  supplier: initialSupplier,
  onImported,
  onSkip,
}: {
  destination?: string | null;
  supplier?: string | null;
  onImported: (drafts: BulkImportedTourDraft[]) => void;
  onSkip?: () => void;
}) {
  const summarize = useServerFn(summarizeTourInfo);
  const [step, setStep] = useState<0 | 1>(0);
  const [supplier, setSupplier] = useState(initialSupplier ?? "");
  const [destination, setDestination] = useState(initialDestination ?? "");
  const [multi, setMulti] = useState(false);
  const [html, setHtml] = useState("");
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState("");
  const [candidates, setCandidates] = useState<ParsedTour[]>([]);

  async function buildDrafts(tours: ParsedTour[]) {
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
                destination: destination.trim() || undefined,
              },
            });
          } catch (error) {
            console.warn("[tour-import] descrição sem enriquecimento", error);
          }
        }

        const base = slugify(tour.title) || `passeio-${index + 1}`;
        let slug = base;
        let suffix = 2;
        while (usedSlugs.has(slug)) slug = `${base}-${suffix++}`;
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

        const notIncludes = tour.not_includes.length ? tour.not_includes : (ai?.not_includes ?? []);

        drafts.push({
          slug,
          title: tour.title,
          kind: "tour",
          destination: destination.trim(),
          supplier_name: supplier.trim(),
          origin: "",
          image_url: tour.image_url || "",
          price_per_person: minPrice || 0,
          taxes: tour.tax_per_person || 0,
          tour_times: tour.times.length ? tour.times : (ai?.times ?? []),
          tour_modalities: tour.modalities.length ? tour.modalities : (ai?.modalities ?? []),
          includes: tour.includes.length ? tour.includes : (ai?.includes ?? []),
          meeting_point: ai?.meeting_point || null,
          services: {
            ...(rawDescription ? { raw_description: rawDescription } : {}),
            ...(notIncludes.length ? { not_includes: notIncludes } : {}),
            ...(tour.gallery.length ? { gallery: tour.gallery } : {}),
          } as BulkImportedTourDraft["services"],
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
            taxes: tour.tax_per_person || 0,
          })),
        });
      }
      onImported(drafts);
      toast.success(
        `${drafts.length} serviço(s) compilado(s). Revise todos os campos nas abas antes de salvar.`,
      );
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setRunning(false);
      setProgress("");
    }
  }

  function compile() {
    if (html.trim().length < 50) {
      toast.error("Cole o HTML do serviço primeiro.");
      return;
    }
    let tours: ParsedTour[];
    try {
      tours = parseMultipleTourHtml(html);
    } catch (error) {
      toast.error("Não consegui ler esse HTML: " + (error as Error).message);
      return;
    }
    if (!tours.length) {
      toast.error("Nenhum serviço encontrado nesse HTML.");
      return;
    }
    if (multi || tours.length === 1) {
      void buildDrafts(tours);
      return;
    }
    setCandidates(tours);
    toast.info(`${tours.length} serviços encontrados — escolha qual deseja importar.`);
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="inline-flex items-center gap-2 text-sm font-bold text-foreground">
          <Code2 className="h-4 w-4 text-brand-orange" /> Importar por HTML
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

          <label className="block space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Destino
            </span>
            <DestinationInput
              value={destination}
              onChange={setDestination}
              placeholder="Ex.: Orlando, Estados Unidos"
            />
          </label>

          <div className="space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Tipo de importação
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setMulti(false)}
                className={`rounded-full px-4 py-1.5 text-xs font-bold ${!multi ? "bg-brand-orange text-primary-foreground" : "bg-muted text-muted-foreground"}`}
              >
                Único
              </button>
              <button
                type="button"
                onClick={() => setMulti(true)}
                className={`rounded-full px-4 py-1.5 text-xs font-bold ${multi ? "bg-brand-orange text-primary-foreground" : "bg-muted text-muted-foreground"}`}
              >
                Múltiplo
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                if (!supplier.trim()) {
                  toast.error("Informe o fornecedor.");
                  return;
                }
                if (!destination.trim()) {
                  toast.error("Informe o destino.");
                  return;
                }
                setStep(1);
              }}
              className="inline-flex items-center gap-2 rounded-lg bg-brand-orange px-4 py-2 text-xs font-bold text-primary-foreground"
            >
              Continuar <ArrowRight className="h-4 w-4" />
            </button>
            {onSkip && (
              <button
                type="button"
                onClick={onSkip}
                className="rounded-lg border border-border px-3 py-2 text-xs font-bold text-muted-foreground hover:bg-muted"
              >
                Pular e abrir editor manual
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-[11px] font-semibold text-muted-foreground">
            {supplier} · {destination} · {multi ? "múltiplos serviços" : "serviço único"}
          </p>
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              HTML {multi ? "dos serviços" : "do serviço"}
            </span>
            <textarea
              rows={10}
              value={html}
              onChange={(event) => {
                setHtml(event.target.value);
                setCandidates([]);
              }}
              placeholder='<div id="frmResultadoProduto...'
              className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs outline-none focus:border-brand-orange"
            />
          </label>

          {candidates.length > 1 && (
            <div className="max-h-64 space-y-2 overflow-y-auto rounded-lg border border-border bg-background/70 p-3">
              <p className="text-xs font-bold text-brand-orange">Escolha um serviço</p>
              {candidates.map((candidate, index) => (
                <button
                  key={`${candidate.title}-${index}`}
                  type="button"
                  disabled={running}
                  onClick={() => void buildDrafts([candidate])}
                  className="flex w-full items-center gap-3 rounded-lg border border-border p-2 text-left hover:border-brand-orange disabled:opacity-60"
                >
                  {candidate.image_url ? (
                    <img src={candidate.image_url} alt="" className="h-10 w-16 rounded object-cover" />
                  ) : null}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-bold">{candidate.title}</span>
                    <span className="block text-[11px] text-muted-foreground">
                      {candidate.modalities.length} modalidade(s) · {candidate.prices.length} preço(s)
                    </span>
                  </span>
                  <ArrowRight className="h-4 w-4 text-brand-orange" />
                </button>
              ))}
            </div>
          )}

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
              onClick={compile}
              disabled={running}
              className="inline-flex items-center gap-2 rounded-lg bg-brand-orange px-4 py-2 text-xs font-bold text-primary-foreground disabled:opacity-60"
            >
              {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Code2 className="h-4 w-4" />}
              {running ? progress || "Compilando…" : "Compilar e abrir edição"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
