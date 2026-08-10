/* Motor de preview do EditAir: desenha a timeline num canvas e mixa o áudio.
   Só roda no navegador. */
import type { CaptionStyle, EditairClip, ProjectState } from "./types";

type Midia = {
  el: HTMLVideoElement;
  gain: GainNode;
  pronta: boolean;
};

export class EditairEngine {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  private ctx: CanvasRenderingContext2D;
  private audioCtx: AudioContext | null = null;
  private streamDest: MediaStreamAudioDestinationNode | null = null;
  private midias = new Map<string, Midia>();

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

  private garantirAudio() {
    if (this.audioCtx) return this.audioCtx;
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.audioCtx = new AC();
    this.streamDest = this.audioCtx.createMediaStreamDestination();
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
      setTimeout(ok, 8000);
    });
    const ctx = this.garantirAudio();
    const src = ctx.createMediaElementSource(el);
    const gain = ctx.createGain();
    gain.gain.value = 1;
    src.connect(gain);
    gain.connect(ctx.destination);
    if (this.streamDest) gain.connect(this.streamDest);
    this.midias.set(assetId, { el, gain, pronta: true });
  }

  temMidia(assetId: string) {
    return this.midias.has(assetId);
  }

  /** Clipes ativos no instante t (ms). */
  private ativos(state: ProjectState, t: number) {
    return state.clips.filter((c) => t >= c.start && t < c.start + c.duration);
  }

  /** Sincroniza os elementos de vídeo com a timeline. */
  sincronizar(state: ProjectState, t: number, tocando: boolean) {
    const ativos = this.ativos(state, t);
    const usados = new Set<string>();
    for (const c of ativos) {
      if (!c.assetId) continue;
      const m = this.midias.get(c.assetId);
      if (!m) continue;
      usados.add(c.assetId);
      const trilha = state.tracks.find((x) => x.id === c.trackId);
      const alvo = (c.sourceIn + (t - c.start) * c.speed) / 1000;
      if (Math.abs(m.el.currentTime - alvo) > 0.18) m.el.currentTime = Math.max(0, alvo);
      m.el.playbackRate = c.speed;
      m.gain.gain.value = c.muted || trilha?.muted ? 0 : c.volume;
      if (tocando && m.el.paused) void m.el.play().catch(() => {});
      if (!tocando && !m.el.paused) m.el.pause();
    }
    for (const [id, m] of this.midias) {
      if (!usados.has(id) && !m.el.paused) m.el.pause();
    }
    if (tocando && this.audioCtx?.state === "suspended") void this.audioCtx.resume();
  }

  desenhar(state: ProjectState, t: number) {
    const { ctx, width, height } = this;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, width, height);

    const ativos = this.ativos(state, t);
    const ordem: Record<string, number> = { "t-video": 0, "t-broll": 1, "t-caption": 2, "t-text": 3 };
    const visuais = ativos
      .filter((c) => c.kind === "video" || c.kind === "image" || c.kind === "caption" || c.kind === "text")
      .sort((a, b) => (ordem[a.trackId] ?? 5) - (ordem[b.trackId] ?? 5));

    for (const c of visuais) {
      const trilha = state.tracks.find((x) => x.id === c.trackId);
      if (trilha?.hidden) continue;
      if (c.kind === "video" || c.kind === "image") this.desenharVideo(c);
      else if (c.kind === "caption") this.desenharLegenda(c, state.captionStyle, t);
      else if (c.kind === "text") this.desenharTexto(c);
    }
  }

  private desenharVideo(c: EditairClip) {
    if (!c.assetId) return;
    const m = this.midias.get(c.assetId);
    if (!m || m.el.readyState < 2) return;
    const { ctx, width, height } = this;
    const vw = m.el.videoWidth || width;
    const vh = m.el.videoHeight || height;
    const escalaBase = Math.max(width / vw, height / vh);
    const escala = escalaBase * c.transform.scale;
    const w = vw * escala;
    const h = vh * escala;
    ctx.save();
    ctx.globalAlpha = c.transform.opacity;
    ctx.translate(width / 2 + c.transform.x, height / 2 + c.transform.y);
    if (c.transform.rotation) ctx.rotate((c.transform.rotation * Math.PI) / 180);
    ctx.drawImage(m.el, -w / 2, -h / 2, w, h);
    ctx.restore();
  }

  private desenharLegenda(c: EditairClip, estilo: CaptionStyle, t: number) {
    const texto = estilo.uppercase ? (c.text ?? "").toUpperCase() : (c.text ?? "");
    if (!texto) return;
    const { ctx, width, height } = this;
    const fonte = `${estilo.weight} ${estilo.fontSize}px Inter, system-ui, sans-serif`;
    ctx.save();
    ctx.font = fonte;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    const maxLargura = width * 0.86;
    const linhas = quebrarLinhas(ctx, texto, maxLargura);
    const alturaLinha = estilo.fontSize * 1.18;
    const yBase = height * estilo.y - ((linhas.length - 1) * alturaLinha) / 2;

    const ativa = c.words?.find((w) => t >= w.start && t < w.end)?.w;
    const ativaNorm = ativa ? (estilo.uppercase ? ativa.toUpperCase() : ativa) : null;

    linhas.forEach((linha, i) => {
      const y = yBase + i * alturaLinha;
      if (estilo.background !== "none") {
        const larg = ctx.measureText(linha).width + 36;
        ctx.fillStyle = estilo.background === "box" ? "rgba(0,0,0,0.75)" : "rgba(0,0,0,0.4)";
        ctx.fillRect(width / 2 - larg / 2, y - alturaLinha / 2 - 6, larg, alturaLinha + 12);
      }
      const palavras = linha.split(" ");
      const larguras = palavras.map((p) => ctx.measureText(`${p} `).width);
      const total = larguras.reduce((a, b) => a + b, 0) - ctx.measureText(" ").width;
      let x = width / 2 - total / 2;
      palavras.forEach((p, idx) => {
        const destaque = ativaNorm != null && p.replace(/[^\p{L}\p{N}]/gu, "") === ativaNorm.replace(/[^\p{L}\p{N}]/gu, "");
        const px = x + larguras[idx] / 2 - ctx.measureText(" ").width / 2;
        ctx.textAlign = "center";
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

  private desenharTexto(c: EditairClip) {
    const { ctx, width, height } = this;
    const texto = c.text ?? "";
    if (!texto) return;
    ctx.save();
    ctx.globalAlpha = c.transform.opacity;
    ctx.font = `800 ${Math.round(72 * c.transform.scale)}px Inter, system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const linhas = quebrarLinhas(ctx, texto, width * 0.84);
    const alturaLinha = 72 * c.transform.scale * 1.15;
    const y0 = height / 2 + c.transform.y - ((linhas.length - 1) * alturaLinha) / 2;
    linhas.forEach((l, i) => {
      const y = y0 + i * alturaLinha;
      ctx.lineWidth = 10;
      ctx.strokeStyle = "rgba(0,0,0,0.85)";
      ctx.lineJoin = "round";
      ctx.strokeText(l, width / 2 + c.transform.x, y);
      ctx.fillStyle = "#FFFFFF";
      ctx.fillText(l, width / 2 + c.transform.x, y);
    });
    ctx.restore();
  }

  /** Stream para exportação (vídeo do canvas + áudio mixado). */
  streamExport(fps = 30): MediaStream {
    this.garantirAudio();
    const stream = this.canvas.captureStream(fps);
    if (this.streamDest) {
      for (const faixa of this.streamDest.stream.getAudioTracks()) stream.addTrack(faixa);
    }
    return stream;
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
