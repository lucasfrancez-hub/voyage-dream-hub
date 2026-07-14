import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Suspense, useMemo, useState } from "react";
import { Search, Loader2 } from "lucide-react";
import { listConversations } from "@/lib/chat/queries.functions";

export const Route = createFileRoute("/chat/contatos")({
  component: ContatosPage,
});

function ContatosPage() {
  const fn = useServerFn(listConversations);
  const { data: convs = [], isLoading } = useQuery({ queryKey: ["chat", "conversations"], queryFn: () => fn() });
  const [q, setQ] = useState("");

  const rows = useMemo(() => convs.filter((c) => {
    if (!q) return true;
    const s = q.toLowerCase();
    return (c.display_name?.toLowerCase().includes(s) || c.wa_phone.includes(s));
  }), [convs, q]);

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mx-auto max-w-7xl">
        <div className="mb-4 flex items-center gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por nome ou telefone…"
              className="w-full rounded-md border border-slate-200 bg-white py-2 pl-8 pr-3 text-sm focus:border-[#F26B1F]/50 focus:outline-none"
            />
          </div>
          <button className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">Exportar CSV</button>
        </div>

        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-2 text-left">Nome</th>
                <th className="px-4 py-2 text-left">Telefone</th>
                <th className="px-4 py-2 text-left">Modo</th>
                <th className="px-4 py-2 text-left">Agente</th>
                <th className="px-4 py-2 text-left">Última msg</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={5} className="p-8 text-center"><Loader2 className="mx-auto h-4 w-4 animate-spin text-slate-400" /></td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={5} className="p-8 text-center text-slate-400">Nenhum contato</td></tr>
              ) : (
                rows.map((c) => (
                  <tr key={c.id} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-2.5 font-medium text-slate-900">{c.display_name ?? "—"}</td>
                    <td className="px-4 py-2.5 text-slate-600">{c.wa_phone}</td>
                    <td className="px-4 py-2.5">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] ${c.mode === "ai" ? "bg-emerald-50 text-emerald-700" : c.mode === "human" ? "bg-violet-50 text-violet-700" : "bg-slate-100 text-slate-600"}`}>
                        {c.mode}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-slate-600 capitalize">{c.agent_slug ?? "—"}</td>
                    <td className="px-4 py-2.5 text-slate-500 text-xs">
                      {c.last_message_at ? new Date(c.last_message_at).toLocaleString("pt-BR") : "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
