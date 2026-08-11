import { aplicarOps, type SourceDurations } from "./ops";
import {
  novoId,
  recalcularDuracao,
  type EditairClip,
  type EditairTrack,
  type ProjectState,
  type Transcript,
} from "./types";

/** Destino de um clipe solto na timeline (camada existente ou camada nova). */
export type DestinoCamada = { tipo: "track"; trackId: string } | { tipo: "nova"; indice: number };

/** Resultado de uma operação de camada: novo estado ou motivo da recusa. */
export type ResultadoCamada = { ok: true; state: ProjectState; trackId?: string } | { ok: false; erro: string };

export type AcaoClip =
  | "dividir"
  | "aparar"
  | "duplicar"
  | "excluir"
  | "ripple"
  | "silenciar"
  | "restaurar"
  | "extrair-audio";

const idxTrack = (s: ProjectState, id: string) => s.tracks.findIndex((t) => t.id === id);
const track = (s: ProjectState, id: string) => s.tracks.find((t) => t.id === id) ?? null;

/** Camada bloqueada (ou clipe travado) impede qualquer edição destrutiva. */
export function podeEditarClip(s: ProjectState, cid: string): { ok: boolean; erro?: string } {
  const c = s.clips.find((x) => x.id === cid);
  if (!c) return { ok: false, erro: "Clipe não encontrado." };
  if (c.bloqueado) return { ok: false, erro: "Clipe bloqueado." };
  if (track(s, c.trackId)?.locked) return { ok: false, erro: "Camada bloqueada." };
  return { ok: true };
}

/** Insere uma camada de vídeo no índice pedido. Índice 0 = topo (aparece por cima). */
export function criarTrackEm(base: ProjectState, indice: number): { state: ProjectState; trackId: string } {
  const n = base.tracks.filter((t) => t.kind === "video").length + 1;
  const nova: EditairTrack = {
    id: `t-video-${n}-${Math.random().toString(36).slice(2, 6)}`,
    kind: "video",
    name: `Vídeo ${n}`,
  };
  const tracks = [...base.tracks];
  tracks.splice(Math.max(0, Math.min(tracks.length, indice)), 0, nova);
  return { state: { ...base, tracks }, trackId: nova.id };
}

/** Soltar um clipe: muda de camada (ou cria uma) e reposiciona no tempo. */
export function soltarClipEm(
  s: ProjectState,
  cid: string,
  destino: DestinoCamada,
  startMs: number,
): ResultadoCamada {
  const clip = s.clips.find((c) => c.id === cid);
  if (!clip) return { ok: false, erro: "Clipe não encontrado." };
  const editavel = podeEditarClip(s, cid);
  if (!editavel.ok) return { ok: false, erro: editavel.erro! };

  let base = s;
  let trackId: string;
  if (destino.tipo === "nova") {
    const r = criarTrackEm(base, destino.indice);
    base = r.state;
    trackId = r.trackId;
  } else {
    trackId = destino.trackId;
    if (!track(base, trackId)) return { ok: false, erro: "Camada inexistente." };
    if (track(base, trackId)?.locked) return { ok: false, erro: "Camada bloqueada." };
  }
  return {
    ok: true,
    trackId,
    state: recalcularDuracao({
      ...base,
      clips: base.clips.map((c) => (c.id === cid ? { ...c, trackId, start: Math.max(0, Math.round(startMs)) } : c)),
    }),
  };
}

/** Move o clipe uma camada acima (-1) ou abaixo (+1) na pilha. */
export function moverClipCamada(s: ProjectState, cid: string, direcao: -1 | 1): ResultadoCamada {
  const clip = s.clips.find((c) => c.id === cid);
  if (!clip) return { ok: false, erro: "Clipe não encontrado." };
  const editavel = podeEditarClip(s, cid);
  if (!editavel.ok) return { ok: false, erro: editavel.erro! };
  const alvo = s.tracks[idxTrack(s, clip.trackId) + direcao];
  if (!alvo) return { ok: false, erro: "Não há camada nessa direção." };
  if (alvo.locked) return { ok: false, erro: "Camada bloqueada." };
  return {
    ok: true,
    trackId: alvo.id,
    state: { ...s, clips: s.clips.map((c) => (c.id === cid ? { ...c, trackId: alvo.id } : c)) },
  };
}

/** Cria uma camada colada ao clipe (acima ou abaixo) e joga o clipe nela. */
export function novaCamadaJunto(s: ProjectState, cid: string, direcao: -1 | 1): ResultadoCamada {
  const clip = s.clips.find((c) => c.id === cid);
  if (!clip) return { ok: false, erro: "Clipe não encontrado." };
  const editavel = podeEditarClip(s, cid);
  if (!editavel.ok) return { ok: false, erro: editavel.erro! };
  const i = idxTrack(s, clip.trackId);
  const { state, trackId } = criarTrackEm(s, direcao === -1 ? i : i + 1);
  return {
    ok: true,
    trackId,
    state: { ...state, clips: state.clips.map((c) => (c.id === cid ? { ...c, trackId } : c)) },
  };
}

