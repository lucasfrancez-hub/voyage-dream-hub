import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, AlertCircle } from "lucide-react";

export const Route = createFileRoute("/chat/config")({
  component: ConfigPage,
});

const SECRETS = [
  { key: "WHATSAPP_ACCESS_TOKEN", label: "WhatsApp Access Token", configured: true },
  { key: "WHATSAPP_PHONE_NUMBER_ID", label: "WhatsApp Phone Number ID", configured: true },
  { key: "WHATSAPP_VERIFY_TOKEN_USER", label: "WhatsApp Verify Token", configured: true },
  { key: "META_APP_SECRET", label: "Meta App Secret (webhook)", configured: true },
  { key: "LOVABLE_API_KEY", label: "Lovable AI Gateway", configured: true },
];

function ConfigPage() {
  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mx-auto max-w-4xl space-y-5">
        <Card title="WhatsApp Cloud API">
          <div className="space-y-2">
            {SECRETS.map((s) => (
              <div key={s.key} className="flex items-center justify-between rounded-md border border-slate-100 p-3">
                <div>
                  <div className="text-sm font-medium text-slate-900">{s.label}</div>
                  <code className="text-[11px] text-slate-500">{s.key}</code>
                </div>
                {s.configured ? (
                  <span className="flex items-center gap-1 text-xs text-emerald-600"><CheckCircle2 className="h-4 w-4" /> Configurado</span>
                ) : (
                  <span className="flex items-center gap-1 text-xs text-amber-600"><AlertCircle className="h-4 w-4" /> Faltando</span>
                )}
              </div>
            ))}
          </div>
          <div className="mt-3 rounded-md bg-blue-50 p-3 text-xs text-blue-800">
            Webhook: <code className="rounded bg-white px-1.5 py-0.5">https://pedidos.viaair.tur.br/api/public/whatsapp-webhook</code>
          </div>
        </Card>

        <Card title="Horários de atendimento">
          <p className="text-sm text-slate-600">
            Configure os horários dos agentes na página <a href="/chat/agentes" className="text-[#F26B1F] hover:underline">Agentes IA</a>.
          </p>
          <div className="mt-2 space-y-1 text-sm">
            <div>🌞 <strong>Camila</strong> (consultora) — 08:00 às 18:00</div>
            <div>🌙 <strong>Roberto</strong> (consultor) — 18:00 às 08:00</div>
          </div>
        </Card>

        <Card title="Módulos disponíveis">
          <ul className="grid grid-cols-2 gap-2 text-sm text-slate-700">
            <li>✅ Caixa de Entrada</li>
            <li>✅ Dashboard</li>
            <li>✅ Contatos</li>
            <li>✅ CRM Kanban</li>
            <li>✅ Agentes IA</li>
            <li>🚧 Fluxos (em breve)</li>
            <li>🚧 Broadcast (em breve)</li>
            <li>🚧 Agenda (em breve)</li>
          </ul>
        </Card>
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5">
      <h3 className="mb-3 text-sm font-semibold text-slate-900">{title}</h3>
      {children}
    </div>
  );
}
