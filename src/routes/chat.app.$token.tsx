/**
 * Abertura do Chat pelo link secreto do app (igual à Agenda):
 * o aparelho digita o PIN de 4 números e entra sem login, por 30 dias.
 */
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, MessageSquare } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { abrirLinkChat, renovarSessaoAparelhoChat } from "@/lib/chat/device-session.functions";
import { garantirVersaoAtual } from "@/lib/app-version";

export const Route = createFileRoute("/chat/app/$token")({
  ssr: false,
  component: AbrirAppChat,
  head: () => ({
    meta: [
      { title: "Abrir Chat — VIA AIR" },
      { name: "description", content: "Acesso rápido à Central de Atendimento VIA AIR por PIN." },
      { property: "og:title", content: "Abrir Chat — VIA AIR" },
      { property: "og:description", content: "Acesso rápido à Central de Atendimento VIA AIR por PIN." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

function AbrirAppChat() {
  const { token } = Route.useParams();
  const navigate = useNavigate();
  const abrir = useServerFn(abrirLinkChat);
  const renovar = useServerFn(renovarSessaoAparelhoChat);
  const [pin, setPin] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [verificando, setVerificando] = useState(true);

  // Antes de entrar na Caixa de Entrada, confere se este aparelho está na
  // versão publicada. Se estiver velho, atualiza primeiro — assim o app nunca
  // tenta importar um chunk que já foi removido pelo deploy.
  const irParaInbox = async () => {
    if (await garantirVersaoAtual("pre-chat-inbox")) return;
    await navigate({ to: "/chat/inbox" });
  };

  // Se este aparelho já entrou pelo link antes (cookie de 30 dias), entra
  // direto: nada de login, senha ou autenticador.
  useEffect(() => {
    void (async () => {
      try {
        const s = await supabase.auth.getSession();
        if (s.data.session) {
          await irParaInbox();
          return;
        }
        const r = (await renovar()) as { ok: boolean; email?: string; tokenHash?: string };
        if (r.ok && r.email && r.tokenHash) {
          const { error } = await supabase.auth.verifyOtp({
            type: "magiclink",
            token_hash: r.tokenHash,
          });
          if (!error) {
            await irParaInbox();
            return;
          }
        }
      } catch {
        /* pede o PIN */
      }
      setVerificando(false);
    })();
  }, [navigate, renovar]);


  const entrar = async () => {
    if (pin.length !== 4) return;
    setCarregando(true);
    try {
      const r = (await abrir({ data: { token, pin, destino: "chat" } })) as {
        email?: string;
        tokenHash?: string;
        redirecionar?: "chat" | "admin";
      };
      if (r.redirecionar === "admin") {
        window.location.replace(`/admin/app/${token}`);
        return;
      }
      if (!r.email || !r.tokenHash) throw new Error("Link inválido ou desativado.");
      const { error } = await supabase.auth.verifyOtp({
        type: "magiclink",
        token_hash: r.tokenHash,
      });
      if (error) throw new Error(error.message);
      await irParaInbox();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível entrar.");
      setPin("");
    } finally {
      setCarregando(false);
    }
  };

  if (verificando) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-muted/40">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </main>
    );
  }

  return (

    <main className="flex min-h-screen items-center justify-center bg-muted/40 p-6">
      <div className="w-full max-w-xs rounded-2xl border border-border bg-background p-6 text-center shadow-sm">
        <MessageSquare className="mx-auto h-8 w-8 text-primary" />
        <h1 className="mt-3 text-lg font-semibold text-foreground">Central VIA AIR</h1>
        <p className="mt-1 text-sm text-muted-foreground">Digite o PIN de 4 números deste aparelho.</p>
        <Input
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
          onKeyDown={(e) => e.key === "Enter" && void entrar()}
          inputMode="numeric"
          autoFocus
          placeholder="••••"
          className="mt-4 text-center text-xl tracking-[0.5em]"
        />
        <Button className="mt-4 w-full" disabled={pin.length !== 4 || carregando} onClick={() => void entrar()}>
          {carregando ? <Loader2 className="h-4 w-4 animate-spin" /> : "Entrar"}
        </Button>
      </div>
    </main>
  );
}
