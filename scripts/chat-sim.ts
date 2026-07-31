/**
 * Simulação offline do chatbot (não toca no WhatsApp nem no banco).
 * Usa o prompt real, tools mockadas e o mesmo pipeline de texto do runner.
 * Rodar: bun scripts/chat-sim.ts
 */
import { generateText, stepCountIs, tool, type ModelMessage } from "ai";
import { z } from "zod";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";
import { buildSharedAgentPrompt } from "@/lib/chat/camila-prompt";
import {
  buildSenderPrefix,
  capitalizeBubbles,
  capitalizeKnownNames,
  fixGluedSentences,
  mergeQuestionBubbles,
  stripAgentSignature,
  stripReintroBubbles,
  firstName,
} from "@/lib/whatsapp/text-utils.server";
import { splitToBubbles } from "@/lib/whatsapp/send.server";

const AGENT = { nome: "Maria", slug: "maria", genero: "f" as const };
const CLIENTE = "Lucas Rocha Francez";
const PHONE = "5544999998888";

const problems: string[] = [];
function flag(msg: string) {
  problems.push(msg);
  console.log(`   🔴 ${msg}`);
}

function buildSystem(isNew: boolean) {
  const parts = [buildSharedAgentPrompt(AGENT.nome, AGENT.genero)];
  parts.push(`\n\n# CONTEXTO DESTA CONVERSA`);
  parts.push(`- Você é: ${AGENT.nome}`);
  parts.push(`- Telefone do cliente: ${PHONE}`);
  parts.push(`- nome_do_cliente (perfil whatsapp): "${CLIENTE}" — parece nome real, pode usar o primeiro nome`);
  parts.push(`- Protocolo ATIVO: 2026070001 (uso interno — NÃO mencione o número ao cliente).`);
  parts.push(
    isNew
      ? `- PRIMEIRA RESPOSTA DESTE PROTOCOLO: SIM. Antes de qualquer tool, cumprimente, diga seu nome e reaja ao pedido. Se for viagem/cotação, faça a triagem (só aéreo ou pacote com hospedagem) e NÃO cote ainda.`
      : `- PRIMEIRA RESPOSTA DESTE PROTOCOLO: NÃO. Não repita apresentação; continue naturalmente do ponto atual.`,
  );
  parts.push(
    `\n# ✍️ FORMATAÇÃO OBRIGATÓRIA (WhatsApp)\n- Cada ideia em parágrafo próprio separado por linha em branco.\n- Listas com "- ".\n- Nunca cole palavras.`,
  );
  parts.push(`- Data/hora atual (SP): ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`);
  return parts.join("\n");
}

// ---------------- tools mockadas (mesma assinatura das reais) -------------
const toolCalls: Array<{ name: string; input: unknown }> = [];
let quoteCounter = 0;
let lastQuoteId: string | null = null;
const cardsSent: number[] = [];

const tools = {
  cotar_aereo: tool({
    description:
      "Cota passagens aéreas AO VIVO e devolve 3-4 opções. Use SOMENTE depois que o cliente confirmar que quer SÓ AÉREO e você tiver origem, destino, datas e passageiros.",
    inputSchema: z.object({
      origem: z.string(),
      destino: z.string(),
      data_ida: z.string(),
      data_volta: z.string().nullable(),
      adultos: z.number().nullable(),
      criancas: z.number().nullable(),
      bebes: z.number().nullable(),
      periodo_ida: z.enum(["manha", "tarde", "noite", "livre"]).nullable(),
      periodo_volta: z.enum(["manha", "tarde", "noite", "livre"]).nullable(),
      bagagem_despachada: z.boolean().nullable(),
    }),
    execute: async (args) => {
      toolCalls.push({ name: "cotar_aereo", input: args });
      lastQuoteId = `quote-${++quoteCounter}`;
      return {
        quote_id: lastQuoteId,
        opcoes: [1, 2, 3, 4].map((n) => ({
          opcao: n,
          companhia: ["LATAM", "GOL", "AZUL", "LATAM"][n - 1],
          ida: "10:1" + n + " → 12:3" + n,
          conexoes: n === 1 ? 0 : 1,
          total: 1200 + n * 130,
        })),
        instrucao: "Agora chame enviar_cartao_voo com todas as opções.",
      };
    },
  }),
  enviar_cartao_voo: tool({
    description:
      "Envia ao cliente a ARTE (imagem) das opções de voo já cotadas. Depois de enviar as artes, escreva só um balão curto perguntando qual o cliente prefere.",
    inputSchema: z.object({
      quote_id: z.string(),
      opcoes: z.array(z.number()),
      legenda: z.string().nullable(),
      reenviar: z.boolean().nullable(),
    }),
    execute: async (args) => {
      toolCalls.push({ name: "enviar_cartao_voo", input: args });
      const novas = args.opcoes.filter((o) => !cardsSent.includes(o));
      cardsSent.push(...novas);
      return { enviados: novas.map((o) => ({ opcao: o, ok: true })), ja_enviado: args.opcoes.filter((o) => !novas.includes(o)) };
    },
  }),
  buscar_pacotes: tool({
    description: "Lista pacotes disponíveis no admin, filtrados por destino e origem.",
    inputSchema: z.object({ destino: z.string().nullable(), origem: z.string().nullable(), limit: z.number().nullable() }),
    execute: async (args) => {
      toolCalls.push({ name: "buscar_pacotes", input: args });
      return { pacotes: [] };
    },
  }),
  escalar_para_humano: tool({
    description: "Passa o atendimento para o time comercial humano.",
    inputSchema: z.object({ motivo: z.string(), briefing: z.string().nullable() }),
    execute: async (args) => {
      toolCalls.push({ name: "escalar_para_humano", input: args });
      return { ok: true };
    },
  }),
};

