import { useEffect, useState } from "react";
import { Check, Copy, QrCode, Timer } from "lucide-react";
import { formatBRL } from "@/lib/format";

export type PixQrVariant = "anel" | "barra" | "minimal";

/** Duração padrão do QR Pix (minutos) — mantida em sincronia com pix.functions.ts */
export const PIX_QR_MINUTES = 30;

function useCountdown(expiraEm: string, totalSeconds: number) {
  const calc = () =>
    Math.max(0, Math.floor((new Date(expiraEm).getTime() - Date.now()) / 1000));
  const [remaining, setRemaining] = useState(calc);
  useEffect(() => {
    const id = setInterval(() => setRemaining(calc()), 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expiraEm]);
  const pct = Math.max(0, Math.min(1, remaining / Math.max(totalSeconds, 1)));
  const mm = String(Math.floor(remaining / 60)).padStart(2, "0");
  const ss = String(remaining % 60).padStart(2, "0");
  return { remaining, pct, label: `${mm}:${ss}`, expired: remaining <= 0 };
}

function qrImageUrl(payload: string, size = 300) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&margin=6&data=${encodeURIComponent(
    payload,
  )}`;
}

function CopyBlock({ qrCode }: { qrCode: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mt-4">
      <div className="rounded-xl border border-dashed border-border bg-background/60 p-3 font-mono text-[11px] leading-relaxed break-all max-h-20 overflow-y-auto text-muted-foreground">
        {qrCode}
      </div>
      <button
        type="button"
        onClick={() => {
          navigator.clipboard.writeText(qrCode);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}
        className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-full bg-brand-orange px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 transition"
      >
        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        {copied ? "Código copiado!" : "Copiar código Pix"}
      </button>
    </div>
  );
}

export interface PixQrPanelProps {
  qrCode: string;
  valor: number;
  expiraEm: string;
  variant?: PixQrVariant;
  totalSeconds?: number;
}

/** Painel do QR Code Pix — QR + copia e cola + indicador de tempo. */
export function PixQrPanel({
  qrCode,
  valor,
  expiraEm,
  variant = "anel",
  totalSeconds = PIX_QR_MINUTES * 60,
}: PixQrPanelProps) {
  const { pct, label, expired } = useCountdown(expiraEm, totalSeconds);

  if (variant === "barra") {
    return (
      <div className="w-full max-w-sm rounded-3xl border border-border bg-card p-6 shadow-xl">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-gradient-brand transition-[width] duration-1000 ease-linear"
            style={{ width: `${pct * 100}%` }}
          />
        </div>
        <div className="mt-2 flex items-center justify-between text-xs">
          <span className="text-muted-foreground">
            {expired ? "QR expirado" : "Este QR expira em"}
          </span>
          <span className="font-mono font-semibold text-brand-orange tabular-nums">
            {label}
          </span>
        </div>

        <div className="mt-5 flex justify-center">
          <img
            src={qrImageUrl(qrCode)}
            alt="QR Code Pix"
            width={220}
            height={220}
            className="rounded-2xl border border-border bg-white p-2"
          />
        </div>

        <div className="mt-4 text-center">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Valor
          </div>
          <div className="font-display text-3xl font-bold text-foreground">
            {formatBRL(valor)}
          </div>
        </div>

        <CopyBlock qrCode={qrCode} />
      </div>
    );
  }

  if (variant === "minimal") {
    return (
      <div className="w-full max-w-sm overflow-hidden rounded-3xl border border-border bg-card shadow-xl">
        <div className="flex items-center justify-between bg-gradient-brand px-5 py-3 text-primary-foreground">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <QrCode className="h-4 w-4" /> Pix
          </div>
          <div className="flex items-center gap-1.5 rounded-full bg-black/20 px-2.5 py-1 text-xs font-mono tabular-nums">
            <Timer className="h-3.5 w-3.5" />
            {label}
          </div>
        </div>

        <div className="p-6">
          <div className="relative mx-auto w-fit">
            <img
              src={qrImageUrl(qrCode)}
              alt="QR Code Pix"
              width={220}
              height={220}
              className="rounded-2xl border border-border bg-white p-2"
            />
            {expired && (
              <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-background/80 text-sm font-semibold text-muted-foreground backdrop-blur-sm">
                QR expirado
              </div>
            )}
          </div>

          <div className="mt-4 flex items-baseline justify-between">
            <span className="text-xs uppercase tracking-wider text-muted-foreground">
              Valor
            </span>
            <span className="font-display text-2xl font-bold text-brand-orange">
              {formatBRL(valor)}
            </span>
          </div>

          <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-brand-orange transition-[width] duration-1000 ease-linear"
              style={{ width: `${pct * 100}%` }}
            />
          </div>

          <CopyBlock qrCode={qrCode} />
        </div>
      </div>
    );
  }

  // variant "anel" — anel de progresso ao redor do QR
  const size = 268;
  const stroke = 6;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;

  return (
    <div className="w-full max-w-sm rounded-3xl border border-border bg-card p-6 shadow-xl">
      <div className="relative mx-auto" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          className="absolute inset-0 -rotate-90"
          aria-hidden
        >
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            strokeWidth={stroke}
            className="stroke-muted"
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - pct)}
            className="stroke-brand-orange transition-[stroke-dashoffset] duration-1000 ease-linear"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <img
            src={qrImageUrl(qrCode)}
            alt="QR Code Pix"
            width={196}
            height={196}
            className="rounded-2xl bg-white p-2"
          />
        </div>
      </div>

      <div className="mt-3 flex items-center justify-center gap-2 text-xs text-muted-foreground">
        <Timer className="h-3.5 w-3.5 text-brand-orange" />
        {expired ? (
          <span className="font-semibold">QR expirado — gere um novo</span>
        ) : (
          <>
            expira em{" "}
            <span className="font-mono font-semibold tabular-nums text-brand-orange">
              {label}
            </span>
          </>
        )}
      </div>

      <div className="mt-4 rounded-2xl bg-gradient-brand p-4 text-center text-primary-foreground">
        <div className="text-[11px] uppercase tracking-wider opacity-90">Valor</div>
        <div className="text-2xl font-bold">{formatBRL(valor)}</div>
      </div>

      <CopyBlock qrCode={qrCode} />
    </div>
  );
}
