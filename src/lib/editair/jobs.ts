/**
 * Central de Processamento do EditAir.
 *
 * Gerenciador global de tarefas pesadas (transcrição, legendas, recorte de
 * fundo, proxy, waveform, thumbnails, IA…). Vive FORA do React: nenhuma tarefa
 * depende de modal aberto, componente montado ou painel visível. Fechar o
 * painel não cancela nada; trocar de rota também não.
 */

export type JobType =
  | "transcricao"
  | "legendas"
  | "remover-fundo"
  | "proxy"
  | "analise-audio"
  | "waveform"
  | "thumbnails"
  | "importar-midia"
  | "broll"
  | "gerar-midia"
  | "editar-ia"
  | "detectar-pausas"
  | "exportar";

export type JobStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export type ProcessingJob = {
  id: string;
  projectId: string;
  type: JobType;
  /** id do clipe/asset/track a que a tarefa pertence (progresso no próprio elemento) */
  targetId?: string;
  title: string;
  /** etapa real em curso — nunca genérica */
  stage?: string;
  /** 0..100 quando mensurável; null = indeterminado (não inventar 0%) */
  progress: number | null;
  status: JobStatus;
  cancellable: boolean;
  startedAt: number;
  finishedAt?: number;
  error?: string;
  /** mensagem curta de sucesso mostrada brevemente ao concluir */
  resultado?: string;
  /** ação de repetir em caso de falha */
  retry?: () => void;
};

type Ouvinte = () => void;

const jobs = new Map<string, ProcessingJob>();
const abortos = new Map<string, AbortController>();
const ouvintes = new Set<Ouvinte>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();

/** snapshot imutável para useSyncExternalStore */
let snapshot: ProcessingJob[] = [];

function recalcular() {
  snapshot = Array.from(jobs.values()).sort((a, b) => a.startedAt - b.startedAt);
  for (const o of ouvintes) o();
}

export function assinarJobs(ouvinte: Ouvinte): () => void {
  ouvintes.add(ouvinte);
  return () => ouvintes.delete(ouvinte);
}

export function lerJobs(): ProcessingJob[] {
  return snapshot;
}

export function jobsAtivos(projectId?: string): ProcessingJob[] {
  return snapshot.filter(
    (j) => (j.status === "running" || j.status === "queued") && (!projectId || j.projectId === projectId),
  );
}

export function jobsDoAlvo(targetId: string): ProcessingJob[] {
  return snapshot.filter((j) => j.targetId === targetId && j.status !== "cancelled");
}

/** já existe uma tarefa desse tipo rodando para esse alvo? (evita duplicar trabalho) */
export function jobEmAndamento(type: JobType, targetId?: string): ProcessingJob | undefined {
  return snapshot.find(
    (j) => j.type === type && j.targetId === targetId && (j.status === "running" || j.status === "queued"),
  );
}

