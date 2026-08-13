/**
 * TRIAGEM DA PRIMEIRA MENSAGEM
 *
 * Antes de qualquer saudação ou apresentação de consultor, olhamos a PRIMEIRA
 * mensagem do cliente e identificamos a intenção. Só existe um desvio possível
 * nesta fase: pedido CLARO de cotação/compra de PASSAGEM AÉREA avulsa, que vai
 * direto para a Central de Especialistas (Paula / Bruno), sem passar pelas
 * consultoras e sem transferência visível.
 *
 * Qualquer outra coisa — pacote, planejamento, destino, pedido existente,
 * reclamação, mensagem genérica ou dúvida — continua exatamente como hoje,
 * com as IAs consultoras.
 *
 * SERVER-ONLY.
 */
import { generateText } from "ai";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { recordHandoff, type WaConversation } from "./conversation.server";

const MODEL = "google/gemini-2.5-flash-lite";

/** Janela para considerar que o atendimento está começando agora. */
const JANELA_HORAS = 12;

export type TriageResult = { slug: string; brief: string } | null;

/* ── heurísticas de segurança (usadas antes e depois do modelo) ───────── */

/**
 * Normaliza a mensagem antes de qualquer regex: tira acento, baixa a caixa,
 * colapsa letras repetidas ("passaaagem" → "passagem") e junta espaços.
 * Assim erros comuns de digitação no WhatsApp não derrubam a triagem.
 */
export function normalizarTexto(s: string): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/(.)\1{2,}/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

// Sinais de que é PASSAGEM AÉREA avulsa. Tolerante a erros de digitação:
// "pasagem", "passagen", "vôo", "aerio", "bilhete aereo", "so o aereo".
const RX_AEREO =
  /(pas+ag[ea][nm]s?|pasage[nm]s?|\bvo+s?\b|\bvoo?s\b|a[eé]r[ei]?[oa]s?|bilhete\s*a[eé]re[oa]|trecho\s*a[eé]re[oa]|passagem\s*de\s*avi[aã]o|(viajar|ir|voar)\s*(de|no)\s*avi[aã]o|so\s*(o\s*)?a[eé]reo)/i;

// Sinais de que NÃO é aéreo avulso (pacote / viagem completa / pós-venda).
const RX_BLOQUEIO =
  /\b(pacote|pacotes|hotel|hoteis|hospedagem|resort|cruzeiro|navio|roteiro|ferias|lua de mel|excursao|all inclusive|aereo\s*\+\s*hotel|aereo e hotel|passeio|ingresso|disney|universal|seguro viagem|transfer|alug(ar|uel)|loca[çc][aã]o|carro|intercambio|meu pedido|minha reserva|localizador|check-?in|voucher|remarca\w*|reembols\w*|cancel\w*|reclama\w*|problema com|atraso do voo|bagagem extraviada)\b/i;


// Pedido de trecho aéreo dito sem a palavra "passagem": "quero ida e volta",
// "quero só ida". Sozinhos já indicam cotação de aéreo avulso.
const RX_TRECHO = /\b(ida\s*e\s*volta|(so|somente|apenas)\s*(a\s*)?ida|ida\s*simples)\b/i;

// Bate-volta dito de forma informal: "preciso ir e voltar no mesmo dia",
// "quero ir e voltar hoje", "bate volta", "vou e volto no mesmo dia",
// "quero ir cedo e voltar a noite". Sozinhas já são pedido de aéreo.
const RX_BATE_VOLTA =
  /(bate\s*-?\s*volta|\b(ir|vou|viajar|preciso ir|quero ir)\b[^.!?]{0,40}\bvolt(ar|o|a)\b[^.!?]{0,30}\b(no mesmo dia|mesmo dia|hoje|a noite|de noite|mais tarde|cedo)\b|\bir e voltar\b|\bvou e volto\b)/i;

// "Quero viajar para São Paulo", "preciso ir para Recife": destino sem menção a
// pacote/hotel. Pela regra de escopo, começa como intenção AÉREA — só vira
// pacote quando o cliente falar de pacote, hotel ou hospedagem.
const RX_VIAGEM_DESTINO =
  /\b(quero|queria|gostaria de|preciso|pretendo|vou)\s+(viajar|ir)\s+(pra|para|pro|ate)\s+\S/i;

