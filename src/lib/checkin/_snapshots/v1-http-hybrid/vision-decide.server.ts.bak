/**
 * Vision decision helper — pergunta ao Gemini onde clicar/digitar a partir
 * de um screenshot da tela atual. Usa Lovable AI Gateway (Gemini Flash Lite,
 * multimodal, baixo custo).
 *
 * Devolve uma ação: click | type | done | notfound.
 */

const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
// Gemini 3.1 Flash Lite — mais barato e rápido do catálogo multimodal.
const MODEL = "google/gemini-3.1-flash-lite";

export type VisionAction =
  | { action: "click"; x: number; y: number; reason?: string }
  | { action: "type"; x: number; y: number; text: string; reason?: string }
  | { action: "done"; reason?: string }
  | { action: "notfound"; reason?: string };

export interface VisionDecideInput {
  /** PNG do screenshot, sem prefixo data URL */
  screenshotBase64: string;
  /** Descrição em pt-BR do passo (ex.: "clicar no campo 'Código da reserva'") */
  instruction: string;
  /** Contexto do fluxo (opcional) — o robô diz onde está */
  context?: string;
  /** Dimensões do viewport pra IA saber a escala */
  viewportWidth: number;
  viewportHeight: number;
}

export interface VisionDecideResult {
  decision: VisionAction;
  costCents: number;
  rawContent: string;
}

const SYSTEM = `Você é um agente de automação web. Analisa o screenshot de uma página web e decide a próxima ação de mouse/teclado.

Devolva SOMENTE um JSON válido, sem markdown, sem prosa. Formato:

{"action":"click","x":123,"y":456,"reason":"campo Código da reserva localizado"}
{"action":"type","x":123,"y":456,"text":"LA9571886LWKG","reason":"..."}
{"action":"done","reason":"o passo já foi cumprido"}
{"action":"notfound","reason":"elemento não visível no screenshot"}

Regras:
- Coordenadas em PIXELS do viewport recebido (0,0 = canto superior esquerdo).
- Aponte para o CENTRO do elemento alvo.
- "type" clica na coordenada, limpa e digita o texto.
- "done" quando o passo pedido já parece cumprido (ex.: pediu para clicar em algo que já está clicado).
- "notfound" quando o elemento não está visível — não invente coordenadas.`;

function parseDecision(content: string): VisionAction {
  const cleaned = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/i, "").trim();
  const m = cleaned.match(/\{[\s\S]*\}/);
  const raw = m ? m[0] : cleaned;
  const obj = JSON.parse(raw);
  if (!obj || typeof obj !== "object") throw new Error("resposta sem JSON");
  const action = String(obj.action || "").toLowerCase();
  if (action === "click") return { action: "click", x: Math.round(+obj.x), y: Math.round(+obj.y), reason: obj.reason };
  if (action === "type") return { action: "type", x: Math.round(+obj.x), y: Math.round(+obj.y), text: String(obj.text ?? ""), reason: obj.reason };
  if (action === "done") return { action: "done", reason: obj.reason };
  if (action === "notfound") return { action: "notfound", reason: obj.reason };
  throw new Error(`action desconhecida: ${action}`);
}

// Custo estimado grosseiro do Gemini Flash Lite: ~US$ 0.10/M input tokens,
// ~US$ 0.40/M output. Uma tela de 1280x900 vira ~1300 tokens de imagem.
// Fixamos em ~0,3 centavos por chamada (R$ 0,015) para exibir no painel.
const APPROX_COST_CENTS = 1; // arredonda pra 1 centavo por chamada — margem confortável.

export async function decideNextAction(input: VisionDecideInput): Promise<VisionDecideResult> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY ausente");

  const userText = [
    `Viewport: ${input.viewportWidth}x${input.viewportHeight} pixels.`,
    input.context ? `Contexto: ${input.context}` : "",
    `Instrução: ${input.instruction}`,
    "Decida a próxima ação e responda em JSON.",
  ].filter(Boolean).join("\n");

  const body = {
    model: MODEL,
    messages: [
      { role: "system", content: SYSTEM },
      {
        role: "user",
        content: [
          { type: "text", text: userText },
          {
            type: "image_url",
            image_url: { url: `data:image/png;base64,${input.screenshotBase64}` },
          },
        ],
      },
    ],
    temperature: 0,
  };

  const res = await fetch(GATEWAY, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": apiKey,
      "X-Lovable-AIG-SDK": "checkin-vision",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Vision gateway HTTP ${res.status}: ${text.slice(0, 500)}`);
  }
  const json = (await res.json()) as any;
  const content: string = json?.choices?.[0]?.message?.content ?? "";
  if (!content) throw new Error("Vision devolveu resposta vazia");
  const decision = parseDecision(content);
  return { decision, costCents: APPROX_COST_CENTS, rawContent: content };
}
