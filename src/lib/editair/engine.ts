/* Motor de preview e render do EditAir: desenha a timeline num canvas e mixa o áudio.
   Só roda no navegador. Preview e exportação usam exatamente o mesmo caminho de render. */
import {
  AJUSTES_NEUTROS,
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
  entrada: AudioNode;
  filtros: { hp: BiquadFilterNode; comp: DynamicsCompressorNode } | null;
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
  private volumeMaster = 1;
  private mudo = false;

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

  redimensionar(width: number, height: number) {
    if (this.width === width && this.height === height) return;
    this.width = width;
    this.height = height;
    this.canvas.width = width;
    this.canvas.height = height;
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

  async carregar(assetId: string, url: string) {
    if (this.midias.has(assetId)) return;
    const el = document.createElement("video");
    el.src = url;
    el.crossOrigin = "anonymous";
    el.preload = "auto";
    el.playsInline = true;
    el.muted = false;
    await new Promise<void>((resolve) => {
      const ok = () => resolve();
      el.onloadeddata = ok;
      el.onerror = ok;
      setTimeout(ok, 10000);
    });
    const ctx = this.garantirAudio();
    const src = ctx.createMediaElementSource(el);
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 20;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = 0;
    comp.ratio.value = 1;
    const gain = ctx.createGain();
    gain.gain.value = 1;
    src.connect(hp);
    hp.connect(comp);
    comp.connect(gain);
    if (this.master) gain.connect(this.master);
    this.midias.set(assetId, { el, gain, entrada: src, filtros: { hp, comp } });
  }

  temMidia(assetId: string) {
    return this.midias.has(assetId);
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
    if (c.muted || trilha?.muted) return 0;
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
      if (m.filtros) {
        const fx = state.audioFx ?? { voz: false, ruido: false };
        const vozLike = c.trackId === "t-voice" || c.trackId === "t-video";
        m.filtros.hp.frequency.value = vozLike && (fx.voz || fx.ruido) ? (fx.ruido ? 160 : 100) : 20;
        m.filtros.comp.threshold.value = vozLike && fx.voz ? -24 : 0;
        m.filtros.comp.ratio.value = vozLike && fx.voz ? 4 : 1;
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
    const { ctx, width, height } = this;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, width, height);
    ctx.restore();

    const ativos = this.ativos(state, t);
    const ordem: Record<string, number> = { "t-video": 0, "t-broll": 1, "t-caption": 2, "t-text": 3 };
    const visuais = ativos
      .filter((c) => c.kind === "video" || c.kind === "image" || c.kind === "caption" || c.kind === "text")
      .sort((a, b) => (ordem[a.trackId] ?? 5) - (ordem[b.trackId] ?? 5));

    for (const c of visuais) {
      const trilha = state.tracks.find((x) => x.id === c.trackId);
      if (trilha?.hidden) continue;
      if (c.kind === "video" || c.kind === "image") this.desenharVideo(c, t);
      else if (c.kind === "caption") this.desenharLegenda(c, c.captionStyle ?? state.captionStyle, t);
      else if (c.kind === "text") this.desenharTexto(c, t);
    }
  }

  private transicao(c: EditairClip, t: number) {
    const tr = c.transicao;
    if (!tr || !tr.durationMs) return null;
    const p = (t - c.start) / tr.durationMs;
    if (p >= 1 || p < 0) return null;
    return { tipo: tr.tipo, p };
  }

  private desenharVideo(c: EditairClip, t: number) {
    if (!c.assetId) return;
    const m = this.midias.get(c.assetId);
    if (!m || m.el.readyState < 2) return;
    const { ctx, width, height } = this;
    const vw = m.el.videoWidth || width;
    const vh = m.el.videoHeight || height;

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

    const escalaBase = Math.max(width / vw, height / vh);
    const escala = escalaBase * scale;
    const w = vw * escala;
    const h = vh * escala;

    ctx.save();
    ctx.globalAlpha = clamp(opacity, 0, 1);
    ctx.filter = filtroCss(c.ajustes, c.filtro, blurExtra);
    ctx.translate(width / 2 + x, height / 2 + y);
    if (rotation) ctx.rotate((rotation * Math.PI) / 180);
    ctx.drawImage(m.el, -w / 2, -h / 2, w, h);
    ctx.restore();

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
