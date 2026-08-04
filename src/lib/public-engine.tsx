import { createContext, useContext } from "react";

/**
 * Marca a árvore de componentes como "motor público" (cliente final, sem login).
 * Nesse modo as buscas usam as server functions sem autenticação e as ações
 * internas (fazer pedido, copiar link) ficam ocultas.
 */
const PublicEngineContext = createContext(false);

export function PublicEngineProvider({
  value,
  children,
}: {
  value: boolean;
  children: React.ReactNode;
}) {
  return <PublicEngineContext.Provider value={value}>{children}</PublicEngineContext.Provider>;
}

export function useIsPublicEngine() {
  return useContext(PublicEngineContext);
}
