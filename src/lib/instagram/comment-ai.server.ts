/**
 * Resposta automática de comentários do Instagram.
 *
 * Regra do negócio: comentário é SEMPRE tratado pelos Consultores (Camila),
 * nunca pelo Setor Aéreo. A IA recebe o contexto da publicação (legenda e
 * link) pra saber de qual post veio o comentário.
 */

import { generateText } from "ai";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";
import { buildSharedAgentPrompt } from "@/lib/chat/camila-prompt";

const MODEL = "google/gemini-2.5-flash";

export type CommentContext = {
  fromUsername: string | null;
  text: string | null;
  mediaCaption: string | null;
  mediaPermalink: string | null;
  /** Transcrição/leitura do vídeo (reels), quando houver. */
  videoTranscricao?: string | null;
};

export async function gerarRespostaComentario(ctx: CommentContext): Promise<{ publica: string; dm: string } | null> {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) return null;

  const system = `${buildSharedAgentPrompt("camila", "f")}

CANAL: comentário público no Instagram da VIA AIR.
Você é dos CONSULTORES (nunca do Setor Aéreo) — comentário sempre é atendido pelos Consultores.

Contexto da publicação onde o comentário foi feito:
- Legenda: ${ctx.mediaCaption?.slice(0, 800) ?? "(sem legenda)"}
- Link: ${ctx.mediaPermalink ?? "(sem link)"}
${ctx.videoTranscricao ? `- Conteúdo do vídeo (transcrição e leitura da tela):\n${ctx.videoTranscricao.slice(0, 2500)}\nUse esse conteúdo do vídeo para responder com precisão ao que foi falado.` : ""}

RÉGUA DE TOM (obrigatória): responda SEMPRE com máxima educação, gentileza e serenidade.
Nunca ironize, nunca rebata, nunca use sarcasmo, nunca discuta nem corrija o cliente de forma ríspida.
Se o comentário for crítico ou provocativo, agradeça o retorno, mostre empatia e se coloque à disposição — em uma ou duas linhas, sem justificativas longas.

Responda em JSON exato:
{"publica":"resposta curta e simpática no comentário (máx 2 linhas, sem link)","dm":"mensagem privada convidando a seguir no direct, personalizada com o assunto do post"}`;


  try {
    const provider = createLovableAiGatewayProvider(key);
    const { text } = await generateText({
      model: provider(MODEL),
      system,
      prompt: `@${ctx.fromUsername ?? "cliente"} comentou: ${ctx.text ?? "(sem texto)"}`,
      temperature: 0.6,
    });
    const bruto = text.match(/\{[\s\S]*\}/)?.[0];
    if (!bruto) return null;
    const parsed = JSON.parse(bruto) as { publica?: string; dm?: string };
    if (!parsed.publica) return null;
    return { publica: parsed.publica.slice(0, 480), dm: (parsed.dm ?? parsed.publica).slice(0, 900) };
  } catch (err) {
    console.error("[ig-comentario] IA falhou:", err);
    return null;
  }
}
