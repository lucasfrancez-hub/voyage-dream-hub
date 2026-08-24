import { Outlet } from "@tanstack/react-router";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/admin/motor-pacote")({
  component: () => <Outlet />,
});
