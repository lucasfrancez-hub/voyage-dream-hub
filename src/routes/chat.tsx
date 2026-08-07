import { createFileRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import type { Session } from "@supabase/supabase-js";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ChatSidebar } from "@/components/chat/ChatSidebar";
import { ChatHeader } from "@/components/chat/ChatHeader";
import { getMyProfile } from "@/lib/chat/queries.functions";
import { statusAparelhoChat, renovarSessaoAparelhoChat } from "@/lib/chat/device-session.functions";
import { ChatPinUnlock } from "@/components/chat/ChatPinUnlock";
// TEMPORÁRIO: painel de auditoria do viewport (remover após diagnóstico)
import { ChatViewportAudit } from "@/components/chat/ChatViewportAudit";

export const Route = createFileRoute("/chat")({
  ssr: false,
  component: ChatRoute,
  head: () => ({
    meta: [
      { title: "VIA AIR Chat — Central de Atendimento" },
      // A tag <meta name="viewport"> é definida uma única vez em __root.tsx
      // para não haver duas configurações concorrentes no DOM final.
      { name: "description", content: "CRM WhatsApp + IA integrado da VIA AIR" },

      { name: "robots", content: "noindex, nofollow" },
      { name: "theme-color", content: "#16A34A" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-title", content: "VIA AIR Chat" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
    ],
    links: [
      { rel: "apple-touch-icon", href: "/apple-touch-icon-chat.png" },
      { rel: "manifest", href: "/manifest-chat.webmanifest" },
    ],
  }),
});

const PAGE_TITLES: Record<string, { title: string; subtitle?: string }> = {
  "/chat": { title: "Caixa de Entrada" },
  "/chat/dashboard": { title: "Dashboard", subtitle: "Visão geral do atendimento" },
  "/chat/inbox": { title: "Caixa de Entrada", subtitle: "Conversas em tempo real" },
  "/chat/contatos": { title: "Contatos", subtitle: "Base de clientes VIA AIR" },
  "/chat/protocolos": { title: "Protocolos", subtitle: "Histórico de atendimentos" },
  "/chat/agentes": { title: "Agentes IA", subtitle: "Camila (dia) · Roberto (plantão)" },
  "/chat/fluxos": { title: "Fluxos", subtitle: "Automações" },
  "/chat/broadcast": { title: "Broadcast", subtitle: "Campanhas e templates" },
  "/chat/sugestoes": { title: "Sugestões IA", subtitle: "Rotas quentes por origem — aprove pra virar campanha" },
  "/chat/crm": { title: "CRM", subtitle: "Pipeline de vendas" },
  "/chat/agenda": { title: "Agenda", subtitle: "Compromissos e follow-ups" },
  "/chat/pastas": { title: "Pastas", subtitle: "Organização de conversas" },
  "/chat/notificacoes": { title: "Notificações", subtitle: "Avisos push neste aparelho" },
  "/chat/config": { title: "Configurações", subtitle: "Integrações e permissões" },
};

// A tela do link secreto (/chat/app/<token>) é pública: entra pelo PIN,
// então não pode passar pelo guard de login da Central.
function ChatRoute() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  if (pathname.startsWith("/chat/app/")) return <Outlet />;
  return <ChatLayout />;
}