// Deslocamento terrestre / passeio: "ida e volta" aqui NÃO é passagem aérea.
const RX_TERRESTRE =
  /\b(onibus|van|carro|traslado|transfer|translado|passeio|city tour|excursao de um dia|barco|trem)\b/i;

export function heuristicaAereo(textoBruto: string): boolean {
  const texto = normalizarTexto(textoBruto);
  const pedeTrecho = RX_TRECHO.test(texto) || RX_BATE_VOLTA.test(texto);
  const viagemDestino = RX_VIAGEM_DESTINO.test(texto);
  if (!RX_AEREO.test(texto) && !pedeTrecho && !viagemDestino) return false;
  // pacote / hotel / pós-venda tem prioridade sobre qualquer sinal de aéreo
  if (RX_BLOQUEIO.test(texto)) return false;
  // "ida e volta" / "quero ir para" de ônibus, van ou passeio não é aéreo.
  if (!RX_AEREO.test(texto) && RX_TERRESTRE.test(texto)) return false;
  return true;
}


/* ── classificação por IA ─────────────────────────────────────────────── */

type Classificacao = {
  aereo_avulso: boolean;
  origem?: string | null;
  destino?: string | null;
  data_ida?: string | null;
  data_volta?: string | null;
  adultos?: number | null;
  criancas?: number | null;
};

const PROMPT = `Você é um classificador de intenção de uma agência de viagens brasileira.
Recebe as mensagens mais recentes de um cliente no WhatsApp e responde SOMENTE um JSON.

Responda aereo_avulso = true quando o cliente quiser PESQUISAR, COTAR ou COMPRAR
PASSAGEM AÉREA — e também quando ele disser que quer VIAJAR/IR para um destino
sem mencionar pacote, hotel ou hospedagem.
Exemplos true: "quero uma passagem para São Paulo", "quero uma passagem",
"preciso de passagem", "quero um voo para Recife", "tem voo para Salvador?",
"quero passagem de Maringá para São Paulo", "quanto está a passagem para Salvador?",
"preciso comprar só o aéreo", "quero viajar de avião", "quero ida e volta",
"quero só ida", "quero ida simples", "quero viajar para São Paulo",
"quero ir para Recife", "preciso ir e voltar no mesmo dia", "bate-volta".
A simples presença de um destino NUNCA transforma o pedido em pacote.
Mas se a ida e volta for claramente por ônibus, van, carro, transfer ou passeio,
responda false.

Responda aereo_avulso = false quando houver intenção EXPLÍCITA de outro produto
ou de pós-venda:
- pacote, hotel, hospedagem, resort, "voo + hotel", viagem completa, roteiro, cruzeiro,
  passeios, ingressos, seguro, transfer, aluguel de carro;
- pedido existente, alteração, cancelamento, reclamação, emergência, check-in, voucher;
- mensagens genéricas sem destino nem produto: "oi", "boa tarde", "preciso de ajuda".

Ignore erros de digitação, falta de acento e abreviações: "pasagem", "passagen", "vôo",
"quero cotar aerio pra Recife" contam como pedido de passagem aérea.

Extraia também o que estiver EXPLÍCITO na mensagem (origem, destino, data_ida,
data_volta, adultos, criancas). Use null quando não houver.
REGRA CRÍTICA: origem é a cidade de EMBARQUE dita pelo próprio cliente. Se ele só
falou o destino, origem = null. NUNCA deduza a origem pelo destino, pela cidade da
agência, por conversas anteriores ou pelo aeroporto mais próximo.

Formato exato:
{"aereo_avulso":boolean,"origem":string|null,"destino":string|null,"data_ida":string|null,"data_volta":string|null,"adultos":number|null,"criancas":number|null}`;

async function classificar(texto: string): Promise<Classificacao> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) return { aereo_avulso: heuristicaAereo(texto) };
  try {
    const provider = createLovableAiGatewayProvider(key);
    const { text } = await generateText({
      model: provider(MODEL),
      system: PROMPT,
      prompt: texto.slice(0, 1200),
      temperature: 0,
    });
    const bruto = text.match(/\{[\s\S]*\}/)?.[0];
    if (!bruto) return { aereo_avulso: heuristicaAereo(texto) };
    const parsed = JSON.parse(bruto) as Classificacao;
    return parsed;
  } catch (err) {
    console.error("[triagem] classificação falhou:", err);
    return { aereo_avulso: heuristicaAereo(texto) };
  }
}

