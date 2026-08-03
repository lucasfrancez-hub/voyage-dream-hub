/**
 * Envia as artes de uma cotação de voo que ficou pendente (cotou mas nunca
 * entregou). É o ÚNICO caminho de envio de arte de voo — o agente e o
 * watchdog chamam esta função, nunca renderizam por conta própria.
 *
 * Regras anti-duplicidade:
 * - faz um "claim" atômico da cotação (marca cards_sent_at ANTES de enviar),
 *   então watchdog e agente nunca disparam as mesmas artes em paralelo;
 * - respeita as impressões digitais (sent_fingerprints) já entregues nesta
 *   conversa, então uma opção já enviada nunca é reenviada;
 * - grava a impressão digital LOGO APÓS cada envio (não no fim do laço), então
 *   um timeout no meio do caminho nunca gera arte repetida na próxima rodada;
 * - se nada for enviado, libera o claim pra próxima tentativa.
 *
 * Entrega em ETAPAS (uma arte por rodada): cada chamada renderiza e envia UMA
 * opção e devolve o controle. O cron (watchdog, 1x/min) chama de novo pra
 * mandar a próxima. Assim o worker nunca fica dormindo 60s e a numeração das
 * opções mantém a ordem encontrada, sem rótulo numérico na legenda.
 */
type LegLite = { cia?: string; voo?: string; partida?: string };
type OptLite = {
  opcao: number;
  total?: number;
  ida?: LegLite | null;
  volta?: LegLite | null;
};

/**
 * POLÍTICA DE QUANTIDADE (Central de Especialistas):
 * - preferencialmente 3 opções por cotação;
 * - mínimo 2 opções;
 * - 1 opção só quando o motor realmente não tiver outra alternativa válida.
 */
export const MAX_OPCOES = 3; // meta por cotação
export const MIN_OPCOES = 2; // piso: nunca parar em 1 havendo alternativa
const INTERVALO_MS = 2_000; // espaçamento mínimo entre RODADAS de envio
const ENTRE_CARDS_MS = 1_500; // espaçamento entre as artes DENTRO do mesmo lote
/**
 * UMA opção por execução. Gerar e mandar 2-3 artes na mesma execução estourava
 * o tempo do worker: o processo morria depois da primeira imagem e o cliente
 * recebia uma opção só. Agora cada rodada entrega uma opção e dispara a
 * próxima em execução nova (flight-cards-continue).
 */
const CARDS_POR_RODADA = 1;
const CLAIM_TRAVADO_MS = 45_000; // claim preso (worker caiu no render) → destrava
/**
 * Prazo BRANDO da arte quando ela ainda não está no cache: passou disso, a
 * opção vai em TEXTO na hora e o card daquela opção é CANCELADO (nunca manda
 * a mesma cotação duas vezes, em texto e depois em imagem).
 */
const SOFT_DEADLINE_MS = 6_000;



const fingerprint = (o: OptLite): string =>
  [o.ida?.cia, o.ida?.voo, o.ida?.partida, o.volta?.cia, o.volta?.voo, o.volta?.partida, Math.round(Number(o.total ?? 0))]
    .map((v) => String(v ?? "-"))
    .join("|");

/**
 * Quantas opções esta cotação PREVÊ entregar: a meta da política (3) limitada
 * ao que a pesquisa realmente trouxe. Conta OPÇÕES, não horários distintos —
 * dois voos que saem no mesmo horário (companhias/tarifas/volta diferentes)
 * são duas opções válidas e as duas precisam chegar ao cliente.
 */
export function previstasNaCotacao(todas: OptLite[], limite: number): number {
  return Math.max(1, Math.min(limite, todas.length));
}


/**
 * Conclusão da cotação: independe do formato. Card e texto entram na mesma
 * lista de entregues (sent_fingerprints), então card+texto+card = completa.
 */
export function cotacaoConcluida(totalEntregues: number, previstas: number): boolean {
  return totalEntregues >= previstas;
}


/**
 * Momento do último card realmente registrado na conversa. É usado somente
 * para manter o intervalo entre as duas artes, sem depender da legenda.
 */