/** Reordena a pilha de camadas (índice menor = mais na frente no preview). */
export function reordenarTracks(s: ProjectState, de: number, para: number): ResultadoCamada {
  if (de === para) return { ok: false, erro: "Mesma posição." };
  const tracks = [...s.tracks];
  const [t] = tracks.splice(de, 1);
  if (!t) return { ok: false, erro: "Camada inexistente." };
  tracks.splice(Math.max(0, Math.min(tracks.length, para)), 0, t);
  return { ok: true, state: { ...s, tracks } };
}

export function alternarTrack(
  s: ProjectState,
  trackId: string,
  campo: "muted" | "hidden" | "locked" | "solo",
): ProjectState {
  return { ...s, tracks: s.tracks.map((t) => (t.id === trackId ? { ...t, [campo]: !t[campo] } : t)) };
}

export function excluirTrack(s: ProjectState, trackId: string): ResultadoCamada {
  if (s.clips.some((c) => c.trackId === trackId)) return { ok: false, erro: "A camada não está vazia." };
  if (s.tracks.length <= 1) return { ok: false, erro: "É preciso ao menos uma camada." };
  return { ok: true, state: { ...s, tracks: s.tracks.filter((t) => t.id !== trackId) } };
}

/** Ordem de composição: primeiro da lista de tracks = mais à frente. */
export function ordemDeCamadas(s: ProjectState): string[] {
  return s.tracks.map((t) => t.id);
}

/** Ações do menu de contexto do clipe, como transformação pura de estado. */
export function acaoDeClip(
  s: ProjectState,
  cid: string,
  acao: AcaoClip,
  ctx: { playheadMs: number; transcript?: Transcript | null; duracoesFonte?: SourceDurations } = { playheadMs: 0 },
): ResultadoCamada {
  const c = s.clips.find((x) => x.id === cid);
  if (!c) return { ok: false, erro: "Clipe não encontrado." };
  const editavel = podeEditarClip(s, cid);
  if (!editavel.ok) return { ok: false, erro: editavel.erro! };
  const playhead = ctx.playheadMs;
  const tr = ctx.transcript ?? null;
  const dentro = playhead > c.start && playhead < c.start + c.duration;

  switch (acao) {
    case "dividir": {
      if (!dentro) return { ok: false, erro: "Posicione o playhead dentro do clipe." };
      return { ok: true, state: aplicarOps(s, [{ op: "split_clip", clipId: cid, atMs: playhead }], tr).state };
    }
    case "aparar": {
      if (!dentro) return { ok: false, erro: "Posicione o playhead dentro do clipe." };
      return {
        ok: true,
        state: aplicarOps(s, [{ op: "trim_clip", clipId: cid, durationMs: Math.round(playhead - c.start) }], tr).state,
      };
    }
    case "restaurar":
      return {
        ok: true,
        state: aplicarOps(s, [{ op: "restore_clip", clipId: cid }], tr, ctx.duracoesFonte).state,
      };
    case "duplicar":
      return {
        ok: true,
        state: recalcularDuracao({
          ...s,
          clips: [...s.clips, { ...c, id: novoId(), start: c.start + c.duration }],
        }),
      };
    case "silenciar":
      return { ok: true, state: { ...s, clips: s.clips.map((x) => (x.id === cid ? { ...x, muted: !x.muted } : x)) } };
    case "excluir":
      return { ok: true, state: aplicarOps(s, [{ op: "delete_clip", clipId: cid }], tr).state };
    case "ripple": {
      const semClip = aplicarOps(s, [{ op: "delete_clip", clipId: cid }], tr).state;
      return {
        ok: true,
        state: recalcularDuracao({
          ...semClip,
          clips: semClip.clips.map((x) =>
            x.trackId === c.trackId && x.start >= c.start + c.duration
              ? { ...x, start: Math.max(0, x.start - c.duration) }
              : x,
          ),
        }),
      };
    }
    case "extrair-audio": {
      if (!c.assetId) return { ok: false, erro: "Clipe sem mídia de origem." };
      const destino = s.tracks.find((t) => t.kind === "voice") ?? s.tracks.find((t) => t.kind === "music");
      if (!destino) return { ok: false, erro: "Sem camada de áudio disponível." };
      const audio: EditairClip = {
        ...c,
        id: novoId(),
        trackId: destino.id,
        kind: "audio",
        label: `Áudio · ${c.label ?? ""}`.trim(),
      };
      return {
        ok: true,
        state: {
          ...s,
          clips: [...s.clips.map((x) => (x.id === cid ? { ...x, semAudio: true } : x)), audio],
        },
      };
    }
  }
}

/**
 * Posição final de um menu de contexto com collision detection:
 * vira para cima quando não cabe abaixo e desloca para a esquerda quando
 * não cabe à direita — nunca ultrapassa as bordas da janela.
 */
export function posicionarMenu(
  x: number,
  y: number,
  largura: number,
  altura: number,
  vw: number,
  vh: number,
  margem = 8,
): { x: number; y: number } {
  let ny = y;
  if (ny + altura + margem > vh) ny = y - altura;
  ny = Math.min(Math.max(margem, ny), Math.max(margem, vh - altura - margem));
  let nx = x;
  if (nx + largura + margem > vw) nx = x - largura;
  nx = Math.min(Math.max(margem, nx), Math.max(margem, vw - largura - margem));
  return { x: nx, y: ny };
}
