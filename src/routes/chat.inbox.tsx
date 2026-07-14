import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { Search, Send, Bot, User, MoreVertical, Loader2, Inbox as InboxIcon, Users, Archive, Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { listConversations, listMessages, sendHumanReply, toggleConversationMode, startOutboundConversation } from "@/lib/chat/queries.functions";
import { WhatsAppBubble, DateDivider } from "@/components/chat/WhatsAppBubble";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";

export const Route = createFileRoute("/chat/inbox")({
  component: InboxPage,
});

type Conv = Awaited<ReturnType<typeof listConversations>>[number];
type Msg = Awaited<ReturnType<typeof listMessages>>[number];

const FOLDERS = [
  { key: "all", label: "Todas", icon: InboxIcon },
  { key: "ai", label: "Com IA", icon: Bot },
  { key: "human", label: "Humano", icon: Users },
  { key: "resolved", label: "Arquivadas", icon: Archive },
] as const;

function InboxPage() {
  const listFn = useServerFn(listConversations);
  const { data: conversations = [], refetch } = useQuery({
    queryKey: ["chat", "conversations"],
    queryFn: () => listFn(),
    refetchInterval: 15_000,
  });

  const [folder, setFolder] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return conversations.filter((c) => {
      if (folder === "ai" && c.mode !== "ai") return false;
      if (folder === "human" && c.mode !== "human") return false;
      if (folder === "resolved" && c.mode !== "resolved") return false;
      if (search) {
        const s = search.toLowerCase();
        return (c.display_name?.toLowerCase().includes(s) || c.wa_phone.includes(s));
      }
      return true;
    });
  }, [conversations, folder, search]);

  // Realtime
  useEffect(() => {
    const ch = supabase
      .channel("wa_messages_inbox")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "wa_messages" }, () => refetch())
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "wa_conversations" }, () => refetch())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [refetch]);

  useEffect(() => {
    if (!activeId && filtered.length > 0) setActiveId(filtered[0].id);
  }, [filtered, activeId]);

  const active = filtered.find((c) => c.id === activeId) ?? conversations.find((c) => c.id === activeId) ?? null;

  return (
    <div className="flex h-full min-h-0">
      {/* Coluna 1 — Lista */}
      <aside className="flex w-80 shrink-0 flex-col border-r border-slate-200 bg-white">
        <div className="border-b border-slate-200 p-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar conversa…"
              className="w-full rounded-md border border-slate-200 bg-slate-50 py-1.5 pl-8 pr-3 text-sm placeholder:text-slate-400 focus:border-[#F26B1F]/50 focus:bg-white focus:outline-none"
            />
          </div>
          <div className="mt-2 flex gap-1">
            {FOLDERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setFolder(f.key)}
                className={cn(
                  "flex flex-1 items-center justify-center gap-1 rounded-md px-2 py-1.5 text-[11px] font-medium transition-colors",
                  folder === f.key
                    ? "bg-orange-50 text-[#F26B1F]"
                    : "text-slate-500 hover:bg-slate-50 hover:text-slate-900",
                )}
              >
                <f.icon className="h-3 w-3" />
                {f.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-400">Nenhuma conversa</div>
          ) : (
            filtered.map((c) => <ConvItem key={c.id} conv={c} active={activeId === c.id} onClick={() => setActiveId(c.id)} />)
          )}
        </div>
      </aside>

      {/* Coluna 2 — Conversa */}
      <main className="flex min-w-0 flex-1 flex-col bg-[#EFEAE2]">
        {active ? <ConversationView conv={active} onRefetch={refetch} /> : <EmptyState />}
      </main>

      {/* Coluna 3 — Detalhes */}
      <aside className="hidden w-72 shrink-0 border-l border-slate-200 bg-white lg:block">
        {active ? <ContactDetails conv={active} onChange={refetch} /> : null}
      </aside>
    </div>
  );
}

