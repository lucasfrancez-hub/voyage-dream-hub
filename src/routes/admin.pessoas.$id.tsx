import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/admin/pessoas/$id")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/admin/pessoas",
      search: { edit: params.id },
    });
  },
});
