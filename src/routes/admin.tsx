import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { Loader2, LogOut, Package, ClipboardList, Home, Link2, ShieldCheck, Users, ChevronDown, LayoutDashboard, Contact, Puzzle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import viaAirLogo from "@/assets/viaair-logo.png.asset.json";

export const Route = createFileRoute("/admin")({
  component: AdminLayout,
  head: () => ({
    meta: [{ title: "Admin - Via Air" }],
  }),
});

type Role = "admin" | "partner" | null;

function AdminLayout() {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [role, setRole] = useState<Role | undefined>(undefined);
  const isAdmin = role === "admin";
  const isPartner = role === "partner";

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    supabase.auth
      .getSession()
      .then(async ({ data, error }) => {
        if (error || !data.session) {
          // Refresh token inválido/expirado — limpa storage pra não travar em loop.
          try { await supabase.auth.signOut(); } catch { /* noop */ }
          setSession(null);
          return;
        }
        setSession(data.session);
      })
      .catch(async () => {
        try { await supabase.auth.signOut(); } catch { /* noop */ }
        setSession(null);
      });
    return () => sub.subscription.unsubscribe();
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
        setRole(null);
        return;
      }
      const roles = (data ?? []).map((r) => r.role);
      if (roles.includes("admin")) setRole("admin");
      else if (roles.includes("partner")) setRole("partner");
      else setRole(null);
    })();
  }, [session, navigate]);

  // Redirect /admin -> destino padrão por role
  useEffect(() => {
    if (pathname !== "/admin") return;
    if (isAdmin) navigate({ to: "/admin/pacotes" });
    else if (isPartner) navigate({ to: "/admin/pedidos" });
  }, [pathname, isAdmin, isPartner, navigate]);


  // Auto-logout por inatividade (30 min sem interação do usuário)
  useEffect(() => {
    if (!session || !(isAdmin || isPartner)) return;
    const TIMEOUT_MS = 30 * 60 * 1000;
    let timer: ReturnType<typeof setTimeout>;
    const doLogout = async () => {
      await supabase.auth.signOut();
      toast.info("Sessão encerrada por inatividade (30 min).");
      navigate({ to: "/auth" });
    };
    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(doLogout, TIMEOUT_MS);
    };
    const events = [
      "mousemove", "mousedown", "keydown", "scroll", "touchstart", "click",
    ] as const;
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    reset();
    return () => {
      clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [session, isAdmin, isPartner, navigate]);


  if (session === undefined || (session && role === undefined)) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }


  if (!isAdmin && !isPartner) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-center">
        <div>
          <h1 className="text-2xl font-semibold">Sem permissão</h1>
          <p className="mt-2 text-muted-foreground text-sm">
            Sua conta não tem acesso ao painel administrativo.
          </p>
          <button
            className="mt-4 text-brand-orange hover:underline"
            onClick={async () => {
              await supabase.auth.signOut();
              navigate({ to: "/auth" });
            }}
          >
            Sair e entrar com outra conta
          </button>
        </div>
      </div>
    );
  }

  // Rotas permitidas para partner: pedidos + pagamentos (link/cofre)
  const partnerAllowed = (p: string) =>
    p.startsWith("/admin/pedidos") ||
    p.startsWith("/admin/link-pagamento") ||
    p.startsWith("/admin/link-cartao-simples") ||
    p.startsWith("/admin/link-boleto") ||
    p.startsWith("/admin/cofre");
  if (isPartner && !partnerAllowed(pathname)) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-center">
        <div>
          <h1 className="text-2xl font-semibold">Área restrita</h1>
          <p className="mt-2 text-muted-foreground text-sm">
            Sua conta de parceiro só tem acesso a pedidos e links de pagamento.
          </p>
          <button
            className="mt-4 text-brand-orange hover:underline"
            onClick={() => navigate({ to: "/admin/pedidos" })}
          >
            Ir para Meus pedidos
          </button>
        </div>
      </div>
    );
  }


  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-background/80 backdrop-blur sticky top-0 z-40" style={{ paddingTop: "env(safe-area-inset-top)" }}>
        <div className="mx-auto max-w-7xl px-3 sm:px-6 h-14 sm:h-16 flex items-center justify-between gap-2 sm:gap-4">
          <div className="flex items-center gap-3 sm:gap-6 min-w-0">
            <Link to="/" className="flex items-center gap-3 shrink-0">
              <img src={viaAirLogo.url} alt="Via Air" className="h-7 sm:h-8 w-auto" />
            </Link>
            <nav className="hidden md:flex items-center gap-1">
              {isAdmin && <NavItem to="/admin/pacotes" icon={Package} label="Pacotes" active={pathname.startsWith("/admin/pacotes")} />}
              {isAdmin && <DashboardNav pathname={pathname} />}
              {isAdmin
                ? <PedidosNav pathname={pathname} />
                : <NavItem to="/admin/pedidos" icon={ClipboardList} label="Meus pedidos" active={pathname.startsWith("/admin/pedidos")} />}
              <CartaoNav pathname={pathname} />
              {isAdmin && <SegurancaNav pathname={pathname} showUsuarios={session?.user?.email?.toLowerCase() === "lucas@voeair.com"} />}
            </nav>

          </div>
          <div className="flex items-center gap-2">
            <a
              href="https://viaair.tur.br"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-brand-orange"
            >
              <Home className="h-4 w-4" /> Ver site
            </a>
            <button
              onClick={async () => {
                await supabase.auth.signOut();
                navigate({ to: "/auth" });
              }}
              className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-1.5 text-xs hover:border-brand-orange"
            >
              <LogOut className="h-3.5 w-3.5" /> Sair
            </button>
          </div>
        </div>
        <nav className="md:hidden border-t border-border overflow-x-auto">
          <div className="mx-auto max-w-7xl px-3 sm:px-6 py-2 flex items-center gap-1 whitespace-nowrap">
            {isAdmin && <NavItem to="/admin/pacotes" icon={Package} label="Pacotes" active={pathname.startsWith("/admin/pacotes")} />}
            {isAdmin && <DashboardNav pathname={pathname} />}
            {isAdmin
              ? <PedidosNav pathname={pathname} />
              : <NavItem to="/admin/pedidos" icon={ClipboardList} label="Meus pedidos" active={pathname.startsWith("/admin/pedidos")} />}
            <CartaoNav pathname={pathname} />
            {isAdmin && <SegurancaNav pathname={pathname} showUsuarios={session?.user?.email?.toLowerCase() === "lucas@voeair.com"} />}
          </div>
        </nav>

      </header>

      <Outlet />
    </div>
  );
}

