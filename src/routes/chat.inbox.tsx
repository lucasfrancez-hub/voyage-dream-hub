import { usePresencaEBadge } from "@/lib/chat/usePresencaEBadge";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play, Search, Send, Bot, User, MoreVertical, Loader2, Inbox as InboxIcon, Users, Archive, Plus, ChevronDown, ChevronUp, Image as ImageIcon, XCircle, History, Paperclip, PanelLeftClose, PanelLeftOpen, FileText, X, Save, ExternalLink, ArrowLeft, Info, Instagram, MessageCircle, MessageSquare, Heart, Mic, Square, Trash2, Eye, EyeOff, Check, CheckCheck, Bookmark, Share2, BarChart3, RefreshCw, UserPlus, Clock } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { listConversations, listMessages, sendHumanReply, resendHumanMessage, sendHumanMedia, toggleConversationMode, startOutboundConversation, setFunnelStage, assignConversation, setAiPaused, listAttendants, getActiveProtocolo, closeProtocoloManually, listConversationProtocolos, getConversationOrders, updateProtocoloDetails, listProtocoloMessages, ensureProtocoloResumo, clearConversationHistory, markConversationRead } from "@/lib/chat/queries.functions";
import { listInstagramAccounts, listInstagramConversations, listInstagramMessages, sendInstagramAttachment, sendInstagramReply, listInstagramCommentThreads, refreshInstagramProfile, triggerAutoReplyComment, markInstagramConversationRead, markInstagramConversationUnread, deleteInstagramConversation, markInstagramCommentThreadRead, markInstagramCommentThreadUnread, getInstagramMediaDetails, getInstagramMediaStats, deleteInstagramCommentThread, deleteInstagramComment, setInstagramCommentHidden, syncInstagramCommentLikes, toggleInstagramCommentLike, deleteInstagramMessage } from "@/lib/instagram/queries.functions";
import { firstName } from "@/lib/whatsapp/text-utils.shared";
import { confirmThen } from "@/lib/confirm";
import { audioBlobToMp3 } from "@/lib/audio-to-mp3";

import { FUNNEL_STAGES } from "@/lib/chat/funnel-stages";
import { WhatsAppBubble, DateDivider } from "@/components/chat/WhatsAppBubble";
import { AiInstructionBar } from "@/components/chat/AiInstructionBar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";



export const Route = createFileRoute("/chat/inbox")({
  component: InboxPage,
});

type Conv = Awaited<ReturnType<typeof listConversations>>[number];
type Msg = Awaited<ReturnType<typeof listMessages>>[number];

/** Logo oficial do WhatsApp (glifo em currentColor). */
function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884a9.82 9.82 0 016.988 2.896 9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.886-9.885 9.886m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
    </svg>
  );
}

const FOLDERS = [
  { key: "all", label: "Todas", icon: InboxIcon, iconOnly: false },
  { key: "unread", label: "Não lidas", icon: InboxIcon, iconOnly: false },
  { key: "human", label: "Humano", icon: Users, iconOnly: false },
  { key: "resolved", label: "Arquivadas", icon: Archive, iconOnly: true },
] as const;

const AGENT_LABEL: Record<string, string> = {
  camila: "Camila",
  nath: "Nath",
  fabricio: "Fabrício",
  roberto: "Roberto",
  maria: "Maria",
  giovani: "Giovani",
};
function agentLabel(slug?: string | null) {
  if (!slug) return "IA";
  return AGENT_LABEL[slug] ?? (slug.charAt(0).toUpperCase() + slug.slice(1));
}

function messageText(value: unknown): string {
  if (typeof value === "string") return value;
  if (value == null) return "";
  if (typeof value === "object") {
    const maybe = value as { text?: unknown; body?: unknown; caption?: unknown; filename?: unknown; type?: unknown };
    const text = maybe.text ?? maybe.body ?? maybe.caption;
    if (typeof text === "string") return text;
    if (typeof maybe.filename === "string") return maybe.filename;
    if (typeof maybe.type === "string") return maybe.type;
  }
  return String(value);
}

function InboxPage() {
  const listFn = useServerFn(listConversations);
  const { data: conversations = [], refetch } = useQuery({
    queryKey: ["chat", "conversations"],
    queryFn: () => listFn(),
    refetchInterval: 15_000,
  });

  const [channel, setChannel] = useState<"all" | "whatsapp" | "instagram_dm" | "instagram_comments">("all");
  // Na aba "Todas" o tipo do item aberto define qual painel renderizar.
  const [allKind, setAllKind] = useState<"wa" | "ig" | "comment" | null>(null);



  const [folder, setFolder] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [listCollapsed, setListCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("chat-list-collapsed") === "1";
  });
  const toggleList = () => {
    setListCollapsed((v) => {
      const nv = !v;
      if (typeof window !== "undefined") localStorage.setItem("chat-list-collapsed", nv ? "1" : "0");
      return nv;
    });
  };

  const attendantsFn = useServerFn(listAttendants);
  const { data: attendants = [] } = useQuery({
    queryKey: ["chat", "attendants"],
    queryFn: () => attendantsFn(),
    staleTime: 60_000,
  });
  const attendantMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const a of attendants) m[a.id] = a.full_name ?? "";
    return m;
  }, [attendants]);

  const filtered = useMemo(() => {
    return conversations.filter((c) => {
      // Espelhos de DM do Instagram nunca aparecem na lista do WhatsApp.
      if (c.wa_phone?.startsWith("ig:")) return false;
      // Arquivadas só aparecem na aba "Arquivadas".
      if (folder !== "resolved" && c.mode === "resolved") return false;
      if (folder === "ai" && c.mode !== "ai") return false;
      if (folder === "human" && c.mode !== "human" && !(c.tags ?? []).includes("aguardando_humano")) return false;
      if (folder === "resolved" && c.mode !== "resolved") return false;
      if (folder === "unread" && (c.unread_count ?? 0) <= 0) return false;

      if (search) {
        const s = search.toLowerCase();
        return (c.display_name?.toLowerCase().includes(s) || c.wa_phone.includes(s));
      }
      return true;
    });
  }, [conversations, folder, search]);

  // Instagram: reaproveita o espelho em wa_conversations pra mostrar protocolo/funil na lateral
  const igListFn = useServerFn(listInstagramConversations);
  const { data: igConversations = [] } = useQuery({
    queryKey: ["ig", "conversations"],
    queryFn: () => igListFn(),
    refetchInterval: 15_000,
  });
  const igThreadsFn = useServerFn(listInstagramCommentThreads);
  const { data: igCommentThreads = [] } = useQuery({
    queryKey: ["ig", "comment-threads"],
    queryFn: () => igThreadsFn(),
    refetchInterval: 20_000,
  });

  // Qual painel deve ser renderizado (considera a aba "Todas").
  const viewKind: "wa" | "ig" | "comment" | null =
    channel === "all"
      ? allKind
      : channel === "whatsapp"
        ? "wa"
        : channel === "instagram_dm"
          ? "ig"
          : "comment";

  const igActive = viewKind === "ig" && activeId ? igConversations.find((c) => c.id === activeId) ?? null : null;
  const igMirrorConv = igActive
    ? conversations.find((c) => c.wa_phone === `ig:${igActive.contact_ig_id}`) ?? null
    : null;

  // Lista unificada da aba "Todas": WhatsApp + DMs do Instagram + comentários.
  const unified = useMemo(() => {
    const s = search.trim().toLowerCase();
    const itens: Array<{ key: string; kind: "wa" | "ig" | "comment"; at: number; data: any }> = [];
    for (const c of filtered) {
      itens.push({ key: `wa-${c.id}`, kind: "wa", at: new Date(c.last_message_at ?? 0).getTime(), data: c });
    }
    for (const c of igConversations as any[]) {
      if (folder === "unread" && (c.unread_count ?? 0) <= 0) continue;
      if (folder === "resolved" ? c.status !== "closed" : c.status === "closed") continue;
      if (s && !`${c.contact_name ?? ""} ${c.contact_username ?? ""}`.toLowerCase().includes(s)) continue;
      itens.push({ key: `ig-${c.id}`, kind: "ig", at: new Date(c.last_message_at ?? 0).getTime(), data: c });
    }
    if (folder === "all" || folder === "unread") {
      for (const t of igCommentThreads as any[]) {
        if (folder === "unread" && (t.pendentes ?? 0) <= 0) continue;
        if (s && !`${t.media_caption ?? ""}`.toLowerCase().includes(s)) continue;
        const ultimo = t.comments?.[t.comments.length - 1];
        itens.push({
          key: `cm-${t.media_id}`,
          kind: "comment",
          at: new Date(ultimo?.created_at ?? 0).getTime(),
          data: t,
        });
      }
    }
    return itens.sort((a, b) => b.at - a.at);
  }, [filtered, igConversations, igCommentThreads, folder, search]);


  const waUnread = useMemo(
    () => conversations.reduce((n, c) => (c.wa_phone?.startsWith("ig:") ? n : n + ((c.unread_count ?? 0) > 0 ? 1 : 0)), 0),
    [conversations],
  );
  const igUnread = useMemo(
    () => igConversations.reduce((n: number, c: any) => n + ((c.unread_count ?? 0) > 0 ? 1 : 0), 0),
    [igConversations],
  );
  // Presença (heartbeat de 30s) + badge do ícone do app.
  usePresencaEBadge(activeId, waUnread + igUnread);

  const commentsUnread = useMemo(
    () => igCommentThreads.reduce((n: number, t: any) => n + (t.pendentes ?? 0), 0),
    [igCommentThreads],
  );





  // Realtime + push notifications (desktop/electron/web)
  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
    const prevTags = new Map<string, string[]>();
    const canNotify = () =>
      typeof window !== "undefined" &&
      "Notification" in window &&
      Notification.permission === "granted" &&
      (typeof document === "undefined" || document.visibilityState !== "visible");

    const notify = (title: string, body: string, tag?: string) => {
      if (!canNotify()) return;
      try {
        const n = new Notification(title, { body, tag, icon: "/favicon.ico" });
        n.onclick = () => { window.focus(); n.close(); };
      } catch {}
    };

    const ch = supabase
      .channel("wa_messages_inbox")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "wa_messages" }, (payload: any) => {
        refetch();
        const m = payload?.new;
        if (!m || m.direction !== "inbound") return;
        const conv = conversations.find((c) => c.id === m.conversation_id);
        const who = conv?.display_name || conv?.wa_phone || "Nova mensagem";
        const text = typeof m.content === "string" ? m.content : (m.content?.text ?? "📎 Mídia recebida");
        const aiOn = conv?.mode === "ai";
        const prefix = aiOn ? "🤖 IA atendendo" : "💬";
        notify(`${prefix} · ${who}`, String(text).slice(0, 140), `msg-${m.conversation_id}`);
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "wa_conversations" }, (payload: any) => {
        refetch();
        const c = payload?.new;
        if (!c) return;
        const nextTags: string[] = Array.isArray(c.tags) ? c.tags : [];
        const before = prevTags.get(c.id) ?? [];
        prevTags.set(c.id, nextTags);
        if (nextTags.includes("aguardando_humano") && !before.includes("aguardando_humano")) {
          const who = c.display_name || c.wa_phone || "Contato";
          notify("🚨 Atendimento humano necessário", `${who} está aguardando você`, `human-${c.id}`);
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [refetch, conversations]);

  useEffect(() => {
    if (channel !== "whatsapp") return;
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches) return;
    if (!activeId && filtered.length > 0) setActiveId(filtered[0].id);
  }, [filtered, activeId, channel]);

  // Marca como lida ao abrir a conversa (WhatsApp e Instagram)
  const qcInbox = useQueryClient();
  const markWaReadFn = useServerFn(markConversationRead);
  const markIgReadFn = useServerFn(markInstagramConversationRead);
  useEffect(() => {
    if (!activeId) return;
    if (viewKind === "wa") {
      const conv = conversations.find((c) => c.id === activeId);
      if (!conv || (conv.unread_count ?? 0) <= 0) return;
      qcInbox.setQueryData(["chat", "conversations"], (old: any) =>
        Array.isArray(old) ? old.map((c: any) => (c.id === activeId ? { ...c, unread_count: 0 } : c)) : old,
      );
      markWaReadFn({ data: { conversation_id: activeId } })
        .then(() => qcInbox.invalidateQueries({ queryKey: ["chat", "conversations"] }))
        .catch(() => {});
    } else if (viewKind === "ig") {
      const conv = igConversations.find((c: any) => c.id === activeId);
      if (!conv || ((conv as any).unread_count ?? 0) <= 0) return;
      qcInbox.setQueryData(["ig", "conversations"], (old: any) =>
        Array.isArray(old) ? old.map((c: any) => (c.id === activeId ? { ...c, unread_count: 0 } : c)) : old,
      );
      markIgReadFn({ data: { conversation_id: activeId } })
        .then(() => qcInbox.invalidateQueries({ queryKey: ["ig", "conversations"] }))
        .catch(() => {});
    }
  }, [activeId, viewKind, conversations, igConversations, markWaReadFn, markIgReadFn, qcInbox]);


  const active = viewKind === "wa"
    ? (filtered.find((c) => c.id === activeId) ?? null)
    : null;



  return (
    <div className="flex h-full min-h-0">
      {/* Coluna 1 — Lista */}
      {listCollapsed ? (
        <aside className={cn(
          "hidden md:flex w-12 shrink-0 flex-col items-center gap-2 border-r border-border bg-card py-3",
        )}>
          <button
            onClick={toggleList}
            title="Expandir caixa de entrada"
            className="rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <PanelLeftOpen className="h-4 w-4" />
          </button>
          <button
            onClick={() => setNewOpen(true)}
            title="Nova conversa"
            className="flex h-8 w-8 items-center justify-center rounded-md bg-[#F26B1F] text-white transition-opacity hover:opacity-90"
          >
            <Plus className="h-4 w-4" />
          </button>
          <div className="mt-2 rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-semibold text-foreground">
            {filtered.length}
          </div>
        </aside>
      ) : (
        <aside className={cn(
          "flex-col border-r border-slate-200 bg-white shrink-0",
          // Mobile: só mostra se não tem conversa aberta; ocupa tela toda
          active || ((viewKind === "ig" || viewKind === "comment") && activeId)
            ? "hidden md:flex"
            : "flex w-full",


          "md:flex md:w-80",
        )}>
          <div className="border-b border-slate-200 p-3">
            <div className="mb-2 flex items-center gap-2">
              <button
                onClick={toggleList}
                title="Recolher lista"
                className="hidden md:flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-900"
              >
                <PanelLeftClose className="h-4 w-4" />
              </button>
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar conversa…"
                  className="w-full rounded-md border border-slate-200 bg-slate-50 py-1.5 pl-8 pr-3 text-sm placeholder:text-slate-400 focus:border-[#F26B1F]/50 focus:bg-white focus:outline-none"
                />
              </div>
              <button
                onClick={() => setNewOpen(true)}
                title="Nova conversa"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[#F26B1F] text-white transition-opacity hover:opacity-90"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
            <div className="-mx-1 mt-2 flex gap-1 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {([
                { key: "all", label: "Todas", icon: InboxIcon, badge: waUnread + igUnread + commentsUnread },
                { key: "whatsapp", label: "WhatsApp", icon: WhatsAppIcon, badge: waUnread },
                { key: "instagram_dm", label: "Instagram", icon: Instagram, badge: igUnread },
                { key: "instagram_comments", label: "Comentários", icon: Heart, badge: commentsUnread },
              ] as const).map((c) => {
                const showLabel = c.key === "all" || channel === c.key;
                return (
                  <button
                    key={c.key}
                    onClick={() => { setChannel(c.key); setActiveId(null); setAllKind(null); }}
                    title={c.label}
                    aria-label={c.label}
                    className={cn(
                      "relative flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md px-2.5 py-1.5 text-[11px] font-medium transition-colors",
                      channel === c.key
                        ? "bg-orange-50 text-[#F26B1F]"
                        : "text-slate-500 hover:bg-slate-50 hover:text-slate-900",
                    )}
                  >
                    <c.icon className="h-3.5 w-3.5" />
                    {showLabel ? c.label : null}
                    {c.badge > 0 ? (
                      <span className="ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[#F26B1F] px-1 text-[9px] font-semibold text-white">
                        {c.badge > 99 ? "99+" : c.badge}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>





            <div className="-mx-1 mt-2 flex gap-1 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {FOLDERS.map((f) => (
                <button
                  key={f.key}
                  onClick={() => setFolder(f.key)}
                  title={f.label}
                  aria-label={f.label}
                  className={cn(
                    "flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md px-2.5 py-1.5 text-[11px] font-medium transition-colors",
                    folder === f.key
                      ? "bg-orange-50 text-[#F26B1F]"
                      : "text-slate-500 hover:bg-slate-50 hover:text-slate-900",
                  )}
                >
                  <f.icon className="h-3.5 w-3.5" />
                  {f.iconOnly ? null : f.label}
                </button>
              ))}
            </div>

          </div>
          <div className="flex-1 space-y-1 overflow-y-auto p-2">
            {channel === "all" ? (
              unified.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-400">Nenhuma conversa</div>
              ) : (
                unified.map((it) =>
                  it.kind === "wa" ? (
                    <ConvItem
                      key={it.key}
                      conv={it.data}
                      active={allKind === "wa" && activeId === it.data.id}
                      onClick={() => { setAllKind("wa"); setActiveId(it.data.id); }}
                      attendantName={it.data.assigned_to ? attendantMap[it.data.assigned_to] ?? null : null}
                    />
                  ) : it.kind === "ig" ? (
                    <IgConvRow
                      key={it.key}
                      conv={it.data}
                      active={allKind === "ig" && activeId === it.data.id}
                      onClick={() => { setAllKind("ig"); setActiveId(it.data.id); }}
                    />
                  ) : (
                    <IgThreadRow
                      key={it.key}
                      thread={it.data}
                      active={allKind === "comment" && activeId === it.data.media_id}
                      onClick={() => { setAllKind("comment"); setActiveId(it.data.media_id); }}
                    />
                  ),
                )
              )
            ) : channel === "instagram_dm" ? (
              <InstagramList folder={folder} search={search} activeId={activeId} onSelect={setActiveId} />
            ) : channel === "instagram_comments" ? (
              <InstagramMediaThreadList search={search} activeId={activeId} onSelect={setActiveId} />

            ) : filtered.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400">Nenhuma conversa</div>
            ) : (
              filtered.map((c) => <ConvItem key={c.id} conv={c} active={activeId === c.id} onClick={() => setActiveId(c.id)} attendantName={c.assigned_to ? attendantMap[c.assigned_to] ?? null : null} />)
            )}
          </div>
        </aside>
      )}

      {/* Coluna 2 — Conversa */}
      <main className={cn(
        "min-w-0 flex-1 flex-col bg-[var(--chat-conversation)]",
        // Mobile: só mostra se tiver conversa ativa
        (active || ((viewKind === "ig" || viewKind === "comment") && activeId)) ? "flex" : "hidden md:flex",
      )}>
        {viewKind === "ig" ? (
          activeId ? (
            <InstagramConversationView
              conversationId={activeId}
              mirror={igMirrorConv}
              onRefetch={refetch}
              onBack={() => setActiveId(null)}
            />
          ) : <EmptyState />

        ) : viewKind === "comment" ? (
          activeId ? <InstagramCommentThreadView mediaId={activeId} onBack={() => setActiveId(null)} /> : <EmptyState />
        ) : active ? (
          <ConversationView conv={active} onRefetch={refetch} onBack={() => setActiveId(null)} />
        ) : <EmptyState />}
      </main>



      {/* Coluna 3 — Detalhes */}
      <aside className="hidden w-72 shrink-0 border-l border-slate-200 bg-white lg:block">
        {viewKind === "ig" ? (
          igMirrorConv ? (
            <ContactDetails conv={igMirrorConv} onChange={refetch} />
          ) : activeId ? (
            <div className="p-4 text-xs text-slate-400">Sincronizando dados do perfil…</div>
          ) : null
        ) : active ? (

          <ContactDetails conv={active} onChange={refetch} />
        ) : null}
      </aside>

      <NewConversationDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        onCreated={(id) => { setNewOpen(false); refetch(); setActiveId(id); }}
      />
    </div>
  );
}


