import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { meusAcessos, type MeusAcessos } from "./permissions.functions";
import { moduloDaRota } from "./modules";

type AcessoCtx = {
  carregando: boolean;
  verTudo: boolean;
  modulos: string[];
  temModulo: (key: string) => boolean;
  /** true quando a rota não pertence a nenhum módulo ou o usuário tem acesso a ele */
  podeRota: (pathname: string) => boolean;
};

const Ctx = createContext<AcessoCtx>({
  carregando: true,
  verTudo: true,
  modulos: [],
  temModulo: () => true,
  podeRota: () => true,
});

export function AcessoProvider({ children, ativo = true }: { children: ReactNode; ativo?: boolean }) {
  const buscar = useServerFn(meusAcessos);
  const q = useQuery<MeusAcessos>({
    queryKey: ["meus-acessos"],
    queryFn: () => buscar(),
    enabled: ativo,
    staleTime: 5 * 60 * 1000,
  });

  const valor = useMemo<AcessoCtx>(() => {
    const verTudo = q.data?.verTudo ?? false;
    const modulos = q.data?.modulos ?? [];
    const temModulo = (key: string) => verTudo || modulos.includes(key);
    return {
      carregando: q.isLoading,
      verTudo,
      modulos,
      temModulo,
      podeRota: (pathname: string) => {
        if (verTudo) return true;
        const m = moduloDaRota(pathname);
        if (!m) return true;
        return modulos.includes(m.key);
      },
    };
  }, [q.data, q.isLoading]);

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export function useAcesso() {
  return useContext(Ctx);
}
