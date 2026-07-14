import { createFileRoute } from "@tanstack/react-router";
import { AdminOrders } from "./admin.pedidos.index";

export const Route = createFileRoute("/admin/pedidos/terceiros")({
  component: () => <AdminOrders scope="third_party" />,
  head: () => ({ meta: [{ title: "Pedidos de terceiro — Admin" }] }),
});
