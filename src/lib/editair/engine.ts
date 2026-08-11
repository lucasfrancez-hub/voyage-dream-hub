/* Motor de preview e render do EditAir: desenha a timeline num canvas e mixa o áudio.
   Só roda no navegador. Preview e exportação usam exatamente o mesmo caminho de render. */
import type { SegmentadorFundo } from "./segmentation";
import {
  AJUSTES_NEUTROS,
  RECORTE_CHEIO,
  type ChromaKey,
  type Ajustes,
  type CaptionStyle,
  type EditairClip,
  type KeyProp,
  type ProjectState,
  type TextStyle,
  TEXTO_PADRAO,
} from "./types";

type Midia = {
  el: HTMLVideoElement;
  gain: GainNode;
  entrada: AudioNode | null;
  /** true = áudio sai direto do elemento (mídia local, sem CORS para o WebAudio) */
  nativo?: boolean;
  filtros: {
    hp: BiquadFilterNode;
    comp: DynamicsCompressorNode;
    low: BiquadFilterNode;
    mid: BiquadFilterNode;
    high: BiquadFilterNode;
    pan: StereoPannerNode | null;
    limiter: DynamicsCompressorNode;
  } | null;
};

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

export class EditairEngine {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  private ctx: CanvasRenderingContext2D;
  private audioCtx: AudioContext | null = null;
  private streamDest: MediaStreamAudioDestinationNode | null = null;
  private master: GainNode | null = null;
  private midias = new Map<string, Midia>();
  private imagens = new Map<string, HTMLImageElement>();
  /** assets que falharam ao carregar — desenhados como "Mídia offline" */
  private falhas = new Set<string>();
  /** causa real da falha (código do <video>, MIME, estado da rede) por asset */
  private detalhes = new Map<string, FalhaMidia>();
  /** último quadro pedido — usado para repintar quando o vídeo termina de buscar */
  private ultimo: { state: ProjectState; t: number } | null = null;
  private tocandoAgora = false;

  private volumeMaster = 1;
  private mudo = false;
  /** escala física do canvas em relação ao tamanho lógico do projeto */
  private escala = 1;
  /** segmentação de pessoa para tratamento de fundo */
  private seg: SegmentadorFundo | null = null;
  private off: HTMLCanvasElement | null = null;
  private maskCanvas: HTMLCanvasElement | null = null;

  constructor(canvas: HTMLCanvasElement, width: number, height: number) {
    this.canvas = canvas;
    this.width = width;
    this.height = height;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas indisponível");
    this.ctx = ctx;
  }

  redimensionar(width: number, height: number, escala = this.escala) {
    const pw = Math.max(2, Math.round(width * escala));
    const ph = Math.max(2, Math.round(height * escala));
    if (this.width === width && this.height === height && this.canvas.width === pw) return;
    this.width = width;
    this.height = height;
    this.escala = escala;
    this.canvas.width = pw;
    this.canvas.height = ph;
  }

  definirEscala(escala: number) {
    this.redimensionar(this.width, this.height, escala);
  }

  private garantirAudio() {
    if (this.audioCtx) return this.audioCtx;
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.audioCtx = new AC();
    this.master = this.audioCtx.createGain();
    this.master.gain.value = 1;
    this.streamDest = this.audioCtx.createMediaStreamDestination();
    this.master.connect(this.audioCtx.destination);
    this.master.connect(this.streamDest);
    return this.audioCtx;
  }

  /** true quando o asset não pôde ser decodificado (arquivo movido, URL expirada…). */
  falhou(assetId: string) {
    return this.falhas.has(assetId);
  }