async function ultimoEnvio(
  conversationId: string,
  desde: string,
): Promise<{ ultimoEm: number | null }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("wa_messages")
    .select("content, created_at")
    .eq("conversation_id", conversationId)
    .eq("direction", "outbound")
    .gte("created_at", desde)
    .order("created_at", { ascending: false })
    .limit(40);
  let ultimoEm: number | null = null;
  for (const m of (data ?? []) as { content: string | null; created_at: string }[]) {
    if (!/\[\[media:image/i.test(m.content ?? "")) continue;
    const t = new Date(m.created_at).getTime();
    if (ultimoEm === null || t > ultimoEm) ultimoEm = t;
  }
  return { ultimoEm };
}

/** Chave de horário: usada pra não mandar duas opções que saem no mesmo horário. */
const horarioIda = (o: OptLite): string => String(o.ida?.partida ?? "").slice(0, 16);

/**
 * COMPATIBILIDADE: todos os caminhos de entrega (agente, watchdog, cron,
 * reenvio, pós-pesquisa) passam pela MESMA função central
 * `processNextFlightQuoteOption()` — ver flight-delivery.server.ts.
 * Esta função continua existindo só para não quebrar os chamadores antigos.
 */
export async function sendPendingFlightCards(
  conversationId: string,
  waPhone: string,
  maxAgeMs = 60 * 60 * 1000,
  protocolOpenedAt?: string | null,
  protocolId?: string | null,
  /** true = reenvio pedido pelo cliente ("não recebi"): entrega já. */
  force = false,
  /** @deprecated o prazo agora é por opção (6s de card, senão texto). */
  renderBudgetMs = 26_000,
  /** Teto de opções desta cotação. */
  limiteOpcoes = MAX_OPCOES,
  /** Pedido explícito do cliente: entrega já, sem esperar o intervalo. */
  ignorarIntervalo = false,
  /** Profundidade do encadeamento entre rodadas. */
  depth = 0,
): Promise<{ sent: number; quote_id?: string }> {
  void maxAgeMs;
  void protocolOpenedAt;
  void renderBudgetMs;
  const { processNextFlightQuoteOption } = await import("./flight-delivery.server");
  const r = await processNextFlightQuoteOption({
    conversation_id: conversationId,
    protocolo_id: protocolId ?? null,
    imediato: force || ignorarIntervalo,
    depth,
    meta: limiteOpcoes,
  });
  void waPhone;
  return { sent: r.delivered, quote_id: r.quote_id ?? undefined };
}


/**
 * Quantas opções da cotação ATIVA ainda não foram apresentadas ao cliente.
 * Base da política "tem mais opções?": havendo restante, entrega sem nova
 * pesquisa; zerado, o agente refaz a pesquisa ampliando os critérios.
 */
export async function countUnsentOptions(
  conversationId: string,
  protocolId?: string | null,
): Promise<{ quote_id: string | null; enviadas: number; restantes: number }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  let q = supabaseAdmin
    .from("wa_flight_quotes")
    .select("id, payload, sent_fingerprints, cancelled_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(1);
  if (protocolId) q = q.eq("protocolo_id", protocolId);
  const { data } = await q;
  const row = (data ?? [])[0] as
    | { id: string; payload: unknown; sent_fingerprints?: unknown; cancelled_at?: string | null }
    | undefined;
  if (!row || row.cancelled_at) return { quote_id: null, enviadas: 0, restantes: 0 };
  const todas = ((row.payload as { opcoes?: OptLite[] } | null)?.opcoes ?? []) as OptLite[];
  const fps = new Set<string>(
    Array.isArray(row.sent_fingerprints) ? (row.sent_fingerprints as unknown[]).map(String) : [],
  );
  const restantes = todas.filter((o) => !fps.has(fingerprint(o))).length;
  return { quote_id: row.id, enviadas: fps.size, restantes };
}

/**
 * Entrega imediata das opções ainda não apresentadas (Caso 1 da política de
 * quantidade). Não chama o motor de busca.
 */
export async function sendRemainingOptions(
  conversationId: string,
  waPhone: string,
  protocolId?: string | null,
  protocolOpenedAt?: string | null,
): Promise<{ sent: number; restantes_antes: number }> {
  const { enviadas, restantes } = await countUnsentOptions(conversationId, protocolId);
  if (restantes <= 0) return { sent: 0, restantes_antes: 0 };
  const r = await sendPendingFlightCards(
    conversationId,
    waPhone,
    60 * 60 * 1000,
    protocolOpenedAt ?? null,
    protocolId ?? null,
    false,
    26_000,
    enviadas + 1, // libera exatamente a próxima opção ainda não apresentada
    true, // pedido explícito: sem espera entre artes
  );
  console.log(
    JSON.stringify({
      event: "flight_options_more_requested",
      conversation_id: conversationId,
      protocolo_id: protocolId ?? null,
      already_sent: enviadas,
      remaining_before: restantes,
      sent_now: r.sent,
      new_search: false,
      at: new Date().toISOString(),
    }),
  );
  return { sent: r.sent, restantes_antes: restantes };
}
