import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import {
  Plus, Search, Loader2, Download, KeyRound, RotateCcw, ExternalLink,
  ArrowRightLeft, Copy, Link2 as LinkIcon, Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { formatBRL } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  gerarTokenExtensao,
  importarOrcamentoPorUrl,
  reprocessarImportacao,
  converterOrcamentoEmPedido,
  gerarLinkOrcamento,
} from "@/lib/quotes/quotes.functions";
import { quoteStatusBadge, quoteOriginBadge, quoteExternalId } from "@/lib/quotes/labels";
import { NovoOrcamentoManualDialog } from "@/components/quote/NovoOrcamentoManualDialog";
import { confirmThen } from "@/lib/confirm";

export const Route = createFileRoute("/admin/orcamentos/")({
  component: OrcamentosPage,
  head: () => ({ meta: [{ title: "Orçamentos — Admin" }] }),
});

type QuoteRow = {
  id: string;
  quote_number: number;
  quote_type: string;
  status: string;
  title: string | null;
  client_name: string | null;
  client_phone: string | null;
  client_email: string | null;
  destination: string | null;
  start_date: string | null;
  end_date: string | null;
  total: number | null;
  consultant: string | null;
  source: string;
  source_company_code: string | null;
  source_booking_id: string | null;
  source_import_id: string | null;
  converted_order_id: string | null;
  deleted_at: string | null;
  updated_at: string;
  created_at: string;
};

/** Mesmos filtros/UX da tela de Pedidos, com os status de orçamento. */
const STATUS_FILTERS = [
  { value: "all", label: "Todos" },
  { value: "READY", label: "Pronto" },
  { value: "SENT", label: "Enviado" },
  { value: "VIEWED", label: "Visualizado" },
  { value: "CONVERTED", label: "Convertido" },
  { value: "CANCELLED", label: "Cancelado" },
  { value: "deleted", label: "Excluídos" },
] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number]["value"];

function periodo(q: QuoteRow) {
  if (!q.start_date) return "—";
  const f = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  return q.end_date ? `${f(q.start_date)} – ${f(q.end_date)}` : f(q.start_date);
}

function OrcamentosPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [importOpen, setImportOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [tokenOpen, setTokenOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [token, setToken] = useState<string | null>(null);

  const showDeleted = statusFilter === "deleted";

  const { data: quotes, isLoading } = useQuery({
    queryKey: ["admin", "quotes", "list", showDeleted],
    queryFn: async () => {
      let q = supabase
        .from("quotes")
        .select(
          "id, quote_number, quote_type, status, title, client_name, client_phone, client_email, destination, start_date, end_date, total, consultant, source, source_company_code, source_booking_id, source_import_id, converted_order_id, deleted_at, updated_at, created_at",
        )
        .order("created_at", { ascending: false })
        .limit(500);
      if (showDeleted) q = q.not("deleted_at", "is", null);
      else q = q.is("deleted_at", null);
      const { data, error } = await q;
      if (error) throw error;
      return data as QuoteRow[];
    },
  });

  // orçamentos que chegam pelo plugin aparecem sozinhos na tela
  useEffect(() => {
    const channel = supabase
      .channel("quotes-inbox")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "quotes" }, (payload) => {
        const q = payload.new as QuoteRow;
        toast.success("Novo orçamento importado", {
          description: [q.source, q.destination ?? q.title ?? ""].filter(Boolean).join(" • "),
        });
        qc.invalidateQueries({ queryKey: ["admin", "quotes", "list"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc]);

  const importar = useServerFn(importarOrcamentoPorUrl);
  const gerarToken = useServerFn(gerarTokenExtensao);
  const reprocessar = useServerFn(reprocessarImportacao);
  const converter = useServerFn(converterOrcamentoEmPedido);
  const gerarLink = useServerFn(gerarLinkOrcamento);

  const importMutation = useMutation({
    mutationFn: async (u: string) => await importar({ data: { url: u } }),
    onSuccess: (r) => {
      if (r.status === "IMPORT_ERROR") toast.error(r.error ?? "Não foi possível importar");
      else toast.success("Orçamento importado");
      setImportOpen(false);
      setUrl("");
      qc.invalidateQueries({ queryKey: ["admin", "quotes", "list"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao importar"),
  });

  const tokenMutation = useMutation({
    mutationFn: async () => await gerarToken({ data: { label: "Via Air Orçamentos" } }),
    onSuccess: (r) => setToken(r.token),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao gerar token"),
  });

  const reprocessMutation = useMutation({
    mutationFn: async (importId: string) => await reprocessar({ data: { importId } }),
    onSuccess: () => {
      toast.success("Importação reprocessada");
      qc.invalidateQueries({ queryKey: ["admin", "quotes", "list"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao reprocessar"),
  });

  const convertMutation = useMutation({
    mutationFn: async (quoteId: string) => await converter({ data: { quoteId } }),
    onSuccess: (r) => {
      toast.success(r.alreadyConverted ? "Orçamento já convertido" : "Pedido gerado a partir do orçamento");
      qc.invalidateQueries({ queryKey: ["admin", "quotes", "list"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao converter"),
  });

  const linkMutation = useMutation({
    mutationFn: (quoteId: string) => gerarLink({ data: { quoteId } }),
    onSuccess: async (r) => {
      const u = r.shortUrl ?? r.url;
      try {
        await navigator.clipboard.writeText(u);
        toast.success(r.reused ? "Link copiado" : "Link gerado e copiado", { description: u });
      } catch {
        toast.success("Link gerado", { description: u });
      }
      void qc.invalidateQueries({ queryKey: ["admin", "quotes", "list"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao gerar link"),
  });

  const softDelete = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("quotes")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Orçamento excluído");
      qc.invalidateQueries({ queryKey: ["admin", "quotes", "list"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao excluir"),
  });

  const restore = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("quotes").update({ deleted_at: null }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Orçamento restaurado");
      qc.invalidateQueries({ queryKey: ["admin", "quotes", "list"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao restaurar"),
  });

  const term = search.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      (quotes ?? []).filter((q) => {
        if (statusFilter !== "all" && statusFilter !== "deleted" && q.status !== statusFilter) return false;
        if (!term) return true;
        return [q.quote_number, q.client_name, q.client_phone, q.client_email, q.destination, q.title, q.consultant, q.source, q.source_company_code, q.source_booking_id]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(term);
      }),
    [quotes, term, statusFilter],
  );

  const statusCounts = (quotes ?? []).reduce<Record<string, number>>((acc, q) => {
    acc[q.status] = (acc[q.status] ?? 0) + 1;
    return acc;
  }, {});

  const PAGE_SIZE = 10;
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  useEffect(() => { if (page > totalPages) setPage(1); }, [page, totalPages]);
  useEffect(() => { setPage(1); }, [term, statusFilter, showDeleted]);
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="mx-auto max-w-7xl px-3 sm:px-4 md:px-6 py-4 sm:py-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-display font-bold">Orçamentos</h1>
          <p className="text-xs sm:text-sm text-muted-foreground">
            {quotes?.length ?? 0} orçamento(s) · resultado: {filtered.length}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" className="gap-2" onClick={() => setTokenOpen(true)}>
            <KeyRound className="h-4 w-4" /> <span className="hidden sm:inline">Conectar plugin</span><span className="sm:hidden">Plugin</span>
          </Button>
          <Button variant="outline" size="sm" className="gap-2" onClick={() => setImportOpen(true)}>
            <Download className="h-4 w-4" /> Importar<span className="hidden sm:inline"> orçamento</span>
          </Button>
          <Button size="sm" className="gap-2" onClick={() => setManualOpen(true)}>
            <Plus className="h-4 w-4" /> Cadastrar<span className="hidden sm:inline"> orçamento</span>
          </Button>
        </div>
      </div>

      <NovoOrcamentoManualDialog
        open={manualOpen}
        onOpenChange={setManualOpen}
        onCriado={() => qc.invalidateQueries({ queryKey: ["admin", "quotes", "list"] })}
      />

      {/* Search bar (mesmo padrão dos Pedidos) */}
      <div className="mt-4 rounded-2xl border border-border bg-card p-3 sm:p-4">
        <div className="grid gap-3 md:grid-cols-[1fr_auto]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por Nº, cliente, destino, consultor…"
              className="w-full rounded-lg border border-border bg-background pl-9 pr-3 py-2 text-sm outline-none focus:border-brand-orange"
            />
          </div>
        </div>
        <div className="mt-3 flex flex-nowrap gap-2 overflow-x-auto -mx-1 px-1">
          {STATUS_FILTERS.map((f) => {
            const active = statusFilter === f.value;
            const count =
              f.value === "all" ? quotes?.length ?? 0 : f.value === "deleted" ? (showDeleted ? quotes?.length ?? 0 : 0) : statusCounts[f.value] ?? 0;
            return (
              <button
                key={f.value}
                type="button"
                onClick={() => setStatusFilter(f.value)}
                className={`inline-flex shrink-0 items-center gap-2 rounded-full px-3 py-1 text-xs font-medium transition ${
                  active
                    ? "bg-brand-orange text-primary-foreground"
                    : "border border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {f.label}
                <span className={`rounded-full px-1.5 text-[10px] ${active ? "bg-white/20" : "bg-muted"}`}>{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Resultado */}
      <div className="mt-4 rounded-2xl border border-border bg-card overflow-hidden">
        <div className="border-b border-border px-4 py-2 text-xs text-muted-foreground">
          Resultado: {filtered.length} registro(s)
        </div>

        {/* Mobile */}
        <div className="md:hidden divide-y divide-border/50">
          {isLoading && (
            <div className="text-center py-10 text-muted-foreground text-sm">
              <Loader2 className="h-4 w-4 animate-spin inline mr-2" /> Carregando…
            </div>
          )}
          {!isLoading && filtered.length === 0 && (
            <div className="text-center py-10 text-muted-foreground text-sm">Nenhum orçamento encontrado.</div>
          )}
          {paged.map((q) => {
            const st = quoteStatusBadge(q.status);
            const og = quoteOriginBadge(q);
            const ext = quoteExternalId(q);
            return (
              <div key={q.id} className="relative">
                <Link
                  to="/admin/orcamentos/$id"
                  params={{ id: q.id }}
                  className="block px-4 py-3 active:bg-muted/40 transition"
                >
                  <div className="flex items-start justify-between gap-3 pr-8">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-bold tabular-nums tracking-tight">#{q.quote_number}</div>
                      <div className="mt-1 font-semibold text-sm truncate">{q.client_name ?? "—"}</div>
                      <div className="text-[11px] text-muted-foreground truncate mt-0.5">{q.client_email ?? ""}</div>
                      <div className="text-[11px] text-muted-foreground tabular-nums">{q.client_phone ?? ""}</div>
                      <div className="mt-1 text-xs truncate">{q.destination ?? q.title ?? "—"} · {periodo(q)}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-bold text-sm tabular-nums">{q.total ? formatBRL(Number(q.total)) : "—"}</div>
                      <div className="text-[10px] text-muted-foreground mt-0.5 tabular-nums">
                        {new Date(q.created_at).toLocaleDateString("pt-BR")}
                      </div>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <span className={`inline-flex items-center rounded-sm border px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest ${st.className}`}>{st.label}</span>
                    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${og.className}`}>{og.label}</span>
                    {ext && (
                      <span className="inline-flex items-center rounded-sm border border-border bg-muted/30 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-muted-foreground">
                        {ext.label}
                      </span>
                    )}
                  </div>
                </Link>
                {showDeleted ? (
                  <button
                    type="button"
                    aria-label="Restaurar orçamento"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); confirmThen("Restaurar este orçamento?", () => restore.mutate(q.id)); }}
                    className="absolute top-3 right-3 rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <RotateCcw className="h-4 w-4" />
                  </button>
                ) : (
                  <div className="absolute top-3 right-3 flex items-center gap-1">
                    <button
                      type="button"
                      aria-label="Gerar link"
                      disabled={linkMutation.isPending}
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); linkMutation.mutate(q.id); }}
                      className="rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-brand-orange disabled:opacity-50"
                    >
                      <LinkIcon className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      aria-label="Excluir orçamento"
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); confirmThen(`Excluir o orçamento #${q.quote_number}?`, () => softDelete.mutate(q.id)); }}
                      className="rounded-full p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Desktop */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-[11px] text-muted-foreground uppercase tracking-widest">
              <tr>
                <th className="text-left py-3 px-4 font-bold">Nº</th>
                <th className="text-left py-3 px-4 font-bold">Contato</th>
                <th className="text-left py-3 px-4 font-bold">Produto</th>
                <th className="text-left py-3 px-4 font-bold">Status</th>
                <th className="text-right py-3 px-4 font-bold">Total</th>
                <th className="text-left py-3 px-4 font-bold">Criação</th>
                <th className="text-right py-3 px-4 font-bold">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {isLoading && (
                <tr><td colSpan={7} className="text-center py-10 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin inline mr-2" /> Carregando…
                </td></tr>
              )}
              {!isLoading && filtered.length === 0 && (
                <tr><td colSpan={7} className="text-center py-10 text-muted-foreground">
                  Nenhum orçamento encontrado.
                </td></tr>
              )}
              {paged.map((q) => {
                const st = quoteStatusBadge(q.status);
                const og = quoteOriginBadge(q);
                const ext = quoteExternalId(q);
                return (
                  <tr key={q.id} className="group hover:bg-muted/30 transition-colors">
                    <td className="py-5 px-4 align-top">
                      <div className="text-sm font-bold tabular-nums tracking-tight">#{q.quote_number}</div>
                    </td>
                    <td className="py-5 px-4 align-top">
                      <div className="text-sm font-semibold">{q.client_name ?? "—"}</div>
                      <div className="text-[11px] text-muted-foreground mt-1">{q.client_email ?? ""}</div>
                      <div className="text-[11px] text-muted-foreground tabular-nums">{q.client_phone ?? ""}</div>
                      {q.consultant && (
                        <div className="text-[10px] font-semibold text-brand-orange mt-0.5">{q.consultant}</div>
                      )}
                    </td>
                    <td className="py-5 px-4 align-top max-w-[280px]">
                      <div className="text-sm font-medium leading-tight">{q.destination ?? q.title ?? "—"}</div>
                      <div className="text-[11px] text-muted-foreground mt-0.5 tabular-nums">{periodo(q)}</div>
                    </td>
                    <td className="py-5 px-4 align-top">
                      <div className="flex flex-col items-start gap-1">
                        <span className={`inline-flex items-center rounded-sm border px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest ${st.className}`}>{st.label}</span>
                        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${og.className}`}>{og.label}</span>
                        {ext && (
                          <span className="rounded-sm border border-border bg-muted/30 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-muted-foreground">
                            {ext.label}
                          </span>
                        )}
                        {q.converted_order_id && (
                          <Link
                            to="/admin/pedidos/$id"
                            params={{ id: q.converted_order_id }}
                            className="text-[11px] text-brand-orange hover:underline"
                          >
                            Pedido gerado
                          </Link>
                        )}
                      </div>
                    </td>
                    <td className="py-5 px-4 align-top text-right">
                      <div className="text-sm font-bold tabular-nums">{q.total ? formatBRL(Number(q.total)) : "—"}</div>
                    </td>
                    <td className="py-5 px-4 align-top">
                      <div className="text-[11px] tabular-nums">
                        <div className="text-foreground/70 font-medium">{new Date(q.created_at).toLocaleDateString("pt-BR")}</div>
                        <div className="text-muted-foreground/60">{new Date(q.created_at).toLocaleTimeString("pt-BR")}</div>
                      </div>
                    </td>
                    <td className="py-5 px-4 align-top text-right">
                      <div className="inline-flex items-center gap-1.5">
                        <Link
                          to="/admin/orcamentos/$id"
                          params={{ id: q.id }}
                          className="inline-flex items-center gap-1.5 rounded-md bg-brand-orange px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-primary-foreground hover:brightness-110 active:scale-95 transition-all"
                        >
                          <ExternalLink className="h-3 w-3" /> Abrir
                        </Link>
                        {showDeleted ? (
                          <button
                            type="button"
                            aria-label="Restaurar"
                            onClick={() => confirmThen("Restaurar este orçamento?", () => restore.mutate(q.id))}
                            className="rounded-md p-2 text-muted-foreground/40 opacity-0 group-hover:opacity-100 hover:bg-muted hover:text-foreground transition-all"
                          >
                            <RotateCcw className="h-4 w-4" />
                          </button>
                        ) : (
                          <>
                            <button
                              type="button"
                              aria-label="Gerar link"
                              title="Gerar link do orçamento"
                              disabled={linkMutation.isPending}
                              onClick={() => linkMutation.mutate(q.id)}
                              className="rounded-md p-2 text-muted-foreground/40 opacity-0 group-hover:opacity-100 hover:bg-muted hover:text-brand-orange transition-all disabled:opacity-50"
                            >
                              <LinkIcon className="h-4 w-4" />
                            </button>
                            {q.source_import_id && (
                              <button
                                type="button"
                                aria-label="Reprocessar"
                                title="Reprocessar importação"
                                disabled={reprocessMutation.isPending}
                                onClick={() => reprocessMutation.mutate(q.source_import_id!)}
                                className="rounded-md p-2 text-muted-foreground/40 opacity-0 group-hover:opacity-100 hover:bg-muted hover:text-foreground transition-all disabled:opacity-50"
                              >
                                <RotateCcw className="h-4 w-4" />
                              </button>
                            )}
                            <button
                              type="button"
                              aria-label="Converter em pedido"
                              title="Converter em pedido"
                              disabled={convertMutation.isPending || !!q.converted_order_id}
                              onClick={() => confirmThen(`Converter o orçamento #${q.quote_number} em pedido?`, () => convertMutation.mutate(q.id))}
                              className="rounded-md p-2 text-muted-foreground/40 opacity-0 group-hover:opacity-100 hover:bg-muted hover:text-foreground transition-all disabled:opacity-30"
                            >
                              <ArrowRightLeft className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              aria-label="Excluir"
                              onClick={() => confirmThen(`Excluir o orçamento #${q.quote_number}?`, () => softDelete.mutate(q.id))}
                              className="rounded-md p-2 text-muted-foreground/40 opacity-0 group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive transition-all"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {filtered.length > 0 && (
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-t border-border px-4 py-3 text-xs text-muted-foreground">
            <div className="tabular-nums">
              Mostrando {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} de {filtered.length}
            </div>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(1)}>«</Button>
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>‹</Button>
              <span className="px-2 tabular-nums">Página {page} de {totalPages}</span>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>›</Button>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(totalPages)}>»</Button>
            </div>
          </div>
        )}
      </div>

      {/* Importação manual (fallback) */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Importar orçamento</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Link do orçamento web</Label>
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://premium.infotravel.com.br/orcamento-web/..."
            />
            <p className="text-[11px] text-muted-foreground">
              O fluxo principal é automático pelo plugin. Use este campo apenas como alternativa.
            </p>
          </div>
          <DialogFooter>
            <Button onClick={() => importMutation.mutate(url)} disabled={!url.trim() || importMutation.isPending}>
              {importMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Importar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Token do plugin */}
      <Dialog open={tokenOpen} onOpenChange={setTokenOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Conectar plugin Via Air Orçamentos</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground text-xs">
              Gere um token e cole no plugin (v1.0.6 ou superior) uma única vez. Ele fica autenticado
              permanentemente e importa os orçamentos mesmo com o portal fechado. Gerar um token novo não
              desconecta o plugin já configurado — os tokens anteriores continuam válidos.
            </p>
            {token ? (
              <div className="rounded-lg border border-border bg-muted/40 p-3">
                <code className="block break-all text-xs">{token}</code>
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-2"
                  onClick={() => {
                    navigator.clipboard.writeText(token);
                    toast.success("Token copiado");
                  }}
                >
                  <Copy className="h-3.5 w-3.5" /> Copiar
                </Button>
              </div>
            ) : (
              <Button onClick={() => tokenMutation.mutate()} disabled={tokenMutation.isPending}>
                {tokenMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Gerar token
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
