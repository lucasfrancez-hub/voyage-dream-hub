import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/chat/ComingSoon";

export const Route = createFileRoute("/chat/broadcast")({
  component: () => <ComingSoon title="Broadcast" description="Disparo em massa com templates aprovados pela Meta, agendamento, taxa de leitura e entrega." />,
});