  async carregar(assetId: string, url: string, kind = "video") {
    if ((this.midias.has(assetId) || this.imagens.has(assetId)) && !this.falhas.has(assetId)) return;
    // Relink ou uma nova URL de proxy deve substituir a tentativa que falhou.
    const anterior = this.midias.get(assetId);
    if (anterior) {
      anterior.el.pause();
      anterior.el.removeAttribute("src");
      anterior.el.load();
      try { anterior.entrada?.disconnect(); } catch { /* já desconectado */ }
      try { anterior.gain.disconnect(); } catch { /* já desconectado */ }
      this.midias.delete(assetId);
    }
    this.imagens.delete(assetId);
    this.falhas.delete(assetId);
    // Arquivos locais do Desktop vêm pelo protocolo editair-media:// — pedir CORS
    // ("anonymous") faz o Chromium recusar a mídia e o preview fica preto.
    const local = url.startsWith("editair-media:") || url.startsWith("blob:") || url.startsWith("file:");
    const log = (etapa: string, extra?: unknown) =>
      console.log(`[preview] ${etapa} asset=${assetId} url=${url.slice(0, 80)}`, extra ?? "");

    if (kind === "image") {
      const img = new Image();
      if (!local) img.crossOrigin = "anonymous";
      img.src = url;
      await new Promise<void>((resolve) => {
        let terminou = false;
        const ok = () => {
          if (terminou) return;
          terminou = true;
          resolve();
        };
        img.onload = () => {
          this.falhas.delete(assetId);
          ok();
        };
        img.onerror = () => {
          this.falhas.add(assetId);
          console.error(`[preview:error] imagem não carregou asset=${assetId}`);
          ok();
        };
        setTimeout(() => {
          if (!terminou && !img.complete) this.falhas.add(assetId);
          ok();
        }, 10000);
      });
      this.imagens.set(assetId, img);
      this.redesenhar();
      return;
    }
    const el = document.createElement("video");
    if (!local) el.crossOrigin = "anonymous";
    el.preload = "auto";
    el.playsInline = true;
    el.muted = false;
    el.src = url;
    el.load();
    log("carregando");
    await new Promise<void>((resolve) => {
      let terminou = false;
      const ok = () => {
        if (terminou) return;
        terminou = true;
        resolve();
      };
      el.onloadeddata = () => {
        this.falhas.delete(assetId);
        log("metadata loaded", { w: el.videoWidth, h: el.videoHeight, dur: el.duration });
        ok();
      };
      el.onerror = () => {
        this.falhas.add(assetId);
        console.error(`[preview:error] mídia não carregou asset=${assetId}`, el.error?.message);
        ok();
      };
      setTimeout(() => {
        if (!terminou && el.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
          this.falhas.add(assetId);
          console.error(`[preview:error] tempo esgotado ao carregar asset=${assetId}`, {
            networkState: el.networkState,
            readyState: el.readyState,
          });
        }
        ok();
      }, 10000);
    });
    // o preview precisa repintar quando o vídeo termina de buscar o frame
    el.addEventListener("seeked", () => this.redesenhar());
    el.addEventListener("loadeddata", () => this.redesenhar());
    el.addEventListener("canplay", () => {
      log("canplay");
      this.redesenhar();
    });
    const ctx = this.garantirAudio();

    if (local) {
      // Mídia local: o WebAudio silenciaria o elemento (sem CORS no protocolo próprio),
      // então o áudio sai direto do <video> e o volume é controlado no elemento.
      const gainLocal = ctx.createGain();
      gainLocal.gain.value = 1;
      this.midias.set(assetId, { el, gain: gainLocal, entrada: null, nativo: true, filtros: null });
      this.redesenhar();
      return;
    }

    const src = ctx.createMediaElementSource(el);
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 20;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = 0;
    comp.ratio.value = 1;
    const low = ctx.createBiquadFilter();
    low.type = "lowshelf";
    low.frequency.value = 220;
    const mid = ctx.createBiquadFilter();
    mid.type = "peaking";
    mid.frequency.value = 1400;
    mid.Q.value = 1;
    const high = ctx.createBiquadFilter();
    high.type = "highshelf";
    high.frequency.value = 5200;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = 0;
    limiter.ratio.value = 1;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.12;
    const pan = typeof ctx.createStereoPanner === "function" ? ctx.createStereoPanner() : null;
    const gain = ctx.createGain();
    gain.gain.value = 1;
    src.connect(hp);
    hp.connect(low);
    low.connect(mid);
    mid.connect(high);
    high.connect(comp);
    comp.connect(limiter);
    if (pan) {
      limiter.connect(pan);
      pan.connect(gain);
    } else {
      limiter.connect(gain);
    }
    if (this.master) gain.connect(this.master);
    this.midias.set(assetId, { el, gain, entrada: src, filtros: { hp, comp, low, mid, high, pan, limiter } });
  }

  /** Carrega (uma vez) o modelo de segmentação usado no tratamento de fundo. */
  async ativarFundo(qualidade: "rapida" | "alta" = "rapida") {
    if (!this.seg) {
      const { SegmentadorFundo } = await import("./segmentation");
      this.seg = new SegmentadorFundo();
    }
    await this.seg.carregar(qualidade);
    return this.seg.pronto;
  }

  fundoPronto() {
    return !!this.seg?.pronto;
  }

  private offscreen() {
    if (!this.off) this.off = document.createElement("canvas");
    if (this.off.width !== this.width || this.off.height !== this.height) {
      this.off.width = this.width;
      this.off.height = this.height;
    }
    return this.off;
  }

  /** Repinta o último quadro pedido (usado quando uma mídia fica pronta). */
  private redesenhar() {
    if (this.tocandoAgora || !this.ultimo) return;
    this.desenhar(this.ultimo.state, this.ultimo.t);
  }

  temMidia(assetId: string) {
    return this.midias.has(assetId) || this.imagens.has(assetId);
  }


  elemento(assetId: string) {
    return this.midias.get(assetId)?.el ?? null;
  }

  definirVolumeMaster(v: number) {
    this.volumeMaster = v;
    if (this.master) this.master.gain.value = this.mudo ? 0 : v;
  }
  definirMudo(m: boolean) {
    this.mudo = m;
    if (this.master) this.master.gain.value = m ? 0 : this.volumeMaster;
  }

  private ativos(state: ProjectState, t: number) {
    return state.clips.filter((c) => t >= c.start && t < c.start + c.duration);
  }

  /* ---------------- keyframes ---------------- */

  private valor(c: EditairClip, prop: KeyProp, t: number, base: number) {
    const ks = (c.keyframes ?? []).filter((k) => k.prop === prop).sort((a, b) => a.atMs - b.atMs);
    if (!ks.length) return base;
    const tl = t - c.start;
    if (tl <= ks[0].atMs) return ks[0].value;
    const ultimo = ks[ks.length - 1];
    if (tl >= ultimo.atMs) return ultimo.value;
    for (let i = 0; i < ks.length - 1; i++) {
      const a = ks[i];
      const b = ks[i + 1];
      if (tl >= a.atMs && tl <= b.atMs) {
        const p = (tl - a.atMs) / Math.max(1, b.atMs - a.atMs);
        return a.value + (b.value - a.value) * p;
      }
    }
    return base;
  }

