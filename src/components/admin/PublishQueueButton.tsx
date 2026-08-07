import { CheckCircle2, Loader2, ListChecks, XCircle, Clock, Trash2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { clearFinishedPublishJobs, usePublishQueue } from "@/lib/publish-queue";

export function PublishQueueButton() {
  const jobs = usePublishQueue();
  const ativos = jobs.filter((j) => j.status === "queued" || j.status === "running").length;
  const erros = jobs.filter((j) => j.status === "error").length;

  return (
    <Popover>
      <PopoverTrigger
        className="relative inline-flex h-8 w-8 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:border-brand-orange hover:text-brand-orange"
        title="Fila de publicação"
        aria-label="Fila de publicação"
      >
        {ativos > 0 ? <Loader2 className="h-3.5 w-3.5 animate-spin text-brand-orange" /> : <ListChecks className="h-3.5 w-3.5" />}
        {(ativos > 0 || erros > 0) && (
          <span
            className={`absolute -right-1 -top-1 min-w-4 rounded-full px-1 text-[10px] font-semibold leading-4 text-white ${
              ativos > 0 ? "bg-brand-orange" : "bg-destructive"
            }`}
          >
            {ativos > 0 ? ativos : erros}
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <span className="text-sm font-medium">Fila de publicação</span>
          {jobs.some((j) => j.status === "done" || j.status === "error") && (
            <button
              type="button"
              onClick={clearFinishedPublishJobs}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <Trash2 className="h-3 w-3" /> Limpar
            </button>
          )}
        </div>
        <div className="max-h-80 overflow-y-auto p-2">
          {jobs.length === 0 ? (
            <p className="px-2 py-6 text-center text-xs text-muted-foreground">
              Nada na fila. Ao clicar em enviar/publicar, o item aparece aqui com o progresso.
            </p>
          ) : (
            <ul className="space-y-1">
              {jobs.map((job) => (
                <li key={job.id} className="flex items-start gap-2 rounded-lg px-2 py-2 hover:bg-muted/50">
                  <span className="mt-0.5">
                    {job.status === "running" && <Loader2 className="h-4 w-4 animate-spin text-brand-orange" />}
                    {job.status === "queued" && <Clock className="h-4 w-4 text-muted-foreground" />}
                    {job.status === "done" && <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
                    {job.status === "error" && <XCircle className="h-4 w-4 text-destructive" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-medium text-foreground">{job.label}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {job.status === "error"
                        ? job.error
                        : job.status === "running"
                          ? "Publicando…"
                          : job.status === "queued"
                            ? "Na fila"
                            : (job.detail ?? "Concluído")}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
