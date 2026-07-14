import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Users, MessageSquare, Bot, UserCheck, TrendingUp } from "lucide-react";
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import { getDashboardMetrics } from "@/lib/chat/queries.functions";

export const Route = createFileRoute("/chat/dashboard")({
  component: DashboardPage,
});

function metricsQO(fn: () => Promise<Awaited<ReturnType<typeof getDashboardMetrics>>>) {
  return queryOptions({ queryKey: ["chat", "metrics"], queryFn: fn, staleTime: 30_000 });
}

function DashboardPage() {
  return (
    <div className="h-full overflow-y-auto p-6">
      <Suspense fallback={<div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>}>
        <Inner />
      </Suspense>
    </div>
  );
}

function Inner() {
  const fetchMetrics = useServerFn(getDashboardMetrics);
  const { data } = useSuspenseQuery(metricsQO(() => fetchMetrics()));

  const cards = [
    { label: "Contatos totais", value: data.totalContacts, icon: Users, color: "text-blue-600 bg-blue-50" },
    { label: "Conversas abertas", value: data.openConversations, icon: MessageSquare, color: "text-emerald-600 bg-emerald-50" },
    { label: "Atendidas pela IA", value: data.aiConversations, icon: Bot, color: "text-[#F26B1F] bg-orange-50" },
    { label: "Com humano", value: data.humanConversations, icon: UserCheck, color: "text-violet-600 bg-violet-50" },
    { label: "Mensagens (14d)", value: data.messages14d, icon: TrendingUp, color: "text-slate-700 bg-slate-100" },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
        {cards.map((c) => (
          <div key={c.label} className="rounded-lg border border-slate-200 bg-white p-4">
            <div className={`inline-flex h-9 w-9 items-center justify-center rounded-md ${c.color}`}>
              <c.icon className="h-4 w-4" />
            </div>
            <div className="mt-3 text-2xl font-semibold text-slate-900">{c.value}</div>
            <div className="text-xs text-slate-500">{c.label}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white p-4 lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900">Mensagens por dia (14 dias)</h3>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.daily}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="date" tickFormatter={(v: string) => v.slice(5)} stroke="#94a3b8" fontSize={11} />
                <YAxis stroke="#94a3b8" fontSize={11} />
                <Tooltip />
                <Line type="monotone" dataKey="count" stroke="#F26B1F" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-900">Ranking dos agentes</h3>
          <div className="space-y-3">
            <AgentRow name="Camila" count={data.byAgent.camila} shift="08h — 18h" />
            <AgentRow name="Roberto" count={data.byAgent.roberto} shift="18h — 08h" />
          </div>
        </div>
      </div>
    </div>
  );
}

function AgentRow({ name, count, shift }: { name: string; count: number; shift: string }) {
  return (
    <div className="flex items-center gap-3 rounded-md border border-slate-100 p-3">
      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-orange-50 text-[#F26B1F] font-semibold text-sm">
        {name[0]}
      </div>
      <div className="flex-1">
        <div className="text-sm font-medium text-slate-900">{name}</div>
        <div className="text-[11px] text-slate-500">{shift}</div>
      </div>
      <div className="text-lg font-semibold text-slate-900">{count}</div>
    </div>
  );
}
