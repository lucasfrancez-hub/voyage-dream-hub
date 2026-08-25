import { createFileRoute } from "@tanstack/react-router";
import { AdminOrders } from "./admin.pedidos.index";

export const Route = createFileRoute("/admin/pedidos/leads")({
  component: () => <AdminOrders scope="lead" />,
  head: () => ({
    meta: [
      { title: "Leads do motor público — Admin VIA AIR" },
      { name: "description", content: "Leads gerados pelo motor de busca do site, prontos para conversão em pedido." },
      { property: "og:title", content: "Leads do motor público — Admin VIA AIR" },
      { property: "og:description", content: "Leads gerados pelo motor de busca do site, prontos para conversão em pedido." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});