/* ── escolha determinística do especialista ───────────────────────────── */

/**
 * Escolhe o especialista de forma DETERMINÍSTICA (sem sorteio):
 * 1) menor carga — quem tem menos conversas ativas nas últimas 24h;
 * 2) empate → quem está há mais tempo sem receber atendimento (round-robin);
 * 3) empate → ordem alfabética do slug.
 * Assim o rodízio fica previsível e auditável.
 */
export async function pickEspecialista(): Promise<string> {
  const { data: espec } = await supabaseAdmin
    .from("ai_agents")
    .select("slug")
    .eq("equipe", "especialista")
    .eq("ativo", true)
    .order("slug");
  const slugs = (espec ?? []).map((a) => a.slug as string);
  if (!slugs.length) return "paula";
  if (slugs.length === 1) return slugs[0]!;

  const desde24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: recentes } = await supabaseAdmin
    .from("wa_conversations")
    .select("central_slug, central_desde")
    .in("central_slug", slugs)
    .gte("central_desde", desde24h);

  const carga = new Map<string, number>(slugs.map((s) => [s, 0]));
  const ultimo = new Map<string, number>(slugs.map((s) => [s, 0]));
  for (const r of recentes ?? []) {
    const s = r.central_slug as string | null;
    if (!s || !carga.has(s)) continue;
    carga.set(s, (carga.get(s) ?? 0) + 1);
    const t = r.central_desde ? new Date(r.central_desde as string).getTime() : 0;
    if (t > (ultimo.get(s) ?? 0)) ultimo.set(s, t);
  }

  const ordenados = [...slugs].sort((a, b) => {
    const ca = carga.get(a) ?? 0;
    const cb = carga.get(b) ?? 0;
    if (ca !== cb) return ca - cb; // menor carga primeiro
    const ua = ultimo.get(a) ?? 0;
    const ub = ultimo.get(b) ?? 0;
    if (ua !== ub) return ua - ub; // há mais tempo sem atender primeiro
    return a.localeCompare(b);
  });
  const escolhido = ordenados[0]!;
  console.log(
    `[triagem] especialista escolhido: ${escolhido} (carga 24h: ${slugs
      .map((s) => `${s}=${carga.get(s) ?? 0}`)
      .join(", ")})`,
  );
  return escolhido;
}

/* ── entrada pública ──────────────────────────────────────────────────── */


/**
 * Analisa as mensagens do cliente que ainda NÃO foram respondidas por uma IA
 * consultora ou por um atendente. Se houver pedido claro de passagem aérea,
 * grava o direcionamento para a Central e devolve o especialista.
 *
 * REGRESSÃO CORRIGIDA (ago/2026): antes bastava existir QUALQUER mensagem
 * outbound nas últimas 12h para desligar a triagem — inclusive avisos
 * automáticos do sistema (encerramento de protocolo, alerta de voo) e até
 * mensagens que a Meta recusou. Um cliente que voltasse pedindo passagem caía
 * na consultora e o pedido virava "pacote". Agora só conta como resposta
 * nossa uma mensagem de verdade (IA consultora ou atendente, entregue), e a
 * triagem reavalia sempre as mensagens novas que vieram depois dela.
 */
