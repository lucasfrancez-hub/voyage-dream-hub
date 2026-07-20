import { createFileRoute } from "@tanstack/react-router";

/**
 * Robô de inatividade dos protocolos.
 *
 * Roda a cada 10 min via pg_cron. Dois estágios:
 *
 *   1) AVISO (60 min sem atividade): envia um balão avisando que o atendimento
 *      vai ser encerrado se não houver resposta, e marca `inactivity_warned_at`.
 *      Não fecha ainda.
 *
 *   2) ENCERRAMENTO (mais 60 min depois do aviso, sem resposta): fecha o
 *      protocolo, gera resumo via IA e envia balão curto de encerramento.
 *
 * Se o cliente responder antes, saveMessage() bumpa `last_activity_at`
 * e o próximo ciclo do cron ignora esse protocolo. Caso volte a ficar inativo,
 * um novo aviso é enviado (o campo é resetado quando o protocolo reabre).

 */
export const Route = createFileRoute("/api/public/hooks/close-inactive-protocols")({
  server: {
    handlers: {
      POST: async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { saveMessage } = await import("@/lib/whatsapp/conversation.server");
        const { sendWhatsAppBubbles } = await import("@/lib/whatsapp/send.server");

        const now = Date.now();
        const warnCutoff = new Date(now - 60 * 60 * 1000).toISOString(); // 1h sem atividade → aviso
        const closeAfterWarn = new Date(now - 60 * 60 * 1000).toISOString(); // +1h após o aviso → encerra


        const warned: string[] = [];
        const closed: string[] = [];
        const skipped: string[] = [];

        // Se o protocolo está aguardando o time comercial (último handoff → human
        // sem resposta humana desde então), NÃO contar como inatividade. O relógio
        // só volta a andar depois que a gente responder.
        async function isAwaitingHuman(conversationId: string): Promise<boolean> {
          const { data: lastHandoff } = await supabaseAdmin
            .from("wa_handoff_events")
            .select("to_mode, created_at")
            .eq("conversation_id", conversationId)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (!lastHandoff || lastHandoff.to_mode !== "human") return false;
          const { count } = await supabaseAdmin
            .from("wa_messages")
            .select("id", { count: "exact", head: true })
            .eq("conversation_id", conversationId)
            .eq("sender", "human")
            .gt("created_at", lastHandoff.created_at);
          return (count ?? 0) === 0;
        }

        // Só encerra/avisa se a bola estiver com o cliente (última mensagem foi
        // nossa e ele não respondeu). Se a última mensagem for do cliente
        // esperando resposta nossa, NÃO encerra — deixa aberto até respondermos.
        async function lastMessageFromUs(conversationId: string): Promise<boolean> {
          const { data: last } = await supabaseAdmin
            .from("wa_messages")
            .select("direction")
            .eq("conversation_id", conversationId)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (!last) return false;
          return last.direction === "outbound";
        }


        // ============ 1) AVISO (60min sem resposta) ============
        const { data: toWarn, error: warnErr } = await supabaseAdmin
          .from("wa_protocolos")
          .select("id, numero, conversation_id")
          .eq("status", "aberto")
          .is("inactivity_warned_at", null)
          .lt("last_activity_at", warnCutoff)
          .limit(50);



        if (warnErr) {
          console.error("[inactivity] warn query error:", warnErr.message);
        } else {
          for (const proto of toWarn ?? []) {
            if (await isAwaitingHuman(proto.conversation_id)) {
              skipped.push(proto.numero);
              continue;
            }
            if (!(await lastMessageFromUs(proto.conversation_id))) {
              skipped.push(proto.numero);
              continue;
            }

            const { data: conv } = await supabaseAdmin
              .from("wa_conversations")
              .select("wa_phone")
              .eq("id", proto.conversation_id)
              .maybeSingle();
            if (!conv) continue;

            const avisoMsg =
              `Notei que ficou um tempinho sem responder por aqui. Vou encerrar o atendimento por aqui, mas fique tranquila(o), qualquer coisa é só mandar mensagem que a gente volta a tratar do assunto de onde parou, ok? 😊`;


            await sendWhatsAppBubbles(conv.wa_phone, avisoMsg);

            // Registra sem tocar em last_activity_at (skip_protocolo=true)
            await saveMessage({
              conversation_id: proto.conversation_id,
              direction: "outbound",
              sender: "system",
              content: avisoMsg,
              skip_protocolo: true,
            });

            await supabaseAdmin
              .from("wa_protocolos")
              .update({ inactivity_warned_at: new Date().toISOString() })
              .eq("id", proto.id);

            warned.push(proto.numero);
          }
        }

        // ============ 2) ENCERRAMENTO (+1h após o aviso) ============
        const { data: toClose, error: closeErr } = await supabaseAdmin
          .from("wa_protocolos")
          .select("id, numero, conversation_id")
          .eq("status", "aberto")
          .not("inactivity_warned_at", "is", null)
          .lt("inactivity_warned_at", closeAfterWarn)
          .lt("last_activity_at", closeAfterWarn)
          .limit(50);

        if (closeErr) {
          console.error("[inactivity] close query error:", closeErr.message);
        } else {
          for (const proto of toClose ?? []) {
            if (await isAwaitingHuman(proto.conversation_id)) {
              skipped.push(proto.numero);
              continue;
            }
            const { data: conv } = await supabaseAdmin
              .from("wa_conversations")
              .select("wa_phone, funnel_stage")
              .eq("id", proto.conversation_id)
              .maybeSingle();
            if (!conv) continue;

            const encerramentoMsg = `Atendimento encerrado, protocolo ${proto.numero}.`;


            await sendWhatsAppBubbles(conv.wa_phone, encerramentoMsg);

            await saveMessage({
              conversation_id: proto.conversation_id,
              direction: "outbound",
              sender: "system",
              content: encerramentoMsg,
              skip_protocolo: true,
            });

            // Gera resumo automático da conversa via IA (não bloqueia se falhar)
            let resumoConversa: string | null = null;
            try {
              const { data: msgs } = await supabaseAdmin
                .from("wa_messages")
                .select("direction, sender, content")
                .eq("protocolo_id", proto.id)
                .order("created_at", { ascending: true })
                .limit(300);
              const transcript = (msgs ?? [])
                .filter((m) => m.content && m.content.trim().length > 0)
                .map((m) => {
                  const who = m.direction === "inbound"
                    ? "Cliente"
                    : m.sender === "system"
                      ? "Sistema"
                      : m.sender === "human"
                        ? "Atendente"
                        : "IA";
                  return `${who}: ${m.content}`;
                })
                .join("\n");

              const apiKey = process.env.LOVABLE_API_KEY;
              if (transcript.trim().length > 0 && apiKey) {
                const { generateText } = await import("ai");
                const { createLovableAiGatewayProvider } = await import("@/lib/ai-gateway.server");
                const gateway = createLovableAiGatewayProvider(apiKey);
                const { text } = await generateText({
                  model: gateway("openai/gpt-5.5"),
                  prompt:
                    "Resuma a conversa abaixo entre um cliente da VIA AIR e o atendimento (IA/humano). " +
                    "Escreva em português, tom objetivo, em no máximo 6 bullets curtos. " +
                    "Inclua: o que o cliente queria, informações importantes trocadas (datas, valores, localizadores, pedidos), " +
                    "o que foi resolvido e pendências (se houver). Não inclua saudações nem cabeçalho.\n\n" +
                    "CONVERSA:\n" + transcript,
                });
                resumoConversa = text.trim() || null;
              }
            } catch (err) {
              console.error("[inactivity] resumo:", (err as Error).message);
            }

            await supabaseAdmin
              .from("wa_protocolos")
              .update({
                status: "encerrado_inatividade",
                closed_at: new Date().toISOString(),
                funnel_stage_final: conv.funnel_stage ?? null,
                resumo_conversa: resumoConversa,
              })
              .eq("id", proto.id);

            await supabaseAdmin
              .from("wa_conversations")
              .update({ protocolo_ativo_id: null })
              .eq("id", proto.conversation_id);

            closed.push(proto.numero);
          }
        }

        return new Response(JSON.stringify({ ok: true, warned, closed, skipped }), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
