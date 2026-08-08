import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Barcode, Copy, Loader2, Plus, QrCode, RefreshCw, Search, Ban, ExternalLink,
  AlertTriangle, CalendarClock, CheckCircle2, Wallet,
} from "lucide-react";

import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  listarRecebimentos, criarRecebimento, sincronizarRecebimento, cancelarRecebimento,
} from "@/lib/recebimentos.functions";
import { confirmThen } from "@/lib/confirm";
import { ComprovanteActions } from "@/components/financial/ComprovanteActions";


export const Route = createFileRoute("/admin/recebimentos")({
  head: () => ({
    meta: [
      { title: "Recebimentos Pix e boleto | VIA AIR" },
      {
        name: "description",
        content: "Gere cobranças Pix com QR Code e boletos bancários avulsos pela conta VIA AIR.",
      },
      { property: "og:title", content: "Recebimentos Pix e boleto | VIA AIR" },
      {
        property: "og:description",
        content: "Cobranças Pix e boletos avulsos gerados direto no sistema.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RecebimentosPage,
});

const STATUS_META: Record<string, { label: string; cls: string }> = {
  pendente: { label: "Pendente", cls: "bg-amber-500/15 text-amber-400" },
  recebido: { label: "Recebido", cls: "bg-emerald-500/15 text-emerald-400" },
  vencido: { label: "Vencido", cls: "bg-orange-500/15 text-orange-400" },
  cancelado: { label: "Cancelado", cls: "bg-muted text-muted-foreground" },
  estornado: { label: "Estornado", cls: "bg-rose-500/15 text-rose-400" },
};

function formatBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function StatCard({
  label, qtd, total, tone, icon,
}: {
  label: string;
  qtd: number;
  total: number;
  tone: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card/60 backdrop-blur-xl p-4">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="uppercase tracking-wider">{label}</span>
        <span className={tone}>{icon}</span>
      </div>
      <p className={`mt-2 text-xl font-bold tabular-nums ${tone}`}>{formatBRL(total)}</p>
      <p className="text-xs text-muted-foreground mt-0.5">
        {qtd} {qtd === 1 ? "cobrança" : "cobranças"}
      </p>
    </div>
  );
}



function RecebimentosPage() {
  const qc = useQueryClient();
  const listar = useServerFn(listarRecebimentos);
  const sincronizar = useServerFn(sincronizarRecebimento);
  const cancelar = useServerFn(cancelarRecebimento);

  const [novoOpen, setNovoOpen] = useState(false);
  const [novoKind, setNovoKind] = useState<"pix" | "boleto">("pix");
  const [busca, setBusca] = useState("");
  const [detalhe, setDetalhe] = useState<any | null>(null);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["asaas-recebimentos"],
    queryFn: async () => (await listar({ data: {} })) as any[],
  });

  const filtered = useMemo(() => {
    const rows = data ?? [];
    const q = busca.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.customer_name, r.customer_cpf_cnpj, r.description]
        .filter(Boolean)
        .some((v: string) => String(v).toLowerCase().includes(q)),
    );
  }, [data, busca]);

  async function doSync(id: string) {
    try {
      await sincronizar({ data: { id } });
      qc.invalidateQueries({ queryKey: ["asaas-recebimentos"] });
      toast.success("Status atualizado.");
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao sincronizar.");
    }
  }

  function doCancel(id: string) {
    confirmThen(
      {
        title: "Cancelar cobrança?",
        description: "A cobrança será removida no banco e não poderá mais ser paga.",
        confirmText: "Cancelar cobrança",
      },
      async () => {
        try {
          await cancelar({ data: { id } });
          qc.invalidateQueries({ queryKey: ["asaas-recebimentos"] });
          toast.success("Cobrança cancelada.");
        } catch (e: any) {
          toast.error(e?.message ?? "Falha ao cancelar.");
        }
      },
    );
  }

  const stats = useMemo(() => {
    const rows = data ?? [];
    const hoje = new Date().toISOString().slice(0, 10);
    const sum = (list: any[]) => list.reduce((s, r) => s + Number(r.value || 0), 0);
    const pendentes = rows.filter((r) => r.status === "pendente");
    const atrasados = rows.filter(
      (r) => r.status === "vencido" || (r.status === "pendente" && r.due_date && r.due_date < hoje),
    );
    const aVencer = pendentes.filter((r) => !r.due_date || r.due_date >= hoje);
    const mes = hoje.slice(0, 7);
    const recebidos = rows.filter(
      (r) => r.status === "recebido" && String(r.paid_at ?? r.created_at ?? "").slice(0, 7) === mes,
    );
    return {
      atrasados: { qtd: atrasados.length, total: sum(atrasados) },
      aVencer: { qtd: aVencer.length, total: sum(aVencer) },
      recebidos: { qtd: recebidos.length, total: sum(recebidos) },
      geral: { qtd: rows.length, total: sum(rows) },
    };
  }, [data]);

  return (
    <div className="mx-auto max-w-7xl px-4 md:px-6 py-6 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Recebimentos</h1>
          <p className="text-sm text-muted-foreground">
            Cobranças Pix com QR Code e boletos bancários gerados na conta VIA AIR.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`h-4 w-4 mr-1.5 ${isFetching ? "animate-spin" : ""}`} /> Atualizar
          </Button>
          <Button
            size="sm"
            className="bg-brand-orange text-white hover:bg-brand-orange/90"
            onClick={() => { setNovoKind("boleto"); setNovoOpen(true); }}
          >
            <Barcode className="h-4 w-4 mr-1.5" /> Novo boleto
          </Button>
          <Button
            size="sm"
            className="bg-emerald-600 text-white hover:bg-emerald-600/90"
            onClick={() => { setNovoKind("pix"); setNovoOpen(true); }}
          >
            <Plus className="h-4 w-4 mr-1.5" /> Nova cobrança Pix
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Atrasados"
          qtd={stats.atrasados.qtd}
          total={stats.atrasados.total}
          tone="text-rose-400"
          icon={<AlertTriangle className="h-4 w-4" />}
        />
        <StatCard
          label="A vencer"
          qtd={stats.aVencer.qtd}
          total={stats.aVencer.total}
          tone="text-amber-400"
          icon={<CalendarClock className="h-4 w-4" />}
        />
        <StatCard
          label="Recebido no mês"
          qtd={stats.recebidos.qtd}
          total={stats.recebidos.total}
          tone="text-emerald-400"
          icon={<CheckCircle2 className="h-4 w-4" />}
        />
        <StatCard
          label="Total emitido"
          qtd={stats.geral.qtd}
          total={stats.geral.total}
          tone="text-foreground"
          icon={<Wallet className="h-4 w-4" />}
        />
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar cliente, CPF/CNPJ, descrição..."
          className="pl-9"
        />
      </div>


      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        {isLoading ? (
          <div className="p-10 flex justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            Nenhuma cobrança gerada ainda.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filtered.map((r) => {
              const meta = STATUS_META[r.status] ?? { label: r.status, cls: "bg-muted" };
              return (
                <div key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-muted/30">
                  <span className="rounded-full bg-muted/40 p-2">
                    {r.kind === "pix" ? <QrCode className="h-4 w-4" /> : <Barcode className="h-4 w-4" />}
                  </span>
                  <button onClick={() => setDetalhe(r)} className="min-w-0 flex-1 text-left">
                    <div className="font-medium truncate">{r.customer_name}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {r.kind === "pix" ? "Pix" : "Boleto"}
                      {r.due_date ? ` · vence ${new Date(`${r.due_date}T12:00:00`).toLocaleDateString("pt-BR")}` : ""}
                      {r.description ? ` · ${r.description}` : ""}
                    </div>
                  </button>
                  <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${meta.cls}`}>
                    {meta.label}
                  </span>
                  <span className="font-semibold tabular-nums w-28 text-right">
                    {formatBRL(Number(r.value))}
                  </span>
                  <div className="flex gap-1">
                    <Button
                      size="icon"
                      variant="outline"
                      title="Ver cobrança"
                      className="rounded-full h-9 w-9 border-border/60"
                      onClick={() => setDetalhe(r)}
                    >
                      {r.kind === "pix" ? <QrCode className="h-4 w-4" /> : <Barcode className="h-4 w-4" />}
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="rounded-full h-9 w-9"
                      title="Sincronizar status"
                      onClick={() => doSync(r.id)}
                    >
                      <RefreshCw className="h-4 w-4" />
                    </Button>
                    {["recebido", "estornado"].includes(r.status) && r.asaas_payment_id && (
                      <ComprovanteActions paymentId={r.asaas_payment_id} />
                    )}
                    {!["recebido", "cancelado"].includes(r.status) && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="rounded-full h-9 w-9"
                        title="Cancelar cobrança"
                        onClick={() => doCancel(r.id)}
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

      <NovoRecebimentoDialog
        open={novoOpen}
        kind={novoKind}
        onKindChange={setNovoKind}
        onOpenChange={setNovoOpen}
        onCreated={(row) => {
          qc.invalidateQueries({ queryKey: ["asaas-recebimentos"] });
          setDetalhe(row);
        }}
      />
      <CobrancaDialog row={detalhe} onClose={() => setDetalhe(null)} />
    </div>
  );
}

function NovoRecebimentoDialog({
  open, kind, onKindChange, onOpenChange, onCreated,
}: {
  open: boolean;
  kind: "pix" | "boleto";
  onKindChange: (k: "pix" | "boleto") => void;
  onOpenChange: (v: boolean) => void;
  onCreated: (row: any) => void;
}) {
  const criar = useServerFn(criarRecebimento);
  const buscarPessoas = useServerFn(searchPeople);
  const hoje = new Date().toISOString().slice(0, 10);
  const emptyForm = {
    customerName: "", cpfCnpj: "", email: "", phone: "", value: "", dueDate: hoje, description: "",
    finePercent: "2", interestPercent: "1",
    servico: "", destino: "", periodoInicio: "", periodoFim: "", passageiros: "",
  };
  const [form, setForm] = useState(emptyForm);
  const [personId, setPersonId] = useState<string | null>(null);
  const [sugestoesOpen, setSugestoesOpen] = useState(false);

  const { data: sugestoes = [] } = useQuery({
    queryKey: ["people-autocomplete", form.customerName],
    enabled: open && sugestoesOpen && form.customerName.trim().length >= 2,
    queryFn: async () => (await buscarPessoas({ data: { q: form.customerName.trim() } })) as any[],
  });

  const num = (v: string) => {
    const n = Number(String(v).replace(/\./g, "").replace(",", "."));
    return Number.isFinite(n) ? n : null;
  };

  const mut = useMutation({
    mutationFn: async () =>
      await criar({
        data: {
          kind,
          customerName: form.customerName.trim(),
          cpfCnpj: form.cpfCnpj,
          email: form.email || undefined,
          phone: form.phone || undefined,
          value: Number(String(form.value).replace(/\./g, "").replace(",", ".")),
          dueDate: form.dueDate,
          description: form.description || undefined,
          personId,
          finePercent: num(form.finePercent),
          interestPercent: num(form.interestPercent),
          composicao: {
            servico: form.servico,
            destino: form.destino,
            periodoInicio: form.periodoInicio,
            periodoFim: form.periodoFim,
            passageiros: form.passageiros
              .split(/[\n,;]+/)
              .map((p) => p.trim())
              .filter(Boolean),
          },
        },
      }),
    onSuccess: (row) => {
      toast.success(kind === "pix" ? "QR Code gerado." : "Boleto gerado.");
      onOpenChange(false);
      setForm(emptyForm);
      setPersonId(null);
      onCreated(row);
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao gerar cobrança."),
  });

  const set = (k: string) => (e: any) => setForm((f) => ({ ...f, [k]: e.target.value }));

  function escolherPessoa(p: any) {
    setPersonId(p.id);
    setSugestoesOpen(false);
    setForm((f) => ({
      ...f,
      customerName: p.name ?? f.customerName,
      cpfCnpj: p.cpf || p.cnpj || f.cpfCnpj,
      email: p.email || f.email,
      phone: p.mobile_phone || p.phone || f.phone,
    }));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[560px] max-h-[90vh] overflow-y-auto bg-card/80 backdrop-blur-xl border-border/60 rounded-2xl">
        <DialogHeader>
          <DialogTitle>Nova cobrança</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-2">
          {(["pix", "boleto"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => onKindChange(k)}
              className={`flex items-center gap-2 rounded-xl border p-3 text-sm font-medium transition ${
                kind === k
                  ? "border-brand-orange bg-brand-orange/10 text-foreground"
                  : "border-border/60 text-muted-foreground hover:bg-muted/30"
              }`}
            >
              {k === "pix" ? <QrCode className="h-4 w-4" /> : <Barcode className="h-4 w-4" />}
              {k === "pix" ? "Pix / QR Code" : "Boleto bancário"}
            </button>
          ))}
        </div>

        <div className="space-y-3">
          <div className="relative">
            <Label>Nome do pagador</Label>
            <Input
              value={form.customerName}
              onChange={(e) => {
                setPersonId(null);
                setSugestoesOpen(true);
                setForm((f) => ({ ...f, customerName: e.target.value }));
              }}
              onFocus={() => setSugestoesOpen(true)}
              onBlur={() => setTimeout(() => setSugestoesOpen(false), 150)}
              placeholder="Digite para buscar no cadastro de pessoas"
              autoComplete="off"
            />
            {sugestoesOpen && sugestoes.length > 0 && (
              <div className="absolute z-50 mt-1 w-full max-h-56 overflow-y-auto rounded-xl border border-border/60 bg-popover shadow-xl">
                {sugestoes.map((p: any) => (
                  <button
                    key={p.id}
                    type="button"
                    className="w-full px-3 py-2 text-left hover:bg-muted/50"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => escolherPessoa(p)}
                  >
                    <div className="text-sm font-medium truncate">{p.name}</div>
                    <div className="text-[11px] text-muted-foreground truncate">
                      {[p.cpf || p.cnpj, p.email].filter(Boolean).join(" · ")}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>CPF/CNPJ</Label>
              <Input value={form.cpfCnpj} onChange={set("cpfCnpj")} placeholder="000.000.000-00" />
            </div>
            <div>
              <Label>Valor (R$)</Label>
              <Input value={form.value} onChange={set("value")} inputMode="decimal" placeholder="0,00" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>E-mail (opcional)</Label>
              <Input value={form.email} onChange={set("email")} placeholder="cliente@email.com" />
            </div>
            <div>
              <Label>Vencimento</Label>
              <Input type="date" value={form.dueDate} onChange={set("dueDate")} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Multa por atraso (%)</Label>
              <Input value={form.finePercent} onChange={set("finePercent")} inputMode="decimal" placeholder="2" />
            </div>
            <div>
              <Label>Juros ao mês (%)</Label>
              <Input value={form.interestPercent} onChange={set("interestPercent")} inputMode="decimal" placeholder="1" />
            </div>
          </div>

          <div className="rounded-xl border border-border/60 bg-muted/10 p-3 space-y-3">
            <p className="text-[11px] uppercase tracking-widest text-muted-foreground">
              Composição da cobrança
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Serviço</Label>
                <Input value={form.servico} onChange={set("servico")} placeholder="Pacote, aéreo, hotel..." />
              </div>
              <div>
                <Label>Destino</Label>
                <Input value={form.destino} onChange={set("destino")} placeholder="Ex.: Orlando" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Período — início</Label>
                <Input type="date" value={form.periodoInicio} onChange={set("periodoInicio")} />
              </div>
              <div>
                <Label>Período — fim</Label>
                <Input type="date" value={form.periodoFim} onChange={set("periodoFim")} />
              </div>
            </div>
            <div>
              <Label>Passageiros</Label>
              <Textarea
                value={form.passageiros}
                onChange={set("passageiros")}
                rows={2}
                placeholder="Um por linha ou separados por vírgula"
              />
            </div>
          </div>

          <div>
            <Label>Descrição (opcional)</Label>
            <Textarea value={form.description} onChange={set("description")} rows={2} />
          </div>
        </div>

        <Button
          className="w-full"
          disabled={mut.isPending || !form.customerName || !form.cpfCnpj || !form.value}
          onClick={() => mut.mutate()}
        >
          {mut.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
          {kind === "pix" ? "Gerar QR Code" : "Gerar boleto"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}


function CobrancaDialog({ row, onClose }: { row: any | null; onClose: () => void }) {
  function copy(text: string, msg: string) {
    navigator.clipboard.writeText(text);
    toast.success(msg);
  }
  return (
    <Dialog open={!!row} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-[440px] bg-card/80 backdrop-blur-xl border-border/60 rounded-2xl">
        <DialogHeader>
          <DialogTitle>{row?.kind === "pix" ? "Cobrança Pix" : "Boleto bancário"}</DialogTitle>
        </DialogHeader>
        {row && (
          <div className="space-y-4">
            <div className="text-center">
              <p className="text-sm text-muted-foreground">{row.customer_name}</p>
              <p className="text-2xl font-bold text-brand-orange">{formatBRL(Number(row.value))}</p>
            </div>

            {row.pix_qr_image && (
              <div className="space-y-2">
                <img
                  src={row.pix_qr_image}
                  alt="QR Code Pix da cobrança"
                  className="mx-auto h-52 w-52 rounded-xl bg-white p-2"
                />
                {row.kind === "boleto" && (
                  <p className="text-center text-[11px] text-muted-foreground">
                    Boleto híbrido: pode ser pago pelo QR Code Pix ou pela linha digitável.
                  </p>
                )}
              </div>
            )}

            {row.pix_payload && (
              <Button variant="outline" className="w-full" onClick={() => copy(row.pix_payload, "Código Pix copiado.")}>
                <Copy className="h-4 w-4 mr-2" /> Copiar código Pix
              </Button>
            )}


            {row.kind === "boleto" && row.identification_field && (
              <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Linha digitável</p>
                <p className="font-mono text-xs break-all mt-1">{row.identification_field}</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2 w-full"
                  onClick={() => copy(row.identification_field, "Linha digitável copiada.")}
                >
                  <Copy className="h-4 w-4 mr-2" /> Copiar linha digitável
                </Button>
              </div>
            )}

            {(row.bank_slip_url || row.invoice_url) && (
              <Button
                className="w-full"
                onClick={() => window.open(row.bank_slip_url || row.invoice_url, "_blank", "noopener,noreferrer")}
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                {row.kind === "boleto" ? "Abrir boleto (PDF)" : "Abrir fatura"}
              </Button>
            )}

            {row.invoice_url && (
              <Button
                variant="ghost"
                className="w-full"
                onClick={() => copy(row.invoice_url, "Link da cobrança copiado — envie ao cliente.")}
              >
                <Copy className="h-4 w-4 mr-2" /> Copiar link para o cliente
              </Button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
