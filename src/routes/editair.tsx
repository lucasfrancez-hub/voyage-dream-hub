import editairLogo from "@/assets/editair-logo.png.asset.json";
import { createFileRoute, Link, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type CSSProperties } from "react";
import type { Session } from "@supabase/supabase-js";
import { Loader2, ArrowLeft, FolderOpen, Plus, Settings } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

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
      {/* no Desktop a barra serve de área de arraste da janela; os controles ficam clicáveis */}
      <header
        className="flex h-14 items-center justify-between border-b border-white/10 px-4"
        style={desktop ? ({ WebkitAppRegion: "drag" } as CSSProperties) : undefined}
      >
        <div
          className="flex items-center gap-3"
          style={desktop ? ({ WebkitAppRegion: "no-drag" } as CSSProperties) : undefined}
        >
          {!desktop && (
            <Link
              to="/admin/dashboard"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-white/60 transition hover:bg-white/10 hover:text-white"
              title="Voltar ao painel"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
          )}
          <Link to="/editair" className="flex items-center gap-2" title="EditAir">
            <img src={editairLogo.url} alt="EditAir" className="h-7 w-auto" />
          </Link>

          {/* Menu interno do app: navega entre projetos e editor sem sair do EditAir */}
          <nav className="ml-2 flex items-center gap-1">
            <Link
              to="/editair"
              activeOptions={{ exact: true }}
              activeProps={{ className: "bg-white/10 text-white" }}
              inactiveProps={{ className: "text-white/60" }}
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] transition hover:bg-white/10 hover:text-white"
            >
              <FolderOpen className="h-3.5 w-3.5" /> Projetos
            </Link>
            <button
              onClick={() => {
                navigate({ to: "/editair" });
                setTimeout(() => window.dispatchEvent(new CustomEvent("editair:novo-projeto")), 60);
              }}
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] text-white/60 transition hover:bg-white/10 hover:text-white"
            >
              <Plus className="h-3.5 w-3.5" /> Novo projeto
            </button>
            {desktop ? (
              <button
                onClick={() => {
                  navigate({ to: "/editair" });
                  setTimeout(() => window.dispatchEvent(new CustomEvent("editair:ajustes")), 60);
                }}
                className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] text-white/60 transition hover:bg-white/10 hover:text-white"
              >
                <Settings className="h-3.5 w-3.5" /> Ajustes
              </button>
            ) : null}
          </nav>
        </div>
        <span className="text-[11px] uppercase tracking-widest text-white/30">VIA AIR</span>
      </header>
      <Outlet />
    </div>
  );
}
