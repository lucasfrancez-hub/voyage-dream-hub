import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/**
 * Transcrição com timestamps por palavra.
 * O navegador envia blocos de áudio WAV 16 kHz mono; aqui pedimos ao modelo
 * o alinhamento palavra a palavra (mesmo papel do WhisperX no EDVID).
 */

const Input = z.object({
  audioBase64: z.string().min(100).max(20_000_000),
  offsetMs: z.number().int().nonnegative().default(0),
  idioma: z.string().max(10).default("pt"),
});

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    words: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          w: { type: "string" },
          start: { type: "number" },
          end: { type: "number" },
          conf: { type: "number" },
        },
        required: ["w", "start", "end", "conf"],
      },
    },
  },
  required: ["words"],
} as const;

const PROMPT = `Você é um alinhador de fala. Transcreva o áudio em português do Brasil e devolva CADA PALAVRA com seus tempos em SEGUNDOS relativos ao início deste áudio.

REGRAS:
- Uma entrada por palavra falada, na ordem exata.
- start e end em segundos com 3 casas (ex.: 14.321).
- Não invente palavras. Não inclua trechos silenciosos.
- Mantenha pontuação junto da palavra quando existir (ex.: "assim." ).
- conf: sua confiança no alinhamento daquela palavra, de 0 a 1.
- Os tempos devem ser o instante REAL em que a palavra é ouvida, sem arredondar para décimos.
- Se o áudio não tiver fala, devolva words vazio.`;

export type PalavraTranscrita = { w: string; start: number; end: number; conf?: number };

export const transcreverBlocoEditair = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => Input.parse(input))
  .handler(async ({ data }): Promise<{ words: PalavraTranscrita[] }> => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY ausente no servidor");

    const body = {
      model: "google/gemini-2.5-pro",
      messages: [
        { role: "system", content: PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: "Alinhe este áudio palavra a palavra." },
            { type: "input_audio", input_audio: { data: data.audioBase64, format: "wav" } },
          ],
        },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "return_words",
            description: "Devolve as palavras alinhadas.",
            parameters: SCHEMA,
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "return_words" } },
    };

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": apiKey,
        "X-Lovable-AIG-SDK": "custom-fetch",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const txt = await res.text();
      if (res.status === 429) throw new Error("Limite de uso da IA atingido. Tente em instantes.");
      if (res.status === 402) throw new Error("Créditos da IA esgotados.");
      throw new Error(`Falha na transcrição (${res.status}): ${txt.slice(0, 240)}`);
    }

    const json = (await res.json()) as {
      choices?: Array<{ message?: { tool_calls?: Array<{ function?: { arguments?: string } }>; content?: string } }>;
    };
    const raw = json.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments ?? json.choices?.[0]?.message?.content ?? "{}";
    let parsed: { words?: PalavraTranscrita[] } = {};
    try {
      parsed = JSON.parse(raw);
    } catch {
      const m = raw.match(/\{[\s\S]*\}/);
      parsed = m ? JSON.parse(m[0]) : {};
    }

    const words = (parsed.words ?? [])
      .filter((w) => w && typeof w.w === "string" && Number.isFinite(w.start) && Number.isFinite(w.end))
      .map((w) => ({
        w: w.w.trim(),
        start: Math.round(w.start * 1000) + data.offsetMs,
        end: Math.round(w.end * 1000) + data.offsetMs,
        ...(typeof w.conf === "number" ? { conf: w.conf } : {}),
      }))
      .filter((w) => w.w.length > 0 && w.end > w.start);

    return { words };
  });

/* ------------------------------------------------------------------ *
 * REVISOR DE TEXTO — NÃO devolve tempo.
 * Os timestamps são exclusivamente do alinhador acústico local.
 * Aqui o modelo só corrige ortografia, pontuação, maiúsculas e nomes próprios.
 * ------------------------------------------------------------------ */

const InputRevisao = z.object({
  texto: z.string().min(1).max(60_000),
  idioma: z.string().max(10).default("pt"),
  contexto: z.string().max(600).optional(),
});

const PROMPT_REVISAO = `Você é um REVISOR ORTOGRÁFICO de transcrição em português do Brasil. Você NÃO é redator.

REGRA CRÍTICA — FIDELIDADE À FALA:
O texto deve preservar EXATAMENTE o que a pessoa falou. As palavras são definidas pelo reconhecedor de fala; você só arruma a escrita delas.

PODE corrigir SOMENTE:
- acentuação;
- pontuação;
- maiúsculas/minúsculas;
- grafia evidente (erro claro de escrita da mesma palavra);
- nomes próprios quando houver ALTA confiança (ex.: "via ar" -> "Via Air").

NÃO PODE, em hipótese alguma:
- reescrever, resumir, formalizar ou "melhorar" a fala;
- trocar palavras por sinônimos (não trocar "pra" por "para", "a gente" por "nós");
- alterar conjugação, tempo verbal ou ordem das palavras;
- remover vícios de linguagem, repetições, gaguejos ou muletas ("tipo", "né", "aí", "então");
- inserir ou apagar palavras faladas;
- traduzir, comentar, numerar ou devolver marcações de tempo.

EXEMPLOS:
"eu vou pra italia" -> "Eu vou pra Itália." ✅
"eu vou pra italia" -> "Eu irei para a Itália." ❌
"a gente vai viajar amanhã" -> "A gente vai viajar amanhã." ✅
"a gente vai viajar amanhã" -> "Nós viajaremos amanhã." ❌

Na dúvida sobre qualquer correção, MANTENHA o texto original.
Responda SOMENTE com o texto revisado, com a mesma quantidade e ordem de palavras.`;

export const revisarTextoEditair = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => InputRevisao.parse(input))
  .handler(async ({ data }): Promise<{ texto: string }> => {
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
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: PROMPT_REVISAO },
          {
            role: "user",
            content: `${data.contexto ? `Contexto do vídeo: ${data.contexto}\n\n` : ""}Texto bruto:\n${data.texto}`,
          },
        ],
      }),
    });

    if (!res.ok) {
      const txt = await res.text();
      if (res.status === 429) throw new Error("Limite de uso da IA atingido.");
      if (res.status === 402) throw new Error("Créditos da IA esgotados.");
      throw new Error(`Falha na revisão de texto (${res.status}): ${txt.slice(0, 200)}`);
    }
    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const texto = (json.choices?.[0]?.message?.content ?? "").trim();
    return { texto: texto || data.texto };
  });
