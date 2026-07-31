import { createFileRoute } from "@tanstack/react-router";
import { Bell, Check, Plane } from "lucide-react";

export const Route = createFileRoute("/notif-preview")({
  component: Page,
  head: () => ({
    meta: [
      { title: "Preview interno de notificações | VIA AIR" },
      { name: "robots", content: "noindex" },
    ],
  }),
});

const rows = [
  {
    id: "1",
    flight: "LA3918",
    order: "20260714000012",
    summary: "Partida alterada de 12:15 para 15:00 (atrasado em 2h45min)",
    customer: "Lucas Rocha",
    when: "12min atrás",
    color: "bg-orange-500",
    seen: false,
  },
  {
    id: "2",
    flight: "G31402",
    order: "20260713000008",
    summary: "Voo cancelado pela companhia — reacomodação necessária",
    customer: "Ana Beatriz Souza",
    when: "3h atrás",
    color: "bg-red-500",
    seen: false,
  },
  {
    id: "3",
    flight: "AD4091",
    order: "20260710000003",
    summary: "Chegada antecipada em 12min — reserva confirmada",
    customer: "Marcos Vinícius",
    when: "1d atrás",
    color: "bg-yellow-500",
    seen: true,
  },
];

function Page() {
  return (
    <main className="min-h-screen bg-background p-10">
      <h1 className="sr-only">Preview do painel de notificações</h1>
      <div
        id="notif-panel"
        className="w-[420px] rounded-md border border-border bg-popover shadow-lg"
      >
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <span className="text-sm font-semibold inline-flex items-center gap-2">
            <Bell className="h-4 w-4" /> Alertas de voo
          </span>
          <button className="text-[11px] text-brand-orange inline-flex items-center gap-1">
            <Check className="h-3 w-3" /> Marcar todos
          </button>
        </div>
        <ul className="divide-y divide-border">
          {rows.map((r) => (
            <li
              key={r.id}
              className={`px-3 py-2.5 text-xs ${r.seen ? "opacity-80" : "bg-brand-orange/[0.04]"}`}
            >
              <div className="flex items-start gap-2">
                <span className={`mt-1 h-2 w-2 rounded-full shrink-0 ${r.color}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 text-foreground font-medium">
                    <Plane className="h-3 w-3" />
                    <span>{r.flight}</span>
                    <span className="text-muted-foreground font-normal">•</span>
                    <span className="text-brand-orange truncate">#{r.order}</span>
                  </div>
                  <p className="mt-0.5 text-muted-foreground">{r.summary}</p>
                  <div className="mt-1 text-[10px] text-muted-foreground">
                    {r.customer} · {r.when}
                  </div>
                </div>
                {!r.seen && <Check className="h-3.5 w-3.5 text-muted-foreground" />}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
