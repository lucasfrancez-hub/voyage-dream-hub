import { Loader2 } from "lucide-react";
import { PixQrPanel } from "@/components/pix/PixQrPanel";

/**
 * Overlay compartilhado com QR Pix (ASAAS), código copia-e-cola e contagem regressiva.
 * Usado no checkout de pacotes/ingressos/passeios e na mini-checkout de cruzeiros.
 * Layout: modelo 3 (cabeçalho laranja com cronômetro + barra de progresso).
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
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 backdrop-blur-sm p-4 animate-in fade-in duration-200 overflow-y-auto">
      <div className="w-full max-w-sm">
        <PixQrPanel
          qrCode={qrCode}
          valor={valor}
          expiraEm={expiraEm}
          variant="minimal"
        />
        <div className="mt-4 rounded-2xl border border-border bg-card p-4 text-center shadow-lg">
          <p className="text-sm text-muted-foreground">
            O QR Code também foi enviado para o seu e-mail.
          </p>
        </div>
        <div className="mt-4 flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          Aguardando confirmação do pagamento…
        </div>
        <button
          type="button"
          onClick={onClose}
          className="mt-3 w-full text-xs text-muted-foreground hover:text-foreground underline"
        >
          Fechar
        </button>
      </div>
    </div>
  );
}
