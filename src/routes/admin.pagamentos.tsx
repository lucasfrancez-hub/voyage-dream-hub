import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Loader2, Plus, RefreshCw, Ban, CalendarClock, Search, Receipt, Eye,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { ComprovanteReceipt } from "@/components/financial/ComprovanteReceipt";
import { formatBRL } from "@/lib/format";
import { PixPaymentDialog } from "@/components/financial/PixPaymentDialog";
import {
  listarPagamentosPix, detalharPagamentoPix, sincronizarPagamentoPix, sincronizarTodosPagamentosPix, cancelarPagamentoPix,
} from "@/lib/pagamentos.functions";
import { confirmThen } from "@/lib/confirm";

export const Route = createFileRoute("/admin/pagamentos")({
  component: PagamentosPage,
  head: () => ({
    meta: [
      { title: "Pagamentos Pix — Admin VIA AIR" },
      { name: "description", content: "Envio e acompanhamento de pagamentos Pix pela conta ASAAS da VIA AIR." },
      { property: "og:title", content: "Pagamentos Pix — Admin VIA AIR" },
      { property: "og:description", content: "Envio e acompanhamento de pagamentos Pix pela conta ASAAS." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const STATUS_META: Record<string, { label: string; cls: string }> = {
  agendado: { label: "Agendado", cls: "bg-sky-500/15 text-sky-400" },
  pendente: { label: "Aguardando processamento", cls: "bg-amber-500/15 text-amber-400" },
  processando: { label: "Em processamento bancário", cls: "bg-indigo-500/15 text-indigo-400" },
  concluido: { label: "Concluído", cls: "bg-emerald-500/15 text-emerald-400" },
  falhou: { label: "Falhou", cls: "bg-red-500/15 text-red-400" },
  cancelado: { label: "Cancelado", cls: "bg-muted text-muted-foreground" },
  bloqueado: { label: "Bloqueado", cls: "bg-orange-500/15 text-orange-400" },
};


const ORIGIN_LABEL: Record<string, string> = {
  contas_pagar: "Contas a pagar",
  avulso: "Pagamento avulso",
  pedido: "Pedido",
  outro: "Outro",
};

/** Status próprios do pagamento de boleto (ASAAS Pague Contas). */
const BOLETO_STATUS_META: Record<string, { label: string; cls: string; bucket: string }> = {
  agendado: { label: "Agendado", cls: "bg-sky-500/15 text-sky-400", bucket: "agendado" },
  pendente: { label: "Aguardando pagamento", cls: "bg-amber-500/15 text-amber-400", bucket: "pendente" },
  processando: { label: "Em processamento", cls: "bg-indigo-500/15 text-indigo-400", bucket: "processando" },
  pago: { label: "Pago", cls: "bg-emerald-500/15 text-emerald-400", bucket: "concluido" },
  falhou: { label: "Falhou", cls: "bg-red-500/15 text-red-400", bucket: "falhou" },
  cancelado: { label: "Cancelado", cls: "bg-muted text-muted-foreground", bucket: "cancelado" },
};

type UnifiedRow = {
  kind: "pix" | "boleto";
  id: string;
  bucket: string;
  statusLabel: string;
  statusCls: string;
  nome: string;
  sub: string;
  valor: number;
  createdAt: string;
  scheduledDate: string | null;
  raw: any;
};

function PagamentosPage() {
  const qc = useQueryClient();
  const listar = useServerFn(listarPagamentosPix);
  const listarBoletos = useServerFn(listarPagamentosBoleto);
  const sincronizar = useServerFn(sincronizarPagamentoPix);
  const sincronizarTodos = useServerFn(sincronizarTodosPagamentosPix);
  const sincronizarBoleto = useServerFn(sincronizarPagamentoBoleto);
  const cancelar = useServerFn(cancelarPagamentoPix);
  const cancelarBoleto = useServerFn(cancelarPagamentoBoleto);

  const [novoOpen, setNovoOpen] = useState(false);
  const [novoBoletoOpen, setNovoBoletoOpen] = useState(false);
  const [reciboRow, setReciboRow] = useState<any | null>(null);
  const [reciboBoleto, setReciboBoleto] = useState<any | null>(null);
  const [detalheId, setDetalheId] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("todos");
  const [tipoFilter, setTipoFilter] = useState<"todos" | "pix" | "boleto">("todos");
  const [search, setSearch] = useState("");
  const [sincronizandoTudo, setSincronizandoTudo] = useState(false);


  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["asaas-transfers"],
    queryFn: async () => (await listar({ data: {} })) as any[],
    refetchInterval: 30_000,
  });

  const boletosQ = useQuery({
    queryKey: ["asaas-bill-payments"],
    queryFn: async () => (await listarBoletos({ data: {} })) as any[],
    refetchInterval: 30_000,
  });

  const rows: UnifiedRow[] = useMemo(() => {
    const pix = (data ?? []).map((r): UnifiedRow => {
      const meta = STATUS_META[r.status];
      return {
        kind: "pix",
        id: r.id,
        bucket: r.status,
        statusLabel: meta?.label ?? r.status,
        statusCls: meta?.cls ?? "bg-muted",
        nome: r.favored_name ?? "—",
        sub: `${r.pix_key ?? "—"} · ${ORIGIN_LABEL[r.origin] ?? r.origin}`,
        valor: Number(r.value),
        createdAt: r.created_at,
        scheduledDate: r.scheduled_date ?? null,
        raw: r,
      };
    });
    const boletos = (boletosQ.data ?? []).map((b): UnifiedRow => {
      const meta = BOLETO_STATUS_META[b.status];
      return {
        kind: "boleto",
        id: b.id,
        bucket: meta?.bucket ?? b.status,
        statusLabel: meta?.label ?? b.status,
        statusCls: meta?.cls ?? "bg-muted",
        nome: b.beneficiary_name ?? b.description ?? "Boleto",
        sub: `${b.identification_field ? formatLinha(b.identification_field) : "—"}`,
        valor: Number(b.value),
        createdAt: b.created_at,
        scheduledDate: b.scheduled_date ?? null,
        raw: b,
      };
    });
    return [...pix, ...boletos].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }, [data, boletosQ.data]);

  const agendados = rows.filter((r) => r.bucket === "agendado");

  const filtered = useMemo(() => {
    let list = rows;
    if (tipoFilter !== "todos") list = list.filter((r) => r.kind === tipoFilter);
    if (filter !== "todos") list = list.filter((r) => r.bucket === filter);
    if (search.trim()) {
      const s = search.toLowerCase();
      list = list.filter(
        (r) =>
          r.nome.toLowerCase().includes(s) ||
          r.sub.toLowerCase().includes(s) ||
          String(r.raw?.description ?? "").toLowerCase().includes(s),
      );
    }
    return list;
  }, [rows, filter, tipoFilter, search]);

  const totals = useMemo(() => {
    const acc: Record<string, number> = {};
    for (const r of rows) acc[r.bucket] = (acc[r.bucket] ?? 0) + 1;
    return acc;
  }, [rows]);


  const doSync = async (id: string) => {
    try {
      const r: any = await sincronizar({ data: { id } });
      await qc.invalidateQueries({ queryKey: ["asaas-transfers"] });
      await qc.invalidateQueries({ queryKey: ["asaas-transfer", id] });
      toast.success(
        r?.mudou ? `Status atualizado: ${STATUS_META[r.status]?.label ?? r.status}` : "Status já estava atualizado",
      );
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  /** Sincronização real com o ASAAS (somente GET) + atualização da lista. */
  const doSyncTodos = async () => {
    if (sincronizandoTudo) return;
    setSincronizandoTudo(true);
    const t = toast.loading("Sincronizando com ASAAS...");
    try {
      const r: any = await sincronizarTodos();
      await qc.invalidateQueries({ queryKey: ["asaas-transfers"] });
      await qc.invalidateQueries({ queryKey: ["asaas-transfer"] });
      await refetch();
      const msg =
        r?.atualizados > 0
          ? `${r.atualizados} pagamento${r.atualizados > 1 ? "s" : ""} atualizado${r.atualizados > 1 ? "s" : ""}`
          : "Todos os pagamentos já estão atualizados.";
      toast.success(msg, {
        id: t,
        description: r?.erros ? `${r.erros} consulta(s) falharam no ASAAS.` : undefined,
      });
    } catch (e) {
      toast.error((e as Error).message, { id: t });
    } finally {
      setSincronizandoTudo(false);
    }
  };


  const doCancel = (id: string) =>
    confirmThen(
      {
        title: "Cancelar pagamento?",
        description: "O pagamento será cancelado no ASAAS, se ainda não tiver sido executado.",
        confirmText: "Cancelar pagamento",
      },
      async () => {
        try {
          await cancelar({ data: { id } });
          toast.success("Pagamento cancelado");
          qc.invalidateQueries({ queryKey: ["asaas-transfers"] });
        } catch (e) {
          toast.error((e as Error).message);
        }
      },
    );

  const doSyncBoleto = async (id: string) => {
    try {
      await sincronizarBoleto({ data: { id } });
      await qc.invalidateQueries({ queryKey: ["asaas-bill-payments"] });
      toast.success("Status do boleto atualizado");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const doCancelBoleto = (id: string) =>
    confirmThen(
      {
        title: "Cancelar pagamento de boleto?",
        description: "O pagamento será cancelado no ASAAS, se ainda não tiver sido executado.",
        confirmText: "Cancelar pagamento",
      },
      async () => {
        try {
          await cancelarBoleto({ data: { id } });
          toast.success("Pagamento de boleto cancelado");
          qc.invalidateQueries({ queryKey: ["asaas-bill-payments"] });
        } catch (e) {
          toast.error((e as Error).message);
        }
      },
    );



  return (
    <div className="mx-auto max-w-7xl px-4 md:px-6 py-6 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-display font-bold">Pagamentos</h1>
          <p className="text-sm text-muted-foreground">Pix e boletos de saída pela conta ASAAS e acompanhamento dos status.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={doSyncTodos}
            disabled={sincronizandoTudo || isFetching}
          >
            <RefreshCw className={`h-4 w-4 mr-1.5 ${sincronizandoTudo || isFetching ? "animate-spin" : ""}`} />
            {sincronizandoTudo ? "Sincronizando..." : "Atualizar"}
          </Button>

          <Button size="sm" onClick={() => setNovoOpen(true)}>
            <Plus className="h-4 w-4 mr-1.5" /> Novo pagamento Pix
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setNovoBoletoOpen(true)}>
            <Plus className="h-4 w-4 mr-1.5" /> Novo pagamento boleto
          </Button>
        </div>
      </div>

      {/* Tipo */}
      <div className="flex gap-2">
        {([
          { k: "todos", label: "Todos" },
          { k: "pix", label: "Pix" },
          { k: "boleto", label: "Boleto" },
        ] as const).map((t) => (
          <button
            key={t.k}
            onClick={() => setTipoFilter(t.k)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition ${
              tipoFilter === t.k
                ? "border-brand-orange text-brand-orange bg-brand-orange/10"
                : "border-border text-muted-foreground hover:border-brand-orange/40"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Status */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2">
        {Object.entries(STATUS_META).map(([key, meta]) => (
          <button
            key={key}
            onClick={() => setFilter(filter === key ? "todos" : key)}
            className={`rounded-xl border p-3 text-left transition ${
              filter === key ? "border-brand-orange" : "border-border hover:border-brand-orange/40"
            } bg-card`}
          >
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{meta.label}</div>
            <div className="text-xl font-bold">{totals[key] ?? 0}</div>
          </button>
        ))}
      </div>

      {/* Agendados */}
      {agendados.length > 0 && (
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center gap-2 text-sm font-semibold">
            <CalendarClock className="h-4 w-4 text-sky-400" /> Pagamentos agendados
          </div>
          <div className="divide-y divide-border">
            {agendados.map((r) => (
              <button
                key={`${r.kind}-${r.id}`}
                onClick={() => (r.kind === "pix" ? setDetalheId(r.id) : setReciboBoleto(r.raw))}
                className="w-full text-left grid grid-cols-[90px_1fr_auto] items-center gap-3 px-4 py-3 hover:bg-muted/30"
              >
                <span className="text-sm font-semibold">
                  {r.scheduledDate ? new Date(r.scheduledDate + "T00:00:00").toLocaleDateString("pt-BR") : "—"}
                </span>
                <span className="min-w-0">
                  <span className="flex items-center gap-2">
                    <TipoBadge kind={r.kind} />
                    <span className="font-medium truncate">{r.nome}</span>
                  </span>
                  <span className="block text-xs text-muted-foreground truncate">{r.sub}</span>
                </span>
                <span className="font-semibold tabular-nums">{formatBRL(r.valor)}</span>
              </button>
            ))}
          </div>
        </div>
      )}



      {/* Busca */}
      <div className="relative max-w-sm">
        <Search className="h-4 w-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar favorecido, chave, descrição..."
          className="pl-8 h-9"
        />
      </div>

      {/* Lista */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        {isLoading ? (
          <div className="p-10 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">Nenhum pagamento.</div>
        ) : (
          <div className="divide-y divide-border">
            {filtered.map((r) => {
              const cancelable =
                r.kind === "pix"
                  ? ["agendado", "pendente"].includes(r.raw.status)
                  : ["agendado", "pendente", "processando"].includes(r.raw.status);
              const abrir = () =>
                r.kind === "pix" ? setDetalheId(r.id) : setReciboBoleto(r.raw);
              return (
                <div key={`${r.kind}-${r.id}`} className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-muted/30">
                  <button onClick={abrir} className="min-w-0 flex-1 text-left">
                    <div className="flex items-center gap-2 min-w-0">
                      <TipoBadge kind={r.kind} />
                      <span className="font-medium truncate">{r.nome}</span>
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {r.sub} · {new Date(r.createdAt).toLocaleString("pt-BR")}
                    </div>
                  </button>
                  <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${r.statusCls}`}>
                    {r.statusLabel}
                  </span>
                  <span className="font-semibold tabular-nums w-28 text-right">{formatBRL(r.valor)}</span>
                  <div className="flex gap-1">
                    {r.kind === "pix" && (
                      <Button
                        size="icon"
                        variant="outline"
                        title="Detalhes e auditoria"
                        className="rounded-full h-9 w-9 border-border/60"
                        onClick={() => setDetalheId(r.id)}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    )}
                    <Button
                      size="icon"
                      variant="outline"
                      title="Ver comprovante"
                      className="rounded-full h-9 w-9 border-border/60"
                      onClick={() => (r.kind === "pix" ? setReciboRow(r.raw) : setReciboBoleto(r.raw))}
                    >
                      <Receipt className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="rounded-full h-9 w-9"
                      title="Sincronizar status"
                      onClick={() => (r.kind === "pix" ? doSync(r.id) : doSyncBoleto(r.id))}
                    >
                      <RefreshCw className="h-4 w-4" />
                    </Button>
                    {cancelable && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="rounded-full h-9 w-9"
                        title="Cancelar"
                        onClick={() => (r.kind === "pix" ? doCancel(r.id) : doCancelBoleto(r.id))}
                      >
                        <Ban className="h-4 w-4 text-red-500" />
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}

          </div>
        )}
      </div>

      <PixPaymentDialog
        open={novoOpen}
        onOpenChange={setNovoOpen}
        initial={{ origin: "avulso" }}
        onDone={() => qc.invalidateQueries({ queryKey: ["asaas-transfers"] })}
      />
      <DetalheDialog id={detalheId} onClose={() => setDetalheId(null)} />
      <ComprovanteReceipt
        open={!!reciboRow}
        onOpenChange={(v) => !v && setReciboRow(null)}
        data={
          reciboRow
            ? {
                valor: Number(reciboRow.value),
                favorecido: reciboRow.favored_name ?? "—",
                instituicao: reciboRow.bank_name ?? bancoDoRaw(reciboRow.raw_response) ?? null,
                chavePix: reciboRow.pix_key ?? null,
                cpfCnpj: reciboRow.cpf_cnpj ?? null,
                tipo: "Transferência Pix",
                dataHora: new Date(
                  reciboRow.effective_date ?? reciboRow.created_at,
                ).toLocaleString("pt-BR"),
                transacaoId: e2eDoRaw(reciboRow.raw_response) ?? reciboRow.asaas_transfer_id ?? null,
                descricao: reciboRow.description ?? null,
                status: STATUS_META[reciboRow.status]?.label ?? reciboRow.status,
                concluido: reciboRow.status === "concluido",
                formaPagamento: "Pix",
                dataVencimento: reciboRow.scheduled_date ?? null,
                dataPagamento: reciboRow.effective_date ?? reciboRow.created_at,
                pdfUrl: reciboRow.receipt_url ?? null,
              }
            : null
        }
      />
    </div>
  );
}

function e2eDoRaw(raw: any): string | null {
  if (!raw || typeof raw !== "object") return null;
  return (
    raw.pixTransaction?.endToEndIdentifier ??
    raw.pixTransaction?.endToEndId ??
    raw.endToEndIdentifier ??
    raw.transactionReceiptId ??
    null
  );
}

function bancoDoRaw(raw: any): string | null {
  if (!raw || typeof raw !== "object") return null;
  return (
    raw.bankAccount?.bank?.name ??
    raw.bankAccount?.ispbName ??
    raw.bankAccount?.bank?.ispb ??
    raw.pixTransaction?.qrCode?.payer?.bankName ??
    null
  );
}

function DetalheDialog({ id, onClose }: { id: string | null; onClose: () => void }) {
  const detalhar = useServerFn(detalharPagamentoPix);
  const [reciboOpen, setReciboOpen] = useState(false);
  const { data } = useQuery({
    queryKey: ["asaas-transfer", id],
    queryFn: async () => (await detalhar({ data: { id: id! } })) as any,
    enabled: !!id,
  });
  const t = data?.transfer;
  const meta = t ? STATUS_META[t.status] : undefined;

  const recibo = t
    ? {
        valor: Number(t.value),
        favorecido: t.favored_name ?? "—",
        instituicao: t.bank_name ?? bancoDoRaw(t.raw_response) ?? null,
        chavePix: t.pix_key ?? null,
        cpfCnpj: t.cpf_cnpj ?? null,
        tipo: "Transferência Pix",
        dataHora: new Date(t.effective_date ?? t.created_at).toLocaleString("pt-BR"),
        transacaoId: t.end_to_end_identifier ?? e2eDoRaw(t.raw_response) ?? t.asaas_transfer_id ?? null,
        descricao: t.description ?? null,
        status: meta?.label ?? t.status,
        concluido: t.status === "concluido",
        formaPagamento: "Pix",
        dataVencimento: t.scheduled_date ?? null,
        dataPagamento: t.effective_date ?? t.created_at,
        pdfUrl: t.receipt_url ?? null,
      }
    : null;

  return (
    <>
      <Dialog open={!!id} onOpenChange={(v) => !v && onClose()}>
        <DialogContent className="max-w-[520px] max-h-[85vh] overflow-y-auto p-0 bg-card/70 backdrop-blur-xl border-border/60 rounded-2xl">
          <DialogHeader className="p-6 border-b border-border/60">
            <DialogTitle className="text-lg">Detalhes do pagamento</DialogTitle>
          </DialogHeader>
          {!t ? (
            <div className="p-10 flex justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : (
            <div className="p-6 space-y-6">
              <div className="space-y-3">
                <Line k="Favorecido" v={t.favored_name} />
                <Line k="Chave Pix" v={`${t.pix_key}${t.pix_key_type ? ` (${t.pix_key_type})` : ""}`} />
                <Line k="CPF/CNPJ" v={t.cpf_cnpj || "—"} />
                <div className="flex justify-between items-baseline gap-4">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Valor</span>
                  <span className="text-brand-orange font-bold tabular-nums">{formatBRL(Number(t.value))}</span>
                </div>
                <div className="flex justify-between items-center gap-4">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${meta?.cls ?? "bg-muted"}`}>
                    {meta?.label ?? t.status}
                  </span>
                </div>
                <Line k="Origem" v={ORIGIN_LABEL[t.origin] ?? t.origin} />
                <Line
                  k="Data"
                  v={t.scheduled_date ?? t.effective_date ?? new Date(t.created_at).toLocaleDateString("pt-BR")}
                />
                <Line k="Descrição" v={t.description || "—"} />
                {t.asaas_status && <Line k="Status no ASAAS" v={t.asaas_status} />}
                {t.fail_reason && <Line k="Falha" v={t.fail_reason} />}
                {t.refusal_reason && <Line k="Motivo da recusa" v={t.refusal_reason} />}
                {(t.end_to_end_identifier || e2eDoRaw(t.raw_response)) && (
                  <Line k="Identificador Pix (E2E)" v={t.end_to_end_identifier || e2eDoRaw(t.raw_response)} />
                )}
                {t.last_event && (
                  <Line
                    k="Último evento"
                    v={`${t.last_event}${t.last_event_at ? ` · ${new Date(t.last_event_at).toLocaleString("pt-BR")}` : ""}`}
                  />
                )}

              </div>

              <div className="pt-4 border-t border-border/60 space-y-3">
                <div>
                  <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-widest">ID ASAAS</span>
                  <p className="text-xs font-mono text-muted-foreground break-all bg-muted/30 p-2 rounded mt-1">
                    {t.asaas_transfer_id || "—"}
                  </p>
                </div>
                <div className="flex justify-between items-center gap-4 text-xs text-muted-foreground">
                  <span>Criado por</span>
                  <span className="text-foreground/80 text-right">
                    {t.created_by_name ?? "—"}{t.created_ip ? ` · ${t.created_ip}` : ""}
                  </span>
                </div>
              </div>

              <Button className="w-full" onClick={() => setReciboOpen(true)}>
                <Receipt className="h-4 w-4 mr-2" /> Ver comprovante
              </Button>

              <div className="space-y-3">
                <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Auditoria</h3>
                <div className="space-y-2">
                  {(data?.events ?? []).map((ev: any) => (
                    <div key={ev.id} className="rounded-lg border border-border/60 bg-muted/20 p-3 text-xs">
                      <div className="flex justify-between gap-2">
                        <span className="font-semibold uppercase text-[10px] tracking-wide">
                          {ev.event}{ev.decision ? ` — ${ev.decision}` : ""}
                        </span>
                        <span className="text-muted-foreground text-[10px]">
                          {new Date(ev.created_at).toLocaleString("pt-BR")}
                        </span>
                      </div>
                      {ev.message && <div className="text-muted-foreground mt-1 italic text-[11px]">{ev.message}</div>}
                      {(ev.actor_name || ev.ip) && (
                        <div className="text-muted-foreground mt-0.5 text-[10px]">
                          {ev.actor_name ?? "sistema"}{ev.ip ? ` · ${ev.ip}` : ""}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <ComprovanteReceipt open={reciboOpen} onOpenChange={setReciboOpen} data={recibo} />
    </>
  );
}

function Line({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between items-baseline gap-4">
      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{k}</span>
      <span className="text-sm font-medium text-right break-all">{v}</span>
    </div>
  );
}

