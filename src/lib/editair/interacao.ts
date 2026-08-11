/* Regras puras de interação da timeline do EditAir:
   limiar de drag, destino vertical (camada) e divisão de altura do editor.
   Ficam aqui para serem testáveis sem DOM e reutilizadas por Timeline/rota. */

import type { DestinoCamada } from "./layers";

/** Deslocamento mínimo (px) antes de começar a arrastar — clique simples só seleciona. */
export const LIMIAR_DRAG_PX = 4;

export function passouLimiar(dx: number, dy: number, limiar = LIMIAR_DRAG_PX): boolean {
  return Math.abs(dx) >= limiar || Math.abs(dy) >= limiar;
}

/* ------------------------ divisão vertical do editor ----------------------- */

/** Altura mínima da área superior (Biblioteca / Preview / Inspector). */
export const MIN_AREA_SUPERIOR = 260;
/** Altura mínima e máxima absolutas da timeline. */
export const MIN_TIMELINE = 150;
export const MAX_TIMELINE = 720;

/**
 * Clampa a altura da timeline garantindo que a área superior (e portanto o
 * Inspector) nunca seja espremida nem escondida.
 */
export function alturaTimelineValida(desejada: number, alturaDisponivel: number): number {
  const teto = Math.max(MIN_TIMELINE, Math.min(MAX_TIMELINE, alturaDisponivel - MIN_AREA_SUPERIOR));
  if (!Number.isFinite(desejada)) return MIN_TIMELINE;
  return Math.round(Math.max(MIN_TIMELINE, Math.min(teto, desejada)));
}

/** Altura resultante da área superior para uma dada altura de timeline. */
export function alturaAreaSuperior(alturaTimeline: number, alturaDisponivel: number): number {
  return Math.max(MIN_AREA_SUPERIOR, alturaDisponivel - alturaTimeline);
}

/* --------------------------- destino vertical ------------------------------ */

export type FaixaTrack = { id: string; top: number; bottom: number };

/** Camada (ou zona de nova camada) sob o cursor, a partir dos retângulos das trilhas. */
export function destinoPorY(clientY: number, faixas: FaixaTrack[]): DestinoCamada | null {
  if (!faixas.length) return null;
  const primeiro = faixas[0]!;
  const ultimo = faixas[faixas.length - 1]!;
  if (clientY < primeiro.top) return { tipo: "nova", indice: 0 };
  if (clientY > ultimo.bottom) return { tipo: "nova", indice: faixas.length };
  for (const f of faixas) if (clientY >= f.top && clientY <= f.bottom) return { tipo: "track", trackId: f.id };
  return null;
}

/**
 * Normaliza o destino de um clip em movimento: retorna null quando o destino é
 * a própria camada de origem ou uma camada bloqueada (nada muda ao soltar).
 */
export function destinoDeClip(
  destino: DestinoCamada | null,
  trackAtualId: string,
  bloqueada: (trackId: string) => boolean,
): DestinoCamada | null {
  if (!destino) return null;
  if (destino.tipo === "track") {
    if (destino.trackId === trackAtualId) return null;
    if (bloqueada(destino.trackId)) return null;
  }
  return destino;
}

/** Tipo de trilha adequado para uma mídia arrastada da biblioteca. */
export function trilhaAlvoDoAsset(kind: string): "video" | "music" {
  return kind === "audio" ? "music" : "video";
}

/** O destino é compatível com a mídia? (áudio não entra em trilha de vídeo e vice-versa) */
export function destinoCompativel(kindAsset: string, kindTrack: string | undefined): boolean {
  if (!kindTrack) return true;
  const audio = kindTrack === "music" || kindTrack === "voice";
  return trilhaAlvoDoAsset(kindAsset) === "music" ? audio : !audio;
}
