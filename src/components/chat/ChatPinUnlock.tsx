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
} from "@/lib/chat/device-session.functions";

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
        email: r.email,
        token_hash: r.tokenHash,
      });
      if (error) throw new Error(error.message);
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

/** Convite para criar o PIN logo após o login (só no aparelho ainda não registrado). */
export function ChatPinSetup({ onPronto }: { onPronto: () => void }) {
  const registrar = useServerFn(
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    (await0 as never) as never,
  );
  return null;
  void onPronto;
}
declare const await0: unknown;
