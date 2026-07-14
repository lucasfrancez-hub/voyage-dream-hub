import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/chat/ComingSoon";

export const Route = createFileRoute("/chat/agenda")({
  component: () => <ComingSoon title="Agenda" description="Calendário integrado com Google Calendar, follow-ups e lembretes automáticos." />,
});
