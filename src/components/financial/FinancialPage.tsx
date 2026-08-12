import { useMemo, useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatBRL } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, Plus, Download, FileText, Check, X, Search, AlertCircle, CalendarClock, TrendingDown, TrendingUp, Trash2, Pencil, QrCode, Landmark } from "lucide-react";
import jsPDF from "jspdf";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";
import { PixPaymentDialog } from "@/components/financial/PixPaymentDialog";
import { BoletoPaymentDialog } from "@/components/financial/BoletoPaymentDialog";
import { ComprovanteEntryButton } from "@/components/financial/ComprovanteEntryButton";
import { ExternalPaymentDialog } from "@/components/financial/ExternalPaymentDialog";
import { ExternalReceiptButton } from "@/components/financial/ExternalReceiptButton";
import type { PagamentoExterno } from "@/lib/pagamentos-externos.helpers";
import { useServerFn } from "@tanstack/react-start";
import { criarPagamentoBoleto } from "@/lib/boleto-pay.functions";
import { criarPagamentoPix } from "@/lib/pagamentos.functions";
import { getBoletoDocumentUrl } from "@/lib/cofre.functions";


type Kind = "payable" | "receivable";
type Entry = {
  id: string;
  kind: Kind;
  description: string;
  category: string | null;
  amount: number;
  due_date: string | null;
  paid_date: string | null;
  status: "pending" | "paid" | "canceled";
  counterparty: string | null;
  order_id: string | null;
  payment_method: string | null;
  notes: string | null;
  auto_generated: boolean;
  created_at: string;
  boleto_path?: string | null;
  boleto_line?: string | null;
  boleto_beneficiary?: string | null;
  cost_center?: string | null;
  bill_payment_status?: string | null;
  pix_key?: string | null;
  attachment_path?: string | null;
  attachment_name?: string | null;
};
type Category = { id: string; kind: string; name: string };



function today() { return new Date().toISOString().slice(0, 10); }

function isOverdue(e: Entry) {
  if (e.status !== "pending" || !e.due_date) return false;
  return e.due_date < today();
}

