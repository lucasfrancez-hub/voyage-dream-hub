/* Segmentação de pessoa (matting) do EditAir.
   Roda 100% no navegador com MediaPipe Selfie Segmenter e devolve um canvas
   de máscara (alpha = pessoa) já com suavização de borda e estabilidade temporal.
   O mesmo caminho serve para preview e exportação.

   A máscara BRUTA é guardada em cache (memória + IndexedDB) por
   asset + frame + versão do modelo. Refinamentos (feather, expandir/contrair,
   halo) e o contorno são aplicados na hora de desenhar, então mexer em
   cor/espessura do traço NUNCA reprocessa a IA. */
import { FilesetResolver, ImageSegmenter } from "@mediapipe/tasks-vision";
import {
  chaveMascara,
  gravarMascara,
  lerMascara,
  lerMemoria,
  type MascaraBruta,
} from "./mask-cache";

const WASM = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm";
const MODELO_RAPIDO =
  "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite";
const MODELO_ALTA =
  "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter_landscape/float16/latest/selfie_segmenter_landscape.tflite";

/** frames por segundo usados como chave do cache da máscara */
export const FPS_MASCARA = 15;

export type OpcoesMascara = {
  /** suavidade da borda 0..100 */
  suavidade: number;
  /** expandir (+) ou contrair (-) a máscara, -100..100 */
  borda: number;
  /** estabilidade temporal 0..100 (evita "fervura" nas bordas) */
  estabilidade: number;
  qualidade: "rapida" | "alta";
  /** reduzir halo (resquício do fundo antigo) 0..100 */
  halo?: number;
  /** feather extra 0..100 */
  feather?: number;
  /** id do asset — usado como chave do cache */
  assetId?: string;
};

type EstadoClip = {
  anterior: Float32Array | null;
  canvasBaixo: HTMLCanvasElement;
  canvasMascara: HTMLCanvasElement;
  ultimoFrame: number;
  ultimaAssinatura: string;
};

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

export class SegmentadorFundo {
  private segmenter: ImageSegmenter | null = null;
  private carregando: Promise<void> | null = null;
  private qualidadeAtual: "rapida" | "alta" = "rapida";
  private estados = new Map<string, EstadoClip>();
  private ts = 0;
  pronto = false;
  erro: string | null = null;

  async carregar(qualidade: "rapida" | "alta" = "rapida") {
    if (this.segmenter && this.qualidadeAtual === qualidade) return;
    if (this.carregando) return this.carregando;
    this.carregando = (async () => {
      try {
        const fileset = await FilesetResolver.forVisionTasks(WASM);
        const anterior = this.segmenter;
        this.segmenter = await ImageSegmenter.createFromOptions(fileset, {
          baseOptions: {
            modelAssetPath: qualidade === "alta" ? MODELO_ALTA : MODELO_RAPIDO,
            delegate: "GPU",
          },
          runningMode: "VIDEO",
          outputConfidenceMasks: true,
          outputCategoryMask: false,
        });
        anterior?.close();
        this.qualidadeAtual = qualidade;
        this.pronto = true;
        this.erro = null;
      } catch (e) {
        this.erro = e instanceof Error ? e.message : "Falha ao carregar a segmentação";
        this.pronto = false;
      } finally {
        this.carregando = null;
      }
    })();
    return this.carregando;
  }

  private estado(clipId: string): EstadoClip {
    let e = this.estados.get(clipId);
    if (!e) {
      e = {
        anterior: null,
        canvasBaixo: document.createElement("canvas"),
        canvasMascara: document.createElement("canvas"),
        ultimoFrame: -1,
        ultimaAssinatura: "",
      };
      this.estados.set(clipId, e);
    }
    return e;
  }

  esquecer(clipId: string) {
    this.estados.delete(clipId);
  }

