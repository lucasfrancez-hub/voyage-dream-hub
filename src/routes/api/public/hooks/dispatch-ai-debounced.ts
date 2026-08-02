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
          // LEASE curto: worker do Cloudflare cai em ~30s se travar. Se der
          // ruim, o próximo tick (a cada 30s) reprocessa em até 90s no pior
          // caso — bem dentro do orçamento total de 3min de resposta.
          const leaseUntil = new Date(Date.now() + 90 * 1000).toISOString();
          const { error: leaseErr } = await supabaseAdmin
            .from("wa_conversations")
            .update({ ai_debounce_until: leaseUntil })
            .eq("id", conv.id)
            .eq("ai_debounce_until", conv.ai_debounce_until); // guard: só pega se ninguém já empurrou
          if (leaseErr) {
            console.warn(`[dispatch-ai-debounced] falha ao pegar lease ${conv.id}:`, leaseErr);
            continue;
          }

          try {
            // "Digitando…" visual no WhatsApp do cliente enquanto a IA processa.
            // Usa o wa_message_id da última mensagem inbound da conversa.
            const { data: lastInbound } = await supabaseAdmin
              .from("wa_messages")
              .select("id, wa_message_id")
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

            await runAgent({
              wa_phone: conv.wa_phone,
              profile_name: conv.display_name,
              trigger_message_id: lastInbound?.id ?? undefined,
            });

            // Sucesso: só agora zeramos o debounce. Se uma nova mensagem chegou
            // durante o processamento, ela já empurrou o lease pra outra data
            // (guard abaixo impede que a gente sobrescreva).
            await supabaseAdmin
              .from("wa_conversations")
              .update({ ai_debounce_until: null })
              .eq("id", conv.id)
              .eq("ai_debounce_until", leaseUntil);
            dispatched.push(conv.id);
          } catch (e) {
            console.error(`[dispatch-ai-debounced] erro runAgent ${conv.id}:`, e);
            // Não zera: o lease de 5min garante retry automático.
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
