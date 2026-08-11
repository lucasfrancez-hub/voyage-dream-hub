import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/**
 * AI Editing Director — converte linguagem natural em operações estruturadas.
 * A IA nunca escreve no projeto: ela devolve operações que o editor aplica
 * (e que o usuário pode desfazer).
 */

const ClipeResumo = z.object({
  id: z.string(),
  kind: z.string(),
  trackId: z.string(),
  start: z.number(),
  duration: z.number(),
  label: z.string().optional().nullable(),
});

const Input = z.object({
  mensagem: z.string().min(1).max(40000),
  playheadMs: z.number().nonnegative(),
  selecao: z.object({ fromMs: z.number(), toMs: z.number() }).nullable().optional(),
  clipeSelecionadoId: z.string().nullable().optional(),
  duracaoMs: z.number().nonnegative(),
  clipes: z.array(ClipeResumo).max(400),
  trilhas: z.array(z.object({ id: z.string(), name: z.string(), kind: z.string() })),
  transcricao: z.string().max(24000).default(""),
});

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    resposta: { type: "string" },
    ops: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: true,
        properties: {
          op: {
            type: "string",
            enum: [
              "split_clip",
              "trim_clip",
              "move_clip",
              "delete_clip",
              "delete_range",
              "set_volume",
              "set_transform",
              "set_speed",
              "add_text",
              "add_caption_style",
              "rebuild_captions",
              "remove_captions",
              "mute_track",
              "delete_text_range",
              "set_background",
            ],
          },
          clipId: { type: "string" },
          trackId: { type: "string" },
          atMs: { type: "number" },
          startMs: { type: "number" },
          durationMs: { type: "number" },
          fromMs: { type: "number" },
          toMs: { type: "number" },
          ripple: { type: "boolean" },
          volume: { type: "number" },
          scale: { type: "number" },
          x: { type: "number" },
          y: { type: "number" },
          opacity: { type: "number" },
          rotation: { type: "number" },
          speed: { type: "number" },
          text: { type: "string" },
          fontSize: { type: "number" },
          color: { type: "string" },
          activeColor: { type: "string" },
          uppercase: { type: "boolean" },
          mode: { type: "string" },
          muted: { type: "boolean" },
          query: { type: "string" },
          modo: { type: "string", enum: ["nenhum", "desfoque", "cor", "midia", "remover"] },
          desfoque: { type: "number" },
          suavidade: { type: "number" },
          borda: { type: "number" },
          estabilidade: { type: "number" },
          contorno: { type: "boolean" },
        },
        required: ["op"],
      },
    },
  },
  required: ["resposta", "ops"],
} as const;

function prompt(ctx: z.infer<typeof Input>) {
  return `Você é o diretor de edição do EditAir, um editor de vídeo profissional em português do Brasil.

Converta o pedido do usuário em OPERAÇÕES ESTRUTURADAS. Nunca invente ids de clipe: use apenas os ids listados.

CONTEXTO ATUAL
- Duração da timeline: ${ctx.duracaoMs} ms
- Playhead ("aqui"): ${ctx.playheadMs} ms
- Seleção de intervalo: ${ctx.selecao ? `${ctx.selecao.fromMs} → ${ctx.selecao.toMs} ms` : "nenhuma"}
- Clipe selecionado: ${ctx.clipeSelecionadoId ?? "nenhum"}
- Trilhas: ${ctx.trilhas.map((t) => `${t.id} (${t.name})`).join(", ")}
- Clipes: ${JSON.stringify(ctx.clipes)}

TRANSCRIÇÃO (tempos em ms)
${ctx.transcricao || "(sem transcrição)"}

REGRAS
- "aqui" = playhead. Se houver seleção, use o intervalo da seleção.
- Pedidos sobre o que foi FALADO ("tira a parte onde eu falo da Argentina") → delete_text_range com query no texto exato aproximado.
- "abaixa a música" → set_volume no trackId t-music com volume 0.25 a 0.4.
- "minha voz está baixa" → set_volume em t-voice/t-video com volume 1.4.
- "dá um zoom em mim" → set_transform com scale ~1.15 no clipe de vídeo sob o playhead.
- "legenda menor/maior" → add_caption_style com fontSize.
- "tira as legendas" → remove_captions. "refaz as legendas" → rebuild_captions.
- Volume é escala: 1 = 100%.
- "desfoca o fundo" → set_background com modo "desfoque" e desfoque ~60 no clipe de vídeo sob o playhead (ou no clipe selecionado). "mais forte/menos" → ajuste desfoque (0-100).
- "remove o fundo" / "recorta só eu" → set_background com modo "remover". "fundo preto/branco/colorido" → modo "cor" com cor em hex.
- "volta o fundo original" → set_background com modo "nenhum".
- Bordas serrilhadas → aumente suavidade; sobrou fundo na borda → borda negativa; cortou o cabelo → borda positiva; borda tremendo → estabilidade alta.
- Se o pedido não for possível ainda (gerar vídeo, B-roll), NÃO invente operação: devolva ops vazio e explique em uma frase o que ainda não está disponível.
- resposta: uma ou duas frases curtas, em português, dizendo o que você fez.`;
}

export type OpBruta = Record<string, string | number | boolean | null | undefined>;

export const dirigirEdicaoEditair = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => Input.parse(input))
  .handler(async ({ data }): Promise<{ resposta: string; ops: OpBruta[] }> => {
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
          { role: "user", content: data.mensagem },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "aplicar_edicao",
              description: "Aplica operações estruturadas na timeline do EditAir.",
              parameters: SCHEMA,
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "aplicar_edicao" } },
      }),
    });

    if (!res.ok) {
      const txt = await res.text();
      if (res.status === 429) throw new Error("Limite de uso da IA atingido. Tente em instantes.");
      if (res.status === 402) throw new Error("Créditos da IA esgotados.");
      throw new Error(`Falha do EditAir IA (${res.status}): ${txt.slice(0, 240)}`);
    }

    const json = (await res.json()) as {
      choices?: Array<{ message?: { tool_calls?: Array<{ function?: { arguments?: string } }>; content?: string } }>;
    };
    const raw =
      json.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments ??
      json.choices?.[0]?.message?.content ??
      "{}";
    let parsed: { resposta?: string; ops?: OpBruta[] } = {};
    try {
      parsed = JSON.parse(raw);
    } catch {
      const m = raw.match(/\{[\s\S]*\}/);
      parsed = m ? JSON.parse(m[0]) : {};
    }

    return {
      resposta: parsed.resposta?.trim() || "Feito.",
      ops: Array.isArray(parsed.ops) ? parsed.ops : [],
    };
  });
