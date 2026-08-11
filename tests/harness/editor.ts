/* Harness de diagnóstico do pipeline de mídia do EditAir.
   Reproduz, com o código real (bootstrap.ts), a ordem de eventos do editor:
   dados → assets pendentes → canvas → engine → primeiro frame. */
import type { EngineMinima, AssetBasico } from "@/lib/editair/bootstrap";
import { PonteAssets, aplicarAssetsIniciais, midiaParaAsset } from "@/lib/editair/bootstrap";
import { estadoVazio, normalizarEstado, type ProjectState } from "@/lib/editair/types";

export type Chamada = { metodo: string; args: unknown[] };

/** Engine instrumentada: registra tudo que o pipeline pede. */
export class EngineFake implements EngineMinima {
  chamadas: Chamada[] = [];
  carregados = new Set<string>();
  falhas = new Set<string>();
  constructor(private falharEm: string[] = []) {}

  async carregar(assetId: string, url: string, kind: string) {
    this.chamadas.push({ metodo: "carregar", args: [assetId, url, kind] });
    if (this.falharEm.includes(assetId)) this.falhas.add(assetId);
    else this.carregados.add(assetId);
  }
  falhou(assetId: string) {
    return this.falhas.has(assetId);
  }
  desenhar(state: ProjectState, t: number) {
    this.chamadas.push({ metodo: "desenhar", args: [state.clips.length, t] });
  }
  sincronizar(state: ProjectState, t: number, tocando: boolean) {
    this.chamadas.push({ metodo: "sincronizar", args: [state.clips.length, t, tocando] });
  }
  contar(metodo: string) {
    return this.chamadas.filter((c) => c.metodo === metodo).length;
  }
}

export function midiaWeb(over: Partial<AssetBasico> & { id: string }) {
  return {
    nome: "clipe.mp4",
    kind: "video",
    durationMs: 8000,
    url: `https://cdn.exemplo.dev/${over.id}.mp4`,
    thumbUrl: `https://cdn.exemplo.dev/${over.id}.jpg`,
    width: 1080,
    height: 1920,
    ...over,
  };
}

export function midiaDesktop(over: Partial<AssetBasico> & { id: string }) {
  const p = encodeURIComponent(`/Users/lucas/Filmes/${over.id}.mp4`);
  return {
    nome: "clipe.mp4",
    kind: "video",
    durationMs: 8000,
    url: `editair-media://local/?p=${p}`,
    thumbUrl: `editair-media://local/?p=${p}.jpg`,
    local: true,
    existe: true,
    width: 1080,
    height: 1920,
    ...over,
  };
}

/** Simula o ciclo real: abre projeto (sem canvas) e depois monta o canvas. */
export class EditorSimulado {
  state: ProjectState;
  assets: AssetBasico[] = [];
  carregando = true;
  playhead = 0;
  tocando = false;
  engine: EngineFake | null = null;
  ponte: PonteAssets;
  falhasAvisadas: string[] = [];

  constructor(largura = 1080, altura = 1920) {
    this.state = estadoVazio(largura, altura, 30);
    this.ponte = new PonteAssets(
      () => ({ state: this.state, playhead: this.playhead }),
      (a) => this.falhasAvisadas.push(a.id),
    );
  }

  /** Etapa 1A do editor: bootstrap de DADOS, independente do canvas. */
  async abrirProjeto(res: {
    state: ProjectState | null;
    midias: ReturnType<typeof midiaWeb>[];
    width?: number;
    height?: number;
  }) {
    const w = res.width || 1080;
    const h = res.height || 1920;
    let estado = normalizarEstado(res.state ?? estadoVazio(w, h, 30), w, h, 30);
    const lista = res.midias.map(midiaParaAsset);
    this.assets = lista;
    this.ponte.enfileirar(lista);
    estado = aplicarAssetsIniciais(estado, lista, res.midias);
    this.state = estado;
    this.carregando = false;
  }

  /** Etapa 1B: canvas montou → engine criada → pendentes drenados. */
  async montarCanvas(falharEm: string[] = []) {
    if (this.carregando) return;
    this.engine = new EngineFake(falharEm);
    this.ponte.definirEngine(this.engine);
    await this.ponte.drenar(this.assets, () => true);
  }

  /** Importação dentro do projeto (pode acontecer antes ou depois da engine). */
  async importar(midia: ReturnType<typeof midiaWeb>) {
    const a = midiaParaAsset(midia);
    this.assets = [...this.assets.filter((x) => x.id !== a.id), a];
    return this.ponte.carregar(a);
  }

  /** Scrub: mover o playhead com playback pausado deve redesenhar. */
  moverPlayhead(ms: number) {
    this.playhead = ms;
    const eng = this.engine;
    if (!eng || this.tocando) return;
    eng.sincronizar(this.state, ms, false);
    eng.desenhar(this.state, ms);
  }

  /** Persistência: exatamente o que o store grava/lê (JSON puro). */
  salvar() {
    return JSON.parse(JSON.stringify(this.state)) as ProjectState;
  }
}
