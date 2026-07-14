import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useEffect } from "react";
import { Loader2, Save, Bot } from "lucide-react";
import { toast } from "sonner";
import { listAgents, upsertAgent } from "@/lib/chat/queries.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/chat/agentes")({
  component: AgentesPage,
});

type Agent = Awaited<ReturnType<typeof listAgents>>[number];

function AgentesPage() {
  const listFn = useServerFn(listAgents);
  const { data: agents = [], isLoading } = useQuery({ queryKey: ["chat", "agents"], queryFn: () => listFn() });
  const [activeSlug, setActiveSlug] = useState<string>("camila");

  useEffect(() => {
    if (agents.length > 0 && !agents.find((a) => a.slug === activeSlug)) setActiveSlug(agents[0].slug);
  }, [agents, activeSlug]);

  const active = agents.find((a) => a.slug === activeSlug);

  if (isLoading) {
    return <div className="flex h-full items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>;
  }

  return (
    <div className="flex h-full">
      <aside className="w-64 shrink-0 border-r border-slate-200 bg-white p-3">
        <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Agentes</div>
        {agents.map((a) => (
          <button
            key={a.id}
            onClick={() => setActiveSlug(a.slug)}
            className={cn(
              "mb-1 flex w-full items-center gap-3 rounded-md p-2 text-left transition-colors",
              activeSlug === a.slug ? "bg-orange-50" : "hover:bg-slate-50",
            )}
          >
            <div className={cn(
              "flex h-9 w-9 items-center justify-center rounded-full text-xs font-semibold text-white",
              a.slug === "camila" ? "bg-gradient-to-br from-[#F26B1F] to-orange-400" : "bg-gradient-to-br from-indigo-500 to-blue-500",
            )}>
              {a.nome[0]}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-slate-900">{a.nome}</div>
              <div className="text-[10px] text-slate-500">{a.horario_inicio.slice(0, 5)} — {a.horario_fim.slice(0, 5)}</div>
            </div>
            {a.ativo && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />}
          </button>
        ))}
      </aside>

      <main className="flex-1 overflow-y-auto p-6">
        {active ? <AgentEditor key={active.id} agent={active} /> : (
          <div className="text-center text-sm text-slate-500">Selecione um agente</div>
        )}
      </main>
    </div>
  );
}

function AgentEditor({ agent }: { agent: Agent }) {
  const qc = useQueryClient();
  const upsertFn = useServerFn(upsertAgent);
  const [form, setForm] = useState({
    id: agent.id,
    nome: agent.nome,
    system_prompt: agent.system_prompt,
    horario_inicio: agent.horario_inicio.slice(0, 5),
    horario_fim: agent.horario_fim.slice(0, 5),
    ativo: agent.ativo,
    tom_voz: agent.tom_voz ?? "",
    mensagem_ausencia: agent.mensagem_ausencia ?? "",
  });

  const mut = useMutation({
    mutationFn: async () => upsertFn({ data: { ...form, tom_voz: form.tom_voz || null, mensagem_ausencia: form.mensagem_ausencia || null } }),
    onSuccess: () => { toast.success(`${form.nome} atualizado`); qc.invalidateQueries({ queryKey: ["chat", "agents"] }); },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-4">
        <Bot className="h-8 w-8 text-[#F26B1F]" />
        <div className="flex-1">
          <h2 className="text-lg font-semibold text-slate-900">{form.nome}</h2>
          <p className="text-xs text-slate-500">Configuração do agente IA que responde no WhatsApp</p>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.ativo} onChange={(e) => setForm({ ...form, ativo: e.target.checked })}
            className="h-4 w-4 accent-[#F26B1F]" />
          Ativo
        </label>
      </div>

      <Section title="Identidade">
        <TextInput label="Nome" value={form.nome} onChange={(v) => setForm({ ...form, nome: v })} />
        <TextInput label="Tom de voz" value={form.tom_voz} onChange={(v) => setForm({ ...form, tom_voz: v })}
          placeholder="ex: cordial, direto, consultivo" />
      </Section>

      <Section title="Horário de atendimento (America/Sao_Paulo)">
        <div className="grid grid-cols-2 gap-3">
          <TextInput label="Início" type="time" value={form.horario_inicio} onChange={(v) => setForm({ ...form, horario_inicio: v })} />
          <TextInput label="Fim" type="time" value={form.horario_fim} onChange={(v) => setForm({ ...form, horario_fim: v })} />
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Se fim ≤ início, o horário vira o dia (ex.: 18:00 → 08:00 cobre a madrugada).
        </p>
      </Section>

      <Section title="Prompt do sistema">
        <textarea
          value={form.system_prompt}
          onChange={(e) => setForm({ ...form, system_prompt: e.target.value })}
          rows={12}
          className="w-full rounded-md border border-slate-200 bg-slate-50 p-3 font-mono text-xs focus:border-[#F26B1F]/50 focus:bg-white focus:outline-none"
        />
      </Section>

      <Section title="Mensagem de ausência (fora do horário)">
        <textarea
          value={form.mensagem_ausencia}
          onChange={(e) => setForm({ ...form, mensagem_ausencia: e.target.value })}
          rows={3}
          className="w-full rounded-md border border-slate-200 bg-slate-50 p-3 text-sm focus:border-[#F26B1F]/50 focus:bg-white focus:outline-none"
        />
      </Section>

      <div className="flex justify-end">
        <button
          onClick={() => mut.mutate()}
          disabled={mut.isPending}
          className="flex items-center gap-2 rounded-md bg-[#F26B1F] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {mut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Salvar alterações
        </button>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="mb-3 text-sm font-semibold text-slate-900">{title}</div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function TextInput({ label, value, onChange, placeholder, type = "text" }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-slate-500">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm focus:border-[#F26B1F]/50 focus:bg-white focus:outline-none"
      />
    </label>
  );
}
