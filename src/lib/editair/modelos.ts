/**
 * Modelos do EditAir — guarda as camadas gráficas (texto, legenda, stickers)
 * de um projeto para reaproveitar em outro. Mídias não entram no modelo,
 * assim o modelo nunca quebra por arquivo faltando.
 */
import type { EditairClip, CaptionStyle, ProjectState } from "./types";

export type ModeloEditair = {
  id: string;
  nome: string;
  criadoEm: number;
  duracaoMs: number;
  capa?: string | null;
  clips: EditairClip[];
  captionStyle?: CaptionStyle;
};

const CHAVE = "editair:modelos";

export function lerModelos(): ModeloEditair[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const bruto = localStorage.getItem(CHAVE);
    const lista = bruto ? (JSON.parse(bruto) as ModeloEditair[]) : [];
    return Array.isArray(lista) ? lista.sort((a, b) => b.criadoEm - a.criadoEm) : [];
  } catch {
    return [];
  }
}

function gravar(lista: ModeloEditair[]) {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(lista));
  } catch {
    /* cota cheia — ignora */
  }
}

/** clips que fazem parte de um modelo (somente camadas gráficas) */
export function clipsDoModelo(state: ProjectState): EditairClip[] {
  return state.clips.filter((c) => c.kind === "text" || c.kind === "caption");
}

export function salvarModelo(nome: string, state: ProjectState, capa?: string | null): ModeloEditair | null {
  const clips = clipsDoModelo(state);
  if (!clips.length) return null;
  const base = Math.min(...clips.map((c) => c.start));
  const modelo: ModeloEditair = {
    id: `mod_${Date.now().toString(36)}`,
    nome: nome.trim() || "Modelo sem nome",
    criadoEm: Date.now(),
    duracaoMs: Math.max(...clips.map((c) => c.start + c.duration)) - base,
    capa: capa ?? null,
    captionStyle: state.captionStyle,
    clips: clips.map((c) => ({ ...c, start: c.start - base })),
  };
  gravar([modelo, ...lerModelos()]);
  return modelo;
}

export function excluirModelo(id: string) {
  gravar(lerModelos().filter((m) => m.id !== id));
}

export function renomearModelo(id: string, nome: string) {
  gravar(lerModelos().map((m) => (m.id === id ? { ...m, nome } : m)));
}

/** devolve os clips do modelo posicionados a partir de `offsetMs`, com ids novos */
export function instanciarModelo(modelo: ModeloEditair, offsetMs: number, novoId: () => string): EditairClip[] {
  return modelo.clips.map((c) => ({ ...c, id: novoId(), start: Math.max(0, Math.round(offsetMs + c.start)) }));
}
