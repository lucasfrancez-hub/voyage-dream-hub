import { useState } from "react";
import { Loader2, Sparkles, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type Props = {
  aberto: boolean;
  onFechar: () => void;
  onEntrou: () => void;
};

/**
 * Login da nuvem do EditAir (usado principalmente no Desktop, que abre sem login).
 * Autentica no backend VIA AIR e guarda a sessão; a partir daí os serverFn de IA
 * recebem o Authorization automaticamente pelo middleware global.
 */
export function LoginNuvemDialog({ aberto, onFechar, onEntrou }: Props) {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  if (!aberto) return null;

  const entrar = async () => {
    setErro("");
    setEnviando(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: senha });
    setEnviando(false);
    if (error) {
      setErro(error.message === "Invalid login credentials" ? "E-mail ou senha inválidos." : error.message);
      return;
    }
    setSenha("");
    onEntrou();
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onPointerDown={onFechar}>
      <div
        className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#12171d] p-5 shadow-2xl"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start gap-2">
          <Sparkles className="mt-0.5 h-4 w-4 text-[#F26B1F]" />
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold text-white">Entrar para usar a IA</h2>
            <p className="text-[11px] text-white/45">A edição roda no seu computador; a IA usa sua conta VIA AIR.</p>
          </div>
          <button onClick={onFechar} className="rounded p-1 text-white/40 hover:bg-white/10 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            void entrar();
          }}
        >
          <input
            autoFocus
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="E-mail"
            className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-[13px] text-white outline-none placeholder:text-white/30 focus:border-[#F26B1F]/60"
          />
          <input
            type="password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            placeholder="Senha"
            className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-[13px] text-white outline-none placeholder:text-white/30 focus:border-[#F26B1F]/60"
          />
          {erro ? <p className="text-[11px] text-red-400">{erro}</p> : null}
          <button
            type="submit"
            disabled={enviando || !email.trim() || !senha}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#F26B1F] px-3 py-2 text-[13px] font-semibold text-black transition hover:brightness-110 disabled:opacity-40"
          >
            {enviando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Entrar
          </button>
        </form>
      </div>
    </div>
  );
}
