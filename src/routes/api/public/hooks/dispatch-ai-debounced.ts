import { createFileRoute } from "@tanstack/react-router";

/**
 * Dispatch da IA com debounce.
 *
 * Roda a cada 30s via pg_cron. Busca conversas em modo "ai" cujo
 * `ai_debounce_until` já passou, limpa o campo e chama runAgent — assim a IA
 * responde uma vez só, considerando todas as mensagens que o cliente mandou
 * na janela.
 */
export const Route = createFileRoute("/api/public/hooks/dispatch-ai-debounced")({
  server: {
    handlers: {
      POST: async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { runAgent } = await import("@/lib/whatsapp/agent-runner.server");

        const nowIso = new Date().toISOString();
        const { data: due, error } = await supabaseAdmin
          .from("wa_conversations")
          .select("id, wa_phone, display_name, mode, ai_debounce_until")
          .eq("mode", "ai")
          .not("ai_debounce_until", "is", null)
          .lte("ai_debounce_until", nowIso)
          .limit(50);

        if (error) {
          console.error("[dispatch-ai-debounced] erro select:", error);
          return new Response(JSON.stringify({ ok: false, error: error.message }), { status: 500 });
        }

        const dispatched: string[] = [];
        for (const conv of due ?? []) {
          // Limpa antes de rodar pra evitar dupla execução se o próximo tick
          // pegar antes desta chamada terminar.
          const { error: clearErr } = await supabaseAdmin
            .from("wa_conversations")
            .update({ ai_debounce_until: null })
            .eq("id", conv.id)
            .eq("ai_debounce_until", conv.ai_debounce_until); // guard: só limpa se ninguém empurrou pra frente
          if (clearErr) {
            console.warn(`[dispatch-ai-debounced] falha ao limpar debounce ${conv.id}:`, clearErr);
            continue;
          }

          try {
            // "Digitando…" visual no WhatsApp do cliente enquanto a IA processa.
            // Usa o wa_message_id da última mensagem inbound da conversa.
            const { data: lastInbound } = await supabaseAdmin
              .from("wa_messages")
              .select("wa_message_id")
              .eq("conversation_id", conv.id)
              .eq("direction", "inbound")
              .not("wa_message_id", "is", null)
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle();
            if (lastInbound?.wa_message_id) {
              const { sendWhatsAppTypingIndicator } = await import("@/lib/whatsapp/send.server");
              await sendWhatsAppTypingIndicator(lastInbound.wa_message_id);
            }

            await runAgent({ wa_phone: conv.wa_phone, profile_name: conv.display_name });
            dispatched.push(conv.id);
          } catch (e) {
            console.error(`[dispatch-ai-debounced] erro runAgent ${conv.id}:`, e);
          }

        }

        return new Response(JSON.stringify({ ok: true, dispatched: dispatched.length }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
