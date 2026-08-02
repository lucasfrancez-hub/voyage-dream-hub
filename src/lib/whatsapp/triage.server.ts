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

// Sinais de que é PASSAGEM AÉREA avulsa.
const RX_AEREO =
  /\b(passagem|passagens|voo|voos|a[ée]reo|a[ée]rea|bilhete a[ée]reo|trecho a[ée]reo)\b/i;

// Sinais de que NÃO é aéreo avulso (pacote / viagem completa / pós-venda).
const RX_BLOQUEIO =
  /\b(pacote|pacotes|hotel|hot[ée]is|hospedagem|resort|cruzeiro|navio|roteiro|f[ée]rias|lua de mel|excurs[aã]o|all inclusive|a[ée]reo\s*\+\s*hotel|passeio|ingresso|disney|universal|seguro viagem|transfer|meu pedido|minha reserva|localizador|check-?in|voucher|remarca|reembolso|cancel|reclama|problema com|atraso do voo|bagagem extraviada)\b/i;

function heuristicaAereo(texto: string): boolean {
  if (!RX_AEREO.test(texto)) return false;
  if (RX_BLOQUEIO.test(texto)) return false;
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
"quero ver opções de voo".

Responda aereo_avulso = false em TODOS os outros casos, inclusive:
- mensagens genéricas: "oi", "boa tarde", "quero viajar", "preciso de ajuda com uma viagem";
- destino/planejamento: "quero conhecer Maceió", "quero planejar minhas férias";
- pacote ou viagem completa: "vocês têm pacote para o Nordeste?", "aéreo e hotel", roteiro, cruzeiro, hospedagem, passeios, ingressos, seguro, transfer;
- pedido existente, alteração, cancelamento, reclamação, emergência, check-in, voucher.

NUNCA marque true só porque apareceu a palavra "viagem", "avião" ou o nome de um destino.
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
