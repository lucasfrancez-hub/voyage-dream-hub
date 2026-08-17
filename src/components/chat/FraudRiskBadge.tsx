/**
 * Indicador interno de "Risco da venda" no cabeçalho da conversa.
 * Pode ser ocultado (preferência salva no navegador) para prints seguros —
 * o backend continua calculando normalmente.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Eye, EyeOff, Loader2, ShieldAlert } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { getFraudRisk, reevaluateFraud } from "@/lib/chat/fraud.functions";
import { LEVEL_LABEL, REDUCER_LABEL, SIGNAL_LABEL, type FraudLevel } from "@/lib/whatsapp/fraud/signals";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const STORAGE_KEY = "chat.fraudRisk.hidden";

const LEVEL_STYLE: Record<FraudLevel, string> = {
  baixo: "border-slate-200 bg-slate-50 text-slate-600",
  atencao: "border-amber-200 bg-amber-50 text-amber-700",
  moderado: "border-orange-200 bg-orange-50 text-orange-700",
  alto: "border-red-200 bg-red-50 text-red-700",
  critico: "border-red-300 bg-red-600 text-white",
};

export function FraudRiskBadge({ conversationId }: { conversationId: string }) {
  const [hidden, setHidden] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  });
  const qc = useQueryClient();
  const fetchRisk = useServerFn(getFraudRisk);
  const reevaluate = useServerFn(reevaluateFraud);

  const { data } = useQuery({
    queryKey: ["chat", "fraud", conversationId],
    queryFn: () => fetchRisk({ data: { conversation_id: conversationId } }),
    refetchInterval: 60_000,
    staleTime: 20_000,
  });

  const reavaliar = useMutation({
    mutationFn: async () => reevaluate({ data: { conversation_id: conversationId } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["chat", "fraud", conversationId] });
      toast.success("Risco reavaliado");
    },
    onError: (e) => toast.error(`Falha ao reavaliar: ${(e as Error).message}`),
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
  const level = (data?.level ?? "baixo") as FraudLevel;
  const signals = data?.signals ?? [];
  const reducers = data?.reducers ?? [];
  const clusters = data?.clusters ?? [];

  return (
    <div className="flex shrink-0 items-center gap-0.5">
      <Popover>
        <PopoverTrigger asChild>
          <button
            title="Risco da venda (interno)"
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2 py-1.5 text-[11px] font-semibold sm:text-xs",
              LEVEL_STYLE[level],
            )}
          >
            <ShieldAlert className="h-3.5 w-3.5" />
            <span className="whitespace-nowrap">
              Risco {score} · {LEVEL_LABEL[level]}
            </span>
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-80 p-0 text-sm">
          <div className="border-b border-slate-200 px-3 py-2">
            <div className="font-semibold text-slate-900">
              Score atual: {score}/100 · {LEVEL_LABEL[level]}
            </div>
            {data?.transfer_required && (
              <div className="mt-1 text-[11px] font-medium text-red-600">
                Transferido automaticamente para o Lucas (IA pausada)
              </div>
            )}
          </div>
          <div className="max-h-80 space-y-3 overflow-y-auto px-3 py-2 text-[12px]">
            {data?.summary && <p className="text-slate-600">{data.summary}</p>}
            <div>
              <div className="mb-1 font-semibold text-slate-800">Principais sinais</div>
              {signals.length === 0 ? (
                <div className="text-slate-500">Nenhum sinal relevante.</div>
              ) : (
                <ul className="space-y-0.5">
                  {[...signals]
                    .sort((a, b) => b.intensity - a.intensity)
                    .slice(0, 8)
                    .map((s) => (
                      <li key={s.code} className="text-slate-700">
                        • {SIGNAL_LABEL[s.code] ?? s.code}{" "}
                        <span className="text-slate-400">({Math.round(s.intensity * 100)}%)</span>
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
