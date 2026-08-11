import { createFileRoute, Link, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { EditairHeader } from "@/components/editair/EditairHeader";
import { APP_BUILD_ID, APP_COMMIT_SHA } from "@/lib/app-version";
import { CentralProcessos } from "@/components/editair/CentralProcessos";


export const Route = createFileRoute("/editair")({
  ssr: false,
  component: EditairLayout,
  head: () => ({
    meta: [
      { title: "EditAir — Editor de vídeo com IA" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

function EditairLayout() {
  const navigate = useNavigate();
  const desktop = typeof window !== "undefined" && !!window.editairDesktop;
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [liberado, setLiberado] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    console.info(`[EditAir] UI build ${APP_COMMIT_SHA} (${APP_BUILD_ID})`);
  }, []);

  useEffect(() => {
    // Desktop: o editor é local-first e abre sem login. A nuvem só entra nas funções de IA.
    if (desktop) return;
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    supabase.auth
      .getSession()
      .then(({ data }) => setSession(data.session ?? null))
      .catch(() => setSession(null));
    return () => sub.subscription.unsubscribe();
  }, [desktop]);

  useEffect(() => {
    if (desktop) return;
    if (session === undefined) return;
    if (!session) {
      navigate({ to: "/auth" });
      return;
    }
    let cancelado = false;
    (async () => {
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", session.user.id)
        .in("role", ["admin", "marketing"]);
      if (cancelado) return;
      setLiberado((data ?? []).length > 0);
    })();
    return () => {
      cancelado = true;
    };
  }, [session, navigate, desktop]);

  if (!desktop && (session === undefined || liberado === undefined)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0B0B0D]">
        <Loader2 className="h-6 w-6 animate-spin text-[#F26B1F]" />
      </div>
    );
  }

  if (!desktop && !liberado) {

    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-[#0B0B0D] text-white/70">
        <p>Você não tem acesso ao EditAir.</p>
        <Link to="/admin/dashboard" className="text-[#F26B1F] hover:underline">
          Voltar ao painel
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0B0B0D] text-white">
      {/* header global único do EditAir (também é a área de arraste no Desktop) */}
      <EditairHeader desktop={desktop} />
      <Outlet />
      {/* processos continuam visíveis mesmo ao voltar para Projetos */}
      <CentralProcessos />
    </div>
  );
}

