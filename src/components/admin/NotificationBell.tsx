import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Bell, Check, ChevronDown, ChevronUp, Copy, Plane } from "lucide-react";
import { toast } from "sonner";
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

function fmtDiff(oldIso: string | null, newIso: string | null) {
  if (!oldIso || !newIso) return null;
  const diffMs = new Date(newIso).getTime() - new Date(oldIso).getTime();
  if (diffMs === 0) return "sem alteração de horário";
  const abs = Math.abs(diffMs);
  const totalMin = Math.round(abs / 60000);
  const days = Math.floor(totalMin / (60 * 24));
  const hours = Math.floor((totalMin - days * 60 * 24) / 60);
  const min = totalMin % 60;
  const parts: string[] = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (min || parts.length === 0) parts.push(`${min}min`);
  return `${diffMs > 0 ? "adiantado" : "adiantado"} ${parts.join(" ")}` && `${diffMs > 0 ? "atrasado" : "adiantado"} ${parts.join(" ")}`;
}

function buildClientMessage(r: {
  flightNumber: string;
  summary: string;
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

export function AdminNotificationBell() {
  const listFn = useServerFn(listFlightAlerts);
  const markOneFn = useServerFn(markFlightAlertSeen);
  const markAllFn = useServerFn(markAllFlightAlertsSeen);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

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
  const handleCopy = async (r: any) => {
    const msg = buildClientMessage(r);
    try {
      await navigator.clipboard.writeText(msg);
      toast.success("Mensagem copiada para o cliente");
    } catch {
      toast.error("Não consegui copiar — selecione e copie manualmente");
    }
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
              {rows.map((r) => {
                const isExpanded = expandedId === r.id;
                const diffMs = r.oldDepartAt && r.newDepartAt
                  ? new Date(r.newDepartAt).getTime() - new Date(r.oldDepartAt).getTime()
                  : 0;
                const diffLabel = (() => {
                  if (!r.oldDepartAt || !r.newDepartAt || diffMs === 0) return null;
                  const abs = Math.abs(diffMs);
                  const totalMin = Math.round(abs / 60000);
                  const days = Math.floor(totalMin / (60 * 24));
                  const hours = Math.floor((totalMin - days * 60 * 24) / 60);
                  const min = totalMin % 60;
                  const parts: string[] = [];
                  if (days) parts.push(`${days}d`);
                  if (hours) parts.push(`${hours}h`);
                  if (min || parts.length === 0) parts.push(`${min}min`);
                  return `${diffMs > 0 ? "atrasado" : "adiantado"} em ${parts.join(" ")}`;
                })();
                return (
                  <li
                    key={r.id}
                    className={`px-3 py-2.5 text-xs transition ${
                      r.seenAt ? "opacity-80" : "bg-brand-orange/[0.04]"
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
                          <button
                            onClick={() => setExpandedId(isExpanded ? null : r.id)}
                            className="text-[10px] text-brand-orange hover:underline inline-flex items-center gap-0.5"
                          >
                            {isExpanded ? (<><ChevronUp className="h-3 w-3" /> Ocultar</>) : (<><ChevronDown className="h-3 w-3" /> Ver detalhes</>)}
                          </button>
                        </div>
                        {r.response && (
                          <div className="mt-1 text-[10px] font-medium text-brand-orange">
                            Cliente respondeu: {r.response}
                          </div>
                        )}

                        {isExpanded && (
                          <div className="mt-2 rounded-md border border-border bg-muted/30 p-2 space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                                {severityLabel(r.severity)}
                              </span>
                              {diffLabel && (
                                <span className={`text-[10px] font-semibold ${diffMs > 0 ? "text-orange-500" : "text-emerald-500"}`}>
                                  {diffLabel}
                                </span>
                              )}
                            </div>
                            <div className="grid grid-cols-1 gap-1.5">
                              <div className="flex items-baseline justify-between gap-2">
                                <span className="text-[10px] text-muted-foreground shrink-0">Voo anterior</span>
                                <span className="text-[11px] font-medium text-right line-through decoration-muted-foreground/60">
                                  {fmtDateTime(r.oldDepartAt)}
                                </span>
                              </div>
                              <div className="flex items-baseline justify-between gap-2">
                                <span className="text-[10px] text-muted-foreground shrink-0">Voo novo</span>
                                <span className="text-[11px] font-semibold text-right text-foreground">
                                  {fmtDateTime(r.newDepartAt)}
                                </span>
                              </div>
                              {r.newStatus && r.newStatus.toLowerCase() !== "expected" && (
                                <div className="flex items-baseline justify-between gap-2">
                                  <span className="text-[10px] text-muted-foreground shrink-0">Status</span>
                                  <span className="text-[11px] font-medium text-right">{r.newStatus}</span>
                                </div>
                              )}
                            </div>
                            <button
                              onClick={() => handleCopy(r)}
                              className="w-full inline-flex items-center justify-center gap-1.5 rounded-md bg-brand-orange text-white text-[11px] font-medium py-1.5 hover:bg-brand-orange/90 transition"
                            >
                              <Copy className="h-3 w-3" /> Copiar mensagem pro cliente
                            </button>
                          </div>
                        )}
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
                );
              })}
            </ul>
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