export async function triageFirstMessage(conv: WaConversation): Promise<TriageResult> {
  const desde = new Date(Date.now() - JANELA_HORAS * 60 * 60 * 1000).toISOString();

  // Última resposta REAL nossa (não conta aviso automático do sistema nem
  // mensagem que falhou no envio).
  const { data: respostas } = await supabaseAdmin
    .from("wa_messages")
    .select("created_at, sender, error")
    .eq("conversation_id", conv.id)
    .eq("direction", "outbound")
    .gte("created_at", desde)
    .order("created_at", { ascending: false })
    .limit(30);

  const ultimaResposta =
    (respostas ?? []).find(
      (m) => (m.sender ?? "") !== "system" && !m.error,
    )?.created_at ?? null;

  // Mensagens do cliente ainda não respondidas.
  let q = supabaseAdmin
    .from("wa_messages")
    .select("content")
    .eq("conversation_id", conv.id)
    .eq("direction", "inbound")
    .gte("created_at", ultimaResposta ?? desde);
  if (ultimaResposta) q = q.gt("created_at", ultimaResposta);
  const { data: entradas } = await q.order("created_at", { ascending: true }).limit(10);

  const texto = (entradas ?? [])
    .map((m) => (m.content ?? "").trim())
    .filter(Boolean)
    .join("\n")
    .trim();
  if (!texto) return null;

  // MAPA DE ATENDIMENTO (aba Fluxos): as palavras-chave desenhadas pela equipe
  // valem como gatilho oficial. Se o mapa aponta o texto pro Setor Aéreo, a
  // conversa vai pra Central mesmo que a heurística fixa não tenha reconhecido.
  const { rotearPeloFluxo } = await import("./flow.server");
  const { podeIrParaCentral } = await import("./escopo-produto");
  const rota = await rotearPeloFluxo(texto).catch(() => null);
  if (rota) {
    console.log(`[triagem] fluxo: "${rota.titulo}" → ${rota.setor} (gatilhos: ${rota.matched.join(", ")})`);
  }

  // TRAVA DE ESCOPO: pacote, hotel, aéreo + hotel ou qualquer serviço extra
  // NUNCA vai pra Paula/Bruno — nem por palavra-chave do mapa de fluxos.
  if (!podeIrParaCentral(texto)) {
    console.log(`[triagem] produto combinado detectado — segue com o consultor (conversa ${conv.id})`);
    return null;
  }

  if (rota?.setor === "aereo") return routeAereoParaCentral(conv, texto);
  // Mapa mandou pra Consultoria/Comercial: não é aéreo, sai da triagem.
  if (rota) return null;

  // Barreira dura antes de gastar chamada: sem menção a passagem/voo/aéreo,
  // ou com sinal de pacote/pós-venda, nem classificamos.
  if (!heuristicaAereo(texto)) return null;

  return routeAereoParaCentral(conv, texto);

}


/**
 * ROTEAMENTO ÚNICO PARA A CENTRAL.
 *
 * A triagem só ROTEIA: identifica a intenção aérea, monta o briefing com o que
 * o cliente já disse e entrega o atendimento a Paula ou Bruno. Ela nunca conduz
 * a coleta nem encaminha ao Comercial. Também é usada como rede de segurança
 * pelo runner quando a janela da triagem já tinha sido "gasta" por uma resposta
 * anterior nossa.
 */
export async function routeAereoParaCentral(
  conv: WaConversation,
  texto: string,
): Promise<TriageResult> {
  // A heurística dura já confirmou um pedido aéreo explícito. O classificador
  // serve apenas para extrair os campos; ele não pode rebaixar a intenção e
  // mandar a conversa de volta para pacote por uma classificação instável.
  const c = await classificar(texto);

  const linhas = ["✈️ Cotação de passagem aérea (pedido de aéreo identificado na triagem)"];
  // ORIGEM: só entra no briefing quando o CLIENTE disse a cidade de embarque.
  // Nunca preenchemos com cadastro, cidade da empresa ou hub mais próximo.
  if (c.origem) linhas.push(`📍 Origem (informada pelo cliente): ${c.origem}`);
  else linhas.push("📍 Origem: NÃO informada — pergunte de qual cidade ele vai embarcar (nunca presuma)");
  if (c.destino) linhas.push(`📍 Destino: ${c.destino}`);
  if (c.data_ida) linhas.push(`📅 Ida: ${c.data_ida}`);
  if (c.data_volta) linhas.push(`🔁 Volta: ${c.data_volta}`);
  if (c.adultos != null) linhas.push(`👥 Adultos: ${c.adultos}`);
  if (c.criancas != null) linhas.push(`🧒 Crianças: ${c.criancas}`);
  linhas.push(`💬 Mensagem do cliente: "${texto.slice(0, 300)}"`);
  const brief = linhas.join("\n");

  const slug = await pickEspecialista();

  await supabaseAdmin
    .from("wa_conversations")
    .update({
      central_slug: slug,
      central_desde: new Date().toISOString(),
      central_brief: brief,
      central_busca: "aereo",
    })
    .eq("id", conv.id);

  await recordHandoff({
    conversation_id: conv.id,
    from_mode: "ai",
    to_mode: "ai",
    reason: "central_especialistas:aereo:triagem_inicial",
    briefing: brief,
  }).catch(() => {});

  console.log(`[triagem] conversa ${conv.id} direcionada à Central (${slug})`);
  return { slug, brief };
}

