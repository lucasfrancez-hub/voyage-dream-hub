import { useSyncExternalStore } from "react";
import { assinarJobs, lerJobs, type ProcessingJob } from "@/lib/editair/jobs";

const vazio: ProcessingJob[] = [];

/** Lista reativa de todos os jobs (a fonte da verdade vive fora do React). */
export function useJobs(): ProcessingJob[] {
  return useSyncExternalStore(assinarJobs, lerJobs, () => vazio);
}

/** Jobs ligados a um clipe/asset específico. */
export function useJobsDoAlvo(targetId: string | undefined): ProcessingJob[] {
  const todos = useJobs();
  if (!targetId) return vazio;
  return todos.filter((j) => j.targetId === targetId);
}
