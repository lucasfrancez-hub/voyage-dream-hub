/* Fonte única de verdade sobre "o que será exportado".
   Toda duração de export, EDL e mapeamento timeline -> arquivo de origem
   passa por aqui, para que preview e render final nunca divirjam. */
import type { EditairClip, ProjectState } from "./types";

export type DuracoesFonte = Record<string, number>;

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/** velocidade normalizada do clipe (nunca 0) */
export function velocidadeDe(c: EditairClip) {
  return clamp(c.speed || 1, 0.25, 4);
}

/**
 * Duração REAL do clipe na timeline, em ms.
 * Considera a velocidade e nunca ultrapassa o que resta do arquivo de origem
 * a partir de sourceIn — é isso que corrige exportações com a duração do
 * arquivo original em vez do trecho usado.
 */
export function duracaoEfetiva(c: EditairClip, duracoesFonte?: DuracoesFonte) {
  const dur = Math.max(0, c.duration || 0);
  if (!c.assetId || !duracoesFonte) return dur;
  const fonte = duracoesFonte[c.assetId];
  if (!fonte || !Number.isFinite(fonte)) return dur;
  if (c.kind === "image" || c.kind === "text" || c.kind === "caption") return dur;
  const disponivel = Math.max(0, (fonte - Math.max(0, c.sourceIn || 0)) / velocidadeDe(c));
  return Math.min(dur, Math.round(disponivel));
}

/** clipes que realmente entram no render (com duração > 0) */
export function clipesDaComposicao(state: ProjectState, duracoesFonte?: DuracoesFonte) {
  return state.clips
    .filter((c) => duracaoEfetiva(c, duracoesFonte) > 0)
    .map((c) => ({ clip: c, start: Math.max(0, c.start || 0), duracao: duracaoEfetiva(c, duracoesFonte) }));
}

/**
 * Duração da composição = fim do último clipe da timeline.
 * NÃO é a duração do arquivo importado.
 */
export function duracaoComposicao(state: ProjectState, duracoesFonte?: DuracoesFonte) {
  return clipesDaComposicao(state, duracoesFonte).reduce((m, c) => Math.max(m, c.start + c.duracao), 0);
}

/** posição (ms) dentro do arquivo de origem para um instante da timeline */
export function tempoNaFonte(c: EditairClip, tMs: number) {
  return Math.max(0, (c.sourceIn || 0) + (tMs - c.start) * velocidadeDe(c));
}

export function dentroDoClipe(c: EditairClip, tMs: number, duracoesFonte?: DuracoesFonte) {
  const d = duracaoEfetiva(c, duracoesFonte);
  return tMs >= c.start && tMs < c.start + d;
}

export type SegmentoAudio = {
  clipId: string;
  path: string;
  /** ms dentro do arquivo */
  sourceInMs: number;
  sourceOutMs: number;
  /** ms na timeline */
  delayMs: number;
  volume: number;
  speed: number;
};

/**
 * Plano de áudio para o render nativo: cada clipe audível vira um input com
 * atrim + atempo + adelay, misturados no final.
 */
export function planoDeAudio(
  state: ProjectState,
  caminhos: Record<string, string | undefined>,
  duracoesFonte?: DuracoesFonte,
): SegmentoAudio[] {
  const temSolo = state.tracks.some((t) => t.solo);
  const out: SegmentoAudio[] = [];
  for (const { clip, start, duracao } of clipesDaComposicao(state, duracoesFonte)) {
    if (clip.kind === "image" || clip.kind === "text" || clip.kind === "caption") continue;
    if (!clip.assetId) continue;
    const trilha = state.tracks.find((t) => t.id === clip.trackId);
    if (temSolo && !trilha?.solo) continue;
    if (clip.muted || (clip as { semAudio?: boolean }).semAudio || trilha?.muted) continue;
    const p = caminhos[clip.assetId];
    if (!p) continue;
    const speed = velocidadeDe(clip);
    out.push({
      clipId: clip.id,
      path: p,
      sourceInMs: Math.max(0, clip.sourceIn || 0),
      sourceOutMs: Math.max(0, (clip.sourceIn || 0) + duracao * speed),
      delayMs: start,
      volume: clamp(clip.volume ?? 1, 0, 2),
      speed,
    });
  }
  return out;
}

/** tamanho estimado do arquivo final, em bytes */
export function estimarBytes(opts: {
  duracaoMs: number;
  videoBps: number;
  audioBps: number;
  comVideo: boolean;
  comAudio: boolean;
}) {
  const s = Math.max(0, opts.duracaoMs) / 1000;
  const bps = (opts.comVideo ? opts.videoBps : 0) + (opts.comAudio ? opts.audioBps : 0);
  return Math.round((bps * s) / 8);
}

export function formatarBytes(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`;
  return `${(b / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
