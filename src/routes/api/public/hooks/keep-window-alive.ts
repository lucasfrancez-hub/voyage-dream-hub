import { createFileRoute } from "@tanstack/react-router";

/**
 * Robô "janela de 24h" (Meta / erro 131047).
 *
 * A Meta bloqueia texto livre quando o cliente não responde há mais de 24h.
 * Pra atendimento em andamento (cotação, aguardando retorno, etc.) isso trava
 * tudo. Então, ANTES de estourar — por volta de 23h30 depois da última
 * mensagem do cliente — a gente manda um retorno curto e humano ("conseguiu
 * dar uma olhada nas opções?"). Se o cliente responder, a janela reabre por
 * mais 24h e nenhum envio fica preso.
 *
 * Roda a cada 10 min via pg_cron.
 *
 * Regras:
 *  - só protocolos abertos (atendimento vivo);
 *  - só quando a última mensagem do cliente está entre 23h05 e 23h55 atrás;
 *  - um único toque por janela (dedupe pelo marcador na própria mensagem);
 *  - se o cliente é quem está esperando resposta nossa, não manda nada — nesse
 *    caso o problema é outro (a gente é que precisa responder).
 */

const JANELA_MS = 24 * 60 * 60 * 1000;
const CEDO_MS = 23 * 60 * 60 * 1000 + 5 * 60 * 1000; // 23h05
const TARDE_MS = 23 * 60 * 60 * 1000 + 55 * 60 * 1000; // 23h55

const TOQUES = [
  "Oi! Passando aqui só pra saber se vc conseguiu dar uma olhada no que te mandei 😊",
  "Oi, tudo bem? Conseguiu ver as informações que te enviei? Qualquer dúvida é só falar",
  "Oi! Deu pra analisar aí? Se quiser, ajusto alguma coisa pra ficar melhor pra vc",
  "Passando pra saber se ficou alguma dúvida do que conversamos. Tô por aqui 😉",
];

export const Route = createFileRoute("/api/public/hooks/keep-window-alive")({
  server: {
    handlers: {
      POST: async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { saveMessage } = await import("@/lib/whatsapp/conversation.server");
        const { sendWhatsAppBubbles } = await import("@/lib/whatsapp/send.server");

        const agora = Date.now();
        const tocados: string[] = [];
        const pulados: string[] = [];

        const { data: abertos, error } = await supabaseAdmin
          .from("wa_protocolos")
          .select("id, numero, conversation_id")
          .eq("status", "aberto")
          .limit(200);

        if (error) {
          console.error("[janela-24h] erro ao listar protocolos:", error.message);
          return Response.json({ ok: false, error: error.message }, { status: 500 });
        }

        for (const proto of abertos ?? []) {
          const { data: ultima } = await supabaseAdmin
            .from("wa_messages")
            .select("created_at, direction, sender, content")
            .eq("conversation_id", proto.conversation_id)
            .order("created_at", { ascending: false })
            .limit(30);

          const msgs = ultima ?? [];
          const entrada = msgs.find((m) => m.direction === "inbound");
          if (!entrada) continue;

          const idade = agora - new Date(entrada.created_at as string).getTime();
          if (idade < CEDO_MS || idade > TARDE_MS) continue;
          if (idade >= JANELA_MS) continue;

          // A bola tem que estar com o cliente: se a última mensagem é dele,
          // quem está devendo resposta somos nós — não é caso de keep-alive.
          if (msgs[0]?.direction === "inbound") {
            pulados.push(proto.numero);
            continue;
          }

          // Dedupe: já mandamos um toque depois dessa última entrada?
          const jaTocou = msgs.some(
            (m) =>
              m.direction === "outbound" &&
              new Date(m.created_at as string).getTime() > new Date(entrada.created_at as string).getTime() + CEDO_MS,
          );
          if (jaTocou) {
            pulados.push(proto.numero);
            continue;
          }

          const { data: conv } = await supabaseAdmin
            .from("wa_conversations")
            .select("wa_phone")
            .eq("id", proto.conversation_id)
            .maybeSingle();
          if (!conv?.wa_phone) continue;

          const texto = TOQUES[Math.floor(Math.random() * TOQUES.length)];
          const enviado = await sendWhatsAppBubbles(conv.wa_phone, texto);

          await saveMessage({
            conversation_id: proto.conversation_id,
            direction: "outbound",
            sender: "system",
            content: texto,
            wa_message_id: enviado[0]?.id ?? null,
            skip_protocolo: true,
          });

          tocados.push(proto.numero);
          await new Promise((r) => setTimeout(r, 400));
        }

        console.log(`[janela-24h] keep-alive: ${tocados.length} enviado(s), ${pulados.length} pulado(s)`);
        return Response.json({ ok: true, tocados, pulados });
      },
    },
  },
});
