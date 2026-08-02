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
  /(pas+ag[ea][nm]s?|pasage[nm]s?|\bvo+s?\b|\bvoo?s\b|a[eé]r[ei]?[oa]s?|bilhete\s*a[eé]re[oa]|trecho\s*a[eé]re[oa]|passagem\s*de\s*avi[aã]o|so\s*(o\s*)?a[eé]reo)/i;

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

// Deslocamento terrestre / passeio: "ida e volta" aqui NÃO é passagem aérea.
const RX_TERRESTRE =
  /\b(onibus|van|carro|traslado|transfer|translado|passeio|city tour|excursao de um dia|barco|trem)\b/i;

export function heuristicaAereo(textoBruto: string): boolean {
  const texto = normalizarTexto(textoBruto);
  const pedeTrecho = RX_TRECHO.test(texto) || RX_BATE_VOLTA.test(texto);
  if (!RX_AEREO.test(texto) && !pedeTrecho) return false;
  if (RX_BLOQUEIO.test(texto)) return false;
  // "ida e volta" de ônibus/van/passeio não é aéreo — só segue se falou de voo.
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
Recebe a PRIMEIRA mensagem de um cliente no WhatsApp e responde SOMENTE um JSON.

Responda aereo_avulso = true APENAS quando a mensagem deixar claro que o cliente
quer PESQUISAR, COTAR ou COMPRAR SOMENTE PASSAGEM AÉREA.
Exemplos true: "quero ver uma passagem", "preciso de um voo para Recife",
"quero cotar uma passagem para Lisboa", "tem voo de Maringá para São Paulo?",
"quanto está a passagem para Salvador?", "preciso comprar só o aéreo",
"quero ver opções de voo", "quero ida e volta", "quero só ida", "quero ida simples",
"preciso ir e voltar no mesmo dia", "quero ir e voltar hoje", "preciso fazer um bate-volta",
"vou e volto no mesmo dia", "quero ir cedo e voltar à noite".
Frases sobre o tipo de trecho ("ida e volta", "só ida") e sobre bate-volta
("ir e voltar no mesmo dia") sem menção a pacote/hotel também são aereo_avulso = true.
Mas se a ida e volta for claramente por ônibus, van, carro, transfer ou passeio,
responda false.

Responda aereo_avulso = false em TODOS os outros casos, inclusive:
- mensagens genéricas: "oi", "boa tarde", "quero viajar", "preciso de ajuda com uma viagem";
- destino/planejamento: "quero conhecer Maceió", "quero planejar minhas férias";
- pacote ou viagem completa: "vocês têm pacote para o Nordeste?", "aéreo e hotel", roteiro, cruzeiro, hospedagem, passeios, ingressos, seguro, transfer;
- pedido existente, alteração, cancelamento, reclamação, emergência, check-in, voucher.

NUNCA marque true só porque apareceu a palavra "viagem", "avião" ou o nome de um destino.
Ignore erros de digitação, falta de acento e abreviações: "pasagem", "passagen", "vôo",
"quero cotar aerio pra Recife" contam como pedido de passagem aérea.
Na dúvida, responda false.

Extraia também o que já estiver explícito (origem, destino, data_ida, data_volta,
adultos, criancas). Use null quando não houver.

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
 * Analisa a primeira mensagem da conversa. Se for pedido claro de passagem
 * aérea, grava o direcionamento para a Central e devolve o especialista.
 * Retorna null quando o atendimento deve seguir com as consultoras.
 */
export async function triageFirstMessage(conv: WaConversation): Promise<TriageResult> {
  const desde = new Date(Date.now() - JANELA_HORAS * 60 * 60 * 1000).toISOString();

  // Só vale como "primeira mensagem" se ninguém do nosso lado já respondeu.
  const { count: respondidas } = await supabaseAdmin
    .from("wa_messages")
    .select("id", { count: "exact", head: true })
    .eq("conversation_id", conv.id)
    .eq("direction", "outbound")
    .gte("created_at", desde);
  if ((respondidas ?? 0) > 0) return null;

  const { data: entradas } = await supabaseAdmin
    .from("wa_messages")
    .select("content")
    .eq("conversation_id", conv.id)
    .eq("direction", "inbound")
    .gte("created_at", desde)
    .order("created_at", { ascending: true })
    .limit(10);

  const texto = (entradas ?? [])
    .map((m) => (m.content ?? "").trim())
    .filter(Boolean)
    .join("\n")
    .trim();
  if (!texto) return null;

  // Barreira dura antes de gastar chamada: sem menção a passagem/voo/aéreo,
  // ou com sinal de pacote/pós-venda, nem classificamos.
  if (!heuristicaAereo(texto)) return null;

  const c = await classificar(texto);
  if (!c.aereo_avulso) return null;

  const linhas = ["✈️ Cotação de passagem aérea (cliente já abriu a conversa pedindo aéreo)"];
  if (c.origem) linhas.push(`📍 Origem: ${c.origem}`);
  if (c.destino) linhas.push(`📍 Destino: ${c.destino}`);
  if (c.data_ida) linhas.push(`📅 Ida: ${c.data_ida}`);
  if (c.data_volta) linhas.push(`🔁 Volta: ${c.data_volta}`);
  if (c.adultos != null) linhas.push(`👥 Adultos: ${c.adultos}`);
  if (c.criancas != null) linhas.push(`🧒 Crianças: ${c.criancas}`);
  linhas.push(`💬 Primeira mensagem: "${texto.slice(0, 300)}"`);
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
