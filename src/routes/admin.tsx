import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { Loader2, LogOut, Package, ClipboardList, Home, Link2, Settings, Users, ChevronDown, LayoutDashboard, Contact, Smartphone,
  Puzzle, MessageCircle, Sun, Moon, BarChart3 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import viaAirLogo from "@/assets/viaair-logo.png.asset.json";
import { AdminNotificationBell } from "@/components/admin/NotificationBell";
import { GlobalSearchButton } from "@/components/admin/GlobalSearch";
import { PublishQueueButton } from "@/components/admin/PublishQueueButton";
import { APP_VERSION, APP_BUILD_DATE } from "@/lib/version";
import { NavMegaMenu, type NavMenuGroup } from "@/components/admin/NavMegaMenu";



export const Route = createFileRoute("/admin")({
  ssr: false,
  component: AdminRoute,
  head: () => ({
    meta: [
      { title: "Admin - Via Air" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

type Role = "admin" | "partner" | "marketing" | null;

// O link secreto (/admin/app/<token>) entra pelo PIN — não passa pelo guard
// de login/2FA do painel.
function AdminRoute() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  if (pathname.startsWith("/admin/app/")) return <Outlet />;
  return <AdminLayout />;
}

function AdminLayout() {

  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [role, setRole] = useState<Role | undefined>(undefined);
  const isAdmin = role === "admin";
  const isPartner = role === "partner";
  // marketing role is redirected to /chat/broadcast on entry
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    if (typeof window === "undefined") return "dark";
    // O Safari/iOS pode bloquear o Storage em abas privadas, PWAs restaurados
    // ou logo depois de uma atualização. Isso não pode derrubar o painel.
    try {
      const saved = window.localStorage.getItem("admin-theme");
      return saved === "light" ? "light" : "dark";
    } catch {
      return "dark";
    }
  });
  useEffect(() => {
    try { window.localStorage.setItem("admin-theme", theme); } catch { /* noop */ }
    // Also apply on <html> so Radix Portals (rendered outside the wrapper) inherit the tokens.
    const root = document.documentElement;
    if (theme === "light") root.classList.add("admin-light");
    else root.classList.remove("admin-light");
    return () => { root.classList.remove("admin-light"); };
  }, [theme]);


  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));

    // Timeout de segurança: se em 4s não resolveu getSession (rede/refresh
    // travado), força session=null pra não ficar carregando pra sempre.
    const failsafe = setTimeout(() => {
      setSession((cur) => (cur === undefined ? null : cur));
    }, 4000);

    supabase.auth
      .getSession()
      .then(async ({ data, error }) => {
        clearTimeout(failsafe);
        if (error || !data.session) {
          try { await supabase.auth.signOut(); } catch { /* noop */ }
          setSession(null);
          return;
        }
        setSession(data.session);
      })
      .catch(async () => {
        clearTimeout(failsafe);
        try { await supabase.auth.signOut(); } catch { /* noop */ }
        setSession(null);
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
    let cancelled = false;
    // Timeout de segurança pra query de role — evita spinner infinito
    // se a Data API ficar lenta/travada.
    const roleFailsafe = setTimeout(() => {
      if (!cancelled) setRole(null);
    }, 6000);
    (async () => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", session.user.id)
        .in("role", ["admin", "partner", "marketing"]);
      if (cancelled) return;
      clearTimeout(roleFailsafe);
      if (error) {
        toast.error("Erro ao validar acesso");
        setRole(null);
        return;
      }
      const roles = (data ?? []).map((r) => r.role);
      if (roles.includes("admin")) setRole("admin");
      else if (roles.includes("partner")) setRole("partner");
      else if (roles.includes("marketing")) setRole("marketing");
      else setRole(null);
    })();
    return () => {
      cancelled = true;
      clearTimeout(roleFailsafe);
    };
  }, [session, navigate]);

  // Redirect /admin -> destino padrão por role
  useEffect(() => {
    if (pathname !== "/admin") return;
    if (isAdmin) navigate({ to: "/admin/dashboard" });
    else if (isPartner) navigate({ to: "/admin/pedidos" });
    else if (role === "marketing") { if (typeof window !== "undefined") window.location.replace("/chat/broadcast"); }
  }, [pathname, isAdmin, isPartner, role, navigate]);


  // Auto-logout por inatividade (30 min sem interação do usuário)
  useEffect(() => {
    if (!session || !(isAdmin || isPartner || role === "marketing")) return;
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


  if (!isAdmin && !isPartner && role !== "marketing") {
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

  // Módulos financeiros sensíveis: exclusivos do admin
  const adminOnly = (p: string) =>
    p.startsWith("/admin/pagamentos") ||
    p.startsWith("/admin/conta-bancaria") ||
    p.startsWith("/admin/comprovantes");
  if (!isAdmin && adminOnly(pathname)) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-center">
        <div>
          <h1 className="text-2xl font-semibold">Área restrita</h1>
          <p className="mt-2 text-muted-foreground text-sm">
            Pagamentos e Conta bancária são exclusivos de administradores.
          </p>
          <button
            className="mt-4 text-brand-orange hover:underline"
            onClick={() => navigate({ to: "/admin/pedidos" })}
          >
            Voltar para pedidos
          </button>
        </div>
      </div>
    );
  }
  if (role === "marketing") {
    if (typeof window !== "undefined") window.location.replace("/chat/broadcast");
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }


  return (
    <div className={`min-h-screen bg-background text-foreground ${theme === "light" ? "admin-light" : ""}`}>
      <header className="border-b border-border bg-background/80 backdrop-blur sticky top-0 z-40" style={{ paddingTop: "env(safe-area-inset-top)" }}>
        <div className="mx-auto max-w-7xl px-3 sm:px-6 h-14 sm:h-16 flex items-center justify-between gap-2 sm:gap-4">
          <div className="flex items-center gap-3 sm:gap-6 min-w-0">
            <Link to="/" className="flex items-center gap-3 shrink-0">
              <img src={viaAirLogo.url} alt="Via Air" className="h-7 sm:h-8 w-auto" />
            </Link>
            <nav className="hidden md:flex items-center gap-1">
              {isAdmin && <ProdutosNav pathname={pathname} />}
              {isAdmin && <DashboardNav pathname={pathname} />}
              {isAdmin
                ? <PedidosNav pathname={pathname} />
                : <NavItem to="/admin/pedidos" icon={ClipboardList} label="Meus pedidos" active={pathname.startsWith("/admin/pedidos")} />}
              <CartaoNav pathname={pathname} />
              {isAdmin && <SegurancaNav pathname={pathname} showUsuarios={session?.user?.email?.toLowerCase() === "lucas@voeair.com"} />}
            </nav>

          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:border-brand-orange hover:text-brand-orange"
              title={theme === "dark" ? "Mudar para tema claro" : "Mudar para tema escuro"}
              aria-label="Alternar tema"
            >
              {theme === "dark" ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
            </button>
            {isAdmin && <AdminNotificationBell />}
            <a
              href="https://viaair.tur.br"
              target="_blank"
              rel="noopener noreferrer"
              title="Ver site"
              aria-label="Ver site"
              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:border-brand-orange hover:text-brand-orange"
            >
              <Home className="h-3.5 w-3.5" />
            </a>
            <PublishQueueButton />
            <GlobalSearchButton />

            <a
              href="/chat"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-3 py-1.5 text-xs font-medium text-emerald-500 transition-colors hover:bg-emerald-500/25"
              title="Central de atendimento WhatsApp + IA (abre em nova aba)"
            >
              <MessageCircle className="h-3.5 w-3.5" /> Chat
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
            {isAdmin && <ProdutosNav pathname={pathname} />}
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

      <footer className="mt-12 border-t border-border bg-background/60">
        <div className="mx-auto max-w-7xl px-3 sm:px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <img src={viaAirLogo.url} alt="VIA AIR" className="h-5 w-auto opacity-80" />
            <span>
              Sistema produzido por <span className="font-medium text-foreground">VIA AIR</span>
              <span className="opacity-60"> · © {new Date().getFullYear()} Todos os direitos reservados</span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span>Versão <span className="font-mono text-foreground">{APP_VERSION}</span></span>
            <span className="opacity-50">·</span>
            <span>{APP_BUILD_DATE}</span>
          </div>
        </div>
      </footer>
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

function ProdutosNav({ pathname }: { pathname: string }) {
  const active =
    pathname.startsWith("/admin/pacotes") ||
    pathname.startsWith("/admin/buscar") ||
    pathname.startsWith("/admin/cruzeiros") ||
    pathname.startsWith("/admin/promocoes-aereo") ||
    pathname.startsWith("/admin/voos-teste") ||
    pathname.startsWith("/admin/hoteis-teste") ||
    pathname.startsWith("/admin/carros");
  return (
    <NavMegaMenu
      icon={Package}
      title="Produtos"
      subtitle="Catálogo e busca"
      pathname={pathname}
      active={active}
      groups={[
        {
          items: [
            { to: "/admin/pacotes", label: "Command Center" },
            { to: "/admin/cruzeiros", label: "Cruzeiros" },
            { to: "/admin/promocoes-aereo", label: "Promoções de Aéreo" },
            { to: "/admin/buscar", label: "Motor de busca" },
          ],
        },
      ]}
    />
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
    <NavMegaMenu
      icon={Link2}
      title="Pagamentos"
      subtitle="Links e cobrança"
      pathname={pathname}
      active={active}
      groups={[
        {
          label: "Links",
          accent: true,
          items: [
            { to: "/admin/link-pagamento", label: "Link seguro" },
            { to: "/admin/link-cartao-simples", label: "Link convencional" },
            { to: "/admin/link-boleto", label: "Link boleto bancário" },
          ],
        },
        {
          label: "Ferramentas",
          items: [
            { to: "/admin/cofre", label: "Cofre" },
            { to: "/admin/encurtador", label: "Encurtador de URL" },
            { to: "/admin/melhores-destinos", label: "Melhores Destinos" },
            { to: "/admin/passagens-baratas", label: "Passagens baratas" },
          ],
        },
      ]}
    />
  );
}

function DashboardNav({ pathname }: { pathname: string }) {
  const active =
    pathname.startsWith("/admin/dashboard") ||
    pathname.startsWith("/admin/pessoas") ||
    pathname.startsWith("/admin/notas-fiscais") ||
    pathname.startsWith("/admin/checkins") ||
    pathname.startsWith("/admin/contas-") ||
    pathname.startsWith("/admin/pagamentos") ||
    pathname.startsWith("/admin/conta-bancaria") ||
    pathname.startsWith("/admin/redes-sociais") ||
    pathname.startsWith("/admin/comprovantes");
  return (
    <NavMegaMenu
      icon={LayoutDashboard}
      title="Dashboard"
      subtitle="Sistema central"
      pathname={pathname}
      active={active}
      columns={2}
      groups={[
        {
          label: "Dashboard",
          items: [{ to: "/admin/dashboard", label: "Dashboard" }],
        },
        {
          label: "Pessoas",
          items: [{ to: "/admin/pessoas", label: "Pessoas" }],
        },
        {
          label: "Financeiro",
          accent: true,
          items: [
            { to: "/admin/contas-receber", label: "Contas a receber" },
            { to: "/admin/contas-pagar", label: "Contas a pagar" },
            { to: "/admin/recebimentos", label: "Recebimentos" },
            { to: "/admin/pagamentos", label: "Pagamentos" },
            { to: "/admin/conta-bancaria", label: "Conta bancária" },
            { to: "/admin/comprovantes", label: "Comprovantes" },
          ],
        },
        {
          label: "Notas fiscais",
          items: [{ to: "/admin/notas-fiscais", label: "Notas fiscais" }],
        },
        {
          label: "Check-in",
          items: [{ to: "/admin/checkins", label: "Check-ins" }],
        },
        {
          label: "Redes sociais",
          items: [
            { to: "/admin/redes-sociais", label: "Redes sociais" },
            { to: "/editair", label: "EditAir — editor de vídeo" },
          ],
        },
      ]}

    />
  );
}


function PedidosNav({ pathname }: { pathname: string }) {
  const active = pathname.startsWith("/admin/pedidos") || pathname.startsWith("/admin/orcamentos");
  return (
    <NavMegaMenu
      icon={ClipboardList}
      title="Pedidos"
      subtitle="Vendas e reservas"
      pathname={pathname}
      active={active}
      groups={[
        {
          items: [
            { to: "/admin/pedidos", label: "Meus pedidos" },
            { to: "/admin/orcamentos", label: "Orçamentos" },
            { to: "/admin/pedidos/terceiros", label: "Pedidos de terceiro" },
          ],
        },
      ]}
    />
  );
}

function SegurancaNav({ pathname, showUsuarios }: { pathname: string; showUsuarios: boolean }) {
  const active =
    pathname.startsWith("/admin/seguranca") ||
    pathname.startsWith("/admin/instalar-extensao") ||
    pathname.startsWith("/admin/app-celular") ||
    pathname.startsWith("/admin/metricas") ||
    pathname.startsWith("/admin/checkin-treino") ||
    pathname.startsWith("/admin/expedia") ||
    (showUsuarios && pathname.startsWith("/admin/usuarios"));

  return (
    <NavMegaMenu
      icon={Settings}
      title="Configurações"
      subtitle="Sistema e acessos"
      pathname={pathname}
      active={active}
      groups={[
        {
          label: "Sistema",
          accent: true,
          items: [
            { to: "/admin/seguranca", label: "Segurança" },
            { to: "/admin/metricas", label: "Métricas", icon: BarChart3 },
            { to: "/admin/instalar-extensao", label: "Instalar extensão", icon: Puzzle },
            { to: "/admin/app-celular", label: "App no celular", icon: Smartphone },
          ],
        },
        ...(showUsuarios
          ? [
              {
                label: "Admin",
                items: [
                  { to: "/admin/checkin-treino", label: "Treinador de check-in" },
                  { to: "/admin/expedia", label: "Expedia TAAP" },
                  { to: "/admin/usuarios", label: "Usuários", icon: Users },
                ],
              } as NavMenuGroup,
            ]
          : []),
      ]}
    />
  );
}



