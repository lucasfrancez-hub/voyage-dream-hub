import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listConversations, setFunnelStage } from "@/lib/chat/queries.functions";
import { FUNNEL_STAGES, type FunnelStageKey } from "@/lib/chat/funnel-stages";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/chat/crm")({
  component: CRMPage,
});

function CRMPage() {
  const fn = useServerFn(listConversations);
  const stageFn = useServerFn(setFunnelStage);
  const qc = useQueryClient();
  const { data: convs = [], isLoading } = useQuery({
    queryKey: ["chat", "conversations"],
    queryFn: () => fn(),
  });
  const [dragOver, setDragOver] = useState<FunnelStageKey | null>(null);

  const moveMut = useMutation({
    mutationFn: async (v: { conversation_id: string; funnel_stage: FunnelStageKey }) =>
      stageFn({ data: v }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["chat", "conversations"] });
      toast.success("Etapa atualizada");
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Falha"),
  });

  const stageOf = (c: (typeof convs)[number]): FunnelStageKey =>
    (c.funnel_stage as FunnelStageKey | null) ?? "novo";

  return (
    <div className="h-full overflow-hidden p-4">
      {isLoading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
        </div>
      ) : (
        <div className="flex h-full w-full gap-2">
          {FUNNEL_STAGES.map((col) => {
            const cards = convs.filter((c) => stageOf(c) === col.key);
            const isTarget = dragOver === col.key;
            return (
              <div
                key={col.key}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (dragOver !== col.key) setDragOver(col.key);
                }}
                onDragLeave={() => setDragOver((v) => (v === col.key ? null : v))}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(null);
                  const id = e.dataTransfer.getData("text/plain");
                  if (!id) return;
                  const conv = convs.find((c) => c.id === id);
                  if (!conv || stageOf(conv) === col.key) return;
                  moveMut.mutate({ conversation_id: id, funnel_stage: col.key });
                }}
                className={`flex h-full min-w-0 flex-1 flex-col rounded-lg border bg-white shadow-sm transition-colors ${
                  isTarget ? "border-[#F26B1F] ring-2 ring-[#F26B1F]/30" : "border-slate-200"
                }`}
              >
                <div className={`border-t-4 rounded-t-lg ${col.accent} px-2 py-1.5 flex items-center justify-between`}>
                  <span className="truncate text-xs font-semibold text-slate-900">{col.label}</span>
                  <span className="ml-1 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                    {cards.length}
                  </span>
                </div>
                <div className="flex-1 space-y-1.5 overflow-y-auto p-1.5">
                  {cards.map((c) => (
                    <div
                      key={c.id}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/plain", c.id);
                        e.dataTransfer.effectAllowed = "move";
                      }}
                      className="cursor-grab rounded-md border border-slate-200 bg-white p-2 shadow-sm hover:border-[#F26B1F]/40 active:cursor-grabbing"
                    >
                      <div className="truncate text-xs font-medium text-slate-900">
                        {c.display_name ?? c.wa_phone}
                      </div>
                      <div className="truncate text-[10px] text-slate-500">{c.wa_phone}</div>
                      {c.last_message_preview && (
                        <div className="mt-1 line-clamp-2 text-[11px] text-slate-600">
                          {c.last_message_preview}
                        </div>
                      )}
                      <div className="mt-1.5 flex items-center justify-between">
                        <span
                          className={`rounded-full px-1.5 py-0.5 text-[9px] ${
                            c.mode === "ai"
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-violet-50 text-violet-700"
                          }`}
                        >
                          {c.mode === "ai" ? "IA" : "Humano"}
                        </span>
                        <span className="text-[9px] text-slate-400">
                          {c.last_message_at
                            ? new Date(c.last_message_at).toLocaleDateString("pt-BR")
                            : ""}
                        </span>
                      </div>
                    </div>
                  ))}
                  {cards.length === 0 && (
                    <div className="rounded-md border-2 border-dashed border-slate-200 p-3 text-center text-[10px] text-slate-400">
                      Sem cards
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