function ChatLayout() {

  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [authorized, setAuthorized] = useState<boolean | undefined>(undefined);
  const [theme, setTheme] = useState<"dark" | "light">("light");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // Viewport do chat: nenhuma medição em JavaScript.
  // O WebKit reduz o layout viewport quando o teclado abre
  // (`interactive-widget=resizes-content`, meta única em __root.tsx) e o root
  // usa apenas `height: 100dvh`.







  // Bloqueia o zoom por pinça / duplo toque dentro do app (iOS ignora
  // user-scalable=no no modo standalone e acabava "mudando a página").
  useEffect(() => {
    if (typeof document === "undefined") return;
    const stop = (e: Event) => e.preventDefault();
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 1) e.preventDefault();
    };
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey) e.preventDefault();
    };
    let ultimoToque = 0;
    const onTouchEnd = (e: TouchEvent) => {
      const agora = Date.now();
      if (agora - ultimoToque < 300) e.preventDefault();
      ultimoToque = agora;
    };
    document.addEventListener("gesturestart", stop);
    document.addEventListener("gesturechange", stop);
    document.addEventListener("gestureend", stop);
    document.addEventListener("touchmove", onTouchMove, { passive: false });
    document.addEventListener("touchend", onTouchEnd, { passive: false });
    document.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      document.removeEventListener("gesturestart", stop);
      document.removeEventListener("gesturechange", stop);
      document.removeEventListener("gestureend", stop);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", onTouchEnd);
      document.removeEventListener("wheel", onWheel);
    };
  }, []);





  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const saved = localStorage.getItem("chat-theme") as "dark" | "light" | null;
      if (saved === "light" || saved === "dark") setTheme(saved);
    } catch {
      // Safari/PWA pode bloquear o Storage temporariamente; usa o tema padrão.
    }
  }, []);
  useEffect(() => {
    if (typeof window !== "undefined") {
      try { localStorage.setItem("chat-theme", theme); } catch { /* mantém somente nesta sessão */ }
    }
    // Aplica também no <body> pra portais (dropdown/tooltip/dialog) herdarem o tema correto.
    if (typeof document !== "undefined") {
      const body = document.body;
      body.classList.remove("chat-dark", "chat-light", "dark");
      if (theme === "dark") body.classList.add("chat-dark", "dark");
      else body.classList.add("chat-light");
      return () => {
        body.classList.remove("chat-dark", "chat-light", "dark");
      };
    }
  }, [theme]);
  const toggleTheme = () => setTheme((t) => (t === "dark" ? "light" : "dark"));

  // Uma sessão salva no aparelho (PWA) só é considerada perdida quando o
  // Supabase avisa explicitamente (SIGNED_OUT). Rede lenta/offline não desloga.
  const temSessaoSalva = () => {
    if (typeof window === "undefined") return false;
    try {
      return Object.keys(localStorage).some((k) => k.startsWith("sb-") && k.endsWith("-auth-token"));
    } catch {
      return false;
    }
  };

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((evento, s) => {
      if (s) {
        setSession(s);
        return;
      }
      // Sem sessão: só derruba em logout explícito ou quando não há token salvo.
      if (evento === "SIGNED_OUT" || !temSessaoSalva()) setSession(null);
    });
    // Failsafe só faz sentido quando não existe token salvo no aparelho.
    const failsafe = setTimeout(() => {
      if (!temSessaoSalva()) setSession((c) => (c === undefined ? null : c));
    }, 4000);
    void (async () => {
      const { data } = await supabase.auth.getSession();
      clearTimeout(failsafe);
      if (data.session) { setSession(data.session); return; }
      if (!temSessaoSalva()) { setSession(null); return; }
      // Token salvo mas sem sessão ativa: tenta renovar antes de derrubar.
      const { data: rf } = await supabase.auth.refreshSession();
      setSession(rf.session ?? null);
    })();
    return () => { clearTimeout(failsafe); sub.subscription.unsubscribe(); };
  }, []);


  // Aparelho com PIN: em vez de mandar pro /auth, pede o PIN e restaura a sessão.
  const statusAparelho = useServerFn(statusAparelhoChat);
  const [aparelho, setAparelho] = useState<{ registrado: boolean; email: string | null } | undefined>(
    undefined,
  );
  const [pedirPin, setPedirPin] = useState(false);
  const renovar = useServerFn(renovarSessaoAparelhoChat);

  // Mantém o token do Supabase sempre fresco enquanto o app estiver aberto/volta do fundo.
  useEffect(() => {
    if (!session) return;
    const revalidar = () => {
      if (document.visibilityState !== "visible") return;
      void supabase.auth.refreshSession().catch(() => {});
    };
    const t = setInterval(revalidar, 30 * 60_000);
    document.addEventListener("visibilitychange", revalidar);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", revalidar);
    };
  }, [session]);

  useEffect(() => {
    if (session === undefined) return;
    void (async () => {
      try {
        const r = (await statusAparelho()) as { registrado: boolean; email?: string | null };
        setAparelho({ registrado: r.registrado, email: r.email ?? null });
      } catch {
        setAparelho({ registrado: false, email: null });
      }
    })();
  }, [session, statusAparelho]);

  useEffect(() => {
    if (session === undefined || aparelho === undefined) return;
    if (!session) {
      if (aparelho.registrado) {
        // Tenta restaurar sozinho (sem PIN) enquanto o aparelho for confiável.
        void (async () => {
          try {
            const r = (await renovar()) as { ok: boolean; email?: string; tokenHash?: string };
            if (r.ok && r.email && r.tokenHash) {
              const { error } = await supabase.auth.verifyOtp({
                type: "magiclink",
                token_hash: r.tokenHash,
              });
              if (!error) return;
            }
          } catch { /* cai no PIN */ }
          setPedirPin(true);
        })();
        return;
      }
      const target = pathname && pathname.startsWith("/chat") ? pathname : "/chat/inbox";
      if (typeof window !== "undefined") {
        window.location.replace(`/auth?redirect=${encodeURIComponent(target)}`);
      } else {
        navigate({ to: "/auth", search: { redirect: target } as any });
      }
      return;
    }

    (async () => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", session.user.id)
        .eq("role", "admin");
      if (error) { toast.error("Erro ao validar acesso"); setAuthorized(false); return; }
      setAuthorized((data ?? []).length > 0);
    })();
  }, [session, aparelho, navigate, pathname, renovar]);

  useEffect(() => {
    if (pathname === "/chat") navigate({ to: "/chat/inbox", replace: true });
  }, [pathname, navigate]);

  const profileFn = useServerFn(getMyProfile);
  const { data: profile } = useQuery({
    queryKey: ["chat", "my-profile", session?.user.id],
    queryFn: () => profileFn(),
    enabled: !!session && authorized === true,
    staleTime: 60_000,
  });

  if (pedirPin && !session) {
    return (
      <ChatPinUnlock
        email={aparelho?.email ?? null}
        onEntrar={() => {
          setPedirPin(false);
          window.location.reload();
        }}
      />
    );
  }

  if (session === undefined || authorized === undefined || (!session && aparelho === undefined)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }
  if (!authorized) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6 text-center">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Sem permissão</h1>
          <p className="mt-2 text-sm text-muted-foreground">Sua conta não tem acesso à Central de Atendimento.</p>
        </div>
      </div>
    );
  }

  const pageInfo = PAGE_TITLES[pathname] ?? { title: "Central de Atendimento" };

  const themeClass = theme === "dark" ? "chat-dark dark" : "chat-light";


  return (
    <div
      className={`${themeClass} flex w-full overflow-hidden bg-[var(--chat-bg)] text-foreground`}
      style={{ height: "100dvh" }}
    >
      <ChatSidebar mobileOpen={mobileNavOpen} onCloseMobile={() => setMobileNavOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">



        <ChatHeader
          title={pageInfo.title}
          subtitle={pageInfo.subtitle}
          userEmail={session?.user.email}
          userFullName={profile?.full_name ?? null}
          theme={theme}
          onToggleTheme={toggleTheme}
          onOpenMobileNav={() => setMobileNavOpen(true)}
        />
        <main className="min-h-0 flex-1 overflow-hidden">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

