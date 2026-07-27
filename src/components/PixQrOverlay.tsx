import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { formatBRL } from "@/lib/format";

/**
 * Overlay compartilhado com QR Pix Itaú, código copia-e-cola e contagem regressiva.
 * Usado tanto no checkout de pacotes/ingressos quanto na mini-checkout de cruzeiros.
 */
export function PixQrOverlay({
  qrCode,
  valor,
  expiraEm,
  onClose,
}: {
  qrCode: string;
  valor: number;
  expiraEm: string;
  onClose: () => void;
}) {
  const [remaining, setRemaining] = useState(() =>
    Math.max(0, Math.floor((new Date(expiraEm).getTime() - Date.now()) / 1000)),
  );
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    const id = setInterval(() => setRemaining((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, []);
  const mm = String(Math.floor(remaining / 60)).padStart(2, "0");
  const ss = String(remaining % 60).padStart(2, "0");
  const qrImg = `https://api.qrserver.com/v1/create-qr-code/?size=280x280&margin=8&data=${encodeURIComponent(qrCode)}`;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 backdrop-blur-sm p-4 animate-in fade-in duration-200 overflow-y-auto">
      <div className="w-full max-w-md rounded-3xl border border-border bg-card p-6 md:p-8 shadow-2xl">
        <h2 className="font-display text-xl md:text-2xl font-bold text-foreground text-center">
          Pague com <span className="text-brand-orange">Pix</span>
        </h2>
        <p className="mt-1 text-xs text-muted-foreground text-center">
          Escaneie o QR ou copie o código
        </p>
        <div className="mt-4 flex justify-center">
          <img
            src={qrImg}
            alt="QR Code Pix"
            width={240}
            height={240}
            className="rounded-xl border border-border"
          />
        </div>
        <div className="mt-4 rounded-2xl bg-gradient-brand p-4 text-primary-foreground text-center">
          <div className="text-xs uppercase tracking-wider opacity-90">Valor</div>
          <div className="text-2xl font-bold">{formatBRL(valor)}</div>
          <div className="text-xs opacity-90 mt-1">
            Expira em {mm}:{ss}
          </div>
        </div>
        <div className="mt-4">
          <div className="text-xs font-semibold mb-1.5 text-muted-foreground">Pix copia e cola</div>
          <div className="rounded-xl border border-dashed border-border bg-background p-3 font-mono text-[11px] break-all leading-relaxed max-h-24 overflow-y-auto">
            {qrCode}
          </div>
          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText(qrCode);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
            className="mt-2 w-full rounded-full bg-brand-orange px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 transition"
          >
            {copied ? "Copiado!" : "Copiar código Pix"}
          </button>
        </div>
        <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground justify-center">
          <Loader2 className="h-3 w-3 animate-spin" />
          Aguardando confirmação do pagamento…
        </div>
        <button
          type="button"
          onClick={onClose}
          className="mt-4 w-full text-xs text-muted-foreground hover:text-foreground underline"
        >
          Fechar (o QR também foi enviado por e-mail)
        </button>
      </div>
    </div>
  );
}
