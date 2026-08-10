import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/**
 * Cérebro editorial do EditAir (Fase 0 → estratégia).
 *
 * A IA recebe transcrição + medições reais de áudio/imagem e devolve um PLANO
 * editorial: narrativa, tomadas, remoções justificadas, pausas a preservar,
 * correções de áudio por trecho e o que NÃO deve ser modificado.
 * Ela nunca escreve na timeline — quem monta é o EditAir, e tudo é reversível.
 */

const Input = z.object({
  objetivo: z.string().max(600).default(""),
  ajuste: z.string().max(800).default(""),
  planoAnterior: z.string().max(6000).default(""),
  formato: z.string().max(20).default("vertical"),
  duracaoMs: z.number().nonnegative(),
  transcricao: z.string().max(60000).default(""),
  analise: z.string().max(40000).default("{}"),
});

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    intencao: { type: "string" },
    estrategia: { type: "string" },
    formatoRecomendado: { type: "string", enum: ["vertical", "feed", "horizontal", "quadrado"] },
    estimativaMinMs: { type: "number" },
    estimativaMaxMs: { type: "number" },
    ritmo: { type: "string", enum: ["calmo", "equilibrado", "acelerado"] },
    blocos: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          titulo: { type: "string" },
          papel: { type: "string", enum: ["gancho", "desenvolvimento", "prova", "conclusao", "cta"] },
          fromMs: { type: "number" },
          toMs: { type: "number" },
          resumo: { type: "string" },
        },
        required: ["titulo", "papel", "fromMs", "toMs", "resumo"],
      },
    },
    cortes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          sourceInMs: { type: "number" },
          sourceOutMs: { type: "number" },
          bloco: { type: "string" },
          rotulo: { type: "string" },
          continuidade: { type: "string", enum: ["nenhuma", "jcut", "lcut"] },
        },
        required: ["sourceInMs", "sourceOutMs", "bloco", "rotulo", "continuidade"],
      },
    },
    remocoes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          fromMs: { type: "number" },
          toMs: { type: "number" },
          tipo: {
            type: "string",
            enum: ["falso_comeco", "repeticao", "erro", "pausa_longa", "frase_interrompida", "tomada_pior", "off_topic"],
          },
          motivo: { type: "string" },
        },
        required: ["fromMs", "toMs", "tipo", "motivo"],
      },
    },
    preservar: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: { fromMs: { type: "number" }, toMs: { type: "number" }, motivo: { type: "string" } },
        required: ["fromMs", "toMs", "motivo"],
      },
    },
    audio: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          fromMs: { type: "number" },
          toMs: { type: "number" },
          ganhoDb: { type: "number" },
          motivo: { type: "string" },
        },
        required: ["fromMs", "toMs", "ganhoDb", "motivo"],
      },
    },
    normalizarMix: { type: "boolean" },
    preservacoes: {
      type: "object",
      additionalProperties: false,
      properties: {
        cor: { type: "boolean" },
        enquadramento: { type: "boolean" },
        exposicao: { type: "boolean" },
        nitidez: { type: "boolean" },
        motivo: { type: "string" },
      },
      required: ["cor", "enquadramento", "exposicao", "nitidez", "motivo"],
    },
    continuidade: {
      type: "object",
      additionalProperties: false,
      properties: {
        usarJcuts: { type: "boolean" },
        overlapMs: { type: "number" },
        observacao: { type: "string" },
      },
      required: ["usarJcuts", "overlapMs", "observacao"],
    },
    avisos: { type: "array", items: { type: "string" } },
  },
  required: [
    "intencao",
    "estrategia",
    "formatoRecomendado",
    "estimativaMinMs",
    "estimativaMaxMs",
    "ritmo",
    "blocos",
    "cortes",
    "remocoes",
    "preservar",
    "audio",
    "normalizarMix",
    "preservacoes",
    "continuidade",
    "avisos",
  ],
} as const;

