import editairLogo from "@/assets/editair-logo.png.asset.json";
import { useEffect, useState, useSyncExternalStore, type CSSProperties } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { LoginNuvemDialog } from "@/components/editair/LoginNuvemDialog";
import { assinarHeaderProjeto, lerHeaderProjeto } from "@/lib/editair/header-state";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** Ícone de pasta/projeto do modelo aprovado (19x19). */
function IconeProjetos() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="block h-[19px] w-[19px]">
      <path
        d="M3.5 6.75A1.75 1.75 0 0 1 5.25 5h4.1l1.55 1.75h7.85A1.75 1.75 0 0 1 20.5 8.5v8.25a2.25 2.25 0 0 1-2.25 2.25H5.75A2.25 2.25 0 0 1 3.5 16.75v-10Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Engrenagem maior do modelo aprovado (24x24). */
function IconeAjustes() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="block h-6 w-6">
      <path
        d="M9.6 3.6 10 2h4l.4 1.6a8.4 8.4 0 0 1 1.75.73l1.42-.85 2.83 2.83-.85 1.42c.3.56.55 1.14.73 1.75L22 9.9v4l-1.62.4a8.7 8.7 0 0 1-.73 1.75l.85 1.42-2.83 2.83-1.42-.85a8.4 8.4 0 0 1-1.75.73L14.1 22h-4l-.4-1.62a8.7 8.7 0 0 1-1.75-.73l-1.42.85-2.83-2.83.85-1.42a8.4 8.4 0 0 1-.73-1.75L2.2 14.1v-4l1.62-.4c.18-.61.42-1.19.73-1.75L3.7 6.53 6.53 3.7l1.42.85A8.4 8.4 0 0 1 9.6 3.6Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.45"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3.1" fill="none" stroke="currentColor" strokeWidth="1.55" />
    </svg>
  );
}

const PILL =
  "flex h-8 items-center justify-center rounded-[9px] border border-[#29323e] bg-gradient-to-b from-[#141a21] to-[#10151a] text-xs font-semibold text-[#cfd6df] transition hover:bg-[#19212b] hover:text-white";

function iniciais(nome: string) {
  return nome
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

export function EditairHeader({ desktop }: { desktop: boolean }) {
  const navigate = useNavigate();
  const projeto = useSyncExternalStore(assinarHeaderProjeto, lerHeaderProjeto, lerHeaderProjeto);
  const [session, setSession] = useState<Session | null>(null);
  const [login, setLogin] = useState(false);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    supabase.auth
      .getSession()
      .then(({ data }) => setSession(data.session ?? null))
      .catch(() => setSession(null));
    return () => sub.subscription.unsubscribe();
  }, []);

  const nomeCompleto =
    (session?.user.user_metadata?.["full_name"] as string | undefined) ??
    (session?.user.user_metadata?.["name"] as string | undefined) ??
    session?.user.email?.split("@")[0] ??
    "";
  const primeiroNome = nomeCompleto.split(/[\s.]+/)[0] ?? "";
  const nomeExibido = primeiroNome ? primeiroNome.charAt(0).toUpperCase() + primeiroNome.slice(1) : "";

  const irProjetos = () => navigate({ to: "/editair" });
  const novoProjeto = () => {
    navigate({ to: "/editair" });
    setTimeout(() => window.dispatchEvent(new CustomEvent("editair:novo-projeto")), 60);
  };
  const abrirAjustes = () => {
    navigate({ to: "/editair" });
    setTimeout(() => window.dispatchEvent(new CustomEvent("editair:ajustes")), 60);
  };

  const corStatus =
    projeto.status === "salvo" ? "bg-[#37d88b]" : projeto.status === "salvando" ? "bg-[#f0b429]" : "bg-[#ef4444]";
  const textoStatus =
    projeto.status === "salvo" ? "Salvo automaticamente" : projeto.status === "salvando" ? "Salvando…" : "Erro ao salvar";

  return (
    <>
      <header
        className="flex h-14 items-center border-b border-[#222a34] bg-[#0a0e13] pl-[18px] pr-1"
        style={desktop ? ({ WebkitAppRegion: "drag" } as CSSProperties) : undefined}
      >
        <div className="flex min-w-0 items-center">
          <span className="max-w-[440px] truncate text-xs font-semibold text-[#f0f3f7]">
            {projeto.nome ?? "EditAir"}
          </span>
          {projeto.nome ? (
            <span className="ml-2.5 flex shrink-0 items-center gap-1.5 text-[11px] text-[#7e8997]">
              <i className={`block h-1.5 w-1.5 rounded-full ${corStatus}`} />
              {textoStatus}
            </span>
          ) : null}
        </div>

        <div className="flex-1" />

        <div
          className="flex shrink-0 items-center gap-[7px]"
          style={desktop ? ({ WebkitAppRegion: "no-drag" } as CSSProperties) : undefined}
        >
          <button type="button" aria-label="Projetos" onClick={irProjetos} className={`${PILL} gap-2 px-[11px]`}>
            <IconeProjetos />
            Projetos
          </button>

          <button type="button" onClick={novoProjeto} className={`${PILL} gap-1.5 px-2 sm:px-[11px]`}>
            <span className="text-sm leading-none">＋</span>
            Novo projeto
          </button>

          <button
            type="button"
            title="Ajustes"
            aria-label="Ajustes"
            onClick={abrirAjustes}
            className={`${PILL} h-[38px] w-[38px] shrink-0 text-[#f2f5f8]`}
          >
            <IconeAjustes />
          </button>

          {session ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="flex h-[34px] items-center gap-2 rounded-[10px] border border-[#2a3440] bg-[#11171e] py-0 pl-1.5 pr-2.5 text-left"
                >
                  <span className="grid h-[25px] w-[25px] place-items-center rounded-lg bg-gradient-to-br from-[#14c8f3] via-[#1677ff] to-[#8f2cff] text-[10px] font-extrabold text-white">
                    {iniciais(nomeCompleto) || "VA"}
                  </span>
                  <span className="hidden leading-[1.05] sm:block">
                    <span className="block text-[9px] text-[#7f8a97]">Olá, {nomeExibido}</span>
                    <span className="mt-0.5 block text-[11px] font-bold text-[#f8fafc]">Minha conta</span>
                  </span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="truncate text-xs font-normal text-muted-foreground">
                  {session.user.email}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link to="/admin/dashboard">Painel VIA AIR</Link>
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => void supabase.auth.signOut()}>Sair</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <button
              type="button"
              onClick={() => setLogin(true)}
              className="flex h-[34px] items-center gap-2 rounded-[10px] border border-[#2a3440] bg-[#11171e] py-0 pl-1.5 pr-3 text-left"
            >
              <span className="grid h-[25px] w-[25px] place-items-center rounded-lg bg-gradient-to-br from-[#14c8f3] via-[#1677ff] to-[#8f2cff] text-[10px] font-extrabold text-white">
                VA
              </span>
              <span className="text-[11px] font-bold text-[#f8fafc]">Entrar</span>
            </button>
          )}

          <span className="ml-[5px] flex h-12 w-[138px] shrink-0 items-center justify-end overflow-visible border-l border-[#222a34] pl-2.5">
            <img
              src={editairLogo.url}
              alt="EditAir"
              className="h-[50px] w-[152px] origin-right scale-[1.38] object-contain drop-shadow-[0_0_7px_rgba(31,169,255,0.18)]"
            />
          </span>
        </div>
      </header>

      <LoginNuvemDialog aberto={login} onFechar={() => setLogin(false)} onEntrou={() => setLogin(false)} />
    </>
  );
}
