/* Ponte do EditAir web com o shell desktop (Electron).
   No navegador tudo cai no caminho cloud atual; no desktop usa arquivos locais. */

export type AssetLocal = {
  id: string;
  name: string;
  type: "video" | "audio" | "image";
  localPath: string;
  copiado: boolean;
  durationMs: number;
  width: number;
  height: number;
  fps: number;
  sizeBytes: number;
  videoCodec?: string | null;
  audioCodec?: string | null;
  thumbPath: string | null;
  proxyPath: string | null;
  missing?: boolean;
  importedAt: string;
};


export type SettingsDesktop = {
  cacheDir: string;
  copiarParaBiblioteca: boolean;
  proxyAutomatico: boolean;
  proxyAcimaDe: number;
  updateChannel: "stable" | "beta";
  autoCheckUpdates: boolean;
};

export type InfoDesktop = {
  versao: string;
  plataforma: string;
  arquitetura: string;
  empacotado: boolean;
  capacidades: { hardware: string[]; encoders: string[] };
  settings: SettingsDesktop;
  pastas: { raiz: string; cache: string; projetos: string; biblioteca: string };
};

export type EstadoUpdate = {
  estado: "ocioso" | "verificando" | "disponivel" | "baixando" | "pronto" | "erro" | "atual";
  versao?: string | null;
  changelog?: string | null;
  percentual?: number | null;
  transferido?: number | null;
  total?: number | null;
  mensagem?: string | null;
  canal?: "stable" | "beta";
  exportando?: boolean;
  obrigatoria?: boolean;
};

export type EstadoTranscricaoLocal = {
  disponivel: boolean;
  binario: string;
  versaoPipeline: string;
  modelo: { id: string; arquivo: string; caminho: string; presente: boolean; bytes: number; bytesAprox: number };
  cacheDir: string;
};

export type ResultadoAlinhamentoLocal = {
  words: Array<{ w: string; start: number; end: number; conf?: number }>;
  fonte: "whisper-local";
  modelo: string;
  versaoPipeline: string;
  idioma: string;
  msDecorridos: number;
  cache: boolean;
};

export type ProgressoTranscricao = {
  jobId?: string | null;
  etapa: "modelo" | "audio" | "transcrever" | "alinhar" | "cache";
  percentual?: number;
  recebido?: number;
  total?: number;
};


