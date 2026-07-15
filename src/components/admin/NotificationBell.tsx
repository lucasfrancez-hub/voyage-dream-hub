import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Bell, Check, Plane } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  listFlightAlerts,
  markAllFlightAlertsSeen,
  markFlightAlertSeen,
} from "@/lib/admin-alerts.functions";

function severityColor(sev: string) {
  switch (sev) {
    case "cancelled": return "bg-red-500";
    case "major": return "bg-orange-500";
    case "minor": return "bg-yellow-500";
    default: return "bg-blue-500";
  }
}

function fmtRelative(iso: string) {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `${min}min atrás`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h}h atrás`;
  const days = Math.round(h / 24);
  return `${days}d atrás`;
}

export function AdminNotificationBell() {
  const listFn = useServerFn(listFlightAlerts);
  const markOneFn = useServerFn(markFlightAlertSeen);
  const markAllFn = useServerFn(markAllFlightAlertsSeen);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const q = useQuery({
    queryKey: ["admin-flight-alerts"],
    queryFn: () => listFn(),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (open) q.refetch();
  }, [open]);

  const rows = q.data?.rows ?? [];
  const unseen = q.data?.unseen ?? 0;

  const handleMarkAll = async () => {
    await markAllFn();
    qc.invalidateQueries({ queryKey: ["admin-flight-alerts"] });
  };
  const handleMarkOne = async (id: string) => {
    await markOneFn({ data: { id } });
    qc.invalidateQueries({ queryKey: ["admin-flight-alerts"] });
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        className="relative inline-flex items-center justify-center h-8 w-8 rounded-full border border-border text-muted-foreground hover:text-foreground hover:border-brand-orange transition outline-none"
        title="Notificações"
        aria-label="Notificações"
      >
        <Bell className="h-4 w-4" />
        {unseen > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-brand-orange text-[10px] font-bold text-white flex items-center justify-center">
            {unseen > 99 ? "99+" : unseen}
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[360px] max-w-[90vw] p-0">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <span className="text-sm font-semibold">Alertas de voo</span>
          {unseen > 0 && (
            <button
              onClick={handleMarkAll}
              className="text-[11px] text-brand-orange hover:underline inline-flex items-center gap-1"
            >
              <Check className="h-3 w-3" /> Marcar todos
            </button>
          )}
        </div>
        <div className="max-h-[60vh] overflow-y-auto">
          {q.isLoading ? (
            <div className="p-6 text-center text-xs text-muted-foreground">Carregando…</div>
          ) : rows.length === 0 ? (
            <div className="p-6 text-center text-xs text-muted-foreground">
              Nenhuma alteração de voo nos últimos 30 dias.
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {rows.map((r) => (
                <li
                  key={r.id}
                  className={`px-3 py-2.5 text-xs transition ${
                    r.seenAt ? "opacity-70" : "bg-brand-orange/[0.04]"
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <span className={`mt-1 h-2 w-2 rounded-full shrink-0 ${severityColor(r.severity)}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 text-foreground font-medium">
                        <Plane className="h-3 w-3 shrink-0" />
                        <span className="truncate">{r.flightNumber}</span>
                        <span className="text-muted-foreground font-normal">•</span>
                        <Link
                          to="/admin/pedidos/$id"
                          params={{ id: r.orderId }}
                          className="text-brand-orange hover:underline truncate"
                          onClick={() => { if (!r.seenAt) handleMarkOne(r.id); setOpen(false); }}
                        >
                          #{r.orderNumber || r.orderId.slice(0, 8)}
                        </Link>
                      </div>
                      <p className="mt-0.5 text-muted-foreground line-clamp-2">{r.summary}</p>
                      <div className="mt-1 flex items-center justify-between gap-2">
                        <span className="text-[10px] text-muted-foreground">
                          {r.customerName} · {fmtRelative(r.createdAt)}
                        </span>
                        {r.response && (
                          <span className="text-[10px] font-medium text-brand-orange">
                            Cliente: {r.response}
                          </span>
                        )}
                      </div>
                    </div>
                    {!r.seenAt && (
                      <button
                        onClick={() => handleMarkOne(r.id)}
                        title="Marcar como lido"
                        className="text-muted-foreground hover:text-foreground shrink-0"
                      >
                        <Check className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
