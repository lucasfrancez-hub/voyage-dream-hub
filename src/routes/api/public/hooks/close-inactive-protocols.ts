import { createFileRoute } from "@tanstack/react-router";
import { isInstagramConversation } from "@/lib/instagram/bridge.server";

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

        // Se o protocolo está aguardando o time comercial (último handoff foi
        // escalada pra humano — seja to_mode=human, seja to_mode=ai com reason
        // "aguardando_humano:*" que a IA usa quando continua respondendo até
        // alguém assumir), NÃO contar como inatividade. O relógio só volta a
        // andar depois que a gente (humano) responder.
        async function isAwaitingHuman(conversationId: string): Promise<boolean> {
          const { data: lastHandoff } = await supabaseAdmin
            .from("wa_handoff_events")
            .select("to_mode, reason, created_at")
            .eq("conversation_id", conversationId)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (!lastHandoff) return false;
          const awaiting =
            lastHandoff.to_mode === "human" ||
            (typeof lastHandoff.reason === "string" &&
              lastHandoff.reason.startsWith("aguardando_humano"));
          if (!awaiting) return false;
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
            // Instagram Direct: nunca avisar nem encerrar por inatividade.
            if (isInstagramConversation(conv.wa_phone)) {
              skipped.push(proto.numero);
              continue;
            }

            const avisoMsg =
              `Notei que ficou um tempinho sem responder por aqui. Vou encerrar o atendimento por aqui, mas fique tranquila(o), qualquer coisa é só mandar mensagem que a gente volta a tratar do assunto de onde parou, ok? 😊`;


            const sentAviso = await sendWhatsAppBubbles(conv.wa_phone, avisoMsg);

            // Registra sem tocar em last_activity_at (skip_protocolo=true)
            await saveMessage({
              conversation_id: proto.conversation_id,
              direction: "outbound",
              sender: "system",
              content: avisoMsg,
              wa_message_id: sentAviso[0]?.id ?? null,
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
            if (!(await lastMessageFromUs(proto.conversation_id))) {
              skipped.push(proto.numero);
              continue;
            }

            const { data: conv } = await supabaseAdmin
              .from("wa_conversations")
              .select("wa_phone, funnel_stage, tags")
              .eq("id", proto.conversation_id)
              .maybeSingle();
            if (!conv) continue;

            // CRÍTICO: fecha o protocolo ANTES de qualquer envio/IA, e de forma
            // ATÔMICA — o encerramento e a limpeza de TODO o runtime (agente,
            // prompt, produto, origem, cotação, referência, reply, job) acontecem
            // na mesma transação. Se outro cron já fechou, `closed` volta false.
            const { closeProtocolAndResetRuntime } = await import(
              "@/lib/whatsapp/protocol-runtime.server"
            );
            const res = await closeProtocolAndResetRuntime({
              protocolo_id: proto.id,
              status: "encerrado_inatividade",
              reason: "inatividade_2h",
            });
            if (!res.ok) {
              console.error("[inactivity] falha ao encerrar protocolo", proto.numero);
              continue;
            }
            if (res.closed === false) {
              // Já foi fechado por outro ciclo — não reenvia.
              skipped.push(proto.numero);
              continue;
            }

            await supabaseAdmin
              .from("wa_protocolos")
              .update({ funnel_stage_final: conv.funnel_stage ?? null })
              .eq("id", proto.id);

            // Protocolo encerrado → tira a marcação de "aguardando humano".
            const closeTags = ((conv.tags ?? []) as string[]).filter(
              (t) => t !== "aguardando_humano" && t !== "escalada_implicita" && t !== "transferencia_nominal",
            );
            await supabaseAdmin
              .from("wa_conversations")
              .update({ tags: closeTags })
              .eq("id", proto.conversation_id);


            const encerramentoMsg = `Atendimento encerrado, protocolo ${proto.numero}.`;

            const sentEncerramento = await sendWhatsAppBubbles(conv.wa_phone, encerramentoMsg);

            await saveMessage({
              conversation_id: proto.conversation_id,
              direction: "outbound",
              sender: "system",
              content: encerramentoMsg,
              wa_message_id: sentEncerramento[0]?.id ?? null,
              skip_protocolo: true,
            });

            // Gera resumo automático da conversa via IA (best-effort, pode travar/falhar).
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
                // Timeout defensivo pra IA não travar o cron
                const controller = new AbortController();
                const t = setTimeout(() => controller.abort(), 20_000);
                const { text } = await generateText({
                  model: gateway("google/gemini-2.5-flash-lite"),
                  abortSignal: controller.signal,
                  prompt:
                    "Resuma a conversa abaixo entre um cliente da VIA AIR e o atendimento (IA/humano). " +
                    "Escreva em português, tom objetivo, em no máximo 6 bullets curtos. " +
                    "Inclua: o que o cliente queria, informações importantes trocadas (datas, valores, localizadores, pedidos), " +
                    "o que foi resolvido e pendências (se houver). Não inclua saudações nem cabeçalho.\n\n" +
                    "CONVERSA:\n" + transcript,
                });
                clearTimeout(t);
                const resumo = text.trim();
                if (resumo) {
                  await supabaseAdmin
                    .from("wa_protocolos")
                    .update({ resumo_conversa: resumo })
                    .eq("id", proto.id);
                }
              }
            } catch (err) {
              console.error("[inactivity] resumo:", (err as Error).message);
            }

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
