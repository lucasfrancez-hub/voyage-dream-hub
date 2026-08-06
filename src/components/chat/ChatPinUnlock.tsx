/**
 * Tela de PIN do Chat: mantém o aplicativo logado por 30 dias neste aparelho.
 * Mostrada quando a sessão do Supabase caiu mas o aparelho está registrado.
 */
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Lock } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  desbloquearAparelhoChat,
  esquecerAparelhoChat,
  registrarAparelhoChat,
} from "@/lib/chat/device-session.functions";
import { garantirVersaoAtual } from "@/lib/app-version";

/** Storage do Safari pode lançar exceção (modo privado/PWA): nunca derruba a tela. */
function guardarLocal(chave: string, valor: string) {
  try {
    localStorage.setItem(chave, valor);
  } catch (error) {
    console.warn("[VIA AIR] localStorage indisponível:", chave, error);
  }
}

export function ChatPinUnlock({ email, onEntrar }: { email: string | null; onEntrar: () => void }) {
  const desbloquear = useServerFn(desbloquearAparelhoChat);
  const esquecer = useServerFn(esquecerAparelhoChat);
  const [pin, setPin] = useState("");
  const [carregando, setCarregando] = useState(false);

  const entrar = async () => {
    if (!/^\d{4,8}$/.test(pin)) {
      toast.error("Digite o PIN de 4 a 8 dígitos.");
      return;
    }
    setCarregando(true);
    try {
      const r = await desbloquear({ data: { pin } });
      const { error } = await supabase.auth.verifyOtp({
        type: "magiclink",
        token_hash: r.tokenHash,
      });
      if (error) throw new Error(error.message);
      // Se este aparelho está com build antiga, atualiza antes de abrir o Chat.
      if (await garantirVersaoAtual("pos-pin")) return;
      onEntrar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível entrar.");
      setPin("");
    } finally {
      setCarregando(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-xs text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Lock className="h-5 w-5" />
        </div>
        <h1 className="text-xl font-semibold text-foreground">Entrar no Chat</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {email ? `Conta ${email}` : "Digite o PIN deste aparelho"}
        </p>
        <Input
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 8))}
          onKeyDown={(e) => {
            if (e.key === "Enter") void entrar();
          }}
          inputMode="numeric"
          autoFocus
          placeholder="••••"
          className="mt-5 text-center text-2xl tracking-[0.5em]"
        />
        <Button className="mt-4 w-full" onClick={() => void entrar()} disabled={carregando}>
          {carregando ? <Loader2 className="h-4 w-4 animate-spin" /> : "Entrar"}
        </Button>
        <button
          type="button"
          className="mt-4 text-xs text-muted-foreground underline"
          onClick={async () => {
            await esquecer();
            window.location.replace("/auth?redirect=/chat/inbox");
          }}
        >
          Entrar com outra conta
        </button>
      </div>
    </div>
  );
}

/** Convite para criar o PIN logo após o login (aparelho ainda não registrado). */
export function ChatPinSetup({ onFechar }: { onFechar: () => void }) {
  const registrar = useServerFn(registrarAparelhoChat);
  const [pin, setPin] = useState("");
  const [confirma, setConfirma] = useState("");
  const [salvando, setSalvando] = useState(false);

  const salvar = async () => {
    if (!/^\d{4,8}$/.test(pin)) return toast.error("Use de 4 a 8 dígitos.");
    if (pin !== confirma) return toast.error("Os PINs não conferem.");
    setSalvando(true);
    try {
      await registrar({ data: { pin, label: navigator.userAgent.slice(0, 60) } });
      guardarLocal("viaair-chat-pin-ok", "1");
      toast.success("Pronto! Este aparelho fica conectado por 30 dias.");
      onFechar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar o PIN.");
    } finally {
      setSalvando(false);
    }
  };

  const dispensar = () => {
    guardarLocal("viaair-chat-pin-ok", "adiado");
    onFechar();
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-6 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-background p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-foreground">Manter conectado 30 dias</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Crie um PIN para reentrar rápido no app do Chat sem precisar fazer login de novo.
        </p>
        <Input
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 8))}
          inputMode="numeric"
          placeholder="PIN (4 a 8 dígitos)"
          className="mt-4 text-center tracking-[0.4em]"
        />
        <Input
          value={confirma}
          onChange={(e) => setConfirma(e.target.value.replace(/\D/g, "").slice(0, 8))}
          inputMode="numeric"
          placeholder="Confirmar PIN"
          className="mt-2 text-center tracking-[0.4em]"
        />
        <Button className="mt-4 w-full" onClick={() => void salvar()} disabled={salvando}>
          {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : "Ativar"}
        </Button>
        <button type="button" className="mt-3 w-full text-xs text-muted-foreground underline" onClick={dispensar}>
          Agora não
        </button>
      </div>
    </div>
  );
}
