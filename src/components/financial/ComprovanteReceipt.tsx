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
              className="print-receipt relative overflow-hidden rounded-2xl bg-card shadow-[0_24px_48px_-16px_rgba(0,0,0,0.6)]"
            >
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-brand-orange/10 via-transparent to-emerald-500/5" />
              <div className="absolute inset-x-0 top-0 h-1 bg-brand-orange" />

              <div className="relative px-5 py-4 flex flex-col items-center">
                <img
                  src={viaairLogo.url}
                  alt="VIA AIR"
                  className="h-5 w-auto mb-3 object-contain"
                />

                <div className="flex flex-col items-center mb-3 text-center">
                  <div className="w-8 h-8 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center mb-1.5">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  </div>
                  <h2 className="text-sm font-semibold text-foreground">
                    Comprovante {data.formaPagamento || data.tipo || "Pix"}
                  </h2>
                  <span className="text-muted-foreground text-[11px]">
                    {data.concluido === false
                      ? (data.status ?? "Em processamento")
                      : data.direction === "in"
                        ? "Pagamento recebido com sucesso"
                        : "Pagamento realizado com sucesso"}
                  </span>
                </div>

                <div className="text-center mb-3">
                  <span className="text-[9px] text-muted-foreground uppercase tracking-widest font-medium">
                    {data.direction === "in" ? "Valor recebido" : "Valor pago"}
                  </span>
                  <h1 className="text-2xl font-bold text-foreground tabular-nums leading-tight">
                    {formatBRL(data.valor)}
                  </h1>
                </div>

                <div className="w-full space-y-3">
                  <div className="grid grid-cols-2 gap-x-3 gap-y-2 bg-muted/20 border border-border rounded-xl p-3">
                    <Field
                      label="Data do pagamento"
                      value={formatDate(data.dataPagamento ?? data.dataHora)}
                    />
                    <Field label="Vencimento" value={formatDate(data.dataVencimento)} />
                    <Field
                      label="Forma de pagamento"
                      value={data.formaPagamento || data.tipo || "Pix"}
                    />
                    {data.chavePix ? <Field label="Chave Pix" value={data.chavePix} /> : null}
                    {data.descricao ? (
                      <div className="col-span-2">
                        <Field label="Descrição" value={data.descricao} clamp />
                      </div>
                    ) : null}
                  </div>

                  <div className="space-y-3">
                    <PartyBlock title="Dados do pagador" party={pagador} />
                    <PartyBlock title="Dados do recebedor" party={recebedor} />
                  </div>

                  <div>
                    <p className="text-[9px] text-muted-foreground uppercase tracking-widest font-semibold text-center mb-1">
                      ID da transação
                    </p>
                    <p className="text-[10px] font-mono text-muted-foreground bg-background/60 py-1.5 px-3 rounded-lg border border-border break-all text-center leading-snug">
                      {data.transacaoId || "—"}
                    </p>
                  </div>
                </div>

                <div className="mt-4 w-full pt-3 border-t border-border flex flex-col items-center gap-1">
                  <div className="flex items-center gap-2 opacity-60">
                    <span className="text-[9px] text-muted-foreground font-medium uppercase tracking-widest">
                      Processado por
                    </span>
                    <span className="text-[11px] font-bold text-foreground tracking-widest">ASAAS</span>
                  </div>
                  <p className="text-[9px] text-muted-foreground text-center leading-tight">
                    Documento gerado pelo sistema VIA AIR para simples conferência.
                  </p>
                </div>
              </div>

              <div className="absolute bottom-0 inset-x-0 h-1.5 bg-gradient-to-r from-transparent via-brand-orange/20 to-transparent" />
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
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <div className="h-px flex-1 bg-border" />
        <span className="text-[9px] uppercase font-bold tracking-widest text-muted-foreground whitespace-nowrap">
          {title}
        </span>
        <div className="h-px flex-1 bg-border" />
      </div>
      <div className="grid grid-cols-3 gap-x-3 gap-y-1 items-baseline">
        <span className="text-[11px] text-muted-foreground">Nome</span>
        <span className="col-span-2 text-[11px] font-medium text-foreground text-right leading-snug break-words">
          {party.nome || "—"}
        </span>
        <span className="text-[11px] text-muted-foreground">CPF/CNPJ</span>
        <span className="col-span-2 text-[11px] font-medium text-foreground text-right tabular-nums">
          {maskDoc(party.cpfCnpj)}
        </span>
        <span className="text-[11px] text-muted-foreground">Instituição</span>
        <span className="col-span-2 text-[11px] font-medium text-foreground text-right leading-snug break-words">
          {party.instituicao || "—"}
        </span>
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
