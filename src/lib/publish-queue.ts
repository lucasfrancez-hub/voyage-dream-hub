import { useSyncExternalStore } from "react";

export type PublishJobStatus = "queued" | "running" | "done" | "error";

export type PublishJob = {
  id: string;
  label: string;
  /** canal de destino, só para exibição */
  channel: "whatsapp" | "instagram";
  status: PublishJobStatus;
  detail?: string;
  error?: string;
  createdAt: number;
};

type InternalJob = PublishJob & { run: () => Promise<string | void> };

let jobs: InternalJob[] = [];
let running = false;
const listeners = new Set<() => void>();
let snapshot: PublishJob[] = [];

function emit() {
  snapshot = jobs.map(({ run: _run, ...rest }) => rest);
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return snapshot;
}

async function pump() {
  if (running) return;
  running = true;
  try {
    for (;;) {
      const next = jobs.find((j) => j.status === "queued");
      if (!next) break;
      next.status = "running";
      emit();
      try {
        const detail = await next.run();
        next.status = "done";
        if (typeof detail === "string") next.detail = detail;
      } catch (err) {
        next.status = "error";
        next.error = err instanceof Error ? err.message : "Falha ao publicar";
      }
      emit();
    }
  } finally {
    running = false;
  }
}

export function enqueuePublish(job: {
  label: string;
  channel: PublishJob["channel"];
  detail?: string;
  run: () => Promise<string | void>;
}) {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  jobs = [
    ...jobs,
    { id, label: job.label, channel: job.channel, detail: job.detail, status: "queued", createdAt: Date.now(), run: job.run },
  ];
  emit();
  void pump();
  return id;
}

export function clearFinishedPublishJobs() {
  jobs = jobs.filter((j) => j.status === "queued" || j.status === "running");
  emit();
}

export function usePublishQueue() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
