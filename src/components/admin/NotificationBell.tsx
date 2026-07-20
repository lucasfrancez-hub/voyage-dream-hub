import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Bell, Check, Copy, Plane, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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

function severityLabel(sev: string) {
  switch (sev) {
    case "cancelled": return "Cancelado";
    case "major": return "Alteração maior";
    case "minor": return "Alteração pequena";
    default: return "Atualização";
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

function fmtDateTime(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function diffInfo(oldIso: string | null, newIso: string | null) {
  if (!oldIso || !newIso) return null;
  const diffMs = new Date(newIso).getTime() - new Date(oldIso).getTime();
  if (diffMs === 0) return { label: "sem alteração de horário", positive: false };
  const abs = Math.abs(diffMs);
  const totalMin = Math.round(abs / 60000);
  const days = Math.floor(totalMin / (60 * 24));
  const hours = Math.floor((totalMin - days * 60 * 24) / 60);
  const min = totalMin % 60;
  const parts: string[] = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (min || parts.length === 0) parts.push(`${min}min`);
  return {
    label: `${diffMs > 0 ? "atrasado" : "adiantado"} em ${parts.join(" ")}`,
    positive: diffMs > 0,
  };
}

function buildClientMessage(r: {
  flightNumber: string;
  oldDepartAt: string | null;
  newDepartAt: string | null;
  newStatus: string | null;
  customerName: string;
}) {
  const first = (r.customerName || "").split(/\s+/)[0] || "";
  const lines: string[] = [];
  lines.push(`Olá${first ? `, ${first}` : ""}! 👋`);
  lines.push("");
  lines.push(`Informamos uma atualização no seu voo *${r.flightNumber}*:`);
  lines.push("");
  if (r.oldDepartAt) lines.push(`🕓 Horário anterior: ${fmtDateTime(r.oldDepartAt)}`);
  if (r.newDepartAt) lines.push(`🆕 Novo horário: ${fmtDateTime(r.newDepartAt)}`);
  if (r.newStatus && r.newStatus.toLowerCase() !== "expected") {
    lines.push(`ℹ️ Status: ${r.newStatus}`);
  }
  lines.push("");
  lines.push("Qualquer dúvida estamos à disposição. ✈️💛");
  lines.push("— Equipe VIA AIR");
  return lines.join("\n");
}

type AlertRow = {
  id: string;
  orderId: string;
  orderNumber: string | null;
  flightNumber: string;
  summary: string;
  severity: string;
  oldDepartAt: string | null;
  newDepartAt: string | null;
  newStatus: string | null;
  customerName: string;
  createdAt: string;
  seenAt: string | null;
  response?: string | null;
};

export function AdminNotificationBell() {
  const listFn = useServerFn(listFlightAlerts);
  const markOneFn = useServerFn(markFlightAlertSeen);
  const markAllFn = useServerFn(markAllFlightAlertsSeen);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<AlertRow | null>(null);

  const q = useQuery({
    queryKey: ["admin-flight-alerts"],
    queryFn: () => listFn(),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (open) q.refetch();
  }, [open]);

  const rows: AlertRow[] = (q.data?.rows ?? []) as AlertRow[];
  const unseen = q.data?.unseen ?? 0;

  const handleMarkAll = async () => {
    await markAllFn();
    qc.invalidateQueries({ queryKey: ["admin-flight-alerts"] });
  };
  const handleMarkOne = async (id: string) => {
    await markOneFn({ data: { id } });
    qc.invalidateQueries({ queryKey: ["admin-flight-alerts"] });
  };
  const handleCopy = async (r: AlertRow) => {
    const msg = buildClientMessage(r);
    try {
      await navigator.clipboard.writeText(msg);
      toast.success("Mensagem copiada para o cliente");
    } catch {
      toast.error("Não consegui copiar — selecione e copie manualmente");
    }
  };

  const openAlert = (r: AlertRow) => {
    setSelected(r);
    setOpen(false);
    if (!r.seenAt) handleMarkOne(r.id);
  };

  const info = selected ? diffInfo(selected.oldDepartAt, selected.newDepartAt) : null;

  return (
    <>
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
        <DropdownMenuContent align="end" className="w-[420px] max-w-[92vw] p-0">
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
          <div className="max-h-[70vh] overflow-y-auto">
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
                    className={`px-3 py-2.5 text-xs transition cursor-pointer hover:bg-muted/50 ${
                      r.seenAt ? "opacity-80" : "bg-brand-orange/[0.04]"
                    }`}
                    onClick={() => openAlert(r)}
                  >
                    <div className="flex items-start gap-2">
                      <span className={`mt-1 h-2 w-2 rounded-full shrink-0 ${severityColor(r.severity)}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 text-foreground font-medium">
                          <Plane className="h-3 w-3 shrink-0" />
                          <span className="truncate">{r.flightNumber}</span>
                          <span className="text-muted-foreground font-normal">•</span>
                          <span className="text-brand-orange truncate">
                            #{r.orderNumber || r.orderId.slice(0, 8)}
                          </span>
                        </div>
                        <p className="mt-0.5 text-muted-foreground line-clamp-2">{r.summary}</p>
                        <div className="mt-1 text-[10px] text-muted-foreground">
                          {r.customerName} · {fmtRelative(r.createdAt)}
                        </div>
                        {r.response && (
                          <div className="mt-1 text-[10px] font-medium text-brand-orange">
                            Cliente respondeu: {r.response}
                          </div>
                        )}
                      </div>
                      {!r.seenAt && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleMarkOne(r.id); }}
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

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-md p-0 overflow-hidden">
          {selected && (
            <div>
              <DialogHeader className="px-5 pt-5 pb-3 bg-gradient-to-br from-brand-orange/10 to-transparent border-b border-border">
                <div className="flex items-center gap-2">
                  <span className={`h-2.5 w-2.5 rounded-full ${severityColor(selected.severity)}`} />
                  <span className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">
                    {severityLabel(selected.severity)}
                  </span>
                </div>
                <DialogTitle className="flex items-center gap-2 text-lg">
                  <Plane className="h-5 w-5 text-brand-orange" />
                  Voo {selected.flightNumber}
                </DialogTitle>
                <p className="text-xs text-muted-foreground">
                  Pedido{" "}
                  <Link
                    to="/admin/pedidos/$id"
                    params={{ id: selected.orderId }}
                    className="text-brand-orange hover:underline font-medium"
                    onClick={() => setSelected(null)}
                  >
                    #{selected.orderNumber || selected.orderId.slice(0, 8)}
                  </Link>{" "}
                  · {selected.customerName}
                </p>
              </DialogHeader>

              <div className="p-5 space-y-4">
                <p className="text-sm text-foreground leading-relaxed">{selected.summary}</p>

                <div className="rounded-lg border border-border bg-muted/30 divide-y divide-border">
                  <div className="p-3">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                      Voo anterior
                    </div>
                    <div className="text-sm font-medium line-through decoration-muted-foreground/60 text-muted-foreground">
                      {fmtDateTime(selected.oldDepartAt)}
                    </div>
                  </div>
                  <div className="flex justify-center py-1 bg-muted/40">
                    <ArrowRight className="h-3.5 w-3.5 text-brand-orange rotate-90" />
                  </div>
                  <div className="p-3 bg-brand-orange/[0.06]">
                    <div className="text-[10px] uppercase tracking-wider text-brand-orange mb-1 font-semibold">
                      Voo novo
                    </div>
                    <div className="text-sm font-bold text-foreground">
                      {fmtDateTime(selected.newDepartAt)}
                    </div>
                    {info && info.label !== "sem alteração de horário" && (
                      <div className={`mt-1 text-[11px] font-semibold ${info.positive ? "text-orange-500" : "text-emerald-500"}`}>
                        {info.label}
                      </div>
                    )}
                  </div>
                </div>

                {selected.newStatus && selected.newStatus.toLowerCase() !== "expected" && (
                  <div className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-xs">
                    <span className="text-muted-foreground">Status</span>
                    <span className="font-medium">{selected.newStatus}</span>
                  </div>
                )}

                <button
                  onClick={() => handleCopy(selected)}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-brand-orange text-white text-sm font-medium py-2.5 hover:bg-brand-orange/90 transition"
                >
                  <Copy className="h-4 w-4" /> Copiar mensagem pro cliente
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
