import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { Loader2, LogOut, Home, ChevronDown } from "lucide-react";
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

function AdminLayout() {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null));
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
        .eq("role", "admin")
        .maybeSingle();
      if (error) {
        toast.error("Erro ao validar acesso");
        setIsAdmin(false);
        return;
      }
      setIsAdmin(!!data);
    })();
  }, [session, navigate]);

  // Redirect /admin exactly to /admin/pacotes
  useEffect(() => {
    if (pathname === "/admin" && isAdmin) {
      navigate({ to: "/admin/pacotes" });
    }
  }, [pathname, isAdmin, navigate]);

  if (session === undefined || (session && isAdmin === null)) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }


  if (!isAdmin) {
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

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-background/95 backdrop-blur sticky top-0 z-40">
        <div className="mx-auto max-w-7xl px-6 h-14 flex items-center justify-between gap-6">
          <Link to="/" className="flex items-center gap-3 shrink-0">
            <img src={viaAirLogo.url} alt="Via Air" className="h-7 w-auto" />
          </Link>
          <nav className="hidden md:flex items-center gap-1 flex-1">
            <NavItem to="/admin/pacotes" label="Pacotes" active={pathname.startsWith("/admin/pacotes")} />
            <NavItem to="/admin/pedidos" label="Pedidos" active={pathname.startsWith("/admin/pedidos")} />
            <CartaoNav pathname={pathname} />
            <NavItem to="/admin/link-boleto" label="Boleto" active={pathname.startsWith("/admin/link-boleto")} />
            <NavItem to="/admin/cofre" label="Cofre" active={pathname.startsWith("/admin/cofre")} />
            {session?.user?.email?.toLowerCase() === "lucas@voeair.com" && (
              <NavItem to="/admin/usuarios" label="Usuários" active={pathname.startsWith("/admin/usuarios")} />
            )}
            <NavItem to="/admin/seguranca" label="Segurança" active={pathname.startsWith("/admin/seguranca")} />
          </nav>
          <div className="flex items-center gap-3 shrink-0">
            <a
              href="https://viaair.tur.br"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition"
            >
              <Home className="h-3.5 w-3.5" /> Site
            </a>
            <button
              onClick={async () => {
                await supabase.auth.signOut();
                navigate({ to: "/auth" });
              }}
              className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition"
            >
              <LogOut className="h-3.5 w-3.5" /> Sair
            </button>
          </div>
        </div>
        <nav className="md:hidden border-t border-border overflow-x-auto">
          <div className="mx-auto max-w-7xl px-4 flex items-center gap-1 whitespace-nowrap">
            <NavItem to="/admin/pacotes" label="Pacotes" active={pathname.startsWith("/admin/pacotes")} />
            <NavItem to="/admin/pedidos" label="Pedidos" active={pathname.startsWith("/admin/pedidos")} />
            <CartaoNav pathname={pathname} />
            <NavItem to="/admin/link-boleto" label="Boleto" active={pathname.startsWith("/admin/link-boleto")} />
            <NavItem to="/admin/cofre" label="Cofre" active={pathname.startsWith("/admin/cofre")} />
            {session?.user?.email?.toLowerCase() === "lucas@voeair.com" && (
              <NavItem to="/admin/usuarios" label="Usuários" active={pathname.startsWith("/admin/usuarios")} />
            )}
            <NavItem to="/admin/seguranca" label="Segurança" active={pathname.startsWith("/admin/seguranca")} />
          </div>
        </nav>
      </header>

      <Outlet />
    </div>
  );
}

function NavItem({
  to,
  label,
  active,
}: {
  to: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      to={to}
      className={`relative inline-flex items-center px-3 py-3.5 text-[11px] font-semibold uppercase tracking-wider transition ${
        active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {label}
      {active && <span className="absolute left-3 right-3 bottom-0 h-0.5 bg-brand-orange" />}
    </Link>
  );
}

function CartaoNav({ pathname }: { pathname: string }) {
  const active =
    pathname === "/admin/link-pagamento" ||
    pathname.startsWith("/admin/link-pagamento/") ||
    pathname.startsWith("/admin/link-cartao-simples");
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={`relative inline-flex items-center gap-1 px-3 py-3.5 text-[11px] font-semibold uppercase tracking-wider transition outline-none ${
          active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
        }`}
      >
        Cartão <ChevronDown className="h-3 w-3" />
        {active && <span className="absolute left-3 right-3 bottom-0 h-0.5 bg-brand-orange" />}
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
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
