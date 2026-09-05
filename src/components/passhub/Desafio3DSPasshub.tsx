/**
 * Modal de desafio 3DS para o checkout PassHub.
 *
 * Combina os modelos 1 (aprovar no app) e 2 (digitar código) em uma única
 * interface com abas. O iframe/host do desafio (Evervault/Rinne) continua
 * montado no container `challengeRef`, mesmo quando o banco usa notificação
 * silenciosa no app.
 */
import { useEffect, useRef, useState } from "react";
import { ShieldCheck, Smartphone, MessageSquare, Mail, Loader2, Clock, AlertCircle } from "lucide-react";

type Metodo = "app" | "sms" | "email";

interface Props {
  challengeRef: React.RefObject<HTMLDivElement | null>;
  bankName?: string;
  cardLast4?: string;
  valor?: number;
  parcelas?: number;
  onCancel: () => void;
  onConfirmManual?: (codigo: string) => void;
  /** true quando o desafio real do banco já está montado no container */
  challengeMounted?: boolean;
  processing?: boolean;
}

function brl(v = 0) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function Desafio3DSPasshub({
  challengeRef,
  bankName = "Seu banco",
  cardLast4 = "••••",
  valor = 0,
  parcelas = 1,
  onCancel,
  onConfirmManual,
  challengeMounted = false,
  processing = false,
}: Props) {
  const [metodo, setMetodo] = useState<Metodo>("app");
  const [codigo, setCodigo] = useState<string[]>(Array(6).fill(""));
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [timer, setTimer] = useState(300); // 5 min
  const [reenviarTimer, setReenviarTimer] = useState(30);

  useEffect(() => {
    const id = setInterval(() => {
      setTimer((t) => Math.max(0, t - 1));
      setReenviarTimer((t) => Math.max(0, t - 1));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  };

  const handleChange = (idx: number, value: string) => {
    const digit = value.replace(/\D/g, "").slice(-1);
    const next = [...codigo];
    next[idx] = digit;
    setCodigo(next);
    if (digit && idx < 5) inputRefs.current[idx + 1]?.focus();
  };

  const handleKeyDown = (idx: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !codigo[idx] && idx > 0) {
      inputRefs.current[idx - 1]?.focus();
    }
  };

  const codigoCompleto = codigo.join("");
  const podeConfirmarCodigo = codigoCompleto.length === 6;

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-background/90 p-4 backdrop-blur-md">
      <div className="relative w-full max-w-[420px] overflow-hidden rounded-3xl border border-border bg-card shadow-2xl">
        {/* Header */}
        <div className="relative overflow-hidden bg-gradient-to-br from-primary to-primary/70 px-6 py-5 text-primary-foreground">
          <div className="relative z-10 flex items-start justify-between">
            <div>
              <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-primary-foreground/80">
                <ShieldCheck className="h-3 w-3" /> Verificação 3-D Secure
              </p>
              <h2 className="mt-1 font-display text-xl font-semibold">Autenticação do banco</h2>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-foreground/20 text-lg font-bold">
              {bankName.slice(0, 1)}
            </div>
          </div>
          <div className="relative z-10 mt-4 flex items-center justify-between text-xs font-medium text-primary-foreground/90">
            <span>{bankName} •••• {cardLast4}</span>
            <span>{parcelas}x {brl(valor / Math.max(1, parcelas))}</span>
          </div>
        </div>

        {/* Tabs */}
        <div className={challengeMounted ? "hidden" : "grid grid-cols-3 gap-1 border-b border-border bg-muted/30 p-1">
          <Tab ativo={metodo === "app"} onClick={() => setMetodo("app")} icon={<Smartphone className="h-3.5 w-3.5" />} label="App" />
          <Tab ativo={metodo === "sms"} onClick={() => setMetodo("sms")} icon={<MessageSquare className="h-3.5 w-3.5" />} label="SMS" />
          <Tab ativo={metodo === "email"} onClick={() => setMetodo("email")} icon={<Mail className="h-3.5 w-3.5" />} label="E-mail" />
        </div>

        <div className="p-6">
          {metodo === "app" ? (
            <div className="space-y-5 text-center">
              <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-primary/10">
                <span className="text-3xl">📲</span>
              </div>
              <div>
                <h3 className="font-display text-lg font-semibold text-foreground">Confirme no app do banco</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Seu banco pediu uma confirmação extra para liberar esta compra.
                </p>
              </div>

              <div className="rounded-2xl border border-border bg-muted/30 p-4 text-left">
                <ol className="space-y-3 text-sm text-foreground">
                  <li className="flex gap-3">
                    <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">1</span>
                    <span>Abra o app do <b>{bankName}</b> no celular</span>
                  </li>
                  <li className="flex gap-3">
                    <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">2</span>
                    <span>Toque na notificação de compra <b>VIA AIR TURISMO</b></span>
                  </li>
                  <li className="flex gap-3">
                    <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">3</span>
                    <span>Aprove e volte para esta tela</span>
                  </li>
                </ol>
              </div>

              <div className="space-y-2">
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-all duration-1000"
                    style={{ width: `${Math.max(5, (timer / 300) * 100)}%` }}
                  />
                </div>
                <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  Aguardando aprovação · <b className="text-foreground">{formatTime(timer)}</b>
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-4 text-center">
              <div>
                <h3 className="font-display text-lg font-semibold text-foreground">Digite o código de verificação</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Enviamos um código de 6 dígitos para o {metodo === "sms" ? "celular" : "e-mail"} cadastrado no banco.
                </p>
              </div>

              <div className="flex justify-between gap-2">
                {codigo.map((d, i) => (
                  <input
                    key={i}
                    ref={(el) => { inputRefs.current[i] = el; }}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={d}
                    onChange={(e) => handleChange(i, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(i, e)}
                    className="h-14 w-11 rounded-xl border border-border bg-background text-center font-display text-xl font-bold text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                ))}
              </div>

              <p className="text-xs text-muted-foreground">
                Não recebeu?{" "}
                {reenviarTimer > 0 ? (
                  <span>Reenviar em {formatTime(reenviarTimer)}</span>
                ) : (
                  <button type="button" className="font-semibold text-primary hover:underline" onClick={() => setReenviarTimer(30)}>
                    Reenviar código
                  </button>
                )}
              </p>
            </div>
          )}

          {/* Container do desafio real (Evervault/Rinne) — mantido no DOM mesmo quando invisível */}
          <div ref={challengeRef} className="sr-only" />

          {processing ? (
            <p className="mt-5 flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Aguardando confirmação do banco…
            </p>
          ) : null}

          <div className="mt-5 space-y-2">
            {metodo !== "app" ? (
              <button
                type="button"
                disabled={!podeConfirmarCodigo || processing}
                onClick={() => onConfirmManual?.(codigoCompleto)}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3.5 font-display font-semibold text-primary-foreground shadow-lg transition hover:opacity-90 active:scale-[0.98] disabled:opacity-50"
              >
                Confirmar código
              </button>
            ) : null}
            <button
              type="button"
              onClick={onCancel}
              disabled={processing}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-transparent py-3.5 text-sm font-semibold text-muted-foreground transition hover:bg-muted disabled:opacity-50"
            >
              <AlertCircle className="h-4 w-4" /> Cancelar pagamento
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Tab({
  ativo,
  onClick,
  icon,
  label,
}: {
  ativo: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-semibold transition ${
        ativo ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
