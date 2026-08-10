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
};

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
  captionStyle?: CaptionStyle;
  /** palavras da legenda (tempos absolutos da timeline, em ms) */
  words?: { w: string; start: number; end: number }[];
  label?: string;
};

export type ProjectState = {
  version: 1;
  tracks: EditairTrack[];
  clips: EditairClip[];
  durationMs: number;
  captionStyle: CaptionStyle;
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

export function estadoVazio(): ProjectState {
  return {
    version: 1,
    tracks: TRILHAS_PADRAO.map((t) => ({ ...t })),
    clips: [],
    durationMs: 0,
    captionStyle: { ...LEGENDA_PADRAO },
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
