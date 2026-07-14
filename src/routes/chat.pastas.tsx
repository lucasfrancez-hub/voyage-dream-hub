import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/chat/ComingSoon";

export const Route = createFileRoute("/chat/pastas")({
  component: () => <ComingSoon title="Pastas" description="Organize conversas em pastas customizadas por departamento, prioridade ou etapa." />,
});
