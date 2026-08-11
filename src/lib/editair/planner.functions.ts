import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/**
 * Planejador de edição do EditAir.
 *
 * A IA NUNCA escreve no estado: ela devolve um PLANO TIPADO (resumo + operações
 * + pedidos de geração de mídia). O EditAir valida, mostra o plano ao usuário e
 * só então aplica tudo de uma vez — o que permite um único Desfazer.
 *
 * O plano é sempre em CAMADAS: cortes na trilha principal, legendas na trilha de
 * legendas, B-roll em camada própria, cenas geradas por IA em "IA Gerada".
 */

const Input = z.object({
  escopo: z.enum(["clipe", "cena", "projeto"]),
  instrucao: z.string().min(1).max(2000),
  contexto: z.string().max(8000).default(""),
  duracaoMs: z.number().nonnegative(),
  playheadMs: z.number().nonnegative().default(0),
  clipes: z
    .array(
      z.object({
        id: z.string(),
        kind: z.string(),
        trackId: z.string(),
        start: z.number(),
        duration: z.number(),
        label: z.string().nullable().optional(),
      }),
    )
    .max(400),
  trilhas: z.array(z.object({ id: z.string(), name: z.string(), kind: z.string() })),
  midias: z
    .array(z.object({ id: z.string(), nome: z.string(), kind: z.string(), durationMs: z.number() }))
    .max(120)
    .default([]),
  transcricao: z.string().max(40000).default(""),
});

const OPS = [
  "create_track",
  "rename_track",
  "insert_clip",
  "split_clip",
  "trim_clip",
  "delete_range",
  "ripple_delete",
  "delete_clip",
  "move_clip",
  "remove_silences",
  "create_caption",
  "update_caption",
  "rebuild_captions",
  "remove_captions",
  "add_caption_style",
  "add_animation",
  "add_effect",
  "add_transition",
  "set_transform",
  "set_speed",
  "set_volume",
  "set_background",
  "delete_text_range",
] as const;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    titulo: { type: "string" },
    resposta: { type: "string" },
    resumo: { type: "array", items: { type: "string" } },
    /** pedidos de geração de mídia por IA; o clip é inserido depois pelo EditAir */
    geracoes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          ref: { type: "string" },
          tipo: { type: "string", enum: ["imagem", "video"] },
          prompt: { type: "string" },
          startMs: { type: "number" },
          durationMs: { type: "number" },
          camada: { type: "string" },
        },
        required: ["ref", "tipo", "prompt", "startMs", "durationMs", "camada"],
      },
    },
    ops: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: true,
        properties: {
          op: { type: "string", enum: OPS as unknown as string[] },
          ref: { type: "string" },
          clipId: { type: "string" },
          trackId: { type: "string" },
          assetId: { type: "string" },
          kind: { type: "string" },
          name: { type: "string" },
          acima: { type: "string" },
          atMs: { type: "number" },
          startMs: { type: "number" },
          durationMs: { type: "number" },
          sourceInMs: { type: "number" },
          fromMs: { type: "number" },
          toMs: { type: "number" },
          minSilencioMs: { type: "number" },
          padMs: { type: "number" },
          ripple: { type: "boolean" },
          text: { type: "string" },
          label: { type: "string" },
          query: { type: "string" },
          entrada: { type: "string" },
          saida: { type: "string" },
          camada: { type: "string" },
          efeitoId: { type: "string" },
          tipo: { type: "string" },
          intensidade: { type: "number" },
          speed: { type: "number" },
          volume: { type: "number" },
          scale: { type: "number" },
          x: { type: "number" },
          y: { type: "number" },
          opacity: { type: "number" },
          mode: { type: "string" },
          modo: { type: "string" },
          desfoque: { type: "number" },
        },
        required: ["op"],
      },
    },
  },
  required: ["titulo", "resposta", "resumo", "geracoes", "ops"],
} as const;