  /* ---------------- áudio ---------------- */

  private ganhoDoClipe(state: ProjectState, c: EditairClip, t: number) {
    const trilha = state.tracks.find((x) => x.id === c.trackId);
    const temSolo = state.tracks.some((x) => x.solo);
    if (temSolo && !trilha?.solo) return 0;
    if (c.muted || c.semAudio || trilha?.muted) return 0;
    let g = this.valor(c, "volume", t, c.volume);
    const tl = t - c.start;
    if (c.fadeInMs && tl < c.fadeInMs) g *= tl / c.fadeInMs;
    const restante = c.start + c.duration - t;
    if (c.fadeOutMs && restante < c.fadeOutMs) g *= Math.max(0, restante / c.fadeOutMs);
    // ducking: música abaixa quando há voz ativa
    if (state.ducking?.ativo && (c.trackId === "t-music")) {
      const vozAtiva = state.clips.some(
        (o) =>
          (o.trackId === "t-voice" || o.trackId === "t-video") &&
          !o.muted &&
          t >= o.start &&
          t < o.start + o.duration,
      );
      if (vozAtiva) g *= 1 - clamp(state.ducking.reducao, 0, 95) / 100;
    }
    return clamp(g, 0, 2);
  }

  sincronizar(state: ProjectState, t: number, tocando: boolean) {
    this.tocandoAgora = tocando;
    const ativos = this.ativos(state, t);
    const usados = new Set<string>();

    for (const c of ativos) {
      if (!c.assetId) continue;
      const m = this.midias.get(c.assetId);
      if (!m) continue;
      usados.add(c.assetId);
      const alvo = (c.sourceIn + (t - c.start) * c.speed) / 1000;
      if (Math.abs(m.el.currentTime - alvo) > 0.18) m.el.currentTime = Math.max(0, alvo);
      m.el.playbackRate = clamp(c.speed, 0.25, 4);
      m.gain.gain.value = this.ganhoDoClipe(state, c, t);
      if (m.nativo) {
        // mídia local: volume direto no elemento (não passa pelo WebAudio)
        m.el.volume = clamp(m.gain.gain.value * this.volumeMaster, 0, 1);
        m.el.muted = this.mudo;
      }
      if (m.filtros) {
        const fx = state.audioFx ?? { voz: false, ruido: false };
        const vozLike = c.trackId === "t-voice" || c.trackId === "t-video";
        const voz = (vozLike && fx.voz) || !!c.isolarVoz;
        const ruido = (vozLike && fx.ruido) || !!c.isolarVoz;
        m.filtros.hp.frequency.value = voz || ruido ? (ruido ? 160 : 100) : 20;
        m.filtros.comp.threshold.value = voz || c.compressor ? -24 : 0;
        m.filtros.comp.ratio.value = voz || c.compressor ? 4 : 1;
        m.filtros.limiter.threshold.value = c.limiter ? -2 : 0;
        m.filtros.limiter.ratio.value = c.limiter ? 20 : 1;
        const eq = c.eq;
        m.filtros.low.gain.value = eq?.graves ?? 0;
        m.filtros.mid.gain.value = (eq?.medios ?? 0) + (c.isolarVoz ? 4 : 0);
        m.filtros.high.gain.value = eq?.agudos ?? 0;
        if (m.filtros.pan) m.filtros.pan.pan.value = clamp(c.pan ?? 0, -1, 1);
      }
      if (tocando && m.el.paused) void m.el.play().catch(() => {});
      if (!tocando && !m.el.paused) m.el.pause();
    }
    for (const [id, m] of this.midias) {
      if (!usados.has(id) && !m.el.paused) m.el.pause();
    }
    if (tocando && this.audioCtx?.state === "suspended") void this.audioCtx.resume();
  }

  /* ---------------- vídeo ---------------- */

  desenhar(state: ProjectState, t: number) {
    this.ultimo = { state, t };
    const { ctx, width, height } = this;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(this.escala, 0, 0, this.escala, 0, 0);
    void width;
    void height;

    const ativos = this.ativos(state, t);
    // Ordem de camadas genérica: a trilha mais alta na lista aparece por cima.
    // Assim qualquer número de trilhas de vídeo (Vídeo 2, Vídeo 3, …) compõe corretamente.
    const idx = new Map(state.tracks.map((tr, i) => [tr.id, i] as const));
    const z = (id: string) => -(idx.get(id) ?? 99);
    const visuais = ativos
      .filter((c) => c.kind === "video" || c.kind === "image" || c.kind === "caption" || c.kind === "text")
      .sort((a, b) => z(a.trackId) - z(b.trackId));

    let offline = false;
    for (const c of visuais) {
      const trilha = state.tracks.find((x) => x.id === c.trackId);
      if (trilha?.hidden) continue;
      if (c.kind === "video" || c.kind === "image") {
        if (c.assetId && this.falhas.has(c.assetId)) {
          offline = true;
          continue;
        }
        this.desenharVideo(c, t);
      } else if (c.kind === "caption") this.desenharLegenda(c, c.captionStyle ?? state.captionStyle, t);
      else if (c.kind === "text") this.desenharTexto(c, t);
    }
    if (offline) this.avisoOffline();
  }

