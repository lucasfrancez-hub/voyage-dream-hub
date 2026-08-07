/**
 * Régua de tom dos comentários.
 *
 * Antes de qualquer resposta automática, o comentário passa por uma
 * avaliação de tolerância. Quando o tom passa do limite (ofensa, xingamento,
 * ironia agressiva, acusação grave), a IA NÃO responde sozinha: o comentário
 * fica marcado para revisão humana e um alerta chega no chatbot.
 *
 * Níveis:
 *  0 = neutro/elogio
 *  1 = dúvida crítica ou reclamação educada  → IA pode responder
 *  2 = ironia/deboche/hostilidade            → revisão humana
 *  3 = ofensa, xingamento, ódio, ameaça      → revisão humana
 */

import { generateText } from "ai";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";

const MODEL = "google/gemini-2.5-flash-lite";

/** A partir deste nível a IA não responde sozinha. */
export const LIMITE_TOM = 2;

export type AvaliacaoTom = {
  nivel: 0 | 1 | 2 | 3;
  categoria: string;
  motivo: string;
  /** true quando o comentário passou do limite de tolerância. */
  precisaRevisao: boolean;
};

const PALAVRAS_GRAVES =
  /(idiot|imbecil|burr[oa]|otári|otari|est[úu]pid|lixo|merd|porcari|vagabund|ladr[ãa]o|golpist|safad|palha[çc]|cala a boca|vai se f|fdp|puta|caralh|arrombad|nojent|racist|macac[oa]\b|viad|bicha\b|gord[ao] nojent)/i;

function heuristica(texto: string): AvaliacaoTom {
  if (PALAVRAS_GRAVES.test(texto)) {
    return { nivel: 3, categoria: "ofensa", motivo: "Termo ofensivo detectado", precisaRevisao: true };
  }
  return { nivel: 0, categoria: "neutro", motivo: "Sem sinal de hostilidade", precisaRevisao: false };
}

export async function avaliarTomComentario(texto: string | null | undefined): Promise<AvaliacaoTom> {
  const t = (texto ?? "").trim();
  if (!t) return { nivel: 0, categoria: "neutro", motivo: "Comentário sem texto", precisaRevisao: false };

  const base = heuristica(t);
  if (base.nivel === 3) return base;

  const key = process.env["LOVABLE_API_KEY"];
  if (!key) return base;

  try {
    const provider = createLovableAiGatewayProvider(key);
    const { text } = await generateText({
      model: provider(MODEL),
      temperature: 0,
      system: `Você classifica o TOM de comentários em redes sociais de uma agência de viagens brasileira.

Escala:
0 = neutro, elogio, dúvida simpática
1 = dúvida crítica, reclamação educada, discordância respeitosa
2 = ironia, deboche, sarcasmo agressivo, provocação, acusação sem xingamento (ex.: "ai, tudo ao contrário", "que propaganda enganosa")
3 = xingamento, ofensa pessoal, discurso de ódio, ameaça, conteúdo sexual ou preconceituoso

Responda SOMENTE em JSON: {"nivel":0,"categoria":"curta","motivo":"uma frase"}`,
      prompt: t.slice(0, 1200),
    });
    const bruto = text.match(/\{[\s\S]*\}/)?.[0];
    if (!bruto) return base;
    const parsed = JSON.parse(bruto) as { nivel?: number; categoria?: string; motivo?: string };
    const nivelNum = Math.max(0, Math.min(3, Math.round(Number(parsed.nivel ?? 0)))) as 0 | 1 | 2 | 3;
    return {
      nivel: nivelNum,
      categoria: (parsed.categoria ?? "").slice(0, 40) || "não classificado",
      motivo: (parsed.motivo ?? "").slice(0, 200) || "—",
      precisaRevisao: nivelNum >= LIMITE_TOM,
    };
  } catch (err) {
    console.error("[ig-tom] classificação falhou:", (err as Error).message);
    return base;
  }
}
