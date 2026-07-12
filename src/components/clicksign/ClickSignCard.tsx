import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Signature, CheckCircle2, XCircle, Send, RotateCcw, Download, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  createSignatureRequest, getSignatureStatus, cancelSignatureRequest, resendSignerEmail, syncSignatureFromClickSign,
} from "@/lib/clicksign.functions";
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

function statusBadge(status: string) {
  const map: Record<string, { label: string; className: string }> = {
    draft: { label: "Rascunho", className: "bg-muted text-muted-foreground" },
    running: { label: "Aguardando assinatura", className: "bg-amber-500/15 text-amber-700 border-amber-500/30" },
    closed: { label: "Assinado", className: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30" },
    refused: { label: "Recusado", className: "bg-red-500/15 text-red-700 border-red-500/30" },
    canceled: { label: "Cancelado", className: "bg-muted text-muted-foreground" },
  };
  const s = map[status] ?? map.draft;
  return <Badge variant="outline" className={s.className}>{s.label}</Badge>;
}

export function ClickSignCard({ detail }: { detail: OrderDetail }) {
  const { order } = detail;
  const qc = useQueryClient();

  const statusFn = useServerFn(getSignatureStatus);
  const createFn = useServerFn(createSignatureRequest);
  const cancelFn = useServerFn(cancelSignatureRequest);
  const resendFn = useServerFn(resendSignerEmail);
  const syncFn = useServerFn(syncSignatureFromClickSign);

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
  // Reinicializa form quando abre
  const openSendDialog = () => {
    setForm({
      nome: order.fullName ?? "",
      email: order.email ?? "",
      cpf: order.cpf ?? "",
      nascimento: order.birthDate ?? "",
      telefone: order.phone ?? "",
    });
    setIncludeAuth(isCreditCard);
    setOpenDialog(true);
  };

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
    onSuccess: (r) => {
      toast.success(`Sincronizado (ClickSign: ${r.clicksignStatus})`);
      invalidate();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao sincronizar"),
  });

  const assinatura = data?.assinatura;
  const signers = data?.signers ?? [];

  const hasActive = useMemo(
    () => assinatura && ["draft", "running"].includes(assinatura.status),
    [assinatura],
  );

  return (
    <div className="rounded-xl border border-border p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-medium text-sm flex items-center gap-2">
            <Signature className="h-4 w-4" /> Assinatura Digital (ClickSign)
            {assinatura && statusBadge(assinatura.status)}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {!assinatura && "Envia o contrato + recibo direto para o cliente assinar (por e-mail e WhatsApp) com selfie dinâmica (prova de vida) + foto do documento."}
            {assinatura?.status === "running" && "Aguardando assinatura do cliente e/ou da agência."}
            {assinatura?.status === "closed" && `Assinado em ${assinatura.updated_at ? new Date(assinatura.updated_at).toLocaleString("pt-BR") : ""}.`}
            {assinatura?.status === "refused" && "O documento foi recusado por um signatário."}
            {assinatura?.status === "canceled" && "Envio cancelado."}
          </div>
        </div>

        <div className="flex gap-2 shrink-0">
          {isLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}

          {assinatura && (
            <Button
              size="sm"
              variant="outline"
              disabled={syncMut.isPending}
              onClick={() => syncMut.mutate(assinatura.id)}
              title="Buscar status atual na ClickSign e baixar PDF se assinado"
            >
              {syncMut.isPending ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              )}
              Sincronizar
            </Button>
          )}

          {!hasActive && assinatura?.status !== "closed" && (
            <Button size="sm" onClick={openSendDialog}>
              <Send className="h-3.5 w-3.5 mr-1.5" /> Enviar para assinatura
            </Button>
          )}

          {assinatura?.status === "closed" && assinatura.signed_pdf_url && (
            <Button size="sm" asChild>
              <a href={assinatura.signed_pdf_url} target="_blank" rel="noreferrer">
                <Download className="h-3.5 w-3.5 mr-1.5" /> Baixar PDF assinado
              </a>
            </Button>
          )}

          {assinatura?.status === "refused" && (
            <Button size="sm" variant="outline" onClick={openSendDialog}>
              <RotateCcw className="h-3.5 w-3.5 mr-1.5" /> Enviar novamente
            </Button>
          )}

          {assinatura?.status === "canceled" && (
            <Button size="sm" onClick={openSendDialog}>
              <Send className="h-3.5 w-3.5 mr-1.5" /> Reenviar
            </Button>
          )}
        </div>
      </div>

      {signers.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {signers.map((s) => (
            <div key={s.id} className="flex items-center justify-between text-xs rounded-lg bg-muted/40 px-3 py-2">
              <div className="min-w-0">
                <div className="font-medium truncate">
                  {s.nome}{" "}
                  <span className="text-muted-foreground font-normal">
                    ({s.papel === "cliente" ? "Cliente" : s.papel === "agencia" ? "Agência" : "Testemunha"})
                  </span>
                </div>
                <div className="text-muted-foreground truncate">{s.email}</div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {s.status === "signed" && (
                  <span className="flex items-center gap-1 text-emerald-600">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Assinou
                  </span>
                )}
                {s.status === "refused" && (
                  <span className="flex items-center gap-1 text-red-600">
                    <XCircle className="h-3.5 w-3.5" /> Recusou
                  </span>
                )}
                {s.status === "pending" && hasActive && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs"
                    disabled={resendMut.isPending}
                    onClick={() => resendMut.mutate(s.id)}
                  >
                    Reenviar e-mail
                  </Button>
                )}
              </div>
            </div>
          ))}

          {hasActive && assinatura && (
            <div className="pt-1">
              <Button
                size="sm"
                variant="ghost"
                className="text-xs text-red-600 hover:text-red-700"
                disabled={cancelMut.isPending}
                onClick={() => {
                  if (confirm("Cancelar o envio deste documento na ClickSign?")) {
                    cancelMut.mutate(assinatura.id);
                  }
                }}
              >
                Cancelar envio
              </Button>
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
            <p className="text-xs text-muted-foreground">
              Autenticação: link enviado por <b>e-mail e WhatsApp</b>. Na assinatura, o cliente faz <b>selfie dinâmica</b> (prova de vida) e envia a <b>foto do documento oficial</b> (RG/CNH). A ClickSign confere CPF e data de nascimento. A agência assina em seguida.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenDialog(false)}>Cancelar</Button>
            <Button onClick={() => createMut.mutate()} disabled={createMut.isPending}>
              {createMut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Enviar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
