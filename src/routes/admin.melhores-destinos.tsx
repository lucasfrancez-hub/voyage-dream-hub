/**
 * Melhores Destinos — agora a navegação é por grupos (região → destino →
 * origem → datas), na página "Passagens baratas".
 */
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/admin/melhores-destinos")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/passagens-baratas" });
  },
});
