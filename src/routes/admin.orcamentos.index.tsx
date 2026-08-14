import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { Search, Loader2, Download, KeyRound, RotateCcw, ExternalLink, FileText, ArrowRightLeft, Copy, Link2 as LinkIcon } from "lucide-react";
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
import { QUOTE_STATUS, quoteStatusBadge, quoteSourceBadge } from "@/lib/quotes/labels";

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
  destination: string | null;
  start_date: string | null;
  end_date: string | null;
  total: number | null;
  consultant: string | null;
  source: string;
  source_import_id: string | null;
  converted_order_id: string | null;
  normalized: unknown;
  updated_at: string;
  created_at: string;
};

function periodo(q: QuoteRow) {
  if (!q.start_date) return "—";
  const f = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  return q.end_date ? `${f(q.start_date)} – ${f(q.end_date)}` : f(q.start_date);
}

function OrcamentosPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [importOpen, setImportOpen] = useState(false);
  const [tokenOpen, setTokenOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [detail, setDetail] = useState<QuoteRow | null>(null);

  const { data: quotes, isLoading } = useQuery({
    queryKey: ["admin", "quotes", "list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quotes")
        .select(
          "id, quote_number, quote_type, status, title, client_name, client_phone, destination, start_date, end_date, total, consultant, source, source_import_id, converted_order_id, normalized, updated_at, created_at",
        )
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(500);
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
      const url = r.shortUrl ?? r.url;
      try {
        await navigator.clipboard.writeText(url);
        toast.success(r.reused ? "Link copiado" : "Link gerado e copiado", { description: url });
      } catch {
        toast.success("Link gerado", { description: url });
      }
      void queryClient.invalidateQueries({ queryKey: ["orcamentos"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao gerar link"),
  });

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (quotes ?? []).filter((q) => {
      if (statusFilter !== "all" && q.status !== statusFilter) return false;
      if (!term) return true;
      return [q.quote_number, q.client_name, q.destination, q.title, q.consultant, q.source]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(term);
    });
  }, [quotes, search, statusFilter]);

  return (
    <div className="mx-auto max-w-7xl px-3 sm:px-6 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Orçamentos</h1>
          <p className="text-xs text-muted-foreground">
            Importação automática pelo plugin Via Air Orçamentos e criação manual.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setTokenOpen(true)}>
            <KeyRound className="h-4 w-4" /> Conectar plugin
          </Button>
          <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
            <Download className="h-4 w-4" /> Importar orçamento
          </Button>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por cliente, destino, número…"
            className="pl-9"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="h-9 rounded-md border border-border bg-background px-3 text-sm"
        >
          <option value="all">Todos os status</option>
          {QUOTE_STATUS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-4 rounded-xl border border-border overflow-hidden">
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-[11px] text-muted-foreground uppercase tracking-widest">
              <tr>
                <th className="text-left py-3 px-4 font-bold">Nº</th>
                <th className="text-left py-3 px-4 font-bold">Cliente</th>
                <th className="text-left py-3 px-4 font-bold">Destino</th>
                <th className="text-left py-3 px-4 font-bold">Período</th>
                <th className="text-right py-3 px-4 font-bold">Valor</th>
                <th className="text-left py-3 px-4 font-bold">Consultor</th>
                <th className="text-left py-3 px-4 font-bold">Origem</th>
                <th className="text-left py-3 px-4 font-bold">Status</th>
                <th className="text-right py-3 px-4 font-bold">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {isLoading && (
                <tr>
                  <td colSpan={9} className="text-center py-10 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin inline mr-2" /> Carregando…
                  </td>
                </tr>
              )}
              {!isLoading && filtered.length === 0 && (
                <tr>
                  <td colSpan={9} className="text-center py-10 text-muted-foreground">
                    Nenhum orçamento encontrado.
                  </td>
                </tr>
              )}
              {filtered.map((q) => {
                const st = quoteStatusBadge(q.status);
                const og = quoteSourceBadge(q.source);
                return (
                  <tr key={q.id} className="group hover:bg-muted/30 transition-colors">
                    <td className="py-4 px-4 font-bold tabular-nums">#{q.quote_number}</td>
                    <td className="py-4 px-4">
                      <div className="font-semibold">{q.client_name ?? "—"}</div>
                      <div className="text-[11px] text-muted-foreground">{q.client_phone ?? ""}</div>
                    </td>
                    <td className="py-4 px-4">{q.destination ?? q.title ?? "—"}</td>
                    <td className="py-4 px-4 tabular-nums">{periodo(q)}</td>
                    <td className="py-4 px-4 text-right font-bold tabular-nums">
                      {q.total ? formatBRL(Number(q.total)) : "—"}
                    </td>
                    <td className="py-4 px-4">{q.consultant ?? "—"}</td>
                    <td className="py-4 px-4">
                      <span
                        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${og.className}`}
                      >
                        {og.label}
                      </span>
                    </td>
                    <td className="py-4 px-4">
                      <span
                        className={`inline-flex items-center rounded-sm border px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest ${st.className}`}
                      >
                        {st.label}
                      </span>
                      {q.converted_order_id && (
                        <Link
                          to="/admin/pedidos/$id"
                          params={{ id: q.converted_order_id }}
                          className="mt-1 block text-[11px] text-brand-orange hover:underline"
                        >
                          Pedido gerado
                        </Link>
                      )}
                    </td>
                    <td className="py-4 px-4">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          title="Ver detalhes"
                          onClick={() => setDetail(q)}
                          className="rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                        >
                          <FileText className="h-4 w-4" />
                        </button>
                        {q.source_import_id && (
                          <button
                            type="button"
                            title="Reprocessar importação"
                            disabled={reprocessMutation.isPending}
                            onClick={() => reprocessMutation.mutate(q.source_import_id!)}
                            className="rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
                          >
                            <RotateCcw className="h-4 w-4" />
                          </button>
                        )}
                        <button
                          type="button"
                          title="Gerar link do orçamento"
                          disabled={linkMutation.isPending}
                          onClick={() => linkMutation.mutate(q.id)}
                          className="rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-brand-orange disabled:opacity-50"
                        >
                          <LinkIcon className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          title="Converter para pedido"
                          disabled={convertMutation.isPending}
                          onClick={() => convertMutation.mutate(q.id)}
                          className="rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
                        >
                          <ArrowRightLeft className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Mobile */}
        <div className="md:hidden divide-y divide-border/50">
          {filtered.map((q) => {
            const st = quoteStatusBadge(q.status);
            return (
              <button
                key={q.id}
                type="button"
                onClick={() => setDetail(q)}
                className="w-full text-left px-4 py-3 active:bg-muted/40"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-bold tabular-nums">#{q.quote_number}</div>
                    <div className="font-semibold text-sm truncate">{q.client_name ?? "—"}</div>
                    <div className="text-[11px] text-muted-foreground truncate">
                      {q.destination ?? q.title ?? ""} • {periodo(q)}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-bold text-sm tabular-nums">{q.total ? formatBRL(Number(q.total)) : "—"}</div>
                    <span
                      className={`mt-1 inline-flex items-center rounded-sm border px-2 py-0.5 text-[10px] font-bold uppercase ${st.className}`}
                    >
                      {st.label}
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
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
            <Button
              onClick={() => importMutation.mutate(url)}
              disabled={!url.trim() || importMutation.isPending}
            >
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
              Gere um token e cole no plugin uma única vez. Ele fica autenticado permanentemente e importa os
              orçamentos mesmo com o portal fechado.
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

      {/* Detalhe */}
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Orçamento #{detail?.quote_number}</DialogTitle>
          </DialogHeader>
          {detail && <QuoteDetail quote={detail} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function QuoteDetail({ quote }: { quote: QuoteRow }) {
  const n = (quote.normalized ?? {}) as {
    hotels?: { name: string; city?: string | null; checkin?: string | null; checkout?: string | null }[];
    flights?: { airline?: string | null; fromIata?: string | null; toIata?: string | null; departure?: string | null }[];
    sourceUrl?: string;
    agent?: string | null;
    agency?: string | null;
  };
  return (
    <div className="space-y-4 text-sm">
      <div className="grid grid-cols-2 gap-3">
        <Info label="Cliente" value={quote.client_name} />
        <Info label="Destino" value={quote.destination} />
        <Info label="Período" value={periodo(quote)} />
        <Info label="Valor" value={quote.total ? formatBRL(Number(quote.total)) : null} />
        <Info label="Tipo" value={quote.quote_type === "AIR_ONLY" ? "Somente aéreo" : "Pacote"} />
        <Info label="Origem" value={quoteSourceBadge(quote.source).label} />
      </div>

      {!!n.hotels?.length && (
        <div>
          <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Hospedagem</h3>
          <ul className="mt-1 space-y-1">
            {n.hotels.map((h, i) => (
              <li key={i} className="rounded-md border border-border px-3 py-2">
                <div className="font-semibold">{h.name}</div>
                <div className="text-[11px] text-muted-foreground">
                  {[h.city, h.checkin, h.checkout].filter(Boolean).join(" • ")}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!!n.flights?.length && (
        <div>
          <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Aéreo</h3>
          <ul className="mt-1 space-y-1">
            {n.flights.map((f, i) => (
              <li key={i} className="rounded-md border border-border px-3 py-2">
                {[f.airline, `${f.fromIata ?? "?"} → ${f.toIata ?? "?"}`, f.departure].filter(Boolean).join(" • ")}
              </li>
            ))}
          </ul>
        </div>
      )}

      {n.sourceUrl && (
        <a
          href={n.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs text-brand-orange hover:underline"
        >
          <ExternalLink className="h-3.5 w-3.5" /> Abrir orçamento na operadora
        </a>
      )}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="font-medium">{value ?? "—"}</div>
    </div>
  );
}
