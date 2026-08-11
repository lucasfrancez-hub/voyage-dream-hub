/* Estado puro do layout do EditAir.

   Regra estrutural: a altura da timeline e as larguras das colunas da área
   superior são estados INDEPENDENTES. Arrastar o splitter horizontal só pode
   alterar `alturaTimeline`; nenhuma largura pode ser recalculada por causa
   disso. Estas funções existem para poderem ser testadas sem DOM. */

import { MIN_AREA_SUPERIOR, MIN_TIMELINE, MAX_TIMELINE } from "./interacao";

/** Alturas fixas que participam da coluna vertical do editor. */
export const ALTURA_HEADER_APP = 56; // header global do EditAir
export const ALTURA_TOPBAR = 46; // barra de ações do editor
export const ALTURA_SPLITTER = 6; // divisor arrastável

/** Larguras estruturais da área superior (não mudam com o splitter). */
export const LARGURAS_WORKSPACE = {
  rail: 76,
  biblioteca: 300,
  bibliotecaXl: 340,
  inspector: 282,
  inspectorXl: 312,
  minPlayer: 320,
  minPlayerXl: 420,
} as const;

export type LayoutWorkspace = {
  /** altura da timeline em px */
  alturaTimeline: number;
  /** larguras estruturais em px — imutáveis durante o resize vertical */
  larguraBiblioteca: number;
  larguraInspector: number;
};

/**
 * Espaço realmente distribuível entre área superior e timeline, já descontando
 * header global, topbar e o próprio splitter. Ignorar o splitter fazia a soma
 * das linhas estourar o container e criar scroll/reflow horizontal.
 */
export function alturaDistribuivel(alturaJanela: number): number {
  return Math.max(0, alturaJanela - ALTURA_HEADER_APP - ALTURA_TOPBAR - ALTURA_SPLITTER);
}

/** Clampa a altura da timeline preservando a área superior utilizável. */
export function clampAlturaTimeline(desejada: number, alturaDistribuivelPx: number): number {
  const teto = Math.max(MIN_TIMELINE, Math.min(MAX_TIMELINE, alturaDistribuivelPx - MIN_AREA_SUPERIOR));
  if (!Number.isFinite(desejada)) return MIN_TIMELINE;
  return Math.round(Math.max(MIN_TIMELINE, Math.min(teto, desejada)));
}

/**
 * Aplica um arrasto do splitter. `deltaY` é o deslocamento do ponteiro para
 * cima em px (subir = timeline cresce). Retorna um layout novo em que APENAS
 * `alturaTimeline` pode ter mudado.
 */
export function redimensionarTimeline(
  layout: LayoutWorkspace,
  deltaY: number,
  alturaDistribuivelPx: number,
): LayoutWorkspace {
  return {
    ...layout,
    alturaTimeline: clampAlturaTimeline(layout.alturaTimeline + deltaY, alturaDistribuivelPx),
  };
}

/** Linhas do workspace: superior flexível, splitter fixo, timeline fixa. */
export function gridRowsWorkspace(alturaTimeline: number): string {
  return `${ALTURA_TOPBAR}px minmax(${MIN_AREA_SUPERIOR}px, 1fr) ${ALTURA_SPLITTER}px ${Math.round(alturaTimeline)}px`;
}

export { MIN_AREA_SUPERIOR, MIN_TIMELINE, MAX_TIMELINE };
