import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { Search, Send, Bot, User, MoreVertical, Loader2, Inbox as InboxIcon, Users, Archive, Plus, ChevronDown, Image as ImageIcon, XCircle, History, Paperclip, PanelLeftClose, PanelLeftOpen, FileText, X, Save, ExternalLink, ArrowLeft, Info } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { listConversations, listMessages, sendHumanReply, sendHumanMedia, toggleConversationMode, startOutboundConversation, setFunnelStage, assignConversation, listAttendants, getActiveProtocolo, closeProtocoloManually, listConversationProtocolos, getConversationOrders, updateProtocoloDetails, listProtocoloMessages, ensureProtocoloResumo } from "@/lib/chat/queries.functions";
import { firstName } from "@/lib/whatsapp/text-utils.shared";

import { FUNNEL_STAGES } from "@/lib/chat/funnel-stages";
import { WhatsAppBubble, DateDivider } from "@/components/chat/WhatsAppBubble";
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

  const filtered = useMemo(() => {
    return conversations.filter((c) => {
      if (folder === "ai" && c.mode !== "ai") return false;
      if (folder === "human" && c.mode !== "human" && !(c.tags ?? []).includes("aguardando_humano")) return false;
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
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches) return;
    if (!activeId && filtered.length > 0) setActiveId(filtered[0].id);
  }, [filtered, activeId]);


  const active = filtered.find((c) => c.id === activeId) ?? conversations.find((c) => c.id === activeId) ?? null;

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
          active ? "hidden md:flex" : "flex w-full",
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
          <div className="flex-1 space-y-1 overflow-y-auto p-2">
            {filtered.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400">Nenhuma conversa</div>
            ) : (
              filtered.map((c) => <ConvItem key={c.id} conv={c} active={activeId === c.id} onClick={() => setActiveId(c.id)} />)
            )}
          </div>
        </aside>
      )}

      {/* Coluna 2 — Conversa */}
      <main className={cn(
        "min-w-0 flex-1 flex-col bg-[var(--chat-conversation)]",
        // Mobile: só mostra se tiver conversa ativa
        active ? "flex" : "hidden md:flex",
      )}>
        {active ? <ConversationView conv={active} onRefetch={refetch} onBack={() => setActiveId(null)} /> : <EmptyState />}
      </main>

      {/* Coluna 3 — Detalhes */}
      <aside className="hidden w-72 shrink-0 border-l border-slate-200 bg-white lg:block">
        {active ? <ContactDetails conv={active} onChange={refetch} /> : null}
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


function ConvItem({ conv, active, onClick }: { conv: Conv; active: boolean; onClick: () => void }) {
  const time = conv.last_message_at
    ? new Date(conv.last_message_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
    : "";
  const initials = (conv.display_name ?? conv.wa_phone).slice(0, 2).toUpperCase();
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
        {conv.mode === "human" && !conv.assigned_to && (
          <div className="mt-0.5 mb-1 inline-flex items-center gap-1 rounded-full bg-orange-100 px-1.5 py-0.5 text-[10px] font-semibold text-[#F26B1F]">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#F26B1F]" />
            Atendimento necessário
          </div>
        )}
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-xs text-slate-500">{conv.last_message_preview ?? "—"}</span>
          <div className="flex shrink-0 items-center gap-1">
            {conv.mode === "ai" && <Bot className="h-3 w-3 text-emerald-500" />}
            {conv.mode === "human" && <User className="h-3 w-3 text-[#F26B1F]" />}
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

function useWallpaper() {
  const [key, setKey] = useState<string>("dots");
  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = localStorage.getItem("chat-wallpaper-v3");
    if (saved) setKey(saved);
  }, []);
  const set = (k: string) => {
    setKey(k);
    if (typeof window !== "undefined") localStorage.setItem("chat-wallpaper-v3", k);
  };
  const cur = WALLPAPERS.find((w) => w.key === key) ?? WALLPAPERS[0];
  const style: React.CSSProperties = {
    backgroundImage: cur.css,
    backgroundColor: "var(--chat-conversation)",
  };
  if (cur.size) style.backgroundSize = cur.size;
  return { key, set, style };
}

function ConversationView({ conv, onRefetch, onBack }: { conv: Conv; onRefetch: () => void; onBack?: () => void }) {
  const qc = useQueryClient();
  const listMsgs = useServerFn(listMessages);
  const sendFn = useServerFn(sendHumanReply);
  const toggleFn = useServerFn(toggleConversationMode);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [input, setInput] = useState("");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const wallpaper = useWallpaper();
  const sendMediaFn = useServerFn(sendHumanMedia);
  const fileRef = useRef<HTMLInputElement>(null);
  const [pendingFile, setPendingFile] = useState<{ file: File; previewUrl: string | null; kind: "image" | "document" } | null>(null);
  const mediaMut = useMutation({
    mutationFn: async ({ file, caption, kind }: { file: File; caption: string; kind: "image" | "document" }) => {
      const buf = new Uint8Array(await file.arrayBuffer());
      let binary = "";
      for (let i = 0; i < buf.length; i++) binary += String.fromCharCode(buf[i]);
      const b64 = btoa(binary);
      return sendMediaFn({ data: {
        conversation_id: conv.id,
        kind,
        filename: file.name,
        mime_type: file.type || (kind === "image" ? "image/jpeg" : "application/octet-stream"),
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
  const submit = () => {
    if (pendingFile) {
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
            {assignedName && (
              <> · <span className="font-medium text-slate-700">{assignedName}</span></>
            )}
          </div>

        </div>
        <button
          onClick={() => toggleMut.mutate(conv.mode === "ai" ? "human" : "ai")}
          className="shrink-0 rounded-md border border-slate-200 px-2 py-1.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50 sm:px-3 sm:text-xs"
        >
          {conv.mode === "ai" ? "Assumir" : "Devolver p/ IA"}
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              title="Alterar plano de fundo"
              className="hidden rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground md:inline-flex"
            >
              <ImageIcon className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuLabel>Plano de fundo</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {WALLPAPERS.map((w) => (
              <DropdownMenuItem key={w.key} onClick={() => wallpaper.set(w.key)}>
                {w.label} {wallpaper.key === w.key && "✓"}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
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
          ⚠️ Última mensagem do cliente há mais de 24h — janela do WhatsApp encerrada. Use um template aprovado.
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
                          ? (firstName(m.sender_full_name) ?? "Atendente")
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
          <button
            onClick={submit}
            disabled={(!input.trim() && !pendingFile) || sendMut.isPending || mediaMut.isPending}
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

  const { data: attendants = [] } = useQuery({
    queryKey: ["chat", "attendants"],
    queryFn: () => listUsers(),
    staleTime: 60_000,
  });

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
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ContactDetails({ conv, onChange }: { conv: Conv; onChange: () => void }) {
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
