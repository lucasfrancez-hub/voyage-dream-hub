import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { MapPin, Clock, Layers, Sparkles, Wand2, Loader2, Baby } from "lucide-react";
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
  summary?: string | null;
  includes?: string[] | null;
  services?: any;
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
  const [raw, setRaw] = useState<string>(value.services?.raw_description ?? "");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setRaw(value.services?.raw_description ?? "");
    // só quando troca de passeio
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.title]);

  async function gerar() {
    const text = raw.trim();
    if (text.length < 20) {
      toast.error("Cole o texto completo da descrição do operador primeiro.");
      return;
    }
    setLoading(true);
    try {
      const ai = await summarize({
        data: {
          raw: text.slice(0, 55000),
          title: value.title || undefined,
          destination: value.destination || undefined,
        },
      });
      const base = ai?.summary
        ? ai.notes
          ? `${ai.summary}\n\n*Informações importantes*\n${ai.notes}`
          : ai.summary
        : "";
      const withHours =
        !ai?.times?.length && ai?.hours_note
          ? [base, `*Horário*\n${ai.hours_note}`].filter(Boolean).join("\n\n")
          : base;

      onChange({
        ...(withHours ? { ai_summary: withHours } : {}),
        ...(ai?.short ? { summary: ai.short } : {}),
        ...(ai?.meeting_point ? { meeting_point: ai.meeting_point } : {}),
        ...(ai?.times?.length ? { tour_times: ai.times } : {}),
        ...(ai?.modalities?.length && !(value.tour_modalities ?? []).length
          ? { tour_modalities: ai.modalities }
          : {}),
        ...(ai?.includes?.length && !(value.includes ?? []).length
          ? { includes: ai.includes }
          : {}),
        services: { ...(value.services ?? {}), raw_description: text },
      });
      toast.success("Descrição gerada pela IA.");
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

      {/* Política de idades */}
      <div className="space-y-2 rounded-xl border border-border bg-background/40 p-3">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          <Baby className="h-3.5 w-3.5 text-brand-orange" /> Política de idades
        </span>
        <div className="grid gap-3 sm:grid-cols-5">
          {[
            { k: "free_max_age", label: "Grátis até (anos)", ph: "2" },
            { k: "fee_min_age", label: "Taxa de", ph: "3" },
            { k: "fee_max_age", label: "Taxa até", ph: "9" },
            { k: "fee_amount", label: "Valor da taxa", ph: "1.00" },
            { k: "adult_min_age", label: "Adulto a partir de", ph: "10" },
          ].map((f) => (
            <label key={f.k} className="block space-y-1">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {f.label}
              </span>
              <input
                type="number"
                min={0}
                step={f.k === "fee_amount" ? "0.01" : "1"}
                className={inp}
                value={value.services?.age_policy?.[f.k] ?? ""}
                placeholder={f.ph}
                onChange={(e) =>
                  onChange({
                    services: {
                      ...(value.services ?? {}),
                      age_policy: {
                        fee_currency: value.services?.age_policy?.fee_currency ?? "US$",
                        ...(value.services?.age_policy ?? {}),
                        [f.k]: e.target.value === "" ? null : Number(e.target.value),
                      },
                    },
                  })
                }
              />
            </label>
          ))}
        </div>
        <label className="block space-y-1 sm:max-w-[160px]">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Moeda da taxa
          </span>
          <input
            className={inp}
            value={value.services?.age_policy?.fee_currency ?? "US$"}
            onChange={(e) =>
              onChange({
                services: {
                  ...(value.services ?? {}),
                  age_policy: {
                    ...(value.services?.age_policy ?? {}),
                    fee_currency: e.target.value,
                  },
                },
              })
            }
          />
        </label>
        <p className="text-[10px] text-muted-foreground">
          Crianças grátis ou na faixa de taxa simbólica não entram no valor do passeio — só pagam a
          taxa no local.
        </p>
      </div>


      {/* Texto do operador + geração por IA */}
      <div className="space-y-2 rounded-xl border border-dashed border-brand-orange/40 bg-brand-orange/5 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-brand-orange">
            Texto completo do operador
          </span>
          <button
            type="button"
            onClick={gerar}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-full bg-brand-orange px-4 py-1.5 text-xs font-bold text-white disabled:opacity-60"
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
            Gerar descrição com IA
          </button>
        </div>
        <textarea
          rows={6}
          className={inp}
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          placeholder="Cole aqui a descrição completa do serviço (portal da operadora)…"
        />
        <p className="text-[10px] text-muted-foreground">
          A IA gera a descrição do cliente, ponto de encontro, horários e itens inclusos.
        </p>
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
