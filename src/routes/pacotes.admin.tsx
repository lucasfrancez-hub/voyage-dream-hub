import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/pacotes/admin")({
  beforeLoad: () => {
    throw redirect({ to: "/auth" });
  },
});
