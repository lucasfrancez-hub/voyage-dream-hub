import { createFileRoute } from "@tanstack/react-router";

/**
 * Rodada seguinte da entrega das opções de voo.
 *
 * Chamada pelo próprio sistema logo depois que uma opção é entregue: roda em
 * uma execução nova (tempo zerado) e entrega a próxima opção pendente daquela
 * cotação. É o que garante as 2-3 opções mesmo quando cada arte demora.
 *
 * Espera no máximo 20s pelo intervalo progressivo; se ainda não chegou a hora,
 * reencadeia (limitado pela profundidade) e o cron de 1 min segue como rede de
 * segurança.
 */
export const Route = createFileRoute("/api/public/hooks/flight-cards-continue")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: {
          conversation_id?: string;
          wa_phone?: string;
          protocolo_id?: string | null;
          protocol_opened_at?: string | null;
          quote_id?: string | null;
          depth?: number;
          delay_ms?: number;
        } = {};
        try {
          body = (await request.json()) as typeof body;
        } catch {
          return Response.json({ ok: false, error: "payload inválido" }, { status: 400 });
        }
        const { conversation_id, wa_phone } = body;
        if (!conversation_id || !wa_phone) {
          return Response.json({ ok: false, error: "dados insuficientes" }, { status: 400 });
        }

        const espera = Math.min(Math.max(Number(body.delay_ms ?? 0), 0), 20_000);
        if (espera > 0) await new Promise((r) => setTimeout(r, espera));

        const { processNextFlightQuoteOption } = await import(
          "@/lib/whatsapp/flight-delivery.server"
        );
        const depth = Number(body.depth ?? 1);
        const r = await processNextFlightQuoteOption({
          quote_id: body.quote_id ?? null,
          conversation_id,
          protocolo_id: body.protocolo_id ?? null,
          depth,
        }).catch((e: unknown) => {
          console.error("[flight-cards-continue]", (e as Error)?.message ?? e);
          return null;
        });

        // Ainda não era a hora desta opção: reencadeia em vez de largar no cron.
        if (r && !r.completed && !r.chained_next_round && r.delivered === 0 && r.quote_id) {
          const { agendarProximaRodada } = await import(
            "@/lib/whatsapp/flight-cards-continue.server"
          );
          await agendarProximaRodada({
            conversation_id,
            wa_phone,
            protocolo_id: body.protocolo_id ?? null,
            protocol_opened_at: body.protocol_opened_at ?? null,
            quote_id: r.quote_id,
            depth: depth + 1,
            delay_ms: 20_000,
          });
        }

        return Response.json({ ok: true, delivered: r?.delivered ?? 0, completed: r?.completed ?? false });
      },
    },
  },
});
