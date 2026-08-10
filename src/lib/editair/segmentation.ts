/* Segmentação de pessoa (matting) do EditAir.
   Roda 100% no navegador com MediaPipe Selfie Segmenter e devolve um canvas
   de máscara (alpha = pessoa) já com suavização de borda e estabilidade temporal.
   O mesmo caminho serve para preview e exportação. */
import { FilesetResolver, ImageSegmenter } from "@mediapipe/tasks-vision";

const WASM = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm";
const MODELO_RAPIDO =
  "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite";
const MODELO_ALTA =
  "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter_landscape/float16/latest/selfie_segmenter_landscape.tflite";

export type OpcoesMascara = {
  /** suavidade da borda 0..100 */
  suavidade: number;
  /** expandir (+) ou contrair (-) a máscara, -100..100 */
  borda: number;
  /** estabilidade temporal 0..100 (evita "fervura" nas bordas) */
  estabilidade: number;
  qualidade: "rapida" | "alta";
};

type EstadoClip = {
  anterior: Float32Array | null;
  canvasBaixo: HTMLCanvasElement;
  canvasMascara: HTMLCanvasElement;
  ultimoTs: number;
  ultimoFrame: number;
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
        ultimoTs: -1,
        ultimoFrame: -1,
      };
      this.estados.set(clipId, e);
    }
    return e;
  }

  esquecer(clipId: string) {
    this.estados.delete(clipId);
  }

  /**
   * Devolve um canvas (tamanho do vídeo) onde o alpha é a pessoa.
   * Retorna null enquanto o modelo não estiver pronto.
   */
  mascara(
    clipId: string,
    video: HTMLVideoElement,
    tempoMs: number,
    opts: OpcoesMascara,
  ): HTMLCanvasElement | null {
    if (!this.segmenter || !this.pronto) return null;
    if (video.readyState < 2 || !video.videoWidth) return null;
    const est = this.estado(clipId);
    const frame = Math.round(tempoMs / 16);

    // reaproveita a última máscara quando o frame não mudou
    if (frame === est.ultimoFrame && est.canvasMascara.width) return est.canvasMascara;

    type Res = { confidenceMasks?: Array<{ getAsFloat32Array(): Float32Array; width: number; height: number }> };
    let resultado: Res | null = null;
    try {
      this.ts += 33;
      resultado = this.segmenter.segmentForVideo(video, this.ts) as unknown as Res;
    } catch {
      return est.canvasMascara.width ? est.canvasMascara : null;
    }
    const masks = resultado?.confidenceMasks;
    if (!masks?.length) return est.canvasMascara.width ? est.canvasMascara : null;

    // no selfie segmenter, o último mask é a pessoa (0 = fundo)
    const alvo = masks[masks.length - 1];
    const dados = alvo.getAsFloat32Array();
    const mw = alvo.width;
    const mh = alvo.height;

    // estabilidade temporal (média exponencial)
    const alfaTemp = 1 - clamp(opts.estabilidade, 0, 95) / 100;
    let atual = dados;
    if (est.anterior && est.anterior.length === dados.length && alfaTemp < 1) {
      const mix = new Float32Array(dados.length);
      for (let i = 0; i < dados.length; i++) {
        mix[i] = est.anterior[i] + (dados[i] - est.anterior[i]) * alfaTemp;
      }
      atual = mix;
    }
    est.anterior = atual;

    // borda: desloca o limiar (contrai/expande a silhueta)
    const limiar = clamp(0.5 - (opts.borda / 100) * 0.35, 0.05, 0.95);
    const ganho = 6;

    const baixo = est.canvasBaixo;
    if (baixo.width !== mw || baixo.height !== mh) {
      baixo.width = mw;
      baixo.height = mh;
    }
    const bctx = baixo.getContext("2d");
    if (!bctx) return null;
    const img = bctx.createImageData(mw, mh);
    for (let i = 0; i < atual.length; i++) {
      const a = clamp((atual[i] - limiar) * ganho + 0.5, 0, 1);
      const p = i * 4;
      img.data[p] = 255;
      img.data[p + 1] = 255;
      img.data[p + 2] = 255;
      img.data[p + 3] = Math.round(a * 255);
    }
    bctx.putImageData(img, 0, 0);

    const vw = video.videoWidth;
    const vh = video.videoHeight;
    const mask = est.canvasMascara;
    if (mask.width !== vw || mask.height !== vh) {
      mask.width = vw;
      mask.height = vh;
    }
    const mctx = mask.getContext("2d");
    if (!mctx) return null;
    mctx.setTransform(1, 0, 0, 1, 0, 0);
    mctx.clearRect(0, 0, vw, vh);
    const feather = (clamp(opts.suavidade, 0, 100) / 100) * (Math.min(vw, vh) * 0.02);
    mctx.filter = feather > 0.2 ? `blur(${feather.toFixed(1)}px)` : "none";
    mctx.imageSmoothingEnabled = true;
    mctx.imageSmoothingQuality = "high";
    mctx.drawImage(baixo, 0, 0, vw, vh);
    mctx.filter = "none";

    est.ultimoFrame = frame;
    est.ultimoTs = tempoMs;
    return mask;
  }

  destruir() {
    this.segmenter?.close();
    this.segmenter = null;
    this.pronto = false;
    this.estados.clear();
  }
}
