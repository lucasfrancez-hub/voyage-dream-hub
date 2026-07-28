import { MapPin, Clock, Layers, Sparkles } from "lucide-react";

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