function novoId() {
  return `job_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export type ControleJob = {
  id: string;
  /** sinal para abortar trabalho pesado */
  signal: AbortSignal;
  cancelado: () => boolean;
  /** atualiza etapa e/ou percentual real (null mantém indeterminado) */
  etapa: (stage: string, progress?: number | null) => void;
  progresso: (progress: number | null) => void;
};

export type OpcoesJob = {
  projectId: string;
  type: JobType;
  title: string;
  targetId?: string;
  stage?: string;
  cancellable?: boolean;
  /** mensagem exibida brevemente ao concluir */
  resultado?: string;
};

function patch(id: string, dados: Partial<ProcessingJob>) {
  const atual = jobs.get(id);
  if (!atual) return;
  jobs.set(id, { ...atual, ...dados });
  recalcular();
}

/** remove o job da lista depois de um tempo (sucesso some suavemente) */
function agendarLimpeza(id: string, ms: number) {
  const anterior = timers.get(id);
  if (anterior) clearTimeout(anterior);
  timers.set(
    id,
    setTimeout(() => {
      jobs.delete(id);
      timers.delete(id);
      abortos.delete(id);
      recalcular();
    }, ms),
  );
}

export function cancelarJob(id: string) {
  const job = jobs.get(id);
  if (!job || job.status === "completed" || job.status === "failed") return;
  abortos.get(id)?.abort();
  patch(id, { status: "cancelled", finishedAt: Date.now() });
  agendarLimpeza(id, 2500);
}

export function descartarJob(id: string) {
  jobs.delete(id);
  timers.delete(id);
  abortos.delete(id);
  recalcular();
}

export type ResultadoJob<T> = { ok: true; valor: T } | { ok: false; cancelado: boolean; erro?: string };

/**
 * Executa uma tarefa em segundo plano. Nunca lança: devolve o desfecho.
 * O trabalho continua mesmo se o componente que chamou for desmontado.
 */
export function executarJob<T>(
  opcoes: OpcoesJob,
  trabalho: (ctl: ControleJob) => Promise<T>,
  callbacks?: {
    aoConcluir?: (valor: T) => void;
    aoFalhar?: (erro: unknown) => void;
    /** permite repetir a tarefa idêntica a partir da UI de erro */
    repetir?: () => void;
  },
): { id: string; promessa: Promise<ResultadoJob<T>> } {
  const id = novoId();
  const controller = new AbortController();
  abortos.set(id, controller);

  jobs.set(id, {
    id,
    projectId: opcoes.projectId,
    type: opcoes.type,
    targetId: opcoes.targetId,
    title: opcoes.title,
    stage: opcoes.stage,
    progress: null,
    status: "running",
    cancellable: opcoes.cancellable ?? true,
    startedAt: Date.now(),
    resultado: opcoes.resultado,
    retry: callbacks?.repetir,
  });
  recalcular();

  const ctl: ControleJob = {
    id,
    signal: controller.signal,
    cancelado: () => controller.signal.aborted,
    etapa: (stage, progress) => {
      if (jobs.get(id)?.status !== "running") return;
      patch(id, progress === undefined ? { stage } : { stage, progress: normalizar(progress) });
    },
    progresso: (progress) => {
      if (jobs.get(id)?.status !== "running") return;
      patch(id, { progress: normalizar(progress) });
    },
  };

  const promessa = (async (): Promise<ResultadoJob<T>> => {
    try {
      const valor = await trabalho(ctl);
      if (controller.signal.aborted) return { ok: false, cancelado: true };
      patch(id, { status: "completed", progress: 100, finishedAt: Date.now() });
      agendarLimpeza(id, 3500);
      callbacks?.aoConcluir?.(valor);
      return { ok: true, valor };
    } catch (e) {
      if (controller.signal.aborted) {
        patch(id, { status: "cancelled", finishedAt: Date.now() });
        agendarLimpeza(id, 2000);
        return { ok: false, cancelado: true };
      }
      const erro = e instanceof Error ? e.message : String(e);
      console.error(`[editair][job:${opcoes.type}]`, e);
      patch(id, { status: "failed", finishedAt: Date.now(), error: erro });
      agendarLimpeza(id, 20000);
      callbacks?.aoFalhar?.(e);
      return { ok: false, cancelado: false, erro };
    }
  })();

  return { id, promessa };
}

function normalizar(p: number | null): number | null {
  if (p == null || Number.isNaN(p)) return null;
  return Math.max(0, Math.min(100, Math.round(p)));
}

/** rótulo curto para o indicador compacto */
export function rotuloCompacto(ativos: ProcessingJob[]): string | null {
  if (ativos.length === 0) return null;
  if (ativos.length === 1) {
    const j = ativos[0]!;
    const base = j.stage || j.title;
    return j.progress == null ? base : `${base} ${j.progress}%`;
  }
  return `${ativos.length} processos`;
}

/** apenas para testes */
export function _resetarJobs() {
  for (const t of timers.values()) clearTimeout(t);
  timers.clear();
  jobs.clear();
  abortos.clear();
  snapshot = [];
  for (const o of ouvintes) o();
}

/**
 * Variante imperativa: para fluxos já escritos com try/catch/finally.
 * Devolve o controle e as funções de desfecho.
 */
export function abrirJob(opcoes: OpcoesJob): ControleJob & {
  concluir: (resultado?: string) => void;
  falhar: (erro: unknown) => void;
  fechar: () => void;
} {
  let resolver!: () => void;
  const espera = new Promise<void>((r) => {
    resolver = r;
  });
  let estado: "aberto" | "fechado" = "aberto";
  let controle!: ControleJob;
  const { id } = executarJob(opcoes, async (ctl) => {
    controle = ctl;
    await espera;
    const job = jobs.get(ctl.id);
    if (job?.error) throw new Error(job.error);
  });
  // executarJob invoca o trabalho de forma síncrona até o primeiro await
  return {
    ...controle,
    concluir: (resultado) => {
      if (estado === "fechado") return;
      estado = "fechado";
      if (resultado) patch(id, { resultado });
      resolver();
    },
    falhar: (erro) => {
      if (estado === "fechado") return;
      estado = "fechado";
      patch(id, { error: erro instanceof Error ? erro.message : String(erro) });
      resolver();
    },
    fechar: () => {
      if (estado === "fechado") return;
      estado = "fechado";
      resolver();
    },
  };
}
