import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { Loader2, LogOut, Package, ClipboardList, Home, Link2, ShieldCheck, Vault, Users } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import viaAirLogo from "@/assets/viaair-logo.png.asset.json";

export const Route = createFileRoute("/admin")({
  component: AdminLayout,
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
      <header className="border-b border-border bg-background/80 backdrop-blur sticky top-0 z-40">
        <div className="mx-auto max-w-7xl px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-6">
            <Link to="/" className="flex items-center gap-3">
              <img src={viaAirLogo.url} alt="Via Air" className="h-8 w-auto" />
            </Link>
            <nav className="hidden md:flex items-center gap-1">
              <NavItem to="/admin/pacotes" icon={Package} label="Pacotes" active={pathname.startsWith("/admin/pacotes")} />
              <NavItem to="/admin/pedidos" icon={ClipboardList} label="Pedidos" active={pathname.startsWith("/admin/pedidos")} />
              <NavItem to="/admin/link-pagamento" icon={Link2} label="Link de pagamento" active={pathname.startsWith("/admin/link-pagamento")} />
              <NavItem to="/admin/cofre" icon={Vault} label="Cofre" active={pathname.startsWith("/admin/cofre")} />
              {session?.user?.email?.toLowerCase() === "lucas@voeair.com" && (
                <NavItem to="/admin/usuarios" icon={Users} label="Usuários" active={pathname.startsWith("/admin/usuarios")} />
              )}
              <NavItem to="/admin/seguranca" icon={ShieldCheck} label="Segurança" active={pathname.startsWith("/admin/seguranca")} />
            </nav>
          </div>
          <div className="flex items-center gap-2">
            <Link
              to="/"
              className="hidden sm:inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-brand-orange"
            >
              <Home className="h-4 w-4" /> Ver site
            </Link>
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
          <div className="mx-auto max-w-7xl px-6 py-2 flex items-center gap-1 whitespace-nowrap">
            <NavItem to="/admin/pacotes" icon={Package} label="Pacotes" active={pathname.startsWith("/admin/pacotes")} />
            <NavItem to="/admin/pedidos" icon={ClipboardList} label="Pedidos" active={pathname.startsWith("/admin/pedidos")} />
            <NavItem to="/admin/link-pagamento" icon={Link2} label="Link" active={pathname.startsWith("/admin/link-pagamento")} />
            <NavItem to="/admin/cofre" icon={Vault} label="Cofre" active={pathname.startsWith("/admin/cofre")} />
            {session?.user?.email?.toLowerCase() === "lucas@voeair.com" && (
              <NavItem to="/admin/usuarios" icon={Users} label="Usuários" active={pathname.startsWith("/admin/usuarios")} />
            )}
            <NavItem to="/admin/seguranca" icon={ShieldCheck} label="Segurança" active={pathname.startsWith("/admin/seguranca")} />
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
