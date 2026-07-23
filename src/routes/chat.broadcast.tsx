import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/chat/broadcast")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/disparos" });
  },
});