type PonteDesktop = {
  disponivel: true;
  info(): Promise<InfoDesktop>;
  settings: { ler(): Promise<SettingsDesktop>; salvar(patch: Partial<SettingsDesktop>): Promise<SettingsDesktop> };
  caminhoDoArquivo(file: File): string | null;
  urlLocal(caminho: string): string;
  dialogo: {
    escolherMidias(): Promise<string[]>;
    escolherPasta(): Promise<string | null>;
    localizarArquivo(nome?: string): Promise<string | null>;
    salvarComo(nomeSugerido?: string, pasta?: string): Promise<string | null>;
    pastaExport(): Promise<string>;
  };
  arquivo: {
    abrir(caminho: string): Promise<boolean>;
    revelar(caminho: string): Promise<boolean>;
    /** grava bytes (ex.: mídia gerada por IA) num arquivo real e devolve o caminho */
    salvarBytes?(nome: string, bytes: Uint8Array): Promise<string>;
  };

  diagnostico?: {
    salvarTexto(nome: string, texto: string): Promise<string>;
    devTools(): Promise<boolean>;
    importacao(): Promise<unknown>;
  };




  biblioteca: {
    listar(): Promise<AssetLocal[]>;
    importar(caminhos: string[], opcoes?: { copiar?: boolean }): Promise<AssetLocal[]>;
    remover(id: string, apagarArquivo?: boolean): Promise<boolean>;
    renomear(id: string, nome: string): Promise<AssetLocal>;
    relinkar(id: string, caminho: string): Promise<AssetLocal>;
    revelar(caminho: string): Promise<boolean>;
  };
  midia: {
    probe(caminho: string): Promise<Record<string, unknown>>;
    thumbnail(caminho: string): Promise<string | null>;
    waveform(caminho: string, pontos?: number): Promise<number[]>;
    proxy(caminho: string): Promise<string | null>;
    extrairTrecho(caminho: string, inicioMs: number, fimMs: number, somenteAudio?: boolean): Promise<string>;
  };
  /** alinhador acústico local (whisper.cpp) — fonte oficial dos timestamps */
  transcricao?: {
    estado(): Promise<EstadoTranscricaoLocal>;
    baixarModelo(): Promise<EstadoTranscricaoLocal["modelo"]>;
    local(opcoes: {
      caminho: string;
      idioma?: string;
      inicioMs?: number;
      fimMs?: number | null;
      ignorarCache?: boolean;
      jobId?: string | null;
    }): Promise<ResultadoAlinhamentoLocal>;
    limparCache(): Promise<{ removidos: number }>;
    aoProgredir(cb: (e: ProgressoTranscricao) => void): () => void;
  };
  projeto: {
    listar(): Promise<Array<Record<string, unknown>>>;
    criar(dados: Record<string, unknown>): Promise<Record<string, unknown>>;
    abrir(id: string): Promise<Record<string, unknown>>;
    salvar(id: string, patch: Record<string, unknown>): Promise<Record<string, unknown>>;
    autosave(id: string, estado: Record<string, unknown>): Promise<{ salvoEm: string }>;
    descartarRecuperacao(id: string): Promise<boolean>;
    excluir(id: string): Promise<boolean>;
  };
  cache: {
    tamanho(): Promise<{ bytes: number; caminho: string }>;
    limpar(): Promise<{ bytes: number; caminho: string }>;
    mover(destino: string): Promise<{ caminho: string; settings: SettingsDesktop }>;
  };
  render: {
    iniciar(spec: Record<string, unknown>): Promise<{ id: string; destino: string }>;
    estado(id: string): Promise<Record<string, unknown> | null>;
    aoProgredir(cb: (d: Record<string, unknown>) => void): () => void;
    quadros: {
      iniciar(spec: Record<string, unknown>): Promise<{ id: string; destino: string; encoder?: string; hardware?: boolean; preset?: string }>;
      quadro(id: string, quadro: ArrayBuffer | Uint8Array): Promise<{ frames: number }>;
      repetir(id: string, vezes?: number): Promise<{ frames: number; repetidos: number }>;
      finalizar(id: string): Promise<{ destino: string; bytes?: number }>;
      cancelar(id: string): Promise<boolean>;
    };
    /** exportação híbrida: FFmpeg corta os trechos simples, o canvas só compõe o resto */
    plano?: {
      iniciar(spec: Record<string, unknown>): Promise<{
        id: string;
        destino: string;
        encoder?: string;
        hardware?: boolean;
        preset?: string;
        framesTotais?: number;
      }>;
      compostoIniciar(id: string, indice: number): Promise<{ frames: number }>;
      quadro(id: string, quadro: ArrayBuffer | Uint8Array): Promise<boolean>;
      repetir(id: string, vezes?: number): Promise<boolean>;
      compostoFinalizar(id: string): Promise<boolean>;
      finalizar(id: string): Promise<{ destino: string; bytes?: number; diretoMs?: number }>;
      cancelar(id: string): Promise<boolean>;
    };
  };

  update: {
    estado(): Promise<EstadoUpdate>;
    verificar(): Promise<EstadoUpdate>;
    baixar(): Promise<EstadoUpdate>;
    instalar(forcar?: boolean): Promise<EstadoUpdate>;
    canal(canal: "stable" | "beta"): Promise<{ canal: string }>;
    aoMudar(cb: (e: EstadoUpdate) => void): () => void;
  };
  aoAbrirConfiguracoes(cb: (d: { aba?: string }) => void): () => void;
  aoAcionarMenu(cb: (d: { acao: string }) => void): () => void;
};

declare global {
  interface Window {
    editairDesktop?: PonteDesktop;
  }
}

export function pontoDesktop(): PonteDesktop | null {
  if (typeof window === "undefined") return null;
  return window.editairDesktop ?? null;
}

export function isDesktop() {
  return !!pontoDesktop();
}

/** Caminho real de arquivos vindos de drag-and-drop do Finder/Explorer. */
export function caminhosDeArquivos(lista: FileList | File[] | null): string[] {
  const api = pontoDesktop();
  if (!api || !lista) return [];
  return Array.from(lista)
    .map((f) => api.caminhoDoArquivo(f))
    .filter((p): p is string => !!p);
}

/** Converte um asset local no formato usado pela galeria da UI (sem upload). */
export function assetLocalParaMidia(a: AssetLocal) {
  const api = pontoDesktop();
  const existe = a.missing !== true;
  return {
    id: a.id,
    nome: a.name,
    kind: a.type,
    durationMs: a.durationMs ?? 0,
    width: a.width ?? 0,
    height: a.height ?? 0,
    sizeBytes: a.sizeBytes ?? 0,
    storagePath: a.localPath,
    thumbPath: a.thumbPath,
    url: api && existe ? api.urlLocal(a.proxyPath || a.localPath) : "",
    thumbUrl: a.thumbPath && api ? api.urlLocal(a.thumbPath) : null,
    criadoEm: a.importedAt ?? new Date().toISOString(),
    local: true as const,
    localPath: a.localPath,
    existe,
    fps: a.fps ?? 30,
  };
}


export function formatarBytes(bytes: number) {
  if (!bytes) return "0 B";
  const u = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(u.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / 1024 ** i).toFixed(i >= 2 ? 1 : 0)} ${u[i]}`;
}
