import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  MessageSquare,
  Users,
  Bot,
  Workflow,
  Megaphone,
  Kanban,
  Calendar,
  Folder,
  Settings,
  FileText,
  PanelLeftClose,
  PanelLeft,
  X,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import viaAirMark from "@/assets/viaair-mark.png.asset.json";
import viaAirLogo from "@/assets/viaair-logo.png.asset.json";

const ITEMS = [
  { to: "/chat/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/chat/inbox", label: "Caixa de Entrada", icon: MessageSquare },
  { to: "/chat/protocolos", label: "Protocolos", icon: FileText },
  { to: "/chat/contatos", label: "Contatos", icon: Users },
  { to: "/chat/agentes", label: "Agente IA", icon: Bot },
  { to: "/chat/fluxos", label: "Fluxos", icon: Workflow },
  { to: "/chat/broadcast", label: "Broadcast", icon: Megaphone },
  { to: "/chat/crm", label: "Funil de Venda", icon: Kanban },
  { to: "/chat/agenda", label: "Agenda", icon: Calendar },
  { to: "/chat/pastas", label: "Pastas", icon: Folder },
  { to: "/chat/config", label: "Configurações", icon: Settings },
] as const;

export function ChatSidebar({ mobileOpen = false, onCloseMobile }: { mobileOpen?: boolean; onCloseMobile?: () => void } = {}) {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <>
      {/* Backdrop mobile */}
      {mobileOpen && (
        <button
          aria-label="Fechar menu"
          onClick={onCloseMobile}
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
        />
      )}

      <aside
        className={cn(
          "flex h-full shrink-0 flex-col border-r border-slate-200 bg-white transition-[width,transform] duration-200",
          // Desktop
          "hidden md:flex",
          collapsed ? "md:w-16" : "md:w-60",
          // Mobile drawer
          mobileOpen && "!flex fixed inset-y-0 left-0 z-50 w-64 md:relative md:z-auto",
        )}
      >
        <div className="flex h-14 items-center justify-center gap-2 border-b border-slate-200 px-3">
          {collapsed ? (
            <img src={viaAirMark.url} alt="VIA AIR" className="h-7 w-7 shrink-0" />
          ) : (
            <img src={viaAirLogo.url} alt="VIA AIR" className="h-8 w-auto max-w-full object-contain" />
          )}
          {onCloseMobile && (
            <button
              onClick={onCloseMobile}
              className="ml-auto rounded-md p-1 text-slate-500 hover:bg-slate-100 md:hidden"
              aria-label="Fechar"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <nav className="flex-1 overflow-y-auto p-2">
          {ITEMS.map((item) => {
            const active = pathname.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                onClick={onCloseMobile}
                className={cn(
                  "mb-0.5 flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-orange-50 text-[#F26B1F] font-medium"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
                )}
                title={collapsed ? item.label : undefined}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                {(!collapsed || mobileOpen) && <span className="truncate">{item.label}</span>}
                {active && (!collapsed || mobileOpen) && (
                  <span className="ml-auto h-1.5 w-1.5 rounded-full bg-[#F26B1F]" />
                )}
              </Link>
            );
          })}
        </nav>

        <button
          onClick={() => setCollapsed((c) => !c)}
          className="hidden md:flex h-10 items-center justify-center gap-2 border-t border-slate-200 text-xs text-slate-500 hover:bg-slate-50 hover:text-slate-900"
        >
          {collapsed ? <PanelLeft className="h-4 w-4" /> : (
            <>
              <PanelLeftClose className="h-4 w-4" /> Recolher
            </>
          )}
        </button>
      </aside>
    </>
  );
}
