import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/chat/ComingSoon";

export const Route = createFileRoute("/chat/fluxos")({
  component: () => <ComingSoon title="Fluxos de Automação" description="Construtor visual de fluxos com nós (mensagem, pergunta, condição, webhook, IA, transferir, etc.). Próxima entrega." />,
});
