import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/admin/editair")({
  beforeLoad: () => {
    throw redirect({ to: "/editair" });
  },
});