function NewConversationDialog({
  open, onOpenChange, onCreated,
}: { open: boolean; onOpenChange: (v: boolean) => void; onCreated: (id: string) => void }) {
  const startFn = useServerFn(startOutboundConversation);
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [msg, setMsg] = useState("");

  const mut = useMutation({
    mutationFn: async () => startFn({ data: { phone, display_name: name || null, content: msg } }),
    onSuccess: (r) => {
      toast.success("Conversa iniciada — IA desativada");
      setPhone(""); setName(""); setMsg("");
      onCreated(r.conversation_id);
    },
    onError: (e) => toast.error(`Falha: ${(e as Error).message}`),
  });

  const canSend = phone.replace(/\D/g, "").length >= 10 && msg.trim().length > 0 && !mut.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-white text-slate-900 border border-slate-200">
        <DialogHeader>
          <DialogTitle className="text-slate-900">Nova conversa</DialogTitle>
          <DialogDescription className="text-slate-600">
            Envia a primeira mensagem para um número. A IA fica <b>desativada</b> — você atende manualmente.
            Se o cliente nunca te mandou nada antes ou faz mais de 24h, o WhatsApp só entrega mensagem de <b>template aprovado</b>.
          </DialogDescription>
        </DialogHeader>


        <div className="space-y-3">
          <label className="block text-xs">
            <span className="mb-1 block font-medium text-slate-700">Número (com DDD)</span>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="11 98765-4321"
              className="w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-[#F26B1F]/50 focus:bg-white focus:outline-none"
            />
            <span className="mt-1 block text-[10px] text-slate-400">Sem DDI vira +55 automático.</span>
          </label>

          <label className="block text-xs">
            <span className="mb-1 block font-medium text-slate-700">Nome (opcional)</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex.: Marina Silva"
              className="w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-[#F26B1F]/50 focus:bg-white focus:outline-none"
            />
          </label>

          <label className="block text-xs">
            <span className="mb-1 block font-medium text-slate-700">Primeira mensagem</span>
            <textarea
              value={msg}
              onChange={(e) => setMsg(e.target.value)}
              rows={4}
              placeholder="Escreva a mensagem…"
              className="w-full resize-none rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-[#F26B1F]/50 focus:bg-white focus:outline-none"
            />
          </label>
        </div>

        <DialogFooter>
          <button
            onClick={() => onOpenChange(false)}
            className="rounded-md border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            Cancelar
          </button>
          <button
            onClick={() => mut.mutate()}
            disabled={!canSend}
            className="flex items-center gap-2 rounded-md bg-[#F26B1F] px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {mut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Enviar
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


function ConvItem({ conv, active, onClick, attendantName }: { conv: Conv; active: boolean; onClick: () => void; attendantName?: string | null }) {
  const time = conv.last_message_at
    ? new Date(conv.last_message_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
    : "";
  const initials = (conv.display_name ?? conv.wa_phone).slice(0, 2).toUpperCase();
  const stage = FUNNEL_STAGES.find((s) => s.key === conv.funnel_stage);
  const attendingBy =
    conv.mode === "ai"
      ? { label: agentLabel(conv.agent_slug), icon: "ai" as const }
      : conv.mode === "human" && attendantName
        ? { label: firstName(attendantName) || attendantName, icon: "human" as const }
        : null;
  // "Atendimento necessário" aparece sempre que a IA sinalizou que precisa de humano
  // (tag aguardando_humano) OU o modo é humano sem atendente. A tag só é removida
  // quando um humano envia a primeira resposta (ver sendHumanReply/sendHumanMedia).
  const needsHuman =
    (conv.tags ?? []).includes("aguardando_humano") ||
    (conv.mode === "human" && !conv.assigned_to);
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-start gap-3 rounded-lg px-3 py-3 text-left transition-colors",
        active ? "bg-orange-50" : "hover:bg-slate-50",
      )}
    >
      <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#F26B1F] to-orange-400 text-xs font-semibold text-white">
        {initials}
        {conv.mode === "human" && !conv.assigned_to && (
          <span className="absolute -right-0.5 -top-0.5 flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-orange-400 opacity-75" />
            <span className="relative inline-flex h-3 w-3 rounded-full border-2 border-white bg-[#F26B1F]" />
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate text-sm font-medium text-slate-900">{conv.display_name ?? conv.wa_phone}</span>
          <span className="shrink-0 text-[10px] text-slate-400">{time}</span>
        </div>
        {(stage || needsHuman) && (
          <div className="mt-1 flex min-w-0 items-center gap-1.5">
            {stage && (
              <span
                className={cn(
                  "shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-medium leading-none",
                  stage.pill,
                )}
                title={`Funil: ${stage.label}`}
              >
                {stage.label}
              </span>
            )}
            {needsHuman && (
              <span className="inline-flex min-w-0 items-center gap-1 rounded-full bg-orange-100 px-1.5 py-0.5 text-[9px] font-semibold leading-none text-[#F26B1F]">
                <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-[#F26B1F]" />
                <span className="truncate">Atendimento necessário</span>
              </span>
            )}
          </div>
        )}
        {attendingBy && (
          <div className="mt-0.5 inline-flex items-center gap-1 text-[10px] text-slate-500">
            {attendingBy.icon === "ai" ? (
              <Bot className="h-3 w-3 text-emerald-500" />
            ) : (
              <User className="h-3 w-3 text-[#F26B1F]" />
            )}
            <span className="truncate">
              {attendingBy.icon === "ai" ? "IA " : "Atendente "}
              <b className="font-semibold text-slate-700">{attendingBy.label}</b>
            </span>
          </div>
        )}
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-xs text-slate-500">{messageText(conv.last_message_preview) || "—"}</span>
          <div className="flex shrink-0 items-center gap-1">
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

const WALLPAPERS: { key: string; label: string; css: string; size?: string }[] = [
  { key: "dots", label: "Bolinhas (padrão)", css: "radial-gradient(circle 42px at center, color-mix(in oklab, oklch(0.75 0.04 65) 55%, transparent) 0, color-mix(in oklab, oklch(0.75 0.04 65) 55%, transparent) 42px, transparent 43px)", size: "120px 120px" },
  { key: "none", label: "Nenhum", css: "none" },
  { key: "grid", label: "Grade sutil", css: "linear-gradient(color-mix(in oklab, var(--foreground) 8%, transparent) 1px, transparent 1px), linear-gradient(90deg, color-mix(in oklab, var(--foreground) 8%, transparent) 1px, transparent 1px)", size: "24px 24px" },
  { key: "orange", label: "Brilho VIA AIR", css: "radial-gradient(circle at 20% 10%, color-mix(in oklab, var(--brand-orange) 18%, transparent) 0%, transparent 45%), radial-gradient(circle at 85% 90%, color-mix(in oklab, var(--brand-blue) 20%, transparent) 0%, transparent 50%)" },
  { key: "diagonal", label: "Listras diagonais", css: "repeating-linear-gradient(45deg, color-mix(in oklab, var(--foreground) 6%, transparent) 0 2px, transparent 2px 14px)" },
];

/** Cada tom (claro/escuro) guarda o próprio plano de fundo. */
type Tom = "light" | "dark";
const chaveWallpaper = (tom: Tom) => `chat-wallpaper-v3:${tom}`;
const chaveWallpaperImg = (tom: Tom) => `chat-wallpaper-custom-v1:${tom}`;

/** Observa a classe do <body> que o /chat usa para alternar o tema. */
function useTomAtual(): Tom {
  const [tom, setTom] = useState<Tom>("light");
  useEffect(() => {
    if (typeof document === "undefined") return;
    const ler = () =>
      setTom(document.body.classList.contains("chat-dark") || document.body.classList.contains("dark") ? "dark" : "light");
    ler();
    const obs = new MutationObserver(ler);
    obs.observe(document.body, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);
  return tom;
}


/** Reduz a imagem escolhida para caber no localStorage (JPEG ~1280px). */
async function comprimirImagemFundo(file: File): Promise<string> {
  const dataUrl = await new Promise<string>((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(String(fr.result));
    fr.onerror = () => rej(new Error("Falha ao ler a imagem"));
    fr.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => rej(new Error("Imagem inválida"));
    i.src = dataUrl;
  });
  const max = 1280;
  const escala = Math.min(1, max / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * escala);
  canvas.height = Math.round(img.height * escala);
  const ctx = canvas.getContext("2d");
  if (!ctx) return dataUrl;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.82);
}

type Wallpaper = ReturnType<typeof useWallpaper>;

function useWallpaper() {
  const tom = useTomAtual();
  const [key, setKey] = useState<string>("dots");
  const [custom, setCustom] = useState<string | null>(null);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = localStorage.getItem(chaveWallpaper(tom));
    setKey(saved ?? (tom === "dark" ? "none" : "dots"));
    setCustom(localStorage.getItem(chaveWallpaperImg(tom)));
  }, [tom]);
  const set = (k: string) => {
    setKey(k);
    if (typeof window !== "undefined") localStorage.setItem(chaveWallpaper(tom), k);
  };
  const setImagem = (dataUrl: string | null) => {
    setCustom(dataUrl);
    if (typeof window === "undefined") return;
    if (dataUrl) {
      localStorage.setItem(chaveWallpaperImg(tom), dataUrl);
      localStorage.setItem(chaveWallpaper(tom), "custom");
      setKey("custom");
    } else {
      localStorage.removeItem(chaveWallpaperImg(tom));
      set(tom === "dark" ? "none" : "dots");
    }
  };

  const cur = WALLPAPERS.find((w) => w.key === key) ?? WALLPAPERS[0];
  const style: React.CSSProperties =
    key === "custom" && custom
      ? {
          backgroundImage: `url(${custom})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
          backgroundAttachment: "scroll",
          backgroundColor: "var(--chat-conversation)",
        }
      : { backgroundImage: cur.css, backgroundColor: "var(--chat-conversation)", backgroundAttachment: "scroll" };
  if (key !== "custom" && cur.size) style.backgroundSize = cur.size;
  return { key, set, style, custom, setImagem, tom };
}

/** Botão de plano de fundo usado no WhatsApp, nas DMs e nos comentários. */
function WallpaperMenu({ wallpaper, className }: { wallpaper: Wallpaper; className?: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          try {
            wallpaper.setImagem(await comprimirImagemFundo(file));
            toast.success("Plano de fundo atualizado");
          } catch {
            toast.error("Não consegui usar essa imagem");
          }
        }}
      />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            title="Alterar plano de fundo"
            aria-label="Alterar plano de fundo"
            className={cn(
              "shrink-0 rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground",
              className,
            )}
          >
            <ImageIcon className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>
            Plano de fundo · tema {wallpaper.tom === "dark" ? "escuro" : "claro"}
          </DropdownMenuLabel>

          <DropdownMenuSeparator />
          {WALLPAPERS.map((w) => (
            <DropdownMenuItem key={w.key} onClick={() => wallpaper.set(w.key)}>
              {w.label} {wallpaper.key === w.key && "✓"}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          {wallpaper.custom && (
            <DropdownMenuItem onClick={() => wallpaper.set("custom")}>
              Minha imagem {wallpaper.key === "custom" && "✓"}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={() => inputRef.current?.click()}>
            {wallpaper.custom ? "Trocar imagem…" : "Usar imagem própria…"}
          </DropdownMenuItem>
          {wallpaper.custom && (
            <DropdownMenuItem
              className="text-red-600 focus:text-red-600"
              onClick={() => wallpaper.setImagem(null)}
            >
              Remover imagem
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}


function ConversationView({ conv, onRefetch, onBack }: { conv: Conv; onRefetch: () => void; onBack?: () => void }) {
  const qc = useQueryClient();
  const listMsgs = useServerFn(listMessages);
  const sendFn = useServerFn(sendHumanReply);
  const toggleFn = useServerFn(toggleConversationMode);
  const pauseAiFn = useServerFn(setAiPaused);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [input, setInput] = useState("");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [replyTo, setReplyTo] = useState<{ wa_id: string; snippet: string; sender: string | null } | null>(null);
  const wallpaper = useWallpaper();
  const sendMediaFn = useServerFn(sendHumanMedia);
  const fileRef = useRef<HTMLInputElement>(null);
  const [pendingFile, setPendingFile] = useState<{ file: File; previewUrl: string | null; kind: "image" | "document" } | null>(null);
  const mediaMut = useMutation({
    mutationFn: async ({ file, caption, kind }: { file: File; caption: string; kind: "image" | "document" | "audio" }) => {
      const buf = new Uint8Array(await file.arrayBuffer());
      let binary = "";
      for (let i = 0; i < buf.length; i++) binary += String.fromCharCode(buf[i]);
      const b64 = btoa(binary);
      return sendMediaFn({ data: {
        conversation_id: conv.id,
        kind,
        filename: file.name,
        mime_type: file.type || (kind === "image" ? "image/jpeg" : kind === "audio" ? "audio/ogg" : "application/octet-stream"),
        data_base64: b64,
        caption: caption || null,
      }});
    },
    onSuccess: () => {
      setPendingFile((p) => { if (p?.previewUrl) URL.revokeObjectURL(p.previewUrl); return null; });
      setInput("");
      qc.invalidateQueries({ queryKey: ["chat", "messages", conv.id] });
    },
    onError: (e) => toast.error(`Falha ao enviar: ${(e as Error).message}`),
  });

  const onPickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    const MAX = 16 * 1024 * 1024;
    if (f.size > MAX) { toast.error("Arquivo muito grande (máx 16MB)"); return; }
    const isImg = f.type.startsWith("image/");
    setPendingFile({
      file: f,
      previewUrl: isImg ? URL.createObjectURL(f) : null,
      kind: isImg ? "image" : "document",
    });
  };
  const clearPending = () => {
    setPendingFile((p) => { if (p?.previewUrl) URL.revokeObjectURL(p.previewUrl); return null; });
  };
  // --- Gravação de áudio (nota de voz) ---
  const [recording, setRecording] = useState(false);
  const [paused, setPaused] = useState(false);
  const [recSecs, setRecSecs] = useState(0);
  const [audioDraft, setAudioDraft] = useState<{ file: File; url: string; secs: number } | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const cancelRef = useRef(false);
  const secsRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const pickAudioMime = () => {
    const candidates = ["audio/ogg;codecs=opus", "audio/ogg", "audio/mp4", "audio/mpeg", "audio/webm;codecs=opus", "audio/webm"];
    for (const c of candidates) {
      if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(c)) return c;
    }
    return "";
  };

  const stopTimer = () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  };
  const startTimer = () => {
    stopTimer();
    timerRef.current = setInterval(() => {
      secsRef.current += 1;
      setRecSecs(secsRef.current);
    }, 1000);
  };

  const discardDraft = () => {
    setAudioDraft((d) => { if (d) URL.revokeObjectURL(d.url); return null; });
  };

  const startRecording = async () => {
    discardDraft();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = pickAudioMime();
      const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      cancelRef.current = false;
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        stopTimer();
        setRecording(false);
        setPaused(false);
        const secs = secsRef.current;
        secsRef.current = 0;
        setRecSecs(0);
        if (cancelRef.current) return;
        const recordedType = (mimeType || rec.mimeType || "audio/webm").split(";")[0];
        const recordedBlob = new Blob(chunksRef.current, { type: recordedType });
        if (recordedBlob.size < 1500) { toast.error("Áudio muito curto"); return; }
        try {
          // A extensão sozinha não basta: a Meta valida o conteúdo binário.
          // Normalizamos qualquer gravação do navegador para MP3 real.
          const mp3 = await audioBlobToMp3(recordedBlob);
          const file = new File([mp3], `audio-${Date.now()}.mp3`, { type: "audio/mpeg" });
          setAudioDraft({ file, url: URL.createObjectURL(mp3), secs });
        } catch (error) {
          console.error("[chat/audio] falha ao converter gravação:", error);
          toast.error("Não foi possível preparar o áudio. Grave novamente");
        }
      };
      rec.start();
      recorderRef.current = rec;
      setRecording(true);
      setPaused(false);
      secsRef.current = 0;
      setRecSecs(0);
      startTimer();
    } catch {
      toast.error("Não foi possível acessar o microfone");
    }
  };
  const togglePause = () => {
    const rec = recorderRef.current;
    if (!rec) return;
    if (rec.state === "recording") {
      rec.pause();
      stopTimer();
      setPaused(true);
    } else if (rec.state === "paused") {
      rec.resume();
      startTimer();
      setPaused(false);
    }
  };
  const stopRecording = (cancel: boolean) => {
    cancelRef.current = cancel;
    const rec = recorderRef.current;
    recorderRef.current = null;
    if (!rec) return;
    if (rec.state === "paused") rec.resume();
    rec.stop();
  };

  const submit = () => {
    if (audioDraft) {

      const file = audioDraft.file;
      discardDraft();
      mediaMut.mutate({ file, caption: "", kind: "audio" });
    } else if (pendingFile) {
      mediaMut.mutate({ file: pendingFile.file, caption: input.trim(), kind: pendingFile.kind });
    } else if (input.trim() && !sendMut.isPending) {
      sendMut.mutate(input.trim());
    }
  };




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
      // UPDATE cobre a revogação ("apagar para todos") — a legenda aparece sem recarregar
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "wa_messages", filter: `conversation_id=eq.${conv.id}` },
        () => qc.invalidateQueries({ queryKey: ["chat", "messages", conv.id] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [conv.id, qc]);


  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length]);

  const listUsersFn = useServerFn(listAttendants);
  const { data: attendantsList = [] } = useQuery({
    queryKey: ["chat", "attendants"],
    queryFn: () => listUsersFn(),
    staleTime: 60_000,
  });
  const assignedName = conv.assigned_to
    ? attendantsList.find((a) => a.id === conv.assigned_to)?.full_name ?? null
    : null;

  const resendFn = useServerFn(resendHumanMessage);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const resendMut = useMutation({
    mutationFn: async (messageId: string) => resendFn({ data: { message_id: messageId } }),
    onMutate: (messageId: string) => setResendingId(messageId),
    onSuccess: () => {
      toast.success("Mensagem reenviada");
      qc.invalidateQueries({ queryKey: ["chat", "messages", conv.id] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Não deu pra reenviar"),
    onSettled: () => setResendingId(null),
  });

  const sendMut = useMutation({

    mutationFn: async (content: string) => sendFn({ data: {
      conversation_id: conv.id,
      content,
      reply_to_wa_id: replyTo?.wa_id ?? null,
      reply_to_snippet: replyTo?.snippet ?? null,
      reply_to_sender: replyTo?.sender ?? null,
    } }),
    onSuccess: () => {
      setInput("");
      setReplyTo(null);
      qc.invalidateQueries({ queryKey: ["chat", "messages", conv.id] });
      onRefetch();
    },
    onError: (e) => toast.error(`Falha ao enviar: ${(e as Error).message}`),
  });

  const toggleMut = useMutation({
    mutationFn: async (mode: "ai" | "human") => toggleFn({ data: { conversation_id: conv.id, mode } }),
    onSuccess: () => { onRefetch(); toast.success("Modo alterado"); },
  });

  const aiPaused = !!(conv as { ai_paused?: boolean | null }).ai_paused;
  const pauseAiMut = useMutation({
    mutationFn: async (paused: boolean) => pauseAiFn({ data: { conversation_id: conv.id, paused } }),
    onSuccess: (_d, paused) => {
      onRefetch();
      toast.success(paused ? "IA pausada — ela não responde até você retomar" : "IA retomada");
    },
    onError: (e) => toast.error(`Falha: ${(e as Error).message}`),
  });


  const grouped = groupByDay(messages);
  const repliedIds = new Set(
    messages.map((m) => m.reply_to_wa_id).filter((x): x is string => !!x),
  );
  // Mapa id-do-WhatsApp → mensagem, pra resolver o preview da citação mesmo
  // quando o snippet não foi gravado no momento em que a mensagem chegou.
  const byWaId = new Map(
    messages.filter((m) => !!m.wa_message_id).map((m) => [m.wa_message_id as string, m]),
  );
  const previewOf = (raw: unknown): string => {
    let text = messageText(raw);
    const media = text.match(/^\[\[media:([a-z]+)\|[^\]]*\]\]\n?/);
    if (media) {
      text = text.replace(media[0], "").trim();
      if (!text) {
        const kind = media[1];
        return kind === "image" ? "🖼️ Foto" : kind === "video" ? "🎬 Vídeo" : kind === "audio" ? "🎤 Áudio" : "📎 Documento";
      }
    }
    return text.replace(/^\*[^*\n]{1,40}:\*\n?/, "").trim().slice(0, 240);
  };
  const resolveReply = (m: (typeof messages)[number]) => {
    if (!m.reply_to_wa_id) return null;
    const original = byWaId.get(m.reply_to_wa_id);
    const snippet =
      (m.reply_to_snippet && m.reply_to_snippet.trim()) ||
      (original ? previewOf(original.content) : "") ||
      "mensagem";
    const rawSender = m.reply_to_sender;
    const normalized =
      rawSender === "me" ? "Você"
      : rawSender === "customer" ? (conv.display_name ?? conv.wa_phone)
      : rawSender;
    const sender =
      normalized ??
      (original
        ? original.direction === "inbound"
          ? (conv.display_name ?? conv.wa_phone)
          : "Você"
        : null);
    const orig = original as { is_revoked?: boolean | null; revoked_by?: string | null; deleted_at?: string | null } | undefined;
    return {
      snippet,
      sender,
      deleted: !!(orig?.is_revoked || orig?.deleted_at),
      revokedBy: (orig?.revoked_by ?? null) as "customer" | "business" | null,
    };
  };
  const lastInbound = [...messages].reverse().find((m) => m.direction === "inbound");
  const hoursSince = lastInbound ? (Date.now() - new Date(lastInbound.created_at).getTime()) / 3600000 : 0;
  const window24 = hoursSince > 24;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Header conversa */}
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-slate-200 bg-white px-3 sm:gap-3 sm:px-4">
        {onBack && (
          <button
            onClick={onBack}
            className="shrink-0 rounded-md p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900 md:hidden"
            aria-label="Voltar"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
        )}
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#F26B1F] to-orange-400 text-xs font-semibold text-white">
          {(conv.display_name ?? conv.wa_phone).slice(0, 2).toUpperCase()}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <div className="truncate text-sm font-semibold text-slate-900">{conv.display_name ?? conv.wa_phone}</div>
            {conv.protocolo_numero && (
              <span className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-[10px] text-slate-600">
                #{conv.protocolo_numero}
              </span>
            )}
          </div>
          <div className="truncate text-[11px] text-slate-500">
            {conv.wa_phone} · {conv.mode === "ai" ? `IA (${conv.agent_slug ?? "auto"})` : conv.mode === "human" ? "Humano" : "Arquivada"}
            {conv.mode === "ai" && aiPaused && (
              <> · <span className="font-semibold text-amber-600">IA pausada</span></>
            )}
            {assignedName && (
              <> · <span className="font-medium text-slate-700">{assignedName}</span></>
            )}
          </div>

        </div>
        {conv.mode === "ai" && (
          <button
            onClick={() => pauseAiMut.mutate(!aiPaused)}
            disabled={pauseAiMut.isPending}
            aria-label={aiPaused ? "Retomar IA" : "Pausar IA"}
            title={aiPaused ? "A IA volta a responder as próximas mensagens" : "Segura a IA sem assumir a conversa"}
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2 py-1.5 text-[11px] font-medium transition-colors disabled:opacity-50 sm:text-xs",
              aiPaused
                ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                : "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100",
            )}
          >
            {pauseAiMut.isPending
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : aiPaused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
            <span className="hidden sm:inline">{aiPaused ? "Retomar IA" : "Pausar IA"}</span>
          </button>
        )}
        <button
          onClick={() => toggleMut.mutate(conv.mode === "ai" ? "human" : "ai")}
          className="shrink-0 rounded-md border border-slate-200 px-2 py-1.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50 sm:px-3 sm:text-xs"
        >
          {conv.mode === "ai" ? "Assumir" : "Devolver p/ IA"}
        </button>
        <WallpaperMenu wallpaper={wallpaper} className="hidden md:inline-flex" />

        <button
          onClick={() => setDetailsOpen(true)}
          title="Detalhes do contato e protocolo"
          aria-label="Detalhes do contato"
          className="rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground lg:hidden"
        >
          <Info className="h-4 w-4" />
        </button>
        <ConversationMenu conv={conv} onChange={onRefetch} />
      </div>

      <Sheet open={detailsOpen} onOpenChange={setDetailsOpen}>
        <SheetContent side="right" className="w-full max-w-md overflow-y-auto p-0 sm:max-w-md">
          <SheetHeader className="border-b border-slate-200 px-4 py-3">
            <SheetTitle className="text-sm text-slate-900">Detalhes do contato</SheetTitle>
          </SheetHeader>
          <ContactDetails conv={conv} onChange={onRefetch} />
        </SheetContent>
      </Sheet>

      {window24 && (
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800">
          ⚠️ Cliente sem responder há mais de 24h — o envio livre pode ser recusado pelo WhatsApp. Se der “não entregue”, use o botão reenviar no balão.
        </div>
      )}


      {/* Mensagens */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4" style={wallpaper.style}>

        {isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-4 w-4 animate-spin text-slate-400" /></div>
        ) : messages.length === 0 ? (
          <div className="py-8 text-center text-sm text-slate-500">Sem mensagens ainda</div>
        ) : (
          grouped.map((g) => (
            <div key={g.date}>
              <DateDivider label={g.label} />
              {g.messages.map((m) => {
                const senderLabel =
                  m.direction === "inbound"
                    ? (conv.display_name ?? conv.wa_phone)
                    : m.sender === "camila"
                      ? agentLabel(m.agent_slug ?? conv.agent_slug)

                    : m.sender === "human"
                      ? (firstName(m.sender_full_name) ?? "Atendente")
                    : m.sender === "system"
                      ? "Sistema"
                    : undefined;
                return (
                  <div key={m.id} className="mb-1">
                    <WhatsAppBubble
                      side={m.direction === "inbound" ? "in" : "out"}
                      content={m.content}
                      timestamp={m.created_at}
                      senderLabel={senderLabel}
                      status={
                        m.direction === "outbound"
                          ? ((m as { error?: string | null }).error
                              ? "failed"
                              : (((m as { delivery_status?: string | null }).delivery_status as
                                  | "sent"
                                  | "delivered"
                                  | "read"
                                  | "failed"
                                  | null) ?? "sent"))
                          : undefined
                      }
                      deliveredAt={(m as { delivered_at?: string | null }).delivered_at ?? null}
                      readAt={(m as { read_at?: string | null }).read_at ?? null}

                      deleted={!!(m as { is_revoked?: boolean | null }).is_revoked || !!m.deleted_at}
                      revokedBy={((m as { revoked_by?: string | null }).revoked_by ?? null) as "customer" | "business" | null}
                      replied={!!m.wa_message_id && repliedIds.has(m.wa_message_id)}
                      reply={resolveReply(m)}
                      onReply={
                        m.deleted_at || !m.wa_message_id
                          ? undefined
                          : () => {
                              const preview = previewOf(m.content) || "mensagem";
                              setReplyTo({
                                wa_id: m.wa_message_id!,
                                snippet: preview,
                                sender: senderLabel ?? null,
                              });
                            }
                      }
                      onResend={
                        m.direction === "outbound" && (m as { error?: string | null }).error
                          ? () => resendMut.mutate(m.id)
                          : undefined
                      }
                      resending={resendingId === m.id}
                    />

                  </div>
                );
              })}
            </div>
          ))
        )}
      </div>

      {/* Composer */}
      <div className="shrink-0 border-t border-slate-200 bg-white p-3">
        {conv.mode === "ai" && (
          <AiInstructionBar
            conversationId={conv.id}
            pending={(conv as { ai_instruction?: string | null }).ai_instruction ?? null}
            onChange={onRefetch}
          />
        )}
        {conv.mode === "ai" && aiPaused && (
          <div className="mb-2 flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-800">
            <Pause className="h-3.5 w-3.5 shrink-0" />
            <span className="flex-1">IA pausada — ela não responde até você retomar. Deixe a orientação e clique em “Retomar IA”.</span>
            <button
              onClick={() => pauseAiMut.mutate(false)}
              disabled={pauseAiMut.isPending}
              className="rounded-md bg-amber-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-amber-700 disabled:opacity-50"
            >
              Retomar
            </button>
          </div>
        )}
        {replyTo && (
          <div className="mb-2 flex items-start gap-2 rounded-md border-l-4 border-[#F26B1F] bg-orange-50 px-3 py-2">
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-semibold text-[#F26B1F]">
                Respondendo{replyTo.sender ? ` a ${firstName(replyTo.sender)}` : ""}
              </div>
              <div className="line-clamp-2 text-xs text-slate-700">{replyTo.snippet}</div>
            </div>
            <button
              onClick={() => setReplyTo(null)}
              title="Cancelar resposta"
              className="rounded-md p-1 text-slate-500 hover:bg-orange-100"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
        {pendingFile && (
          <div className="mb-2 flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 p-2">
            {pendingFile.kind === "image" && pendingFile.previewUrl ? (
              <img src={pendingFile.previewUrl} alt="prévia" className="h-14 w-14 shrink-0 rounded object-cover" />
            ) : (
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded bg-slate-200 text-slate-500">
                <FileText className="h-6 w-6" />
              </div>
            )}
            <div className="min-w-0 flex-1 text-xs">
              <div className="truncate font-medium text-slate-800">{pendingFile.file.name}</div>
              <div className="text-slate-500">
                {pendingFile.kind === "image" ? "Imagem" : "Documento"} · {(pendingFile.file.size / 1024).toFixed(0)} KB
              </div>
            </div>
            <button onClick={clearPending} title="Remover" className="rounded-md p-1 text-slate-500 hover:bg-slate-200">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
        {window24 && (
          <div className="mb-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
            Cliente sem responder há mais de 24h — o WhatsApp pode recusar mensagem livre (erro 131047).
            Se aparecer “não entregue”, dá pra clicar em <strong>reenviar</strong> no próprio balão.
          </div>
        )}

        <div className="flex items-end gap-2">

          <input
            ref={fileRef}
            type="file"
            accept="image/*,application/pdf,.pdf,.doc,.docx,.xls,.xlsx"
            hidden
            onChange={onPickFile}
          />
          <button
            onClick={() => fileRef.current?.click()}
            title="Anexar imagem ou PDF"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-900"
          >
            <Paperclip className="h-4 w-4" />
          </button>
          {recording ? (
            <div className="flex flex-1 items-center gap-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              <span className={cn("h-2.5 w-2.5 rounded-full bg-red-500", !paused && "animate-pulse")} />
              {paused ? "Pausado" : "Gravando…"} {String(Math.floor(recSecs / 60)).padStart(2, "0")}:{String(recSecs % 60).padStart(2, "0")}
              <button
                onClick={togglePause}
                title={paused ? "Retomar gravação" : "Pausar gravação"}
                className="ml-auto flex h-8 w-8 items-center justify-center rounded-full border border-red-200 bg-white text-red-600 hover:bg-red-100"
              >
                {paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
              </button>
              <button
                onClick={() => stopRecording(true)}
                title="Cancelar"
                className="flex h-8 w-8 items-center justify-center rounded-full border border-red-200 bg-white text-red-600 hover:bg-red-100"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ) : audioDraft ? (
            <div className="flex flex-1 items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
              <button
                onClick={discardDraft}
                title="Descartar áudio"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-red-50 hover:text-red-600"
              >
                <Trash2 className="h-4 w-4" />
              </button>
              <audio src={audioDraft.url} controls className="h-9 flex-1" />
            </div>
          ) : (
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder={pendingFile ? "Legenda (opcional)…" : conv.mode === "ai" ? "Envio manual (a IA continua ativa)…" : "Digite uma mensagem…"}
            rows={2}
            className="flex-1 resize-none rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-base focus:border-[#F26B1F]/50 focus:bg-white focus:outline-none sm:text-sm"
          />
          )}
          {!input.trim() && !pendingFile && !audioDraft && (
            <button
              onClick={() => (recording ? stopRecording(false) : startRecording())}
              title={recording ? "Concluir gravação" : "Gravar áudio"}
              disabled={mediaMut.isPending}
              className={cn(
                "flex h-10 w-10 shrink-0 items-center justify-center rounded-md border transition-colors disabled:opacity-40",
                recording
                  ? "border-red-300 bg-red-500 text-white hover:bg-red-600"
                  : "border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-900",
              )}
            >
              {mediaMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : recording ? <Square className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            </button>
          )}

          <button
            onClick={submit}
            disabled={(!input.trim() && !pendingFile && !audioDraft) || sendMut.isPending || mediaMut.isPending}
            className="flex h-10 w-10 items-center justify-center rounded-md bg-[#F26B1F] text-white transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {(sendMut.isPending || mediaMut.isPending) ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}


function ConversationMenu({ conv, onChange }: { conv: Conv; onChange: () => void }) {
  const toggleFn = useServerFn(toggleConversationMode);
  const stageFn = useServerFn(setFunnelStage);
  const assignFn = useServerFn(assignConversation);
  const listUsers = useServerFn(listAttendants);
  const clearFn = useServerFn(clearConversationHistory);
  const qc = useQueryClient();

  const { data: attendants = [] } = useQuery({
    queryKey: ["chat", "attendants"],
    queryFn: () => listUsers(),
    staleTime: 60_000,
  });

  const doClear = () =>
    confirmThen(
      {
        title: "Apagar toda a conversa?",
        description:
          "Todas as mensagens desta conversa serão apagadas definitivamente e a IA vai recomeçar do zero, sem histórico. Essa ação não pode ser desfeita.",
        confirmText: "Apagar tudo",
        destructive: true,
      },
      () => {
        void clearFn({ data: { conversation_id: conv.id } })
          .then((r) => {
            qc.invalidateQueries({ queryKey: ["chat"] });
            onChange();
            toast.success(`Conversa apagada (${r.deleted} mensagens)`);
          })
          .catch((e: any) => toast.error(e?.message ?? "Erro ao apagar conversa"));
      },
    );

  const doArchive = () => toggleFn({ data: { conversation_id: conv.id, mode: "resolved" } }).then(() => { onChange(); toast.success("Conversa arquivada"); });
  const doReopen = () => toggleFn({ data: { conversation_id: conv.id, mode: "human" } }).then(() => { onChange(); toast.success("Conversa reaberta"); });
  const doStage = (s: typeof FUNNEL_STAGES[number]["key"]) =>
    stageFn({ data: { conversation_id: conv.id, funnel_stage: s } }).then(() => { onChange(); toast.success("Etapa atualizada"); });
  const doAssign = (userId: string | null) =>
    assignFn({ data: { conversation_id: conv.id, assigned_to: userId } }).then(() => { onChange(); toast.success(userId ? "Transferida" : "Devolvida à IA"); });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground"><MoreVertical className="h-4 w-4" /></button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Ações</DropdownMenuLabel>
        <DropdownMenuSeparator />

        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Funil de venda</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {FUNNEL_STAGES.map((s) => (
              <DropdownMenuItem key={s.key} onClick={() => doStage(s.key)}>
                {s.label} {conv.funnel_stage === s.key && "✓"}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Transferir para…</DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="max-h-64 overflow-y-auto">
            {attendants.length === 0 ? (
              <DropdownMenuItem disabled>Sem atendentes cadastrados</DropdownMenuItem>
            ) : (
              attendants.map((a) => (
                <DropdownMenuItem key={a.id} onClick={() => doAssign(a.id)}>
                  {a.full_name ?? a.id.slice(0, 6)} {conv.assigned_to === a.id && "✓"}
                </DropdownMenuItem>
              ))
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => doAssign(null)}>Devolver para IA</DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuSeparator />
        {conv.mode === "resolved" ? (
          <DropdownMenuItem onClick={doReopen}>Reabrir conversa</DropdownMenuItem>
        ) : (
          <DropdownMenuItem onClick={doArchive}>
            <Archive className="mr-2 h-4 w-4" /> Arquivar
          </DropdownMenuItem>
        )}

        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={doClear} className="text-destructive focus:text-destructive">
          <Trash2 className="mr-2 h-4 w-4" /> Apagar toda a conversa
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ContactDetails({ conv, onChange, avatarUrl = null }: { conv: Conv; onChange: () => void; avatarUrl?: string | null }) {
  const [fotoAberta, setFotoAberta] = useState(false);
  const foto = avatarUrl ?? (conv as { contact_profile_pic?: string | null }).contact_profile_pic ?? null;
  const toggleFn = useServerFn(toggleConversationMode);
  const stageFn = useServerFn(setFunnelStage);
  const assignFn = useServerFn(assignConversation);
  const listUsers = useServerFn(listAttendants);
  const getProto = useServerFn(getActiveProtocolo);
  const listProtos = useServerFn(listConversationProtocolos);
  const closeProtoFn = useServerFn(closeProtocoloManually);
  const updateProtoFn = useServerFn(updateProtocoloDetails);
  const qc = useQueryClient();
  const [confirmCloseProto, setConfirmCloseProto] = useState(false);
  const [readOnlyProtoId, setReadOnlyProtoId] = useState<string | null>(null);
  const [protoForm, setProtoForm] = useState({ numero_pedido: "", numero_reserva: "", assunto_resumo: "" });

  const { data: attendants = [] } = useQuery({
    queryKey: ["chat", "attendants"],
    queryFn: () => listUsers(),
    staleTime: 60_000,
  });

  const { data: protocolo } = useQuery({
    queryKey: ["chat", "active-protocolo", conv.id],
    queryFn: () => getProto({ data: { conversation_id: conv.id } }),
    refetchInterval: 20_000,
  });

  const { data: protoHistory = [] } = useQuery({
    queryKey: ["chat", "protocolo-history", conv.id],
    queryFn: () => listProtos({ data: { conversation_id: conv.id } }),
    refetchInterval: 60_000,
  });

  // Sidebar SEMPRE reflete o protocolo ativo. Protocolos anteriores só aparecem na janelinha (dialog).
  const viewedProtocolo = protocolo;

  useEffect(() => {
    setProtoForm({
      numero_pedido: protocolo?.numero_pedido ?? "",
      numero_reserva: protocolo?.numero_reserva ?? "",
      assunto_resumo: protocolo?.assunto_resumo ?? "",
    });
  }, [protocolo?.id, protocolo?.numero_pedido, protocolo?.numero_reserva, protocolo?.assunto_resumo]);


  // Backfill silencioso: se um protocolo antigo/encerrado não tem resumo nem necessidade, gera via IA na primeira visualização.
  const ensureResumoFn = useServerFn(ensureProtocoloResumo);
  const [ensuringId, setEnsuringId] = useState<string | null>(null);
  useEffect(() => {
    if (!viewedProtocolo) return;
    const status = (viewedProtocolo as { status?: string }).status;
    const isClosed = status && status !== "aberto";
    const hasResumo = !!((viewedProtocolo as { resumo_conversa?: string | null }).resumo_conversa ?? "").trim();
    const hasNecessidade = !!(viewedProtocolo.assunto_resumo ?? "").trim();
    if (!isClosed || (hasResumo && hasNecessidade)) return;
    if (ensuringId === viewedProtocolo.id) return;
    setEnsuringId(viewedProtocolo.id);
    ensureResumoFn({ data: { protocolo_id: viewedProtocolo.id } })
      .then((r) => {
        if (r?.updated) {
          qc.invalidateQueries({ queryKey: ["chat", "active-protocolo", conv.id] });
          qc.invalidateQueries({ queryKey: ["chat", "protocolo-history", conv.id] });
        }
      })
      .catch(() => {})
      .finally(() => setEnsuringId((cur) => (cur === viewedProtocolo.id ? null : cur)));
  }, [viewedProtocolo, ensureResumoFn, qc, conv.id, ensuringId]);

  const getOrdersFn = useServerFn(getConversationOrders);
  const { data: orders = [] } = useQuery({
    queryKey: ["chat", "orders", conv.id],
    queryFn: () => getOrdersFn({ data: { conversation_id: conv.id } }),
    staleTime: 60_000,
  });

  const closeProtoMut = useMutation({
    mutationFn: async () => closeProtoFn({ data: { conversation_id: conv.id } }),
    onSuccess: (res) => {
      toast.success(`Protocolo ${res.numero} encerrado`);
      qc.invalidateQueries({ queryKey: ["chat", "active-protocolo", conv.id] });
      qc.invalidateQueries({ queryKey: ["chat", "protocolo-history", conv.id] });
      qc.invalidateQueries({ queryKey: ["chat", "messages", conv.id] });
      onChange();
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Erro ao encerrar"),
  });

  const updateProtoMut = useMutation({
    mutationFn: async () => {
      if (!viewedProtocolo) throw new Error("Selecione um protocolo");
      return updateProtoFn({
        data: {
          conversation_id: conv.id,
          protocolo_id: viewedProtocolo.id,
          numero_pedido: protoForm.numero_pedido || null,
          numero_reserva: protoForm.numero_reserva || null,
          assunto_resumo: protoForm.assunto_resumo || null,
        },
      });
    },
    onSuccess: () => {
      toast.success("Dados do protocolo salvos");
      qc.invalidateQueries({ queryKey: ["chat", "active-protocolo", conv.id] });
      qc.invalidateQueries({ queryKey: ["chat", "protocolo-history", conv.id] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Erro ao salvar"),
  });

  const modeMut = useMutation({
    mutationFn: async (mode: "ai" | "human" | "resolved") => toggleFn({ data: { conversation_id: conv.id, mode } }),
    onSuccess: () => { onChange(); toast.success("Atualizado"); },
  });
  const stageMut = useMutation({
    mutationFn: async (s: typeof FUNNEL_STAGES[number]["key"] | null) => stageFn({ data: { conversation_id: conv.id, funnel_stage: s } }),
    onSuccess: () => { onChange(); toast.success("Etapa atualizada"); },
  });
  const assignMut = useMutation({
    mutationFn: async (userId: string | null) => assignFn({ data: { conversation_id: conv.id, assigned_to: userId } }),
    onSuccess: () => { onChange(); toast.success("Atualizado"); },
  });

  const currentStage = FUNNEL_STAGES.find((s) => s.key === conv.funnel_stage);
  const previous = protoHistory.filter((p) => p.id !== protocolo?.id);

  const MODES: { key: "ai" | "human" | "resolved"; label: string; icon: string }[] = [
    { key: "ai", label: "IA", icon: "🤖" },
    { key: "human", label: "Humano", icon: "👤" },
    { key: "resolved", label: "Arquivada", icon: "✅" },
  ];

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex h-full flex-col overflow-y-auto bg-white">
        {/* Header compacto */}
        <div className="border-b border-slate-200 px-4 py-4 text-center">
          <div className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-[#F26B1F] to-orange-400 text-base font-semibold text-white">
            {(conv.display_name ?? conv.wa_phone).slice(0, 2).toUpperCase()}
          </div>
          <div className="truncate text-sm font-semibold text-slate-900">{conv.display_name ?? "Sem cadastro"}</div>
          <div className="text-[11px] text-slate-500">{conv.wa_phone}</div>

          {/* Modo em linha, só ícones + tooltip */}
          <div className="mt-3 inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 p-1">
            {MODES.map((m) => {
              const active = conv.mode === m.key;
              return (
                <Tooltip key={m.key}>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => modeMut.mutate(m.key)}
                      aria-label={m.label}
                      className={cn(
                        "flex h-7 w-9 items-center justify-center rounded-full text-sm transition-colors",
                        active
                          ? "bg-white text-[#F26B1F] shadow-sm ring-1 ring-[#F26B1F]/30"
                          : "text-slate-500 hover:bg-white/60",
                      )}
                    >
                      <span>{m.icon}</span>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">{m.label}</TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        </div>

        <div className="space-y-3 p-4">
          {/* Funil + Atendente em grid compacto */}
          <div className="grid grid-cols-1 gap-3">
            <Field label="Funil de venda">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className={cn(
                    "flex w-full items-center justify-between rounded-md border px-3 py-1.5 text-xs font-medium",
                    currentStage ? currentStage.pill : "border-slate-200 text-slate-500 hover:bg-slate-50",
                  )}>
                    {currentStage?.label ?? "Definir etapa…"}
                    <ChevronDown className="h-3 w-3" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56">
                  {FUNNEL_STAGES.map((s) => (
                    <DropdownMenuItem key={s.key} onClick={() => stageMut.mutate(s.key)}>
                      {s.label} {conv.funnel_stage === s.key && "✓"}
                    </DropdownMenuItem>
                  ))}
                  {conv.funnel_stage && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => stageMut.mutate(null)}>Remover etapa</DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </Field>

            <Field label="Atendente">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex w-full items-center justify-between rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">
                    {attendants.find((a) => a.id === conv.assigned_to)?.full_name ?? "Não atribuído"}
                    <ChevronDown className="h-3 w-3" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56 max-h-64 overflow-y-auto">
                  {attendants.length === 0 ? (
                    <DropdownMenuItem disabled>Sem atendentes</DropdownMenuItem>
                  ) : (
                    attendants.map((a) => (
                      <DropdownMenuItem key={a.id} onClick={() => assignMut.mutate(a.id)}>
                        {a.full_name ?? a.id.slice(0, 6)} {conv.assigned_to === a.id && "✓"}
                      </DropdownMenuItem>
                    ))
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => assignMut.mutate(null)}>Devolver para IA</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </Field>
          </div>

          {/* Protocolo atual + histórico */}
          <Field label="Protocolo atual">
            {protocolo ? (
              <div className="flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5">
                <span className="font-mono text-xs font-semibold text-slate-800">#{protocolo.numero}</span>
                <div className="flex items-center gap-1.5">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700 hover:bg-emerald-200"
                        aria-label="Ver protocolos anteriores"
                      >
                        aberto <ChevronDown className="h-2.5 w-2.5" />
                      </button>
                    </DropdownMenuTrigger>
                    <ProtocoloHistoryMenu previous={previous} onSelect={(id) => { setReadOnlyProtoId(id); }} />

                  </DropdownMenu>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => setConfirmCloseProto(true)}
                        disabled={closeProtoMut.isPending}
                        className="flex h-5 w-5 items-center justify-center rounded-full text-red-500 hover:bg-red-50 disabled:opacity-40"
                        aria-label="Encerrar protocolo"
                      >
                        {closeProtoMut.isPending
                          ? <Loader2 className="h-3 w-3 animate-spin" />
                          : <XCircle className="h-3.5 w-3.5" />}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="left">Encerrar protocolo</TooltipContent>
                  </Tooltip>
                </div>
              </div>
            ) : (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex w-full items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100">
                    <span className="italic text-slate-500">Não há protocolo ativo</span>
                    <span className="flex items-center gap-1 text-[10px] text-slate-500">
                      <History className="h-3 w-3" /> anteriores <ChevronDown className="h-3 w-3" />
                    </span>
                  </button>
                </DropdownMenuTrigger>
                <ProtocoloHistoryMenu previous={previous} onSelect={(id) => { setReadOnlyProtoId(id); }} />
              </DropdownMenu>
            )}
          </Field>

          {viewedProtocolo && (
            <div className="space-y-3 border-t border-slate-100 pt-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-[10px] font-medium uppercase tracking-wider text-slate-400">
                  Dados do protocolo #{viewedProtocolo.numero}
                </div>
                {viewedProtocolo.id !== protocolo?.id && (
                  <button
                    type="button"
                    onClick={() => setReadOnlyProtoId(null)}
                    className="text-[10px] font-medium text-[#F26B1F] hover:underline"
                  >
                    Voltar ao atual
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 gap-3">
                <Field label="Número do pedido">
                  <input
                    value={protoForm.numero_pedido}
                    onChange={(e) => setProtoForm((v) => ({ ...v, numero_pedido: e.target.value }))}
                    placeholder="Digite o número do pedido"
                    className="w-full rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-800 placeholder:text-slate-400 focus:border-[#F26B1F]/50 focus:outline-none"
                  />
                </Field>
                <Field label="Número da reserva aérea">
                  <input
                    value={protoForm.numero_reserva}
                    onChange={(e) => setProtoForm((v) => ({ ...v, numero_reserva: e.target.value.toUpperCase() }))}
                    placeholder="Digite o número da reserva"
                    className="w-full rounded-md border border-slate-200 bg-white px-3 py-1.5 font-mono text-xs uppercase text-slate-800 placeholder:font-sans placeholder:normal-case placeholder:text-slate-400 focus:border-[#F26B1F]/50 focus:outline-none"
                  />
                </Field>
                <Field label="Necessidade do cliente">
                  <textarea
                    value={protoForm.assunto_resumo}
                    onChange={(e) => setProtoForm((v) => ({ ...v, assunto_resumo: e.target.value }))}
                    rows={3}
                    placeholder="Descreva a necessidade deste protocolo"
                    className="w-full resize-none rounded-md border border-slate-200 bg-white px-3 py-1.5 text-[11px] leading-relaxed text-slate-700 placeholder:text-slate-400 focus:border-[#F26B1F]/50 focus:outline-none"
                  />
                </Field>
              </div>

              <button
                type="button"
                onClick={() => updateProtoMut.mutate()}
                disabled={updateProtoMut.isPending}
                className="flex w-full items-center justify-center gap-1.5 rounded-md bg-[#F26B1F] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                {updateProtoMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                Salvar dados do protocolo
              </button>

            </div>
          )}

          {/* Rodapé: metadados compactos */}
          <div className="grid grid-cols-2 gap-3 border-t border-slate-100 pt-3">
            {conv.agent_slug && (
              <div>
                <div className="text-[10px] font-medium uppercase tracking-wide text-slate-400">Agente IA</div>
                <div className="text-xs capitalize text-slate-800">{conv.agent_slug}</div>
              </div>
            )}
            <div>
              <div className="text-[10px] font-medium uppercase tracking-wide text-slate-400">Cadastro</div>
              <div className="text-xs text-slate-800">{conv.person_id ? "Vinculado ✓" : "Não vinculado"}</div>
            </div>
          </div>

          {conv.tags && conv.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {conv.tags.map((t) => (
                <span key={t} className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-700">{t}</span>
              ))}
            </div>
          )}

          {orders.length > 0 && (
            <div className="border-t border-slate-100 pt-3">
              <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-slate-400">
                Pedidos deste contato
              </div>
              <div className="space-y-1.5">
                {orders.map((o) => (
                  <a
                    key={o.id}
                    href={`/admin/pedidos/${o.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] hover:border-[#F26B1F]/50 hover:bg-orange-50/30"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono font-semibold text-slate-800">#{o.order_number}</span>
                      <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] text-slate-600">{o.status}</span>
                    </div>
                    {o.trip_title && (
                      <div className="mt-0.5 truncate text-[10px] text-slate-500">{o.trip_title}</div>
                    )}
                    {o.airline_locator && (
                      <div className="mt-0.5 text-[10px] text-slate-600">
                        Localizador aéreo: <span className="font-mono font-semibold">{o.airline_locator}</span>
                      </div>
                    )}
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
      <AlertDialog open={confirmCloseProto} onOpenChange={setConfirmCloseProto}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Encerrar protocolo?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja encerrar o protocolo? O cliente receberá uma mensagem automática avisando do encerramento.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => closeProtoMut.mutate()}>Encerrar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <ProtocoloMessagesDialog
        protocoloId={readOnlyProtoId}
        protocolo={readOnlyProtoId ? protoHistory.find((p) => p.id === readOnlyProtoId) ?? null : null}
        onClose={() => setReadOnlyProtoId(null)}
      />
    </TooltipProvider>
  );
}

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function ProtocoloHistoryMenu({ previous, onSelect }: { previous: Array<{ id: string; numero: string; opened_at: string; closed_at: string | null; status: string; assunto_resumo: string | null; numero_pedido: string | null; numero_reserva: string | null }>; onSelect: (id: string) => void }) {
  return (
    <DropdownMenuContent align="end" className="w-72 max-h-72 overflow-y-auto">
      <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-slate-500">Protocolos anteriores</DropdownMenuLabel>
      <DropdownMenuSeparator />
      {previous.length === 0 ? (
        <div className="px-2 py-3 text-center text-[11px] italic text-slate-500">Não há protocolos anteriores</div>
      ) : (
        previous.map((p) => (
          <DropdownMenuItem key={p.id} onSelect={() => onSelect(p.id)} className="flex cursor-pointer flex-col items-start gap-0.5">
            <div className="flex w-full items-center justify-between gap-2">
              <span className="font-mono text-xs font-semibold">#{p.numero}</span>
              <span className={cn(
                "rounded-full px-1.5 py-0.5 text-[9px] font-medium",
                p.status === "aberto" ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600",
              )}>
                {p.status === "aberto" ? "aberto" : "encerrado"}
              </span>
            </div>
            <div className="flex w-full items-center justify-between text-[10px] text-slate-500">
              <span>Aberto: {fmtDateTime(p.opened_at)}</span>
              {p.closed_at && <span>Fechado: {fmtDate(p.closed_at)}</span>}
            </div>
            {p.assunto_resumo && (
              <span className="line-clamp-2 text-[10px] text-slate-500">{p.assunto_resumo}</span>
            )}
          </DropdownMenuItem>
        ))
      )}
    </DropdownMenuContent>
  );
}

function ProtocoloMessagesDialog({ protocoloId, protocolo, onClose }: {
  protocoloId: string | null;
  protocolo: { numero: string; opened_at: string; closed_at: string | null; assunto_resumo: string | null; numero_pedido: string | null; numero_reserva: string | null; resumo_conversa?: string | null } | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const ensureFn = useServerFn(ensureProtocoloResumo);
  const { data: ensured, isFetching } = useQuery({
    queryKey: ["chat", "proto-ensure-resumo", protocoloId],
    queryFn: () => ensureFn({ data: { protocolo_id: protocoloId! } }),
    enabled: !!protocoloId && !((protocolo?.resumo_conversa ?? "").trim()),
    staleTime: 5 * 60_000,
  });

  const resumo = ((protocolo?.resumo_conversa ?? "").trim()) || ((ensured?.resumo_conversa ?? "").trim()) || "";
  const necessidade = ((protocolo?.assunto_resumo ?? "").trim()) || ((ensured?.assunto_resumo ?? "").trim()) || "";

  useEffect(() => {
    if (ensured?.updated) {
      qc.invalidateQueries({ queryKey: ["chat", "protocolo-history"] });
    }
  }, [ensured?.updated, qc]);

  return (
    <Dialog open={!!protocoloId} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-mono">
            Protocolo #{protocolo?.numero ?? ""} <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-normal text-slate-600">somente leitura</span>
          </DialogTitle>
          <DialogDescription className="text-xs">
            {protocolo && (
              <span>
                Aberto em {fmtDateTime(protocolo.opened_at)}
                {protocolo.closed_at && <> · Fechado em {fmtDateTime(protocolo.closed_at)}</>}
                {protocolo.numero_pedido && <> · Pedido #{protocolo.numero_pedido}</>}
                {protocolo.numero_reserva && <> · Reserva {protocolo.numero_reserva}</>}
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {necessidade && (
            <div className="rounded-md border border-slate-200 bg-white p-3">
              <div className="mb-1 text-[10px] font-medium uppercase tracking-wider text-slate-500">Necessidade do cliente</div>
              <div className="whitespace-pre-wrap text-[12px] leading-relaxed text-slate-800">{necessidade}</div>
            </div>
          )}
          <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <div className="text-[10px] font-medium uppercase tracking-wider text-slate-500">O que foi tratado no protocolo</div>
              {protocoloId && (
                <button
                  type="button"
                  onClick={() => window.open(`/protocolo/${protocoloId}`, "_blank", "noopener,noreferrer")}
                  className="inline-flex items-center gap-1 rounded-md border border-[#F26B1F]/30 bg-white px-2 py-0.5 text-[10px] font-medium text-[#F26B1F] hover:bg-[#F26B1F]/5"
                  title="Abrir conversa completa em nova aba"
                >
                  <ExternalLink className="h-3 w-3" /> Expandir
                </button>
              )}
            </div>
            {resumo ? (
              <div className="whitespace-pre-wrap text-[12px] leading-relaxed text-slate-800">{resumo}</div>
            ) : isFetching ? (
              <div className="flex items-center gap-2 text-[11px] italic text-slate-500">
                <Loader2 className="h-3 w-3 animate-spin" /> Gerando resumo pela IA…
              </div>
            ) : (
              <div className="text-[11px] italic text-slate-500">
                Sem resumo salvo. Clique em Expandir pra ver a conversa completa.
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-200"
          >
            Fechar
          </button>

        </DialogFooter>
      </DialogContent>
    </Dialog>
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

/**
 * Mídia do CDN do Instagram (lookaside/fbcdn): a URL não diz se é foto ou vídeo.
 * Tenta como imagem e, se falhar, troca para player de vídeo.
 */
function MidiaCdn({
  url,
  alt,
  className = "",
  controls = false,
}: { url: string; alt: string; className?: string; controls?: boolean }) {
  const [ehVideo, setEhVideo] = useState(/\.mp4(\?|$)/i.test(url));
  if (ehVideo) {
    return <video src={url} controls={controls} playsInline className={className} />;
  }
  return <img src={url} alt={alt} className={className} onError={() => setEhVideo(true)} loading="lazy" />;
}

/** Lightbox dentro do chat — evita abrir nova aba ao clicar na mídia. */
function MidiaLightbox({ url, onClose }: { url: string | null; onClose: () => void }) {
  return (
    <Dialog open={!!url} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-3xl border-none bg-transparent p-0 shadow-none">
        <DialogHeader className="sr-only">
          <DialogTitle>Mídia</DialogTitle>
          <DialogDescription>Visualização da mídia da conversa</DialogDescription>
        </DialogHeader>
        {url && (
          <div className="flex max-h-[85vh] items-center justify-center">
            <MidiaCdn url={url} alt="Mídia" controls className="max-h-[85vh] w-auto rounded-xl object-contain" />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ============ Instagram DM conversa ============



function InstagramConversationView({
  conversationId,
  mirror = null,
  onRefetch,
  onBack,
}: {
  conversationId: string;
  mirror?: Conv | null;
  onRefetch?: () => void;
  onBack: () => void;
}) {
  const msgsFn = useServerFn(listInstagramMessages);
  const wallpaper = useWallpaper();

  const sendFn = useServerFn(sendInstagramReply);
  const attachFn = useServerFn(sendInstagramAttachment);
  const toggleFn = useServerFn(toggleConversationMode);
  const pauseAiFn = useServerFn(setAiPaused);
  const qc = useQueryClient();
  const igToggleMut = useMutation({
    mutationFn: async (mode: "ai" | "human") => toggleFn({ data: { conversation_id: mirror!.id, mode } }),
    onSuccess: () => { onRefetch?.(); toast.success("Modo alterado"); },
    onError: (e) => toast.error(`Falha: ${(e as Error).message}`),
  });
  const igAiPaused = !!(mirror as { ai_paused?: boolean | null } | null)?.ai_paused;
  const igPauseMut = useMutation({
    mutationFn: async (paused: boolean) => pauseAiFn({ data: { conversation_id: mirror!.id, paused } }),
    onSuccess: (_d, paused) => {
      onRefetch?.();
      toast.success(paused ? "IA pausada — ela não responde até você retomar" : "IA retomada");
    },
    onError: (e) => toast.error(`Falha: ${(e as Error).message}`),
  });

  const [text, setText] = useState("");
  const [midiaAberta, setMidiaAberta] = useState<string | null>(null);

  const fileRef = useRef<HTMLInputElement | null>(null);
  const [igRecording, setIgRecording] = useState(false);
  const igRecorderRef = useRef<MediaRecorder | null>(null);

  const igAttach = useMutation({
    mutationFn: async (file: File) => {
      const buf = new Uint8Array(await file.arrayBuffer());
      let bin = "";
      for (const b of buf) bin += String.fromCharCode(b);
      return attachFn({
        data: {
          conversation_id: conversationId,
          file_base64: btoa(bin),
          mime: file.type || "application/octet-stream",
          filename: file.name || `arquivo-${Date.now()}`,
        },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ig", "messages", conversationId] });
      toast.success("Mídia enviada");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function toggleIgRecording() {
    if (igRecording) {
      igRecorderRef.current?.stop();
      setIgRecording(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        try {
          const mp3 = await audioBlobToMp3(new Blob(chunks, { type: rec.mimeType || "audio/webm" }));
          await igAttach.mutateAsync(new File([mp3], `audio-${Date.now()}.mp3`, { type: "audio/mpeg" }));
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Falha ao enviar o áudio");
        }
      };
      igRecorderRef.current = rec;
      rec.start();
      setIgRecording(true);
    } catch {
      toast.error("Não consegui acessar o microfone");
    }
  }

  const { data: msgs = [], isLoading } = useQuery({
    queryKey: ["ig", "messages", conversationId],
    queryFn: () => msgsFn({ data: { conversation_id: conversationId } }),
    refetchInterval: 10_000,
  });

  const send = useMutation({
    mutationFn: (t: string) => sendFn({ data: { conversation_id: conversationId, text: t } }),
    onSuccess: () => {
      setText("");
      qc.invalidateQueries({ queryKey: ["ig", "messages", conversationId] });
      qc.invalidateQueries({ queryKey: ["ig", "conversations"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delMsgFn = useServerFn(deleteInstagramMessage);
  const delMsg = useMutation({
    mutationFn: (v: { id: string; escopo: "todos" | "aqui" }) => delMsgFn({ data: v }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["ig", "messages", conversationId] });
      qc.invalidateQueries({ queryKey: ["ig", "conversations"] });
      const aviso = (r as { aviso?: string | null } | undefined)?.aviso;
      if (aviso) toast.warning(aviso);
      else toast.success("Mensagem apagada");
    },
    onError: (e: Error) => toast.error(e.message),
  });


  const igListFn = useServerFn(listInstagramConversations);
  const { data: igConvs = [] } = useQuery({
    queryKey: ["ig", "conversations"],
    queryFn: () => igListFn(),
    refetchInterval: 15_000,
  });
  const profile = igConvs.find((c) => c.id === conversationId) ?? null;

  // Quando o @ ou a foto não vieram pelo webhook, busca o perfil na hora.
  const refreshProfileFn = useServerFn(refreshInstagramProfile);
  const tentouPerfil = useRef<string | null>(null);
  useEffect(() => {
    if (!profile) return;
    if (profile.contact_username && profile.contact_profile_pic) return;
    if (tentouPerfil.current === conversationId) return;
    tentouPerfil.current = conversationId;
    refreshProfileFn({ data: { conversation_id: conversationId } })
      .then(() => {
        qc.invalidateQueries({ queryKey: ["ig", "conversations"] });
      })
      .catch(() => {});
  }, [profile, conversationId, refreshProfileFn, qc]);





  return (
    <div className="flex h-full min-h-0 flex-col">
      <MidiaLightbox url={midiaAberta} onClose={() => setMidiaAberta(null)} />

      <header className="flex items-center gap-2 border-b border-slate-200 bg-white px-3 py-2">
        <button onClick={onBack} className="md:hidden" aria-label="Voltar">
          <ArrowLeft className="h-4 w-4 text-slate-500" />
        </button>
        {profile?.contact_profile_pic ? (
          <img src={profile.contact_profile_pic} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" />
        ) : (
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-pink-500 to-orange-500 text-white">
            <Instagram className="h-4 w-4" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-sm font-medium text-slate-900">
              {profile?.contact_name ?? (profile?.contact_username ? `@${profile.contact_username}` : "Instagram Direct")}
            </span>
            {mirror?.protocolo_numero && (
              <span className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-[10px] text-slate-600">
                #{mirror.protocolo_numero}
              </span>
            )}
            {profile?.contact_username && (
              <a
                href={`https://instagram.com/${profile.contact_username}`}
                target="_blank"
                rel="noreferrer"
                title="Abrir perfil no Instagram"
                aria-label="Abrir perfil no Instagram"
                className="shrink-0 rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-[#F26B1F]"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
          </div>
          <div className="truncate text-[11px] text-slate-500">
            {profile?.contact_username ? `@${profile.contact_username} · ` : ""}Instagram Direct
            {mirror && (
              <> · {mirror.mode === "ai" ? `IA (${mirror.agent_slug ?? "auto"})` : mirror.mode === "human" ? "Humano" : "Arquivada"}</>
            )}
            {mirror?.mode === "ai" && igAiPaused && (
              <> · <span className="font-semibold text-amber-600">IA pausada</span></>
            )}
          </div>
        </div>

        {mirror && (
          <>
            {mirror.mode === "ai" && (
              <button
                onClick={() => igPauseMut.mutate(!igAiPaused)}
                disabled={igPauseMut.isPending}
                aria-label={igAiPaused ? "Retomar IA" : "Pausar IA"}
                className={cn(
                  "inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2 py-1.5 text-[11px] font-medium transition-colors disabled:opacity-50",
                  igAiPaused
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                    : "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100",
                )}
              >
                {igPauseMut.isPending
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : igAiPaused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
                <span className="hidden sm:inline">{igAiPaused ? "Retomar IA" : "Pausar IA"}</span>
              </button>
            )}
            <button
              onClick={() => igToggleMut.mutate(mirror.mode === "ai" ? "human" : "ai")}
              className="shrink-0 rounded-md border border-slate-200 px-2 py-1.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50 sm:px-3"
            >
              {mirror.mode === "ai" ? "Assumir" : "Devolver p/ IA"}
            </button>
            <ConversationMenu conv={mirror} onChange={() => onRefetch?.()} />
          </>
        )}
        <WallpaperMenu wallpaper={wallpaper} />
      </header>



      <div className="flex-1 space-y-2 overflow-y-auto p-4" style={wallpaper.style}>

        {isLoading ? (
          <div className="text-center text-xs text-slate-400">Carregando…</div>
        ) : msgs.length === 0 ? (
          <div className="text-center text-xs text-slate-400">Nenhuma mensagem</div>
        ) : (
          msgs.map((m) => {
            // A IA envia com o prefixo "*Nome:*" — mostramos o consultor igual no WhatsApp.
            const bruto = (m.text ?? "") as string;
            const casa = bruto.match(/^\*([^*\n]{2,40}):\*\s*\n?/);
            const remetente = casa?.[1] ?? null;
            const corpo = casa ? bruto.slice(casa[0].length) : bruto;
            const apagada = (m as { is_deleted?: boolean | null }).is_deleted === true;
            return (
            <div key={m.id} className={cn("group flex items-center gap-1", m.direction === "outbound" ? "justify-end" : "justify-start")}>
              {m.direction === "outbound" && !apagada && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      className="opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
                      aria-label="Ações da mensagem"
                    >
                      <MoreVertical className="h-3.5 w-3.5 text-slate-400" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuLabel>Apagar mensagem</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={() =>
                        confirmThen(
                          {
                            title: "Apagar para todos?",
                            description: "A mensagem some do Instagram para você e para o cliente.",
                            confirmText: "Apagar para todos",
                            destructive: true,
                          },
                          () => delMsg.mutate({ id: m.id as string, escopo: "todos" }),
                        )
                      }
                    >
                      Apagar para todos
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() =>
                        confirmThen(
                          {
                            title: "Apagar só aqui?",
                            description: "A mensagem some apenas do nosso painel; no Instagram ela continua.",
                            confirmText: "Apagar aqui",
                            destructive: true,
                          },
                          () => delMsg.mutate({ id: m.id as string, escopo: "aqui" }),
                        )
                      }
                    >
                      Apagar só aqui
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              <div className={cn(
                "max-w-[70%] rounded-2xl px-3 py-2 text-sm shadow-sm",
                apagada
                  ? "border border-dashed border-slate-300 bg-slate-100 italic text-slate-400"
                  : m.direction === "outbound" ? bolhaConta((profile as any)?.account_username) : "bg-white text-slate-900",
              )}>
                {apagada ? (
                  <div className="text-xs">Mensagem apagada</div>
                ) : (
                <>
                {remetente && (
                  <div className={cn(
                    "mb-0.5 text-[11px] font-semibold",
                    m.direction === "outbound" ? "text-white" : "text-[#F26B1F]",
                  )}>
                    {remetente}:
                  </div>
                )}
                {(() => {
                  const tipo = (m.message_type ?? "").toLowerCase();
                  const ehStory = tipo.includes("story");
                  const ehShare = tipo.includes("share") || tipo.includes("reel");
                  const url = m.attachment_url;
                  if (!url) {
                    return ehStory || ehShare ? (
                      <div className={cn("rounded-lg border px-2 py-1 text-[11px]", m.direction === "outbound" ? "border-white/30 text-white/90" : "border-slate-200 text-slate-600")}>
                        {ehStory ? "Resposta ao story" : "Publicação compartilhada"}
                      </div>
                    ) : null;
                  }
                  if (tipo.includes("audio")) return <audio controls src={url} className="max-w-[240px]" />;
                  if (tipo.includes("video") && !ehShare) return <video controls src={url} className="max-h-60 max-w-[240px] rounded-lg" />;
                  if (ehStory || ehShare) {
                    const ehLink = /^https?:\/\//.test(url) && !/lookaside|cdninstagram|fbcdn/.test(url);
                    const rotulo = (
                      <div className={cn("mb-1 text-[10px] font-semibold uppercase tracking-wide", m.direction === "outbound" ? "text-white/80" : "text-slate-500")}>
                        {ehStory ? "Resposta ao story" : "Publicação compartilhada"}
                      </div>
                    );
                    if (ehLink) {
                      return (
                        <a href={url} target="_blank" rel="noreferrer" className={cn("block rounded-lg border p-1.5", m.direction === "outbound" ? "border-white/30" : "border-slate-200")}>
                          {rotulo}
                          <span className="text-xs underline [overflow-wrap:anywhere]">{url}</span>
                        </a>
                      );
                    }
                    return (
                      <button
                        type="button"
                        onClick={() => setMidiaAberta(url)}
                        className={cn("block rounded-lg border p-1.5 text-left", m.direction === "outbound" ? "border-white/30" : "border-slate-200")}
                      >
                        {rotulo}
                        <MidiaCdn url={url} alt={ehStory ? "Story" : "Publicação"} className="max-h-60 rounded-md object-cover" />
                      </button>
                    );
                  }
                  if (tipo.includes("image") || tipo.includes("gif") || tipo.includes("sticker")) {
                    return (
                      <button type="button" onClick={() => setMidiaAberta(url)} className="block">
                        <MidiaCdn url={url} alt="Mídia" className="max-h-60 rounded-lg object-cover" />
                      </button>
                    );
                  }

                  return (
                    <a href={url} target="_blank" rel="noreferrer" className="underline">
                      {m.message_type ?? "mídia"}
                    </a>
                  );
                })()}

                {corpo ? <div className="whitespace-pre-wrap break-words">{corpo}</div> : null}
                </>
                )}

                <div className={cn("mt-0.5 text-[10px]", apagada ? "text-slate-400" : m.direction === "outbound" ? "text-white/70" : "text-slate-400")}>
                  {new Date(m.created_at as string).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                  {m.status === "failed" && !apagada ? " · não entregue" : ""}
                  {m.direction === "outbound" && !apagada && m.status !== "failed" ? (
                    <ReciboDirect
                      deliveredAt={(m as { delivered_at?: string | null }).delivered_at ?? null}
                      readAt={(m as { read_at?: string | null }).read_at ?? null}
                    />
                  ) : null}
                </div>
              </div>
              {m.direction === "inbound" && !apagada && (
                <button
                  onClick={() =>
                    confirmThen(
                      {
                        title: "Apagar só aqui?",
                        description:
                          "O Instagram não deixa apagar mensagem recebida — ela some apenas do nosso painel.",
                        confirmText: "Apagar aqui",
                        destructive: true,
                      },
                      () => delMsg.mutate({ id: m.id as string, escopo: "aqui" }),
                    )
                  }
                  className="opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
                  aria-label="Apagar mensagem"
                >
                  <Trash2 className="h-3.5 w-3.5 text-slate-400 hover:text-red-500" />
                </button>
              )}
            </div>
            );

          })


        )}
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); if (text.trim()) send.mutate(text.trim()); }}
        className="flex items-center gap-2 border-t border-slate-200 bg-white p-3"
      >
        <input
          ref={fileRef}
          type="file"
          accept="image/*,video/*,audio/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) igAttach.mutate(f);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={igAttach.isPending}
          className="flex h-9 w-9 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 disabled:opacity-50"
          aria-label="Anexar"
        >
          {igAttach.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
        </button>
        <button
          type="button"
          onClick={toggleIgRecording}
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-full",
            igRecording ? "bg-red-500 text-white" : "text-slate-500 hover:bg-slate-100",
          )}
          aria-label="Gravar áudio"
        >
          {igRecording ? <Square className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
        </button>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Responder no Instagram…"
          className="flex-1 rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm focus:border-[#F26B1F]/50 focus:bg-white focus:outline-none"
        />
        <button
          type="submit"
          disabled={send.isPending || !text.trim()}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-[#F26B1F] text-white disabled:opacity-50"
        >
          {send.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </button>
      </form>
    </div>
  );
}

// ============ Instagram DM list (embedded) ============


function InstagramList({ folder, search, activeId, onSelect }: { folder: string; search: string; activeId: string | null; onSelect: (id: string) => void }) {
  const listFn = useServerFn(listInstagramConversations);
  const { data: convs = [], isLoading } = useQuery({
    queryKey: ["ig", "conversations"],
    queryFn: () => listFn(),
    refetchInterval: 15_000,
  });

  const filtered = convs.filter((c) => {
    if (folder === "unread" && (c.unread_count ?? 0) <= 0) return false;
    if (folder === "resolved" && c.status !== "closed") return false;
    if (folder !== "resolved" && c.status === "closed") return false;
    if (search) {
      const s = search.toLowerCase();
      return (c.contact_name ?? "").toLowerCase().includes(s) || (c.contact_username ?? "").toLowerCase().includes(s);
    }
    return true;
  });

  if (isLoading) return <div className="p-6 text-center text-xs text-slate-400">Carregando…</div>;
  if (filtered.length === 0) return <div className="p-6 text-center text-xs text-slate-400">Nenhuma conversa no Instagram</div>;

  return (
    <>
      {filtered.map((c) => (
        <div
          key={c.id}
          role="button"
          tabIndex={0}
          onClick={() => onSelect(c.id)}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onSelect(c.id); }}
          className={cn(
            "flex w-full cursor-pointer items-start gap-2 rounded-lg p-2 text-left transition-colors",
            activeId === c.id ? "bg-pink-50" : "hover:bg-slate-50",
          )}
        >
          {c.contact_profile_pic ? (
            <img src={c.contact_profile_pic} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
          ) : (
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-pink-500 to-orange-500 text-sm font-semibold text-white">
              {(c.contact_name ?? c.contact_username ?? "?").replace(/^@/, "").charAt(0).toUpperCase()}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-1">
              <span className="truncate text-sm font-medium text-slate-900">
                {c.contact_name ?? c.contact_username ?? "sem nome"}
              </span>
              <div className="flex shrink-0 items-center gap-1">
                {(c.unread_count ?? 0) > 0 && (
                  <span className="rounded-full bg-pink-500 px-1.5 text-[10px] font-medium text-white">{c.unread_count}</span>
                )}
                <DmRowMenu conversationId={c.id} naoLidas={c.unread_count ?? 0} />
              </div>
            </div>
            {c.contact_username && <div className="text-[10px] text-slate-500">@{c.contact_username}</div>}
            <div className="truncate text-xs text-slate-500">{c.last_message_preview ?? "—"}</div>
            <ContaTag username={(c as any).account_username} className="mt-0.5" />
          </div>
        </div>
      ))}

    </>
  );
}

// ============ Instagram Comments list (embedded) ============

/** Lista de publicações: cada post vira uma "conversa" de comentários. */
function InstagramMediaThreadList({
  search,
  activeId,
  onSelect,
}: {
  search: string;
  activeId: string | null;
  onSelect: (id: string) => void;
}) {
  const threadsFn = useServerFn(listInstagramCommentThreads);
  const { data: threads = [], isLoading } = useQuery({
    queryKey: ["ig", "comment-threads"],
    queryFn: () => threadsFn(),
    refetchInterval: 20_000,
  });

  const filtered = threads.filter((t) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      (t.media_caption ?? "").toLowerCase().includes(s) ||
      t.comments.some((c) => (c.from_username ?? "").toLowerCase().includes(s) || (c.text ?? "").toLowerCase().includes(s))
    );
  });

  if (isLoading) return <div className="p-6 text-center text-xs text-slate-400">Carregando…</div>;
  if (filtered.length === 0) return <div className="p-6 text-center text-xs text-slate-400">Nenhum comentário</div>;

  return (
    <>
      {filtered.map((t) => {
        const ultimo = t.comments[t.comments.length - 1];
        return (
          <div
            key={t.media_id}
            role="button"
            tabIndex={0}
            onClick={() => onSelect(t.media_id)}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onSelect(t.media_id); }}
            className={cn(
              "flex w-full cursor-pointer items-start gap-2 rounded-lg border p-2.5 text-left transition-colors",
              activeId === t.media_id
                ? "border-[#F26B1F]/40 bg-orange-50"
                : "border-slate-100 bg-white hover:bg-slate-50",
            )}
          >
            {t.media_thumbnail ? (
              <img src={t.media_thumbnail} alt="Publicação" className="h-11 w-11 shrink-0 rounded-md object-cover" />
            ) : (
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-purple-500 via-pink-500 to-orange-500 text-white">
                <Instagram className="h-4 w-4" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1">
                <span className="truncate text-xs font-semibold text-slate-900">
                  {t.media_caption?.slice(0, 40) || "Publicação sem legenda"}
                </span>
                <div className="ml-auto flex shrink-0 items-center gap-1">
                  {t.pendentes > 0 && (
                    <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[#F26B1F] px-1 text-[9px] font-semibold text-white">
                      {t.pendentes}
                    </span>
                  )}
                  <ThreadRowMenu mediaId={t.media_id} pendentes={t.pendentes ?? 0} />
                </div>
              </div>
              <p className="mt-0.5 line-clamp-1 text-[11px] text-slate-600 [overflow-wrap:anywhere]">
                {ultimo ? `@${ultimo.from_username ?? "usuário"}: ${ultimo.text ?? ""}` : "Sem comentários"}
              </p>
              <ContaTag username={(t as any).account_username} className="mt-1" />
              <div className="mt-0.5 text-[10px] text-slate-400">
                {t.total} comentário{t.total === 1 ? "" : "s"}
                {t.last_at ? ` · ${new Date(t.last_at as string).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}` : ""}
              </div>
            </div>
          </div>
        );
      })}
    </>
  );
}

/** URL de imagem enviada junto ao comentário (sticker/GIF/anexo), quando houver. */
function anexoDoComentario(c: { text?: string | null; metadata?: unknown }): string | null {
  const meta = (c.metadata ?? {}) as Record<string, unknown>;
  const direto = (meta.attachment_url ?? meta.media_url ?? meta.image_url) as string | undefined;
  if (typeof direto === "string" && /^https?:\/\//.test(direto)) return direto;
  const naMensagem = (c.text ?? "").match(/https?:\/\/\S+\.(?:jpe?g|png|gif|webp)(?:\?\S*)?/i);
  return naMensagem?.[0] ?? null;
}

type ComentarioBase = {
  id: string;
  comment_id?: string | null;
  parent_comment_id?: string | null;
  from_username?: string | null;
  text?: string | null;
  created_at?: string | null;
};

/**
 * Coloca cada resposta logo embaixo do comentário que ela responde.
 * Quando o Instagram não mandou o `parent_comment_id` (histórico antigo),
 * inferimos pelo @menção no início da nossa resposta ou pelo último
 * comentário de terceiro ainda sem resposta nossa.
 */
function ordenarComentariosEmThread<T extends ComentarioBase>(
  comments: T[],
  nossos: Set<string>,
): Array<{ item: T; depth: number }> {
  const cron = [...comments].sort((a, b) => (a.created_at ?? "").localeCompare(b.created_at ?? ""));
  const chave = (c: T) => c.comment_id ?? c.id;
  const existentes = new Set(cron.map(chave));

  const paiDe = new Map<string, string>();
  const respondidos = new Set<string>();

  for (const c of cron) {
    const k = chave(c);
    const meu = nossos.has((c.from_username ?? "").replace(/^@/, "").toLowerCase());
    let pai = c.parent_comment_id && existentes.has(c.parent_comment_id) ? c.parent_comment_id : null;

    if (!pai && meu) {
      const mencao = (c.text ?? "").match(/^\s*@([A-Za-z0-9._]+)/)?.[1]?.toLowerCase();
      const anteriores = cron.filter(
        (o) => (o.created_at ?? "") < (c.created_at ?? "") && !nossos.has((o.from_username ?? "").replace(/^@/, "").toLowerCase()),
      );
      const candidatos = mencao
        ? anteriores.filter((o) => (o.from_username ?? "").replace(/^@/, "").toLowerCase() === mencao)
        : anteriores;
      const alvo =
        [...candidatos].reverse().find((o) => !respondidos.has(chave(o))) ??
        [...candidatos].reverse()[0];
      if (alvo) pai = chave(alvo);
    }

    if (pai && pai !== k) {
      paiDe.set(k, pai);
      respondidos.add(pai);
    }
  }

  const filhos = new Map<string, T[]>();
  const raizes: T[] = [];
  for (const c of cron) {
    const pai = paiDe.get(chave(c));
    if (pai) filhos.set(pai, [...(filhos.get(pai) ?? []), c]);
    else raizes.push(c);
  }

  const saida: Array<{ item: T; depth: number }> = [];
  const visitar = (c: T, depth: number) => {
    saida.push({ item: c, depth });
    for (const f of filhos.get(chave(c)) ?? []) visitar(f, Math.min(depth + 1, 1));
  };
  for (const r of raizes) visitar(r, 0);
  return saida;
}

/** Janela da publicação: todos os comentários em formato de conversa. */

function InstagramCommentThreadView({ mediaId, onBack }: { mediaId: string; onBack: () => void }) {
  const threadsFn = useServerFn(listInstagramCommentThreads);
  const accountsFn = useServerFn(listInstagramAccounts);
  const replyFn = useServerFn(triggerAutoReplyComment);
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [alvo, setAlvo] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [verMidia, setVerMidia] = useState(false);
  const [postAberto, setPostAberto] = useState(false);


  const bottomRef = useRef<HTMLDivElement | null>(null);
  const wallpaper = useWallpaper();


  const { data: threads = [], isLoading } = useQuery({
    queryKey: ["ig", "comment-threads"],
    queryFn: () => threadsFn(),
    refetchInterval: 15_000,
  });
  const { data: accounts = [] } = useQuery({
    queryKey: ["ig", "accounts"],
    queryFn: () => accountsFn(),
    staleTime: 5 * 60_000,
  });
  const nossos = useMemo(
    () => new Set(accounts.map((a) => (a.username ?? "").toLowerCase()).filter(Boolean)),
    [accounts],
  );

  const thread = threads.find((t) => t.media_id === mediaId) ?? null;
  const legendaLonga = (thread?.media_caption ?? "").length > 140;
  const comments = thread?.comments ?? [];

  // Ao abrir a publicação, marca os comentários como lidos (badge some).
  const markReadFn = useServerFn(markInstagramCommentThreadRead);
  const deleteThreadFn = useServerFn(deleteInstagramCommentThread);
  const delCommentFn = useServerFn(deleteInstagramComment);
  const hideCommentFn = useServerFn(setInstagramCommentHidden);
  const syncLikesFn = useServerFn(syncInstagramCommentLikes);
  const likeFn = useServerFn(toggleInstagramCommentLike);
  const toggleLike = useMutation({
    mutationFn: (v: { id: string; like: boolean }) => likeFn({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ig", "comment-threads"] }),
    onError: (e: Error) => toast.error(e.message),
  });
  const delComment = useMutation({
    mutationFn: (v: { id: string; escopo: "instagram" | "local" }) => delCommentFn({ data: v }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["ig", "comment-threads"] });
      const aviso = (r as { aviso?: string | null } | undefined)?.aviso;
      if (aviso) toast.warning(aviso);
      else toast.success("Comentário apagado");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const hideComment = useMutation({
    mutationFn: (v: { id: string; hidden: boolean }) => hideCommentFn({ data: v }),
    onSuccess: (_r, v) => {
      qc.invalidateQueries({ queryKey: ["ig", "comment-threads"] });
      toast.success(v.hidden ? "Comentário ocultado no Instagram" : "Comentário reexibido");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Ao abrir a publicação, atualiza a contagem de curtidas dos comentários.
  const jaSincronizouLikes = useRef<string | null>(null);
  useEffect(() => {
    if (!mediaId || jaSincronizouLikes.current === mediaId) return;
    jaSincronizouLikes.current = mediaId;
    syncLikesFn({ data: { media_id: mediaId } })
      .then(() => qc.invalidateQueries({ queryKey: ["ig", "comment-threads"] }))
      .catch(() => {});
  }, [mediaId, syncLikesFn, qc]);

  // Sempre que a publicação aberta tiver comentários pendentes, marca como lida.
  const marcando = useRef(false);
  const pendentes = thread?.pendentes ?? 0;
  useEffect(() => {
    if (!mediaId || pendentes <= 0 || marcando.current) return;
    marcando.current = true;
    // some na hora com o badge (otimista) e confirma no servidor
    qc.setQueryData(["ig", "comment-threads"], (old: any) =>
      Array.isArray(old) ? old.map((t: any) => (t.media_id === mediaId ? { ...t, pendentes: 0 } : t)) : old,
    );
    markReadFn({ data: { media_id: mediaId } })
      .then(() => qc.invalidateQueries({ queryKey: ["ig", "comment-threads"] }))
      .catch((e: Error) => {
        toast.error(`Não deu pra marcar como lida: ${e.message}`);
        qc.invalidateQueries({ queryKey: ["ig", "comment-threads"] });
      })
      .finally(() => { marcando.current = false; });
  }, [mediaId, pendentes, markReadFn, qc]);

  // Mídia real da publicação (vídeo/foto) pra tocar dentro do painel.
  const mediaDetailsFn = useServerFn(getInstagramMediaDetails);
  const { data: midia, isLoading: midiaCarregando } = useQuery({
    queryKey: ["ig", "media", mediaId],
    queryFn: () => mediaDetailsFn({ data: { media_id: mediaId } }),
    enabled: verMidia && Boolean(mediaId),
    staleTime: 5 * 60_000,
    retry: false,
  });

  // Curtidas e insights da publicação (alcance, salvos, compartilhamentos…).
  const mediaStatsFn = useServerFn(getInstagramMediaStats);
  const {
    data: stats,
    isFetching: statsCarregando,
    refetch: recarregarStats,
  } = useQuery({
    queryKey: ["ig", "media-stats", mediaId],
    queryFn: () => mediaStatsFn({ data: { media_id: mediaId } }),
    enabled: Boolean(mediaId),
    staleTime: 2 * 60_000,
    retry: false,
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [comments.length, mediaId]);


  // Alvo padrão: último comentário de terceiros ainda sem resposta.
  const alvoPadrao = useMemo(() => {
    for (let i = comments.length - 1; i >= 0; i--) {
      const c = comments[i];
      if (!nossos.has((c.from_username ?? "").toLowerCase())) return c;
    }
    return null;
  }, [comments, nossos]);
  const comentariosEmThread = useMemo(() => ordenarComentariosEmThread(comments, nossos), [comments, nossos]);

  const alvoAtual = comments.find((c) => c.id === alvo) ?? alvoPadrao;


  async function enviar() {
    if (!text.trim() || !alvoAtual) return;
    setSending(true);
    const conteudo = text.trim();
    try {
      await replyFn({ data: { id: alvoAtual.id, public_reply: conteudo } });
      toast.success("Resposta publicada");
      setText("");
      setAlvo(null);
      qc.invalidateQueries({ queryKey: ["ig", "comment-threads"] });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Erro ao publicar";
      // Post em collab: o Instagram bloqueia a resposta pelo coautor.
      // Em vez de mostrar erro cru, guardamos como sugestão e copiamos o texto.
      if (/colabora/i.test(msg)) {
        try {
          await navigator.clipboard.writeText(conteudo);
        } catch {
          /* clipboard indisponível: o texto continua salvo como sugestão */
        }
        setText("");
        setAlvo(null);
        qc.invalidateQueries({ queryKey: ["ig", "comment-threads"] });
        toast.info("Resposta salva como sugestão e copiada", {
          description:
            "Publicação em colaboração: o Instagram só aceita resposta pelo perfil que publicou. Cole o texto por lá.",
          action: thread?.media_permalink
            ? { label: "Abrir post", onClick: () => window.open(thread.media_permalink!, "_blank") }
            : undefined,
        });
      } else {
        toast.error(msg);
      }
    } finally {
      setSending(false);
    }
  }


  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-start gap-2 border-b border-slate-200 bg-white px-3 py-2">
        <button onClick={onBack} className="mt-1 md:hidden" aria-label="Voltar">
          <ArrowLeft className="h-4 w-4 text-slate-500" />
        </button>
        <button
          type="button"
          onClick={() => setVerMidia(true)}
          className={cn(
            "relative shrink-0 overflow-hidden rounded-md border border-slate-200 bg-slate-200 transition-all",
            postAberto ? "h-20 w-20" : "h-10 w-10",
          )}
          aria-label="Abrir publicação"
        >
          {thread?.media_thumbnail ? (
            <img src={thread.media_thumbnail} alt="Publicação" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-purple-500 via-pink-500 to-orange-500 text-white">
              <Instagram className="h-4 w-4" />
            </div>
          )}
          {(thread?.media_type ?? "").toUpperCase().includes("VIDEO") && (
            <span className="absolute inset-0 flex items-center justify-center bg-black/30">
              <Play className={cn("fill-white text-white", postAberto ? "h-6 w-6" : "h-4 w-4")} />
            </span>
          )}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            Publicação{thread?.media_type ? ` · ${thread.media_type.toLowerCase()}` : ""} · {comments.length} comentário{comments.length === 1 ? "" : "s"}
            {thread?.collab && (
              <span className="rounded-full bg-[#F26B1F]/10 px-1.5 py-0.5 text-[9px] font-bold text-[#F26B1F]">
                collab
              </span>
            )}
          </div>

          <p
            className={cn(
              "text-xs text-slate-700 [overflow-wrap:anywhere]",
              postAberto
                ? "max-h-64 overflow-y-auto whitespace-pre-wrap leading-relaxed pr-1"
                : "line-clamp-2",
            )}
          >
            {thread?.media_caption ?? "Sem legenda"}
          </p>

          {(stats || statsCarregando) && (
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {statsCarregando && !stats ? (
                <span className="inline-flex items-center gap-1 text-[10px] text-slate-400">
                  <Loader2 className="h-2.5 w-2.5 animate-spin" /> carregando métricas…
                </span>
              ) : (
                <>
                  {[
                    { icone: Heart, valor: stats?.like_count ?? stats?.insights?.likes, titulo: "Curtidas" },
                    { icone: MessageCircle, valor: stats?.comments_count ?? stats?.insights?.comments, titulo: "Comentários" },
                    { icone: Eye, valor: stats?.insights?.views, titulo: "Visualizações" },
                    { icone: Users, valor: stats?.insights?.reach, titulo: "Contas alcançadas" },
                    { icone: Bookmark, valor: stats?.insights?.saved, titulo: "Salvamentos" },
                    { icone: Share2, valor: stats?.insights?.shares, titulo: "Compartilhamentos" },
                    { icone: BarChart3, valor: stats?.insights?.total_interactions, titulo: "Interações totais" },
                    { icone: UserPlus, valor: stats?.insights?.follows, titulo: "Novos seguidores pelo post" },
                    { icone: User, valor: stats?.insights?.profile_visits, titulo: "Visitas ao perfil" },
                    {
                      icone: Clock,
                      valor:
                        typeof stats?.insights?.ig_reels_avg_watch_time === "number"
                          ? Math.round(stats.insights.ig_reels_avg_watch_time / 1000)
                          : undefined,
                      titulo: "Tempo médio de visualização (s)",
                      sufixo: "s",
                    },
                  ]
                    .filter((m) => typeof m.valor === "number")
                    .map((m) => (
                      <span
                        key={m.titulo}
                        title={m.titulo}
                        className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600"
                      >
                        <m.icone className="h-2.5 w-2.5" />
                        {(m.valor as number).toLocaleString("pt-BR")}
                        {"sufixo" in m ? (m as { sufixo?: string }).sufixo : null}
                      </span>
                    ))}
                  <button
                    type="button"
                    onClick={() => void recarregarStats()}
                    className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] text-slate-400 hover:text-[#F26B1F]"
                    title="Atualizar métricas"
                  >
                    <RefreshCw className={cn("h-2.5 w-2.5", statsCarregando && "animate-spin")} />
                  </button>
                  {stats?.insights_error && (
                    <span className="text-[10px] text-slate-400" title={stats.insights_error}>
                      insights indisponíveis para esta publicação
                    </span>
                  )}
                </>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            {thread?.media_permalink && (
              <a
                href={thread.media_permalink}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-0.5 text-[10px] text-slate-400 hover:text-[#F26B1F]"
              >
                <ExternalLink className="h-2.5 w-2.5" /> ver no Instagram
              </a>
            )}
            <button
              type="button"
              onClick={() => setPostAberto((v) => !v)}
              className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-slate-400 hover:text-[#F26B1F]"
            >
              {postAberto ? (
                <>
                  <ChevronUp className="h-2.5 w-2.5" /> recolher
                </>
              ) : (
                <>
                  <ChevronDown className="h-2.5 w-2.5" /> expandir
                </>
              )}
            </button>
          </div>
        </div>
        {thread && (
          <button
            type="button"
            onClick={() =>
              confirmThen(
                {
                  title: "Apagar histórico de comentários?",
                  description:
                    "Os comentários desta publicação serão removidos apenas aqui no painel. Nada é apagado no Instagram.",
                  confirmText: "Apagar histórico",
                  destructive: true,
                },
                async () => {
                  try {
                    await deleteThreadFn({ data: { media_id: thread.media_id } });
                    toast.success("Histórico apagado");
                    qc.invalidateQueries({ queryKey: ["ig", "comment-threads"] });
                    onBack();
                  } catch (e: unknown) {
                    toast.error(e instanceof Error ? e.message : "Erro ao apagar histórico");
                  }
                },
              )
            }
            className="mt-1 shrink-0 rounded-md p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
            aria-label="Apagar histórico"
            title="Apagar histórico"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
        <WallpaperMenu wallpaper={wallpaper} className="mt-1" />
      </header>


      {thread?.collab && (
        <div className="border-b border-[#F26B1F]/20 bg-[#F26B1F]/5 px-4 py-2 text-[11px] text-[#8a3d0d]">
          Publicação em colaboração: o Instagram só deixa o perfil que publicou responder
          publicamente. A IA já preparou uma sugestão de resposta para cada comentário.
        </div>
      )}




      <Dialog open={verMidia} onOpenChange={setVerMidia}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-sm">Publicação no Instagram</DialogTitle>
          </DialogHeader>
          {midiaCarregando ? (
            <div className="flex h-64 items-center justify-center text-xs text-slate-400">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Carregando publicação…
            </div>
          ) : midia?.media_url && (midia.media_type ?? "").toUpperCase().includes("VIDEO") ? (
            <video
              src={midia.media_url}
              poster={midia.thumbnail ?? thread?.media_thumbnail ?? undefined}
              controls
              autoPlay
              playsInline
              className="max-h-[70vh] w-full rounded-lg bg-black"
            />
          ) : midia?.media_url ? (
            <img src={midia.media_url} alt="Publicação" className="max-h-[70vh] w-full rounded-lg object-contain" />
          ) : thread?.media_thumbnail ? (
            <img src={thread.media_thumbnail} alt="Publicação" className="w-full rounded-lg" />
          ) : (
            <p className="text-xs text-slate-500">Publicação indisponível.</p>
          )}
          {thread?.media_permalink && (
            <a
              href={thread.media_permalink}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-[#F26B1F]"
            >
              <ExternalLink className="h-3 w-3" /> abrir no Instagram
            </a>
          )}
        </DialogContent>
      </Dialog>


      <div className="flex-1 space-y-2 overflow-y-auto p-4" style={wallpaper.style}>

        {isLoading ? (
          <div className="text-center text-xs text-slate-400">Carregando…</div>
        ) : comments.length === 0 ? (
          <div className="text-center text-xs text-slate-400">Nenhum comentário nesta publicação</div>
        ) : (
          comentariosEmThread.map(({ item: c, depth }) => {
            const meu = nossos.has((c.from_username ?? "").replace(/^@/, "").toLowerCase());
            const inicial = (c.from_username ?? "?").replace(/^@/, "").charAt(0).toUpperCase();
            const anexo = anexoDoComentario(c);
            const meta = (c as { metadata?: { hidden?: boolean; like_count?: number; liked?: boolean } | null }).metadata;
            const oculto = meta?.hidden === true;
            const curtidas = typeof meta?.like_count === "number" ? meta.like_count : 0;
            const curtido = meta?.liked === true;
            return (
              <div
                key={c.id}
                className={cn("flex items-end gap-2", meu ? "justify-end" : "justify-start")}
                style={depth > 0 ? (meu ? { paddingRight: 0, paddingLeft: 28 } : { paddingLeft: 28 }) : undefined}
              >
                {!meu &&
                  (c.from_profile_pic ? (
                    <img src={c.from_profile_pic} alt="" className="h-7 w-7 shrink-0 rounded-full object-cover" />
                  ) : (
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-pink-500 to-orange-500 text-[11px] font-semibold text-white">
                      {inicial}
                    </div>
                  ))}
                <div
                  className={cn(
                    "max-w-[75%] rounded-2xl px-3 py-2 text-sm shadow-sm",
                    meu ? bolhaContaPlana(c.from_username) : "bg-white text-slate-900",
                    depth > 0 &&
                      (meu
                        ? "border-r-2 border-white/40"
                        : contaAzul(thread?.account_username)
                          ? "border-l-2 border-[#56B8F0]/30"
                          : "border-l-2 border-[#F26B1F]/30"),
                  )}
                >
                  <div className={cn("text-[11px] font-semibold", meu ? "text-white" : contaAzul(thread?.account_username) ? "text-[#56B8F0]" : "text-[#F26B1F]")}>
                    @{c.from_username ?? "usuário"}
                  </div>
                  {c.text && (
                    <div className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{c.text}</div>
                  )}
                  {anexo && (
                    <a href={anexo} target="_blank" rel="noreferrer" className="mt-1 block">
                      <img
                        src={anexo}
                        alt="Imagem do comentário"
                        loading="lazy"
                        className="max-h-64 w-full rounded-lg object-cover"
                      />
                    </a>
                  )}
                  <div className={cn("mt-0.5 flex items-center gap-2 text-[10px]", meu ? "text-white/70" : "text-slate-400")}>
                    {new Date(c.created_at as string).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                    {c.auto_replied_at && !meu ? " · respondido" : ""}
                    {oculto ? " · oculto" : ""}
                    <span className="ml-auto inline-flex items-center gap-1">
                      <button
                        type="button"
                        disabled={toggleLike.isPending}
                        onClick={() => toggleLike.mutate({ id: c.id, like: !curtido })}
                        title={curtido ? "Descurtir comentário" : "Curtir comentário"}
                        aria-label={`${curtido ? "Descurtir" : "Curtir"} comentário${curtidas > 0 ? ` — ${curtidas} curtidas` : ""}`}
                        className={cn(
                          "inline-flex items-center gap-0.5 rounded px-1 transition-colors hover:text-rose-500 disabled:opacity-50",
                          curtido && "text-rose-500",
                        )}
                      >
                        <Heart className={cn("h-2.5 w-2.5", curtido && "fill-current")} />
                        {curtidas > 0 ? curtidas : ""}
                      </button>
                      {!meu && (
                        <button
                          onClick={() => setAlvo(c.id)}
                          className="inline-flex items-center gap-0.5 rounded px-1 hover:text-[#F26B1F]"
                        >
                          <MessageSquare className="h-2.5 w-2.5" /> responder
                        </button>
                      )}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button className="rounded px-0.5 hover:text-[#F26B1F]" aria-label="Ações do comentário">
                            <MoreVertical className="h-3 w-3" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-60">
                          <DropdownMenuLabel>Comentário</DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          {!meu && (
                            <DropdownMenuItem
                              onClick={() => hideComment.mutate({ id: c.id, hidden: !oculto })}
                            >
                              {oculto ? (
                                <><Eye className="mr-2 h-3.5 w-3.5" /> Reexibir na publicação</>
                              ) : (
                                <><EyeOff className="mr-2 h-3.5 w-3.5" /> Ocultar na publicação</>
                              )}
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() =>
                              confirmThen(
                                {
                                  title: "Apagar no Instagram?",
                                  description:
                                    "O comentário é removido da publicação no Instagram (reflete para todo mundo) e some daqui.",
                                  confirmText: "Apagar no Instagram",
                                  destructive: true,
                                },
                                () => delComment.mutate({ id: c.id, escopo: "instagram" }),
                              )
                            }
                          >
                            <Trash2 className="mr-2 h-3.5 w-3.5" /> Apagar no Instagram
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() =>
                              confirmThen(
                                {
                                  title: "Apagar só aqui?",
                                  description: "Some apenas do painel; no Instagram o comentário continua.",
                                  confirmText: "Apagar aqui",
                                  destructive: true,
                                },
                                () => delComment.mutate({ id: c.id, escopo: "local" }),
                              )
                            }
                          >
                            Apagar só do painel
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </span>
                  </div>

                </div>
              </div>
            );
          })
        )}

        <div ref={bottomRef} />
      </div>

      <div className="border-t border-slate-200 bg-white p-3">
        {alvoAtual ? (
          <div className="mb-1.5 flex items-center gap-1 text-[11px] text-slate-500">
            Respondendo <span className="font-medium text-slate-700">@{alvoAtual.from_username ?? "usuário"}</span>
            {alvo && (
              <button onClick={() => setAlvo(null)} className="ml-1 text-slate-400 hover:text-slate-700">
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        ) : (
          <div className="mb-1.5 text-[11px] text-slate-400">Nenhum comentário para responder</div>
        )}
        <div className="flex items-end gap-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void enviar();
              }
            }}
            rows={1}
            placeholder="Responder no comentário…"
            className="max-h-32 min-h-[38px] flex-1 resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-[#F26B1F]/50 focus:outline-none"
          />
          <button
            onClick={() => void enviar()}
            disabled={sending || !text.trim() || !alvoAtual}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#F26B1F] text-white disabled:opacity-40"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Etiqueta da conta do Instagram que recebeu a mensagem/comentário (@viaairs, @lucasfrancez…). */
function ReciboDirect({ deliveredAt, readAt }: { deliveredAt?: string | null; readAt?: string | null }) {
  const hora = (iso: string) =>
    new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const titulo = readAt
    ? `Lida às ${hora(readAt)}`
    : deliveredAt
      ? `Entregue às ${hora(deliveredAt)} · ainda não lida`
      : "Enviada · o Instagram ainda não confirmou a entrega";
  return (
    <span title={titulo} className="ml-1 inline-flex align-middle">
      {readAt ? (
        <CheckCheck className="inline h-3 w-3 text-sky-300" />
      ) : deliveredAt ? (
        <CheckCheck className="inline h-3 w-3 opacity-80" />
      ) : (
        <Check className="inline h-3 w-3 opacity-70" />
      )}
    </span>
  );
}

/** true quando a conta é o perfil pessoal do Lucas (identidade azul). */
function contaAzul(username?: string | null) {
  const u = String(username ?? "").replace(/^@/, "").toLowerCase();
  return u.includes("lucas");
}

/** Balão da DM: gradiente da conta (laranja VIA AIR ou azul-petróleo). */
function bolhaConta(username?: string | null) {
  return contaAzul(username)
    ? "bg-gradient-to-br from-[#7FD0F7] via-[#56B8F0] to-[#1B6FA8] text-white"
    : "bg-gradient-to-br from-[#F9963F] via-[#F26B1F] to-[#C9450E] text-white";
}

/** Balão dos comentários: cor chapada da conta, sem gradiente. */
function bolhaContaPlana(username?: string | null) {
  return contaAzul(username) ? "bg-[#56B8F0] text-white" : "bg-[#F26B1F] text-white";
}

function ContaTag({ username, className }: { username?: string | null; className?: string }) {
  if (!username) return null;
  const azul = contaAzul(username);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-1.5 py-[1px] text-[9px] font-semibold uppercase tracking-wide",
        azul
          ? "bg-gradient-to-r from-[#7FD0F7]/15 to-[#1B6FA8]/15 text-[#56B8F0]"
          : "bg-gradient-to-r from-[#F9963F]/15 to-[#C9450E]/15 text-[#C9450E]",
        className,
      )}
    >
      <Instagram className="h-2.5 w-2.5" />@{String(username).replace(/^@/, "")}
    </span>
  );
}

/** Menu de 3 pontinhos das DMs (marcar não lida / apagar do chatbot). */
function DmRowMenu({ conversationId, naoLidas }: { conversationId: string; naoLidas: number }) {
  const qc = useQueryClient();
  const unreadFn = useServerFn(markInstagramConversationUnread);
  const readFn = useServerFn(markInstagramConversationRead);
  const delFn = useServerFn(deleteInstagramConversation);
  const recarregar = () => qc.invalidateQueries({ queryKey: ["ig", "conversations"] });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); e.preventDefault(); }}
          className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          aria-label="Opções da conversa"
        >
          <MoreVertical className="h-3.5 w-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52" onClick={(e) => e.stopPropagation()}>
        {naoLidas > 0 ? (
          <DropdownMenuItem
            onClick={() => readFn({ data: { conversation_id: conversationId } }).then(recarregar).catch((e: Error) => toast.error(e.message))}
          >
            <Check className="mr-2 h-3.5 w-3.5" /> Marcar como lida
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem
            onClick={() =>
              unreadFn({ data: { conversation_id: conversationId } })
                .then(() => { recarregar(); toast.success("Marcada como não lida"); })
                .catch((e: Error) => toast.error(e.message))
            }
          >
            <InboxIcon className="mr-2 h-3.5 w-3.5" /> Marcar como não lida
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-red-600 focus:text-red-600"
          onClick={() =>
            confirmThen(
              {
                title: "Apagar do chatbot?",
                description: "Some com o histórico desta conversa no nosso inbox. As mensagens continuam no Instagram.",
                confirmText: "Apagar",
                destructive: true,
              },
              () =>
                delFn({ data: { conversation_id: conversationId } })
                  .then(() => { recarregar(); toast.success("Conversa apagada"); })
                  .catch((e: Error) => toast.error(e.message)),
            )
          }
        >
          <Trash2 className="mr-2 h-3.5 w-3.5" /> Apagar do chatbot
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Linha de DM do Instagram usada na aba unificada "Todas". */
function IgConvRow({ conv, active, onClick }: { conv: any; active: boolean; onClick: () => void }) {
  const nome = conv.contact_name ?? (conv.contact_username ? `@${conv.contact_username}` : "Instagram");
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onClick(); }}
      className={cn(
        "flex w-full cursor-pointer items-start gap-2 rounded-lg p-2 text-left transition-colors",
        active ? "bg-pink-50" : "hover:bg-slate-50",
      )}
    >
      {conv.contact_profile_pic ? (
        <img src={conv.contact_profile_pic} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
      ) : (
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-pink-500 to-orange-500 text-sm font-semibold text-white">
          {String(nome).replace(/^@/, "").charAt(0).toUpperCase()}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-1">
          <span className="truncate text-sm font-medium text-slate-900">{nome}</span>
          <div className="flex shrink-0 items-center gap-1">
            {(conv.unread_count ?? 0) > 0 && (
              <span className="rounded-full bg-[#F26B1F] px-1.5 text-[10px] font-medium text-white">{conv.unread_count}</span>
            )}
            <DmRowMenu conversationId={conv.id} naoLidas={conv.unread_count ?? 0} />
          </div>
        </div>
        <div className="flex items-center gap-1 text-[10px] text-slate-500">
          <Instagram className="h-2.5 w-2.5" />
          {conv.contact_username ? `@${conv.contact_username}` : "Direct"}
        </div>
        <div className="truncate text-xs text-slate-500">{conv.last_message_preview ?? "—"}</div>
        <ContaTag username={conv.account_username} className="mt-0.5" />
      </div>
    </div>

  );
}

/** Linha de publicação (comentários) usada na aba unificada "Todas". */
/** Menu de 3 pontinhos das publicações (marcar não lida / apagar do chatbot). */
function ThreadRowMenu({ mediaId, pendentes }: { mediaId: string; pendentes: number }) {
  const qc = useQueryClient();
  const unreadFn = useServerFn(markInstagramCommentThreadUnread);
  const readFn = useServerFn(markInstagramCommentThreadRead);
  const delFn = useServerFn(deleteInstagramCommentThread);
  const recarregar = () => qc.invalidateQueries({ queryKey: ["ig", "comment-threads"] });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          aria-label="Opções da publicação"
        >
          <MoreVertical className="h-3.5 w-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52" onClick={(e) => e.stopPropagation()}>
        {pendentes > 0 ? (
          <DropdownMenuItem
            onClick={() => readFn({ data: { media_id: mediaId } }).then(recarregar).catch((e: Error) => toast.error(e.message))}
          >
            <Check className="mr-2 h-3.5 w-3.5" /> Marcar como lida
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem
            onClick={() =>
              unreadFn({ data: { media_id: mediaId } })
                .then(() => { recarregar(); toast.success("Marcada como não lida"); })
                .catch((e: Error) => toast.error(e.message))
            }
          >
            <InboxIcon className="mr-2 h-3.5 w-3.5" /> Marcar como não lida
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-red-600 focus:text-red-600"
          onClick={() =>
            confirmThen(
              {
                title: "Apagar do chatbot?",
                description: "Some o histórico desta publicação do nosso inbox. Os comentários continuam no Instagram.",
                confirmText: "Apagar",
                destructive: true,
              },
              () =>
                delFn({ data: { media_id: mediaId } })
                  .then(() => { recarregar(); toast.success("Histórico apagado"); })
                  .catch((e: Error) => toast.error(e.message)),
            )
          }
        >
          <Trash2 className="mr-2 h-3.5 w-3.5" /> Apagar do chatbot
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function IgThreadRow({ thread, active, onClick }: { thread: any; active: boolean; onClick: () => void }) {
  const ultimo = thread.comments?.[thread.comments.length - 1];
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onClick(); }}
      className={cn(
        "flex w-full cursor-pointer items-start gap-2 rounded-lg p-2 text-left transition-colors",
        active ? "bg-orange-50" : "hover:bg-slate-50",
      )}
    >
      {thread.media_thumbnail ? (
        <img src={thread.media_thumbnail} alt="Publicação" className="h-9 w-9 shrink-0 rounded-md object-cover" />
      ) : (
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-purple-500 via-pink-500 to-orange-500 text-white">
          <Heart className="h-4 w-4" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-1">
          <span className="truncate text-sm font-medium text-slate-900">
            {thread.media_caption?.slice(0, 40) || "Publicação"}
          </span>
          <div className="flex shrink-0 items-center gap-1">
            {(thread.pendentes ?? 0) > 0 && (
              <span className="rounded-full bg-[#F26B1F] px-1.5 text-[10px] font-medium text-white">{thread.pendentes}</span>
            )}
            <ThreadRowMenu mediaId={thread.media_id} pendentes={thread.pendentes ?? 0} />
          </div>
        </div>
        <div className="flex items-center gap-1 text-[10px] text-slate-500">
          <Heart className="h-2.5 w-2.5" />
          Comentários
        </div>
        <div className="truncate text-xs text-slate-500">
          {ultimo ? `@${ultimo.from_username ?? "?"}: ${ultimo.text ?? ""}` : "—"}
        </div>
        <ContaTag username={thread.account_username} className="mt-0.5" />
      </div>
    </div>
  );
}
