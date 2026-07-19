import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Loader2, Signature, CheckCircle2, XCircle, Send, RotateCcw, Download,
  RefreshCw, Trash2, Clock, Mail, ShieldCheck, FileSignature,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  createSignatureRequest, getSignatureStatus, cancelSignatureRequest,
  resendSignerEmail, syncSignatureFromClickSign, deleteSignatureRequest,
} from "@/lib/clicksign.functions";
import { confirmThen } from "@/lib/confirm";

import { generateReceiptAndContract, generateReceiptContractAndAuthorization } from "@/lib/contract-pdf";
import type { OrderDetail } from "@/lib/orders.functions";

async function blobToBase64(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < buf.length; i += chunk) {
    binary += String.fromCharCode(...buf.subarray(i, i + chunk));
  }
  return btoa(binary);
}

type StatusKey = "draft" | "running" | "closed" | "refused" | "canceled" | "none";

const STATUS_META: Record<StatusKey, {
  label: string; badge: string; bar: string; sub: string;
}> = {
  none:     { label: "Não enviado",  badge: "bg-muted text-muted-foreground border-border",             bar: "bg-muted-foreground/40", sub: "Envie o contrato para o cliente assinar" },
  draft:    { label: "Rascunho",     badge: "bg-slate-500/10 text-slate-400 border-slate-500/20",       bar: "bg-slate-500",           sub: "Rascunho salvo — ainda não enviado" },
  running:  { label: "Aguardando",   badge: "bg-amber-500/10 text-amber-500 border-amber-500/20",       bar: "bg-amber-500",           sub: "Aguardando assinatura do cliente e/ou agência" },
  closed:   { label: "Assinado",     badge: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20", bar: "bg-emerald-500",         sub: "Contrato assinado por todas as partes" },
  refused:  { label: "Recusado",     badge: "bg-rose-500/10 text-rose-500 border-rose-500/20",          bar: "bg-rose-500",            sub: "Um signatário recusou o documento" },
  canceled: { label: "Cancelado",    badge: "bg-slate-500/10 text-slate-400 border-slate-500/20",       bar: "bg-slate-500",           sub: "Envio cancelado" },
};

export function ClickSignCard({ detail }: { detail: OrderDetail }) {
  const { order } = detail;
  const qc = useQueryClient();

  const statusFn = useServerFn(getSignatureStatus);
  const createFn = useServerFn(createSignatureRequest);
  const cancelFn = useServerFn(cancelSignatureRequest);
  const resendFn = useServerFn(resendSignerEmail);
  const syncFn = useServerFn(syncSignatureFromClickSign);
  const deleteFn = useServerFn(deleteSignatureRequest);

  const queryKey = ["clicksign", "status", order.id] as const;
  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () => statusFn({ data: { pedidoId: order.id } }),
    refetchInterval: (q) => (q.state.data?.assinatura?.status === "running" ? 15000 : false),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey });

  const isCreditCard = (order.paymentMethod ?? "").toLowerCase().startsWith("credit_card");

  const [openDialog, setOpenDialog] = useState(false);
  const [includeAuth, setIncludeAuth] = useState(isCreditCard);
  const [form, setForm] = useState({
    nome: order.fullName ?? "",
    email: order.email ?? "",
    cpf: order.cpf ?? "",
    nascimento: order.birthDate ?? "",
    telefone: order.phone ?? "",
  });
  const openSendDialog = (withAuthorization = isCreditCard) => {
    setForm({
      nome: order.fullName ?? "",
      email: order.email ?? "",
      cpf: order.cpf ?? "",
      nascimento: order.birthDate ?? "",
      telefone: order.phone ?? "",
    });
    setIncludeAuth(withAuthorization);
    setOpenDialog(true);
  };

  useEffect(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent<{ orderId?: string; withAuth?: boolean }>;
      if (ce.detail?.orderId && ce.detail.orderId !== order.id) return;
      openSendDialog(ce.detail?.withAuth ?? isCreditCard);
      document.getElementById("clicksign-card")?.scrollIntoView({ behavior: "smooth", block: "start" });
    };
    window.addEventListener("clicksign:open-send", handler as EventListener);
    return () => window.removeEventListener("clicksign:open-send", handler as EventListener);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order.id, isCreditCard]);

  const createMut = useMutation({
    mutationFn: async () => {
      const cpfDigits = form.cpf.replace(/\D/g, "");
      if (cpfDigits.length !== 11) throw new Error("CPF inválido");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(form.nascimento)) throw new Error("Data de nascimento inválida (use YYYY-MM-DD)");
      if (!form.email.includes("@")) throw new Error("E-mail inválido");
      if (form.nome.trim().length < 2) throw new Error("Nome do cliente é obrigatório");
      const phoneDigits = form.telefone.replace(/\D/g, "");
      if (phoneDigits.length < 10) throw new Error("Telefone (WhatsApp) inválido — inclua DDD");

      const blob = includeAuth
        ? await generateReceiptContractAndAuthorization(detail)
        : await generateReceiptAndContract(detail);
      const pdfBase64 = await blobToBase64(blob);
      return createFn({
        data: {
          pedidoId: order.id,
          pdfBase64,
          orderNumber: order.orderNumber,
          cliente: {
            nome: form.nome.trim(),
            email: form.email.trim(),
            cpf: cpfDigits,
            nascimento: form.nascimento,
            telefone: form.telefone.trim(),
          },
        },
      });
    },
    onSuccess: () => {
      toast.success("Contrato enviado! O cliente receberá por e-mail e WhatsApp.");
      setOpenDialog(false);
      invalidate();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao enviar"),
  });

  const cancelMut = useMutation({
    mutationFn: async (assinaturaId: string) => cancelFn({ data: { assinaturaId } }),
    onSuccess: () => { toast.success("Assinatura cancelada"); invalidate(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao cancelar"),
  });

  const resendMut = useMutation({
    mutationFn: async (signerId: string) => resendFn({ data: { signerId } }),
    onSuccess: () => toast.success("E-mail reenviado"),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao reenviar"),
  });

  const syncMut = useMutation({
    mutationFn: async (assinaturaId: string) => syncFn({ data: { assinaturaId } }),
    onSuccess: (r) => { toast.success(`Sincronizado (ClickSign: ${r.clicksignStatus})`); invalidate(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao sincronizar"),
  });

  const deleteMut = useMutation({
    mutationFn: async (assinaturaId: string) => deleteFn({ data: { assinaturaId } }),
    onSuccess: () => { toast.success("Assinatura excluída"); invalidate(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao excluir"),
  });

  const assinatura = data?.assinatura;
  const signers = data?.signers ?? [];

  const statusKey: StatusKey = (assinatura?.status as StatusKey) ?? "none";
  const meta = STATUS_META[statusKey];

  const hasActive = useMemo(
    () => assinatura && ["draft", "running"].includes(assinatura.status),
    [assinatura],
  );

  const signedCount = signers.filter((s) => s.status === "signed").length;
  const totalSigners = signers.length;

  return (
    <div
      id="clicksign-card"
      className="relative overflow-hidden rounded-2xl border border-border bg-card/40"
    >
      {/* Left accent bar */}
      <div className={`absolute top-0 left-0 w-1 h-full ${meta.bar}`} />

      {/* Header */}
      <div className="p-5 border-b border-border/60 flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3 min-w-0">
          <div className="p-2 rounded-xl bg-background/60 border border-border shrink-0">
            <Signature className="h-5 w-5 text-brand-orange" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="text-sm font-bold tracking-tight">Assinatura Digital</h4>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                ClickSign
              </span>
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${meta.badge}`}>
                {meta.label}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-1 max-w-xl">
              {meta.sub}
              {assinatura?.status === "closed" && assinatura.updated_at && (
                <> · {new Date(assinatura.updated_at).toLocaleString("pt-BR")}</>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap justify-end">
          {isLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}

          {assinatura && (
            <button
              type="button"
              title="Sincronizar status na ClickSign"
              onClick={() => syncMut.mutate(assinatura.id)}
              disabled={syncMut.isPending}
              className="p-2 rounded-lg text-muted-foreground hover:text-emerald-400 hover:bg-emerald-400/10 transition disabled:opacity-50"
            >
              {syncMut.isPending
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <RefreshCw className="h-4 w-4" />}
            </button>
          )}

          {assinatura?.status === "closed" && assinatura.signed_pdf_url && (
            <a
              href={assinatura.signed_pdf_url}
              target="_blank"
              rel="noreferrer"
              title="Baixar PDF assinado"
              className="p-2 rounded-lg text-muted-foreground hover:text-brand-orange hover:bg-brand-orange/10 transition"
            >
              <Download className="h-4 w-4" />
            </a>
          )}

          {assinatura && ["refused", "canceled", "draft"].includes(assinatura.status) && (
            <button
              type="button"
              title="Excluir este envio"
              disabled={deleteMut.isPending}
              onClick={() => confirmThen(
                "Excluir esta assinatura? Esta ação não pode ser desfeita.",
                () => deleteMut.mutate(assinatura.id),
              )}
              className="p-2 rounded-lg text-muted-foreground hover:text-rose-500 hover:bg-rose-500/10 transition disabled:opacity-50"
            >
              {deleteMut.isPending
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <Trash2 className="h-4 w-4" />}
            </button>
          )}
        </div>
      </div>

      {/* Mini KPI strip */}
      {(assinatura || totalSigners > 0) && (
        <div className="grid grid-cols-3 divide-x divide-border/60 border-b border-border/60 bg-background/30">
          <MiniStat
            icon={<FileSignature className="h-3.5 w-3.5" />}
            label="Signatários"
            value={String(totalSigners)}
          />
          <MiniStat
            icon={<CheckCircle2 className="h-3.5 w-3.5" />}
            label="Assinaram"
            value={`${signedCount}/${totalSigners || 0}`}
            tone={signedCount > 0 ? "emerald" : "default"}
          />
          <MiniStat
            icon={<Clock className="h-3.5 w-3.5" />}
            label="Atualizado"
            value={assinatura?.updated_at
              ? new Date(assinatura.updated_at).toLocaleDateString("pt-BR")
              : "—"}
          />
        </div>
      )}

      {/* Primary action row */}
      {!hasActive && assinatura?.status !== "closed" && (
        <div className="p-5 border-b border-border/60 bg-gradient-to-br from-transparent to-brand-orange/[0.03]">
          <div className="flex items-center gap-2 mb-3">
            <ShieldCheck className="h-3.5 w-3.5 text-brand-orange" />
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Enviar para assinatura
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => openSendDialog(false)}
              className="border-border hover:border-brand-orange hover:text-brand-orange"
            >
              <Send className="h-3.5 w-3.5 mr-1.5" /> Recibo + Contrato
            </Button>
            <Button
              size="sm"
              onClick={() => openSendDialog(true)}
              className="bg-brand-orange hover:bg-brand-orange/90 text-white shadow-lg shadow-brand-orange/20"
            >
              <Send className="h-3.5 w-3.5 mr-1.5" /> + Autorização de débito
            </Button>
            {assinatura?.status === "refused" && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => openSendDialog(isCreditCard)}
                className="text-muted-foreground"
              >
                <RotateCcw className="h-3.5 w-3.5 mr-1.5" /> Reenviar
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Signers */}
      {signers.length > 0 && (
        <div className="p-5">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            Signatários
          </div>
          <div className="space-y-2">
            {signers.map((s) => {
              const isSigned = s.status === "signed";
              const isRefused = s.status === "refused";
              const initials = (s.nome || "?").split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();
              return (
                <div
                  key={s.id}
                  className="flex items-center gap-3 rounded-xl border border-border bg-background/40 p-3"
                >
                  <div className={`h-9 w-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                    isSigned
                      ? "bg-emerald-500/15 text-emerald-500 border border-emerald-500/30"
                      : isRefused
                        ? "bg-rose-500/15 text-rose-500 border border-rose-500/30"
                        : "bg-brand-orange/10 text-brand-orange border border-brand-orange/20"
                  }`}>
                    {initials}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold truncate">{s.nome}</span>
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                        {s.papel === "cliente" ? "Cliente" : s.papel === "agencia" ? "Agência" : "Testemunha"}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground truncate flex items-center gap-1.5 mt-0.5">
                      <Mail className="h-3 w-3" /> {s.email}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {isSigned && (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-500 px-2 py-1 rounded-lg bg-emerald-500/10">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Assinou
                      </span>
                    )}
                    {isRefused && (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-rose-500 px-2 py-1 rounded-lg bg-rose-500/10">
                        <XCircle className="h-3.5 w-3.5" /> Recusou
                      </span>
                    )}
                    {s.status === "pending" && hasActive && (
                      <button
                        type="button"
                        title="Reenviar e-mail"
                        onClick={() => resendMut.mutate(s.id)}
                        disabled={resendMut.isPending}
                        className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-brand-orange px-2 py-1 rounded-lg hover:bg-brand-orange/10 transition disabled:opacity-50"
                      >
                        <Mail className="h-3.5 w-3.5" /> Reenviar
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {hasActive && assinatura && (
            <div className="pt-3 mt-3 border-t border-border/60 flex justify-end">
              <button
                type="button"
                disabled={cancelMut.isPending}
                onClick={() => confirmThen(
                  "Cancelar o envio deste documento na ClickSign?",
                  () => cancelMut.mutate(assinatura.id),
                )}
                className="text-xs text-muted-foreground hover:text-rose-500 transition"
              >
                Cancelar envio
              </button>
            </div>
          )}
        </div>
      )}

      <Dialog open={openDialog} onOpenChange={setOpenDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Enviar contrato para assinatura</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Nome completo do cliente</Label>
              <Input value={form.nome} onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))} />
            </div>
            <div>
              <Label>E-mail</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>CPF</Label>
                <Input value={form.cpf} onChange={(e) => setForm((f) => ({ ...f, cpf: e.target.value }))} placeholder="000.000.000-00" />
              </div>
              <div>
                <Label>Nascimento</Label>
                <Input type="date" value={form.nascimento} onChange={(e) => setForm((f) => ({ ...f, nascimento: e.target.value }))} />
              </div>
            </div>
            <div className="rounded-xl border border-brand-orange/30 bg-brand-orange/5 p-3 text-xs">
              <b className="text-brand-orange">
                {includeAuth ? "Recibo + Contrato + Autorização de débito" : "Recibo + Contrato"}
              </b>
              <span className="block text-muted-foreground mt-1">
                {includeAuth
                  ? "A autorização será incluída no mesmo PDF enviado para assinatura."
                  : "Somente o recibo e o contrato serão enviados para assinatura."}
              </span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Autenticação: link enviado por <b>e-mail e WhatsApp</b>. Na assinatura, o cliente faz <b>selfie dinâmica</b> (prova de vida) e envia a <b>foto do documento oficial</b> (RG/CNH). A ClickSign confere CPF e data de nascimento. A agência assina em seguida.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenDialog(false)}>Cancelar</Button>
            <Button
              onClick={() => createMut.mutate()}
              disabled={createMut.isPending}
              className="bg-brand-orange hover:bg-brand-orange/90 text-white"
            >
              {createMut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Enviar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MiniStat({
  icon, label, value, tone = "default",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone?: "default" | "emerald";
}) {
  const valueCls = tone === "emerald" ? "text-emerald-500" : "text-foreground";
  return (
    <div className="p-3 flex flex-col gap-1">
      <div className="flex items-center gap-1.5 text-muted-foreground text-[10px] uppercase tracking-wider font-semibold">
        {icon} {label}
      </div>
      <div className={`text-sm font-bold ${valueCls}`}>{value}</div>
    </div>
  );
}
