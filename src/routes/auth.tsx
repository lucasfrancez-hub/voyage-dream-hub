import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, Lock, ArrowLeft, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import viaAirLogo from "@/assets/viaair-logo.png.asset.json";

export const Route = createFileRoute("/auth")({
  component: AuthPage,
});

type Step = "credentials" | "mfa";

function AuthPage() {
  const navigate = useNavigate();
  const [mode] = useState<"login" | "signup">("login");
  const [step, setStep] = useState<Step>("credentials");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [factorId, setFactorId] = useState<string | null>(null);
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (data && data.currentLevel && data.currentLevel === data.nextLevel && data.currentLevel !== null) {
        const { data: sess } = await supabase.auth.getSession();
        if (sess.session) navigate({ to: "/admin" });
      }
    })();
  }, [navigate]);

  async function ensureMfaOrEnter() {
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal?.nextLevel === "aal2" && aal.currentLevel === "aal1") {
      const { data: factors } = await supabase.auth.mfa.listFactors();
      const verified = factors?.totp?.find((f) => f.status === "verified");
      if (verified) {
        const { data: challenge, error } = await supabase.auth.mfa.challenge({ factorId: verified.id });
        if (error) throw error;
        setFactorId(verified.id);
        setChallengeId(challenge.id);
        setStep("mfa");
        return;
      }
    }
    navigate({ to: "/admin" });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/admin` },
        });
        if (error) throw error;
        toast.success("Conta criada! Se a confirmação por e-mail estiver ativa, verifique sua caixa.");
        navigate({ to: "/admin" });
        return;
      }
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      await ensureMfaOrEnter();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro na autenticação");
    } finally {
      setLoading(false);
    }
  }

  async function handleMfa(e: React.FormEvent) {
    e.preventDefault();
    if (!factorId || !challengeId) return;
    setLoading(true);
    try {
      const { error } = await supabase.auth.mfa.verify({ factorId, challengeId, code: otp });
      if (error) throw error;
      toast.success("Verificação concluída");
      navigate({ to: "/admin" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Código inválido");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="border-b border-border">
        <div className="mx-auto max-w-7xl px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3">
            <img src={viaAirLogo.url} alt="Via Air" className="h-9 w-auto" />
          </Link>
          <Link to="/" className="text-sm text-muted-foreground hover:text-brand-orange inline-flex items-center gap-2">
            <ArrowLeft className="h-4 w-4" /> Voltar
          </Link>
        </div>
      </header>

      <div className="flex-1 flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-[var(--shadow-card)]">
          {step === "mfa" ? (
            <>
              <div className="flex items-center gap-2 text-brand-orange text-sm uppercase tracking-widest">
                <ShieldCheck className="h-4 w-4" /> Verificação em 2 passos
              </div>
              <h1 className="mt-2 text-2xl font-display font-bold">Código do autenticador</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Abra o Google Authenticator e digite o código de 6 dígitos.
              </p>
              <form onSubmit={handleMfa} className="mt-6 space-y-4">
                <input
                  required
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                  className="w-full rounded-xl border border-border bg-background px-3 py-3 text-center text-lg tracking-[0.5em] font-mono focus:outline-none focus:ring-2 focus:ring-brand-orange/40"
                  placeholder="000000"
                  autoFocus
                />
                <button
                  type="submit"
                  disabled={loading || otp.length !== 6}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-gradient-brand px-6 py-3 font-semibold text-primary-foreground shadow-[var(--shadow-glow)] hover:opacity-90 transition disabled:opacity-60"
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Verificar
                </button>
              </form>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 text-brand-orange text-sm uppercase tracking-widest">
                <Lock className="h-4 w-4" /> Área restrita
              </div>
              <h1 className="mt-2 text-2xl font-display font-bold">
                {mode === "login" ? "Entrar no painel" : "Criar conta admin"}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {mode === "login"
                  ? "Acesse para gerenciar pacotes e reservas."
                  : "A primeira conta criada vira admin automaticamente."}
              </p>

              <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                <div>
                  <label className="block text-xs text-muted-foreground mb-1.5">E-mail</label>
                  <input
                    required
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-orange/40"
                    placeholder="voce@voeair.com"
                  />
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1.5">Senha</label>
                  <input
                    required
                    type="password"
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-orange/40"
                    placeholder="••••••••"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-gradient-brand px-6 py-3 font-semibold text-primary-foreground shadow-[var(--shadow-glow)] hover:opacity-90 transition disabled:opacity-60"
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {mode === "login" ? "Entrar" : "Criar conta"}
                </button>
              </form>

              <p className="mt-4 w-full text-center text-xs text-muted-foreground">
                Acesso restrito. Novos usuários são criados pelo gestor no painel administrativo.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
