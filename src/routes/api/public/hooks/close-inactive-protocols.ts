import { createFileRoute } from "@tanstack/react-router";

/**
 * Encerra protocolos abertos há mais de 1h sem atividade.
 * Envia mensagem final no WhatsApp e marca como encerrado_inatividade.
 *
 * Chamado pelo pg_cron a cada 5 min.
 */
export const Route = createFileRoute("/api/public/hooks/close-inactive-protocols")({
  server: {
    handlers: {
      POST: async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { saveMessage } = await import("@/lib/whatsapp/conversation.server");
        const { sendWhatsAppBubbles } = await import("@/lib/whatsapp/send.server");

        const cutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString(); // 1h

        const { data: expired, error } = await supabaseAdmin
          .from("wa_protocolos")
          .select("id, numero, conversation_id")
          .eq("status", "aberto")
          .lt("last_activity_at", cutoff)
          .limit(50);

        if (error) {
          console.error("[close-inactive] query error:", error.message);
          return new Response(JSON.stringify({ ok: false, error: error.message }), { status: 500 });
        }

        const processed: string[] = [];
        for (const proto of expired ?? []) {
          const { data: conv } = await supabaseAdmin
            .from("wa_conversations")
            .select("wa_phone, funnel_stage")
            .eq("id", proto.conversation_id)
            .maybeSingle();
          if (!conv) continue;

          const encerramentoMsg =
            `Devido ao tempo de inatividade, estou encerrando o protocolo ${proto.numero} por aqui.\n\n` +
            `Se ainda tiver interesse ou qualquer dúvida, é só chamar de novo que a gente continua o atendimento.`;

          // Envia no WhatsApp
          await sendWhatsAppBubbles(conv.wa_phone, encerramentoMsg);

          // Registra a mensagem (sem tocar/reabrir protocolo)
          await saveMessage({
            conversation_id: proto.conversation_id,
            direction: "outbound",
            sender: "system",
            content: encerramentoMsg,
            skip_protocolo: true,
          });

          // Marca protocolo encerrado + snapshot do funil + limpa da conversa
          await supabaseAdmin
            .from("wa_protocolos")
            .update({
              status: "encerrado_inatividade",
              closed_at: new Date().toISOString(),
              funnel_stage_final: conv.funnel_stage ?? null,
            })
            .eq("id", proto.id);
          await supabaseAdmin
            .from("wa_conversations")
            .update({ protocolo_ativo_id: null })
            .eq("id", proto.conversation_id);

          processed.push(proto.numero);
        }

        return new Response(JSON.stringify({ ok: true, closed: processed }), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
