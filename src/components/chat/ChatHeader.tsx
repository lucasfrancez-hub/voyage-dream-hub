import { Search, Bell, Sun, Moon, Menu } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listOnlineAgents } from "@/lib/chat/online-agents.functions";
import { AiStatusButton } from "@/components/chat/AiStatusButton";




interface ChatHeaderProps {
  title: string;
  subtitle?: string;
  userEmail?: string | null;
  userFullName?: string | null;
  theme?: "dark" | "light";
  onToggleTheme?: () => void;
  onOpenMobileNav?: () => void;
}

export function ChatHeader({ title, subtitle, userEmail, userFullName, theme = "dark", onToggleTheme, onOpenMobileNav }: ChatHeaderProps) {
  const fetchOnline = useServerFn(listOnlineAgents);
  const { data: agentsData } = useQuery({
    queryKey: ["chat-online-agents"],
    queryFn: () => fetchOnline({}),
    refetchInterval: 60_000, // revalida de minuto em minuto
    staleTime: 30_000,
  });
  const agents: string[] = (agentsData ?? []).map((a: { nome: string }) => a.nome);
  const displayName = (userFullName?.trim())
    || (userEmail ? userEmail.split("@")[0]!.replace(/[._-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : null);
  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-slate-200 bg-white px-3 sm:gap-4 sm:px-5">
      {onOpenMobileNav && (
        <button
          onClick={onOpenMobileNav}
          className="shrink-0 rounded-md p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900 md:hidden"
          aria-label="Abrir menu"
        >
          <Menu className="h-5 w-5" />
        </button>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 sm:gap-3">
          <h1 className="truncate text-base font-semibold text-slate-900">{title}</h1>
          {subtitle && <span className="hidden sm:inline truncate text-xs text-slate-500">{subtitle}</span>}
        </div>
      </div>

      <div className="hidden md:flex relative w-56 lg:w-72">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          placeholder="Buscar contatos, conversas…"
          className="w-full rounded-md border border-slate-200 bg-slate-50 py-1.5 pl-8 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#F26B1F]/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#F26B1F]/10"
        />
      </div>

      {/* Lista dos atendentes online (um chip por pessoa) */}
      <div className="hidden sm:flex items-center gap-1.5" title="Atendentes online agora">
        {agents.map((nome) => (
          <span
            key={nome}
            className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1"
          >
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            <span className="text-xs font-medium text-slate-700">{nome}</span>
          </span>
        ))}
      </div>

      {/* Mobile: um único chip com contagem + iniciais */}
      <div className="sm:hidden flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2 py-1" title={`Online: ${agents.join(", ")}`}>
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
        </span>
        <span className="text-[11px] font-medium text-slate-700">
          {agents.length === 1 ? agents[0] : `${agents.length} online`}
        </span>
      </div>


      <AiStatusButton />

      <button
        className="hidden sm:inline-flex rounded-md p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
        title="Notificações"
      >
        <Bell className="h-4 w-4" />
      </button>

      {onToggleTheme && (
        <button
          onClick={onToggleTheme}
          className="inline-flex shrink-0 rounded-md p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
          title={theme === "dark" ? "Mudar para tema claro" : "Mudar para tema escuro"}
          aria-label="Alternar tema"
        >
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
      )}

      <a
        href="/admin"
        target="_blank"
        rel="noopener noreferrer"
        className="hidden sm:inline-flex items-center gap-1.5 rounded-full bg-[#F26B1F] px-3 py-1 text-xs font-medium text-white shadow-sm hover:opacity-90"
      >
        Admin
      </a>

      {(displayName || userEmail) && (
        <div className="hidden lg:flex flex-col items-end border-l border-slate-200 pl-4 leading-tight">
          {displayName && <span className="text-xs font-semibold text-slate-800">{displayName}</span>}
          {userEmail && <span className="text-[11px] text-slate-500">{userEmail}</span>}
        </div>
      )}
    </header>
  );
}
