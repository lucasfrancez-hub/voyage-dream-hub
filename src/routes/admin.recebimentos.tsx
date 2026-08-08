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
import { searchPeople } from "@/lib/people.functions";
import { confirmThen } from "@/lib/confirm";
import { abrirBoletoHtml } from "@/lib/boleto-html";

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
      <CobrancaDialog
        row={detalhe}
        onClose={() => setDetalhe(null)}
        onUpdated={(row) => {
          setDetalhe(row);
          qc.invalidateQueries({ queryKey: ["asaas-recebimentos"] });
        }}
      />

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
    cep: "", logradouro: "", numero: "", complemento: "", bairro: "", cidade: "", estado: "",
    servico: "", destino: "", periodoInicio: "", periodoFim: "", passageiros: "",
  };
  const [form, setForm] = useState(emptyForm);
  const [personId, setPersonId] = useState<string | null>(null);
  const [sugestoesOpen, setSugestoesOpen] = useState(false);
  const [buscandoCep, setBuscandoCep] = useState(false);

  async function buscarCep(valor: string) {
    const cep = valor.replace(/\D/g, "");
    if (cep.length !== 8) return;
    setBuscandoCep(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const j = await res.json();
      if (j?.erro) {
        toast.error("CEP não encontrado.");
        return;
      }
      setForm((f) => ({
        ...f,
        logradouro: j.logradouro || f.logradouro,
        bairro: j.bairro || f.bairro,
        cidade: j.localidade || f.cidade,
        estado: j.uf || f.estado,
      }));
    } catch {
      toast.error("Não foi possível consultar o CEP.");
    } finally {
      setBuscandoCep(false);
    }
  }

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
          endereco: {
            cep: form.cep,
            logradouro: form.logradouro,
            numero: form.numero,
            complemento: form.complemento,
            bairro: form.bairro,
            cidade: form.cidade,
            estado: form.estado,
          },
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
      cep: p.zip || f.cep,
      logradouro: p.address || f.logradouro,
      numero: p.number || f.numero,
      complemento: p.complement || f.complemento,
      bairro: p.district || f.bairro,
      cidade: p.city || f.cidade,
      estado: p.state || f.estado,
    }));
  }

  const fieldCls =
    "bg-foreground/[0.04] border-border/50 rounded-xl h-11 px-4 text-sm transition-all focus-visible:border-brand-orange/50 focus-visible:ring-4 focus-visible:ring-brand-orange/10";
  const subFieldCls =
    "bg-background/40 border-border/40 rounded-lg h-9 px-3 text-xs transition-all focus-visible:border-brand-orange/40 focus-visible:ring-2 focus-visible:ring-brand-orange/10";
  const labelCls = "text-xs font-medium text-muted-foreground ml-1";
  const microLabelCls = "text-[10px] font-medium uppercase tracking-wide text-muted-foreground/80";

  const SectionTitle = ({ children }: { children: React.ReactNode }) => (
    <div className="flex items-center gap-2 text-brand-orange/90">
      <span className="h-1 w-4 rounded-full bg-brand-orange" />
      <span className="text-xs font-bold uppercase tracking-widest">{children}</span>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[680px] max-h-[90vh] p-0 gap-0 overflow-hidden flex flex-col bg-card/85 backdrop-blur-2xl border-border/50 rounded-3xl shadow-2xl">
        <DialogHeader className="shrink-0 border-b border-border/40 bg-foreground/[0.02] px-6 py-5">
          <DialogTitle className="text-xl font-semibold tracking-tight">Nova cobrança</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-8">
          {/* Tipo de cobrança */}
          <div className="flex gap-1 rounded-xl border border-border/40 bg-background/50 p-1">
            {(["pix", "boleto"] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => onKindChange(k)}
                className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm transition-all duration-200 ${
                  kind === k
                    ? "bg-brand-orange text-primary-foreground font-semibold shadow-[0_0_20px_-5px_color-mix(in_oklab,var(--brand-orange)_60%,transparent)]"
                    : "bg-foreground/[0.03] text-muted-foreground hover:text-foreground font-medium"
                }`}
              >
                {k === "pix" ? <QrCode className="h-4 w-4" /> : <Barcode className="h-4 w-4" />}
                {k === "pix" ? "Pix / QR Code" : "Boleto bancário"}
              </button>
            ))}
          </div>

          {/* Dados do pagador */}
          <div className="space-y-4">
            <SectionTitle>Dados do pagador</SectionTitle>

            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-1.5 relative">
                <Label className={labelCls}>Nome do pagador</Label>
                <Input
                  className={fieldCls}
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

              <div className="space-y-1.5">
                <Label className={labelCls}>CPF / CNPJ</Label>
                <Input className={fieldCls} value={form.cpfCnpj} onChange={set("cpfCnpj")} placeholder="000.000.000-00" />
              </div>
              <div className="space-y-1.5">
                <Label className={labelCls}>Telefone</Label>
                <Input className={fieldCls} value={form.phone} onChange={set("phone")} inputMode="tel" placeholder="(44) 99999-0000" />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label className={labelCls}>
                  E-mail <span className="font-normal text-muted-foreground/70">(opcional)</span>
                </Label>
                <Input className={fieldCls} value={form.email} onChange={set("email")} placeholder="cliente@email.com" />
              </div>
            </div>

            {/* Endereço */}
            <div className="space-y-4 rounded-2xl border border-border/40 bg-foreground/[0.02] p-5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Endereço de cobrança
                </span>
                <span className="rounded bg-foreground/[0.06] px-2 py-0.5 text-[10px] text-muted-foreground">
                  {buscandoCep ? "Buscando CEP..." : "Auto-preenchimento via CEP"}
                </span>
              </div>
              <div className="grid grid-cols-6 gap-3">
                <div className="col-span-2 space-y-1">
                  <Label className={microLabelCls}>CEP</Label>
                  <Input
                    className={subFieldCls}
                    value={form.cep}
                    onChange={(e) => {
                      const v = e.target.value;
                      setForm((f) => ({ ...f, cep: v }));
                      if (v.replace(/\D/g, "").length === 8) void buscarCep(v);
                    }}
                    onBlur={(e) => void buscarCep(e.target.value)}
                    inputMode="numeric"
                    placeholder="87700-000"
                  />
                </div>
                <div className="col-span-3 space-y-1">
                  <Label className={microLabelCls}>Rua</Label>
                  <Input className={subFieldCls} value={form.logradouro} onChange={set("logradouro")} placeholder="Logradouro" />
                </div>
                <div className="col-span-1 space-y-1">
                  <Label className={microLabelCls}>Nº</Label>
                  <Input className={subFieldCls} value={form.numero} onChange={set("numero")} placeholder="123" />
                </div>
                <div className="col-span-3 space-y-1">
                  <Label className={microLabelCls}>Complemento</Label>
                  <Input className={subFieldCls} value={form.complemento} onChange={set("complemento")} placeholder="Apto 12" />
                </div>
                <div className="col-span-3 space-y-1">
                  <Label className={microLabelCls}>Bairro</Label>
                  <Input className={subFieldCls} value={form.bairro} onChange={set("bairro")} placeholder="Centro" />
                </div>
                <div className="col-span-4 space-y-1">
                  <Label className={microLabelCls}>Cidade</Label>
                  <Input className={subFieldCls} value={form.cidade} onChange={set("cidade")} placeholder="Paranavaí" />
                </div>
                <div className="col-span-2 space-y-1">
                  <Label className={microLabelCls}>UF</Label>
                  <Input className={`${subFieldCls} text-center`} value={form.estado} onChange={set("estado")} maxLength={2} placeholder="PR" />
                </div>
              </div>
            </div>
          </div>

          {/* Valores e prazos */}
          <div className="space-y-4">
            <SectionTitle>Valores e prazos</SectionTitle>
            <div className="grid grid-cols-4 gap-4">
              <div className="col-span-2 space-y-1.5">
                <Label className={labelCls}>Valor da cobrança</Label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm font-medium text-muted-foreground">
                    R$
                  </span>
                  <Input
                    className={`${fieldCls} pl-10 text-lg font-semibold`}
                    value={form.value}
                    onChange={set("value")}
                    inputMode="decimal"
                    placeholder="0,00"
                  />
                </div>
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label className={labelCls}>Vencimento</Label>
                <Input className={fieldCls} type="date" value={form.dueDate} onChange={set("dueDate")} />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label className={labelCls}>
                  Multa por atraso (%) <span className="font-normal text-muted-foreground/70">(opcional)</span>
                </Label>
                <Input className={fieldCls} value={form.finePercent} onChange={set("finePercent")} inputMode="decimal" placeholder="2" />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label className={labelCls}>
                  Juros ao mês (%) <span className="font-normal text-muted-foreground/70">(opcional)</span>
                </Label>
                <Input className={fieldCls} value={form.interestPercent} onChange={set("interestPercent")} inputMode="decimal" placeholder="1" />
              </div>
            </div>
          </div>

          {/* Composição */}
          <div className="space-y-4 rounded-2xl border border-brand-orange/10 bg-brand-orange/[0.03] p-5">
            <span className="text-xs font-bold uppercase tracking-widest text-foreground/80">
              Composição da cobrança
            </span>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className={microLabelCls}>Serviço</Label>
                <Input className={`${subFieldCls} h-10 text-sm`} value={form.servico} onChange={set("servico")} placeholder="Pacote, aéreo, hotel..." />
              </div>
              <div className="space-y-1.5">
                <Label className={microLabelCls}>Destino</Label>
                <Input className={`${subFieldCls} h-10 text-sm`} value={form.destino} onChange={set("destino")} placeholder="Ex.: Orlando" />
              </div>
              <div className="space-y-1.5">
                <Label className={microLabelCls}>Período — início</Label>
                <Input className={`${subFieldCls} h-10 text-sm`} type="date" value={form.periodoInicio} onChange={set("periodoInicio")} />
              </div>
              <div className="space-y-1.5">
                <Label className={microLabelCls}>Período — fim</Label>
                <Input className={`${subFieldCls} h-10 text-sm`} type="date" value={form.periodoFim} onChange={set("periodoFim")} />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label className={microLabelCls}>Passageiros</Label>
                <Textarea
                  className="bg-background/40 border-border/40 rounded-xl text-sm resize-none focus-visible:border-brand-orange/40"
                  value={form.passageiros}
                  onChange={set("passageiros")}
                  rows={2}
                  placeholder="Um por linha ou separados por vírgula"
                />
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className={labelCls}>
              Descrição <span className="font-normal text-muted-foreground/70">(opcional)</span>
            </Label>
            <Textarea
              className="bg-foreground/[0.04] border-border/50 rounded-xl text-sm resize-none focus-visible:border-brand-orange/50"
              value={form.description}
              onChange={set("description")}
              rows={3}
            />
          </div>
        </div>

        <div className="shrink-0 flex gap-3 border-t border-border/40 bg-background/30 px-6 py-5">
          <Button
            variant="outline"
            className="flex-1 h-12 rounded-xl"
            disabled={!form.customerName || !form.value}
            onClick={() => {
              const fmt = (d: string) =>
                d ? new Date(`${d}T12:00:00`).toLocaleDateString("pt-BR") : "";
              const periodo = [fmt(form.periodoInicio), fmt(form.periodoFim)]
                .filter(Boolean)
                .join(" • ");
              abrirBoletoHtml({
                variant: kind === "pix" ? "pix" : "boleto",
                documentoRef: "PRÉVIA",
                vencimento: form.dueDate,
                valor: Number(form.value.replace(",", ".")) || 0,
                pagador: {
                  nome: form.customerName,
                  cpfCnpj: form.cpfCnpj || null,
                  telefone: form.phone || null,
                  email: form.email || null,
                },
                composicao: {
                  servico: form.servico || form.description || null,
                  destino: form.destino || null,
                  periodo: periodo || null,
                  passageiro: form.passageiros || null,
                },
                multaPercent: Number(form.finePercent) || null,
                jurosPercentMes: Number(form.interestPercent) || null,
                preview: true,
              });
            }}
          >
            {kind === "pix" ? "Visualizar cobrança" : "Visualizar boleto"}
          </Button>

          <Button
            className="flex-[2] h-12 rounded-xl font-bold shadow-[0_8px_30px_-8px_color-mix(in_oklab,var(--brand-orange)_50%,transparent)] transition-all hover:brightness-110 active:scale-[0.98]"
            disabled={mut.isPending || !form.customerName || !form.cpfCnpj || !form.value}
            onClick={() => mut.mutate()}
          >
            {mut.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            {kind === "pix" ? "Gerar QR Code" : "Gerar boleto"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}


import { recebimentoParaBoleto } from "@/lib/boleto-map";
export { recebimentoParaBoleto };



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

            <Button
              className="w-full bg-brand-orange hover:bg-brand-orange/90"
              onClick={async () => {
                if (!(await abrirBoletoHtml(recebimentoParaBoleto(row), true))) {
                  toast.error("Libere pop-ups para gerar o documento.");
                }
              }}
            >
              <Barcode className="h-4 w-4 mr-2" />
              {row.kind === "boleto" ? "Abrir boleto (PDF)" : "Abrir cobrança Pix (PDF)"}
            </Button>


            {row.kind !== "boleto" && row.invoice_url && (
              <Button
                className="w-full"
                onClick={() => window.open(row.invoice_url, "_blank", "noopener,noreferrer")}
              >
                <ExternalLink className="h-4 w-4 mr-2" /> Abrir fatura
              </Button>
            )}

            <Button
              variant="ghost"
              className="w-full"
              onClick={() =>
                copy(
                  row.kind === "boleto"
                    ? `${window.location.origin}/api/public/boleto/${row.id}`
                    : row.invoice_url,
                  "Link copiado — envie ao cliente.",
                )
              }
            >
              <Copy className="h-4 w-4 mr-2" /> Copiar link para o cliente
            </Button>

          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
