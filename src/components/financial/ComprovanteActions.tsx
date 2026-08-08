import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Download, ExternalLink, Eye, Loader2, Receipt, Share2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { obterComprovante, baixarComprovantePdf } from "@/lib/comprovantes.functions";
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
  const baixarPdfFn = useServerFn(baixarComprovantePdf);
  const [resolved, setResolved] = useState<string | null>(url ?? null);
  const [loading, setLoading] = useState(false);
  const [receiptOpen, setReceiptOpen] = useState(false);

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

  async function abrirNoAsaas() {
    const u = await ensureUrl();
    if (u) window.open(u, "_blank", "noopener,noreferrer");
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

  if (!resolved && !podeConsultar && !receipt) {
    return (
      <span className="text-xs text-muted-foreground" title="Comprovante ainda não disponível para esta movimentação.">—</span>
    );
  }

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
          {receipt && (
            <DropdownMenuItem onSelect={(e) => { e.preventDefault(); setReceiptOpen(true); }}>
              <Eye className="mr-2 h-4 w-4" /> Ver comprovante
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onSelect={(e) => { e.preventDefault(); baixarPdf(); }}>
            <Download className="mr-2 h-4 w-4" /> Baixar PDF
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={(e) => { e.preventDefault(); compartilhar(); }}>
            <Share2 className="mr-2 h-4 w-4" /> Compartilhar
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {receipt && (
        <ComprovanteReceipt open={receiptOpen} onOpenChange={setReceiptOpen} data={receipt} />
      )}
    </>
  );
}

export default ComprovanteActions;