  /** Roda o modelo e devolve a máscara bruta em baixa resolução. */
  private inferir(fonte: HTMLVideoElement | HTMLImageElement): MascaraBruta | null {
    if (!this.segmenter || !this.pronto) return null;
    type Res = { confidenceMasks?: Array<{ getAsFloat32Array(): Float32Array; width: number; height: number }> };
    let resultado: Res | null = null;
    try {
      this.ts += 33;
      resultado = this.segmenter.segmentForVideo(fonte as HTMLVideoElement, this.ts) as unknown as Res;
    } catch {
      return null;
    }
    const masks = resultado?.confidenceMasks;
    if (!masks?.length) return null;
    const alvo = masks[masks.length - 1];
    const dados = alvo.getAsFloat32Array();
    const bytes = new Uint8Array(dados.length);
    for (let i = 0; i < dados.length; i++) bytes[i] = Math.round(clamp(dados[i], 0, 1) * 255);
    return { w: alvo.width, h: alvo.height, dados: bytes };
  }

  /** Índice do frame usado como chave do cache. */
  static frameDe(tempoSourceMs: number) {
    return Math.round((tempoSourceMs / 1000) * FPS_MASCARA);
  }

  /**
   * Pré-processa o intervalo do clipe e guarda as máscaras em cache.
   * Reporta progresso 0..100 e pode ser cancelado pelo sinal.
   */
  async precomputar(
    assetId: string,
    video: HTMLVideoElement,
    inicioMs: number,
    fimMs: number,
    qualidade: "rapida" | "alta",
    onProgresso?: (pct: number) => void,
    cancelado?: () => boolean,
  ) {
    await this.carregar(qualidade);
    if (!this.pronto) return false;
    const f0 = SegmentadorFundo.frameDe(inicioMs);
    const f1 = Math.max(f0, SegmentadorFundo.frameDe(fimMs));
    const total = f1 - f0 + 1;
    const tocandoAntes = !video.paused;
    if (tocandoAntes) video.pause();
    const tempoAntes = video.currentTime;

    for (let f = f0; f <= f1; f++) {
      if (cancelado?.()) break;
      const chave = chaveMascara(assetId, qualidade, f);
      if (await lerMascara(chave)) {
        onProgresso?.(Math.round(((f - f0 + 1) / total) * 100));
        continue;
      }
      await procurar(video, (f / FPS_MASCARA) * 1000);
      const bruta = this.inferir(video);
      if (bruta) await gravarMascara(chave, bruta);
      onProgresso?.(Math.round(((f - f0 + 1) / total) * 100));
    }

    try {
      video.currentTime = tempoAntes;
      if (tocandoAntes) void video.play();
    } catch {
      /* ignora */
    }
    onProgresso?.(100);
    return true;
  }

