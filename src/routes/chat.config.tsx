import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Inbox,
  Users,
  BarChart3,
  KanbanSquare,
  Bot,
  Workflow,
  Megaphone,
  CalendarDays,
  Link2,
  Copy,
  Check,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { listAgents } from "@/lib/chat/queries.functions";

export const Route = createFileRoute("/chat/config")({
  component: ConfigPage,
});

const SECRETS = [
  { key: "WHATSAPP_ACCESS_TOKEN", label: "Access Token", configured: true },
  { key: "WHATSAPP_PHONE_NUMBER_ID", label: "Phone Number ID", configured: true },
  { key: "WHATSAPP_VERIFY_TOKEN_USER", label: "Verify Token", configured: true },
  { key: "META_APP_SECRET", label: "Meta App Secret", configured: true },
  { key: "LOVABLE_API_KEY", label: "Lovable AI Gateway", configured: true },
];

const MODULOS = [
  { label: "Caixa de Entrada", icon: Inbox },
  { label: "Contatos", icon: Users },
  { label: "Dashboard", icon: BarChart3 },
  { label: "CRM Kanban", icon: KanbanSquare },
  { label: "Fluxos", icon: Workflow },
  { label: "Broadcast", icon: Megaphone },
  { label: "Agenda", icon: CalendarDays },
  { label: "Agentes IA & Automação", icon: Bot, full: true },
];

const WEBHOOK = "https://pedidos.viaair.tur.br/api/public/whatsapp-webhook";

function hhmm(v?: string | null) {
  if (!v) return "--";
  return v.slice(0, 5);
}

function iniciais(nome: string) {
  return nome.trim().slice(0, 2).toUpperCase();
}

function emTurno(inicio?: string | null, fim?: string | null) {
  if (!inicio || !fim) return false;
  const agora = new Date();
  const min = agora.getHours() * 60 + agora.getMinutes();
  const [hi, mi] = hhmm(inicio).split(":").map(Number);
  const [hf, mf] = hhmm(fim).split(":").map(Number);
  const ini = hi * 60 + mi;
  const end = hf * 60 + mf;
  return ini <= end ? min >= ini && min < end : min >= ini || min < end;
}

function ConfigPage() {
  const fetchAgents = useServerFn(listAgents);
  const { data: agentes = [] } = useQuery({
    queryKey: ["chat", "agentes", "config"],
    queryFn: () => fetchAgents(),
  });
  const [copiado, setCopiado] = useState(false);

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(WEBHOOK);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      toast.error("Não foi possível copiar");
    }
  };

  return (
    <div className="h-full overflow-y-auto bg-slate-50 p-6 md:p-8">
      <div className="mx-auto grid w-full max-w-6xl grid-cols-1 items-start gap-6 md:grid-cols-12">
        {/* Coluna esquerda */}
        <div className="space-y-6 md:col-span-8">
          <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5">
              <h2 className="text-lg font-bold text-slate-800">WhatsApp Cloud API</h2>
              <span className="rounded-full border border-green-100 bg-green-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-green-600">
                Conectado
              </span>
            </div>

            <div className="p-6">
              <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
                {SECRETS.map((s) => (
                  <div
                    key={s.key}
                    className="flex flex-col justify-between rounded-2xl border border-slate-100 bg-slate-50 p-4"
                  >
                    <div className="mb-2 flex items-start justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                        {s.label}
                      </span>
                      <div
                        className={`h-2 w-2 rounded-full ${s.configured ? "bg-green-500" : "bg-amber-500"}`}
                      />
                    </div>
                    <div className="truncate font-mono text-[12px] font-medium text-slate-700">{s.key}</div>
                    <div
                      className={`mt-2 text-[11px] font-medium ${s.configured ? "text-green-600" : "text-amber-600"}`}
                    >
                      {s.configured ? "Configurado" : "Faltando"}
                    </div>
                  </div>
                ))}
              </div>

              <div className="rounded-2xl border border-indigo-100 bg-indigo-50 p-5">
                <div className="mb-2 flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white shadow-lg shadow-indigo-200">
                    <Link2 className="h-4 w-4" />
                  </div>
                  <span className="text-xs font-bold uppercase tracking-wide text-indigo-900">Webhook URL</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <code className="block w-full truncate rounded-lg border border-indigo-200 bg-white/60 px-3 py-2 text-xs text-indigo-700">
                    {WEBHOOK}
                  </code>
                  <button
                    onClick={copiar}
                    className="flex shrink-0 items-center gap-1 text-xs font-bold text-indigo-600 transition-colors hover:text-indigo-800"
                  >
                    {copiado ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    {copiado ? "Copiado" : "Copiar"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Coluna direita */}
        <div className="space-y-6 md:col-span-4">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-5 flex items-center justify-between">
              <h3 className="font-bold text-slate-800">Horários</h3>
              <a href="/chat/agentes" className="text-xs font-semibold text-[#F26B1F] hover:underline">
                Gerenciar
              </a>
            </div>

            <div className="space-y-2">
              {agentes.length === 0 && (
                <p className="text-sm text-slate-500">Nenhum agente cadastrado ainda.</p>
              )}
              {agentes.map((a) => {
                const ativoAgora = a.ativo && emTurno(a.horario_inicio, a.horario_fim);
                return (
                  <div
                    key={a.id}
                    className="flex items-center justify-between gap-3 rounded-2xl p-3 transition-colors hover:bg-slate-50"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <div
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                          ativoAgora
                            ? "border border-[#F26B1F]/20 bg-[#F26B1F]/10 text-[#F26B1F]"
                            : "border border-slate-200 bg-slate-100 text-slate-400"
                        }`}
                      >
                        {iniciais(a.nome)}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-700">{a.nome}</p>
                        <p className="truncate text-[10px] capitalize text-slate-400">{a.equipe}</p>
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-xs font-bold text-slate-600">
                        {hhmm(a.horario_inicio)} - {hhmm(a.horario_fim)}
                      </p>
                      <span
                        className={`text-[9px] font-bold uppercase ${
                          !a.ativo
                            ? "rounded-full bg-slate-100 px-2 py-0.5 text-slate-500"
                            : ativoAgora
                              ? "rounded-full bg-green-100 px-2 py-0.5 text-green-700"
                              : "rounded-full bg-indigo-100 px-2 py-0.5 text-indigo-700"
                        }`}
                      >
                        {!a.ativo ? "Inativo" : ativoAgora ? "Em turno" : "Fora de turno"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-3xl bg-[#F26B1F] p-6 text-white shadow-xl shadow-[#F26B1F]/20">
            <h3 className="mb-4 flex items-center gap-2 font-bold">
              Módulos Ativos
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
            </h3>
            <div className="grid grid-cols-2 gap-3">
              {MODULOS.map((m) => {
                const Icon = m.icon;
                return (
                  <div
                    key={m.label}
                    className={`flex items-center gap-2 rounded-xl border border-white/10 bg-white/10 p-2 ${
                      m.full ? "col-span-2" : ""
                    }`}
                  >
                    <div className="rounded-lg bg-white/20 p-1.5">
                      <Icon className="h-3.5 w-3.5" />
                    </div>
                    <span className="text-[11px] font-medium">{m.label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