  /** Placeholder visível em vez de tela preta quando o arquivo não abre. */
  private avisoOffline() {
    const { ctx, width, height } = this;
    ctx.save();
    ctx.fillStyle = "rgba(20,20,24,0.92)";
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = "#F26B1F";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `600 ${Math.round(Math.min(width, height) * 0.055)}px Inter, system-ui, sans-serif`;
    ctx.fillText("Mídia offline", width / 2, height / 2 - Math.min(width, height) * 0.03);
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.font = `400 ${Math.round(Math.min(width, height) * 0.033)}px Inter, system-ui, sans-serif`;
    ctx.fillText("Localize o arquivo na Biblioteca", width / 2, height / 2 + Math.min(width, height) * 0.04);
    ctx.restore();
  }

  private transicao(c: EditairClip, t: number) {
    const tr = c.transicao;
    if (!tr || !tr.durationMs) return null;
    const p = (t - c.start) / tr.durationMs;
    if (p >= 1 || p < 0) return null;
    return { tipo: tr.tipo, p };
  }

  /** Ajustes finais do clipe já com as ferramentas de "Aprimorar" aplicadas. */
  private ajustesDoClip(c: EditairClip): Ajustes {
    const base: Ajustes = { ...AJUSTES_NEUTROS, ...(c.ajustes ?? {}) };
    const ap = c.aprimorar;
    if (!ap) return base;
    if (ap.qualidade) {
      base.contraste += 8;
      base.saturacao += 6;
      base.whites += 4;
    }
    if (ap.nitidez) base.contraste += 12;
    if (ap.luz) {
      base.exposicao += 8;
      base.shadows += 14;
      base.highlights -= 8;
    }
    if (ap.cor) {
      base.saturacao += 12;
      base.temperatura += 4;
    }
    if (ap.rosto) {
      base.brilho += 4;
      base.saturacao += 4;
    }
    return base;
  }

  private mascaraForma(c: EditairClip): HTMLCanvasElement | null {
    const mk = c.mascara;
    if (!mk || mk.tipo === "nenhuma") return null;
    const { width, height } = this;
    if (!this.maskCanvas) this.maskCanvas = document.createElement("canvas");
    const cv = this.maskCanvas;
    if (cv.width !== width || cv.height !== height) {
      cv.width = width;
      cv.height = height;
    }
    const g = cv.getContext("2d");
    if (!g) return null;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, width, height);
    const feather = (clamp(mk.feather, 0, 100) / 100) * (Math.min(width, height) * 0.15);
    g.filter = feather > 0.5 ? `blur(${feather.toFixed(1)}px)` : "none";
    g.fillStyle = "#fff";
    const cx = mk.x * width;
    const cy = mk.y * height;
    const mw = Math.max(4, mk.w * width);
    const mh = Math.max(4, mk.h * height);
    g.save();
    g.translate(cx, cy);
    g.rotate((mk.rotation * Math.PI) / 180);
    if (mk.tipo === "retangulo") {
      g.fillRect(-mw / 2, -mh / 2, mw, mh);
    } else if (mk.tipo === "circulo") {
      g.beginPath();
      g.ellipse(0, 0, mw / 2, mh / 2, 0, 0, Math.PI * 2);
      g.fill();
    } else if (mk.tipo === "linear") {
      const grad = g.createLinearGradient(0, -mh / 2, 0, mh / 2);
      grad.addColorStop(0, "rgba(255,255,255,1)");
      grad.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = grad;
      g.fillRect(-width, -mh / 2, width * 2, mh);
      g.fillStyle = "#fff";
      g.fillRect(-width, -height, width * 2, height - mh / 2);
    } else if (mk.tipo === "espelho") {
      g.fillRect(-width, -mh / 2, width * 2, mh);
    }
    g.restore();
    g.filter = "none";

