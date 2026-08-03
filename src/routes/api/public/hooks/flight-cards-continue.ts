import { createFileRoute } from "@tanstack/react-router";

/**
 * Rodada seguinte da entrega das opções de voo.
 *
 * Chamada pelo próprio sistema logo depois que uma opção é entregue: roda em
 * uma execução nova (tempo zerado) e manda a próxima arte pendente daquela
 * cotação. É o que garante 2-3 opções na conversa mesmo quando cada arte
 * demora pra ser gerada.
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
          depth?: number;
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

        const { sendPendingFlightCards } = await import(
          "@/lib/whatsapp/flight-cards-pending.server"
        );
        const r = await sendPendingFlightCards(
          conversation_id,
          wa_phone,
          60 * 60 * 1000,
          body.protocol_opened_at ?? null,
          body.protocolo_id ?? null,
          false,
          26_000,
          undefined,
          true, // continuação: não espera o intervalo entre rodadas
          Number(body.depth ?? 1),
        ).catch((e: unknown) => {
          console.error("[flight-cards-continue]", (e as Error)?.message ?? e);
          return { sent: 0 };
        });

        return Response.json({ ok: true, sent: r.sent ?? 0 });
      },
    },
  },
});