function prompt(ctx: z.infer<typeof Input>) {
  return `Você é o EDITOR-CHEFE do EditAir: um editor de vídeo humano, experiente, que trabalha em português do Brasil.

Sua tarefa é a FASE 0 (análise) e a estratégia da FASE 1 (rough cut). Você NÃO edita: você entrega um PLANO EDITORIAL em JSON.

COMO UM EDITOR PENSA (obrigatório)
- Primeiro entenda O QUE a pessoa está tentando dizer, depois decida o que cortar.
- Identifique blocos de assunto e preserve a ordem narrativa (gancho → desenvolvimento → prova → conclusão → CTA).
- Distinga PAUSA NATURAL (dá ênfase, respiração dramática, fim de raciocínio → manter) de PAUSA RUIM (hesitação, travamento, ar morto → cortar).
- Distinga REPETIÇÃO INTENCIONAL (reforço retórico → manter) de RECOMEÇO POR ERRO (falso começo, a frase é refeita depois de forma mais completa → cortar a versão pior).
- Escolha a MELHOR TOMADA quando a pessoa repete o mesmo trecho: normalmente a última e mais fluida, mas avalie clareza e energia.
- Frases interrompidas, "deixa eu começar de novo", gaguejos e ruídos de boca são remoção.
- NUNCA use a regra burra "silêncio > 0,8s = cortar". Decida trecho a trecho, com motivo.

MATERIAL
- Duração original: ${ctx.duracaoMs} ms
- Formato atual do projeto: ${ctx.formato}
- Objetivo declarado pelo usuário: ${ctx.objetivo || "(não informado — deduza pela fala)"}

TRANSCRIÇÃO (tempos em ms do material original)
${ctx.transcricao || "(sem transcrição)"}

MEDIÇÕES TÉCNICAS REAIS (não invente números; use estes)
${ctx.analise}

REGRAS DE SAÍDA
- "cortes" é o EDL: a lista, em ordem, das tomadas que ficam. sourceInMs/sourceOutMs referem-se ao MATERIAL ORIGINAL. Somados, devem cair dentro da estimativa de duração.
- Todo corte precisa de rotulo curto e do bloco a que pertence.
- "continuidade": use "jcut"/"lcut" apenas onde realmente ajuda a costurar a fala (poucos casos, nunca em todos os cortes); caso contrário "nenhuma".
- "remocoes": só o que foi retirado de fato, com tipo e motivo curto e específico ("falso começo repetido depois de forma mais completa").
- "preservar": pausas/trechos que você DECIDIU manter apesar de parecerem silêncio, com o motivo (ênfase, respiro, virada de assunto).
- "audio": corrija SOMENTE trechos fora da média (use o campo delta em dB das medições). Não aplique ganho global; isso levanta ruído, eco e respiração. Ganhos entre -6 e +6 dB.
- "preservacoes": se a cor, o enquadramento, a exposição e a nitidez já estão adequados nas medições, marque true e explique. NÃO modificar por modificar.
- "estrategia": 2 a 4 frases, como você explicaria o plano para o cliente. Cite duração original, o que remove, a narrativa preservada e a estimativa final.
- Tempos sempre em milissegundos inteiros, sem sobreposição, em ordem crescente.
${ctx.ajuste ? `\nAJUSTE PEDIDO PELO USUÁRIO AO PLANO ANTERIOR (prioridade máxima): ${ctx.ajuste}\nPLANO ANTERIOR: ${ctx.planoAnterior}` : ""}`;
}

/** O plano volta como JSON serializado; o cliente valida e converte. */
export const planejarEdicaoEditair = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => Input.parse(input))
  .handler(async ({ data }): Promise<string> => {

    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY ausente no servidor");

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": apiKey,
        "X-Lovable-AIG-SDK": "custom-fetch",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: prompt(data) },
          {
            role: "user",
            content: data.ajuste
              ? `Refaça o plano editorial considerando: ${data.ajuste}`
              : "Analise o material e devolva o plano editorial completo.",
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "entregar_plano",
              description: "Entrega o plano editorial do EditAir (estratégia + EDL + justificativas).",
              parameters: SCHEMA,
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "entregar_plano" } },
      }),
    });

    if (!res.ok) {
      const txt = await res.text();
      if (res.status === 429) throw new Error("Limite de uso da IA atingido. Tente em instantes.");
      if (res.status === 402) throw new Error("Créditos da IA esgotados.");
      throw new Error(`Falha do cérebro editorial (${res.status}): ${txt.slice(0, 240)}`);
    }

    const json = (await res.json()) as {
      choices?: Array<{ message?: { tool_calls?: Array<{ function?: { arguments?: string } }>; content?: string } }>;
    };
    const raw =
      json.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments ??
      json.choices?.[0]?.message?.content ??
      "{}";
    try {
      return JSON.stringify(JSON.parse(raw));
    } catch {
      const m = raw.match(/\{[\s\S]*\}/);
      if (!m) throw new Error("A IA não devolveu um plano válido. Tente novamente.");
      return JSON.stringify(JSON.parse(m[0]));
    }

  });
