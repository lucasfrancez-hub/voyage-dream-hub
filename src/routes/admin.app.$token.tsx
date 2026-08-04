/**
 * Abertura do painel Admin pelo link secreto (mesmo token/PIN do app do Chat):
 * entra sem login, senha ou autenticação de dois fatores, por 30 dias.
 */
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, ShieldCheck } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { abrirLinkChat, renovarSessaoAparelhoChat } from "@/lib/chat/device-session.functions";

export const Route = createFileRoute("/admin/app/$token")({
  ssr: false,
  component: AbrirAppAdmin,
  head: () => ({
    meta: [
      { title: "Abrir Admin — VIA AIR" },
      { name: "description", content: "Acesso rápido ao painel Admin da VIA AIR por PIN." },
      { property: "og:title", content: "Abrir Admin — VIA AIR" },
      { property: "og:description", content: "Acesso rápido ao painel Admin da VIA AIR por PIN." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

function AbrirAppAdmin() {
  const { token } = Route.useParams();
  const navigate = useNavigate();
  const abrir = useServerFn(abrirLinkChat);
  const renovar = useServerFn(renovarSessaoAparelhoChat);
  const [pin, setPin] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [verificando, setVerificando] = useState(true);

  // Aparelho já liberado antes: entra direto, sem PIN e sem 2FA.
  useEffect(() => {
    void (async () => {
      try {
        const s = await supabase.auth.getSession();
        if (s.data.session) {
          await navigate({ to: "/admin" });
          return;
        }
        const r = (await renovar()) as { ok: boolean; email?: string; tokenHash?: string };
        if (r.ok && r.email && r.tokenHash) {
          const { error } = await supabase.auth.verifyOtp({
            type: "magiclink",
            email: r.email,
            token_hash: r.tokenHash,
          });
          if (!error) {
            await navigate({ to: "/admin" });
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
      const r = (await abrir({ data: { token, pin } })) as { email: string; tokenHash: string };
      const { error } = await supabase.auth.verifyOtp({
        type: "magiclink",
        email: r.email,
        token_hash: r.tokenHash,
      });
      if (error) throw new Error(error.message);
      await navigate({ to: "/admin" });
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
        <ShieldCheck className="mx-auto h-8 w-8 text-primary" />
        <h1 className="mt-3 text-lg font-semibold text-foreground">Painel VIA AIR</h1>
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
