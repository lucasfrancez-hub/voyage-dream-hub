/**
 * CONTINUAÇÃO DA ENTREGA DAS OPÇÕES.
 *
 * Cada rodada de envio entrega UMA opção e devolve o controle. Renderizar e
 * mandar 3 artes na mesma execução estourava o tempo do worker: o processo
 * morria depois da primeira imagem e o cliente recebia uma opção só.
 *
 * Aqui a rodada seguinte é disparada em uma EXECUÇÃO NOVA (chamada HTTP pro
 * próprio site), com orçamento de tempo zerado. Assim a cotação vai até o fim
 * (2 ou 3 opções) mesmo quando cada arte demora.
 */
const PUBLIC_BASE = "https://pedidos.viaair.tur.br";

/** Profundidade máxima do encadeamento (meta de 3 opções por cotação). */
export const MAX_CONTINUACOES = 4;

export async function continuarEnvioDeOpcoes(params: {
  conversation_id: string;
  wa_phone: string;
  protocolo_id?: string | null;
  protocol_opened_at?: string | null;
  depth: number;
}): Promise<void> {
  if (params.depth >= MAX_CONTINUACOES) return;
  try {
    const res = await fetch(`${PUBLIC_BASE}/api/public/hooks/flight-cards-continue`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(params),
    });
    console.log(
      JSON.stringify({
        event: "flight_cards_continuation",
        conversation_id: params.conversation_id,
        depth: params.depth,
        status: res.status,
        at: new Date().toISOString(),
      }),
    );
  } catch (e) {
    console.warn(
      "[flight-cards] falha ao encadear a próxima opção:",
      (e as Error)?.message ?? e,
    );
  }
}
