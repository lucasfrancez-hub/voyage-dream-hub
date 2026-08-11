import { recalcularDuracao, type EditairClip, type ProjectState } from "./types";

/**
 * Velocidade no EditAir.
 *
 * Regra única: a timeline mostra a DURAÇÃO REAL de reprodução.
 *   timelineDuration = (sourceOut - sourceIn) / speed
 *
 * A referência ao arquivo original nunca é destruída: sourceIn/sourceOut
 * continuam apontando para o mesmo trecho da fonte, só a leitura muda de ritmo.
 */

export const VELOCIDADE_MIN = 0.25;
export const VELOCIDADE_MAX = 4;

export const limitarVelocidade = (v: number) =>
  Math.min(VELOCIDADE_MAX, Math.max(VELOCIDADE_MIN, Number.isFinite(v) ? v : 1));

export type JanelaFonte = {
  sourceIn: number;
  sourceOut: number;
  /** trecho da fonte realmente utilizado, em ms de fonte */
  sourceDuration: number;
  speed: number;
  timelineDuration: number;
};

/** Janela de fonte utilizada por um clipe. */
export function janelaFonte(clip: EditairClip): JanelaFonte {
  const speed = limitarVelocidade(clip.speed || 1);
  const sourceIn = Math.max(0, clip.sourceIn || 0);
  const sourceDuration = Math.max(1, clip.duration * speed);
  return {
    sourceIn,
    sourceOut: sourceIn + sourceDuration,
    sourceDuration,
    speed,
    timelineDuration: clip.duration,
  };
}

/** duração na timeline = duração da fonte utilizada / velocidade */
export function duracaoTimeline(sourceDurationMs: number, speed: number) {
  return Math.max(50, Math.round(sourceDurationMs / limitarVelocidade(speed)));
}

/** Conversão usada por preview e exportação — precisa ser exatamente a mesma. */
export function tempoFonte(clip: EditairClip, timelineMs: number) {
  return (clip.sourceIn || 0) + (timelineMs - clip.start) * limitarVelocidade(clip.speed || 1);
}

const desloca = (c: EditairClip, delta: number): EditairClip => ({
  ...c,
  start: Math.max(0, Math.round(c.start + delta)),
  words: c.words?.map((w) => ({ ...w, start: Math.round(w.start + delta), end: Math.round(w.end + delta) })),
});

/**
 * Aplica velocidade a um clipe mantendo a janela de fonte e recalculando
 * a duração visual, as legendas vinculadas e (com ripple) os clipes seguintes.
 */
export function aplicarVelocidade(
  state: ProjectState,
  clipId: string,
  velocidade: number,
  opts: { ripple?: boolean } = {},
): ProjectState {
  const ripple = opts.ripple ?? true;
  const clip = state.clips.find((c) => c.id === clipId);
  if (!clip) return state;

  const speed = limitarVelocidade(velocidade);
  const j = janelaFonte(clip);
  const novaDuracao = duracaoTimeline(j.sourceDuration, speed);
  const duracaoAntiga = Math.max(1, clip.duration);
  const delta = novaDuracao - duracaoAntiga;
  if (delta === 0 && speed === j.speed) return state;

  const fator = novaDuracao / duracaoAntiga;
  const fimAntigo = clip.start + duracaoAntiga;

  const clips = state.clips.map((c) => {
    if (c.id === clip.id) {
      return { ...c, speed, sourceIn: j.sourceIn, duration: novaDuracao };
    }
    const sobrepoe = c.start < fimAntigo && c.start + c.duration > clip.start;
    const vinculavel = c.kind === "caption" || c.kind === "text";
    if (vinculavel && sobrepoe) {
      // legenda/texto colado na fala deste clipe: acompanha o novo ritmo
      const novoStart = clip.start + (c.start - clip.start) * fator;
      const escalarPalavra = (ms: number) => Math.round(clip.start + (ms - clip.start) * fator);
      return {
        ...c,
        start: Math.max(0, Math.round(novoStart)),
        duration: Math.max(80, Math.round(c.duration * fator)),
        words: c.words?.map((w) => ({ ...w, start: escalarPalavra(w.start), end: escalarPalavra(w.end) })),
      };
    }
    if (ripple && delta !== 0 && c.start >= fimAntigo && (c.trackId === clip.trackId || vinculavel)) {
      return desloca(c, delta);
    }
    return c;
  });

  return recalcularDuracao({ ...state, clips });
}
