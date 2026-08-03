/**
 * ENCADEAMENTO DAS RODADAS DE ENTREGA.
 *
 * Cada rodada entrega UMA opção e devolve o controle. Renderizar e mandar 3
 * artes na mesma execução estourava o tempo do worker: o processo morria depois
 * da primeira imagem e o cliente recebia uma opção só.
 *
 * A rodada seguinte roda em EXECUÇÃO NOVA (chamada HTTP pro próprio site), com
 * orçamento de tempo zerado. O cron/watchdog continua como rede de segurança —
 * o next_run_at gravado na cotação garante a retomada mesmo se esta chamada
 * falhar.
 */
const PUBLIC_BASE = "https://pedidos.viaair.tur.br";

/** Profundidade máxima do encadeamento (meta de 3 opções por cotação). */
export const MAX_CONTINUACOES = 5;

export type ProximaRodada = {
  conversation_id: string;
  wa_phone: string;
  protocolo_id?: string | null;
  protocol_opened_at?: string | null;
  quote_id?: string | null;
  depth: number;
  /** Intervalo progressivo desejado (30-90s). A rodada nova respeita next_run_at. */
  delay_ms?: number;
};

/**
 * Agenda a próxima rodada. Não dorme: dispara a execução nova e devolve na
 * hora se conseguiu encadear (chained_next_round).
 */
export async function agendarProximaRodada(params: ProximaRodada): Promise<boolean> {
  if (params.depth >= MAX_CONTINUACOES) return false;
  try {
    const res = await fetch(`${PUBLIC_BASE}/api/public/hooks/flight-cards-continue`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(params),
    });
    console.log(
      JSON.stringify({
        event: "flight_delivery_chained",
        conversation_id: params.conversation_id,
        quote_id: params.quote_id ?? null,
        depth: params.depth,
        delay_ms: params.delay_ms ?? null,
        status: res.status,
        at: new Date().toISOString(),
      }),
    );
    return res.ok;
  } catch (e) {
    console.warn(
      "[flight-cards] falha ao encadear a próxima opção (cron assume):",
      (e as Error)?.message ?? e,
    );
    return false;
  }
}

/** Compatibilidade com os chamadores antigos. */
export async function continuarEnvioDeOpcoes(params: ProximaRodada): Promise<void> {
  await agendarProximaRodada(params);
}
