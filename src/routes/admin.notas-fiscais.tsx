import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  FileText, RefreshCw, Download, XCircle, Search, FileCode2,
  Trash2, ChevronLeft, ChevronRight,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Building2 } from "lucide-react";
import { listAllNfse, consultarNfse, cancelarNfse, deleteNfse, listNfseConfigs } from "@/lib/nfse.functions";
import { downloadNfsePdf, downloadNfseXml } from "@/lib/nfse-document";
import { CancelNfseDialog } from "@/components/nfse/CancelNfseDialog";
import { NfseDetailsDialog } from "@/components/nfse/NfseDetailsDialog";
import { confirmThen } from "@/lib/confirm";
import { prestadorShortLabel, prestadorBadgeClass } from "@/lib/nfse-labels";

export const Route = createFileRoute("/admin/notas-fiscais")({
  head: () => ({ meta: [{ title: "Notas Fiscais — VIA AIR" }] }),
  component: NotasFiscaisPage,
});

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtDate = (s: string) => new Date(s).toLocaleString("pt-BR");

type Row = Awaited<ReturnType<ReturnType<typeof useServerFn<typeof listAllNfse>>>>[number];

type StatusKey = "autorizado" | "processando" | "erro" | "cancelado";
function normalizeStatus(s: string): StatusKey {
  if (s === "autorizado" || s === "emitida") return "autorizado";
  if (s === "processando" || s === "cancelando") return "processando";
  if (s === "erro") return "erro";
  return "cancelado";
}

const STATUS_META: Record<StatusKey, { label: string; badge: string }> = {
  autorizado: {
    label: "Autorizada",
    badge: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
  },
  processando: {
    label: "Processando",
    badge: "bg-amber-500/10 text-amber-500 border-amber-500/20",
  },
  erro: {
    label: "Erro",
    badge: "bg-rose-500/10 text-rose-500 border-rose-500/20",
  },
  cancelado: {
    label: "Cancelado",
    badge: "bg-slate-500/10 text-slate-400 border-slate-500/20",
  },
};

