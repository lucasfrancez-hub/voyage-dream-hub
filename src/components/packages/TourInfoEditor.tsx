import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, MapPin, Clock, Layers, Sparkles } from "lucide-react";
import { summarizeTourInfo } from "@/lib/packages/ai.functions";

const inp =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-brand-orange";

export type TourInfoValue = {
  title?: string | null;
  destination?: string | null;
  meeting_point?: string | null;
  tour_times?: string[] | null;
  tour_modalities?: string[] | null;
  ai_summary?: string | null;
  includes?: string[] | null;
};

function listToText(v?: string[] | null) {
  return (v ?? []).join("\n");
}
function textToList(v: string) {
  return v
    .split(/\r?\n|,/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function TourInfoEditor({
  value,
  onChange,
}: {
  value: TourInfoValue;
  onChange: (patch: Partial<TourInfoValue>) => void;
}) {
  const summarize = useServerFn(summarizeTourInfo);
  const [raw, setRaw] = useState("");
  const [loading, setLoading] = useState(false);

  async function runAi() {
    if (raw.trim().length < 20) {
      toast.error("Cole o texto do 'Ver detalhes do serviço' primeiro.");
      return;
    }
    setLoading(true);
    try {
      const res = await summarize({
        data: {
          raw: raw.trim(),
          title: value.title ?? undefined,
          destination: value.destination ?? undefined,
        },
      });
      const patch: Partial<TourInfoValue> = { ai_summary: res.summary };
      if (res.meeting_point && !value.meeting_point) patch.meeting_point = res.meeting_point;
      if (res.times.length && !(value.tour_times ?? []).length) patch.tour_times = res.times;
      if (res.modalities.length && !(value.tour_modalities ?? []).length)
        patch.tour_modalities = res.modalities;
      if (res.includes.length && !(value.includes ?? []).length) patch.includes = res.includes;
      if (res.notes) patch.ai_summary = `${res.summary}\n\n*Informações importantes*\n${res.notes}`;
      onChange(patch);
      toast.success("Resumo gerado pela IA — revise e salve.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4 rounded-xl border border-border bg-card/60 p-4">
      <h3 className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
        <Sparkles className="h-4 w-4 text-brand-orange" /> Detalhes do passeio
      </h3>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1 sm:col-span-2">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            <MapPin className="h-3.5 w-3.5" /> Ponto de encontro / saída
          </span>
          <input
            className={inp}
            value={value.meeting_point ?? ""}
            onChange={(e) => onChange({ meeting_point: e.target.value })}
            placeholder="Ex.: Rua Cais de Santarém 8, 1100-104, Lisboa"
          />
        </label>

        <label className="block space-y-1">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            <Clock className="h-3.5 w-3.5" /> Horários de saída (um por linha)
          </span>
          <textarea
            rows={4}
            className={inp}
            value={listToText(value.tour_times)}
            onChange={(e) => onChange({ tour_times: textToList(e.target.value) })}
            placeholder={"12:00\n14:00\n17:00"}
          />
        </label>

        <label className="block space-y-1">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            <Layers className="h-3.5 w-3.5" /> Modalidades (uma por linha)
          </span>
          <textarea
            rows={4}
            className={inp}
            value={listToText(value.tour_modalities)}
            onChange={(e) => onChange({ tour_modalities: textToList(e.target.value) })}
            placeholder={"Harmonização com pastel de nata\nHarmonização com chocolates"}
          />
        </label>
      </div>

      <div className="space-y-2 rounded-lg border border-dashed border-border bg-muted/20 p-3">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Colar o texto de “Ver detalhes do serviço” e resumir com IA
        </span>
        <textarea
          rows={4}
          className={inp}
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          placeholder="Cole aqui todo o texto do portal da operadora…"
        />
        <button
          type="button"
          onClick={runAi}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-lg bg-brand-orange px-3 py-1.5 text-xs font-bold text-white disabled:opacity-60"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          Resumir com IA
        </button>
      </div>

      <label className="block space-y-1">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Descrição para o cliente (aceita *negrito* do WhatsApp)
        </span>
        <textarea
          rows={10}
          className={inp}
          value={value.ai_summary ?? ""}
          onChange={(e) => onChange({ ai_summary: e.target.value })}
          placeholder="Resumo legível do passeio…"
        />
      </label>
    </div>
  );
}
