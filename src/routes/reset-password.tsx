import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CheckCircle2, KeyRound, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import viaAirLogo from "@/assets/viaair-logo.png.asset.json";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Definir senha | VIA AIR" },
      { name: "description", content: "Defina sua senha de acesso ao painel VIA AIR." },
      { property: "og:title", content: "Definir senha | VIA AIR" },
      { property: "og:description", content: "Defina sua senha de acesso ao painel VIA AIR." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [validSession, setValidSession] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let active = true;
    const currentUrl = new URL(window.location.href);
    const hashParams = new URLSearchParams(currentUrl.hash.slice(1));
    const code = currentUrl.searchParams.get("code");
    const tokenHash = currentUrl.searchParams.get("token_hash");
    const recoveryInUrl =
      hashParams.get("type") === "recovery" ||
      currentUrl.searchParams.get("type") === "recovery" ||
      Boolean(code) ||
      Boolean(tokenHash) ||
      hashParams.has("access_token");

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if (event === "PASSWORD_RECOVERY" || (recoveryInUrl && session)) {
        setValidSession(true);
      }
      setReady(true);
    });

    async function activateRecoverySession() {
      try {
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        } else if (tokenHash) {
          const { error } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: "recovery",
          });
          if (error) throw error;
        }

        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;
        if (!active) return;
        setValidSession(Boolean(data.session) && recoveryInUrl);

        if (data.session && (code || tokenHash)) {
          window.history.replaceState({}, "", "/reset-password");
        }
      } catch {
        if (active) setValidSession(false);
      } finally {
        if (active) setReady(true);
      }
    }

    void activateRecoverySession();
    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password.length < 8) return void toast.error("A senha precisa ter pelo menos 8 caracteres.");
    if (password !== confirmPassword) return void toast.error("As senhas não coincidem.");
    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setDone(true);
      toast.success("Senha definida com sucesso.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível definir a senha.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex h-16 max-w-7xl items-center px-6">
          <Link to="/"><img src={viaAirLogo.url} alt="VIA AIR" className="h-9 w-auto" /></Link>
        </div>
      </header>
      <main className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-md items-center px-6 py-12">
        <section className="w-full rounded-lg border border-border bg-card p-7 shadow-[var(--shadow-card)]">
          {!ready ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-brand-orange" /></div>
          ) : done ? (
            <div className="text-center">
              <CheckCircle2 className="mx-auto h-10 w-10 text-brand-orange" />
              <h1 className="mt-4 text-2xl font-bold">Senha definida</h1>
              <p className="mt-2 text-sm text-muted-foreground">Seu acesso está pronto. Você já pode entrar no painel.</p>
              <button onClick={() => navigate({ to: "/admin", replace: true })} className="mt-6 inline-flex w-full justify-center rounded-full bg-primary px-5 py-3 font-semibold text-primary-foreground">Entrar no painel</button>
            </div>
          ) : validSession ? (
            <>
              <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-brand-orange"><KeyRound className="h-4 w-4" /> Primeiro acesso</div>
              <h1 className="mt-2 text-2xl font-bold">Defina sua senha</h1>
              <p className="mt-2 text-sm text-muted-foreground">Crie a senha que você usará para acessar o painel VIA AIR.</p>
              <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                <label className="block"><span className="mb-1.5 block text-xs text-muted-foreground">Nova senha</span><input type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} /></label>
                <label className="block"><span className="mb-1.5 block text-xs text-muted-foreground">Confirmar senha</span><input type="password" autoComplete="new-password" required minLength={8} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className={inputClass} /></label>
                <button type="submit" disabled={saving} className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary px-5 py-3 font-semibold text-primary-foreground disabled:opacity-60">{saving && <Loader2 className="h-4 w-4 animate-spin" />} Salvar senha</button>
              </form>
            </>
          ) : (
            <div className="text-center">
              <KeyRound className="mx-auto h-10 w-10 text-muted-foreground" />
              <h1 className="mt-4 text-2xl font-bold">Link inválido ou expirado</h1>
              <p className="mt-2 text-sm text-muted-foreground">Peça ao gestor para reenviar o e-mail de acesso pelo cadastro de usuários.</p>
              <Link to="/auth" className="mt-6 inline-flex text-sm font-semibold text-brand-orange hover:underline">Voltar ao login</Link>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

const inputClass = "w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-orange/40";