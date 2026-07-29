import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, CheckCircle2, Code2, Loader2 } from "lucide-react";
import { summarizeTourInfo } from "@/lib/packages/ai.functions";
import { parseMultipleTourHtml, type ParsedTour } from "@/lib/packages/tour-html";
import { SupplierInput } from "@/components/packages/SupplierInput";

const inputClass =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-brand-orange";

export type TourImportPatch = {
  title?: string;
  supplier_name?: string;
  destination?: string;
  image_url?: string;
  summary?: string;
  ai_summary?: string;
  includes?: string[];
  tour_modalities?: string[];
  meeting_point?: string;
  tour_times?: string[];
  price_per_person?: number;
  date_mode?: string;
  pricing_mode?: string;
  services?: { raw_description?: string };
};

type ImportedPrice = {
  date: string;
  modality: string;
  price_per_person: number;
  taxes: number;
};

export function TourHtmlImporter({
  destination,
  supplier,
  onApply,
  onPrices,
  onComplete,
}: {
  destination?: string | null;
  supplier?: string | null;
  onApply: (patch: TourImportPatch) => void;
  onPrices?: (rows: ImportedPrice[]) => void;
  onComplete?: () => void;
}) {
  const summarize = useServerFn(summarizeTourInfo);
  const [step, setStep] = useState<0 | 1>(0);
  const [supplierName, setSupplierName] = useState(supplier ?? "");
  const [html, setHtml] = useState("");
  const [candidates, setCandidates] = useState<ParsedTour[]>([]);
  const [loading, setLoading] = useState(false);

  async function applyTour(parsed: ParsedTour) {
    setLoading(true);
    try {
      const rawDescription = parsed.description.trim().slice(0, 55000);
      let ai: Awaited<ReturnType<typeof summarize>> | null = null;
      if (rawDescription.length >= 20) {
        try {
          ai = await summarize({
            data: {
              raw: rawDescription,
              title: parsed.title || undefined,
              destination: destination?.trim() || undefined,
            },
          });
        } catch (error) {
          console.warn("[tour-import] não foi possível organizar a descrição", error);
        }
      }

      const minPrice = parsed.prices.reduce(
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

      onApply({
        ...(parsed.title ? { title: parsed.title } : {}),
        supplier_name: supplierName.trim(),
        ...(parsed.image_url ? { image_url: parsed.image_url } : {}),
        ...(ai?.short ? { summary: ai.short } : {}),
        ...(aiSummary ? { ai_summary: aiSummary } : {}),
        includes: parsed.includes.length ? parsed.includes : (ai?.includes ?? []),
        tour_modalities: parsed.modalities.length ? parsed.modalities : (ai?.modalities ?? []),
        meeting_point: ai?.meeting_point || "",
        tour_times: parsed.times.length ? parsed.times : (ai?.times ?? []),
        ...(minPrice ? { price_per_person: minPrice } : {}),
        services: rawDescription ? { raw_description: rawDescription } : {},
        date_mode: "flexible",
        pricing_mode: "per_unit",
      });
      onPrices?.(
        parsed.prices.map((row) => ({
          date: row.date,
          modality: row.modality,
          price_per_person: row.price_per_person,
          taxes: 0,
        })),
      );
      toast.success("Passeio importado. Revise todos os campos nas abas antes de salvar.");
      onComplete?.();
    } finally {
      setLoading(false);
    }
  }

  function readHtml() {
    if (html.trim().length < 50) {
      toast.error("Cole o HTML do serviço primeiro.");
      return;
    }
    try {
      const parsed = parseMultipleTourHtml(html);
      if (!parsed.length) {
        toast.error("Nenhum passeio encontrado nesse HTML.");
        return;
      }
      if (parsed.length === 1) {
        void applyTour(parsed[0]);
        return;
      }
      setCandidates(parsed);
      toast.info(`${parsed.length} serviços encontrados — escolha qual deseja importar.`);
    } catch (error) {
      toast.error("Não consegui ler esse HTML: " + (error as Error).message);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="inline-flex items-center gap-2 text-sm font-bold text-foreground">
          <Code2 className="h-4 w-4 text-brand-orange" /> Importar passeio por HTML
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
              value={supplierName}
              onChange={setSupplierName}
              placeholder="Ex.: GTA, Civitatis, Ingresso Fácil…"
            />
          </label>
          <button
            type="button"
            onClick={() => {
              if (!supplierName.trim()) {
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
              HTML do serviço
            </span>
            <textarea
              rows={9}
              className={`${inputClass} font-mono text-xs`}
              value={html}
              onChange={(event) => {
                setHtml(event.target.value);
                setCandidates([]);
              }}
              placeholder='<div id="frmResultadoProduto...'
            />
          </label>

          {candidates.length > 1 && (
            <div className="max-h-64 space-y-2 overflow-y-auto rounded-lg border border-border bg-background/70 p-3">
              <p className="text-xs font-bold text-brand-orange">Escolha um serviço</p>
              {candidates.map((candidate, index) => (
                <button
                  key={`${candidate.title}-${index}`}
                  type="button"
                  disabled={loading}
                  onClick={() => void applyTour(candidate)}
                  className="flex w-full items-center gap-3 rounded-lg border border-border p-2 text-left hover:border-brand-orange disabled:opacity-60"
                >
                  {candidate.image_url ? (
                    <img
                      src={candidate.image_url}
                      alt=""
                      className="h-10 w-16 rounded object-cover"
                    />
                  ) : null}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-bold">{candidate.title}</span>
                    <span className="block text-[11px] text-muted-foreground">
                      {candidate.modalities.length} modalidade(s) · {candidate.prices.length} preço(s)
                    </span>
                  </span>
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin text-brand-orange" />
                  ) : (
                    <ArrowRight className="h-4 w-4 text-brand-orange" />
                  )}
                </button>
              ))}
            </div>
          )}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setStep(0)}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-bold"
            >
              <ArrowLeft className="h-4 w-4" /> Voltar
            </button>
            <button
              type="button"
              onClick={readHtml}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-lg bg-brand-orange px-4 py-2 text-xs font-bold text-primary-foreground disabled:opacity-60"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Code2 className="h-4 w-4" />}
              Importar e abrir editor
            </button>
          </div>
        </div>
      )}
    </div>
  );
}