// ---------------- pipeline igual ao agent-runner --------------------------
function pipeline(rawText: string, jaFalouAntes: boolean) {
  const clientFirst = firstName(CLIENTE);
  let text = capitalizeKnownNames(capitalizeBubbles(fixGluedSentences(rawText)), [clientFirst]);
  text = stripAgentSignature(text, AGENT.nome);
  if (jaFalouAntes) text = stripReintroBubbles(text);
  text = mergeQuestionBubbles(text);
  const prefix = buildSenderPrefix(AGENT.nome);
  return { text, bubbles: splitToBubbles(text, prefix) };
}

// ---------------- roteiro do cliente --------------------------------------
const ROTEIRO = [
  "Oi, boa noite! Queria uma passagem",
  "Só o aéreo mesmo, não preciso de hotel",
  "Saindo de Maringá pra São Paulo",
  "Dia 20 de agosto e volto dia 25",
  "Somos 2 adultos e 1 criança de 5 anos",
  "Não recebi as imagens, pode mandar de novo?",
  "Você é um robô?",
];

async function main() {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("LOVABLE_API_KEY ausente");
  const gateway = createLovableAiGatewayProvider(key);
  const messages: ModelMessage[] = [];
  let entregues = 0;

  for (let turn = 0; turn < ROTEIRO.length; turn++) {
    const userMsg = ROTEIRO[turn];
    messages.push({ role: "user", content: userMsg });
    console.log(`\n\n===== TURNO ${turn + 1} =====\n👤 ${CLIENTE}: ${userMsg}`);

    const before = toolCalls.length;
    const res = await generateText({
      model: gateway("google/gemini-2.5-flash"),
      system: buildSystem(entregues === 0),
      messages,
      tools: tools as never,
      stopWhen: stepCountIs(10),
      temperature: 0.6,
    });
    const usadas = toolCalls.slice(before);
    if (usadas.length) console.log(`🛠  tools: ${usadas.map((t) => t.name + "(" + JSON.stringify(t.input) + ")").join(", ")}`);

    const raw = (res.text ?? "").trim();
    if (!raw) {
      flag(`turno ${turn + 1}: resposta vazia do modelo`);
      messages.push({ role: "assistant", content: "(vazio)" });
      continue;
    }
    const { bubbles } = pipeline(raw, entregues > 0);
    bubbles.forEach((b, i) => console.log(`💬 [${i + 1}] ${b.replace(/\n/g, "\n      ")}`));
    entregues += bubbles.length;
    messages.push({ role: "assistant", content: bubbles.join("\n\n") });

    // ---------- verificações automáticas ----------
    const joined = bubbles.join("\n");
    const nomeOcorrencias = (joined.match(/\bMaria\s*:/gi) ?? []).length;
    if (nomeOcorrencias > 1) flag(`turno ${turn + 1}: nome do agente aparece ${nomeOcorrencias}x ("Maria:")`);
    if (/\*Maria:?\*/i.test(joined)) flag(`turno ${turn + 1}: assinatura em negrito "*Maria:*" vazou`);
    if (turn === 0 && !/^Maria:/.test(bubbles[0] ?? "")) flag(`turno 1: primeiro balão sem o prefixo "Maria:"`);
    if (turn === 0 && !/maria/i.test(joined)) flag(`turno 1: agente não se apresentou pelo nome`);
    if (turn > 0 && /^Maria:/m.test(bubbles.slice(1).join("\n"))) flag(`turno ${turn + 1}: prefixo repetido em balão que não é o primeiro`);
    if (/\b(robô|robo|inteligência artificial|sou uma ia|bot)\b/i.test(joined) && turn === ROTEIRO.length - 1)
      flag(`turno ${turn + 1}: agente admitiu ser robô/IA`);
    if (/assessoria/i.test(joined)) flag(`turno ${turn + 1}: usou termo proibido "assessoria"`);
    if (/2026070001/.test(joined)) flag(`turno ${turn + 1}: vazou número do protocolo`);
    if (/[a-zà-ÿ]{3,}[A-ZÀ-Þ][a-zà-ÿ]{2,}/u.test(joined.replace(/WhatsApp|ViaAir|VIA AIR|LATAM|GOL/g, "")))
      flag(`turno ${turn + 1}: palavras coladas no texto`);
    if (bubbles.some((b) => b.length > 900)) flag(`turno ${turn + 1}: balão muito longo (>900 chars)`);
  }

  console.log(`\n\n===== DIAGNÓSTICO =====`);
  console.log(`tools chamadas: ${toolCalls.map((t) => t.name).join(" → ") || "(nenhuma)"}`);
  console.log(`cards enviados: [${cardsSent.join(", ")}]`);
  if (!toolCalls.some((t) => t.name === "cotar_aereo")) flag("nunca chamou cotar_aereo mesmo com todos os dados");
  if (!toolCalls.some((t) => t.name === "enviar_cartao_voo")) flag("cotou mas não enviou os cartões");
  if (cardsSent.length && cardsSent.length !== 4) flag(`enviou ${cardsSent.length} card(s) em vez de 4`);
  const cotacoes = toolCalls.filter((t) => t.name === "cotar_aereo").length;
  if (cotacoes > 1) flag(`cotou ${cotacoes}x (deveria reaproveitar o cache)`);
  const dupes = cardsSent.length !== new Set(cardsSent).size;
  if (dupes) flag("cards duplicados");
  console.log(problems.length ? `\n❌ ${problems.length} problema(s):\n- ${problems.join("\n- ")}` : "\n✅ nenhum problema detectado");
}

main().catch((e) => {
  console.error("FALHA NA SIMULAÇÃO:", e);
  process.exit(1);
});
