import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Loader2,
  Sparkles,
  Code2,
  CheckCircle2,
  ArrowLeft,
  ArrowRight,
  RotateCcw,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { summarizeTourInfo } from "@/lib/packages/ai.functions";
import { parseTourHtml, type ParsedTour } from "@/lib/packages/tour-html";
import { DestinationInput } from "@/components/packages/DestinationInput";

const inp =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-brand-orange";

function brl(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export type TourImportPatch = {
  title?: string;
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
};

const STEPS = ["Destino", "HTML do serviço", "Texto complementar", "Pronto"];

export function TourHtmlImporter({
  packageId,
  destination,
  onApply,
}: {
  packageId?: string;
  destination?: string | null;
  onApply: (patch: TourImportPatch) => void;
}) {
  const qc = useQueryClient();
  const summarize = useServerFn(summarizeTourInfo);
  const [step, setStep] = useState(0);
  const [destCity, setDestCity] = useState(destination ?? "");
  const [html, setHtml] = useState("");
  const [extra, setExtra] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [parsed, setParsed] = useState<ParsedTour | null>(null);
  const [loading, setLoading] = useState(false);
  const [savingPrices, setSavingPrices] = useState(false);

  const byModality = useMemo(() => {
    const map = new Map<string, { min: number; max: number; count: number }>();
    for (const p of parsed?.prices ?? []) {
      const cur = map.get(p.modality) ?? { min: Infinity, max: 0, count: 0 };
      cur.min = Math.min(cur.min, p.price_per_person);
      cur.max = Math.max(cur.max, p.price_per_person);
      cur.count += 1;
      map.set(p.modality, cur);
    }
    return [...map.entries()];
  }, [parsed]);

  function handleParse() {
    if (html.trim().length < 50) {
      toast.error("Cole o HTML do serviço primeiro.");
      return;
    }
    try {
      const res = parseTourHtml(html);
      setParsed(res);
      setImageUrl(res.image_url || "");
      setStep(2);
      toast.success(
        `${res.modalities.length} modalidade(s) e ${res.prices.length} preço(s) encontrados.`,
      );
    } catch (e) {
      toast.error("Não consegui ler esse HTML: " + (e as Error).message);
    }
  }

  async function savePrices(p: ParsedTour, silent = false) {
    if (!p.prices.length || !packageId) return false;
    setSavingPrices(true);
    try {
      const rows = p.prices.map((x) => ({
        package_id: packageId,
        date: x.date,
        modality: x.modality,
        price_per_person: x.price_per_person,
        taxes: 0,
        seats: null,
        is_available: true,
      }));
      const { error } = await supabase
        .from("package_date_prices")
        .upsert(rows, { onConflict: "package_id,date,modality" });
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["package-date-prices", packageId] });
      if (!silent) toast.success(`${rows.length} preço(s) gravado(s) no calendário.`);
      return true;
    } catch (e) {
      toast.error((e as Error).message);
      return false;
    } finally {
      setSavingPrices(false);
    }
  }

  async function handleGenerate() {
    if (!parsed) return;
    setLoading(true);
    try {
      const raw = [parsed.description, extra.trim()].filter(Boolean).join("\n\n").slice(0, 55000);
      let ai: Awaited<ReturnType<typeof summarize>> | null = null;
      if (raw.length >= 20) {
        ai = await summarize({
          data: { raw, title: parsed.title || undefined, destination: destCity.trim() || destination || undefined },
        });
      }
      const minPrice = parsed.prices.reduce(
        (m, p) => (m === 0 ? p.price_per_person : Math.min(m, p.price_per_person)),
        0,
      );
      onApply({
        ...(parsed.title ? { title: parsed.title } : {}),
        ...(destCity.trim() ? { destination: destCity.trim() } : {}),
        ...(imageUrl ? { image_url: imageUrl } : {}),
        ...(ai?.short ? { summary: ai.short } : {}),
        ...(ai?.summary
          ? {
              ai_summary: ai.notes
                ? `${ai.summary}\n\n*Informações importantes*\n${ai.notes}`
                : ai.summary,
            }
          : {}),
        ...(parsed.includes.length ? { includes: parsed.includes } : {}),
        ...(parsed.modalities.length ? { tour_modalities: parsed.modalities } : {}),
        meeting_point:
          ai?.meeting_point ||
          "Embarque livre: não há ponto de encontro fixo — apresente o voucher ao embarcar na parada mais próxima.",
        ...(ai?.times?.length ? { tour_times: ai.times } : { tour_times: [] }),
        ...(!ai?.times?.length && ai?.hours_note
          ? {
              ai_summary: [
                ai?.summary
                  ? ai.notes
                    ? `${ai.summary}\n\n*Informações importantes*\n${ai.notes}`
                    : ai.summary
                  : "",
                `*Horário*\n${ai.hours_note}`,
              ]
                .filter(Boolean)
                .join("\n\n"),
            }
          : {}),
        ...(minPrice ? { price_per_person: minPrice } : {}),
        date_mode: "flexible",
        pricing_mode: "per_unit",
      });
      const saved = await savePrices(parsed, true);
      setStep(3);
      toast.success(
        saved
          ? "Tudo preenchido e calendário de preços gravado."
          : "Dados aplicados no formulário — revise e salve.",
      );
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setStep(0);
    setHtml("");
    setExtra("");
    setImageUrl("");
    setParsed(null);
  }

  return (
    <div className="space-y-4 rounded-xl border border-brand-orange/30 bg-brand-orange/[0.04] p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-brand-orange">
          <Code2 className="h-4 w-4" /> Importar passeio por HTML
        </h3>
        <span className="text-[11px] font-semibold text-muted-foreground">
          Etapa {step + 1} de {STEPS.length}
        </span>
      </div>

      {/* Stepper */}
      <div className="flex items-center gap-2">
        {STEPS.map((s, i) => (
          <div key={s} className="flex flex-1 items-center gap-2">
            <div
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                i < step
                  ? "bg-brand-orange text-white"
                  : i === step
                    ? "border-2 border-brand-orange text-brand-orange"
                    : "border border-border text-muted-foreground"
              }`}
            >
              {i < step ? <CheckCircle2 className="h-3.5 w-3.5" /> : i + 1}
            </div>
            <span
              className={`truncate text-[11px] font-semibold ${
                i === step ? "text-foreground" : "text-muted-foreground"
              }`}
            >
              {s}
            </span>
            {i < STEPS.length - 1 && <div className="h-px flex-1 bg-border" />}
          </div>
        ))}
      </div>

      {step === 0 && (
        <div className="space-y-3">
          <label className="block space-y-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Cidade de destino (digite e escolha)
            </span>
            <DestinationInput value={destCity} onChange={setDestCity} />
          </label>
          <button
            type="button"
            onClick={() => {
              if (!destCity.trim()) {
                toast.error("Digite a cidade de destino.");
                return;
              }
              setStep(1);
            }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-orange px-4 py-2 text-xs font-bold text-white"
          >
            Continuar <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {step === 1 && (
        <div className="space-y-3">
          <label className="block space-y-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Cole o bloco HTML do serviço (portal da operadora)
            </span>
            <textarea
              rows={7}
              className={`${inp} font-mono text-[11px]`}
              value={html}
              onChange={(e) => setHtml(e.target.value)}
              placeholder='<div id="frmResultadoProduto...'
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setStep(0)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-xs font-bold"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Voltar
            </button>
            <button
              type="button"
              onClick={handleParse}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand-orange px-4 py-2 text-xs font-bold text-white"
            >
              Continuar <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {step === 2 && parsed && (
        <div className="space-y-3">
          <div className="flex items-center gap-3 rounded-lg border border-border bg-background/70 p-3">
            {(imageUrl || parsed.image_url) && (
              <img
                src={imageUrl || parsed.image_url}
                alt={parsed.title}
                className="h-14 w-20 shrink-0 rounded-lg object-cover"
              />
            )}
            <div className="min-w-0 text-xs">
              <div className="truncate font-bold">{parsed.title || "(sem título)"}</div>
              <div className="text-muted-foreground">
                {parsed.dates.length} data(s) · {parsed.modalities.length} modalidade(s) ·{" "}
                {parsed.prices.length} preço(s)
              </div>
            </div>
          </div>

          {parsed.gallery.length > 1 && (
            <div className="flex flex-wrap gap-2">
              {parsed.gallery.map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setImageUrl(g)}
                  className={`h-12 w-16 overflow-hidden rounded-md border-2 ${
                    (imageUrl || parsed.image_url) === g
                      ? "border-brand-orange"
                      : "border-transparent"
                  }`}
                  title="Usar esta imagem"
                >
                  <img src={g} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          )}

          <label className="block space-y-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Texto complementar (descrição completa da operadora)
            </span>
            <textarea
              rows={6}
              className={inp}
              value={extra}
              onChange={(e) => setExtra(e.target.value)}
              placeholder="Cole aqui o textão da operadora…"
            />
          </label>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-xs font-bold"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Voltar
            </button>
            <button
              type="button"
              onClick={handleGenerate}
              disabled={loading || savingPrices}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand-orange px-4 py-2 text-xs font-bold text-white disabled:opacity-60"
            >
              {loading || savingPrices ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              Gerar e preencher tudo
            </button>
          </div>
        </div>
      )}

      {step === 3 && parsed && (
        <div className="space-y-3">
          <div className="space-y-2 rounded-lg border border-border bg-background/70 p-3 text-xs">
            <div className="inline-flex items-center gap-1.5 font-bold text-brand-orange">
              <CheckCircle2 className="h-4 w-4" /> Formulário preenchido
            </div>
            <ul className="space-y-1">
              {byModality.map(([m, v]) => (
                <li key={m} className="flex items-center justify-between gap-3">
                  <span className="truncate">{m}</span>
                  <span className="shrink-0 font-bold text-brand-orange">
                    {v.min === v.max ? brl(v.min) : `${brl(v.min)} – ${brl(v.max)}`}{" "}
                    <span className="font-normal text-muted-foreground">({v.count} datas)</span>
                  </span>
                </li>
              ))}
            </ul>
            {parsed.includes.length > 0 && (
              <div className="text-muted-foreground">
                <strong>Inclusos:</strong> {parsed.includes.join(" · ")}
              </div>
            )}
            {!packageId && parsed.prices.length > 0 && (
              <div className="text-muted-foreground">
                Salve o passeio para gravar o calendário de {parsed.prices.length} preço(s).
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {packageId && parsed.prices.length > 0 && (
              <button
                type="button"
                onClick={() => savePrices(parsed)}
                disabled={savingPrices}
                className="inline-flex items-center gap-1.5 rounded-lg border border-brand-orange/50 px-3 py-2 text-xs font-bold text-brand-orange disabled:opacity-60"
              >
                {savingPrices ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                )}
                Regravar calendário
              </button>
            )}
            <button
              type="button"
              onClick={reset}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-xs font-bold"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Importar outro
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
