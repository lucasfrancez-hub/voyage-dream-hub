import type { EditairClip } from "./types";

/**
 * Edição manual do texto de uma legenda.
 *
 * Conteúdo, timing e estilo ficam separados: mexer no texto NUNCA muda
 * `start`/`duration` nem o estilo do clipe. Os timestamps por palavra
 * (usados no destaque karaokê) são remapeados dentro do mesmo intervalo,
 * preservando o tempo original das palavras que continuam iguais.
 *
 * A legenda editada vira `textoManual`, e a geração automática nunca mais
 * sobrescreve esse bloco.
 */
export function aplicarTextoLegenda(clip: EditairClip, texto: string): Partial<EditairClip> {
  const limpo = texto.replace(/\s+/g, " ").trim();
  const novas = limpo ? limpo.split(" ") : [];
  const antigas = clip.words ?? [];
  const inicio = clip.start;
  const fim = clip.start + clip.duration;

  let words: { w: string; start: number; end: number }[] | undefined;
  if (novas.length) {
    const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
    const passo = (fim - inicio) / novas.length;
    let cursor = 0;
    words = novas.map((w, i) => {
      // procura a mesma palavra adiante na lista original para manter o tempo real
      const achou = antigas.findIndex((a, idx) => idx >= cursor && norm(a.w) === norm(w));
      if (achou >= 0) {
        cursor = achou + 1;
        const a = antigas[achou]!;
        return { w, start: a.start, end: a.end };
      }
      const start = Math.round(inicio + i * passo);
      return { w, start, end: Math.round(Math.min(fim, start + passo)) };
    });
    // mantém a ordem crescente mesmo com palavras novas no meio
    for (let i = 1; i < words.length; i++) {
      if (words[i]!.start < words[i - 1]!.start) {
        words[i] = { ...words[i]!, start: words[i - 1]!.start, end: Math.max(words[i]!.end, words[i - 1]!.end) };
      }
    }
  }

  return {
    text: limpo,
    words,
    textoManual: true,
    label: limpo.slice(0, 20),
  };
}

/** A legenda foi corrigida à mão? Então a transcrição não manda mais nela. */
export const legendaManual = (c: EditairClip) => c.kind === "caption" && c.textoManual === true;
