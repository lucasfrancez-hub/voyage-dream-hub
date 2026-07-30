import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Wand2, X, Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { setAiInstruction } from "@/lib/chat/queries.functions";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";

/**
 * Permite ao atendente dizer PARA A IA o que responder na próxima mensagem,
 * sem precisar assumir a conversa. A orientação vale só para a próxima
 * resposta (a IA limpa depois de enviar).
 */
export function AiInstructionBar({
  conversationId,
  pending,
  onChange,
}: {
  conversationId: string;
  pending: string | null;
  onChange: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const setFn = useServerFn(setAiInstruction);

  const mut = useMutation({
    mutationFn: async (v: { instruction: string | null; respond_now?: boolean }) =>
      setFn({ data: { conversation_id: conversationId, ...v } }),
    onSuccess: (_d, v) => {
      setOpen(false);
      setText("");
      onChange();
      toast.success(v.instruction ? "Orientação enviada para a IA" : "Orientação removida");
    },
    onError: (e) => toast.error(`Falha: ${(e as Error).message}`),
  });

  return (
    <>
      {pending ? (
        <div className="mb-2 flex items-start gap-2 rounded-md border border-violet-200 bg-violet-50 p-2">
          <Wand2 className="mt-0.5 h-4 w-4 shrink-0 text-violet-600" />
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-violet-700">
              Orientação para a IA (próxima resposta)
            </div>
            <div className="whitespace-pre-wrap break-words text-xs text-violet-900">{pending}</div>
          </div>
          <button
            onClick={() => mut.mutate({ instruction: null })}
            title="Cancelar orientação"
            className="rounded-md p-1 text-violet-600 hover:bg-violet-100"
          >
            {mut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
          </button>
        </div>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="mb-2 inline-flex items-center gap-1.5 rounded-md border border-violet-200 bg-violet-50 px-2.5 py-1.5 text-[11px] font-medium text-violet-700 hover:bg-violet-100"
        >
          <Wand2 className="h-3.5 w-3.5" />
          Instruir a IA
        </button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Instruir a IA</DialogTitle>
            <DialogDescription>
              Escreva o que a IA deve responder. Ela segue a orientação na próxima resposta, com o tom
              dela, e o cliente nunca vê que veio de um atendente.
            </DialogDescription>
          </DialogHeader>
          <textarea
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={5}
            maxLength={2000}
            placeholder="Ex.: diga que o pacote de Orlando saindo de Curitiba em março está R$ 6.480 por pessoa e ofereça enviar o folder."
            className="w-full resize-none rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-[#F26B1F]/50 focus:bg-white focus:outline-none"
          />
          <DialogFooter className="gap-2 sm:justify-between">
            <button
              onClick={() => mut.mutate({ instruction: text })}
              disabled={!text.trim() || mut.isPending}
              className="rounded-md border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            >
              Guardar p/ próxima resposta
            </button>
            <button
              onClick={() => mut.mutate({ instruction: text, respond_now: true })}
              disabled={!text.trim() || mut.isPending}
              className="inline-flex items-center gap-2 rounded-md bg-[#F26B1F] px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-40"
            >
              {mut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Responder agora
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
