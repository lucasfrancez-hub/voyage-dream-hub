// Modelo de estado do EditAir — projeto NÃO destrutivo.
// Nenhuma operação altera o arquivo original: tudo é referência (assetId + in/out).

export type EditairFormat = "vertical" | "feed" | "horizontal" | "quadrado" | "custom";

export const FORMATOS: Record<
  Exclude<EditairFormat, "custom">,
  { label: string; width: number; height: number; ratio: string }
> = {
  vertical: { label: "Reels / TikTok / Shorts", width: 1080, height: 1920, ratio: "9:16" },
  feed: { label: "Feed", width: 1080, height: 1350, ratio: "4:5" },
  horizontal: { label: "YouTube / Horizontal", width: 1920, height: 1080, ratio: "16:9" },
  quadrado: { label: "Quadrado", width: 1080, height: 1080, ratio: "1:1" },
};

export type TrackKind = "text" | "caption" | "broll" | "video" | "voice" | "music";

export type EditairTrack = {
  id: string;
  kind: TrackKind;
  name: string;
  muted?: boolean;
  hidden?: boolean;
  locked?: boolean;
  solo?: boolean;
};

export type Transform = {
  x: number; // px relativos ao centro
  y: number;
  scale: number; // 1 = 100%
  rotation: number; // graus
  opacity: number; // 0..1
};

export type CaptionStyle = {
  fontSize: number;
  color: string;
  activeColor: string;
  stroke: number;
  strokeColor: string;
  background: "none" | "box" | "soft";
  weight: number;
  y: number; // 0..1 posição vertical
  uppercase: boolean;
  fontFamily: string;
  karaoke: boolean;
  animacao: "nenhuma" | "pop" | "subir" | "fade";
};

export const LEGENDA_PADRAO: CaptionStyle = {
  fontSize: 64,
  color: "#FFFFFF",
  activeColor: "#F26B1F",
  stroke: 8,
  strokeColor: "#000000",
  background: "none",
  weight: 800,
  y: 0.78,
  uppercase: true,
  fontFamily: "Inter, system-ui, sans-serif",
  karaoke: true,
  animacao: "pop",
};

export type TextStyle = {
  fontFamily: string;
  fontSize: number;
  weight: number;
  color: string;
  align: "left" | "center" | "right";
  stroke: number;
  strokeColor: string;
  shadow: number;
  shadowColor: string;
  background: "none" | "box" | "soft";
  backgroundColor: string;
  animacao: "nenhuma" | "fade" | "pop" | "subir" | "digitar";
};

export const TEXTO_PADRAO: TextStyle = {
  fontFamily: "Inter, system-ui, sans-serif",
  fontSize: 80,
  weight: 800,
  color: "#FFFFFF",
  align: "center",
  stroke: 10,
  strokeColor: "#000000",
  shadow: 0,
  shadowColor: "#000000",
  background: "none",
  backgroundColor: "#000000",
  animacao: "pop",
};

/** Ajustes de imagem — todos 0 = neutro (exceto onde indicado). */
export type Ajustes = {
  exposicao: number; // -100..100
  brilho: number;
  contraste: number;
  saturacao: number;
  temperatura: number;
  tint: number;
  highlights: number;
  shadows: number;
  whites: number;
  blacks: number;
};

export const AJUSTES_NEUTROS: Ajustes = {
  exposicao: 0,
  brilho: 0,
  contraste: 0,
  saturacao: 0,
  temperatura: 0,
  tint: 0,
  highlights: 0,
  shadows: 0,
  whites: 0,
  blacks: 0,
};

export type FiltroId =
  | "nenhum"
  | "pb"
  | "sepia"
  | "vintage"
  | "frio"
  | "quente"
  | "cinema"
  | "vivido"
  | "desbotado";

export const FILTROS: { id: FiltroId; nome: string }[] = [
  { id: "nenhum", nome: "Nenhum" },
  { id: "pb", nome: "Preto e branco" },
  { id: "sepia", nome: "Sépia" },
  { id: "vintage", nome: "Vintage" },
  { id: "frio", nome: "Frio" },
  { id: "quente", nome: "Quente" },
  { id: "cinema", nome: "Cinema" },
  { id: "vivido", nome: "Vívido" },
  { id: "desbotado", nome: "Desbotado" },
];

export type TransicaoTipo = "fade" | "dissolve" | "slide" | "zoom" | "blur" | "whip";

export const TRANSICOES: { id: TransicaoTipo; nome: string }[] = [
  { id: "fade", nome: "Fade" },
  { id: "dissolve", nome: "Dissolve" },
  { id: "slide", nome: "Slide" },
  { id: "zoom", nome: "Zoom" },
  { id: "blur", nome: "Blur" },
  { id: "whip", nome: "Whip" },
];

export type EfeitoId = "nenhum" | "shake" | "pulso" | "zoom-lento" | "glitch" | "vinheta";

export const EFEITOS: { id: EfeitoId; nome: string; descricao: string }[] = [
  { id: "shake", nome: "Shake", descricao: "Tremida sutil na câmera" },
  { id: "pulso", nome: "Pulso", descricao: "Escala pulsando no ritmo" },
  { id: "zoom-lento", nome: "Zoom lento", descricao: "Ken Burns automático" },
  { id: "glitch", nome: "Glitch", descricao: "Deslocamento digital" },
  { id: "vinheta", nome: "Vinheta", descricao: "Escurece as bordas" },
];

