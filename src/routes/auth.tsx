import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, Lock, ArrowLeft, ShieldCheck, Copy, Smartphone, Mail } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import viaAirLogo from "@/assets/viaair-logo.png.asset.json";
import { checkTrustedDevice, registerTrustedDevice } from "@/lib/trusted-devices.functions";
import { requestLoginEmailCode, verifyLoginEmailCode } from "@/lib/login-email-code.functions";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Entrar no painel | VIA AIR" },
      { name: "description", content: "Acesso restrito ao painel administrativo VIA AIR." },
      { name: "robots", content: "noindex, nofollow, noarchive, nosnippet" },
      { property: "og:title", content: "Entrar no painel | VIA AIR" },
      { property: "og:description", content: "Acesso restrito ao painel administrativo VIA AIR." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

type Step = "credentials" | "email-code" | "mfa" | "enroll";

function AuthPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("credentials");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [emailCode, setEmailCode] = useState("");
  const [maskedEmail, setMaskedEmail] = useState<string | null>(null);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [trustDevice, setTrustDevice] = useState(true);
  const [enroll, setEnroll] = useState<{ id: string; qr: string; secret: string } | null>(null);

  // Destino pós-login: respeita ?redirect=/chat/inbox (usado pelo app do chat).
  const redirectTo = (() => {
    if (typeof window === "undefined") return "/admin";
    const r = new URLSearchParams(window.location.search).get("redirect");
    return r && r.startsWith("/") && !r.startsWith("//") ? r : "/admin";
  })();

  useEffect(() => {
    (async () => {
      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aal?.currentLevel === "aal2") {
        navigate({ to: redirectTo });
      }
    })();
  }, [navigate, redirectTo]);

  /** Inicia o desafio TOTP para o fator já verificado. */
  async function startMfaChallenge(verifiedFactorId: string) {
    const { data: challenge, error } = await supabase.auth.mfa.challenge({
      factorId: verifiedFactorId,
    });
    if (error) throw error;
    setFactorId(verifiedFactorId);
    setChallengeId(challenge.id);
    setStep("mfa");
  }

  /** Após signIn: (1) checa/força enrollment TOTP; (2) se device não é confiável,
   * envia código por e-mail; (3) só então segue para o TOTP. */
  async function postSignInFlow() {
    const { data: factors } = await supabase.auth.mfa.listFactors();
    const verified = factors?.totp?.find((f) => f.status === "verified");

    // Sem fator verificado → enrollment obrigatório (2FA nunca pulado).
    if (!verified) {
      for (const f of factors?.totp ?? []) {
        if (f.status !== "verified") {
          try { await supabase.auth.mfa.unenroll({ factorId: f.id }); } catch { /* ignore */ }
        }
      }
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: `Authenticator ${new Date().toLocaleDateString("pt-BR")}`,
      });
      if (error) throw error;
      setEnroll({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
      setStep("enroll");
      return;
    }

    // Device confiável? Se sim, pula APENAS o passo de e-mail (não o TOTP).
    let trusted = false;
    try {
      const res = await checkTrustedDevice();
      trusted = res.trusted;
    } catch { /* segue como não confiável */ }

    if (trusted) {
      await startMfaChallenge(verified.id);
      return;
    }

    // Device novo → dispara código por e-mail antes do TOTP.
    try {
      const ua = navigator.userAgent.split(") ")[0]?.replace("(", "").slice(0, 120);
      const { masked } = await requestLoginEmailCode({ data: { userAgent: ua } });
      setMaskedEmail(masked);
      setFactorId(verified.id); // guarda para usar depois
      setEmailCode("");
      setStep("email-code");
      toast.success("Enviamos um código para o seu e-mail");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao enviar código por e-mail");
      // Se o envio falhar, encerra a sessão para não deixar meio-logado.
      try { await supabase.auth.signOut({ scope: "local" }); } catch { /* ignore */ }
    }
  }

  async function handleEmailCode(e: React.FormEvent) {
    e.preventDefault();
    if (!factorId) return;
    setLoading(true);
    try {
      await verifyLoginEmailCode({ data: { code: emailCode } });
      // Código do e-mail OK → agora o TOTP.
      await startMfaChallenge(factorId);
      setOtp("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Código inválido");
    } finally {
      setLoading(false);
    }
  }

  async function resendEmailCode() {
    setLoading(true);
    try {
      const ua = navigator.userAgent.split(") ")[0]?.replace("(", "").slice(0, 120);
      const { masked } = await requestLoginEmailCode({ data: { userAgent: ua } });
      setMaskedEmail(masked);
      toast.success("Novo código enviado");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao reenviar código");
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const emailValue = String(fd.get("email") ?? email ?? "").trim();
    const passwordValue = String(fd.get("password") ?? password ?? "");
    if (!emailValue || !passwordValue) {
      toast.error("Informe e-mail e senha.");
      return;
    }
    setEmail(emailValue);
    setPassword(passwordValue);
    setLoading(true);
    try {
      try { await supabase.auth.signOut({ scope: "local" }); } catch { /* ignore */ }
      const { error } = await supabase.auth.signInWithPassword({ email: emailValue, password: passwordValue });
      if (error) throw error;
      await postSignInFlow();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro na autenticação";
      toast.error(
        message.toLowerCase().includes("invalid login credentials")
          ? "E-mail ou senha incorretos. Peça ao gestor para reenviar seu acesso."
          : message,
      );
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

      if (trustDevice) {
        try {
          await registerTrustedDevice({
            data: { label: navigator.userAgent.split(") ")[0]?.replace("(", "").slice(0, 60) },
          });
        } catch (err) {
          console.error("Falha ao registrar device confiável", err);
        }
      }
      toast.success("Verificação concluída");
      navigate({ to: redirectTo });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Código inválido");
    } finally {
      setLoading(false);
    }
  }

  async function handleEnroll(e: React.FormEvent) {
    e.preventDefault();
    if (!enroll) return;
    setLoading(true);
    try {
      const { data: challenge, error: ce } = await supabase.auth.mfa.challenge({ factorId: enroll.id });
      if (ce) throw ce;
      const { error } = await supabase.auth.mfa.verify({
        factorId: enroll.id,
        challengeId: challenge.id,
        code: otp,
      });
      if (error) throw error;

      if (trustDevice) {
        try {
          await registerTrustedDevice({
            data: { label: navigator.userAgent.split(") ")[0]?.replace("(", "").slice(0, 60) },
          });
        } catch (err) {
          console.error("Falha ao registrar device confiável", err);
        }
      }
      toast.success("Autenticador ativado. Bem-vindo!");
      navigate({ to: redirectTo });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Código inválido");
    } finally {
      setLoading(false);
    }
  }

  async function cancelEnroll() {
    if (enroll) {
      try { await supabase.auth.mfa.unenroll({ factorId: enroll.id }); } catch { /* ignore */ }
    }
    await supabase.auth.signOut({ scope: "local" });
    setEnroll(null);
    setOtp("");
    setStep("credentials");
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
          {step === "enroll" && enroll ? (
            <>
              <div className="flex items-center gap-2 text-brand-orange text-sm uppercase tracking-widest">
                <ShieldCheck className="h-4 w-4" /> Ative o 2FA (obrigatório)
              </div>
              <h1 className="mt-2 text-2xl font-display font-bold">Configure seu autenticador</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Escaneie o QR code no <strong>Google Authenticator</strong>, Authy ou 1Password e digite o código gerado.
              </p>
              <div className="mt-5 flex justify-center">
                <div className="rounded-xl bg-white p-3" dangerouslySetInnerHTML={{ __html: enroll.qr }} />
              </div>
              <div className="mt-3">
                <label className="text-xs text-muted-foreground">Ou digite manualmente:</label>
                <div className="mt-1 flex gap-2">
                  <code className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-xs font-mono break-all">
                    {enroll.secret}
                  </code>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(enroll.secret);
                      toast.success("Copiado");
                    }}
                    className="rounded-lg border border-border px-3 hover:border-brand-orange"
                  >
                    <Copy className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <form onSubmit={handleEnroll} className="mt-5 space-y-4">
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
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={loading || otp.length !== 6}
                    className="flex-1 inline-flex items-center justify-center gap-2 rounded-full bg-gradient-brand px-6 py-3 font-semibold text-primary-foreground shadow-[var(--shadow-glow)] hover:opacity-90 transition disabled:opacity-60"
                  >
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    Ativar e entrar
                  </button>
                  <button
                    type="button"
                    onClick={cancelEnroll}
                    className="rounded-full border border-border px-4 py-3 text-sm hover:border-brand-orange"
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            </>
          ) : step === "email-code" ? (
            <>
              <div className="flex items-center gap-2 text-brand-orange text-sm uppercase tracking-widest">
                <Mail className="h-4 w-4" /> Novo dispositivo detectado
              </div>
              <h1 className="mt-2 text-2xl font-display font-bold">Confirme pelo e-mail</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Enviamos um código de 6 dígitos para{" "}
                <strong className="text-foreground">{maskedEmail ?? "seu e-mail"}</strong>. Digite abaixo
                para liberar o acesso. Depois pediremos o código do autenticador.
              </p>
              <form onSubmit={handleEmailCode} className="mt-6 space-y-4">
                <input
                  required
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  value={emailCode}
                  onChange={(e) => setEmailCode(e.target.value.replace(/\D/g, ""))}
                  className="w-full rounded-xl border border-border bg-background px-3 py-3 text-center text-lg tracking-[0.5em] font-mono focus:outline-none focus:ring-2 focus:ring-brand-orange/40"
                  placeholder="000000"
                  autoFocus
                />
                <button
                  type="submit"
                  disabled={loading || emailCode.length !== 6}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-gradient-brand px-6 py-3 font-semibold text-primary-foreground shadow-[var(--shadow-glow)] hover:opacity-90 transition disabled:opacity-60"
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Confirmar código
                </button>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <button
                    type="button"
                    onClick={resendEmailCode}
                    disabled={loading}
                    className="hover:text-brand-orange underline underline-offset-2 disabled:opacity-50"
                  >
                    Reenviar código
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      try { await supabase.auth.signOut({ scope: "local" }); } catch { /* ignore */ }
                      setStep("credentials");
                      setEmailCode("");
                      setMaskedEmail(null);
                    }}
                    className="hover:text-brand-orange"
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            </>
          ) : step === "mfa" ? (
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
              <h1 className="mt-2 text-2xl font-display font-bold">Entrar no painel</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Acesse para gerenciar pacotes e reservas.
              </p>

              <form onSubmit={handleSubmit} method="post" action="#" className="mt-6 space-y-4">
                <div>
                  <label className="block text-xs text-muted-foreground mb-1.5">E-mail</label>
                  <input
                    required
                    name="email"
                    type="email"
                    autoComplete="username"
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
                    name="password"
                    type="password"
                    autoComplete="current-password"
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
                  Entrar
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
