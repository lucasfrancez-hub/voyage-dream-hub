import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Forward, Search } from "lucide-react";
import { toast } from "sonner";
import { listConversations, forwardMessage } from "@/lib/chat/queries.functions";
import { cn } from "@/lib/utils";

type Props = {
  messageId: string;
  /** Conversa de origem — não aparece na lista */
  fromConversationId?: string;
  onClose: () => void;
};

export function ForwardMessageDialog({ messageId, fromConversationId, onClose }: Props) {
  const qc = useQueryClient();
  const listFn = useServerFn(listConversations);
  const forwardFn = useServerFn(forwardMessage);
  const [busca, setBusca] = useState("");
  const [sel, setSel] = useState<string[]>([]);

  const { data: convs = [], isLoading } = useQuery({
    queryKey: ["chat", "conversations", "forward"],
    queryFn: () => listFn({}),
  });

  const lista = useMemo(() => {
    const s = busca.trim().toLowerCase();
    return convs
      .filter((c) => c.id !== fromConversationId)
      .filter((c) =>
        !s || (c.display_name ?? "").toLowerCase().includes(s) || c.wa_phone.includes(s),
      )
      .slice(0, 80);
  }, [convs, busca, fromConversationId]);

  const mut = useMutation({
    mutationFn: () => forwardFn({ data: { message_id: messageId, conversation_ids: sel } }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["chat"] });
      toast.success(
        `Encaminhada para ${r.enviados} conversa${r.enviados > 1 ? "s" : ""}` +
          (r.falhas ? ` — ${r.falhas} não deu certo` : ""),
      );
      onClose();
    },
    onError: (e) => toast.error(`Não deu pra encaminhar: ${(e as Error).message}`),
  });

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-xl bg-background shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b px-4 py-3">
          <Forward className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">Encaminhar para…</span>
        </div>
        <div className="border-b px-3 py-2">
          <div className="flex items-center gap-2 rounded-md border px-2">
            <Search className="h-3.5 w-3.5 text-muted-foreground" />
            <input
              autoFocus
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar contato ou número"
              className="w-full bg-transparent py-2 text-sm outline-none"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <p className="p-4 text-sm text-muted-foreground">Carregando conversas…</p>
          ) : lista.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">Nenhuma conversa encontrada.</p>
          ) : (
            lista.map((c) => {
              const marcado = sel.includes(c.id);
              return (
                <button
                  key={c.id}
                  onClick={() =>
                    setSel((prev) => (marcado ? prev.filter((id) => id !== c.id) : [...prev, c.id]))
                  }
                  className={cn(
                    "flex w-full items-center gap-3 border-b px-4 py-2.5 text-left hover:bg-muted/60",
                    marcado && "bg-primary/10",
                  )}
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-[11px] font-semibold">
                    {c.profile_pic_url ? (
                      <img src={c.profile_pic_url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      (c.display_name ?? c.wa_phone).slice(0, 2).toUpperCase()
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{c.display_name ?? c.wa_phone}</span>
                    <span className="block truncate text-xs text-muted-foreground">{c.wa_phone}</span>
                  </span>
                  <span
                    className={cn(
                      "h-4 w-4 shrink-0 rounded-full border",
                      marcado ? "border-primary bg-primary" : "border-muted-foreground/40",
                    )}
                  />
                </button>
              );
            })
          )}
        </div>
        <div className="flex items-center justify-between gap-2 border-t px-4 py-3">
          <span className="text-xs text-muted-foreground">
            {sel.length > 0 ? `${sel.length} selecionada${sel.length > 1 ? "s" : ""}` : "Escolha as conversas"}
          </span>
          <div className="flex gap-2">
            <button onClick={onClose} className="rounded-md border px-3 py-1.5 text-sm">
              Cancelar
            </button>
            <button
              disabled={sel.length === 0 || mut.isPending}
              onClick={() => mut.mutate()}
              className="rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              {mut.isPending ? "Enviando…" : "Encaminhar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
