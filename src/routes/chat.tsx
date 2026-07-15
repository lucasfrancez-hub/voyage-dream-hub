import { createFileRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import type { Session } from "@supabase/supabase-js";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ChatSidebar } from "@/components/chat/ChatSidebar";
import { ChatHeader } from "@/components/chat/ChatHeader";
import { getMyProfile } from "@/lib/chat/queries.functions";

export const Route = createFileRoute("/chat")({
  component: ChatLayout,
  head: () => ({
    meta: [
      { title: "Central de Atendimento — VIA AIR" },
      { name: "description", content: "CRM WhatsApp + IA integrado da VIA AIR" },
      { name: "robots", content: "noindex" },
    ],
  }),
});

const PAGE_TITLES: Record<string, { title: string; subtitle?: string }> = {
  "/chat": { title: "Caixa de Entrada" },
  "/chat/dashboard": { title: "Dashboard", subtitle: "Visão geral do atendimento" },
  "/chat/inbox": { title: "Caixa de Entrada", subtitle: "Conversas em tempo real" },
  "/chat/contatos": { title: "Contatos", subtitle: "Base de clientes VIA AIR" },
  "/chat/agentes": { title: "Agentes IA", subtitle: "Camila (dia) · Roberto (plantão)" },
  "/chat/fluxos": { title: "Fluxos", subtitle: "Automações" },
  "/chat/broadcast": { title: "Broadcast", subtitle: "Campanhas e templates" },
  "/chat/crm": { title: "CRM", subtitle: "Pipeline de vendas" },
  "/chat/agenda": { title: "Agenda", subtitle: "Compromissos e follow-ups" },
  "/chat/pastas": { title: "Pastas", subtitle: "Organização de conversas" },
  "/chat/config": { title: "Configurações", subtitle: "Integrações e permissões" },
};

function ChatLayout() {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [authorized, setAuthorized] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    const failsafe = setTimeout(() => setSession((c) => (c === undefined ? null : c)), 4000);
    supabase.auth.getSession().then(({ data }) => {
      clearTimeout(failsafe);
      setSession(data.session ?? null);
    });
    return () => { clearTimeout(failsafe); sub.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (session === undefined) return;
    if (!session) { navigate({ to: "/auth" }); return; }
    (async () => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", session.user.id)
        .in("role", ["admin", "partner"]);
      if (error) { toast.error("Erro ao validar acesso"); setAuthorized(false); return; }
      setAuthorized((data ?? []).length > 0);
    })();
  }, [session, navigate]);

  useEffect(() => {
    if (pathname === "/chat") navigate({ to: "/chat/inbox", replace: true });
  }, [pathname, navigate]);

  if (session === undefined || authorized === undefined) {
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

  const profileFn = useServerFn(getMyProfile);
  const { data: profile } = useQuery({
    queryKey: ["chat", "my-profile", session?.user.id],
    queryFn: () => profileFn(),
    enabled: !!session && authorized === true,
    staleTime: 60_000,
  });

  return (
    <div className="chat-dark dark flex h-screen w-full overflow-hidden bg-[var(--chat-bg)] text-foreground">
      <ChatSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <ChatHeader
          title={pageInfo.title}
          subtitle={pageInfo.subtitle}
          userEmail={session?.user.email}
          userFullName={profile?.full_name ?? null}
        />
        <main className="min-h-0 flex-1 overflow-hidden">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
