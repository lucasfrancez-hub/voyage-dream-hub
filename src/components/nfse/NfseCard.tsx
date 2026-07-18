import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { FileText, Loader2, RefreshCw, Send, XCircle, Download, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  emitirNfse, consultarNfse, cancelarNfse, listNfseByOrder,
} from "@/lib/nfse.functions";
import type { OrderDetail } from "@/lib/orders.functions";

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function statusBadge(s: string) {
  const map: Record<string, { label: string; cls: string }> = {
    processando: { label: "Processando", cls: "bg-amber-500/15 text-amber-700 border-amber-500/30" },
    autorizado: { label: "Autorizado", cls: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30" },
    cancelando: { label: "Cancelando", cls: "bg-orange-500/15 text-orange-700 border-orange-500/30" },
    cancelado: { label: "Cancelado", cls: "bg-muted text-muted-foreground" },
    erro: { label: "Erro", cls: "bg-red-500/15 text-red-700 border-red-500/30" },
  };
  const x = map[s] ?? map.processando;
  return <Badge variant="outline" className={x.cls}>{x.label}</Badge>;
}

export function NfseCard({ detail }: { detail: OrderDetail }) {
  const { order } = detail;
  const qc = useQueryClient();
  const listFn = useServerFn(listNfseByOrder);
  const emitFn = useServerFn(emitirNfse);
  const consultFn = useServerFn(consultarNfse);
  const cancelFn = useServerFn(cancelarNfse);

  const key = ["nfse", order.id] as const;
  const { data: emissoes = [], isLoading } = useQuery({
    queryKey: key,
    queryFn: () => listFn({ data: { orderId: order.id } }),
    refetchInterval: (q) =>
      (q.state.data ?? []).some((e) => e.status === "processando" || e.status === "cancelando")
        ? 8000 : false,
  });

  const [open, setOpen] = useState(false);
  const defaultDisc = `Serviços de agenciamento de viagens referente ao pedido #${order.orderNumber}${order.tripTitle ? ` — ${order.tripTitle}` : ""}.`;
  const [form, setForm] = useState({
    razaoSocial: order.payerFullName || order.fullName || "",
    cpfCnpj: order.payerCpf || order.cpf || "",
    email: order.payerEmail || order.email || "",
    valor: String(order.totalPrice ?? 0),
    discriminacao: defaultDisc,
  });

  const openDialog = () => {
    setForm({
      razaoSocial: order.payerFullName || order.fullName || "",
      cpfCnpj: order.payerCpf || order.cpf || "",
      email: order.payerEmail || order.email || "",
      valor: String(order.totalPrice ?? 0),
      discriminacao: defaultDisc,
    });
    setOpen(true);
  };

  useEffect(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent<{ orderId?: string }>;
      if (ce.detail?.orderId && ce.detail.orderId !== order.id) return;
      openDialog();
      document.getElementById("nfse-card")?.scrollIntoView({ behavior: "smooth", block: "start" });
    };
    window.addEventListener("nfse:open-emit", handler as EventListener);
    return () => window.removeEventListener("nfse:open-emit", handler as EventListener);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order.id]);

  const emitMut = useMutation({
    mutationFn: async () => {
      const valor = Number(form.valor.replace(",", "."));
      if (!valor || valor <= 0) throw new Error("Valor inválido");
      if (!form.razaoSocial.trim()) throw new Error("Nome/Razão social é obrigatório");
      const doc = form.cpfCnpj.replace(/\D/g, "");
      if (doc.length !== 11 && doc.length !== 14) throw new Error("CPF ou CNPJ inválido");
      return emitFn({
        data: {
          orderId: order.id,
          valorServicos: valor,
          discriminacao: form.discriminacao.trim(),
          tomador: {
            razaoSocial: form.razaoSocial.trim(),
            cpfCnpj: doc,
            email: form.email.trim() || null,
            endereco: {
              logradouro: order.payerAddress ?? null,
              numero: order.payerNumber ?? null,
              complemento: null,
              bairro: order.payerDistrict ?? null,
              uf: order.payerState ?? null,
              cep: order.payerZip ?? null,
            },
          },
        },
      });
    },
    onSuccess: () => {
      toast.success("NFS-e enviada para processamento");
      setOpen(false);
      qc.invalidateQueries({ queryKey: key });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
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

  return (
    <div id="nfse-card" className="rounded-xl border border-border p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-medium text-sm flex items-center gap-2">
            <FileText className="h-4 w-4" /> Nota Fiscal de Serviço (NFS-e)
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            Emissão via Focus NFe · Paranavaí/PR · ISS 4% · Item 9.02
          </div>
        </div>
        <Button size="sm" onClick={openDialog}>
          <Send className="h-3.5 w-3.5 mr-1.5" /> Emitir NFS-e
        </Button>
      </div>

      {isLoading && <div className="mt-3 text-xs text-muted-foreground">Carregando…</div>}

      {emissoes.length > 0 && (
        <div className="mt-3 space-y-2">
          {emissoes.map((e) => (
            <div key={e.id} className="rounded-lg bg-muted/40 px-3 py-2 text-xs space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  {statusBadge(e.status)}
                  {e.numero_nfse && <span className="font-medium">Nº {e.numero_nfse}</span>}
                  <span className="text-muted-foreground truncate">{brl(Number(e.valor_servicos))}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Button size="sm" variant="ghost" className="h-7 px-2"
                    disabled={consultMut.isPending}
                    onClick={() => consultMut.mutate(e.id)}>
                    <RefreshCw className="h-3.5 w-3.5" />
                  </Button>
                  {e.url_pdf && (
                    <Button size="sm" variant="ghost" className="h-7 px-2" asChild>
                      <a href={e.url_pdf} target="_blank" rel="noreferrer">
                        <Download className="h-3.5 w-3.5" />
                      </a>
                    </Button>
                  )}
                  {e.status === "autorizado" && (
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-red-600"
                      onClick={() => {
                        const j = window.prompt("Justificativa do cancelamento (mín. 15 caracteres):");
                        if (j && j.trim().length >= 15) cancelMut.mutate({ id: e.id, justificativa: j.trim() });
                        else if (j !== null) toast.error("Justificativa muito curta");
                      }}>
                      <XCircle className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
              {e.codigo_verificacao && (
                <div className="text-muted-foreground">
                  Cód. verificação: <span className="font-mono">{e.codigo_verificacao}</span>
                </div>
              )}
              {e.status === "erro" && (
                <div className="text-red-600 flex items-start gap-1">
                  <ExternalLink className="h-3 w-3 mt-0.5 shrink-0" />
                  <span>{(e.focus_response as { mensagem?: string } | null)?.mensagem || "Verifique os dados fiscais"}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Emitir NFS-e</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Nome / Razão social do tomador</Label>
              <Input value={form.razaoSocial} onChange={(e) => setForm((f) => ({ ...f, razaoSocial: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>CPF ou CNPJ</Label>
                <Input value={form.cpfCnpj} onChange={(e) => setForm((f) => ({ ...f, cpfCnpj: e.target.value }))} />
              </div>
              <div>
                <Label>Valor dos serviços (R$)</Label>
                <Input value={form.valor} onChange={(e) => setForm((f) => ({ ...f, valor: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label>E-mail (opcional)</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
            </div>
            <div>
              <Label>Discriminação do serviço</Label>
              <Textarea rows={4} value={form.discriminacao} onChange={(e) => setForm((f) => ({ ...f, discriminacao: e.target.value }))} />
            </div>
            <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
              ISS calculado: <b>{brl(Number(form.valor.replace(",", ".") || 0) * 0.04)}</b> · Item 9.02 · Paranavaí/PR
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={() => emitMut.mutate()} disabled={emitMut.isPending}>
              {emitMut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Emitir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