export type KeyProp = "x" | "y" | "scale" | "rotation" | "opacity" | "volume";
export type Keyframe = { prop: KeyProp; atMs: number; value: number };

export type ClipKind = "video" | "audio" | "image" | "text" | "caption";

export type EditairClip = {
  id: string;
  trackId: string;
  kind: ClipKind;
  assetId?: string;
  /** início na timeline, em ms */
  start: number;
  /** duração na timeline, em ms */
  duration: number;
  /** ponto de entrada dentro do arquivo de origem, em ms */
  sourceIn: number;
  volume: number; // 0..2
  muted?: boolean;
  speed: number; // 1 = normal
  transform: Transform;
  text?: string;
  textStyle?: TextStyle;
  captionStyle?: CaptionStyle;
  /** palavras da legenda (tempos absolutos da timeline, em ms) */
  words?: { w: string; start: number; end: number }[];
  label?: string;
  ajustes?: Ajustes;
  filtro?: { id: FiltroId; intensidade: number };
  efeito?: { id: EfeitoId; intensidade: number };
  /** transição de entrada, aplicada entre este clipe e o anterior */
  transicao?: { tipo: TransicaoTipo; durationMs: number };
  fadeInMs?: number;
  fadeOutMs?: number;
  keyframes?: Keyframe[];
};

export type ProjectState = {
  version: 1;
  tracks: EditairTrack[];
  clips: EditairClip[];
  durationMs: number;
  captionStyle: CaptionStyle;
  width: number;
  height: number;
  fps: number;
  ducking?: { ativo: boolean; reducao: number };
  audioFx?: { voz: boolean; ruido: boolean };
};

export type TranscriptWord = { w: string; start: number; end: number; assetId?: string };
export type TranscriptSegment = { start: number; end: number; text: string; assetId?: string };
export type Transcript = {
  words: TranscriptWord[];
  segments: TranscriptSegment[];
};

export type EditairAsset = {
  id: string;
  project_id: string;
  kind: string;
  name: string;
  storage_path: string;
  mime: string | null;
  size_bytes: number | null;
  duration_ms: number | null;
  width: number | null;
  height: number | null;
  meta: Record<string, unknown>;
  created_at: string;
};

export const TRILHAS_PADRAO: EditairTrack[] = [
  { id: "t-text", kind: "text", name: "Texto" },
  { id: "t-caption", kind: "caption", name: "Legendas" },
  { id: "t-broll", kind: "broll", name: "B-roll" },
  { id: "t-video", kind: "video", name: "Vídeo" },
  { id: "t-voice", kind: "voice", name: "Voz" },
  { id: "t-music", kind: "music", name: "Música" },
];

export function estadoVazio(width = 1080, height = 1920, fps = 30): ProjectState {
  return {
    version: 1,
    tracks: TRILHAS_PADRAO.map((t) => ({ ...t })),
    clips: [],
    durationMs: 0,
    captionStyle: { ...LEGENDA_PADRAO },
    width,
    height,
    fps,
    ducking: { ativo: false, reducao: 70 },
    audioFx: { voz: false, ruido: false },
  };
}

/** Completa estados salvos em versões anteriores. */
export function normalizarEstado(bruto: ProjectState, width: number, height: number, fps: number): ProjectState {
  return {
    ...estadoVazio(width, height, fps),
    ...bruto,
    width: bruto.width || width,
    height: bruto.height || height,
    fps: bruto.fps || fps,
    captionStyle: { ...LEGENDA_PADRAO, ...(bruto.captionStyle ?? {}) },
    ducking: bruto.ducking ?? { ativo: false, reducao: 70 },
    audioFx: bruto.audioFx ?? { voz: false, ruido: false },
    tracks: (bruto.tracks?.length ? bruto.tracks : TRILHAS_PADRAO).map((t) => ({ ...t })),
    clips: (bruto.clips ?? []).map((c) => ({ ...c })),
  };
}

export function transformPadrao(): Transform {
  return { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 };
}

export function novoId(prefixo = "c") {
  return `${prefixo}-${Math.random().toString(36).slice(2, 10)}`;
}

export function recalcularDuracao(state: ProjectState): ProjectState {
  const fim = state.clips.reduce((m, c) => Math.max(m, c.start + c.duration), 0);
  return { ...state, durationMs: fim };
}

export function formatarTempo(ms: number, comMs = false) {
  const total = Math.max(0, ms);
  const m = Math.floor(total / 60000);
  const s = Math.floor((total % 60000) / 1000);
  const base = `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  if (!comMs) return base;
  return `${base}.${String(Math.floor(total % 1000)).padStart(3, "0")}`;
}

/** Timecode HH:MM:SS:FF */
export function timecode(ms: number, fps = 30) {
  const total = Math.max(0, ms);
  const h = Math.floor(total / 3_600_000);
  const m = Math.floor((total % 3_600_000) / 60000);
  const s = Math.floor((total % 60000) / 1000);
  const f = Math.floor(((total % 1000) / 1000) * fps);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(h)}:${p(m)}:${p(s)}:${p(f)}`;
}

export function proporcaoDe(width: number, height: number) {
  return width / height;
}
