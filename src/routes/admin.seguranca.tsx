import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, ShieldCheck, ShieldAlert, Copy, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/admin/seguranca")({
  component: SecurityPage,
});

type Factor = { id: string; status: string; friendly_name?: string | null };

function SecurityPage() {
  const [factors, setFactors] = useState<Factor[]>([]);
  const [loading, setLoading] = useState(true);
  const [enrolling, setEnrolling] = useState(false);
  const [pending, setPending] = useState<{
    id: string;
    qr: string;
    secret: string;
    uri: string;
  } | null>(null);
  const [code, setCode] = useState("");

  async function refresh() {
    setLoading(true);
    const { data } = await supabase.auth.mfa.listFactors();
    setFactors((data?.totp ?? []) as Factor[]);
    setLoading(false);
  }

  useEffect(() => {
    refresh();
  }, []);

  async function startEnroll() {
    setEnrolling(true);
    try {
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: `Authenticator ${new Date().toLocaleDateString("pt-BR")}`,
      });
      if (error) throw error;
      setPending({
        id: data.id,
        qr: data.totp.qr_code,
        secret: data.totp.secret,
        uri: data.totp.uri,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao iniciar 2FA");
    } finally {
      setEnrolling(false);
    }
  }

  async function verifyEnroll(e: React.FormEvent) {
    e.preventDefault();
    if (!pending) return;
    try {
      const { data: challenge, error: ce } = await supabase.auth.mfa.challenge({ factorId: pending.id });
      if (ce) throw ce;
      const { error } = await supabase.auth.mfa.verify({
        factorId: pending.id,
        challengeId: challenge.id,
        code,
      });
      if (error) throw error;
      toast.success("2FA ativado com sucesso");
      setPending(null);
      setCode("");
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Código inválido");
    }
  }

  async function removeFactor(id: string) {
    if (!confirm("Remover este autenticador? Você perderá o segundo fator.")) return;
    const { error } = await supabase.auth.mfa.unenroll({ factorId: id });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Autenticador removido");
    refresh();
  }

  return (
    <div className="mx-auto max-w-3xl px-3 sm:px-6 py-6 sm:py-10">
      <div className="flex items-center gap-2 text-brand-orange text-xs uppercase tracking-widest">
        <ShieldCheck className="h-4 w-4" /> Segurança da conta
      </div>
      <h1 className="mt-1 font-display text-3xl font-bold">Autenticação em dois fatores (2FA)</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Proteja o painel com o Google Authenticator, Authy, 1Password ou qualquer app TOTP.
      </p>

      <section className="mt-8 rounded-2xl border border-border bg-card p-6">
        <h2 className="font-semibold">Autenticadores ativos</h2>
        {loading ? (
          <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
          </div>
        ) : factors.length === 0 ? (
          <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
            <ShieldAlert className="h-4 w-4 text-yellow-500" /> Nenhum autenticador configurado.
          </div>
        ) : (
          <ul className="mt-4 space-y-2">
            {factors.map((f) => (
              <li
                key={f.id}
                className="flex items-center justify-between rounded-xl border border-border px-4 py-3 text-sm"
              >
                <div>
                  <div className="font-medium">{f.friendly_name || "Authenticator"}</div>
                  <div className="text-xs text-muted-foreground">
                    Status: {f.status === "verified" ? "✅ verificado" : "⚠️ pendente"}
                  </div>
                </div>
                <button
                  onClick={() => removeFactor(f.id)}
                  className="inline-flex items-center gap-1 text-xs text-red-500 hover:underline"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Remover
                </button>
              </li>
            ))}
          </ul>
        )}

        {!pending && (
          <button
            onClick={startEnroll}
            disabled={enrolling}
            className="mt-6 inline-flex items-center gap-2 rounded-full bg-gradient-brand px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-glow)] hover:opacity-90 transition disabled:opacity-60"
          >
            {enrolling ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
            Adicionar novo autenticador
          </button>
        )}
      </section>

      {pending && (
        <section className="mt-6 rounded-2xl border border-brand-orange/40 bg-brand-orange/5 p-6">
          <h2 className="font-semibold">Escaneie o QR code</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Abra o Google Authenticator, toque em + e escaneie o código abaixo.
          </p>
          <div className="mt-4 flex flex-col md:flex-row gap-6 items-start">
            <div
              className="rounded-xl bg-white p-3"
              dangerouslySetInnerHTML={{ __html: pending.qr }}
            />
            <div className="flex-1 space-y-3">
              <div>
                <label className="text-xs text-muted-foreground">Ou digite este código manualmente:</label>
                <div className="mt-1 flex gap-2">
                  <code className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-xs font-mono break-all">
                    {pending.secret}
                  </code>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(pending.secret);
                      toast.success("Copiado");
                    }}
                    className="rounded-lg border border-border px-3 hover:border-brand-orange"
                  >
                    <Copy className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <form onSubmit={verifyEnroll} className="space-y-2">
                <label className="text-xs text-muted-foreground">Digite o código de 6 dígitos gerado:</label>
                <input
                  required
                  inputMode="numeric"
                  maxLength={6}
                  pattern="[0-9]{6}"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-center font-mono tracking-[0.5em] text-lg focus:outline-none focus:ring-2 focus:ring-brand-orange/40"
                  placeholder="000000"
                />
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={code.length !== 6}
                    className="flex-1 rounded-full bg-gradient-brand px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
                  >
                    Confirmar
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPending(null);
                      setCode("");
                    }}
                    className="rounded-full border border-border px-4 py-2.5 text-sm hover:border-brand-orange"
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
