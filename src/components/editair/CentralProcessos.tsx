/**
 * Indicador discreto de processamento (canto inferior, junto da timeline).
 * Nunca escurece a tela, nunca abre modal central.
 */
import { useState } from "react";
import { Loader2, Check, AlertTriangle, X, ChevronUp } from "lucide-react";
import { useJobs } from "@/hooks/use-editair-jobs";
import { cancelarJob, descartarJob, type ProcessingJob } from "@/lib/editair/jobs";

const LARANJA = "#F26B1F";

function BarraFina({ progress }: { progress: number | null }) {
  return (
    <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-white/10">
      {progress == null ? (
        <div className="h-full w-1/3 animate-[editair-indeterminado_1.2s_ease-in-out_infinite] rounded-full" style={{ background: LARANJA }} />
      ) : (
        <div className="h-full rounded-full transition-all" style={{ width: `${progress}%`, background: LARANJA }} />
      )}
    </div>
  );
}

function LinhaJob({ job }: { job: ProcessingJob }) {
  const rotulo = job.stage || job.title;
  return (
    <div className="px-3 py-2" data-testid={`job-${job.type}`}>
      <div className="flex items-center gap-2 text-xs">
        {job.status === "completed" ? (
          <Check className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
        ) : job.status === "failed" ? (
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-400" />
        ) : (
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" style={{ color: LARANJA }} />
        )}
        <span className="min-w-0 flex-1 truncate text-white/80">
          {job.status === "completed" ? job.resultado || `${job.title} concluído` : job.status === "failed" ? job.error || `Falha em ${job.title}` : rotulo}
        </span>
        {job.status === "running" && job.progress != null ? (
          <span className="tabular-nums text-white/50">{job.progress}%</span>
        ) : null}
        {job.status === "failed" && job.retry ? (
          <button type="button" className="rounded px-1.5 py-0.5 text-[11px] text-white/70 hover:bg-white/10" onClick={() => { descartarJob(job.id); job.retry?.(); }}>
            Tentar novamente
          </button>
        ) : null}
        {job.status === "running" && job.cancellable ? (
          <button type="button" aria-label="Cancelar" className="rounded p-0.5 text-white/50 hover:bg-white/10 hover:text-white" onClick={() => cancelarJob(job.id)}>
            <X className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>
      {job.status === "running" || job.status === "queued" ? <BarraFina progress={job.progress} /> : null}
    </div>
  );
}

export function CentralProcessos({ projectId }: { projectId?: string }) {
  const todos = useJobs();
  const [aberto, setAberto] = useState(false);
  const visiveis = todos.filter((j) => (!projectId || j.projectId === projectId) && j.status !== "cancelled");
  const ativos = visiveis.filter((j) => j.status === "running" || j.status === "queued");
  if (visiveis.length === 0) return null;

  const principal = ativos[0] ?? visiveis[0]!;
  const compacto =
    ativos.length > 1
      ? `${ativos.length} processos`
      : ativos.length === 1
        ? `${principal.stage || principal.title}${principal.progress != null ? ` ${principal.progress}%` : ""}`
        : principal.status === "failed"
          ? principal.error || "Falha no processamento"
          : principal.resultado || `${principal.title} concluído`;

  return (
    <div className="pointer-events-auto absolute bottom-3 right-3 z-30 w-[280px]" data-testid="central-processos">
      {aberto ? (
        <div className="mb-1 max-h-64 overflow-auto rounded-xl border border-white/10 bg-[#14161a]/95 shadow-2xl backdrop-blur">
          <div className="border-b border-white/10 px-3 py-1.5 text-[11px] uppercase tracking-wide text-white/40">
            Processando ({ativos.length})
          </div>
          {visiveis.map((j) => (
            <LinhaJob key={j.id} job={j} />
          ))}
        </div>
      ) : null}
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        className="flex w-full items-center gap-2 rounded-xl border border-white/10 bg-[#14161a]/95 px-3 py-2 text-left text-xs text-white/80 shadow-xl backdrop-blur transition hover:bg-[#1b1e24]"
      >
        {ativos.length > 0 ? (
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" style={{ color: LARANJA }} />
        ) : principal.status === "failed" ? (
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-400" />
        ) : (
          <Check className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
        )}
        <span className="min-w-0 flex-1 truncate">{compacto}</span>
        <ChevronUp className={`h-3.5 w-3.5 shrink-0 text-white/40 transition ${aberto ? "rotate-180" : ""}`} />
      </button>
    </div>
  );
}
