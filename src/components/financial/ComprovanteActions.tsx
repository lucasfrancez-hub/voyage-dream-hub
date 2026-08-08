import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Eye, ImageDown, Loader2, Receipt, Share2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { obterComprovante, obterComprovanteDetalhado, baixarComprovantePdf } from "@/lib/comprovantes.functions";
import { ComprovanteReceipt, type ReceiptData } from "@/components/financial/ComprovanteReceipt";

type Props = {
  url?: string | null;
  paymentId?: string | null;
  transferId?: string | null;
  billId?: string | null;
  /** Dados para o comprovante interno (visualização dentro do sistema). */
  receipt?: ReceiptData | null;
  /** Visual compacto (ícone só) para tabelas. */
  compact?: boolean;
  label?: string;
};

export function ComprovanteActions({
  url, paymentId, transferId, billId, receipt = null, compact = true, label = "Comprovante",
}: Props) {
  const consultar = useServerFn(obterComprovante);
  const detalhar = useServerFn(obterComprovanteDetalhado);
  const baixarPdfFn = useServerFn(baixarComprovantePdf);
  const [resolved, setResolved] = useState<string | null>(url ?? null);
  const [loading, setLoading] = useState(false);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [fetched, setFetched] = useState<ReceiptData | null>(null);


  const podeConsultar = Boolean(paymentId || transferId || billId);

  async function ensureUrl(): Promise<string | null> {
    if (resolved) return resolved;
    if (!podeConsultar) return null;
    setLoading(true);
    try {
      const res = await consultar({ data: { paymentId, transferId, billId } });
      setResolved(res.url ?? null);
      if (!res.url) toast.info("Comprovante ainda não disponível.");
      return res.url ?? null;
    } catch {
      toast.error("Não foi possível consultar o comprovante.");
      return null;
    } finally {
      setLoading(false);
    }
  }

  async function baixarPdf() {
    const u = await ensureUrl();
    if (!u) return;
    setLoading(true);
    try {
      const res = await baixarPdfFn({ data: { url: u } });
      if (res.pdf && res.base64) {
        const bin = atob(res.base64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const blobUrl = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
        const a = document.createElement("a");
        a.href = blobUrl;
        a.download = `comprovante-${transferId || paymentId || billId || "asaas"}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
        toast.success("PDF do comprovante baixado.");
        return;
      }
      window.open(u, "_blank", "noopener,noreferrer");
      toast.info("Este comprovante é uma página — use “Salvar como PDF”.");
    } catch {
      toast.error("Não foi possível baixar o PDF do comprovante.");
    } finally {
      setLoading(false);
    }
  }

  async function compartilhar() {
    const u = await ensureUrl();
    if (!u) return;
    const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
    if (nav.share) {
      try {
        await nav.share({ title: "Comprovante", url: u });
        return;
      } catch { /* usuário cancelou */ }
    }
    await navigator.clipboard.writeText(u);
    toast.success("Link do comprovante copiado.");
  }

  async function abrirComprovante() {
    if (receipt || fetched) {
      setReceiptOpen(true);
      return;
    }
    if (!podeConsultar) return;
    setLoading(true);
    try {
      const res = await detalhar({ data: { paymentId, transferId, billId } });
      const c = res.item;
      if (!c) {
        toast.info("Comprovante ainda não disponível.");
        return;
      }
      setFetched({
        valor: c.value,
        favorecido: c.favored ?? "—",
        favorecidoLabel: c.counterpartyLabel,
        direction: c.direction,
        instituicao: c.instituicao,
        chavePix: c.chavePix,
        cpfCnpj: c.cpfCnpj,
        tipo: c.operation,
        formaPagamento: c.formaPagamento,
        dataVencimento: c.dueDate,
        dataPagamento: c.paymentDate ?? c.date,
        dataHora: c.date,
        transacaoId: c.asaasId,
        descricao: c.descricao,
        status: c.status ?? undefined,
        pdfUrl: c.receiptUrl,
      });
      setReceiptOpen(true);
    } catch {
      toast.error("Não foi possível carregar o comprovante.");
    } finally {
      setLoading(false);
    }
  }

  if (!resolved && !podeConsultar && !receipt) {
    return (
      <span className="text-xs text-muted-foreground" title="Comprovante ainda não disponível para esta movimentação.">—</span>
    );
  }

  const visivel = receipt ?? fetched;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size={compact ? "sm" : "default"}
            className="gap-1.5 text-xs"
            disabled={loading}
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Receipt className="h-3.5 w-3.5" />}
            {compact ? null : label}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem onSelect={(e) => { e.preventDefault(); setAuto(null); abrirComprovante(); }}>
            <Eye className="mr-2 h-4 w-4" /> Ver comprovante
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={(e) => { e.preventDefault(); setAuto("download"); abrirComprovante(); }}>
            <ImageDown className="mr-2 h-4 w-4" /> Baixar imagem
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={(e) => { e.preventDefault(); setAuto("share"); abrirComprovante(); }}>
            <Share2 className="mr-2 h-4 w-4" /> Compartilhar (WhatsApp)
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {visivel && (
        <ComprovanteReceipt
          open={receiptOpen}
          onOpenChange={(v) => { setReceiptOpen(v); if (!v) setAuto(null); }}
          data={visivel}
          autoAction={auto}
          onAutoActionDone={() => setAuto(null)}
        />
      )}
    </>
  );
}



export default ComprovanteActions;
