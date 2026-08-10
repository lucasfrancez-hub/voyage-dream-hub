import {
  type EditairClip,
  type ProjectState,
  type Transcript,
  novoId,
  recalcularDuracao,
  transformPadrao,
} from "./types";

/**
 * Operações estruturadas do EditAir.
 * A IA nunca escreve no estado diretamente — ela emite estas operações,
 * o que mantém tudo reversível (undo/redo) e auditável.
 */
export type EditairOp =
  | { op: "split_clip"; clipId: string; atMs: number }
  | { op: "trim_clip"; clipId: string; startMs?: number; durationMs?: number }
  | { op: "move_clip"; clipId: string; startMs: number; trackId?: string }
  | { op: "delete_clip"; clipId: string }
  | { op: "delete_range"; fromMs: number; toMs: number; ripple?: boolean }
  | { op: "set_volume"; clipId?: string; trackId?: string; volume: number }
  | { op: "set_transform"; clipId: string; scale?: number; x?: number; y?: number; opacity?: number; rotation?: number }
  | { op: "set_speed"; clipId: string; speed: number }
  | { op: "add_text"; text: string; startMs: number; durationMs: number }
  | { op: "add_caption_style"; fontSize?: number; y?: number; color?: string; activeColor?: string; uppercase?: boolean }
  | { op: "rebuild_captions"; mode?: "frase" | "palavra" }
  | { op: "remove_captions" }
  | { op: "mute_track"; trackId: string; muted: boolean }
  | { op: "delete_text_range"; query: string };

export type OpResult = { state: ProjectState; log: string[] };

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

function ordenar(clips: EditairClip[]) {
  return [...clips].sort((a, b) => a.start - b.start);
}

/** Fecha buracos na trilha, mantendo a ordem (ripple). */
export function fecharBuracos(state: ProjectState, trackIds: string[]): ProjectState {
  const clips = [...state.clips];
  for (const trackId of trackIds) {
    const daTrilha = ordenar(clips.filter((c) => c.trackId === trackId));
    let cursor = 0;
    for (const c of daTrilha) {
      const idx = clips.findIndex((x) => x.id === c.id);
      clips[idx] = { ...c, start: cursor };
      cursor += c.duration;
    }
  }
  return recalcularDuracao({ ...state, clips });
}

export function aplicarOps(state: ProjectState, ops: EditairOp[], transcript?: Transcript | null): OpResult {
  let s: ProjectState = { ...state, clips: [...state.clips], tracks: [...state.tracks] };
  const log: string[] = [];

  for (const op of ops) {
    switch (op.op) {
      case "split_clip": {
        const c = s.clips.find((x) => x.id === op.clipId);
        if (!c || op.atMs <= c.start || op.atMs >= c.start + c.duration) break;
        const offset = op.atMs - c.start;
        const a: EditairClip = { ...c, duration: offset };
        const b: EditairClip = {
          ...c,
          id: novoId(),
          start: op.atMs,
          duration: c.duration - offset,
          sourceIn: c.sourceIn + offset * c.speed,
          words: c.words?.filter((w) => w.start >= op.atMs),
        };
        a.words = c.words?.filter((w) => w.start < op.atMs);
        s.clips = s.clips.flatMap((x) => (x.id === c.id ? [a, b] : [x]));
        log.push("Clipe dividido");
        break;
      }
      case "trim_clip": {
        s.clips = s.clips.map((c) => {
          if (c.id !== op.clipId) return c;
          const next = { ...c };
          if (op.startMs != null) {
            const delta = op.startMs - c.start;
            next.start = op.startMs;
            next.sourceIn = Math.max(0, c.sourceIn + delta * c.speed);
            next.duration = Math.max(100, c.duration - delta);
          }
          if (op.durationMs != null) next.duration = Math.max(100, op.durationMs);
          return next;
        });
        log.push("Clipe ajustado");
        break;
      }
      case "move_clip": {
        s.clips = s.clips.map((c) =>
          c.id === op.clipId
            ? { ...c, start: Math.max(0, op.startMs), trackId: op.trackId ?? c.trackId }
            : c,
        );
        log.push("Clipe movido");
        break;
      }
      case "delete_clip": {
        s.clips = s.clips.filter((c) => c.id !== op.clipId);
        log.push("Clipe removido");
        break;
      }
      case "delete_range": {
        const { fromMs, toMs } = op;
        const novos: EditairClip[] = [];
        for (const c of s.clips) {
          const fim = c.start + c.duration;
          if (fim <= fromMs || c.start >= toMs) {
            novos.push(c);
            continue;
          }
          if (c.start < fromMs) {
            novos.push({ ...c, duration: fromMs - c.start });
          }
          if (fim > toMs) {
            const offset = toMs - c.start;
            novos.push({
              ...c,
              id: novoId(),
              start: toMs,
              duration: fim - toMs,
              sourceIn: c.sourceIn + offset * c.speed,
            });
          }
        }
        s.clips = novos;
        if (op.ripple !== false) {
          const gap = toMs - fromMs;
          s.clips = s.clips.map((c) => (c.start >= toMs ? { ...c, start: c.start - gap } : c));
        }
        log.push(`Trecho removido (${((toMs - fromMs) / 1000).toFixed(1)}s)`);
        break;
      }
      case "set_volume": {
        s.clips = s.clips.map((c) => {
          const alvo = op.clipId ? c.id === op.clipId : op.trackId ? c.trackId === op.trackId : false;
          return alvo ? { ...c, volume: clamp(op.volume, 0, 2) } : c;
        });
        log.push(`Volume em ${Math.round(op.volume * 100)}%`);
        break;
      }
      case "set_transform": {
        s.clips = s.clips.map((c) =>
          c.id === op.clipId
            ? {
                ...c,
                transform: {
                  ...c.transform,
                  scale: op.scale ?? c.transform.scale,
                  x: op.x ?? c.transform.x,
                  y: op.y ?? c.transform.y,
                  opacity: op.opacity ?? c.transform.opacity,
                  rotation: op.rotation ?? c.transform.rotation,
                },
              }
            : c,
        );
        log.push("Enquadramento ajustado");
        break;
      }
      case "set_speed": {
        s.clips = s.clips.map((c) =>
          c.id === op.clipId ? { ...c, speed: clamp(op.speed, 0.25, 4) } : c,
        );
        log.push(`Velocidade ${op.speed}x`);
        break;
      }
      case "add_text": {
        s.clips = [
          ...s.clips,
          {
            id: novoId("txt"),
            trackId: "t-text",
            kind: "text",
            start: Math.max(0, op.startMs),
            duration: Math.max(400, op.durationMs),
            sourceIn: 0,
            volume: 1,
            speed: 1,
            transform: { ...transformPadrao(), y: -300 },
            text: op.text,
            label: op.text.slice(0, 24),
          },
        ];
        log.push("Texto adicionado");
        break;
      }
      case "add_caption_style": {
        s.captionStyle = {
          ...s.captionStyle,
          fontSize: op.fontSize ?? s.captionStyle.fontSize,
          y: op.y ?? s.captionStyle.y,
          color: op.color ?? s.captionStyle.color,
          activeColor: op.activeColor ?? s.captionStyle.activeColor,
          uppercase: op.uppercase ?? s.captionStyle.uppercase,
        };
        log.push("Estilo da legenda atualizado");
        break;
      }
      case "remove_captions": {
        s.clips = s.clips.filter((c) => c.kind !== "caption");
        log.push("Legendas removidas");
        break;
      }
      case "rebuild_captions": {
        s = { ...s, clips: s.clips.filter((c) => c.kind !== "caption") };
        if (transcript?.words?.length) {
          s = { ...s, clips: [...s.clips, ...gerarLegendas(s, transcript, op.mode ?? "frase")] };
          log.push("Legendas regeradas");
        }
        break;
      }
      case "mute_track": {
        s.tracks = s.tracks.map((t) => (t.id === op.trackId ? { ...t, muted: op.muted } : t));
        log.push(op.muted ? "Trilha silenciada" : "Trilha ativada");
        break;
      }
      case "delete_text_range": {
        const alvo = acharTrechoNaTranscricao(transcript, op.query);
        if (alvo) {
          const r = aplicarOps(s, [{ op: "delete_range", fromMs: alvo.start, toMs: alvo.end, ripple: true }], transcript);
          s = r.state;
          log.push(`Removido: "${op.query}"`);
        } else {
          log.push(`Não encontrei "${op.query}" na transcrição`);
        }
        break;
      }
    }
  }

  return { state: recalcularDuracao(s), log };
}

