/**
 * Indicador interno de "Risco da venda" no cabeçalho da conversa.
 *
 * Mostra score vivo (atual/máximo), confiança, tendência, fatores, redutores,
 * eventos críticos, linha do tempo e os controles de avaliação manual.
 * Pode ser ocultado (preferência salva no navegador) para prints seguros —
 * o backend continua calculando normalmente.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Eye,
  EyeOff,
  Loader2,
  ShieldAlert,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  getFraudRisk,
  listFraudTimeline,
  reevaluateFraud,
  setFraudOutcome,
  submitFraudReview,
} from "@/lib/chat/fraud.functions";
import { REDUCER_LABEL, SIGNAL_LABEL, type FraudSignalCode } from "@/lib/whatsapp/fraud/signals";
import { BAND_LABEL, CRITICAL_FLAG_LABEL, bandFromScore, type FraudBand, type FraudCriticalFlag } from "@/lib/whatsapp/fraud/dynamic";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const STORAGE_KEY = "chat.fraudRisk.hidden";

const BAND_STYLE: Record<FraudBand, string> = {
  baixo: "border-slate-200 bg-slate-50 text-slate-600",
  observacao: "border-sky-200 bg-sky-50 text-sky-700",
  atencao: "border-amber-200 bg-amber-50 text-amber-700",
  elevado: "border-orange-200 bg-orange-50 text-orange-700",
  alto: "border-red-200 bg-red-50 text-red-700",
  critico: "border-red-300 bg-red-600 text-white",
};

const TREND_ICON = {
  subindo: ArrowUpRight,
  caindo: ArrowDownRight,
  estavel: ArrowRight,
} as const;

const REVIEW_ACTIONS = [
  { action: "verificado", label: "Marcar verificado" },
  { action: "risco_descartado", label: "Risco descartado" },
  { action: "observacao", label: "Manter em observação" },
  { action: "bloquear_venda", label: "Bloquear venda" },
] as const;

const OUTCOMES = [
  { value: "LEGITIMA", label: "Legítima" },
  { value: "FRAUDE_CONFIRMADA", label: "Fraude confirmada" },
  { value: "SUSPEITA_DESCARTADA", label: "Suspeita descartada" },
  { value: "NAO_CONCLUSIVA", label: "Não conclusiva" },
  { value: "CANCELADA", label: "Cancelada" },
] as const;

export function FraudRiskBadge({ conversationId }: { conversationId: string }) {
  const [hidden, setHidden] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  });
  const [aberto, setAberto] = useState(false);
  const qc = useQueryClient();
  const fetchRisk = useServerFn(getFraudRisk);
  const fetchTimeline = useServerFn(listFraudTimeline);
  const reevaluate = useServerFn(reevaluateFraud);
  const review = useServerFn(submitFraudReview);
  const outcome = useServerFn(setFraudOutcome);

  const { data } = useQuery({
    queryKey: ["chat", "fraud", conversationId],
    queryFn: () => fetchRisk({ data: { conversation_id: conversationId } }),
    refetchInterval: 60_000,
    staleTime: 20_000,
  });

  const { data: timeline } = useQuery({
    queryKey: ["chat", "fraud-timeline", conversationId],
    queryFn: () => fetchTimeline({ data: { conversation_id: conversationId } }),
    enabled: aberto && !hidden,
    staleTime: 20_000,
  });

  const invalidar = () => {
    qc.invalidateQueries({ queryKey: ["chat", "fraud", conversationId] });
    qc.invalidateQueries({ queryKey: ["chat", "fraud-timeline", conversationId] });
  };

  const reavaliar = useMutation({
    mutationFn: async () => reevaluate({ data: { conversation_id: conversationId } }),
    onSuccess: () => {
      invalidar();
      toast.success("Risco reavaliado");
    },
    onError: (e) => toast.error(`Falha ao reavaliar: ${(e as Error).message}`),
  });

  const revisar = useMutation({
    mutationFn: async (vars: { action: (typeof REVIEW_ACTIONS)[number]["action"] | "sinal_esclarecido"; signal_code?: string }) =>
      review({ data: { conversation_id: conversationId, action: vars.action, signal_code: vars.signal_code } }),
    onSuccess: () => {
      invalidar();
      toast.success("Avaliação registrada");
    },
    onError: (e) => toast.error(`Falha ao registrar: ${(e as Error).message}`),
  });

  const desfecho = useMutation({
    mutationFn: async (value: (typeof OUTCOMES)[number]["value"]) =>
      outcome({ data: { conversation_id: conversationId, outcome: value } }),
    onSuccess: () => {
      invalidar();
      toast.success("Desfecho registrado");
    },
    onError: (e) => toast.error(`Falha ao registrar desfecho: ${(e as Error).message}`),
  });

  const toggleHidden = () => {
    setHidden((h) => {
      const next = !h;
      if (typeof window !== "undefined") window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      return next;
    });
  };

  if (hidden) {
    return (
      <button
        onClick={toggleHidden}
        title="Mostrar risco da venda (informação interna)"
        aria-label="Mostrar risco da venda"
        className="shrink-0 rounded-md p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
      >
        <EyeOff className="h-4 w-4" />
      </button>
    );
  }

  const score = data?.score ?? 0;
  const band = (data?.band ?? bandFromScore(score)) as FraudBand;
  const confidence = data?.confidence ?? 0;
  const trend = (data?.trend ?? "estavel") as keyof typeof TREND_ICON;
  const TrendIcon = TREND_ICON[trend] ?? ArrowRight;
  const signals = (data?.signals ?? []).filter((s) => s.status !== "esclarecido");
  const esclarecidos = (data?.signals ?? []).filter((s) => s.status === "esclarecido");
  const reducers = data?.reducers ?? [];
  const clusters = data?.clusters ?? [];
  const flags = (data?.critical_flags ?? []) as FraudCriticalFlag[];

  return (
    <div className="flex shrink-0 items-center gap-0.5">
      <Popover open={aberto} onOpenChange={setAberto}>
        <PopoverTrigger asChild>
          <button
            title="Risco da venda (interno)"
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2 py-1.5 text-[11px] font-semibold sm:text-xs",
              BAND_STYLE[band],
            )}
          >
            <ShieldAlert className="h-3.5 w-3.5" />
            <span className="whitespace-nowrap">
              Risco {score} · {BAND_LABEL[band]}
            </span>
            <TrendIcon className="h-3.5 w-3.5" />
            <span className="hidden whitespace-nowrap opacity-70 sm:inline">{confidence}%</span>
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-96 max-w-[92vw] p-0 text-sm">
          <div className="border-b border-slate-200 px-3 py-2">
            <div className="font-semibold text-slate-900">
              Risco atual: {score} · {BAND_LABEL[band]}
            </div>
            <div className="mt-0.5 grid grid-cols-2 gap-x-3 text-[11px] text-slate-600">
              <span>Maior risco: {data?.max_score ?? score}</span>
              <span>Confiança: {confidence}%</span>
              <span>
                Tendência: {trend === "subindo" ? "↑ subindo" : trend === "caindo" ? "↓ caindo" : "→ estável"}
              </span>
              <span>Velocidade: {data?.velocity ?? "leve"}</span>
              {(data?.persistence ?? 0) > 1 && <span>Persistência: {data?.persistence} avaliações</span>}
              {data?.score_at_transfer != null && <span>Transferido em: {data.score_at_transfer}</span>}
            </div>
            {data?.transfer_required && (
              <div className="mt-1 text-[11px] font-medium text-red-600">
                Transferido para o Lucas (IA pausada){data?.transfer_reason ? ` — ${data.transfer_reason}` : ""}
              </div>
            )}
            {data?.transfer_required && data?.analysis_active && (
              <div className="text-[11px] text-slate-500">Análise de risco continua ativa após o humano.</div>
            )}
            {data?.outcome && (
              <div className="mt-1 text-[11px] font-medium text-slate-700">Desfecho: {data.outcome}</div>
            )}
          </div>
          <div className="max-h-96 space-y-3 overflow-y-auto px-3 py-2 text-[12px]">
            {data?.summary && <p className="text-slate-600">{data.summary}</p>}

            {flags.length > 0 && (
              <div>
                <div className="mb-1 font-semibold text-slate-800">Eventos críticos</div>
                <ul className="space-y-0.5">
                  {flags.map((f) => (
                    <li key={f} className="text-red-700">• {CRITICAL_FLAG_LABEL[f] ?? f}</li>
                  ))}
                </ul>
              </div>
            )}

            <div>
              <div className="mb-1 font-semibold text-slate-800">Principais fatores atuais</div>
              {signals.length === 0 ? (
                <div className="text-slate-500">Nenhum sinal relevante.</div>
              ) : (
                <ul className="space-y-0.5">
                  {[...signals]
                    .sort((a, b) => (b.strength ?? b.intensity) - (a.strength ?? a.intensity))
                    .slice(0, 8)
                    .map((s) => (
                      <li key={s.code} className="flex items-start justify-between gap-2 text-slate-700">
                        <span>
                          • {SIGNAL_LABEL[s.code as FraudSignalCode] ?? s.code}{" "}
                          <span className="text-slate-400">
                            ({Math.round((s.strength ?? s.intensity) * 100)}%
                            {s.status === "enfraquecido" ? " · perdendo força" : ""})
                          </span>
                        </span>
                        <button
                          onClick={() => revisar.mutate({ action: "sinal_esclarecido", signal_code: s.code })}
                          className="shrink-0 rounded border border-slate-200 px-1 text-[10px] text-slate-500 hover:bg-slate-50"
                        >
                          esclarecer
                        </button>
                      </li>
                    ))}
                </ul>
              )}
            </div>

            {clusters.length > 0 && (
              <div>
                <div className="mb-1 font-semibold text-slate-800">Padrões detectados</div>
                <ul className="space-y-0.5">
                  {clusters.map((c) => (
                    <li key={c.code} className="text-red-700">• {c.label}</li>
                  ))}
                </ul>
              </div>
            )}

            <div>
              <div className="mb-1 font-semibold text-slate-800">Redutores</div>
              {reducers.length === 0 ? (
                <div className="text-slate-500">Nenhum redutor identificado.</div>
              ) : (
                <ul className="space-y-0.5">
                  {reducers.map((r) => (
                    <li key={r.code} className="text-emerald-700">• {REDUCER_LABEL[r.code] ?? r.code}</li>
                  ))}
                </ul>
              )}
            </div>

            {esclarecidos.length > 0 && (
              <div className="text-[11px] text-slate-500">
                Esclarecidos manualmente: {esclarecidos.map((s) => SIGNAL_LABEL[s.code as FraudSignalCode] ?? s.code).join(", ")}
              </div>
            )}

            <div>
              <div className="mb-1 font-semibold text-slate-800">Linha do tempo</div>
              {!timeline || timeline.length === 0 ? (
                <div className="text-slate-500">Sem eventos registrados ainda.</div>
              ) : (
                <ul className="space-y-1">
                  {timeline.map((t) => (
                    <li key={t.id} className="flex gap-2 text-slate-600">
                      <span className="shrink-0 text-slate-400">
                        {new Date(t.created_at as string).toLocaleTimeString("pt-BR", {
                          timeZone: "America/Sao_Paulo",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                      <span>
                        {t.score != null && <strong className="text-slate-800">Risco {t.score} · </strong>}
                        {t.label}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <div className="mb-1 font-semibold text-slate-800">Avaliação manual</div>
              <div className="flex flex-wrap gap-1">
                {REVIEW_ACTIONS.map((a) => (
                  <button
                    key={a.action}
                    disabled={revisar.isPending}
                    onClick={() => revisar.mutate({ action: a.action })}
                    className="rounded-md border border-slate-200 px-2 py-1 text-[11px] text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    {a.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="mb-1 font-semibold text-slate-800">Desfecho da venda</div>
              <div className="flex flex-wrap gap-1">
                {OUTCOMES.map((o) => (
                  <button
                    key={o.value}
                    disabled={desfecho.isPending}
                    onClick={() => desfecho.mutate(o.value)}
                    className="rounded-md border border-slate-200 px-2 py-1 text-[11px] text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="text-[11px] text-slate-500">
              Última avaliação:{" "}
              {data?.last_evaluation
                ? new Date(data.last_evaluation).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })
                : "ainda não avaliada"}
            </div>
          </div>
          <div className="flex items-center justify-between border-t border-slate-200 px-3 py-2">
            <button
              onClick={() => reavaliar.mutate()}
              disabled={reavaliar.isPending}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {reavaliar.isPending && <Loader2 className="h-3 w-3 animate-spin" />}
              Reavaliar conversa
            </button>
            <span className="text-[10px] text-slate-400">Uso interno — nunca aparece pro cliente</span>
          </div>
        </PopoverContent>
      </Popover>
      <button
        onClick={toggleHidden}
        title="Ocultar risco (para prints)"
        aria-label="Ocultar risco da venda"
        className="shrink-0 rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
      >
        <Eye className="h-4 w-4" />
      </button>
    </div>
  );
}
