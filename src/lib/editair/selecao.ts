import type { EditairClip, ProjectState } from "./types";

/** Retângulo de seleção em coordenadas da timeline: tempo (ms) × camadas. */
export type CaixaSelecao = { fromMs: number; toMs: number; trackIds: string[] };

/** Faixa vertical ocupada por uma camada na tela. */
export type FaixaTrack = { id: string; top: number; bottom: number };

const norm = (a: number, b: number) => (a <= b ? [a, b] : [b, a]) as [number, number];

/** Camadas cujo retângulo vertical é tocado pela caixa desenhada com o mouse. */
export function tracksNaFaixa(faixas: FaixaTrack[], y1: number, y2: number): string[] {
  const [topo, base] = norm(y1, y2);
  return faixas.filter((f) => f.bottom > topo && f.top < base).map((f) => f.id);
}

/** Uma camada aceita edição? (bloqueada = intocável para operações destrutivas) */
export function trackEditavel(state: ProjectState, trackId: string): boolean {
  return !state.tracks.find((t) => t.id === trackId)?.locked;
}

/** Clip pode entrar na seleção (não está em camada bloqueada nem travado). */
export function clipSelecionavel(state: ProjectState, clip: EditairClip): boolean {
  return !clip.bloqueado && trackEditavel(state, clip.trackId);
}

/**
 * Clips interceptados pelo retângulo: basta *tocar* o clip (interseção),
 * não precisa envolvê-lo por inteiro. Atravessa quantas camadas a caixa cobrir.
 * Camadas bloqueadas ficam de fora — nunca entram numa seleção que pode apagar.
 */
export function clipsNaCaixa(state: ProjectState, caixa: CaixaSelecao): string[] {
  const [de, ate] = norm(caixa.fromMs, caixa.toMs);
  const tracks = new Set(caixa.trackIds);
  return state.clips
    .filter(
      (c) =>
        tracks.has(c.trackId) &&
        clipSelecionavel(state, c) &&
        c.start < ate &&
        c.start + c.duration > de,
    )
    .map((c) => c.id);
}

/** União mantendo a ordem e sem repetir (seleção aditiva com Shift). */
export function unir(base: string[], novos: string[]): string[] {
  const set = new Set(base);
  const out = [...base];
  for (const id of novos) if (!set.has(id)) (set.add(id), out.push(id));
  return out;
}

/** Shift + clique: adiciona ou remove aquele clip da seleção. */
export function alternar(selecao: string[], id: string): string[] {
  return selecao.includes(id) ? selecao.filter((x) => x !== id) : [...selecao, id];
}

/** Cmd+A: todos os clips editáveis da timeline. */
export function selecionarTudo(state: ProjectState): string[] {
  return state.clips.filter((c) => clipSelecionavel(state, c)).map((c) => c.id);
}

/** "Selecionar todos nesta camada" (menu do cabeçalho da track). */
export function selecionarTrack(state: ProjectState, trackId: string): string[] {
  if (!trackEditavel(state, trackId)) return [];
  return state.clips.filter((c) => c.trackId === trackId && !c.bloqueado).map((c) => c.id);
}

/** Só os ids que ainda existem e são editáveis (usado antes de apagar/mover). */
export function selecaoEditavel(state: ProjectState, ids: string[]): string[] {
  const set = new Set(ids);
  return state.clips.filter((c) => set.has(c.id) && clipSelecionavel(state, c)).map((c) => c.id);
}

/**
 * Move o conjunto mantendo as distâncias relativas: o delta é o mesmo para todos
 * e é limitado para que nenhum clip fique com start negativo.
 * Retorna patches (não muda o state) — a seleção continua sendo só estado de UI.
 */
export function moverSelecao(
  state: ProjectState,
  ids: string[],
  deltaMs: number,
): Record<string, Partial<EditairClip>> {
  const alvos = state.clips.filter((c) => ids.includes(c.id) && clipSelecionavel(state, c));
  if (!alvos.length) return {};
  const minStart = Math.min(...alvos.map((c) => c.start));
  const delta = Math.round(Math.max(deltaMs, -minStart));
  const patches: Record<string, Partial<EditairClip>> = {};
  for (const c of alvos) patches[c.id] = { start: c.start + delta };
  return patches;
}
