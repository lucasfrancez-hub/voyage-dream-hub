/**
 * Avisa o servidor qual conversa o atendente está olhando (heartbeat de 30s)
 * e mantém o badge do ícone do app com o total de conversas não lidas.
 */
import { useEffect, useRef } from "react";
import { useServerFn } from "@tanstack/react-start";
import { pingPresencaChat } from "@/lib/chat/presence.functions";
import { atualizarBadge } from "@/lib/chat/push-client";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function usePresencaEBadge(conversationId: string | null, naoLidas: number) {
  const ping = useServerFn(pingPresencaChat);
  const ref = useRef(conversationId);
  ref.current = conversationId;

  useEffect(() => {
    let vivo = true;
    const bater = () => {
      if (!vivo) return;
      const id = ref.current && UUID.test(ref.current) ? ref.current : null;
      void ping({ data: { conversationId: id, visivel: document.visibilityState === "visible" } }).catch(() => {});
    };
    bater();
    const t = setInterval(bater, 30_000);
    document.addEventListener("visibilitychange", bater);
    return () => {
      vivo = false;
      clearInterval(t);
      document.removeEventListener("visibilitychange", bater);
    };
  }, [ping]);

  // Bate de novo assim que troca de conversa (sem esperar os 30s).
  useEffect(() => {
    const id = conversationId && UUID.test(conversationId) ? conversationId : null;
    void ping({ data: { conversationId: id, visivel: document.visibilityState === "visible" } }).catch(() => {});
  }, [conversationId, ping]);

  useEffect(() => {
    void atualizarBadge(naoLidas);
  }, [naoLidas]);
}
