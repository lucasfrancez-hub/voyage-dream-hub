import { novoId, transformPadrao, type EditairClip, type ProjectState, type Transcript, type TranscriptWord } from "./types";
import { janelaFonte, limitarVelocidade } from "./velocidade";
import { segmentarLegendas } from "./segmentacao";


/**
 * Legendas do EditAir.
 *
 * A TIMELINE é a verdade do projeto. A transcrição conhece o arquivo original
 * inteiro (e pode ficar em cache por asset), mas as legendas visíveis são
 * sempre a projeção da transcrição sobre os trechos realmente usados:
 *
 *   timeline = clip.start + (tempoFonte - clip.sourceIn) / clip.speed
 *
 * Trecho cortado da timeline não vira legenda. Um mesmo asset usado em vários
 * clipes gera legendas em cada clipe, sem transcrever o arquivo de novo.
 */

export type JanelaClipe = {
  clipId: string;
  assetId?: string;
  sourceIn: number;
  sourceOut: number;
  start: number;
  speed: number;
  fimTimeline: number;
};

const COM_FALA = new Set(["video", "audio"]);

/** Janelas de fonte com áudio que existem hoje na timeline, em ordem. */
export function janelasDaTimeline(state: ProjectState, assetId?: string): JanelaClipe[] {
  return state.clips
    .filter((c) => COM_FALA.has(c.kind) && !c.muted && !c.semAudio && !c.congelado)
    .filter((c) => (assetId ? c.assetId === assetId : true))
    .map((c) => {
      const j = janelaFonte(c);
      return {
        clipId: c.id,
        assetId: c.assetId,
        sourceIn: j.sourceIn,
        sourceOut: j.sourceOut,
        start: c.start,
        speed: j.speed,
        fimTimeline: c.start + c.duration,
      };
    })
    .sort((a, b) => a.start - b.start);
}

const paraTimeline = (j: JanelaClipe, tempoFonteMs: number) =>
  j.start + (tempoFonteMs - j.sourceIn) / limitarVelocidade(j.speed);

export type PalavraProjetada = { w: string; start: number; end: number; clipId: string };

/**
 * Recorta a transcrição pelas janelas da timeline e converte os tempos de
 * fonte em tempos de timeline (respeitando velocidade). Palavras de trechos
 * removidos simplesmente não entram.
 */
export function projetarPalavras(words: TranscriptWord[], janelas: JanelaClipe[]): PalavraProjetada[] {
  const saida: PalavraProjetada[] = [];
  for (const j of janelas) {
    for (const w of words) {
      if (w.assetId && j.assetId && w.assetId !== j.assetId) continue;
      const ini = Math.max(w.start, j.sourceIn);
      const fim = Math.min(w.end, j.sourceOut);
      if (fim <= ini) continue; // palavra fora do trecho usado
      saida.push({
        w: w.w,
        start: Math.round(paraTimeline(j, ini)),
        end: Math.round(paraTimeline(j, fim)),
        clipId: j.clipId,
      });
    }
  }
  return saida.sort((a, b) => a.start - b.start || a.end - b.end);
}

function criarLegenda(texto: string, palavras: PalavraProjetada[], clipId: string): EditairClip {
  const start = palavras[0]!.start;
  const fim = palavras[palavras.length - 1]!.end;
  return {
    id: novoId("leg"),
    trackId: "t-caption",
    kind: "caption",
    start: Math.max(0, Math.round(start)),
    duration: Math.max(300, Math.round(fim - start)),
    sourceIn: 0,
    volume: 1,
    speed: 1,
    transform: transformPadrao(),
    text: texto,
    words: palavras.map((p) => ({ w: p.w, start: p.start, end: p.end })),
    linkClipId: clipId,
    label: texto.slice(0, 20),
  };
}

/**
 * Monta as legendas NOVAS, já projetadas na timeline atual.
 * Legendas corrigidas à mão (`textoManual`) continuam no projeto e não são
 * regeradas: nenhum bloco novo nasce por cima delas.
 */
export function montarLegendas(
  state: ProjectState,
  transcript: Transcript,
  modo: "frase" | "palavra" = "frase",
): EditairClip[] {
  const manuais = state.clips.filter((c) => c.kind === "caption" && c.textoManual);
  const colide = (start: number, fim: number) =>
    manuais.some((m) => start < m.start + m.duration && fim > m.start);

  const janelas = janelasDaTimeline(state);
  if (!janelas.length) return [];
  const palavras = projetarPalavras(
    (transcript.words ?? []).filter((w) => w.end > w.start),
    janelas,
  ).filter((p) => p.end > p.start);
  if (!palavras.length) return [];

  const geradas =
    modo === "palavra"
      ? palavras.map((p) => criarLegenda(p.w, [p], p.clipId))
      : // agrupamento pela fala (pontuação → pausa → sentido → limite visual)
        segmentarLegendas(palavras).map((bloco) =>
          criarLegenda(
            bloco.map((p) => p.w).join(" "),
            bloco as PalavraProjetada[],
            (bloco[0] as PalavraProjetada).clipId,
          ),
        );

  return geradas.filter((g) => !colide(g.start, g.start + g.duration));

}


/** Move um clipe (e as palavras da legenda, que usam tempo de timeline). */
export function deslocarClip(c: EditairClip, delta: number): EditairClip {
  if (!delta) return c;
  return {
    ...c,
    start: Math.max(0, Math.round(c.start + delta)),
    words: c.words?.map((w) => ({ ...w, start: Math.round(w.start + delta), end: Math.round(w.end + delta) })),
  };
}

/**
 * Reage a um trecho removido da timeline: legendas ligadas ao intervalo saem,
 * as seguintes acompanham o ripple. Nada de legenda órfã.
 */
export function ajustarLegendasAoRemover(
  clips: EditairClip[],
  fromMs: number,
  toMs: number,
  opts: { ripple?: boolean; clipIds?: string[] } = {},
): EditairClip[] {
  const gap = Math.max(0, toMs - fromMs);
  const vinculadas = new Set(opts.clipIds ?? []);
  const saida: EditairClip[] = [];
  for (const c of clips) {
    if (c.kind !== "caption" && c.kind !== "text") {
      saida.push(c);
      continue;
    }
    const fim = c.start + c.duration;
    const dentro = c.start < toMs && fim > fromMs;
    if (dentro && (c.kind === "caption" || vinculadas.has(c.linkClipId ?? ""))) continue; // conteúdo não existe mais
    if (c.linkClipId && vinculadas.has(c.linkClipId)) continue;
    saida.push(opts.ripple !== false && c.start >= toMs ? deslocarClip(c, -gap) : c);
  }
  return saida;
}