function NavItem({
  to,
  icon: Icon,
  label,
  active,
}: {
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      to={to}
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm transition ${
        active ? "bg-brand-orange/10 text-brand-orange" : "text-muted-foreground hover:text-foreground"
      }`}
    >
      <Icon className="h-4 w-4" /> {label}
    </Link>
  );
}

function CartaoNav({ pathname }: { pathname: string }) {
  const active =
    pathname === "/admin/link-pagamento" ||
    pathname.startsWith("/admin/link-pagamento/") ||
    pathname.startsWith("/admin/link-cartao-simples") ||
    pathname.startsWith("/admin/link-boleto") ||
    pathname.startsWith("/admin/cofre");
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm transition outline-none ${
          active ? "bg-brand-orange/10 text-brand-orange" : "text-muted-foreground hover:text-foreground"
        }`}
      >
        <Link2 className="h-4 w-4" /> Pagamentos <ChevronDown className="h-3.5 w-3.5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuItem asChild>
          <Link to="/admin/link-pagamento" className="flex flex-col items-start gap-0.5">
            <span className="text-sm font-medium">Link seguro</span>
            <span className="text-xs text-muted-foreground">Com assinatura e biometria</span>
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/admin/link-cartao-simples" className="flex flex-col items-start gap-0.5">
            <span className="text-sm font-medium">Link convencional</span>
            <span className="text-xs text-muted-foreground">Só dados do cartão</span>
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/admin/link-boleto" className="flex flex-col items-start gap-0.5">
            <span className="text-sm font-medium">Link boleto bancário</span>
            <span className="text-xs text-muted-foreground">Gerar link de boleto</span>
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/admin/cofre" className="flex flex-col items-start gap-0.5">
            <span className="text-sm font-medium">Cofre</span>
            <span className="text-xs text-muted-foreground">Cartões salvos com segurança</span>
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function DashboardNav({ pathname }: { pathname: string }) {
  const active =
    pathname.startsWith("/admin/dashboard") ||
    pathname.startsWith("/admin/pessoas");
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm transition outline-none ${
          active ? "bg-brand-orange/10 text-brand-orange" : "text-muted-foreground hover:text-foreground"
        }`}
      >
        <LayoutDashboard className="h-4 w-4" /> Dashboard <ChevronDown className="h-3.5 w-3.5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuItem asChild>
          <Link to="/admin/dashboard" className="flex flex-col items-start gap-0.5">
            <span className="text-sm font-medium">Dashboard</span>
            <span className="text-xs text-muted-foreground">Visão geral e métricas</span>
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/admin/pessoas" className="flex flex-col items-start gap-0.5">
            <span className="text-sm font-medium">Pessoas</span>
            <span className="text-xs text-muted-foreground">Clientes e contatos</span>
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function PedidosNav({ pathname }: { pathname: string }) {
  const active = pathname.startsWith("/admin/pedidos");
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm transition outline-none ${
          active ? "bg-brand-orange/10 text-brand-orange" : "text-muted-foreground hover:text-foreground"
        }`}
      >
        <ClipboardList className="h-4 w-4" /> Pedidos <ChevronDown className="h-3.5 w-3.5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuItem asChild>
          <Link to="/admin/pedidos" className="flex flex-col items-start gap-0.5">
            <span className="text-sm font-medium">Meus pedidos</span>
            <span className="text-xs text-muted-foreground">Pedidos criados por você</span>
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/admin/pedidos/terceiros" className="flex flex-col items-start gap-0.5">
            <span className="text-sm font-medium">Pedidos de terceiro</span>
            <span className="text-xs text-muted-foreground">Pedidos de agências parceiras</span>
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SegurancaNav({ pathname, showUsuarios }: { pathname: string; showUsuarios: boolean }) {
  const active =
    pathname.startsWith("/admin/seguranca") ||
    pathname.startsWith("/admin/instalar-extensao") ||
    (showUsuarios && pathname.startsWith("/admin/usuarios"));
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm transition outline-none ${
          active ? "bg-brand-orange/10 text-brand-orange" : "text-muted-foreground hover:text-foreground"
        }`}
      >
        <ShieldCheck className="h-4 w-4" /> Segurança <ChevronDown className="h-3.5 w-3.5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuItem asChild>
          <Link to="/admin/seguranca" className="flex flex-col items-start gap-0.5">
            <span className="text-sm font-medium">Segurança</span>
            <span className="text-xs text-muted-foreground">Alertas e políticas</span>
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/admin/instalar-extensao" className="flex flex-col items-start gap-0.5">
            <span className="text-sm font-medium flex items-center gap-1.5">
              <Puzzle className="h-3.5 w-3.5" /> Instalar extensão
            </span>
            <span className="text-xs text-muted-foreground">Importador de reservas</span>
          </Link>
        </DropdownMenuItem>
        {showUsuarios && (
          <DropdownMenuItem asChild>
            <Link to="/admin/usuarios" className="flex flex-col items-start gap-0.5">
              <span className="text-sm font-medium flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5" /> Usuários
              </span>
              <span className="text-xs text-muted-foreground">Contas e permissões</span>
            </Link>
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}


