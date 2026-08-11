import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, FileText, Loader2, Share2 } from "lucide-react";
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
  /** ---- Campos exclusivos de comprovante de BOLETO ---- */
  tipoDocumento?: "pix" | "boleto";
  linhaDigitavel?: string | null;
  codigoBarras?: string | null;
  valorOriginal?: number | null;
  juros?: number | null;
  multa?: number | null;
  desconto?: number | null;
  /** Autenticação / identificador retornado pelo ASAAS ou banco */
  autenticacao?: string | null;
  /** Referência interna VIA AIR (nunca substitui o identificador oficial) */
  referenciaInterna?: string | null;
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
  autoAction = null,
  onAutoActionDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  data: ReceiptData | null;
  loading?: boolean;
  /** Executa automaticamente ao abrir: baixar imagem ou compartilhar. */
  autoAction?: "download" | "share" | null;
  onAutoActionDone?: () => void;
}) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [busy, setBusy] = useState<null | "download" | "share">(null);
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

  const fileName = `comprovante-viaair-${(data?.transacaoId || "pix").slice(0, 12)}.png`;

  const gerarPng = useCallback(async (): Promise<Blob | null> => {
    const node = cardRef.current;
    if (!node) return null;
    const { toBlob } = await import("html-to-image");
    const bg = getComputedStyle(document.body).backgroundColor || "#0b0f14";
    return await toBlob(node, { pixelRatio: 3, cacheBust: true, backgroundColor: bg });
  }, []);

  const baixarImagem = useCallback(async () => {
    setBusy("download");
    try {
      const blob = await gerarPng();
      if (!blob) throw new Error("sem imagem");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      toast.success("Imagem do comprovante baixada.");
    } catch {
      toast.error("Não foi possível gerar a imagem do comprovante.");
    } finally {
      setBusy(null);
    }
  }, [gerarPng, fileName]);

  const compartilhar = useCallback(async () => {
    if (!data) return;
    setBusy("share");
    try {
      const blob = await gerarPng();
      const nav = navigator as Navigator & {
        share?: (d: ShareData) => Promise<void>;
        canShare?: (d: ShareData) => boolean;
      };
      if (blob) {
        const file = new File([blob], fileName, { type: "image/png" });
        if (nav.share && (!nav.canShare || nav.canShare({ files: [file] }))) {
          try {
            await nav.share({ files: [file], title: "Comprovante VIA AIR" });
            return;
          } catch {
            /* cancelado */
          }
        }
        // Sem compartilhamento de arquivo: tenta copiar a imagem, senão baixa
        try {
          const CI = (window as unknown as { ClipboardItem?: typeof ClipboardItem }).ClipboardItem;
          if (CI && navigator.clipboard && "write" in navigator.clipboard) {
            await navigator.clipboard.write([new CI({ "image/png": blob })]);
            toast.success("Imagem copiada — cole no WhatsApp.");
            return;
          }
        } catch {
          /* segue para download */
        }
        await baixarImagem();
        toast.info("Imagem baixada — anexe no WhatsApp.");
        return;
      }
      toast.error("Não foi possível gerar a imagem do comprovante.");
    } finally {
      setBusy(null);
    }
  }, [data, gerarPng, fileName, baixarImagem]);

  useEffect(() => {
    if (!open || !autoAction || !data || loading) return;
    const t = setTimeout(() => {
      const run = autoAction === "share" ? compartilhar : baixarImagem;
      void run().finally(() => onAutoActionDone?.());
    }, 350);
    return () => clearTimeout(t);
  }, [open, autoAction, data, loading, compartilhar, baixarImagem, onAutoActionDone]);

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
              ref={cardRef}
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
                  <PartyBlock title="Recebedor" party={recebedor} />
                </div>

                <div className="pt-4 border-t border-border">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-1.5">
                    ID da transação
                  </p>
                  <p className="text-[10px] font-mono text-muted-foreground break-all leading-snug">
                    {data.transacaoId || "—"}
                  </p>

                  <div className="mt-5 flex flex-col items-center gap-1 opacity-60">
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] text-muted-foreground uppercase font-medium tracking-widest">
                        Processado por
                      </span>
                      <span className="text-[11px] font-bold text-foreground tracking-widest">ASAAS</span>
                    </div>
                    <span className="text-[9px] text-muted-foreground text-center leading-tight">
                      Documento gerado pelo sistema VIA AIR para simples conferência.
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex gap-2 mt-2 print:hidden">
              <button
                onClick={compartilhar}
                disabled={busy !== null}
                className="flex-1 py-2 px-3 bg-muted/40 hover:bg-muted rounded-lg text-xs font-semibold text-foreground border border-border transition flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {busy === "share" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Share2 className="h-3.5 w-3.5" />
                )}
                Compartilhar
              </button>
              {data?.pdfUrl ? (
                <button
                  onClick={() => window.open(data.pdfUrl!, "_blank", "noopener,noreferrer")}
                  disabled={busy !== null}
                  className="flex-1 py-2 px-3 bg-brand-orange hover:brightness-95 rounded-lg text-xs font-semibold text-white shadow-[var(--shadow-glow)] transition flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  <FileText className="h-3.5 w-3.5" />
                  Salvar PDF
                </button>
              ) : null}
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
