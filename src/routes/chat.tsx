import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { Loader2, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { InboxList, type ChatThread } from "@/components/chat/InboxList";
import { CamilaChat } from "@/components/chat/CamilaChat";
import { ContactPanel, type ContactInfo } from "@/components/chat/ContactPanel";
import viaAirLogo from "@/assets/viaair-logo.png.asset.json";

export const Route = createFileRoute("/chat")({
  component: ChatPage,
  head: () => ({
    meta: [
      { title: "Chat — VIA AIR" },
      { name: "description", content: "Atendimento WhatsApp com IA Camila e CRM integrado" },
      { name: "robots", content: "noindex" },
    ],
  }),
});

const DEFAULT_THREADS: ChatThread[] = [
  {
    id: "test-1",
    name: "Você (teste)",
    lastMessage: "Comece a testar a Camila aqui",
    timeAgo: "agora",
    status: "ia",
  },
];

const DEFAULT_CONTACT: ContactInfo = {
  name: "Você (teste)",
  phone: "+55 —",
  platform: "WHATSAPP",
  aiStatus: "active",
  tags: ["teste-interno"],
};

function ChatPage() {
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [authorized, setAuthorized] = useState<boolean | undefined>(undefined);
  const [threads, setThreads] = useState<ChatThread[]>(DEFAULT_THREADS);
  const [activeThreadId, setActiveThreadId] = useState<string>("test-1");
  const [activeFolder, setActiveFolder] = useState<string>("mine");
  const [contact, setContact] = useState<ContactInfo>(DEFAULT_CONTACT);

  // Auth check
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    const failsafe = setTimeout(() => {
      setSession((cur) => (cur === undefined ? null : cur));
    }, 4000);
    supabase.auth.getSession().then(({ data }) => {
      clearTimeout(failsafe);
      setSession(data.session ?? null);
    });
    return () => {
      clearTimeout(failsafe);
      sub.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (session === undefined) return;
    if (!session) {
      navigate({ to: "/auth" });
      return;
    }
    (async () => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", session.user.id)
        .in("role", ["admin", "partner"]);
      if (error) {
        toast.error("Erro ao validar acesso");
        setAuthorized(false);
        return;
      }
      setAuthorized((data ?? []).length > 0);
    })();
  }, [session, navigate]);

  if (session === undefined || authorized === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (!authorized) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6 text-center">
        <div>
          <h1 className="text-2xl font-semibold">Sem permissão</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Sua conta não tem acesso ao chat de atendimento.
          </p>
        </div>
      </div>
    );
  }

  const handleNewThread = () => {
    const id = `test-${Date.now()}`;
    const t: ChatThread = {
      id,
      name: `Teste ${threads.length}`,
      lastMessage: "Nova conversa",
      timeAgo: "agora",
      status: "ia",
    };
    setThreads((prev) => [t, ...prev]);
    setActiveThreadId(id);
    setContact({ ...DEFAULT_CONTACT, name: t.name });
  };

  const handleSelectThread = (id: string) => {
    setActiveThreadId(id);
    const t = threads.find((x) => x.id === id);
    if (t) setContact({ ...DEFAULT_CONTACT, name: t.name });
  };

  const handleTransferToHuman = () => {
    toast.success("Transferido para atendimento humano (mock)");
    setContact((c) => ({ ...c, aiStatus: "paused", assignedTo: session?.user.email ?? "Você" }));
  };

  const handleToggleAI = () => {
    setContact((c) => ({
      ...c,
      aiStatus: c.aiStatus === "paused" ? "active" : "paused",
    }));
  };

  return (
    <div className="flex h-screen w-full flex-col bg-background text-foreground">
      {/* Top bar */}
      <header className="flex h-12 items-center justify-between border-b border-border/40 bg-background/80 px-4 backdrop-blur">
        <div className="flex items-center gap-3">
          <Link
            to="/admin"
            className="flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-brand-orange"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Voltar ao Admin
          </Link>
          <div className="h-4 w-px bg-border/50" />
          <div className="flex items-center gap-2">
            <img src={viaAirLogo.url} alt="VIA AIR" className="h-6 w-auto" />
            <span className="text-xs font-medium text-foreground">Chat · Central de Atendimento</span>
          </div>
        </div>
        <div className="text-[11px] text-muted-foreground">
          {session?.user.email}
        </div>
      </header>

      {/* 3 columns */}
      <div className="flex flex-1 overflow-hidden">
        <InboxList
          threads={threads}
          activeThreadId={activeThreadId}
          onSelectThread={handleSelectThread}
          onNewThread={handleNewThread}
          activeFolder={activeFolder}
          onSelectFolder={setActiveFolder}
        />

        <main className="flex-1 min-w-0">
          <CamilaChat threadId={activeThreadId} contactName={contact.name} />
        </main>

        <ContactPanel
          contact={contact}
          onTransferToHuman={handleTransferToHuman}
          onToggleAI={handleToggleAI}
        />
      </div>
    </div>
  );
}