function NotasFiscaisPage() {
  const listFn = useServerFn(listAllNfse);
  const consultFn = useServerFn(consultarNfse);
  const cancelFn = useServerFn(cancelarNfse);
  const deleteFn = useServerFn(deleteNfse);
  const listConfigsFn = useServerFn(listNfseConfigs);
  const qc = useQueryClient();
  const [tab, setTab] = useState<"todas" | StatusKey>("todas");
  const [search, setSearch] = useState("");
  const [prestadorFilter, setPrestadorFilter] = useState<string>("todos");
  const [cancelTarget, setCancelTarget] = useState<Row | null>(null);
  const [detailsTarget, setDetailsTarget] = useState<Row | null>(null);

  const key = ["nfse", "all"] as const;
  const { data: rows = [], isLoading } = useQuery({
    queryKey: key,
    queryFn: () => listFn({ data: {} }),
    refetchInterval: (q) =>
      (q.state.data ?? []).some((e) => e.status === "processando" || e.status === "cancelando")
        ? 10000 : false,
  });

  const consultMut = useMutation({
    mutationFn: (id: string) => consultFn({ data: { id } }),
    onSuccess: () => { toast.success("Status atualizado"); qc.invalidateQueries({ queryKey: key }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });
  const cancelMut = useMutation({
    mutationFn: (v: { id: string; justificativa: string }) => cancelFn({ data: v }),
    onSuccess: () => { toast.success("Cancelamento solicitado"); qc.invalidateQueries({ queryKey: key }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => { toast.success("Emissão excluída"); qc.invalidateQueries({ queryKey: key }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  const counts = useMemo(() => {
    const c = { todas: rows.length, autorizado: 0, processando: 0, erro: 0, cancelado: 0 };
    for (const r of rows) c[normalizeStatus(r.status)]++;
    return c;
  }, [rows]);

  const totals = useMemo(() => {
    let valor = 0, iss = 0;
    for (const r of rows) {
      if (normalizeStatus(r.status) !== "autorizado") continue;
      valor += Number(r.valor_servicos ?? 0);
      iss += Number(r.valor_iss ?? 0);
    }
    return { valor, iss };
  }, [rows]);

  const getPrestador = (r: Row) =>
    (r as Row & { prestador?: { cnpj?: string | null; nome_fantasia?: string | null; razao_social?: string | null } | null }).prestador ?? null;
  const getPrestadorName = (r: Row): string => prestadorShortLabel(getPrestador(r));

  const { data: configs = [] } = useQuery({
    queryKey: ["nfse", "configs"],
    queryFn: () => listConfigsFn({ data: undefined as never }),
  });

  const prestadores = useMemo(() => {
    const set = new Set<string>();
    for (const c of configs) {
      const n = prestadorShortLabel(c);
      if (n) set.add(n);
    }
    for (const r of rows) {
      const n = getPrestadorName(r);
      if (n) set.add(n);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [configs, rows]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return rows.filter((r) => {
      const st = normalizeStatus(r.status);
      if (tab !== "todas" && st !== tab) return false;
      if (prestadorFilter !== "todos" && getPrestadorName(r) !== prestadorFilter) return false;
      if (!s) return true;
      const o = (r as Row & { orders?: { order_number?: string; full_name?: string } }).orders;
      return (
        (r.numero_nfse ?? "").toLowerCase().includes(s) ||
        ((r.tomador as { razao_social?: string } | null)?.razao_social ?? "").toLowerCase().includes(s) ||
        (o?.order_number ?? "").toLowerCase().includes(s) ||
        (o?.full_name ?? "").toLowerCase().includes(s) ||
        getPrestadorName(r).toLowerCase().includes(s)
      );
    });
  }, [rows, tab, search, prestadorFilter]);

  const TABS: Array<{ id: "todas" | StatusKey; label: string; count: number }> = [
    { id: "todas", label: "Todas", count: counts.todas },
    { id: "autorizado", label: "Autorizadas", count: counts.autorizado },
    { id: "processando", label: "Processando", count: counts.processando },
    { id: "erro", label: "Erros", count: counts.erro },
    { id: "cancelado", label: "Canceladas", count: counts.cancelado },
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 md:px-6 py-6 space-y-8">
      {/* Header */}
      <div className="flex items-start sm:items-center justify-between gap-4 flex-col sm:flex-row">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-card rounded-lg border border-border">
              <FileText className="h-5 w-5 text-brand-orange" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Notas Fiscais de Serviço
            </h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground sm:ml-11">
            NFS-e emitidas via AtendeNet (IPM) · Paranavaí/PR
          </p>
        </div>
        <button
          onClick={() => qc.invalidateQueries({ queryKey: key })}
          className="flex items-center gap-2 px-4 py-2 bg-card hover:bg-accent border border-border rounded-lg text-sm font-medium transition-colors"
        >
          <RefreshCw className="h-4 w-4 text-muted-foreground" />
          Atualizar
        </button>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Autorizadas" value={String(counts.autorizado)} sub={brl(totals.valor)} tone="emerald" />
        <KpiCard label="Processando" value={String(counts.processando)} sub="Aguardando SEFAZ" tone="amber" />
        <KpiCard label="Com erro" value={String(counts.erro)} sub="Requer atenção" tone="rose" />
        <KpiCard label="ISS Retido" value={brl(totals.iss)} sub="Sobre autorizadas" tone="brand" />
      </div>

      {/* Table Section */}
      <div className="bg-card/40 border border-border rounded-2xl overflow-hidden">
        {/* Filters + Search */}
        <div className="p-4 border-b border-border flex flex-col md:flex-row justify-between gap-4 bg-card/20">
          <div className="flex items-center gap-1 bg-background/60 p-1 rounded-xl border border-border overflow-x-auto">
            {TABS.map((t) => {
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`px-4 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
                    active
                      ? "bg-brand-orange text-white shadow-lg shadow-brand-orange/20"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t.label}
                  <span className={`text-xs ml-1 ${active ? "opacity-80" : "opacity-70"}`}>
                    {t.count}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-3 flex-1 max-w-xl">
            <Select value={prestadorFilter} onValueChange={setPrestadorFilter}>
              <SelectTrigger className="h-10 w-[200px] bg-background/60 border-border rounded-xl">
                <Building2 className="h-4 w-4 text-muted-foreground mr-1" />
                <SelectValue placeholder="Prestador" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os prestadores</SelectItem>
                {prestadores.map((p) => (
                  <SelectItem key={p} value={p}>{p}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-10 h-10 bg-background/60 border-border rounded-xl focus-visible:ring-brand-orange/50"
                placeholder="Buscar por número, pedido ou tomador…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* List */}
        {isLoading && (
          <div className="p-10 text-center text-sm text-muted-foreground">Carregando…</div>
        )}
        {!isLoading && filtered.length === 0 && (
          <div className="p-12 text-center text-sm text-muted-foreground">
            Nenhuma nota fiscal encontrada.
          </div>
        )}

        {filtered.length > 0 && (
          <div className="divide-y divide-border/60">
            {filtered.map((r) => {
              const o = (r as Row & { orders?: { order_number?: string; full_name?: string } }).orders;
              const err = r.focus_response as { mensagem?: string; erros?: Array<{ mensagem?: string }>; bodyPreview?: string; networkError?: string } | null;
              const status = normalizeStatus(r.status);
              const meta = STATUS_META[status];
              const isCancelled = status === "cancelado";
              const errMsg = status === "erro"
                ? err?.mensagem || err?.erros?.[0]?.mensagem || err?.networkError || err?.bodyPreview?.slice(0, 200)
                : null;
              const tomadorName = (r.tomador as { razao_social?: string } | null)?.razao_social || o?.full_name || "—";

              return (
                <div
                  key={r.id}
                  onClick={() => setDetailsTarget(r)}
                  className={`p-5 flex flex-col lg:flex-row lg:items-center gap-4 lg:gap-6 hover:bg-accent/20 transition-colors group cursor-pointer ${
                    isCancelled ? "opacity-60" : ""
                  }`}
                >
                  <div className="flex-none">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${meta.badge}`}>
                      {meta.label}
                    </span>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className={`text-sm font-bold ${isCancelled ? "text-muted-foreground" : "text-foreground"}`}>
                        {r.numero_nfse ? `Nº ${r.numero_nfse}` : "—"}
                      </span>
                      {o?.order_number && (
                        <Link
                          to="/admin/pedidos/$id"
                          params={{ id: r.order_id }}
                          onClick={(e) => e.stopPropagation()}
                          className={`text-xs font-medium px-2 py-0.5 rounded transition-colors ${
                            isCancelled
                              ? "text-muted-foreground bg-muted"
                              : "text-brand-orange bg-brand-orange/10 hover:bg-brand-orange/20"
                          }`}
                        >
                          Pedido #{o.order_number}
                        </Link>
                      )}
                    </div>
                  <div className="mt-1 flex items-center gap-2 flex-wrap">
                    <span className={`text-sm font-medium truncate ${isCancelled ? "text-muted-foreground" : "text-foreground/90"}`}>
                      {tomadorName}
                    </span>
                    <span className="text-muted-foreground/60">•</span>
                    <span className="text-xs text-muted-foreground">{fmtDate(r.created_at)}</span>
                    {getPrestadorName(r) && (
                      <>
                        <span className="text-muted-foreground/60">•</span>
                        <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-brand-orange/10 text-brand-orange border border-brand-orange/20">
                          <Building2 className="h-3 w-3" />
                          {getPrestadorName(r)}
                        </span>
                      </>
                    )}
                  </div>
                    {r.codigo_verificacao && (
                      <p className="mt-1 text-[10px] text-muted-foreground/70 font-mono truncate">
                        Verif: {r.codigo_verificacao}
                      </p>
                    )}
                    {errMsg && (
                      <p className="mt-1 text-xs text-rose-500 truncate">{errMsg}</p>
                    )}
                  </div>

                  <div className="text-right">
                    <p className={`text-lg font-bold tracking-tight ${
                      isCancelled ? "text-muted-foreground line-through" : "text-foreground"
                    }`}>
                      {brl(Number(r.valor_servicos ?? 0))}
                    </p>
                  </div>

                  <div onClick={(e) => e.stopPropagation()} className="flex items-center gap-1 lg:pl-4 flex-wrap">
                    <IconBtn
                      title="Sincronizar"
                      onClick={() => consultMut.mutate(r.id)}
                      disabled={consultMut.isPending}
                      hover="emerald"
                    >
                      <RefreshCw className="h-4 w-4" />
                    </IconBtn>

                    {status === "autorizado" && (
                      <>
                        <IconBtn title="Baixar PDF" onClick={() => downloadNfsePdf(r)}>
                          <Download className="h-4 w-4" />
                        </IconBtn>
                        <IconBtn
                          title="Baixar XML"
                          onClick={() => {
                            try { downloadNfseXml(r); }
                            catch (e) { toast.error(e instanceof Error ? e.message : "XML indisponível"); }
                          }}
                        >
                          <FileCode2 className="h-4 w-4" />
                        </IconBtn>
                        <IconBtn
                          title="Cancelar NFS-e"
                          hover="rose"
                          onClick={() => setCancelTarget(r)}
                        >
                          <XCircle className="h-4 w-4" />
                        </IconBtn>
                      </>
                    )}

                    {(status === "erro" || status === "cancelado") && (
                      <IconBtn
                        title="Excluir emissão"
                        hover="rose"
                        disabled={deleteMut.isPending}
                        onClick={() => {
                          confirmThen(
                            {
                              title: "Excluir emissão",
                              description: "Excluir esta emissão? Esta ação não pode ser desfeita.",
                              confirmText: "Excluir",
                              destructive: true,
                            },
                            () => deleteMut.mutate(r.id),
                          );
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </IconBtn>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Footer */}
        {filtered.length > 0 && (
          <div className="px-6 py-4 bg-card/40 border-t border-border flex justify-between items-center">
            <p className="text-xs text-muted-foreground">
              Mostrando <span className="text-foreground font-medium">{filtered.length}</span> de{" "}
              <span className="text-foreground font-medium">{rows.length}</span>
            </p>
            <div className="flex gap-2">
              <button disabled className="p-1 text-muted-foreground disabled:opacity-30">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button disabled className="p-1 text-muted-foreground disabled:opacity-30">
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      <CancelNfseDialog
        open={!!cancelTarget}
        onOpenChange={(v) => { if (!v) setCancelTarget(null); }}
        numero={cancelTarget?.numero_nfse ?? cancelTarget?.numero_rps ?? null}
        loading={cancelMut.isPending}
        onConfirm={(j) => {
          if (!cancelTarget) return;
          const id = cancelTarget.id;
          cancelMut.mutate({ id, justificativa: j }, { onSettled: () => setCancelTarget(null) });
        }}
      />

      <NfseDetailsDialog
        open={!!detailsTarget}
        onOpenChange={(v) => { if (!v) setDetailsTarget(null); }}
        row={detailsTarget as unknown as Record<string, unknown> | null}
      />
    </div>
  );
}

function IconBtn({
  children, title, onClick, disabled, hover = "default",
}: {
  children: React.ReactNode;
  title: string;
  onClick?: () => void;
  disabled?: boolean;
  hover?: "default" | "emerald" | "rose";
}) {
  const hoverCls = {
    default: "hover:text-foreground hover:bg-accent",
    emerald: "hover:text-emerald-400 hover:bg-emerald-400/10",
    rose: "hover:text-rose-500 hover:bg-rose-500/10",
  }[hover];
  return (
    <button
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`p-2 text-muted-foreground rounded-lg transition-all disabled:opacity-50 ${hoverCls}`}
    >
      {children}
    </button>
  );
}

function KpiCard({
  label, value, sub, tone,
}: {
  label: string; value: string; sub: string;
  tone: "emerald" | "amber" | "rose" | "brand";
}) {
  const bar = {
    emerald: "bg-emerald-500",
    amber: "bg-amber-500",
    rose: "bg-rose-500",
    brand: "bg-brand-orange",
  }[tone];
  const labelCls = {
    emerald: "text-muted-foreground",
    amber: "text-muted-foreground",
    rose: "text-muted-foreground",
    brand: "text-brand-orange",
  }[tone];
  const valueCls = {
    emerald: "text-emerald-500",
    amber: "text-amber-500",
    rose: "text-rose-500",
    brand: "text-foreground",
  }[tone];
  const cardExtra = tone === "brand"
    ? "border-brand-orange/30 bg-gradient-to-br from-card/50 to-brand-orange/5"
    : "bg-card/50";

  return (
    <div className={`border border-border p-5 rounded-2xl relative overflow-hidden ${cardExtra}`}>
      <div className={`absolute top-0 left-0 w-1 h-full ${bar}`} />
      <p className={`text-xs font-semibold uppercase tracking-wider ${labelCls}`}>{label}</p>
      <p className={`text-3xl font-bold mt-1 ${valueCls} ${tone === "brand" ? "text-2xl" : ""}`}>
        {value}
      </p>
      <p className="text-sm text-muted-foreground mt-2">{sub}</p>
    </div>
  );
}
