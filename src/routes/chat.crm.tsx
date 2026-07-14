import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listConversations } from "@/lib/chat/queries.functions";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/chat/crm")({
  component: CRMPage,
});

const COLUMNS = [
  { key: "novo", label: "Novo Lead", color: "border-slate-300" },
  { key: "qualificacao", label: "Qualificação", color: "border-blue-300" },
  { key: "orcamento", label: "Orçamento", color: "border-indigo-300" },
  { key: "enviado", label: "Orçamento Enviado", color: "border-violet-300" },
  { key: "pagamento", label: "Pagamento", color: "border-amber-300" },
  { key: "contrato", label: "Contrato", color: "border-orange-300" },
  { key: "confirmada", label: "Viagem Confirmada", color: "border-emerald-300" },
  { key: "pos", label: "Pós-venda", color: "border-teal-300" },
  { key: "perdido", label: "Perdido", color: "border-red-300" },
] as const;

function CRMPage() {
  const fn = useServerFn(listConversations);
  const { data: convs = [], isLoading } = useQuery({ queryKey: ["chat", "conversations"], queryFn: () => fn() });

  return (
    <div className="h-full overflow-x-auto overflow-y-hidden p-6">
      {isLoading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
      ) : (
        <div className="flex h-full min-w-max gap-4">
          {COLUMNS.map((col, i) => {
            // Distribui conversas pelas colunas pra demo (todas em "novo" por enquanto)
            const cards = i === 0 ? convs : [];
            return (
              <div key={col.key} className="flex h-full w-72 shrink-0 flex-col rounded-lg bg-white border-t-4 border border-slate-200 shadow-sm" style={{ borderTopColor: undefined }}>
                <div className={`border-t-4 rounded-t-lg ${col.color} px-3 py-2 flex items-center justify-between`}>
                  <span className="text-sm font-semibold text-slate-900">{col.label}</span>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">{cards.length}</span>
                </div>
                <div className="flex-1 space-y-2 overflow-y-auto p-2">
                  {cards.map((c) => (
                    <div key={c.id} className="rounded-md border border-slate-200 bg-white p-3 shadow-sm hover:border-[#F26B1F]/40 cursor-grab">
                      <div className="text-sm font-medium text-slate-900">{c.display_name ?? c.wa_phone}</div>
                      <div className="text-[11px] text-slate-500">{c.wa_phone}</div>
                      {c.last_message_preview && (
                        <div className="mt-1.5 line-clamp-2 text-xs text-slate-600">{c.last_message_preview}</div>
                      )}
                      <div className="mt-2 flex items-center justify-between">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] ${c.mode === "ai" ? "bg-emerald-50 text-emerald-700" : "bg-violet-50 text-violet-700"}`}>
                          {c.mode === "ai" ? "IA" : "Humano"}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          {c.last_message_at ? new Date(c.last_message_at).toLocaleDateString("pt-BR") : ""}
                        </span>
                      </div>
                    </div>
                  ))}
                  {cards.length === 0 && (
                    <div className="rounded-md border-2 border-dashed border-slate-200 p-4 text-center text-xs text-slate-400">
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
