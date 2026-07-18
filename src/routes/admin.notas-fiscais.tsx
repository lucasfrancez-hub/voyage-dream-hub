import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  FileText, RefreshCw, Download, XCircle, ExternalLink, Search,
  CheckCircle2, AlertTriangle, Clock, Ban,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Tabs, TabsList, TabsTrigger, TabsContent,
} from "@/components/ui/tabs";
import { listAllNfse, consultarNfse, cancelarNfse } from "@/lib/nfse.functions";

export const Route = createFileRoute("/admin/notas-fiscais")({
  head: () => ({ meta: [{ title: "Notas Fiscais — VIA AIR" }] }),
  component: NotasFiscaisPage,
});

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtDate = (s: string) => new Date(s).toLocaleString("pt-BR");

function statusBadge(s: string) {
  const map: Record<string, { label: string; cls: string; icon: React.ReactNode }> = {
    processando: { label: "Processando", cls: "bg-amber-500/15 text-amber-700 border-amber-500/30", icon: <Clock className="h-3 w-3" /> },
    autorizado: { label: "Autorizado", cls: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30", icon: <CheckCircle2 className="h-3 w-3" /> },
    cancelando: { label: "Cancelando", cls: "bg-orange-500/15 text-orange-700 border-orange-500/30", icon: <Clock className="h-3 w-3" /> },
    cancelado: { label: "Cancelado", cls: "bg-muted text-muted-foreground", icon: <Ban className="h-3 w-3" /> },
    erro: { label: "Erro", cls: "bg-red-500/15 text-red-700 border-red-500/30", icon: <AlertTriangle className="h-3 w-3" /> },
  };
  const x = map[s] ?? map.processando;
  return <Badge variant="outline" className={`gap-1 ${x.cls}`}>{x.icon} {x.label}</Badge>;
}

type Row = Awaited<ReturnType<ReturnType<typeof useServerFn<typeof listAllNfse>>>>[number];

function NotasFiscaisPage() {
  const listFn = useServerFn(listAllNfse);
  const consultFn = useServerFn(consultarNfse);
  const cancelFn = useServerFn(cancelarNfse);
  const qc = useQueryClient();
  const [tab, setTab] = useState<string>("todas");
  const [search, setSearch] = useState("");

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

  const counts = useMemo(() => {
    const c = { todas: rows.length, autorizado: 0, processando: 0, erro: 0, cancelado: 0 };
    for (const r of rows) {
      if (r.status === "autorizado") c.autorizado++;
      else if (r.status === "processando" || r.status === "cancelando") c.processando++;
      else if (r.status === "erro") c.erro++;
      else if (r.status === "cancelado") c.cancelado++;
    }
    return c;
  }, [rows]);

  const totals = useMemo(() => {
    let valor = 0, iss = 0;
    for (const r of rows) {
      if (r.status !== "autorizado") continue;
      valor += Number(r.valor_servicos ?? 0);
      iss += Number(r.valor_iss ?? 0);
    }
    return { valor, iss };
  }, [rows]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (tab === "autorizado" && r.status !== "autorizado") return false;
      if (tab === "processando" && !(r.status === "processando" || r.status === "cancelando")) return false;
      if (tab === "erro" && r.status !== "erro") return false;
      if (tab === "cancelado" && r.status !== "cancelado") return false;
      if (!s) return true;
      const o = (r as Row & { orders?: { order_number?: string; full_name?: string } }).orders;
      return (
        (r.numero_nfse ?? "").toLowerCase().includes(s) ||
        (r.tomador_razao_social ?? "").toLowerCase().includes(s) ||
        (o?.order_number ?? "").toLowerCase().includes(s) ||
        (o?.full_name ?? "").toLowerCase().includes(s)
      );
    });
  }, [rows, tab, search]);

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <FileText className="h-5 w-5" /> Notas Fiscais de Serviço
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            NFS-e emitidas via Focus NFe · Paranavaí/PR
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => qc.invalidateQueries({ queryKey: key })}>
          <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Atualizar
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Autorizadas" value={String(counts.autorizado)} sub={brl(totals.valor)} tone="emerald" />
        <KpiCard label="Processando" value={String(counts.processando)} sub="Aguardando SEFAZ" tone="amber" />
        <KpiCard label="Com erro" value={String(counts.erro)} sub="Requer atenção" tone="red" />
        <KpiCard label="ISS retido" value={brl(totals.iss)} sub="Sobre autorizadas" tone="muted" />
      </div>

      <div className="rounded-xl border border-border">
        <div className="p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center gap-3 border-b border-border">
          <Tabs value={tab} onValueChange={setTab} className="w-full sm:w-auto">
            <TabsList>
              <TabsTrigger value="todas">Todas ({counts.todas})</TabsTrigger>
              <TabsTrigger value="autorizado">Autorizadas ({counts.autorizado})</TabsTrigger>
              <TabsTrigger value="processando">Processando ({counts.processando})</TabsTrigger>
              <TabsTrigger value="erro">Erros ({counts.erro})</TabsTrigger>
              <TabsTrigger value="cancelado">Canceladas ({counts.cancelado})</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="relative sm:ml-auto sm:w-72">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              className="pl-8 h-9"
              placeholder="Buscar por número, pedido ou tomador…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        <Tabs value={tab}>
          <TabsContent value={tab} className="m-0">
            {isLoading && <div className="p-6 text-sm text-muted-foreground">Carregando…</div>}
            {!isLoading && filtered.length === 0 && (
              <div className="p-8 text-center text-sm text-muted-foreground">
                Nenhuma nota fiscal encontrada.
              </div>
            )}
            {filtered.length > 0 && (
              <div className="divide-y divide-border">
                {filtered.map((r) => {
                  const o = (r as Row & { orders?: { order_number?: string; full_name?: string } }).orders;
                  const err = (r.focus_response as { mensagem?: string; erros?: Array<{ mensagem?: string }> } | null);
                  const errMsg = err?.mensagem || err?.erros?.[0]?.mensagem;
                  return (
                    <div key={r.id} className="p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          {statusBadge(r.status)}
                          {r.numero_nfse && <span className="font-mono text-sm font-medium">Nº {r.numero_nfse}</span>}
                          {o?.order_number && (
                            <Link
                              to="/admin/pedidos/$id"
                              params={{ id: r.order_id }}
                              className="text-xs text-brand-orange hover:underline"
                            >
                              Pedido #{o.order_number}
                            </Link>
                          )}
                        </div>
                        <div className="mt-1 text-sm truncate">
                          {r.tomador_razao_social || o?.full_name || "—"}
                          <span className="text-muted-foreground"> · {brl(Number(r.valor_servicos ?? 0))}</span>
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {fmtDate(r.created_at)}
                          {r.codigo_verificacao && <> · Cód. verif. <span className="font-mono">{r.codigo_verificacao}</span></>}
                        </div>
                        {errMsg && (
                          <div className="mt-1 text-xs text-red-600 flex items-start gap-1">
                            <ExternalLink className="h-3 w-3 mt-0.5 shrink-0" /> {errMsg}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button size="sm" variant="ghost" className="h-8 px-2"
                          disabled={consultMut.isPending}
                          title="Sincronizar status"
                          onClick={() => consultMut.mutate(r.id)}>
                          <RefreshCw className="h-3.5 w-3.5" />
                        </Button>
                        {r.url_pdf && (
                          <Button size="sm" variant="ghost" className="h-8 px-2" asChild title="Baixar PDF">
                            <a href={r.url_pdf} target="_blank" rel="noreferrer">
                              <Download className="h-3.5 w-3.5" />
                            </a>
                          </Button>
                        )}
                        {r.status === "autorizado" && (
                          <Button size="sm" variant="ghost" className="h-8 px-2 text-red-600"
                            title="Cancelar NFS-e"
                            onClick={() => {
                              const j = window.prompt("Justificativa do cancelamento (mín. 15 caracteres):");
                              if (j && j.trim().length >= 15) cancelMut.mutate({ id: r.id, justificativa: j.trim() });
                              else if (j !== null) toast.error("Justificativa muito curta");
                            }}>
                            <XCircle className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function KpiCard({
  label, value, sub, tone,
}: { label: string; value: string; sub: string; tone: "emerald" | "amber" | "red" | "muted" }) {
  const toneCls = {
    emerald: "text-emerald-600",
    amber: "text-amber-600",
    red: "text-red-600",
    muted: "text-foreground",
  }[tone];
  return (
    <div className="rounded-xl border border-border p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-2xl font-semibold mt-1 ${toneCls}`}>{value}</div>
      <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>
    </div>
  );
}