  /**
   * Devolve um canvas (tamanho do vídeo) onde o alpha é a pessoa.
   * Usa o cache quando disponível; senão infere o frame atual.
   */
  mascara(
    clipId: string,
    fonte: HTMLVideoElement | HTMLImageElement,
    tempoSourceMs: number,
    opts: OpcoesMascara,
  ): HTMLCanvasElement | null {
    if (!this.segmenter || !this.pronto) return null;
    const vid = fonte as HTMLVideoElement;
    const vw = vid.videoWidth || (fonte as HTMLImageElement).naturalWidth;
    const vh = vid.videoHeight || (fonte as HTMLImageElement).naturalHeight;
    if (!vw || !vh) return null;

    const est = this.estado(clipId);
    const frame = SegmentadorFundo.frameDe(tempoSourceMs);
    const assinatura = `${opts.suavidade}|${opts.borda}|${opts.estabilidade}|${opts.halo ?? 0}|${opts.feather ?? 0}`;

    if (frame === est.ultimoFrame && assinatura === est.ultimaAssinatura && est.canvasMascara.width) {
      return est.canvasMascara;
    }

    // 1) cache quente
    let bruta: MascaraBruta | null = opts.assetId
      ? lerMemoria(chaveMascara(opts.assetId, opts.qualidade, frame))
      : null;
    // 2) inferência ao vivo (e alimenta o cache)
    if (!bruta) {
      bruta = this.inferir(fonte);
      if (bruta && opts.assetId) void gravarMascara(chaveMascara(opts.assetId, opts.qualidade, frame), bruta);
      if (!bruta && opts.assetId) {
        // enquanto o disco responde, mantém o último quadro válido
        void lerMascara(chaveMascara(opts.assetId, opts.qualidade, frame));
      }
    }
    if (!bruta) return est.canvasMascara.width ? est.canvasMascara : null;

    const mw = bruta.w;
    const mh = bruta.h;
    const n = bruta.dados.length;

    // estabilidade temporal (média exponencial) — evita contorno "fervendo"
    const alfaTemp = 1 - clamp(opts.estabilidade, 0, 95) / 100;
    const atual = new Float32Array(n);
    const anterior = est.anterior && est.anterior.length === n ? est.anterior : null;
    for (let i = 0; i < n; i++) {
      const v = bruta.dados[i] / 255;
      atual[i] = anterior && alfaTemp < 1 ? anterior[i] + (v - anterior[i]) * alfaTemp : v;
    }
    est.anterior = atual;

    // borda: desloca o limiar (contrai/expande a silhueta)
    const halo = clamp(opts.halo ?? 0, 0, 100) / 100;
    const limiar = clamp(0.5 - (opts.borda / 100) * 0.35 + halo * 0.18, 0.05, 0.95);
    const ganho = 6 + halo * 10; // mais contraste na borda = menos resquício do fundo antigo

    const baixo = est.canvasBaixo;
    if (baixo.width !== mw || baixo.height !== mh) {
      baixo.width = mw;
      baixo.height = mh;
    }
    const bctx = baixo.getContext("2d");
    if (!bctx) return null;
    const img = bctx.createImageData(mw, mh);
    for (let i = 0; i < n; i++) {
      const a = clamp((atual[i] - limiar) * ganho + 0.5, 0, 1);
      const p = i * 4;
      img.data[p] = 255;
      img.data[p + 1] = 255;
      img.data[p + 2] = 255;
      img.data[p + 3] = Math.round(a * 255);
    }
    bctx.putImageData(img, 0, 0);

    const mask = est.canvasMascara;
    if (mask.width !== vw || mask.height !== vh) {
      mask.width = vw;
      mask.height = vh;
    }
    const mctx = mask.getContext("2d");
    if (!mctx) return null;
    mctx.setTransform(1, 0, 0, 1, 0, 0);
    mctx.clearRect(0, 0, vw, vh);
    const suave = clamp(opts.suavidade, 0, 100) + clamp(opts.feather ?? 0, 0, 100);
    const feather = (clamp(suave, 0, 200) / 100) * (Math.min(vw, vh) * 0.02);
    mctx.filter = feather > 0.2 ? `blur(${feather.toFixed(1)}px)` : "none";
    mctx.imageSmoothingEnabled = true;
    mctx.imageSmoothingQuality = "high";
    mctx.drawImage(baixo, 0, 0, vw, vh);
    mctx.filter = "none";

    est.ultimoFrame = frame;
    est.ultimaAssinatura = assinatura;
    return mask;
  }

  destruir() {
    this.segmenter?.close();
    this.segmenter = null;
    this.pronto = false;
    this.estados.clear();
  }
}

/** Posiciona o vídeo em um tempo exato e espera o frame ficar disponível. */
function procurar(video: HTMLVideoElement, tempoMs: number) {
  return new Promise<void>((resolve) => {
    const alvo = Math.max(0, tempoMs / 1000);
    if (Math.abs(video.currentTime - alvo) < 1 / (FPS_MASCARA * 2)) return resolve();
    let feito = false;
    const ok = () => {
      if (feito) return;
      feito = true;
      video.removeEventListener("seeked", ok);
      resolve();
    };
    video.addEventListener("seeked", ok);
    try {
      video.currentTime = alvo;
    } catch {
      ok();
    }
    window.setTimeout(ok, 1200);
  });
}