    if (mk.inverter) {
      g.globalCompositeOperation = "xor";
      g.fillStyle = "#fff";
      g.fillRect(0, 0, width, height);
      g.globalCompositeOperation = "source-over";
    }
    return cv;
  }

  /** Chroma key aplicado por pixel na camada do clipe. */
  private aplicarChroma(octx: CanvasRenderingContext2D, chroma: ChromaKey) {
    const { width, height } = this;
    const alvo = hexRgb(chroma.cor);
    const tol = (clamp(chroma.tolerancia, 0, 100) / 100) * 160 + 10;
    const suav = (clamp(chroma.suavidade, 0, 100) / 100) * 90 + 4;
    const derrame = clamp(chroma.derrame, 0, 100) / 100;
    let img: ImageData;
    try {
      img = octx.getImageData(0, 0, width, height);
    } catch {
      return;
    }
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] === 0) continue;
      const dist = Math.sqrt(
        (d[i] - alvo.r) * (d[i] - alvo.r) + (d[i + 1] - alvo.g) * (d[i + 1] - alvo.g) + (d[i + 2] - alvo.b) * (d[i + 2] - alvo.b),
      );
      if (dist < tol) {
        d[i + 3] = 0;
      } else if (dist < tol + suav) {
        d[i + 3] = Math.round(d[i + 3] * ((dist - tol) / suav));
      }
      // remove o "derrame" de verde/azul nas bordas
      if (derrame > 0 && d[i + 3] > 0) {
        const media = (d[i] + d[i + 2]) / 2;
        if (alvo.g > alvo.r && alvo.g > alvo.b && d[i + 1] > media) {
          d[i + 1] = d[i + 1] + (media - d[i + 1]) * derrame;
        }
        if (alvo.b > alvo.r && alvo.b > alvo.g && d[i + 2] > (d[i] + d[i + 1]) / 2) {
          d[i + 2] = d[i + 2] + ((d[i] + d[i + 1]) / 2 - d[i + 2]) * derrame;
        }
      }
    }
    octx.putImageData(img, 0, 0);
  }

  private desenharVideo(c: EditairClip, t: number) {
    if (!c.assetId) return;
    const img = this.imagens.get(c.assetId) ?? null;
    const m = this.midias.get(c.assetId) ?? null;
    const fonte: HTMLVideoElement | HTMLImageElement | null =
      img && img.naturalWidth > 0 ? img : m && m.el.readyState >= 2 ? m.el : null;
    if (!fonte) return;
    const { ctx, width, height } = this;
    const vw = (fonte as HTMLVideoElement).videoWidth || (fonte as HTMLImageElement).naturalWidth || width;
    const vh = (fonte as HTMLVideoElement).videoHeight || (fonte as HTMLImageElement).naturalHeight || height;


    // recorte (crop) no material de origem
    const rec = c.recorte ?? RECORTE_CHEIO;
    const sw = Math.max(8, rec.w * vw);
    const sh = Math.max(8, rec.h * vh);
    const sx = clamp(rec.x, 0, 1) * vw;
    const sy = clamp(rec.y, 0, 1) * vh;

    let scale = this.valor(c, "scale", t, c.transform.scale);
    let x = this.valor(c, "x", t, c.transform.x);
    let y = this.valor(c, "y", t, c.transform.y);
    const rotation = this.valor(c, "rotation", t, c.transform.rotation);
    let opacity = this.valor(c, "opacity", t, c.transform.opacity);
    let blurExtra = 0;

    // efeitos
    const ef = c.efeito;
    if (ef && ef.id !== "nenhum") {
      const inten = (ef.intensidade ?? 50) / 100;
      const tl = (t - c.start) / 1000;
      if (ef.id === "shake") {
        x += Math.sin(tl * 34) * 14 * inten;
        y += Math.cos(tl * 29) * 14 * inten;
      } else if (ef.id === "pulso") {
        scale *= 1 + Math.sin(tl * 6) * 0.06 * inten;
      } else if (ef.id === "zoom-lento") {
        scale *= 1 + (tl / Math.max(1, c.duration / 1000)) * 0.25 * inten;
      } else if (ef.id === "glitch") {
        x += (Math.random() - 0.5) * 18 * inten;
      }
    }

    // animações de entrada / saída
    const anim = c.animacao;
    if (anim) {
      const dur = Math.max(80, anim.duracaoMs || 500);
      const tl = t - c.start;
      const restante = c.start + c.duration - t;
      const aplicarAnim = (tipo: string, p: number) => {
        const q = clamp(p, 0, 1);
        if (tipo === "fade") opacity *= q;
        else if (tipo === "zoom") scale *= 0.72 + 0.28 * q;
        else if (tipo === "slide-esq") x -= (1 - q) * width;
        else if (tipo === "slide-dir") x += (1 - q) * width;
        else if (tipo === "subir") y += (1 - q) * height * 0.35;
        else if (tipo === "descer") y -= (1 - q) * height * 0.35;
      };
      if (anim.entrada && anim.entrada !== "nenhuma" && tl < dur) aplicarAnim(anim.entrada, tl / dur);
      if (anim.saida && anim.saida !== "nenhuma" && restante < dur) aplicarAnim(anim.saida, restante / dur);
      if (anim.kenBurns) scale *= 1 + (tl / Math.max(1, c.duration)) * 0.18;
    }

    // transição de entrada
    const tr = this.transicao(c, t);
    if (tr) {
      const p = tr.p;
      if (tr.tipo === "fade" || tr.tipo === "dissolve") opacity *= p;
      else if (tr.tipo === "slide") x += (1 - p) * width;
      else if (tr.tipo === "zoom") scale *= 0.6 + 0.4 * p;
      else if (tr.tipo === "blur") blurExtra = (1 - p) * 24;
      else if (tr.tipo === "whip") {
        x += (1 - p) * width * 0.6;
        blurExtra = (1 - p) * 18;
      }
    }

    const ap = c.aprimorar;
    if (ap?.estabilizar) scale *= 1.05; // margem de segurança da estabilização
    if (ap?.ruido) blurExtra += 0.7;

    const escalaBase = Math.max(width / sw, height / sh);
    const escala = escalaBase * scale;
    const w = sw * escala;
    const h = sh * escala;
    const filtro = filtroCss(this.ajustesDoClip(c), c.filtro, blurExtra);

    const desenharMidia = (alvo: CanvasRenderingContext2D, amp = 1, comFiltro = true) => {
      alvo.save();
      if (comFiltro) alvo.filter = filtro;
      alvo.translate(width / 2 + x, height / 2 + y);
      if (rotation) alvo.rotate((rotation * Math.PI) / 180);
      if (c.flipH || c.flipV) alvo.scale(c.flipH ? -1 : 1, c.flipV ? -1 : 1);
      alvo.drawImage(fonte, sx, sy, sw, sh, (-w * amp) / 2, (-h * amp) / 2, w * amp, h * amp);
      alvo.restore();
    };

    const fundo = c.fundo && c.fundo.modo !== "nenhum" ? c.fundo : null;
    const mascaraPessoa = fundo
      ? this.seg?.mascara(c.id, fonte as HTMLVideoElement, t, {
          suavidade: fundo.suavidade,
          borda: fundo.borda,
          estabilidade: fundo.estabilidade,
          qualidade: fundo.qualidade,
        }) ?? null
      : null;
    const forma = this.mascaraForma(c);
    const chroma = c.chroma?.ativo ? c.chroma : null;
    const blend = c.blend && c.blend !== "normal" ? (c.blend as GlobalCompositeOperation) : null;
    const usarCamada = !!(mascaraPessoa || forma || chroma);

    // 1) camada de fundo (quando há tratamento de fundo com segmentação)
    if (fundo && mascaraPessoa && fundo.modo !== "remover") {
      const blurPct = clamp(this.valor(c, "fundoBlur", t, fundo.desfoque), 0, 100);
      const blurPx = (blurPct / 100) * (Math.min(width, height) * 0.06);
      ctx.save();
      ctx.globalAlpha = clamp(opacity, 0, 1);
      if (fundo.modo === "cor") {
        ctx.fillStyle = fundo.cor || "#000";
        ctx.fillRect(0, 0, width, height);
      } else if (fundo.modo === "midia" && fundo.assetId && this.midias.get(fundo.assetId)) {
        const bg = this.midias.get(fundo.assetId)!.el;
        const bw = bg.videoWidth || width;
        const bh = bg.videoHeight || height;
        const eb = Math.max(width / bw, height / bh);
        ctx.filter = blurPx > 0.3 ? `blur(${blurPx.toFixed(1)}px)` : "none";
        ctx.drawImage(bg, width / 2 - (bw * eb) / 2, height / 2 - (bh * eb) / 2, bw * eb, bh * eb);
      } else {
        ctx.filter = `${filtro} blur(${Math.max(1, blurPx).toFixed(1)}px)`;
        ctx.save();
        ctx.translate(width / 2 + x, height / 2 + y);
        if (rotation) ctx.rotate((rotation * Math.PI) / 180);
        const amp = 1.08;
        ctx.drawImage(fonte, sx, sy, sw, sh, (-w * amp) / 2, (-h * amp) / 2, w * amp, h * amp);
        ctx.restore();
      }
      ctx.restore();
    }

    // 2) camada principal
    if (usarCamada) {
      const off = this.offscreen();
      const octx = off.getContext("2d", { willReadFrequently: !!chroma });
      if (!octx) return;
      octx.setTransform(1, 0, 0, 1, 0, 0);
      octx.clearRect(0, 0, width, height);
      desenharMidia(octx);
      if (chroma) this.aplicarChroma(octx, chroma);
      if (mascaraPessoa) {
        octx.save();
        octx.globalCompositeOperation = "destination-in";
        octx.translate(width / 2 + x, height / 2 + y);
        if (rotation) octx.rotate((rotation * Math.PI) / 180);
        if (c.flipH || c.flipV) octx.scale(c.flipH ? -1 : 1, c.flipV ? -1 : 1);
        octx.drawImage(mascaraPessoa, sx, sy, sw, sh, -w / 2, -h / 2, w, h);
        octx.restore();
      }
      if (forma) {
        octx.save();
        octx.globalCompositeOperation = "destination-in";
        octx.drawImage(forma, 0, 0, width, height);
        octx.restore();
      }
      if (fundo?.contorno?.ativo && mascaraPessoa) {
        ctx.save();
        ctx.globalAlpha = clamp(opacity, 0, 1) * 0.9;
        ctx.filter = `blur(${Math.max(1, fundo.contorno.largura).toFixed(1)}px)`;
        ctx.drawImage(off, 0, 0, width, height);
        ctx.restore();
      }
      ctx.save();
      ctx.globalAlpha = clamp(opacity, 0, 1);
      if (blend) ctx.globalCompositeOperation = blend;
      ctx.drawImage(off, 0, 0, width, height);
      ctx.restore();
    } else {
      ctx.save();
      ctx.globalAlpha = clamp(opacity, 0, 1);
      if (blend) ctx.globalCompositeOperation = blend;
      desenharMidia(ctx);
      ctx.restore();
    }

    if (c.efeito?.id === "vinheta") {
      const inten = (c.efeito.intensidade ?? 50) / 100;
      const g = ctx.createRadialGradient(
        width / 2,
        height / 2,
        Math.min(width, height) * 0.3,
        width / 2,
        height / 2,
        Math.max(width, height) * 0.72,
      );
      g.addColorStop(0, "rgba(0,0,0,0)");
      g.addColorStop(1, `rgba(0,0,0,${0.85 * inten})`);
      ctx.save();
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, width, height);
      ctx.restore();
    }
  }

  private desenharLegenda(c: EditairClip, estilo: CaptionStyle, t: number) {
    const texto = estilo.uppercase ? (c.text ?? "").toUpperCase() : (c.text ?? "");
    if (!texto) return;
    const { ctx, width, height } = this;
    ctx.save();

    let alpha = 1;
    let deslocY = 0;
    let escala = 1;
    const tl = t - c.start;
    if (estilo.animacao === "fade") alpha = clamp(tl / 180, 0, 1);
    else if (estilo.animacao === "subir") {
      const p = clamp(tl / 220, 0, 1);
      deslocY = (1 - p) * 40;
      alpha = p;
    } else if (estilo.animacao === "pop") {
      const p = clamp(tl / 200, 0, 1);
      escala = 0.86 + 0.14 * p;
      alpha = p;
    }
    ctx.globalAlpha = alpha;

    const fs = estilo.fontSize * escala;
    ctx.font = `${estilo.weight} ${fs}px ${estilo.fontFamily}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    const maxLargura = width * 0.86;
    const linhas = quebrarLinhas(ctx, texto, maxLargura);
    const alturaLinha = fs * 1.18;
    const yBase = height * estilo.y - ((linhas.length - 1) * alturaLinha) / 2 + deslocY;

    const ativa = estilo.karaoke ? c.words?.find((w) => t >= w.start && t < w.end)?.w : null;
    const ativaNorm = ativa ? (estilo.uppercase ? ativa.toUpperCase() : ativa) : null;
    const limpar = (s: string) => s.replace(/[^\p{L}\p{N}]/gu, "");

    linhas.forEach((linha, i) => {
      const y = yBase + i * alturaLinha;
      if (estilo.background !== "none") {
        const larg = ctx.measureText(linha).width + 36;
        ctx.fillStyle = estilo.background === "box" ? "rgba(0,0,0,0.75)" : "rgba(0,0,0,0.4)";
        ctx.fillRect(width / 2 - larg / 2, y - alturaLinha / 2 - 6, larg, alturaLinha + 12);
      }
      const palavras = linha.split(" ");
      const espaco = ctx.measureText(" ").width;
      const larguras = palavras.map((p) => ctx.measureText(`${p} `).width);
      const total = larguras.reduce((a, b) => a + b, 0) - espaco;
      let x = width / 2 - total / 2;
      palavras.forEach((p, idx) => {
        const destaque = ativaNorm != null && limpar(p) === limpar(ativaNorm);
        const px = x + larguras[idx] / 2 - espaco / 2;
        if (estilo.stroke > 0) {
          ctx.lineWidth = estilo.stroke;
          ctx.strokeStyle = estilo.strokeColor;
          ctx.lineJoin = "round";
          ctx.strokeText(p, px, y);
        }
        ctx.fillStyle = destaque ? estilo.activeColor : estilo.color;
        ctx.fillText(p, px, y);
        x += larguras[idx];
      });
    });
    ctx.restore();
  }

  private desenharTexto(c: EditairClip, t: number) {
    const { ctx, width, height } = this;
    const st: TextStyle = { ...TEXTO_PADRAO, ...(c.textStyle ?? {}) };
    let texto = c.text ?? "";
    if (!texto) return;

    const tl = t - c.start;
    let alpha = this.valor(c, "opacity", t, c.transform.opacity);
    let escala = this.valor(c, "scale", t, c.transform.scale);
    let deslocY = 0;
    if (st.animacao === "fade") alpha *= clamp(tl / 200, 0, 1);
    else if (st.animacao === "pop") escala *= 0.85 + 0.15 * clamp(tl / 200, 0, 1);
    else if (st.animacao === "subir") deslocY = (1 - clamp(tl / 240, 0, 1)) * 60;
    else if (st.animacao === "digitar") {
      const chars = Math.ceil((tl / Math.max(400, c.duration * 0.5)) * texto.length);
      texto = texto.slice(0, Math.max(1, chars));
    }

    const x = width / 2 + this.valor(c, "x", t, c.transform.x);
    const y = height / 2 + this.valor(c, "y", t, c.transform.y) + deslocY;
    const rot = this.valor(c, "rotation", t, c.transform.rotation);
    const fs = st.fontSize * escala;

    ctx.save();
    ctx.globalAlpha = clamp(alpha, 0, 1);
    ctx.translate(x, y);
    if (rot) ctx.rotate((rot * Math.PI) / 180);
    ctx.font = `${st.weight} ${fs}px ${st.fontFamily}`;
    ctx.textAlign = st.align;
    ctx.textBaseline = "middle";
    const linhas = quebrarLinhas(ctx, texto, width * 0.86);
    const alturaLinha = fs * 1.16;
    const y0 = -((linhas.length - 1) * alturaLinha) / 2;
    const ax = st.align === "left" ? -width * 0.43 : st.align === "right" ? width * 0.43 : 0;

    linhas.forEach((l, i) => {
      const ly = y0 + i * alturaLinha;
      if (st.background !== "none") {
        const larg = ctx.measureText(l).width + 40;
        const bx = st.align === "left" ? ax - 20 : st.align === "right" ? ax - larg + 20 : ax - larg / 2;
        ctx.fillStyle = st.background === "box" ? hexAlpha(st.backgroundColor, 0.85) : hexAlpha(st.backgroundColor, 0.45);
        ctx.fillRect(bx, ly - alturaLinha / 2 - 6, larg, alturaLinha + 12);
      }
      if (st.shadow > 0) {
        ctx.shadowColor = st.shadowColor;
        ctx.shadowBlur = st.shadow;
        ctx.shadowOffsetY = st.shadow / 3;
      } else {
        ctx.shadowBlur = 0;
      }
      if (st.stroke > 0) {
        ctx.lineWidth = st.stroke;
        ctx.strokeStyle = st.strokeColor;
        ctx.lineJoin = "round";
        ctx.strokeText(l, ax, ly);
      }
      ctx.fillStyle = st.color;
      ctx.fillText(l, ax, ly);
    });
    ctx.restore();
  }

  /* ---------------- exportação ---------------- */

  streamExport(fps = 30): MediaStream {
    this.garantirAudio();
    const stream = this.canvas.captureStream(fps);
    if (this.streamDest) {
      for (const faixa of this.streamDest.stream.getAudioTracks()) stream.addTrack(faixa);
    }
    return stream;
  }

  streamAudio(): MediaStream {
    this.garantirAudio();
    const s = new MediaStream();
    if (this.streamDest) for (const faixa of this.streamDest.stream.getAudioTracks()) s.addTrack(faixa);
    return s;
  }

  pausarTudo() {
    for (const [, m] of this.midias) m.el.pause();
  }

  destruir() {
    this.seg?.destruir();
    this.seg = null;
    this.pausarTudo();
    for (const [, m] of this.midias) m.el.src = "";
    this.midias.clear();
    void this.audioCtx?.close();
    this.audioCtx = null;
  }
}

/* ---------------- helpers ---------------- */

export function filtroCss(ajustes?: Ajustes, filtro?: { id: string; intensidade: number }, blurExtra = 0) {
  const a: Ajustes = { ...AJUSTES_NEUTROS, ...(ajustes ?? {}) };
  let brightness = 1 + (a.brilho + a.exposicao * 1.2) / 200;
  let contrast = 1 + (a.contraste + a.whites / 2 - a.blacks / 2) / 150;
  let saturate = 1 + a.saturacao / 100;
  let sepia = 0;
  let grayscale = 0;
  let hue = a.tint * 0.6 + (a.temperatura > 0 ? -a.temperatura * 0.1 : -a.temperatura * 0.1);
  if (a.temperatura > 0) sepia += Math.min(0.6, a.temperatura / 200);
  if (a.temperatura < 0) hue += Math.abs(a.temperatura) * 0.25;
  brightness += (a.highlights - a.shadows) / 600;

  const inten = clamp((filtro?.intensidade ?? 100) / 100, 0, 1);
  switch (filtro?.id) {
    case "pb":
      grayscale = inten;
      break;
    case "sepia":
      sepia = Math.max(sepia, 0.8 * inten);
      break;
    case "vintage":
      sepia = Math.max(sepia, 0.45 * inten);
      contrast *= 1 + 0.15 * inten;
      saturate *= 1 - 0.25 * inten;
      break;
    case "frio":
      hue += 14 * inten;
      saturate *= 1 + 0.1 * inten;
      break;
    case "quente":
      sepia = Math.max(sepia, 0.25 * inten);
      saturate *= 1 + 0.15 * inten;
      break;
    case "cinema":
      contrast *= 1 + 0.28 * inten;
      saturate *= 1 - 0.18 * inten;
      brightness *= 1 - 0.05 * inten;
      break;
    case "vivido":
      saturate *= 1 + 0.55 * inten;
      contrast *= 1 + 0.12 * inten;
      break;
    case "desbotado":
      saturate *= 1 - 0.45 * inten;
      contrast *= 1 - 0.2 * inten;
      brightness *= 1 + 0.06 * inten;
      break;
    default:
      break;
  }

  const partes = [
    `brightness(${clamp(brightness, 0.1, 3).toFixed(3)})`,
    `contrast(${clamp(contrast, 0.1, 3).toFixed(3)})`,
    `saturate(${clamp(saturate, 0, 3).toFixed(3)})`,
  ];
  if (grayscale > 0.001) partes.push(`grayscale(${grayscale.toFixed(3)})`);
  if (sepia > 0.001) partes.push(`sepia(${sepia.toFixed(3)})`);
  if (Math.abs(hue) > 0.01) partes.push(`hue-rotate(${hue.toFixed(1)}deg)`);
  if (blurExtra > 0.01) partes.push(`blur(${blurExtra.toFixed(1)}px)`);
  return partes.join(" ");
}

function hexAlpha(hex: string, alpha: number) {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

function quebrarLinhas(ctx: CanvasRenderingContext2D, texto: string, max: number) {
  const palavras = texto.split(/\s+/);
  const linhas: string[] = [];
  let atual = "";
  for (const p of palavras) {
    const tentativa = atual ? `${atual} ${p}` : p;
    if (ctx.measureText(tentativa).width > max && atual) {
      linhas.push(atual);
      atual = p;
    } else {
      atual = tentativa;
    }
  }
  if (atual) linhas.push(atual);
  return linhas;
}

function hexRgb(hex: string) {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
