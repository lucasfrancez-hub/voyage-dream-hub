import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Download, Eye, Loader2, Receipt, Share2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { obterComprovante } from "@/lib/comprovantes.functions";

type Props = {
  url?: string | null;
  paymentId?: string | null;
  transferId?: string | null;
  billId?: string | null;
  /** Visual compacto (ícone só) para tabelas. */
  compact?: boolean;
  label?: string;
};

export function ComprovanteActions({
  url, paymentId, transferId, billId, compact = true, label = "Comprovante",
}: Props) {
  const consultar = useServerFn(obterComprovante);
  const [resolved, setResolved] = useState<string | null>(url ?? null);
  const [loading, setLoading] = useState(false);

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

  async function abrir() {
    const u = await ensureUrl();
    if (u) window.open(u, "_blank", "noopener,noreferrer");
  }

  async function baixar() {
    const u = await ensureUrl();
    if (!u) return;
    // O comprovante do banco é uma página; abrimos para visualizar/salvar em PDF.
    window.open(u, "_blank", "noopener,noreferrer");
    toast.info("Use “Salvar como PDF” na janela do comprovante.");
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

  if (!resolved && !podeConsultar) {
    return (
      <span className="text-xs text-muted-foreground" title="Comprovante ainda não disponível para esta movimentação.">—</span>
    );
  }

  return (
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
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem onSelect={(e) => { e.preventDefault(); abrir(); }}>
          <Eye className="mr-2 h-4 w-4" /> Visualizar
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={(e) => { e.preventDefault(); baixar(); }}>
          <Download className="mr-2 h-4 w-4" /> Baixar PDF
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={(e) => { e.preventDefault(); compartilhar(); }}>
          <Share2 className="mr-2 h-4 w-4" /> Compartilhar
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default ComprovanteActions;
