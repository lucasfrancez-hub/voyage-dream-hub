/**
 * Direct do perfil PESSOAL (ex.: @lucasfrancez).
 *
 * Regra do dono: nesse perfil a IA responde como se fosse a própria pessoa.
 * NUNCA entra atendimento comercial — sem cotação, sem preço, sem consultores,
 * sem Setor Aéreo, sem protocolo. É conversa pessoal, curta e humana.
 */

import { generateText } from "ai";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";

const MODEL = "google/gemini-2.5-flash";

type Historico = { direction: string; text: string | null }[];

function buildSystem(nome: string, username: string | null) {
  return `Você está escrevendo mensagens no Direct do Instagram PESSOAL de ${nome}${
    username ? ` (@${username})` : ""
  }. Você É ${nome} — escreva em primeira pessoa, como a própria pessoa.

REGRAS ABSOLUTAS:
- Nunca diga que é uma IA, assistente, robô ou atendimento. Você é a pessoa.
- Nunca faça cotação, orçamento, pesquisa de passagem, preço, pagamento ou reserva.
- Nunca cite consultores, atendentes, especialistas, Setor Aéreo, equipe ou protocolo.
- Nunca peça dados de viagem (origem, destino, datas, passageiros, CPF).
- Se o assunto virar viagem/compra, responda humano e breve e mande a pessoa falar no perfil da VIA AIR (@viaair) — sem detalhar valores nem prometer retorno de ninguém.

ESTILO: informal, direto, 1 ou 2 frases curtas, sem emoji em excesso (no máximo 1), sem saudação repetida se a conversa já começou, sem texto de vendedor.`;
}

export async function gerarRespostaPessoal(params: {
  nome: string;
  username: string | null;
  historico: Historico;
  mensagem: string;
}): Promise<string | null> {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) return null;
  try {
    const provider = createLovableAiGatewayProvider(key);
    const contexto = params.historico
      .slice(-10)
      .map((m) => `${m.direction === "inbound" ? "Pessoa" : "Eu"}: ${m.text ?? ""}`)
      .join("\n");
    const { text } = await generateText({
      model: provider(MODEL),
      system: buildSystem(params.nome, params.username),
      prompt: `${contexto ? `Conversa até agora:\n${contexto}\n\n` : ""}Nova mensagem: ${params.mensagem}\n\nEscreva SOMENTE a resposta.`,
      temperature: 0.7,
    });
    const limpo = text.trim().replace(/^["']|["']$/g, "");
    return limpo ? limpo.slice(0, 700) : null;
  } catch (err) {
    console.error("[ig-pessoal] IA falhou:", err);
    return null;
  }
}

/** Gera e envia a resposta pessoal no Direct. */
export async function responderDirectComoDono(params: {
  conversationId: string;
  accountRowId: string;
  contactIgId: string;
  mensagem: string;
}) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: conta } = await supabaseAdmin
    .from("instagram_accounts")
    .select("username, display_name")
    .eq("id", params.accountRowId)
    .maybeSingle();

  const { data: msgs } = await supabaseAdmin
    .from("instagram_messages")
    .select("direction, text")
    .eq("conversation_id", params.conversationId)
    .order("created_at", { ascending: false })
    .limit(10);

  const resposta = await gerarRespostaPessoal({
    nome: conta?.display_name || conta?.username || "eu",
    username: conta?.username ?? null,
    historico: ((msgs ?? []) as Historico).slice().reverse(),
    mensagem: params.mensagem,
  });
  if (!resposta) return;

  const { sendInstagramDM } = await import("./send.server");
  await sendInstagramDM({
    conversationId: params.conversationId,
    accountId: params.accountRowId,
    recipientIgId: params.contactIgId,
    text: resposta,
    agentSlug: "pessoal",
  });
}