export function FinancialPage({ kind }: { kind: Kind }) {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<"all" | "pending" | "paid" | "overdue">("all");
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Entry | null>(null);
  const [pixEntry, setPixEntry] = useState<Entry | null>(null);
  const [boletoEntry, setBoletoEntry] = useState<Entry | null>(null);
  const [externoEntry, setExternoEntry] = useState<Entry | null>(null);
  const [externoAvulso, setExternoAvulso] = useState(false);

  const { data: entries, isLoading } = useQuery({
    queryKey: ["financial", kind],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("financial_entries")
        .select("*")
        .eq("kind", kind)
        .order("due_date", { ascending: true, nullsFirst: false })
        .limit(2000);
      if (error) throw error;
      return data as unknown as Entry[];
    },
  });

  const { data: externos } = useQuery({
    queryKey: ["pagamentos-externos-map"],
    enabled: kind === "payable",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pagamentos_externos")
        .select("*")
        .order("data_pagamento", { ascending: false })
        .limit(1000);
      if (error) throw error;
      const map = new Map<string, PagamentoExterno>();
      for (const row of (data ?? []) as unknown as PagamentoExterno[]) {
        if (row.financial_entry_id && !map.has(row.financial_entry_id)) map.set(row.financial_entry_id, row);
      }
      return map;
    },
  });

  const { data: categories } = useQuery({
    queryKey: ["financial-categories", kind],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("financial_categories")
        .select("*")
        .in("kind", [kind, "both"])
        .order("name");
      if (error) throw error;
      return data as unknown as Category[];
    },
  });

  const filtered = useMemo(() => {
    let list = entries ?? [];
    if (filter === "pending") list = list.filter((e) => e.status === "pending" && !isOverdue(e));
    else if (filter === "paid") list = list.filter((e) => e.status === "paid");
    else if (filter === "overdue") list = list.filter((e) => isOverdue(e));
    if (search.trim()) {
      const s = search.toLowerCase();
      list = list.filter((e) =>
        (e.description ?? "").toLowerCase().includes(s) ||
        (e.counterparty ?? "").toLowerCase().includes(s) ||
        (e.category ?? "").toLowerCase().includes(s),
      );
    }
    return list;
  }, [entries, filter, search]);

  const totals = useMemo(() => {
    const all = entries ?? [];
    const pending = all.filter((e) => e.status === "pending");
    const overdue = pending.filter(isOverdue);
    const paid = all.filter((e) => e.status === "paid");
    return {
      pendingSum: pending.reduce((a, e) => a + Number(e.amount), 0),
      overdueSum: overdue.reduce((a, e) => a + Number(e.amount), 0),
      paidSum: paid.reduce((a, e) => a + Number(e.amount), 0),
      pendingCount: pending.length,
      overdueCount: overdue.length,
      paidCount: paid.length,
    };
  }, [entries]);

  const toggleStatus = useMutation({
    mutationFn: async (e: Entry) => {
      const newStatus = e.status === "paid" ? "pending" : "paid";
      const { error } = await supabase
        .from("financial_entries")
        .update({
          status: newStatus,
          paid_date: newStatus === "paid" ? today() : null,
        })
        .eq("id", e.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["financial", kind] });
      toast.success("Status atualizado");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("financial_entries").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["financial", kind] });
      toast.success("Lançamento excluído");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const label = kind === "payable" ? "Contas a pagar" : "Contas a receber";
  const accent = kind === "payable" ? "text-red-500" : "text-emerald-500";
  const AccentIcon = kind === "payable" ? TrendingDown : TrendingUp;

  const exportCSV = () => {
    const rows = [
      ["Descrição", "Categoria", "Contraparte", "Valor", "Vencimento", "Pagamento", "Status", "Pedido", "Método", "Observações"],
      ...filtered.map((e) => [
        e.description,
        e.category ?? "",
        e.counterparty ?? "",
        String(e.amount),
        e.due_date ?? "",
        e.paid_date ?? "",
        e.status,
        e.order_id ?? "",
        e.payment_method ?? "",
        (e.notes ?? "").replace(/\n/g, " "),
      ]),
    ];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${kind === "payable" ? "contas-a-pagar" : "contas-a-receber"}-${today()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(14);
    doc.text(`Relatório — ${label}`, 14, 16);
    doc.setFontSize(9);
    doc.text(`Emitido em ${new Date().toLocaleString("pt-BR")}`, 14, 22);
    doc.text(
      `Pendente: ${formatBRL(totals.pendingSum)}  |  Vencido: ${formatBRL(totals.overdueSum)}  |  Pago: ${formatBRL(totals.paidSum)}`,
      14, 28,
    );

    let y = 38;
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text("Vencimento", 14, y);
    doc.text("Descrição", 44, y);
    doc.text("Categoria", 110, y);
    doc.text("Status", 150, y);
    doc.text("Valor", 195, y, { align: "right" });
    doc.setFont("helvetica", "normal");
    doc.line(14, y + 1, 196, y + 1);
    y += 6;

    for (const e of filtered) {
      if (y > 280) { doc.addPage(); y = 20; }
      const due = e.due_date ? new Date(e.due_date + "T00:00:00").toLocaleDateString("pt-BR") : "—";
      const st = isOverdue(e) ? "Vencido" : e.status === "paid" ? "Pago" : e.status === "canceled" ? "Cancelado" : "Pendente";
      doc.text(due, 14, y);
      doc.text(String(e.description).slice(0, 40), 44, y);
      doc.text(String(e.category ?? "").slice(0, 22), 110, y);
      doc.text(st, 150, y);
      doc.text(formatBRL(Number(e.amount)), 195, y, { align: "right" });
      y += 5;
    }

    doc.save(`${kind === "payable" ? "contas-a-pagar" : "contas-a-receber"}-${today()}.pdf`);
  };

  return (
    <div className="mx-auto max-w-7xl px-4 md:px-6 py-6 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-display font-bold">{label}</h1>
          <p className="text-sm text-muted-foreground">
            {kind === "payable" ? "Fornecedores, despesas e compromissos" : "Vendas, comissões e entradas"}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportCSV}>
            <Download className="h-4 w-4 mr-1.5" /> CSV
          </Button>
          <Button variant="outline" size="sm" onClick={exportPDF}>
            <FileText className="h-4 w-4 mr-1.5" /> PDF
          </Button>
          {kind === "payable" && (
            <Button variant="outline" size="sm" onClick={() => setExternoAvulso(true)}>
              <Landmark className="h-4 w-4 mr-1.5" /> Pagamento em outro banco
            </Button>
          )}
          <Button size="sm" onClick={() => { setEditing(null); setDialogOpen(true); }}>
            <Plus className="h-4 w-4 mr-1.5" /> Novo lançamento
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <button onClick={() => setFilter("pending")}
          className={`text-left rounded-2xl border p-4 transition ${filter === "pending" ? "border-brand-orange" : "border-border hover:border-brand-orange/40"} bg-card`}>
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground">
            <CalendarClock className="h-3.5 w-3.5" /> Pendente
          </div>
          <div className="mt-1 text-2xl font-bold text-brand-orange">{formatBRL(totals.pendingSum)}</div>
          <div className="text-[11px] text-muted-foreground">{totals.pendingCount} lançamentos</div>
        </button>
        <button onClick={() => setFilter("overdue")}
          className={`text-left rounded-2xl border p-4 transition ${filter === "overdue" ? "border-red-500" : "border-border hover:border-red-500/40"} bg-card`}>
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground">
            <AlertCircle className="h-3.5 w-3.5" /> Em atraso
          </div>
          <div className="mt-1 text-2xl font-bold text-red-500">{formatBRL(totals.overdueSum)}</div>
          <div className="text-[11px] text-muted-foreground">{totals.overdueCount} lançamentos</div>
        </button>
        <button onClick={() => setFilter("paid")}
          className={`text-left rounded-2xl border p-4 transition ${filter === "paid" ? "border-emerald-500" : "border-border hover:border-emerald-500/40"} bg-card`}>
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground">
            <AccentIcon className="h-3.5 w-3.5" /> {kind === "payable" ? "Pago" : "Recebido"}
          </div>
          <div className={`mt-1 text-2xl font-bold ${accent}`}>{formatBRL(totals.paidSum)}</div>
          <div className="text-[11px] text-muted-foreground">{totals.paidCount} lançamentos</div>
        </button>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border border-border p-0.5 bg-muted/30">
          {(["all", "pending", "overdue", "paid"] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-3 py-1 text-xs rounded-md transition ${
                filter === f ? "bg-brand-orange text-white font-semibold" : "text-muted-foreground hover:text-foreground"
              }`}>
              {f === "all" ? "Todos" : f === "pending" ? "Pendentes" : f === "overdue" ? "Vencidos" : "Pagos"}
            </button>
          ))}
        </div>
        <div className="relative flex-1 max-w-sm">
          <Search className="h-4 w-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar descrição, contraparte, categoria..."
            className="pl-8 h-9" />
        </div>
      </div>

      {/* List */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        {isLoading ? (
          <div className="p-10 flex items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">Nenhum lançamento.</div>
        ) : (
          <div className="divide-y divide-border">
            {filtered.map((e) => {
              const over = isOverdue(e);
              const due = e.due_date ? new Date(e.due_date + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }) : "—";
              return (
                <div key={e.id} className="grid grid-cols-[80px_1fr_auto_auto] items-center gap-3 px-4 py-3 hover:bg-muted/30 transition">
                  <div className="flex flex-col items-center">
                    <div className={`text-sm font-bold ${over ? "text-red-500" : "text-foreground"}`}>{due}</div>
                    {e.paid_date && (
                      <div className="text-[10px] text-emerald-500">
                        pago {new Date(e.paid_date + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}
                      </div>
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="font-medium truncate">{e.description}</div>
                    <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-2">
                      {e.category && <span className="px-1.5 py-0.5 rounded bg-muted">{e.category}</span>}
                      {e.counterparty && <span>{e.counterparty}</span>}
                      {e.order_id && (
                        <Link to="/admin/pedidos/$id" params={{ id: e.order_id }} className="text-brand-orange hover:underline">
                          ver pedido
                        </Link>
                      )}
                      {e.bill_payment_status && e.bill_payment_status !== "cancelado" && (
                        <span className="px-1.5 py-0.5 rounded bg-brand-orange/15 text-brand-orange text-[10px] uppercase">
                          boleto {e.bill_payment_status}
                        </span>
                      )}
                      {over && <span className="text-red-500 font-medium">Vencido</span>}
                      {e.auto_generated && <span className="text-[10px] uppercase text-muted-foreground">auto</span>}
                    </div>
                  </div>
                  <div className={`text-right font-semibold tabular-nums ${
                    e.status === "paid" ? accent : over ? "text-red-500" : ""
                  }`}>
                    {formatBRL(Number(e.amount))}
                  </div>
                  <div className="flex gap-1">
                    {e.status === "paid" && <ComprovanteEntryButton entryId={e.id} />}
                    {e.status === "paid" && externos?.get(e.id) && (
                      <ExternalReceiptButton pagamento={externos.get(e.id)!} />
                    )}
                    {kind === "payable" && e.status !== "paid" && (
                      <>
                        {(() => {
                          const m = (e.payment_method ?? "").toLowerCase();
                          const temBoleto = !!(e.boleto_line ?? "").replace(/\D+/g, "");
                          const temPix = !!(e.pix_key ?? "").trim();
                          if (!(m === "boleto" && temBoleto) && !(m === "pix" && temPix)) return null;
                          return (
                            <Button
                              size="sm"
                              className="h-8 rounded-full bg-brand-orange text-white hover:bg-brand-orange/90 px-3 text-xs font-semibold"
                              onClick={() => (m === "boleto" ? setBoletoEntry(e) : setPixEntry(e))}
                              title="Pagar agora (sem esperar o agendamento)"
                            >
                              Pagar agora
                            </Button>
                          );
                        })()}
                        <Button size="icon" variant="ghost" title="Pagar via Pix" onClick={() => setPixEntry(e)}>
                          <QrCode className="h-4 w-4 text-brand-orange" />
                        </Button>
                        <Button size="icon" variant="ghost" title="Pagar boleto via ASAAS" onClick={() => setBoletoEntry(e)}>
                          <FileText className="h-4 w-4 text-brand-orange" />
                        </Button>
                        <Button size="icon" variant="ghost" title="Baixa com comprovante de outro banco" onClick={() => setExternoEntry(e)}>
                          <Landmark className="h-4 w-4 text-brand-orange" />
                        </Button>
                      </>
                    )}


                    <Button size="icon" variant="ghost" onClick={() => toggleStatus.mutate(e)} title={e.status === "paid" ? "Marcar como pendente" : "Marcar como pago"}>
                      {e.status === "paid" ? <X className="h-4 w-4" /> : <Check className="h-4 w-4 text-emerald-500" />}
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => { setEditing(e); setDialogOpen(true); }}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => {
                      if (confirm("Excluir este lançamento?")) remove.mutate(e.id);
                    }}>
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <PixPaymentDialog
        open={!!pixEntry}
        onOpenChange={(v) => { if (!v) setPixEntry(null); }}
        initial={{
          origin: "contas_pagar",
          financialEntryId: pixEntry?.id ?? null,
          favoredName: pixEntry?.counterparty ?? "",
          value: pixEntry ? Number(pixEntry.amount) : undefined,
          description: pixEntry?.description ?? "",
          date: pixEntry?.due_date ?? null,
          supplierName: pixEntry?.counterparty ?? null,
        }}
        onDone={() => qc.invalidateQueries({ queryKey: ["financial", kind] })}
      />

      <BoletoPaymentDialog
        open={!!boletoEntry}
        onOpenChange={(v) => { if (!v) setBoletoEntry(null); }}
        entry={boletoEntry}
        onDone={() => qc.invalidateQueries({ queryKey: ["financial", kind] })}
      />

      <ExternalPaymentDialog
        open={!!externoEntry || externoAvulso}
        onOpenChange={(v) => { if (!v) { setExternoEntry(null); setExternoAvulso(false); } }}
        entry={externoEntry}
        onDone={() => {
          qc.invalidateQueries({ queryKey: ["financial", kind] });
          qc.invalidateQueries({ queryKey: ["pagamentos-externos-map"] });
        }}
      />

      <EntryDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        kind={kind}
        editing={editing}
        categories={categories ?? []}
        onSaved={() => qc.invalidateQueries({ queryKey: ["financial", kind] })}
      />
    </div>
  );
}

const METODOS = [
  { v: "pix", label: "Pix" },
  { v: "boleto", label: "Boleto" },
  { v: "cartao", label: "Cartão" },
  { v: "transferencia", label: "Transferência / TED" },
  { v: "dinheiro", label: "Dinheiro" },
  { v: "outro", label: "Outro" },
] as const;

function onlyDigits(v: string) {
  return v.replace(/\D+/g, "");
}

function EntryDialog({
  open, onOpenChange, kind, editing, categories, onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  kind: Kind;
  editing: Entry | null;
  categories: Category[];
  onSaved: () => void;
}) {
  const [form, setForm] = useState<Partial<Entry>>({});
  const [saving, setSaving] = useState(false);
  const [programar, setProgramar] = useState(false);
  const [scheduleDate, setScheduleDate] = useState<string>("");
  const [scheduleTime, setScheduleTime] = useState<string>("12:00");
  const [uploading, setUploading] = useState(false);

  const criarBoleto = useServerFn(criarPagamentoBoleto);
  const criarPix = useServerFn(criarPagamentoPix);
  const abrirAnexo = useServerFn(getBoletoDocumentUrl);

  const { data: peopleOptions } = useQuery({
    queryKey: ["financial-people-options"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("people")
        .select("id, name, cpf, cnpj")
        .order("name", { ascending: true })
        .limit(2000);
      if (error) throw error;
      return (data ?? []).map((p: { id: string; name: string; cpf: string | null; cnpj: string | null }) => ({
        id: p.id,
        name: p.name,
        document: p.cnpj ?? p.cpf ?? null,
      }));
    },
    enabled: open,
  });

  useEffect(() => {
    if (!open) return;
    setForm(
      editing ?? {
        kind,
        status: "pending",
        amount: 0,
        description: "",
        due_date: today(),
        payment_method: kind === "payable" ? "boleto" : "pix",
      },
    );
    setProgramar(false);
    setScheduleDate(editing?.due_date ?? today());
    setScheduleTime("12:00");
  }, [open, editing, kind]);

  const metodo = (form.payment_method ?? "").toLowerCase();
  const isBoleto = metodo === "boleto";
  const isPix = metodo === "pix";
  const podeProgramar =
    kind === "payable" && (form.status ?? "pending") === "pending" && (isBoleto || isPix);

  const codigoLimpo = onlyDigits(form.boleto_line ?? "");

  const uploadAnexo = async (file: File) => {
    setUploading(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "pdf";
      const path = `financeiro/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from("boleto-documents").upload(path, file, {
        contentType: file.type || undefined,
        upsert: false,
      });
      if (error) throw error;
      setForm((f) => ({ ...f, attachment_path: path, attachment_name: file.name }));
      toast.success("Fatura anexada");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const verAnexo = async () => {
    if (!form.attachment_path) return;
    try {
      const r = (await abrirAnexo({ data: { path: form.attachment_path } })) as { url: string };
      window.open(r.url, "_blank", "noopener");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const save = async () => {
    if (!form.description || !form.amount) {
      toast.error("Descrição e valor são obrigatórios");
      return;
    }
    if (programar && isBoleto && codigoLimpo.length !== 44 && codigoLimpo.length !== 47) {
      toast.error("Informe o código de barras (44) ou a linha digitável (47) do boleto.");
      return;
    }
    if (programar && isPix && (form.pix_key ?? "").trim().length < 3) {
      toast.error("Informe a chave Pix do fornecedor.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        kind,
        description: form.description,
        category: form.category ?? null,
        amount: Number(form.amount),
        due_date: form.due_date ?? null,
        paid_date: form.status === "paid" ? (form.paid_date ?? today()) : null,
        status: form.status ?? "pending",
        counterparty: form.counterparty ?? null,
        payment_method: form.payment_method ?? null,
        notes: form.notes ?? null,
        boleto_line: isBoleto ? (codigoLimpo || null) : null,
        boleto_beneficiary: form.boleto_beneficiary ?? form.counterparty ?? null,
        pix_key: isPix ? (form.pix_key ?? null) : null,
        attachment_path: form.attachment_path ?? null,
        attachment_name: form.attachment_name ?? null,
      };

      let entryId = editing?.id ?? null;
      if (editing) {
        const { error } = await supabase.from("financial_entries").update(payload).eq("id", editing.id);
        if (error) throw error;
        toast.success("Lançamento atualizado");
      } else {
        const { data, error } = await supabase
          .from("financial_entries")
          .insert(payload)
          .select("id")
          .single();
        if (error) throw error;
        entryId = (data as { id: string }).id;
        toast.success("Lançamento criado");
      }

      if (programar && podeProgramar) {
        const quando = scheduleDate || form.due_date || today();
        if (isBoleto) {
          const r = (await criarBoleto({
            data: {
              financialEntryId: entryId,
              identificationField: codigoLimpo,
              value: Number(form.amount),
              dueDate: form.due_date ?? null,
              scheduleDate: quando,
              scheduleTime,
              description: form.description,
              beneficiaryName: form.boleto_beneficiary ?? form.counterparty ?? null,
              boletoPath: form.attachment_path ?? null,
              clientRequestId: crypto.randomUUID(),
              confirmado: true as const,
            },
          })) as { ok?: boolean; erro?: { mensagem?: string } };
          if (r?.ok === false) throw new Error(r.erro?.mensagem ?? "Não foi possível agendar o boleto.");
          toast.success(`Boleto agendado para ${quando.split("-").reverse().join("/")} às ${scheduleTime}`);
        } else {
          await criarPix({
            data: {
              idempotencyKey: `entry-${entryId}-${quando}-${scheduleTime}`,
              favoredName: form.counterparty ?? null,
              pixKey: (form.pix_key ?? "").trim(),
              value: Number(form.amount),
              description: form.description,
              scheduleDate: quando,
              scheduleTime,
              origin: "contas_pagar" as const,
              financialEntryId: entryId,
            },
          });
          toast.success(`Pix agendado para ${quando.split("-").reverse().join("/")} às ${scheduleTime}`);
        }
      }

      onSaved();
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-xl max-h-[90vh] overflow-y-auto rounded-3xl border-white/10 bg-background/60 backdrop-blur-2xl"
        overlayClassName="bg-background/70 backdrop-blur-xl"
      >
        <DialogHeader>
          <DialogTitle>{editing ? "Editar lançamento" : "Novo lançamento"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Descrição *</Label>
            <Input value={form.description ?? ""} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Valor *</Label>
              <Input type="number" step="0.01" value={form.amount ?? ""} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} />
            </div>
            <div>
              <Label>Vencimento</Label>
              <Input
                type="date"
                value={form.due_date ?? ""}
                onChange={(e) => {
                  setForm({ ...form, due_date: e.target.value });
                  setScheduleDate(e.target.value);
                }}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Categoria</Label>
              <Select value={form.category ?? ""} onValueChange={(v) => setForm({ ...form, category: v })}>
                <SelectTrigger><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                <SelectContent>
                  {categories.map((c) => <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{kind === "payable" ? "Fornecedor" : "Cliente"}</Label>
              <Input
                list="financial-people-list"
                value={form.counterparty ?? ""}
                onChange={(e) => setForm({ ...form, counterparty: e.target.value })}
                placeholder="Digite para buscar cadastrados..."
              />
              <datalist id="financial-people-list">
                {(peopleOptions ?? []).map((p) => (
                  <option key={p.id} value={p.name}>{p.document ?? ""}</option>
                ))}
              </datalist>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Status</Label>
              <Select value={form.status ?? "pending"} onValueChange={(v) => setForm({ ...form, status: v as Entry["status"] })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pendente</SelectItem>
                  <SelectItem value="paid">{kind === "payable" ? "Pago" : "Recebido"}</SelectItem>
                  <SelectItem value="canceled">Cancelado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Forma de pagamento</Label>
              <Select
                value={metodo || undefined}
                onValueChange={(v) => setForm({ ...form, payment_method: v })}
              >
                <SelectTrigger><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                <SelectContent>
                  {METODOS.map((m) => <SelectItem key={m.v} value={m.v}>{m.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {isBoleto && (
            <div className="rounded-2xl border border-white/10 bg-muted/20 p-3 space-y-3">
              <div>
                <Label>Código de barras ou linha digitável</Label>
                <Input
                  value={form.boleto_line ?? ""}
                  onChange={(e) => setForm({ ...form, boleto_line: e.target.value })}
                  onPaste={(ev) => {
                    ev.preventDefault();
                    const txt = ev.clipboardData.getData("text");
                    setForm((f) => ({ ...f, boleto_line: onlyDigits(txt) }));
                  }}
                  placeholder="Cole com pontos ou espaços — limpamos automaticamente"
                  className="font-mono text-sm"
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  {codigoLimpo.length > 0
                    ? `${codigoLimpo.length} dígitos ${codigoLimpo.length === 44 ? "(código de barras)" : codigoLimpo.length === 47 ? "(linha digitável)" : "— esperado 44 ou 47"}`
                    : "Aceita 44 (código de barras) ou 47 dígitos (linha digitável)."}
                </p>
              </div>
              <div>
                <Label>Beneficiário</Label>
                <Input
                  value={form.boleto_beneficiary ?? ""}
                  onChange={(e) => setForm({ ...form, boleto_beneficiary: e.target.value })}
                  placeholder="Quem recebe o boleto"
                />
              </div>
            </div>
          )}

          {isPix && (
            <div className="rounded-2xl border border-white/10 bg-muted/20 p-3">
              <Label>Chave Pix do fornecedor</Label>
              <Input
                value={form.pix_key ?? ""}
                onChange={(e) => setForm({ ...form, pix_key: e.target.value })}
                placeholder="CPF/CNPJ, e-mail, telefone ou aleatória"
              />
            </div>
          )}

          {podeProgramar && (
            <div className="rounded-2xl border border-primary/30 bg-primary/5 p-3 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold">Deseja programar o pagamento?</div>
                  <div className="text-[11px] text-muted-foreground">
                    Agendamos automaticamente para a data de vencimento.
                  </div>
                </div>
                <div className="inline-flex rounded-lg border border-border p-0.5 bg-muted/30">
                  {[
                    { v: true, label: "Sim" },
                    { v: false, label: "Não" },
                  ].map((o) => (
                    <button
                      key={String(o.v)}
                      type="button"
                      onClick={() => setProgramar(o.v)}
                      className={`px-3 py-1 text-xs rounded-md transition ${
                        programar === o.v ? "bg-brand-orange text-white font-semibold" : "text-muted-foreground"
                      }`}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>
              {programar && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Data do agendamento</Label>
                    <Input type="date" value={scheduleDate} onChange={(e) => setScheduleDate(e.target.value)} />
                  </div>
                  <div>
                    <Label>Hora</Label>
                    <Input type="time" value={scheduleTime} onChange={(e) => setScheduleTime(e.target.value)} />
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="rounded-2xl border border-white/10 bg-muted/20 p-3">
            <Label>Fatura / documento</Label>
            <div className="flex items-center gap-2 mt-1">
              <Input
                type="file"
                accept="application/pdf,image/*"
                disabled={uploading}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void uploadAnexo(f);
                }}
                className="text-xs"
              />
              {uploading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            </div>
            {form.attachment_path && (
              <button
                type="button"
                onClick={verAnexo}
                className="mt-2 inline-flex items-center gap-1.5 text-xs text-brand-orange hover:underline"
              >
                <FileText className="h-3.5 w-3.5" />
                {form.attachment_name ?? "Abrir arquivo"}
              </button>
            )}
          </div>

          {form.status === "paid" && (
            <div>
              <Label>Data do pagamento</Label>
              <Input type="date" value={form.paid_date ?? today()} onChange={(e) => setForm({ ...form, paid_date: e.target.value })} />
            </div>
          )}
          <div>
            <Label>Observações</Label>
            <Textarea rows={2} value={form.notes ?? ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={save} disabled={saving || uploading}>
            {saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            {programar ? "Salvar e agendar" : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