/** Busca aproximada de um trecho falado na transcrição. */
export function acharTrechoNaTranscricao(transcript: Transcript | null | undefined, query: string) {
  if (!transcript?.words?.length) return null;
  const norm = (t: string) =>
    t
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9 ]/g, "")
      .trim();
  const alvo = norm(query).split(/\s+/).filter(Boolean);
  if (!alvo.length) return null;
  const palavras = transcript.words;
  let melhor: { i: number; score: number } | null = null;
  for (let i = 0; i <= palavras.length - 1; i++) {
    let acertos = 0;
    for (let j = 0; j < alvo.length && i + j < palavras.length; j++) {
      if (norm(palavras[i + j].w) === alvo[j]) acertos++;
    }
    const score = acertos / alvo.length;
    if (!melhor || score > melhor.score) melhor = { i, score };
  }
  if (!melhor || melhor.score < 0.5) return null;
  const fimIdx = Math.min(palavras.length - 1, melhor.i + alvo.length - 1);
  return { start: palavras[melhor.i].start, end: palavras[fimIdx].end };
}

/** Monta clipes de legenda agrupando palavras em frases curtas. */
export function gerarLegendas(
  state: ProjectState,
  transcript: Transcript,
  modo: "frase" | "palavra" = "frase",
): EditairClip[] {
  const clips: EditairClip[] = [];
  const palavras = transcript.words.filter((w) => w.end > w.start);
  if (!palavras.length) return clips;

  if (modo === "palavra") {
    for (const w of palavras) {
      clips.push(criarLegenda(w.w, w.start, w.end - w.start, [{ ...w }]));
    }
    return clips;
  }

  let bloco: typeof palavras = [];
  const empurrar = () => {
    if (!bloco.length) return;
    const texto = bloco.map((w) => w.w).join(" ");
    clips.push(criarLegenda(texto, bloco[0].start, bloco[bloco.length - 1].end - bloco[0].start, bloco.map((w) => ({ ...w }))));
    bloco = [];
  };

  for (const w of palavras) {
    bloco.push(w);
    const texto = bloco.map((x) => x.w).join(" ");
    const anterior = bloco[bloco.length - 2];
    const pausa = anterior ? w.start - anterior.end : 0;
    if (texto.length >= 34 || bloco.length >= 7 || pausa > 420 || /[.!?]$/.test(w.w)) empurrar();
  }
  empurrar();
  return clips;
}

function criarLegenda(texto: string, start: number, duration: number, words: { w: string; start: number; end: number }[]): EditairClip {
  return {
    id: novoId("leg"),
    trackId: "t-caption",
    kind: "caption",
    start,
    duration: Math.max(300, duration),
    sourceIn: 0,
    volume: 1,
    speed: 1,
    transform: transformPadrao(),
    text: texto,
    words,
    label: texto.slice(0, 20),
  };
}
