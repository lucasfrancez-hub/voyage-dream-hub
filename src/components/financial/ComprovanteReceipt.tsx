import { CheckCircle2, Download, Loader2, Share2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { formatBRL } from "@/lib/format";
import viaairLogo from "@/assets/viaair-logo-white.png.asset.json";

export type ReceiptParty = {
  nome?: string | null;
  cpfCnpj?: string | null;
  instituicao?: string | null;
};

export type ReceiptData = {
  valor: number;
  favorecido: string;
  /** Rótulo da contraparte: "Favorecido" (envio) ou "Pagador" (recebimento). */
  favorecidoLabel?: string;
  /** Sentido da movimentação — muda o título do comprovante. */
  direction?: 'in' | 'out';
  instituicao?: string | null;
  chavePix?: string | null;
  cpfCnpj?: string | null;
  tipo?: string;
  dataHora?: string | null;
  transacaoId?: string | null;
  descricao?: string | null;
  status?: string;
  concluido?: boolean;
  /** Forma de pagamento (Pix, Boleto, Cartão...) */
  formaPagamento?: string | null;
  /** Data de vencimento da cobrança */
  dataVencimento?: string | null;
  /** Data/hora do pagamento */
  dataPagamento?: string | null;
  /** Sobrescreve os blocos calculados a partir de `direction` */
  pagador?: ReceiptParty | null;
  recebedor?: ReceiptParty | null;
  /** URL do comprovante oficial (ASAAS) — quando presente, "Salvar PDF" abre este arquivo */
  pdfUrl?: string | null;
};

/** Dados fiscais fixos da conta VIA AIR no ASAAS. */
const VIAAIR_PARTY: ReceiptParty = {
  nome: "VIA AIR AGENCIA & REPRESENTACOES LTDA",
  cpfCnpj: "56339877000166",
  instituicao: "ASAAS GESTÃO FINANCEIRA INSTITUIÇÃO DE PAGAMENTO S.A.",
};

function maskDoc(doc?: string | null) {
  if (!doc) return "—";
  const d = doc.replace(/\D/g, "");
  if (d.length === 14) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  if (d.length === 11) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  return doc;
}

function formatDate(v?: string | null) {
  if (!v) return "—";
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split("-");
    return `${d}/${m}/${y}`;
  }
  const dt = new Date(s);
  if (!Number.isNaN(dt.getTime())) {
    return dt.toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  return s;
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
  const counterparty: ReceiptParty = {
    nome: data?.favorecido ?? null,
    cpfCnpj: data?.cpfCnpj ?? null,
    instituicao: data?.instituicao ?? null,
  };
  const isIn = data?.direction === "in";
  const pagador: ReceiptParty =
    data?.pagador ?? (isIn ? counterparty : VIAAIR_PARTY);
  const recebedor: ReceiptParty =
    data?.recebedor ?? (isIn ? VIAAIR_PARTY : counterparty);

  async function compartilhar() {
    if (!data) return;
    const texto = [
      "Comprovante de transferência Pix — VIA AIR",
      `Valor: ${formatBRL(data.valor)}`,
      `${data.favorecidoLabel || (data.direction === 'in' ? 'Pagador' : 'Favorecido')}: ${data.favorecido}`,
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
        className="max-w-[400px] p-0 border-0 bg-transparent shadow-none print-receipt-wrapper"
      >
        {loading || !data ? (
          <div className="rounded-3xl bg-card p-16 flex justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <div
              id="comprovante-print"
              className="print-receipt relative overflow-hidden rounded-3xl bg-card border border-border shadow-[0_24px_48px_-16px_rgba(0,0,0,0.6)]"
            >
              <div className="h-1.5 w-full bg-brand-orange" />

              <div className="relative p-6 flex flex-col gap-5">
                <div className="flex flex-col items-center gap-2.5">
                  <img
                    src={viaairLogo.url}
                    alt="VIA AIR"
                    className="h-12 w-auto object-contain"
                  />
                  <h1 className="text-3xl font-bold tracking-tight text-foreground tabular-nums mt-1">
                    {formatBRL(data.valor)}
                  </h1>
                  <p className="text-emerald-400 text-[11px] font-medium bg-emerald-400/10 px-3 py-1 rounded-full flex items-center gap-1.5">
                    <CheckCircle2 className="h-3 w-3" />
                    {data.concluido === false
                      ? (data.status ?? "Em processamento")
                      : data.direction === "in"
                        ? "Pagamento recebido"
                        : "Pagamento realizado"}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4 bg-muted/20 rounded-2xl p-4 border border-border">
                  <Field
                    label="Data do pagamento"
                    value={formatDate(data.dataPagamento ?? data.dataHora)}
                  />
                  <div className="text-right">
                    <Field
                      label="Forma de pagamento"
                      value={data.formaPagamento || data.tipo || "Pix"}
                    />
                  </div>
                  {data.chavePix ? (
                    <div className="col-span-2">
                      <Field label="Chave Pix" value={data.chavePix} />
                    </div>
                  ) : null}
                </div>

                <div className="space-y-4">
                  <PartyBlock title="Pagador" party={pagador} />
                  <div className="h-px w-full bg-border" />
                  <PartyBlock title="Destino (Recebedor)" party={recebedor} />
                </div>

                <div className="pt-4 border-t border-border">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-1.5">
                    ID da transação
                  </p>
                  <p className="text-[10px] font-mono text-muted-foreground break-all leading-snug">
                    {data.transacaoId || "—"}
                  </p>

                  <div className="flex items-center justify-between mt-5 opacity-60">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[9px] text-muted-foreground uppercase font-bold tracking-widest">
                        Processado por
                      </span>
                      <span className="text-[10px] font-black text-foreground tracking-tight">ASAAS</span>
                    </div>
                    <span className="text-[9px] text-muted-foreground">
                      Documento para simples conferência
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex gap-2 mt-2 print:hidden">
              <button
                onClick={compartilhar}
                className="flex-1 py-2 px-3 bg-muted/40 hover:bg-muted rounded-lg text-xs font-semibold text-foreground border border-border transition flex items-center justify-center gap-2"
              >
                <Share2 className="h-3.5 w-3.5" /> Compartilhar
              </button>
              <button
                onClick={() => {
                  if (data.pdfUrl) {
                    window.open(data.pdfUrl, "_blank", "noopener,noreferrer");
                    return;
                  }
                  window.print();
                }}
                className="flex-1 py-2 px-3 bg-brand-orange hover:brightness-95 rounded-lg text-xs font-semibold text-white shadow-[var(--shadow-glow)] transition flex items-center justify-center gap-2"
              >
                <Download className="h-3.5 w-3.5" /> Salvar PDF
              </button>
            </div>
          </>
        )}

      </DialogContent>
    </Dialog>
  );
}

function PartyBlock({ title, party }: { title: string; party: ReceiptParty }) {
  return (
    <div>
      <p className="text-[10px] text-muted-foreground uppercase font-semibold tracking-wider mb-1.5">
        {title}
      </p>
      <div className="flex flex-col gap-0.5">
        <p className="text-[11px] font-semibold text-foreground leading-snug break-words">
          {party.nome || "—"}
        </p>
        <p className="text-[10px] text-muted-foreground tabular-nums">
          {maskDoc(party.cpfCnpj)}
        </p>
        <p className="text-[10px] text-muted-foreground leading-snug break-words">
          {party.instituicao || "—"}
        </p>
      </div>
    </div>
  );
}


function Field({ label, value, clamp }: { label: string; value: string; clamp?: boolean }) {
  return (
    <div className="min-w-0">
      <span className="text-[9px] text-muted-foreground uppercase tracking-widest">{label}</span>
      <p
        className={`text-[11px] text-foreground font-medium leading-snug break-words ${clamp ? "line-clamp-2" : ""}`}
      >
        {value}
      </p>
    </div>
  );
}

export default ComprovanteReceipt;
