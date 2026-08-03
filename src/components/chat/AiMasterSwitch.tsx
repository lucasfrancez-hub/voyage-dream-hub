import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Bot, BotOff } from "lucide-react";
import { toast } from "sonner";
import { confirmThen } from "@/lib/confirm";
import { getAiGlobalSwitch, setAiGlobalSwitch } from "@/lib/chat/ai-switch.functions";

/**
 * Botão mestre: desliga TODAS as IAs de uma vez. Com o interruptor desligado,
 * nenhum agente responde em nenhuma conversa — atual ou nova — até religar.
 */
export function AiMasterSwitch() {
  const qc = useQueryClient();
  const getSwitch = useServerFn(getAiGlobalSwitch);
  const setSwitch = useServerFn(setAiGlobalSwitch);

  const { data } = useQuery({
    queryKey: ["ai-global-switch"],
    queryFn: () => getSwitch({}),
    refetchInterval: 20_000,
    staleTime: 10_000,
  });
  const enabled = data?.ai_enabled ?? true;

  const mut = useMutation({
    mutationFn: (next: boolean) => setSwitch({ data: { enabled: next } }),
    onSuccess: (_r, next) => {
      qc.invalidateQueries({ queryKey: ["ai-global-switch"] });
      toast.success(
        next
          ? "IAs religadas — os agentes voltam a responder"
          : "IAs desligadas — todo atendimento agora é humano",
      );
    },
    onError: (e) => toast.error(`Falha: ${(e as Error).message}`),
  });

  const onClick = () => {
    if (enabled) {
      confirmThen(
        {
          title: "Desligar todas as IAs?",
          description:
            "Nenhum agente vai responder em nenhuma conversa — nem nas atuais, nem nas novas. Todo atendimento passa a ser humano até você religar.",
          confirmText: "Desligar tudo",
          destructive: true,
        },
        () => mut.mutate(false),
      );
    } else {
      mut.mutate(true);
    }
  };

  return (
    <button
      onClick={onClick}
      disabled={mut.isPending}
      title={
        enabled
          ? "IAs ativas — clique para desligar todas"
          : "IAs desligadas — clique para religar"
      }
      aria-label={enabled ? "Desligar todas as IAs" : "Religar todas as IAs"}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition disabled:opacity-60 ${
        enabled
          ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
          : "border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
      }`}
    >
      {enabled ? <Bot className="h-4 w-4" /> : <BotOff className="h-4 w-4" />}
      <span className="hidden sm:inline">{enabled ? "IAs ativas" : "IAs desligadas"}</span>
    </button>
  );
}
