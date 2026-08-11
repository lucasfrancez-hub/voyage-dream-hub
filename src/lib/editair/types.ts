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

/** Recorte (crop) em frações 0..1 do frame de origem. */
export type Recorte = { x: number; y: number; w: number; h: number };
export const RECORTE_CHEIO: Recorte = { x: 0, y: 0, w: 1, h: 1 };

export const RECORTE_RATIOS: { id: string; nome: string; ratio: number | null }[] = [
  { id: "livre", nome: "Livre", ratio: null },
  { id: "9:16", nome: "9:16", ratio: 9 / 16 },
  { id: "16:9", nome: "16:9", ratio: 16 / 9 },
  { id: "1:1", nome: "1:1", ratio: 1 },
  { id: "4:5", nome: "4:5", ratio: 4 / 5 },
  { id: "4:3", nome: "4:3", ratio: 4 / 3 },
];

export type MascaraTipo = "nenhuma" | "retangulo" | "circulo" | "linear" | "espelho";
export type Mascara = {
  tipo: MascaraTipo;
  /** centro em fração do quadro (0..1) */
  x: number;
  y: number;
  /** tamanho em fração do quadro */
  w: number;
  h: number;
  rotation: number;
  /** suavidade da borda 0..100 */
  feather: number;
  inverter: boolean;
};
export const MASCARA_PADRAO: Mascara = {
  tipo: "nenhuma",
  x: 0.5,
  y: 0.5,
  w: 0.6,
  h: 0.6,
  rotation: 0,
  feather: 20,
  inverter: false,
};

export type BlendMode =
  | "normal"
  | "multiply"
  | "screen"
  | "overlay"
  | "soft-light"
  | "lighten"
  | "darken"
  | "difference";

export const BLEND_MODES: { id: BlendMode; nome: string }[] = [
  { id: "normal", nome: "Normal" },
  { id: "multiply", nome: "Multiplicar" },
  { id: "screen", nome: "Tela" },
  { id: "overlay", nome: "Sobrepor" },
  { id: "soft-light", nome: "Luz suave" },
  { id: "lighten", nome: "Clarear" },
  { id: "darken", nome: "Escurecer" },
  { id: "difference", nome: "Diferença" },
];

/** Ferramentas de aprimoramento (cada uma aplica um tratamento real no render). */
export type Aprimorar = {
  qualidade: boolean;
  ruido: boolean;
  nitidez: boolean;
  rosto: boolean;
  luz: boolean;
  estabilizar: boolean;
  cor: boolean;
};
export const APRIMORAR_PADRAO: Aprimorar = {
  qualidade: false,
  ruido: false,
  nitidez: false,
  rosto: false,
  luz: false,
  estabilizar: false,
  cor: false,
};

export type ChromaKey = { ativo: boolean; cor: string; tolerancia: number; suavidade: number; derrame: number };
export const CHROMA_PADRAO: ChromaKey = { ativo: false, cor: "#00B140", tolerancia: 35, suavidade: 25, derrame: 40 };

export type AnimacaoTipo = "nenhuma" | "fade" | "zoom" | "slide-esq" | "slide-dir" | "subir" | "descer";
export type AnimacaoClip = {
  entrada: AnimacaoTipo;
  saida: AnimacaoTipo;
  duracaoMs: number;
  /** Ken Burns (zoom lento contínuo) */
  kenBurns: boolean;
  loop?: boolean;
};
export const ANIMACAO_PADRAO: AnimacaoClip = { entrada: "nenhuma", saida: "nenhuma", duracaoMs: 500, kenBurns: false };

export const ANIMACOES: { id: AnimacaoTipo; nome: string }[] = [
  { id: "nenhuma", nome: "Nenhuma" },
  { id: "fade", nome: "Fade" },
  { id: "zoom", nome: "Zoom" },
  { id: "slide-esq", nome: "Entrar da esquerda" },
  { id: "slide-dir", nome: "Entrar da direita" },
  { id: "subir", nome: "Subir" },
  { id: "descer", nome: "Descer" },
];

export type FundoModo = "nenhum" | "desfoque" | "cor" | "midia" | "remover";

/** Tratamento automático de fundo (segmentação de pessoa). */
export type Fundo = {
  modo: FundoModo;
  /** intensidade do desfoque 0..100 */
  desfoque: number;
  /** suavidade da borda 0..100 */
  suavidade: number;
  /** expandir (+) ou contrair (-) a máscara -100..100 */
  borda: number;
  /** cor sólida (modo "cor") */
  cor: string;
  /** asset usado como fundo (modo "midia") */
  assetId?: string;
  contorno?: { ativo: boolean; cor: string; largura: number };
  /** estabilidade temporal 0..100 */
  estabilidade: number;
  qualidade: "rapida" | "alta";
};

export const FUNDO_PADRAO: Fundo = {
  modo: "nenhum",
  desfoque: 60,
  suavidade: 45,
  borda: 0,
  cor: "#0B0B0F",
  estabilidade: 60,
  qualidade: "rapida",
  contorno: { ativo: false, cor: "#FFFFFF", largura: 4 },
};

export const FUNDO_PRESETS: { id: string; nome: string; patch: Partial<Fundo> }[] = [
  { id: "leve", nome: "Desfoque leve", patch: { modo: "desfoque", desfoque: 35, suavidade: 40 } },
  { id: "medio", nome: "Desfoque médio", patch: { modo: "desfoque", desfoque: 60, suavidade: 45 } },
  { id: "cinema", nome: "Cinema", patch: { modo: "desfoque", desfoque: 85, suavidade: 55, borda: 4 } },
  { id: "estudio", nome: "Estúdio", patch: { modo: "cor", cor: "#0B0B0F", suavidade: 50 } },
  { id: "recorte", nome: "Recorte limpo", patch: { modo: "remover", suavidade: 30, borda: -4 } },
];

export type KeyProp = "x" | "y" | "scale" | "rotation" | "opacity" | "volume" | "fundoBlur";
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
  /** tratamento de fundo (desfoque/remoção) */
  fundo?: Fundo;
  /** espelhamentos */
  flipH?: boolean;
  flipV?: boolean;
  /** modo de mistura com as camadas abaixo */
  blend?: BlendMode;
  recorte?: Recorte;
  mascara?: Mascara;
  aprimorar?: Aprimorar;
  chroma?: ChromaKey;
  animacao?: AnimacaoClip;
  /** clipe travado (não move nem apara) */
  bloqueado?: boolean;
  /** áudio desvinculado do vídeo */
  semAudio?: boolean;
  reverso?: boolean;
  /** congelar frame: mostra sempre este ponto do source */
  congelado?: boolean;
  pan?: number; // -1 esquerda .. 1 direita
  eq?: { graves: number; medios: number; agudos: number }; // dB -12..12
  compressor?: boolean;
  limiter?: boolean;
  isolarVoz?: boolean;
};

/** Marcadores da timeline. */
export type Marcador = { id: string; atMs: number; cor: string; nota?: string };

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
  marcadores?: Marcador[];
  /** já inserimos automaticamente as mídias iniciais deste projeto (não repetir) */
  assetsIniciaisAplicados?: boolean;
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
    marcadores: [],
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
    marcadores: bruto.marcadores ?? [],
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
