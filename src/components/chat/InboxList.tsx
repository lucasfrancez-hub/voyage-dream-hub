import { cn } from "@/lib/utils";
import { MessageCircle, Plus, Search, Users, Inbox, Archive, Bot } from "lucide-react";

export interface ChatThread {
  id: string;
  name: string;
  lastMessage: string;
  timeAgo: string;
  unread?: number;
  status?: "ia" | "human" | "waiting" | "archived";
}

const FOLDERS = [
  { key: "mine", label: "Minha caixa", icon: Inbox, count: 0 },
  { key: "assigned", label: "Atribuídas", icon: Users, count: 0 },
  { key: "unassigned", label: "Não atribuído", icon: MessageCircle, count: 0 },
  { key: "ai", label: "Atendidas por IA", icon: Bot, count: 1 },
  { key: "archived", label: "Arquivados", icon: Archive, count: 0 },
];

interface InboxListProps {
  threads: ChatThread[];
  activeThreadId: string;
  onSelectThread: (id: string) => void;
  onNewThread: () => void;
  activeFolder: string;
  onSelectFolder: (folder: string) => void;
}

export function InboxList({
  threads,
  activeThreadId,
  onSelectThread,
  onNewThread,
  activeFolder,
  onSelectFolder,
}: InboxListProps) {
  return (
    <aside className="flex h-full w-72 shrink-0 flex-col border-r border-border/40 bg-background/40">
      {/* Header */}
      <div className="border-b border-border/40 p-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">Conversas</h2>
          <button
            onClick={onNewThread}
            className="rounded-full bg-brand-orange p-1.5 text-primary-foreground transition-colors hover:bg-brand-orange-light"
            title="Nova conversa de teste"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="relative mt-3">
          <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Buscar…"
            className="w-full rounded-md border border-border/50 bg-background/50 py-1.5 pl-7 pr-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-brand-orange/60 focus:outline-none"
          />
        </div>
      </div>

      {/* Folders */}
      <div className="border-b border-border/40 py-2">
        {FOLDERS.map((f) => (
          <button
            key={f.key}
            onClick={() => onSelectFolder(f.key)}
            className={cn(
              "flex w-full items-center gap-2 px-3 py-1.5 text-xs transition-colors",
              activeFolder === f.key
                ? "bg-brand-orange/10 text-brand-orange"
                : "text-muted-foreground hover:bg-muted/30 hover:text-foreground",
            )}
          >
            <f.icon className="h-3.5 w-3.5" />
            <span className="flex-1 text-left">{f.label}</span>
            {f.count > 0 && (
              <span className="rounded-full bg-brand-orange/20 px-1.5 text-[10px] text-brand-orange">
                {f.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Threads */}
      <div className="flex-1 overflow-y-auto">
        {threads.length === 0 && (
          <div className="p-4 text-center text-xs text-muted-foreground">
            Nenhuma conversa ainda
          </div>
        )}
        {threads.map((t) => (
          <button
            key={t.id}
            onClick={() => onSelectThread(t.id)}
            className={cn(
              "flex w-full items-start gap-3 border-b border-border/20 px-3 py-3 text-left transition-colors",
              activeThreadId === t.id
                ? "bg-brand-orange/10"
                : "hover:bg-muted/20",
            )}
          >
            <div className="relative h-9 w-9 shrink-0 rounded-full bg-gradient-to-br from-brand-orange/40 to-brand-orange/10 ring-1 ring-brand-orange/30" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-medium text-foreground">
                  {t.name}
                </span>
                <span className="shrink-0 text-[10px] text-muted-foreground">
                  {t.timeAgo}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-xs text-muted-foreground">
                  {t.lastMessage}
                </span>
                {t.status === "ia" && (
                  <Bot className="h-3 w-3 shrink-0 text-emerald-400" />
                )}
                {t.unread && (
                  <span className="ml-1 rounded-full bg-brand-orange px-1.5 text-[10px] font-medium text-primary-foreground">
                    {t.unread}
                  </span>
                )}
              </div>
            </div>
          </button>
        ))}
      </div>
    </aside>
  );
}
