import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Sparkles, Code2, Image as ImageIcon, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { summarizeTourInfo } from "@/lib/packages/ai.functions";
import { parseTourHtml, type ParsedTour } from "@/lib/packages/tour-html";

const inp =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-brand-orange";

function brl(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export type TourImportPatch = {
  title?: string;
  image_url?: string;
  summary?: string;
  ai_summary?: string;
  includes?: string[];
  tour_modalities?: string[];
  price_per_person?: number;
  date_mode?: string;
  pricing_mode?: string;
};

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
      if (!imageUrl && res.image_url) setImageUrl(res.image_url);
      toast.success(
        `${res.modalities.length} modalidade(s) e ${res.prices.length} preço(s) encontrados.`,
      );
    } catch (e) {
      toast.error("Não consegui ler esse HTML: " + (e as Error).message);
    }
  }

  async function handleAiAndApply() {
    if (!parsed) return;
    setLoading(true);
    try {
      const raw = [parsed.description, extra.trim()].filter(Boolean).join("\n\n").slice(0, 55000);
      let ai: Awaited<ReturnType<typeof summarize>> | null = null;
      if (raw.length >= 20) {
        ai = await summarize({
          data: { raw, title: parsed.title || undefined, destination: destination ?? undefined },
        });
      }
      const minPrice = parsed.prices.reduce(
        (m, p) => (m === 0 ? p.price_per_person : Math.min(m, p.price_per_person)),
        0,
      );
      onApply({
        ...(parsed.title ? { title: parsed.title } : {}),
        ...(imageUrl ? { image_url: imageUrl } : {}),
        ...(ai?.short ? { summary: ai.short } : {}),
        ...(ai?.summary
          ? { ai_summary: ai.notes ? `${ai.summary}\n\n*Informações importantes*\n${ai.notes}` : ai.summary }
          : {}),
        ...(parsed.includes.length ? { includes: parsed.includes } : {}),
        ...(parsed.modalities.length ? { tour_modalities: parsed.modalities } : {}),
        ...(minPrice ? { price_per_person: minPrice } : {}),
        date_mode: "flexible",
        pricing_mode: "per_unit",
      });
      toast.success("Dados aplicados no formulário — revise e salve.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function savePrices() {
    if (!parsed?.prices.length) return;
    if (!packageId) {
      toast.error("Salve o passeio primeiro para gravar o calendário de preços.");
      return;
    }
    setSavingPrices(true);
    try {
      const rows = parsed.prices.map((p) => ({
        package_id: packageId,
        date: p.date,
        modality: p.modality,
        price_per_person: p.price_per_person,
        taxes: 0,
        seats: null,
        is_available: true,
      }));
      const { error } = await supabase
        .from("package_date_prices")
        .upsert(rows, { onConflict: "package_id,date,modality" });
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["package-date-prices", packageId] });
      toast.success(`${rows.length} preço(s) gravado(s) no calendário.`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSavingPrices(false);
    }
  }

  return (
    <div className="space-y-3 rounded-xl border border-brand-orange/30 bg-brand-orange/[0.04] p-4">
      <h3 className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-brand-orange">
        <Code2 className="h-4 w-4" /> Importar passeio por HTML
      </h3>

      <label className="block space-y-1">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          HTML do serviço (copie o bloco do portal)
        </span>
        <textarea
          rows={5}
          className={`${inp} font-mono text-[11px]`}
          value={html}
          onChange={(e) => setHtml(e.target.value)}
          placeholder='<div id="frmResultadoProduto...'
        />
      </label>

      <label className="block space-y-1">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Texto complementar (descrição completa / detalhes do serviço)
        </span>
        <textarea
          rows={4}
          className={inp}
          value={extra}
          onChange={(e) => setExtra(e.target.value)}
          placeholder="Cole aqui o textão da operadora…"
        />
      </label>

      <label className="block space-y-1">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          <ImageIcon className="h-3.5 w-3.5" /> URL da imagem
        </span>
        <input
          className={inp}
          value={imageUrl}
          onChange={(e) => setImageUrl(e.target.value)}
          placeholder="https://…jpg"
        />
      </label>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={handleParse}
          className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-bold"
        >
          Ler HTML
        </button>
        <button
          type="button"
          onClick={handleAiAndApply}
          disabled={!parsed || loading}
          className="inline-flex items-center gap-1.5 rounded-lg bg-brand-orange px-3 py-1.5 text-xs font-bold text-white disabled:opacity-60"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          Gerar resumo e preencher
        </button>
        <button
          type="button"
          onClick={savePrices}
          disabled={!parsed?.prices.length || savingPrices}
          className="inline-flex items-center gap-1.5 rounded-lg border border-brand-orange/50 px-3 py-1.5 text-xs font-bold text-brand-orange disabled:opacity-60"
        >
          {savingPrices ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <CheckCircle2 className="h-3.5 w-3.5" />
          )}
          Gravar calendário de preços
        </button>
      </div>

      {parsed && (
        <div className="space-y-2 rounded-lg border border-border bg-background/70 p-3 text-xs">
          <div className="font-bold">{parsed.title || "(sem título)"}</div>
          <div className="text-muted-foreground">
            {parsed.dates.length} data(s) · {parsed.modalities.length} modalidade(s) ·{" "}
            {parsed.prices.length} preço(s)
            {parsed.dates.length
              ? ` · ${parsed.dates[0]} → ${parsed.dates[parsed.dates.length - 1]}`
              : ""}
          </div>
          {parsed.image_url && (
            <img
              src={imageUrl || parsed.image_url}
              alt={parsed.title}
              className="h-24 w-40 rounded-lg object-cover"
            />
          )}
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
        </div>
      )}
    </div>
  );
}