function ConvItem({ conv, active, onClick }: { conv: Conv; active: boolean; onClick: () => void }) {
  const time = conv.last_message_at
    ? new Date(conv.last_message_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
    : "";
  const initials = (conv.display_name ?? conv.wa_phone).slice(0, 2).toUpperCase();
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-start gap-3 border-b border-slate-100 px-3 py-3 text-left transition-colors",
        active ? "bg-orange-50/60" : "hover:bg-slate-50",
      )}
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#F26B1F] to-orange-400 text-xs font-semibold text-white">
        {initials}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate text-sm font-medium text-slate-900">{conv.display_name ?? conv.wa_phone}</span>
          <span className="shrink-0 text-[10px] text-slate-400">{time}</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-xs text-slate-500">{conv.last_message_preview ?? "—"}</span>
          <div className="flex shrink-0 items-center gap-1">
            {conv.mode === "ai" && <Bot className="h-3 w-3 text-emerald-500" />}
            {conv.mode === "human" && <User className="h-3 w-3 text-violet-500" />}
            {(conv.unread_count ?? 0) > 0 && (
              <span className="rounded-full bg-[#F26B1F] px-1.5 text-[10px] font-medium text-white">{conv.unread_count}</span>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}

function EmptyState() {
  return (
    <div className="flex h-full items-center justify-center text-center text-sm text-slate-500">
      <div>
        <InboxIcon className="mx-auto mb-2 h-8 w-8 text-slate-300" />
        Selecione uma conversa
      </div>
    </div>
  );
}

function ConversationView({ conv, onRefetch }: { conv: Conv; onRefetch: () => void }) {
  const qc = useQueryClient();
  const listMsgs = useServerFn(listMessages);
  const sendFn = useServerFn(sendHumanReply);
  const toggleFn = useServerFn(toggleConversationMode);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [input, setInput] = useState("");

  const { data: messages = [], isLoading } = useQuery({
    queryKey: ["chat", "messages", conv.id],
    queryFn: () => listMsgs({ data: { conversation_id: conv.id } }),
    refetchInterval: 8_000,
  });

  useEffect(() => {
    const ch = supabase
      .channel(`wa_msgs_${conv.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "wa_messages", filter: `conversation_id=eq.${conv.id}` },
        () => qc.invalidateQueries({ queryKey: ["chat", "messages", conv.id] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [conv.id, qc]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length]);

  const sendMut = useMutation({
    mutationFn: async (content: string) => sendFn({ data: { conversation_id: conv.id, content } }),
    onSuccess: () => {
      setInput("");
      qc.invalidateQueries({ queryKey: ["chat", "messages", conv.id] });
      onRefetch();
    },
    onError: (e) => toast.error(`Falha ao enviar: ${(e as Error).message}`),
  });

  const toggleMut = useMutation({
    mutationFn: async (mode: "ai" | "human") => toggleFn({ data: { conversation_id: conv.id, mode } }),
    onSuccess: () => { onRefetch(); toast.success("Modo alterado"); },
  });

  const grouped = groupByDay(messages);
  const lastInbound = [...messages].reverse().find((m) => m.direction === "inbound");
  const hoursSince = lastInbound ? (Date.now() - new Date(lastInbound.created_at).getTime()) / 3600000 : 0;
  const window24 = hoursSince > 24;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Header conversa */}
      <div className="flex h-14 shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-[#F26B1F] to-orange-400 text-xs font-semibold text-white">
          {(conv.display_name ?? conv.wa_phone).slice(0, 2).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-slate-900">{conv.display_name ?? conv.wa_phone}</div>
          <div className="text-[11px] text-slate-500">
            {conv.wa_phone} · {conv.mode === "ai" ? `IA (${conv.agent_slug ?? "auto"})` : conv.mode === "human" ? "Humano" : "Arquivada"}
          </div>
        </div>
        <button
          onClick={() => toggleMut.mutate(conv.mode === "ai" ? "human" : "ai")}
          className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          {conv.mode === "ai" ? "Assumir" : "Devolver p/ IA"}
        </button>
        <button className="rounded-md p-2 text-slate-500 hover:bg-slate-100"><MoreVertical className="h-4 w-4" /></button>
      </div>

      {window24 && (
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800">
          ⚠️ Última mensagem do cliente há mais de 24h — janela do WhatsApp encerrada. Use um template aprovado.
        </div>
      )}

      {/* Mensagens */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4" style={{ backgroundImage: "url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22120%22 height=%22120%22><g opacity=%220.04%22><circle cx=%2260%22 cy=%2260%22 r=%2240%22 fill=%22%23000%22/></g></svg>')" }}>
        {isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-4 w-4 animate-spin text-slate-400" /></div>
        ) : messages.length === 0 ? (
          <div className="py-8 text-center text-sm text-slate-500">Sem mensagens ainda</div>
        ) : (
          grouped.map((g) => (
            <div key={g.date}>
              <DateDivider label={g.label} />
              {g.messages.map((m) => (
                <div key={m.id} className="mb-1">
                  <WhatsAppBubble
                    side={m.direction === "inbound" ? "in" : "out"}
                    content={m.content}
                    timestamp={m.created_at}
                    senderLabel={
                      m.direction === "inbound"
                        ? (conv.display_name ?? conv.wa_phone)
                        : m.sender === "camila"
                          ? (conv.agent_slug === "roberto" ? "Roberto" : "Camila")
                        : m.sender === "human"
                          ? "Atendente"
                        : m.sender === "system"
                          ? "Sistema"
                        : undefined
                    }
                    status={m.direction === "outbound" ? "delivered" : undefined}
                  />
                </div>
              ))}
            </div>
          ))
        )}
      </div>

      {/* Composer */}
      <div className="shrink-0 border-t border-slate-200 bg-white p-3">
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (input.trim() && !sendMut.isPending) sendMut.mutate(input.trim());
              }
            }}
            placeholder={conv.mode === "ai" ? "Envio manual (a IA continua ativa)…" : "Digite uma mensagem…"}
            rows={2}
            className="flex-1 resize-none rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-[#F26B1F]/50 focus:bg-white focus:outline-none"
          />
          <button
            onClick={() => input.trim() && sendMut.mutate(input.trim())}
            disabled={!input.trim() || sendMut.isPending}
            className="flex h-10 w-10 items-center justify-center rounded-md bg-[#F26B1F] text-white transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {sendMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}

function ContactDetails({ conv, onChange }: { conv: Conv; onChange: () => void }) {
  const toggleFn = useServerFn(toggleConversationMode);
  const mut = useMutation({
    mutationFn: async (mode: "ai" | "human" | "resolved") => toggleFn({ data: { conversation_id: conv.id, mode } }),
    onSuccess: () => { onChange(); toast.success("Atualizado"); },
  });

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="border-b border-slate-200 p-5 text-center">
        <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-[#F26B1F] to-orange-400 text-lg font-semibold text-white">
          {(conv.display_name ?? conv.wa_phone).slice(0, 2).toUpperCase()}
        </div>
        <div className="text-sm font-semibold text-slate-900">{conv.display_name ?? "Contato sem cadastro"}</div>
        <div className="text-xs text-slate-500">{conv.wa_phone}</div>
      </div>

      <div className="space-y-4 p-5">
        <Field label="Modo de atendimento">
          <div className="flex flex-col gap-1.5">
            {(["ai", "human", "resolved"] as const).map((m) => (
              <button
                key={m}
                onClick={() => mut.mutate(m)}
                className={cn(
                  "flex items-center justify-between rounded-md border px-3 py-1.5 text-xs font-medium",
                  conv.mode === m
                    ? "border-[#F26B1F] bg-orange-50 text-[#F26B1F]"
                    : "border-slate-200 text-slate-600 hover:bg-slate-50",
                )}
              >
                <span>{m === "ai" ? "🤖 IA" : m === "human" ? "👤 Humano" : "✅ Arquivada"}</span>
                {conv.mode === m && <span className="h-1.5 w-1.5 rounded-full bg-[#F26B1F]" />}
              </button>
            ))}
          </div>
        </Field>

        {conv.agent_slug && (
          <Field label="Último agente"><div className="text-sm text-slate-900 capitalize">{conv.agent_slug}</div></Field>
        )}

        {conv.tags && conv.tags.length > 0 && (
          <Field label="Tags">
            <div className="flex flex-wrap gap-1">
              {conv.tags.map((t) => <span key={t} className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-700">{t}</span>)}
            </div>
          </Field>
        )}

        <Field label="Cliente cadastrado">
          <div className="text-sm text-slate-900">{conv.person_id ? "Sim ✓" : "Não vinculado"}</div>
        </Field>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-slate-400">{label}</div>
      {children}
    </div>
  );
}

function groupByDay(msgs: Msg[]) {
  const groups: { date: string; label: string; messages: Msg[] }[] = [];
  for (const m of msgs) {
    const date = new Date(m.created_at).toISOString().slice(0, 10);
    let g = groups.find((x) => x.date === date);
    if (!g) {
      const d = new Date(m.created_at);
      const today = new Date().toISOString().slice(0, 10);
      const label = date === today ? "Hoje" : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
      g = { date, label, messages: [] };
      groups.push(g);
    }
    g.messages.push(m);
  }
  return groups;
}
