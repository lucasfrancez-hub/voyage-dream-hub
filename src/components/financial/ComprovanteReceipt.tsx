import { CheckCircle2, Download, Loader2, Share2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { formatBRL } from "@/lib/format";
import viaairLogo from "@/assets/viaair-logo-white.png.asset.json";

export type ReceiptData = {
  valor: number;
  favorecido: string;
  instituicao?: string | null;
  chavePix?: string | null;
  cpfCnpj?: string | null;
  tipo?: string;
  dataHora?: string | null;
  transacaoId?: string | null;
  descricao?: string | null;
  status?: string;
  concluido?: boolean;
  /** URL do comprovante oficial (ASAAS) — quando presente, "Salvar PDF" abre este arquivo */
  pdfUrl?: string | null;
};

function maskDoc(doc?: string | null) {
  if (!doc) return "—";
  const d = doc.replace(/\D/g, "");
  if (d.length === 14) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  if (d.length === 11) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  return doc;
}

export function ComprovanteReceipt({
  open,
  onOpenChange,
  data,
  loading,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  data: ReceiptData | null;
  loading?: boolean;
}) {
  async function compartilhar() {
    if (!data) return;
    const texto = [
      "Comprovante de transferência Pix — VIA AIR",
      `Valor: ${formatBRL(data.valor)}`,
      `Favorecido: ${data.favorecido}`,
      `Data: ${data.dataHora ?? "—"}`,
      data.transacaoId ? `ID: ${data.transacaoId}` : "",
    ]
      .filter(Boolean)
      .join("\n");
    const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
    if (nav.share) {
      try {
        await nav.share({ title: "Comprovante VIA AIR", text: texto });
        return;
      } catch {
        /* cancelado */
      }
    }
    await navigator.clipboard.writeText(texto);
    toast.success("Comprovante copiado.");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-[440px] p-0 border-0 bg-transparent shadow-none print-receipt-wrapper"
      >
        {loading || !data ? (
          <div className="rounded-3xl bg-card p-16 flex justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <div
              id="comprovante-print"
              className="print-receipt relative overflow-hidden rounded-3xl bg-card shadow-[0_32px_64px_-16px_rgba(0,0,0,0.6)]"
            >
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-brand-orange/10 via-transparent to-emerald-500/5" />
              <div className="absolute inset-x-0 top-0 h-1 bg-brand-orange" />

              <div className="relative p-8 flex flex-col items-center">
                <img
                  src={viaairLogo.url}
                  alt="VIA AIR"
                  className="h-8 w-auto mb-8 object-contain"
                />

                <div className="flex flex-col items-center mb-6">
                  <div className="w-12 h-12 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center mb-3">
                    <CheckCircle2 className="h-6 w-6 text-emerald-400" />
                  </div>
                  <span className="text-emerald-400 font-semibold text-sm tracking-wide">
                    {data.concluido === false ? (data.status ?? "Em processamento") : "Pagamento realizado"}
                  </span>
                </div>

                <div className="text-center mb-10">
                  <span className="text-muted-foreground text-sm font-medium">Valor total</span>
                  <h1 className="text-4xl font-bold text-foreground mt-1 tabular-nums">
                    {formatBRL(data.valor)}
                  </h1>
                </div>

                <div className="w-full grid grid-cols-2 gap-x-4 gap-y-5">
                  <Field label="Favorecido" value={data.favorecido} />
                  <Field label="Instituição" value={data.instituicao || "ASAAS"} />
                  <Field label="Chave Pix" value={data.chavePix || "—"} />
                  <Field label="Tipo" value={data.tipo || "Transferência Pix"} />
                  <Field label="CPF/CNPJ" value={maskDoc(data.cpfCnpj)} />
                  <Field label="Data e hora" value={data.dataHora || "—"} />
                  {data.descricao ? (
                    <div className="col-span-2">
                      <Field label="Descrição" value={data.descricao} />
                    </div>
                  ) : null}
                  <div className="col-span-2">
                    <span className="text-[10px] text-muted-foreground uppercase tracking-widest">
                      ID da transação
                    </span>
                    <p className="text-[10px] font-mono text-muted-foreground mt-1 bg-background/60 p-2 rounded border border-border break-all">
                      {data.transacaoId || "—"}
                    </p>
                  </div>
                </div>

                <div className="mt-10 w-full pt-6 border-t border-border flex flex-col items-center gap-4">
                  <div className="flex items-center gap-2 opacity-60">
                    <span className="text-[9px] text-muted-foreground font-medium uppercase tracking-widest">
                      Processado por
                    </span>
                    <span className="text-xs font-bold text-foreground tracking-widest">ASAAS</span>
                  </div>
                  <p className="text-[9px] text-muted-foreground text-center leading-tight">
                    Documento gerado pelo sistema VIA AIR para simples conferência.
                  </p>
                </div>
              </div>

              <div className="absolute bottom-0 inset-x-0 h-2 bg-gradient-to-r from-transparent via-brand-orange/20 to-transparent" />
            </div>

            <div className="flex gap-2 mt-3 print:hidden">
              <button
                onClick={compartilhar}
                className="flex-1 py-3 px-4 bg-muted/40 hover:bg-muted rounded-xl text-xs font-semibold text-foreground border border-border transition flex items-center justify-center gap-2"
              >
                <Share2 className="h-4 w-4" /> Compartilhar
              </button>
              <button
                onClick={() => {
                  if (data.pdfUrl) {
                    window.open(data.pdfUrl, "_blank", "noopener,noreferrer");
                    return;
                  }
                  window.print();
                }}
                className="flex-1 py-3 px-4 bg-brand-orange hover:brightness-95 rounded-xl text-xs font-semibold text-white shadow-[var(--shadow-glow)] transition flex items-center justify-center gap-2"
              >
                <Download className="h-4 w-4" /> Salvar PDF
              </button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-[10px] text-muted-foreground uppercase tracking-widest">{label}</span>
      <p className="text-xs text-foreground font-medium mt-1 leading-relaxed break-words">{value}</p>
    </div>
  );
}

export default ComprovanteReceipt;
