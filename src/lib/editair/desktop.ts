/* Ponte do EditAir web com o shell desktop (Electron).
   No navegador tudo cai no caminho cloud atual; no desktop usa arquivos locais. */

export type AssetLocal = {
  id: string;
  nome: string;
  kind: "video" | "audio" | "image";
  localPath: string;
  copiado: boolean;
  durationMs: number;
  width: number;
  height: number;
  fps: number;
  sizeBytes: number;
  thumbPath: string | null;
  proxyPath: string | null;
  existe: boolean;
  criadoEm: string;
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
    salvarComo(nomeSugerido?: string): Promise<string | null>;
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
  return {
    id: a.id,
    nome: a.nome,
    kind: a.kind,
    durationMs: a.durationMs,
    width: a.width,
    height: a.height,
    sizeBytes: a.sizeBytes,
    storagePath: a.localPath,
    thumbPath: a.thumbPath,
    url: api ? api.urlLocal(a.proxyPath || a.localPath) : "",
    thumbUrl: a.thumbPath && api ? api.urlLocal(a.thumbPath) : null,
    criadoEm: a.criadoEm,
    local: true as const,
    localPath: a.localPath,
    existe: a.existe,
    fps: a.fps,
  };
}

export function formatarBytes(bytes: number) {
  if (!bytes) return "0 B";
  const u = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(u.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / 1024 ** i).toFixed(i >= 2 ? 1 : 0)} ${u[i]}`;
}
