/* Pipeline de mídia do EditAir (Web e Desktop).
   Fica fora do componente de rota para poder ser testado sem navegador:
   normalização de mídia → AssetItem, fila de pendentes até a engine existir
   e criação (uma única vez) dos clipes iniciais de um projeto novo. */
import {
  novoId,
  recalcularDuracao,
  transformPadrao,
  type EditairClip,
  type ProjectState,
} from "./types";

export type AssetBasico = {
  id: string;
  nome: string;
  kind: string;
  durationMs: number;
  url: string;
  thumbUrl?: string | null;
  local?: boolean;
  existe?: boolean;
};

/** Forma mínima de uma mídia vinda do store (nuvem ou disco local). */
export type MidiaBasica = {
  id: string;
  nome: string;
  kind: string;
  durationMs: number;
  url: string;
  thumbUrl?: string | null;
  local?: boolean;
  existe?: boolean;
  width?: number;
  height?: number;
};

/** Só o que o pipeline precisa da engine — permite instrumentar/mockar nos testes. */
export type EngineMinima = {
  carregar(assetId: string, url: string, kind: string): Promise<void>;
  falhou(assetId: string): boolean;
  desenhar(state: ProjectState, t: number): void;
  sincronizar(state: ProjectState, t: number, tocando: boolean): void;
};

/** Web (https://…) e Desktop (editair-media://…) produzem a MESMA estrutura. */
export function midiaParaAsset(m: MidiaBasica): AssetBasico {
  return {
    id: m.id,
    nome: m.nome,
    kind: m.kind,
    durationMs: m.durationMs,
    url: m.url,
    thumbUrl: m.thumbUrl ?? null,
    local: m.local,
    existe: m.existe,
  };
}

export function duracaoDeAsset(a: AssetBasico) {
  return Math.max(1000, a.durationMs || (a.kind === "image" ? 5000 : 3000));
}

export function trilhaDeAsset(a: AssetBasico) {
  return a.kind === "audio" ? "t-music" : "t-video";
}

export function clipDeAsset(a: AssetBasico, start: number, trackId = trilhaDeAsset(a)): EditairClip {
  return {
    id: novoId(),
    trackId,
    kind: a.kind === "audio" ? "audio" : a.kind === "image" ? "image" : "video",
    assetId: a.id,
    start,
    duration: duracaoDeAsset(a),
    sourceIn: 0,
    volume: 1,
    speed: 1,
    transform: transformPadrao(),
    label: a.nome.slice(0, 28),
  };
}

/** Clipes iniciais: cada mídia entra em sequência na trilha correspondente. */
export function clipsIniciais(lista: AssetBasico[]): EditairClip[] {
  const clips: EditairClip[] = [];
  const fim: Record<string, number> = {};
  for (const a of lista) {
    const trilha = trilhaDeAsset(a);
    const inicio = fim[trilha] ?? 0;
    const clip = clipDeAsset(a, inicio, trilha);
    clips.push(clip);
    fim[trilha] = inicio + clip.duration;
  }
  return clips;
}

/**
 * Aplica as mídias do projeto na timeline UMA ÚNICA VEZ.
 * Se o usuário apagou os clipes de propósito, `assetsIniciaisAplicados` impede recriar.
 */
export function aplicarAssetsIniciais(
  estado: ProjectState,
  lista: AssetBasico[],
  midias: MidiaBasica[] = [],
): ProjectState {
  const jaAplicado = estado.assetsIniciaisAplicados === true || estado.clips.length > 0;
  if (jaAplicado) {
    return estado.assetsIniciaisAplicados ? estado : { ...estado, assetsIniciaisAplicados: true };
  }
  if (!lista.length) return { ...estado, assetsIniciaisAplicados: true };

  let novo = recalcularDuracao({
    ...estado,
    clips: clipsIniciais(lista),
    assetsIniciaisAplicados: true,
  });
  const dim = midias.find((m) => (m.width ?? 0) > 0 && (m.height ?? 0) > 0);
  if (dim) novo = { ...novo, width: dim.width as number, height: dim.height as number };
  return novo;
}

type Contexto = () => { state: ProjectState; playhead: number };

/**
 * Ponte assets ↔ engine. Assets que chegam antes da engine existir ficam
 * pendentes e são entregues assim que a engine é criada (canvas montado).
 */
export class PonteAssets {
  private pendentes = new Map<string, AssetBasico>();
  private engine: EngineMinima | null = null;

  constructor(
    private ctx: Contexto,
    private aoFalhar?: (a: AssetBasico, erro?: unknown) => void,
  ) {}

  definirEngine(engine: EngineMinima | null) {
    this.engine = engine;
  }

  temEngine() {
    return !!this.engine;
  }

  enfileirar(lista: AssetBasico[]) {
    for (const a of lista) this.pendentes.set(a.id, a);
  }

  pendentesIds() {
    return [...this.pendentes.keys()];
  }

  temPendente(id: string) {
    return this.pendentes.has(id);
  }

  limpar() {
    this.pendentes.clear();
    this.engine = null;
  }

  /** Carrega o asset na engine; sem engine ainda, guarda para depois. */
  async carregar(a: AssetBasico): Promise<"carregado" | "pendente" | "ignorado" | "falhou"> {
    if (!a.url) {
      this.pendentes.delete(a.id);
      console.warn(`[media] asset sem url assetId=${a.id}`);
      return "ignorado";
    }
    const eng = this.engine;
    if (!eng) {
      this.pendentes.set(a.id, a);
      console.log(`[engine] asset ${a.id} aguardando engine`);
      return "pendente";
    }
    this.pendentes.delete(a.id);
    try {
      await eng.carregar(a.id, a.url, a.kind);
      const { state, playhead } = this.ctx();
      eng.desenhar(state, playhead);
      if (eng.falhou(a.id)) {
        this.aoFalhar?.(a);
        return "falhou";
      }
      return "carregado";
    } catch (e) {
      console.error(`[preview:error] falha ao carregar asset=${a.id}`, e);
      this.aoFalhar?.(a, e);
      return "falhou";
    }
  }

  /** Entrega à engine tudo que ainda não foi carregado e pinta o primeiro frame. */
  async drenar(lista: AssetBasico[], vivo: () => boolean = () => true) {
    const eng = this.engine;
    if (!eng) return;
    const fila = lista.filter((a) => a.url && (this.pendentes.has(a.id) || a.existe !== false));
    for (const a of fila) {
      if (!vivo()) return;
      await this.carregar(a);
    }
    if (!vivo()) return;
    const { state, playhead } = this.ctx();
    eng.sincronizar(state, playhead, false);
    eng.desenhar(state, playhead);
  }
}
