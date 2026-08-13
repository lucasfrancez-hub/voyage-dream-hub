import { CheckCircle2, Loader2, ListChecks, XCircle, Clock, Trash2, CalendarClock } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { clearFinishedPublishJobs, usePublishQueue } from "@/lib/publish-queue";
import { listarPublicacoesAgendadas } from "@/lib/social-schedule.functions";
import {
  agendamentoCanal,
  agendamentoQuando,
  type AgendamentoSocial,
} from "@/lib/social-schedule-format";

/** Rótulo e cor de cada estado de um agendamento salvo no servidor. */
function estadoAgendamento(status: string) {
  if (status === "publicado") return { texto: "Publicado", cor: "text-emerald-500" };
  if (status === "falhou") return { texto: "Falhou", cor: "text-destructive" };
  if (status === "enviando") return { texto: "Publicando…", cor: "text-brand-orange" };
  if (status === "cancelado") return { texto: "Cancelado", cor: "text-muted-foreground" };
  return { texto: "Pendente — aguardando o horário", cor: "text-violet-400" };
}

export function PublishQueueButton() {
  const jobs = usePublishQueue();
  const listarAgendados = useServerFn(listarPublicacoesAgendadas);
  const { data: agendadosRaw = [] } = useQuery({
    queryKey: ["social-scheduled-posts"],
    queryFn: () => listarAgendados(),
    refetchInterval: 60_000,
  });

  const agendados = (agendadosRaw as unknown as AgendamentoSocial[])
    .filter((a) => a.status !== "cancelado")
    .slice()
    .sort((a, b) => b.scheduled_at.localeCompare(a.scheduled_at))
    .slice(0, 30);

  const pendentes = agendados.filter((a) => a.status === "agendado" || a.status === "enviando").length;
  const ativos =
    jobs.filter((j) => j.status === "queued" || j.status === "running").length + pendentes;
  const erros =
    jobs.filter((j) => j.status === "error").length +
    agendados.filter((a) => a.status === "falhou").length;

  return (
    <Popover>
      <PopoverTrigger
        className="relative inline-flex h-8 w-8 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:border-brand-orange hover:text-brand-orange"
        title="Fila"
        aria-label="Fila"
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
          <span className="text-sm font-medium">Fila</span>
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
          {jobs.length === 0 && agendados.length === 0 ? (
            <p className="px-2 py-6 text-center text-xs text-muted-foreground">
              Nada na fila. Ao salvar, enviar, publicar ou agendar, o item aparece aqui com o progresso.
            </p>
          ) : (
            <>
              {jobs.length ? (
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
                              ? (job.detail ?? (job.channel === "promocao" ? "Processando…" : "Publicando…"))
                              : job.status === "queued"
                                ? "Na fila"
                                : (job.detail ?? "Concluído")}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}

              {agendados.length ? (
                <>
                  <p className="mt-2 px-2 pb-1 pt-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                    Agendados
                  </p>
                  <ul className="space-y-1">
                    {agendados.map((a) => {
                      const estado = estadoAgendamento(a.status);
                      return (
                        <li key={a.id} className="flex items-start gap-2 rounded-lg px-2 py-2 hover:bg-muted/50">
                          <span className="mt-0.5">
                            {a.status === "publicado" ? (
                              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                            ) : a.status === "falhou" ? (
                              <XCircle className="h-4 w-4 text-destructive" />
                            ) : a.status === "enviando" ? (
                              <Loader2 className="h-4 w-4 animate-spin text-brand-orange" />
                            ) : (
                              <CalendarClock className="h-4 w-4 text-violet-400" />
                            )}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-xs font-medium text-foreground">
                              {a.label ?? agendamentoCanal(a)}
                            </span>
                            <span className="block truncate text-[11px] text-muted-foreground">
                              {agendamentoQuando(a.scheduled_at)} · {agendamentoCanal(a)}
                            </span>
                            <span className={`block truncate text-[11px] font-semibold ${estado.cor}`}>
                              {a.status === "falhou" && a.error ? a.error : estado.texto}
                            </span>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </>
              ) : null}
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
