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
        const { isAiGloballyOff } = await import("@/lib/whatsapp/ai-global-switch.server");

        // Interruptor global: IAs desligadas → nenhum disparo automático.
        if (await isAiGloballyOff()) {
          return new Response(JSON.stringify({ ok: true, skipped: "ai_globally_off" }), {
            headers: { "content-type": "application/json" },
          });
        }


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
          // GUARDA "cliente ainda digitando": o WhatsApp Cloud API não avisa
          // quando o cliente está digitando, então usamos a chegada das
          // mensagens como sinal. Se a última mensagem do cliente chegou há
          // menos de 25s, ele provavelmente ainda está escrevendo — adiamos
          // 30s pra não responder no meio da rajada e embaralhar a conversa.
          // O teto absoluto continua sendo 3min a contar da 1ª mensagem
          // pendente: passou disso, responde mesmo assim.
          {
            const { data: ultimas } = await supabaseAdmin
              .from("wa_messages")
              .select("created_at, direction")
              .eq("conversation_id", conv.id)
              .order("created_at", { ascending: false })
              .limit(20);
            const lastIn = (ultimas ?? []).find((m) => m.direction === "inbound");
            const lastOut = (ultimas ?? []).find((m) => m.direction === "outbound");
            const primeiraPendente = [...(ultimas ?? [])]
              .reverse()
              .find(
                (m) =>
                  m.direction === "inbound" &&
                  (!lastOut || new Date(m.created_at) > new Date(lastOut.created_at)),
              );
            const tetoAt = primeiraPendente
              ? new Date(primeiraPendente.created_at).getTime() + 3 * 60 * 1000
              : 0;
            const digitando = lastIn && Date.now() - new Date(lastIn.created_at).getTime() < 25_000;
            if (digitando && Date.now() < tetoAt) {
              await supabaseAdmin
                .from("wa_conversations")
                .update({ ai_debounce_until: new Date(Math.min(Date.now() + 30_000, tetoAt)).toISOString() })
                .eq("id", conv.id)
                .eq("ai_debounce_until", conv.ai_debounce_until);
              continue;
            }
          }

          // LEASE CURTO + HEARTBEAT. Antes o lease era fixo de 5min: quando o
          // worker morria no meio do run (timeout/CPU), a conversa ficava
          // travada até o lease expirar e o cliente esperava ~6min pela
          // resposta. Agora o lease é de 2min e é renovado a cada 45s enquanto
          // o runAgent está vivo — se o worker cair, o próximo tick recupera em
          // no máximo 2min.
          const LEASE_MS = 2 * 60 * 1000;
          let leaseUntil = new Date(Date.now() + LEASE_MS).toISOString();
          const { data: claimed, error: leaseErr } = await supabaseAdmin
            .from("wa_conversations")
            .update({ ai_debounce_until: leaseUntil })
            .eq("id", conv.id)
            .eq("ai_debounce_until", conv.ai_debounce_until)
            .select("id")
            .maybeSingle(); // guard: só pega se ninguém já empurrou
          if (leaseErr || !claimed) {
            console.warn(`[dispatch-ai-debounced] falha ao pegar lease ${conv.id}:`, leaseErr);
            continue;
          }

          const heartbeat = setInterval(() => {
            const anterior = leaseUntil;
            const proximo = new Date(Date.now() + LEASE_MS).toISOString();
            leaseUntil = proximo;
            void supabaseAdmin
              .from("wa_conversations")
              .update({ ai_debounce_until: proximo })
              .eq("id", conv.id)
              .eq("ai_debounce_until", anterior);
          }, 45_000);


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

            // Sucesso. Como o webhook agora PRESERVA o lease (pra não disparar
            // dois runs simultâneos), qualquer mensagem que chegou durante o
            // processamento ficou sem agendamento. Então: se existe mensagem do
            // cliente ainda sem resposta, reagenda em 45s; caso contrário zera.
            const { data: ultimasPos } = await supabaseAdmin
              .from("wa_messages")
              .select("direction, sender, created_at")
              .eq("conversation_id", conv.id)
              .order("created_at", { ascending: false })
              .limit(10);
            const inPos = (ultimasPos ?? []).find((m) => m.direction === "inbound");
            const outPos = (ultimasPos ?? []).find(
              (m) => m.direction === "outbound" && m.sender !== "system",
            );
            const pendente =
              !!inPos && (!outPos || new Date(inPos.created_at) > new Date(outPos.created_at));
            await supabaseAdmin
              .from("wa_conversations")
              .update({
                ai_debounce_until: pendente
                  ? new Date(Date.now() + 45_000).toISOString()
                  : null,
              })
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