function prompt(ctx: z.infer<typeof Input>) {
  return `Você é o EDITOR do EditAir — um editor de vídeo profissional brasileiro que opera a TIMELINE, não um gerador de vídeo pronto.

PRINCÍPIO ABSOLUTO
- Você NUNCA entrega um vídeo achatado. Você entrega OPERAÇÕES que deixam cada elemento separado, visível e editável na timeline.
- Edição 100% NÃO DESTRUTIVA: o arquivo original nunca é alterado; cada corte é uma referência (assetId + sourceIn + duration).
- Cada tipo de elemento vai em SUA PRÓPRIA CAMADA. Nunca empilhe tudo na mesma trilha.

CAMADAS (crie com create_track quando não existirem, de cima para baixo)
Texto · Legendas · B-roll · IA Gerada · Vídeo 2 (overlay/PiP) · Vídeo (principal) · Voz · Música

ESCOPO DESTA EDIÇÃO: ${ctx.escopo.toUpperCase()}
${ctx.escopo === "clipe" ? "Altere SOMENTE o clipe indicado no contexto. Não toque em outros clipes." : ""}
${ctx.escopo === "cena" ? "Altere apenas os clipes da cena/intervalo indicado." : ""}
${ctx.escopo === "projeto" ? "Você pode reorganizar o projeto inteiro." : ""}

CONTEXTO
${ctx.contexto}
- Duração da timeline: ${ctx.duracaoMs} ms · playhead: ${ctx.playheadMs} ms
- Trilhas: ${ctx.trilhas.map((t) => `${t.id} "${t.name}" (${t.kind})`).join(" | ")}
- Clipes: ${JSON.stringify(ctx.clipes)}
- Biblioteca: ${ctx.midias.map((m) => `${m.id} "${m.nome}" (${m.kind}, ${Math.round(m.durationMs)}ms)`).join(" | ") || "vazia"}

TRANSCRIÇÃO (ms na timeline)
${ctx.transcricao || "(sem transcrição)"}

REGRAS DE MONTAGEM
- "remover pausas/silêncios" → use remove_silences no clipe de fala. Isso DIVIDE fisicamente o clipe em vários blocos ([Fala 1][Fala 2]...) e encurta a timeline. Se souber os trechos de fala pela transcrição, mande "falas": [{fromMs,toMs}]. Nunca use um único delete_range gigante para isso.
- "remover trechos onde erro a fala / falso começo / repetição" → delete_range com ripple true nos intervalos exatos da transcrição (um por trecho), ou delete_text_range com o texto.
- "gerar legendas" → rebuild_captions (usa a transcrição, cria segmentos sincronizados na camada Legendas). Para textos específicos use create_caption. Legenda é SEMPRE elemento de timeline, nunca queimada no vídeo.
- "destacar palavras" → add_caption_style com activeColor.
- "B-roll" → create_track kind "broll" name "B-roll" (se não existir) + insert_clip usando um assetId REAL da biblioteca, no intervalo em que o assunto é falado. Nunca invente assetId; se a biblioteca não tiver a mídia certa, use geracoes.
- "criar cena/animação com IA" → item em "geracoes" (tipo imagem ou video) com o intervalo. O EditAir gera, coloca na Biblioteca e insere na camada "IA Gerada". Não emita insert_clip para isso.
- "cortes dinâmicos" → split_clip + set_speed leves e/ou add_transition curtos. Nada de exagero.
- Nunca invente ids: use apenas ids listados. Para trilhas/clipes que VOCÊ cria, use "ref" e depois referencie esse mesmo texto em trackId.
- Tempos sempre em ms inteiros, em ordem crescente.

SAÍDA
- "resumo": lista curta, em português, do que será feito ("Remover 14 pausas", "Criar 23 cortes", "Criar camada Legendas", "Adicionar 3 B-rolls"). É o que o usuário aprova antes de aplicar.
- "resposta": 1 ou 2 frases explicando a edição.
- "titulo": nome curto da operação (ex.: "Edição dinâmica com legendas").`;
}

export type OpBruta = Record<string, string | number | boolean | null | undefined>;
export type GeracaoPedida = {
  ref: string;
  tipo: "imagem" | "video";
  prompt: string;
  startMs: number;
  durationMs: number;
  camada: string;
};
export type PlanoIa = {
  titulo: string;
  resposta: string;
  resumo: string[];
  geracoes: GeracaoPedida[];
  ops: OpBruta[];
};

export const planejarOperacoesEditair = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => Input.parse(input))
  .handler(async ({ data }): Promise<PlanoIa> => {
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
          { role: "user", content: data.instrucao },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "entregar_plano_de_edicao",
              description: "Entrega o plano de edição do EditAir (resumo + operações de timeline + gerações).",
              parameters: SCHEMA,
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "entregar_plano_de_edicao" } },
      }),
    });

    if (!res.ok) {
      const txt = await res.text();
      if (res.status === 429) throw new Error("Limite de uso da IA atingido. Tente em instantes.");
      if (res.status === 402) throw new Error("Créditos da IA esgotados.");
      throw new Error(`Falha do planejador (${res.status}): ${txt.slice(0, 240)}`);
    }

    const json = (await res.json()) as {
      choices?: Array<{ message?: { tool_calls?: Array<{ function?: { arguments?: string } }>; content?: string } }>;
    };
    const raw =
      json.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments ??
      json.choices?.[0]?.message?.content ??
      "{}";
    let parsed: Partial<PlanoIa> = {};
    try {
      parsed = JSON.parse(raw);
    } catch {
      const m = raw.match(/\{[\s\S]*\}/);
      parsed = m ? JSON.parse(m[0]) : {};
    }

    return {
      titulo: parsed.titulo?.trim() || "Edição com IA",
      resposta: parsed.resposta?.trim() || "Plano pronto.",
      resumo: Array.isArray(parsed.resumo) ? parsed.resumo.filter((x) => typeof x === "string") : [],
      geracoes: Array.isArray(parsed.geracoes) ? (parsed.geracoes as GeracaoPedida[]) : [],
      ops: Array.isArray(parsed.ops) ? (parsed.ops as OpBruta[]) : [],
    };
  });
