import { Link } from "@tanstack/react-router";
import { Search, Bell, ArrowLeft } from "lucide-react";
import { useMemo } from "react";

function currentAgent(): { nome: string; online: boolean } {
  const fmt = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    hour12: false,
  });
  const h = Number(fmt.format(new Date()));
  if (h >= 8 && h < 18) return { nome: "Camila", online: true };
  return { nome: "Roberto", online: true };
}

interface ChatHeaderProps {
  title: string;
  subtitle?: string;
  userEmail?: string | null;
}

export function ChatHeader({ title, subtitle, userEmail }: ChatHeaderProps) {
  const agent = useMemo(currentAgent, []);
  return (
    <header className="flex h-14 shrink-0 items-center gap-4 border-b border-slate-200 bg-white px-5">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-3">
          <h1 className="truncate text-base font-semibold text-slate-900">{title}</h1>
          {subtitle && <span className="truncate text-xs text-slate-500">{subtitle}</span>}
        </div>
      </div>

      <div className="hidden md:flex relative w-72">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          placeholder="Buscar contatos, conversas…"
          className="w-full rounded-md border border-slate-200 bg-slate-50 py-1.5 pl-8 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#F26B1F]/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#F26B1F]/10"
        />
      </div>

      <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
        </span>
        <span className="text-xs font-medium text-slate-700">{agent.nome} atendendo</span>
      </div>

      <button className="rounded-md p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900">
        <Bell className="h-4 w-4" />
      </button>

      <Link
        to="/admin"
        className="hidden sm:flex items-center gap-1.5 text-xs text-slate-500 hover:text-[#F26B1F]"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Admin
      </Link>

      {userEmail && (
        <div className="hidden lg:block text-xs text-slate-500 border-l border-slate-200 pl-4">
          {userEmail}
        </div>
      )}
    </header>
  );
}
