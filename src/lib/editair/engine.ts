/* Motor de preview e render do EditAir: desenha a timeline num canvas e mixa o áudio.
   Só roda no navegador. Preview e exportação usam exatamente o mesmo caminho de render. */
import type { SegmentadorFundo } from "./segmentation";
import { desenharContorno, normalizarContorno } from "./contorno";
import { calcularEfeitos, temVinheta } from "./efeitos";
import { aplicarCaps, casarIndicePalavra, quebrarBalanceado } from "./legenda-layout";
import {
  AJUSTES_NEUTROS,
  LEGENDA_PADRAO,
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

/** Tradução do MediaError.code para uma frase útil em português. */
export function codigoMidia(codigo?: number | null) {
  switch (codigo) {
    case 1: return "carregamento abortado (MEDIA_ERR_ABORTED)";
    case 2: return "falha de rede/protocolo (MEDIA_ERR_NETWORK)";
    case 3: return "falha ao decodificar — codec não suportado (MEDIA_ERR_DECODE)";
    case 4: return "formato ou codec não suportado (MEDIA_ERR_SRC_NOT_SUPPORTED)";
    default: return "erro desconhecido ao abrir a mídia";
  }
}

/** Causa real de uma mídia não abrir — usada nos logs e no aviso ao usuário. */
export type FalhaMidia = {
  assetId: string;
  /** nome do arquivo — vem do asset, para o log ser legível */
  nome?: string;
  url: string;
  kind: string;
  evento: "error" | "timeout";
  codigo: number | null;
  mensagem: string;
  networkState: number | null;
  readyState: number | null;
  mime?: string | null;
  status?: number | null;
};

/** Pergunta ao protocolo/servidor qual status e MIME a URL realmente devolve. */
async function sondarUrl(url: string): Promise<{ status: number | null; mime: string | null }> {
  try {
    const r = await fetch(url, { method: "HEAD" });
    return { status: r.status, mime: r.headers.get("content-type") };
  } catch {
    try {
      const r = await fetch(url, { headers: { Range: "bytes=0-1" } });
      return { status: r.status, mime: r.headers.get("content-type") };
    } catch {
      return { status: null, mime: null };
    }
  }
}

/** Uma linha da auditoria visual do preview. */
export type RegistroVisual = {
  timelineTime: number;
  trocaDeClipe: boolean;
  clipesAnteriores: string[];
  clipes: {
    clipId: string;
    kind: string;
    assetId: string | null;
    start: number;
    duration: number;
    sourceIn: number;
    sourceOut: number | null;
    speed: number;
    sourceTime: number;
    fonte: "image" | "video" | "nenhuma";
    desenhou: boolean;
    motivo?: string;
    mediaCurrentTime?: number;
    mediaSourceTime?: number;
    deltaMs?: number;
    seeking?: boolean;
    readyState?: number;
    networkState?: number;
    comandaTempo?: boolean;
  }[];
};

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
  /* AUDITORIA VISUAL (não altera render): grava, por quadro, qual clipe visual
     está ativo, o sourceTime calculado e o que o canvas realmente desenhou. */
  private tracando = false;
  private traco: RegistroVisual[] = [];
  private ativosAnteriores: string[] = [];
  private tocandoAgora = false;

  private volumeMaster = 1;
  private mudo = false;
  /** escala física do canvas em relação ao tamanho lógico do projeto */
  private escala = 1;
  /** segmentação de pessoa para tratamento de fundo */
  private seg: SegmentadorFundo | null = null;
  private off: HTMLCanvasElement | null = null;
  private maskCanvas: HTMLCanvasElement | null = null;
  /** canvases reaproveitados no desenho do contorno */
  private cacheContorno: HTMLCanvasElement[] = [];


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

  /** Causa real da falha — código do <video>, MIME e status do protocolo. */
  erroDe(assetId: string): FalhaMidia | null {
    return this.detalhes.get(assetId) ?? null;
  }

  /** Todas as falhas conhecidas — usado pela aba Ajustes → Diagnóstico. */
  falhasConhecidas(): FalhaMidia[] {
    return Array.from(this.detalhes.values());
  }

  /** Estado real de cada mídia aberta no preview (readyState, codec-ok, tamanho…). */
  diagnosticoMidias() {
    const linhas: Record<string, unknown>[] = [];
    for (const [assetId, m] of this.midias) {
      const el = m.el;
      linhas.push({
        assetId,
        tipo: "video/audio",
        currentSrc: el.currentSrc,
        readyState: el.readyState,
        networkState: el.networkState,
        duration: el.duration,
        videoWidth: el.videoWidth,
        videoHeight: el.videoHeight,
        paused: el.paused,
        muted: el.muted,
        volume: el.volume,
        erro: el.error ? { code: el.error.code, traduzido: codigoMidia(el.error.code), message: el.error.message } : null,
        audioNativo: !!m.nativo,
      });
    }
    for (const [assetId, img] of this.imagens) {
      linhas.push({ assetId, tipo: "image", currentSrc: img.src, complete: img.complete, w: img.naturalWidth, h: img.naturalHeight });
    }
    return { midias: linhas, falhas: this.falhasConhecidas() };
  }

  private async registrarFalha(f: Omit<FalhaMidia, "mime" | "status">) {
    this.falhas.add(f.assetId);
    const sonda = await sondarUrl(f.url);
    const completo: FalhaMidia = { ...f, mime: sonda.mime, status: sonda.status };
    this.detalhes.set(f.assetId, completo);
    // Log legível no Desktop (sem precisar expandir "Object" no console).
    const caminho = (() => {
      try { return decodeURIComponent(new URL(f.url).searchParams.get("p") || ""); } catch { return ""; }
    })();
    console.error(
      [
        "[preview:error] mídia não abriu",
        `nome: ${f.nome ?? "(desconhecido)"}`,
        `assetId: ${f.assetId}`,
        `kind: ${f.kind}`,
        `etapa: ${f.evento}`,
        `url: ${f.url}`,
        `arquivo: ${caminho || "(url remota)"}`,
        `extensão: ${(caminho.match(/\.[a-z0-9]+$/i)?.[0] ?? "").toLowerCase() || "?"}`,
        `MediaError: ${f.codigo != null ? `${f.codigo} — ${codigoMidia(f.codigo)}` : "nenhum (sem evento error)"}`,
        `mensagem: ${f.mensagem}`,
        `readyState: ${f.readyState}`,
        `networkState: ${f.networkState}`,
        `protocolo: status=${sonda.status ?? "?"} mime=${sonda.mime ?? "?"}`,
      ].join("\n"),
    );
    return completo;
  }

  async carregar(assetId: string, url: string, kind = "video", nome?: string) {
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
    this.detalhes.delete(assetId);
    // Arquivos locais do Desktop vêm pelo protocolo editair-media:// — pedir CORS
    // ("anonymous") faz o Chromium recusar a mídia e o preview fica preto.
    const local = url.startsWith("editair-media:") || url.startsWith("blob:") || url.startsWith("file:");
    const log = (etapa: string, extra?: unknown) =>
      console.log(`[preview] ${etapa} asset=${assetId} url=${url.slice(0, 120)}`, extra ?? "");

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
          void this.registrarFalha({
            assetId,
            nome,
            url,
            kind,
            evento: "error",
            codigo: null,
            mensagem: "imagem não decodificada pelo Chromium",
            networkState: null,
            readyState: null,
          });
          ok();
        };
        setTimeout(() => {
          if (!terminou && !img.complete) {
            void this.registrarFalha({
              assetId,
              nome,
              url,
              kind,
              evento: "timeout",

              codigo: null,
              mensagem: "tempo esgotado ao carregar imagem",
              networkState: null,
              readyState: null,
            });
          }
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
    log("carregando", { local, kind });
    await new Promise<void>((resolve) => {
      let terminou = false;
      const ok = () => {
        if (terminou) return;
        terminou = true;
        resolve();
      };
      el.onloadedmetadata = () => log("loadedmetadata", { w: el.videoWidth, h: el.videoHeight, dur: el.duration });
      el.onloadeddata = () => {
        this.falhas.delete(assetId);
        this.detalhes.delete(assetId);
        log("loadeddata", { w: el.videoWidth, h: el.videoHeight, dur: el.duration });
        ok();
      };
      el.onerror = () => {
        void this.registrarFalha({
          assetId,
          nome,
          url,
          kind,
          evento: "error",
          codigo: el.error?.code ?? null,
          mensagem: el.error?.message || codigoMidia(el.error?.code),
          networkState: el.networkState,
          readyState: el.readyState,
        }).then(ok);
      };
      setTimeout(() => {
        if (!terminou && el.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
          void this.registrarFalha({
            assetId,
            nome,
            url,
            kind,
            evento: "timeout",
            codigo: el.error?.code ?? null,
            mensagem: "tempo esgotado antes de HAVE_CURRENT_DATA",
            networkState: el.networkState,
            readyState: el.readyState,
          }).then(ok);
          return;
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

  /**
   * Analisa o intervalo do clipe e guarda as máscaras em cache (asset + frame +
   * versão do modelo). Só roda a IA uma vez: reabrir o projeto ou mexer no
   * contorno reaproveita o cache.
   */
  async analisarFundo(
    c: EditairClip,
    onProgresso?: (pct: number) => void,
    cancelado?: () => boolean,
  ) {
    if (!c.assetId) return false;
    const qualidade = c.fundo?.qualidade ?? "rapida";
    await this.ativarFundo(qualidade);
    const midia = this.midias.get(c.assetId);
    if (!this.seg || !midia) {
      onProgresso?.(100);
      return false;
    }
    const fim = c.sourceIn + c.duration * (c.speed || 1);
    return this.seg.precomputar(c.assetId, midia.el, c.sourceIn, fim, qualidade, onProgresso, cancelado);
  }

  /** Esquece o estado temporal da máscara de um clipe (ex.: clipe removido). */
  esquecerMascara(clipId: string) {
    this.seg?.esquecer(clipId);
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

  /**
   * AUDITORIA DE ÁUDIO — não altera comportamento. Retorna o estado real de
   * cada elemento de mídia, a cadeia de ganho e se o Chromium chegou a
   * decodificar bytes de áudio (prova objetiva de que existe faixa de áudio).
   */
  diagnosticoAudio(state?: ProjectState, t = 0) {
    const ativos = state ? this.ativos(state, t) : [];
    const midias = Array.from(this.midias.entries()).map(([assetId, m]) => {
      const el = m.el as HTMLVideoElement & {
        webkitAudioDecodedByteCount?: number;
        webkitVideoDecodedByteCount?: number;
        audioTracks?: { length: number };
        mozHasAudio?: boolean;
        captureStream?: () => MediaStream;
      };
      let faixasAudio: number | null = null;
      try {
        faixasAudio = el.captureStream ? el.captureStream().getAudioTracks().length : null;
      } catch {
        faixasAudio = null;
      }
      const clip = ativos.find((c) => c.assetId === assetId) ?? null;
      const trilha = clip ? state?.tracks.find((x) => x.id === clip.trackId) ?? null : null;
      return {
        assetId,
        src: el.currentSrc || el.src,
        nativo: !!m.nativo,
        paused: el.paused,
        muted: el.muted,
        volume: el.volume,
        playbackRate: el.playbackRate,
        preservesPitch: (el as unknown as { preservesPitch?: boolean }).preservesPitch ?? null,
        currentTime: el.currentTime,
        duration: el.duration,
        readyState: el.readyState,
        networkState: el.networkState,
        erro: el.error ? { code: el.error.code, message: el.error.message } : null,
        audioDecodedBytes: el.webkitAudioDecodedByteCount ?? null,
        videoDecodedBytes: el.webkitVideoDecodedByteCount ?? null,
        audioTracks: el.audioTracks?.length ?? null,
        faixasAudioCaptureStream: faixasAudio,
        gainNode: m.gain.gain.value,
        viaWebAudio: !!m.entrada,
        clip: clip
          ? {
              id: clip.id,
              trackId: clip.trackId,
              muted: !!clip.muted,
              semAudio: !!clip.semAudio,
              volume: clip.volume,
              speed: clip.speed,
              ganhoCalculado: state ? this.ganhoDoClipe(state, clip, t) : null,
            }
          : null,
        trilha: trilha ? { id: trilha.id, muted: !!trilha.muted, solo: !!trilha.solo } : null,
        ganhoFinalEsperado:
          clip && state
            ? clamp(this.ganhoDoClipe(state, clip, t) * (this.mudo ? 0 : this.volumeMaster), 0, 2)
            : null,
      };
    });
    return {
      quando: new Date().toISOString(),
      tocandoAgora: this.tocandoAgora,
      audioBloqueado: this.audioBloqueado,
      volumeMaster: this.volumeMaster,
      mudoGlobal: this.mudo,
      audioCtx: this.audioCtx
        ? { state: this.audioCtx.state, sampleRate: this.audioCtx.sampleRate, masterGain: this.master?.gain.value ?? null }
        : null,
      tracksComSolo: state?.tracks.filter((x) => x.solo).map((x) => x.id) ?? [],
      playheadMs: t,
      midias,
    };
  }



  /** true quando o navegador bloqueou o play com áudio (autoplay policy). */
  audioBloqueado = false;

  /**
   * Precisa ser chamado DENTRO do gesto do usuário (clique em Play / Espaço).
   * Sem isso o Chromium rejeita `el.play()` com NotAllowedError: o canvas
   * continua desenhando quadros (o vídeo "roda") mas nenhum áudio sai.
   */
  liberarAudio(state?: ProjectState, t?: number) {
    const ctx = this.garantirAudio();
    if (ctx.state === "suspended") void ctx.resume().catch(() => {});

    // Quando o Play fornece o estado atual, a sincronização e o el.play()
    // acontecem ainda dentro do mesmo gesto do usuário. Antes, o elemento era
    // iniciado só para "desbloquear" e podia ser pausado pela Promise antes do
    // effect do React marcar o preview como tocando; a nova tentativa então já
    // ocorria fora do clique e o Chromium/Electron mantinha o áudio silencioso.
    if (state && typeof t === "number") {
      this.sincronizar(state, t, true);
      return;
    }

    for (const [, m] of this.midias) {
      if (!m.el.paused) continue;
      const p = m.el.play();
      if (p && typeof p.then === "function") {
        void p
          .then(() => {
            this.audioBloqueado = false;
            if (!this.tocandoAgora) m.el.pause();
          })
          .catch(() => {
            this.audioBloqueado = true;
          });
      }
    }
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

    // Um mesmo asset pode estar ativo em mais de um clipe ao mesmo tempo
    // (ex.: vídeo com áudio extraído para outra faixa). Como só existe UM
    // elemento de mídia por asset, o ganho é a soma limitada dos clipes ativos
    // — senão o clipe processado por último zera o volume do outro.
    const ganhoPorAsset = new Map<string, number>();
    for (const c of ativos) {
      if (!c.assetId) continue;
      const g = this.ganhoDoClipe(state, c, t);
      ganhoPorAsset.set(c.assetId, clamp((ganhoPorAsset.get(c.assetId) ?? 0) + g, 0, 2));
    }

    for (const c of ativos) {
      if (!c.assetId) continue;
      const m = this.midias.get(c.assetId);
      if (!m) continue;
      // o primeiro clipe ativo do asset comanda tempo/velocidade; os demais só somaram ganho
      if (usados.has(c.assetId)) continue;
      usados.add(c.assetId);
      const alvo = (c.sourceIn + (t - c.start) * c.speed) / 1000;
      // Tocando: tolerância maior para não picotar o áudio. Parado/scrub: precisão
      // de ~1 quadro, senão o áudio fica num ponto e a imagem em outro.
      const tolerancia = tocando ? 0.18 : 0.04;
      if (Math.abs(m.el.currentTime - alvo) > tolerancia) m.el.currentTime = Math.max(0, alvo);

      m.el.playbackRate = clamp(c.speed, 0.25, 4);
      m.gain.gain.value = ganhoPorAsset.get(c.assetId) ?? this.ganhoDoClipe(state, c, t);
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
      if (tocando && m.el.paused) {
        const p = m.el.play();
        if (p && typeof p.then === "function") {
          void p
            .then(() => {
              this.audioBloqueado = false;
            })
            .catch((err: unknown) => {
              const nome = (err as { name?: string })?.name;
              if (nome === "NotAllowedError" && !this.audioBloqueado) {
                this.audioBloqueado = true;
                console.warn("[preview] áudio bloqueado pelo navegador — clique em Play novamente");
              }
            });
        }
      }
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

    // A escala é derivada do canvas real a cada quadro: se algum fluxo (export,
    // troca de formato/qualidade) deixou this.escala defasada, o desenho saía
    // ampliado e "empurrado" para fora do canvas (para a direita/baixo).
    const esc = this.canvas.width > 0 && width > 0 ? this.canvas.width / width : this.escala;
    const escala = Number.isFinite(esc) && esc > 0 ? esc : 1;
    this.escala = escala;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(escala, 0, 0, escala, 0, 0);
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
    let desenhou = 0;
    const linhas: RegistroVisual["clipes"] = [];
    const usouTempo = new Set<string>();
    for (const c of visuais) {
      const trilha = state.tracks.find((x) => x.id === c.trackId);
      if (trilha?.hidden) continue;
      try {
        if (c.kind === "video" || c.kind === "image") {
          // Imagem já decodificada nunca é tratada como offline, mesmo que uma
          // tentativa anterior de carregamento tenha falhado.
          const temImagem = !!c.assetId && !!this.imagens.get(c.assetId)?.naturalWidth;
          if (c.assetId && this.falhas.has(c.assetId) && !temImagem) {
            offline = true;
            if (this.tracando) linhas.push(this.linhaAuditoria(c, t, { fonte: "nenhuma", desenhou: false, motivo: "asset marcado como offline" }, usouTempo));
            continue;
          }
          const r = this.desenharVideo(c, t);
          if (this.tracando) linhas.push(this.linhaAuditoria(c, t, r, usouTempo));
          if (r.desenhou) desenhou++;
        } else if (c.kind === "caption") {
          // estilo efetivo: padrão → projeto → clipe (o mesmo do Inspector),
          // para boxWidth/maxLines nunca sumirem em projeto antigo
          this.desenharLegenda(c, { ...LEGENDA_PADRAO, ...state.captionStyle, ...(c.captionStyle ?? {}) }, t);
          desenhou++;
        } else if (c.kind === "text") {
          this.desenharTexto(c, t);
          desenhou++;
        }
      } catch (e) {
        // Um clipe com problema não pode apagar o quadro inteiro (tela preta no Play).
        console.error("[preview:error] falha ao desenhar clipe", { clipId: c.id, kind: c.kind, erro: e });
      }
    }
    // O aviso é opaco: só aparece quando não há nada desenhado, para não cobrir
    // imagens/vídeos válidos em outras trilhas.
    if (offline && desenhou === 0) this.avisoOffline();

    if (this.tracando) {
      const ids = linhas.map((l) => l.clipId);
      const trocou = ids.join("|") !== this.ativosAnteriores.join("|");
      if (trocou || this.traco.length === 0) {
        this.traco.push({
          timelineTime: Math.round(t),
          trocaDeClipe: trocou,
          clipesAnteriores: this.ativosAnteriores,
          clipes: linhas,
        });
        if (this.traco.length > 400) this.traco.shift();
      }
      this.ativosAnteriores = ids;
    }
  }

  /* ---------------- auditoria visual ---------------- */

  private linhaAuditoria(
    c: EditairClip,
    t: number,
    r: { fonte: "image" | "video" | "nenhuma"; desenhou: boolean; motivo?: string },
    usouTempo: Set<string>,
  ): RegistroVisual["clipes"][number] {
    const sourceTime = c.sourceIn + (t - c.start) * (c.speed || 1);
    const el = c.assetId ? this.midias.get(c.assetId)?.el ?? null : null;
    const comanda = !!c.assetId && !usouTempo.has(c.assetId);
    if (c.assetId) usouTempo.add(c.assetId);
    return {
      clipId: c.id,
      kind: c.kind,
      assetId: c.assetId ?? null,
      start: c.start,
      duration: c.duration,
      sourceIn: c.sourceIn,
      sourceOut: c.sourceIn + c.duration * (c.speed || 1),
      speed: c.speed || 1,
      sourceTime: Math.round(sourceTime),
      fonte: r.fonte,
      desenhou: r.desenhou,
      motivo: r.motivo,
      comandaTempo: comanda,
      ...(el
        ? {
            mediaCurrentTime: Number(el.currentTime.toFixed(3)),
            mediaSourceTime: Math.round(el.currentTime * 1000),
            deltaMs: Math.round(el.currentTime * 1000 - sourceTime),
            seeking: el.seeking,
            readyState: el.readyState,
            networkState: el.networkState,
          }
        : {}),
    };
  }

  /** Liga o traço da auditoria visual (limpa o histórico anterior). */
  iniciarTracoVisual() {
    this.traco = [];
    this.ativosAnteriores = [];
    this.tracando = true;
  }

  pararTracoVisual() {
    this.tracando = false;
  }

  tracandoVisual() {
    return this.tracando;
  }

  /** Fotografia do estado visual agora + histórico de trocas de clipe. */
  diagnosticoVisual(state?: ProjectState, t = 0) {
    const usados = new Set<string>();
    const agora = state
      ? this.ativos(state, t)
          .filter((c) => c.kind === "video" || c.kind === "image")
          .map((c) => {
            const img = c.assetId ? this.imagens.get(c.assetId) ?? null : null;
            const m = c.assetId ? this.midias.get(c.assetId) ?? null : null;
            const fonte: "image" | "video" | "nenhuma" =
              img && img.naturalWidth > 0 ? "image" : m && m.el.readyState >= 2 ? "video" : "nenhuma";
            return this.linhaAuditoria(c, t, { fonte, desenhou: fonte !== "nenhuma" }, usados);
          })
      : [];
    return {
      timelineTime: Math.round(t),
      tocando: this.tocandoAgora,
      clipesVisuaisAgora: agora,
      // um mesmo asset em vários clipes ativos: só o primeiro comanda currentTime
      assetsCompartilhados: agora
        .filter((l) => l.assetId && !l.comandaTempo)
        .map((l) => ({ clipId: l.clipId, assetId: l.assetId })),
      tracando: this.tracando,
      trocas: this.traco,
    };
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

  /** Dimensões reais do arquivo já carregado (usadas pelo planejador de exportação). */
  dimensoesFonte(assetId: string): { width: number; height: number } | null {
    const img = this.imagens.get(assetId);
    if (img?.naturalWidth) return { width: img.naturalWidth, height: img.naturalHeight };
    const m = this.midias.get(assetId);
    const el = m?.el as HTMLVideoElement | undefined;
    if (el?.videoWidth) return { width: el.videoWidth, height: el.videoHeight };
    return null;
  }


  private desenharVideo(c: EditairClip, t: number): { fonte: "image" | "video" | "nenhuma"; desenhou: boolean; motivo?: string } {
    if (!c.assetId) return { fonte: "nenhuma", desenhou: false, motivo: "clipe sem assetId" };
    const img = this.imagens.get(c.assetId) ?? null;
    const m = this.midias.get(c.assetId) ?? null;
    const fonte: HTMLVideoElement | HTMLImageElement | null =
      img && img.naturalWidth > 0 ? img : m && m.el.readyState >= 2 ? m.el : null;
    const tipoFonte: "image" | "video" | "nenhuma" = fonte ? (fonte === img ? "image" : "video") : "nenhuma";
    if (!fonte) {
      return {
        fonte: "nenhuma",
        desenhou: false,
        motivo: !m && !img ? "asset não carregado na engine" : `readyState=${m?.el.readyState ?? "-"} (<2)`,
      };
    }
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
    let rotation = this.valor(c, "rotation", t, c.transform.rotation);
    let opacity = this.valor(c, "opacity", t, c.transform.opacity);
    let blurExtra = 0;

    // efeitos (legado: um único efeito de momento)
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

    // biblioteca nova: entrada + momento + saída coexistem
    if (c.efeitos) {
      const d = calcularEfeitos(c.efeitos, t - c.start, c.duration, { w: width, h: height });
      x += d.dx;
      y += d.dy;
      scale *= d.escala;
      rotation += d.rotacao;
      opacity *= d.opacidade;
      blurExtra += d.blur;
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

    // "fit" (padrão de toda mídia nova) mantém o clipe inteiro dentro do canvas;
    // "preencher" é o antigo comportamento de cobrir o quadro cortando as bordas.
    const modo = c.enquadramento ?? "preencher";
    const escalaBase =
      modo === "fit" ? Math.min(width / sw, height / sh) : Math.max(width / sw, height / sh);
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
    const tempoSourceMs =
      (fonte as HTMLVideoElement).currentTime != null
        ? (fonte as HTMLVideoElement).currentTime * 1000
        : c.sourceIn + (t - c.start);
    const mascaraPessoa = fundo
      ? this.seg?.mascara(c.id, fonte, tempoSourceMs, {
          suavidade: fundo.suavidade,
          borda: fundo.borda,
          estabilidade: fundo.estabilidade,
          qualidade: fundo.qualidade,
          halo: fundo.refino?.halo,
          feather: fundo.refino?.feather,
          assetId: c.assetId,
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
      if (!octx) return { fonte: tipoFonte, desenhou: false, motivo: "sem contexto 2d offscreen" };
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
      // contorno: desenhado ATRÁS do recorte, a partir do próprio alpha da camada.
      // Mesma função no preview e na exportação (renderizarQuadro usa este caminho).
      const contorno = fundo && (mascaraPessoa || chroma) ? normalizarContorno(fundo.contorno) : null;
      if (contorno && contorno.preset !== "nenhum") {
        desenharContorno(ctx, off, width, height, contorno, {
          alpha: clamp(opacity, 0, 1),
          cache: this.cacheContorno,
        });
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

    const intenVinheta = c.efeito?.id === "vinheta" ? (c.efeito.intensidade ?? 50) / 100 : temVinheta(c.efeitos);
    if (intenVinheta > 0) {
      const inten = intenVinheta;
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
    return { fonte: tipoFonte, desenhou: true };
  }

  private desenharLegenda(c: EditairClip, estilo: CaptionStyle, t: number) {
    const texto = aplicarCaps(c.text ?? "", estilo.caps, estilo.uppercase);

    if (!texto) return;
    const { ctx, width, height } = this;
    ctx.save();

    let alpha = 1;
    let deslocY = 0;
    let escala = estilo.escala ?? 1;
    const tl = t - c.start;
    const restante = c.start + c.duration - t;
    if (estilo.animacao === "fade") alpha = clamp(tl / 180, 0, 1);
    else if (estilo.animacao === "subir") {
      const p = clamp(tl / 220, 0, 1);
      deslocY = (1 - p) * 40;
      alpha = p;
    } else if (estilo.animacao === "pop") {
      const p = clamp(tl / 200, 0, 1);
      escala *= 0.86 + 0.14 * p;
      alpha = p;
    } else if (estilo.animacao === "escala") {
      const p = clamp(tl / 260, 0, 1);
      escala *= 0.7 + 0.3 * p;
      alpha = clamp(tl / 140, 0, 1);
    } else if (estilo.animacao === "deslizar") {
      const p = clamp(tl / 240, 0, 1);
      deslocY = (1 - p) * -30;
      alpha = p;
    }
    // saída
    if (estilo.animacaoSaida === "fade") alpha *= clamp(restante / 200, 0, 1);
    else if (estilo.animacaoSaida === "descer") deslocY += (1 - clamp(restante / 240, 0, 1)) * 40;
    else if (estilo.animacaoSaida === "encolher") escala *= 0.85 + 0.15 * clamp(restante / 240, 0, 1);
    ctx.globalAlpha = clamp(alpha, 0, 1);

    const fs = estilo.fontSize * escala;
    const fonte = (peso: number, tamanho: number) => `${peso} ${tamanho}px ${estilo.fontFamily}`;
    ctx.font = fonte(estilo.weight, fs);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const espacamento = estilo.tracking ?? 0;
    const ctxAny = ctx as CanvasRenderingContext2D & { letterSpacing?: string };
    if ("letterSpacing" in ctxAny) ctxAny.letterSpacing = `${espacamento}px`;

    // A largura da caixa (ajustável pelos 4 cantos no Reprodutor) é o maxWidth
    // real da legenda — mexer nela muda só a quebra, nunca o fontSize.
    const maxLargura = width * clamp(estilo.boxWidth ?? 0.86, 0.1, 1);
    const maxLinhas = Math.max(1, estilo.maxLines ?? 2);
    const linhas = quebrarBalanceado((s) => ctx.measureText(s).width, texto, maxLargura, maxLinhas);
    const alturaLinha = fs * (estilo.lineHeight ?? 1.18);
    const yBase = height * estilo.y - ((linhas.length - 1) * alturaLinha) / 2 + deslocY;
    const alinhamento = estilo.align ?? "center";
    const centroX =
      typeof estilo.x === "number"
        ? width * clamp(estilo.x, 0, 1)
        : alinhamento === "left"
          ? width * 0.07 + maxLargura / 2
          : alinhamento === "right"
            ? width * 0.93 - maxLargura / 2
            : width / 2;

    // karaokê por ÍNDICE da palavra (não por texto): palavra repetida na mesma
    // frase não pode acender junto, e o destaque segue word.start → word.end
    // sem interpolação artificial.
    const words = c.words ?? [];
    const idxAtiva = estilo.karaoke ? words.findIndex((w) => t >= w.start && t < w.end) : -1;
    const ultimaFalada = words.reduce((acc, w, i) => (t >= w.start ? i : acc), -1);
    // A comparação é insensível a caixa/acento (com caps "upper" desenhamos
    // "OLÁ" e words[] guarda "olá") e ressincroniza olhando vizinhos, para
    // texto revisado à mão não desligar o karaokê.
    const modoPalavra = estilo.animacaoPalavra ?? "cor";
    // índice global da palavra desenhada, para casar com words[] na ordem
    let indicePalavra = -1;


    linhas.forEach((linha, i) => {
      const y = yBase + i * alturaLinha;
      if (estilo.background !== "none") {
        const padX = estilo.paddingX ?? 18;
        const padY = estilo.paddingY ?? 6;
        const larg = ctx.measureText(linha).width + padX * 2;
        const raio = estilo.radius ?? 14;
        ctx.fillStyle =
          estilo.backgroundColor ?? (estilo.background === "box" ? "rgba(0,0,0,0.75)" : "rgba(0,0,0,0.4)");
        const bx = centroX - larg / 2;
        const by = y - alturaLinha / 2 - padY;
        const bh = alturaLinha + padY * 2;
        if (typeof (ctx as CanvasRenderingContext2D).roundRect === "function") {
          ctx.beginPath();
          (ctx as CanvasRenderingContext2D).roundRect(bx, by, larg, bh, raio);
          ctx.fill();
        } else {
          ctx.fillRect(bx, by, larg, bh);
        }
      }
      const palavras = linha.split(" ");
      const espaco = ctx.measureText(" ").width;
      const larguras = palavras.map((p) => ctx.measureText(`${p} `).width);
      const total = larguras.reduce((a, b) => a + b, 0) - espaco;
      let x = centroX - total / 2;
      palavras.forEach((p, idx) => {
        indicePalavra++;
        const iPal = casarIndicePalavra(p, indicePalavra, words);
        if (iPal >= 0) indicePalavra = iPal;
        const destaque = idxAtiva >= 0 && iPal === idxAtiva;
        const px = x + larguras[idx] / 2 - espaco / 2;
        const alphaBase = ctx.globalAlpha;
        const jaFalada = iPal >= 0 ? iPal <= ultimaFalada : true;
        if (modoPalavra === "progressiva" && !jaFalada && !destaque) ctx.globalAlpha = alphaBase * 0.25;
        if (destaque && (modoPalavra === "pop" || modoPalavra === "brilho")) {
          ctx.font = fonte(estilo.weight, fs * (estilo.destaqueEscala ?? 1.1));
        }
        if (destaque && modoPalavra === "brilho") {
          ctx.shadowColor = estilo.activeColor;
          ctx.shadowBlur = 28;
        } else if (estilo.shadow) {
          ctx.shadowColor = estilo.shadowColor ?? "rgba(0,0,0,0.65)";
          ctx.shadowBlur = estilo.shadow;
        }
        if (estilo.stroke > 0) {
          ctx.lineWidth = estilo.stroke;
          ctx.strokeStyle = estilo.strokeColor;
          ctx.lineJoin = "round";
          ctx.strokeText(p, px, y);
        }
        ctx.fillStyle = destaque && modoPalavra !== "nenhuma" ? estilo.activeColor : estilo.color;
        ctx.fillText(p, px, y);
        ctx.shadowBlur = 0;
        ctx.globalAlpha = alphaBase;
        ctx.font = fonte(estilo.weight, fs);
        x += larguras[idx];
      });
    });
    if ("letterSpacing" in ctxAny) ctxAny.letterSpacing = "0px";
    ctx.restore();
  }

  /**
   * Caixa da legenda no frame (frações 0..1), usada pela seleção direta no
   * Reprodutor. Mede o texto com a mesma fonte do desenho, sem animações.
   */
  caixaLegenda(c: EditairClip, estilo: CaptionStyle): { cx: number; cy: number; w: number; h: number } | null {
    const texto = aplicarCaps(c.text ?? "", estilo.caps, estilo.uppercase);
    if (!texto) return null;
    const { ctx, width, height } = this;
    ctx.save();
    const fs = estilo.fontSize * (estilo.escala ?? 1);
    ctx.font = `${estilo.weight} ${fs}px ${estilo.fontFamily}`;
    const ctxAny = ctx as CanvasRenderingContext2D & { letterSpacing?: string };
    if ("letterSpacing" in ctxAny) ctxAny.letterSpacing = `${estilo.tracking ?? 0}px`;
    const fracLargura = clamp(estilo.boxWidth ?? 0.86, 0.1, 1);
    const maxLargura = width * fracLargura;
    const linhas = quebrarBalanceado(
      (s) => ctx.measureText(s).width,
      texto,
      maxLargura,
      Math.max(1, estilo.maxLines ?? 2),
    );
    if ("letterSpacing" in ctxAny) ctxAny.letterSpacing = "0px";
    ctx.restore();
    const alturaLinha = fs * (estilo.lineHeight ?? 1.18);
    const alturaTotal = Math.max(1, linhas.length) * alturaLinha + (estilo.paddingY ?? 6) * 2;
    const alinhamento = estilo.align ?? "center";
    const cx =
      typeof estilo.x === "number"
        ? clamp(estilo.x, 0, 1)
        : alinhamento === "left"
          ? (width * 0.07 + maxLargura / 2) / width
          : alinhamento === "right"
            ? (width * 0.93 - maxLargura / 2) / width
            : 0.5;
    // A caixa mostrada no Reprodutor é a caixa de texto (boxWidth), não a
    // medida do texto: puxar os cantos altera só a quebra de linha.
    return { cx, cy: estilo.y, w: fracLargura, h: alturaTotal / height };
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

  /* ------- render por quadros (Desktop): frame-accurate, sem rAF ------- */

  /** contadores da exportação em curso (zerados em prepararRenderQuadros) */
  medicaoRender = { seekMs: 0, desenhoMs: 0, leituraMs: 0, seeks: 0, seeksEvitados: 0 };
  /** passo estimado entre quadros de cada mídia (s) — usado para não buscar duas
      vezes o MESMO quadro de origem quando o FPS de export é maior que o da fonte */
  private passoFonte = new Map<string, number>();
  private bufferQuadro: Uint8Array | null = null;

  /** deixa todas as mídias paradas e mudas — usado no render final */
  prepararRenderQuadros() {
    this.definirMudo(true);
    this.medicaoRender = { seekMs: 0, desenhoMs: 0, leituraMs: 0, seeks: 0, seeksEvitados: 0 };
    this.passoFonte.clear();
    this.bufferQuadro = null;
    for (const [, m] of this.midias) {
      m.el.pause();
      m.el.muted = true;
      m.el.volume = 0;
      m.el.playbackRate = 1;
    }
  }

  private buscarExato(assetId: string, el: HTMLVideoElement, alvoS: number) {
    const passo = this.passoFonte.get(assetId) ?? 0;
    // tolerância = meio quadro da fonte: dentro disso o decoder devolveria
    // exatamente o mesmo frame, então o seek seria trabalho jogado fora.
    const tol = Math.max(0.004, passo * 0.5);
    const atual = el.currentTime;
    if (el.readyState >= 2 && alvoS >= atual - 0.0005 && alvoS - atual < tol) {
      this.medicaoRender.seeksEvitados += 1;
      return Promise.resolve();
    }
    const t0 = performance.now();
    this.medicaoRender.seeks += 1;
    return new Promise<void>((resolve) => {
      let pronto = false;
      const fim = () => {
        if (pronto) return;
        pronto = true;
        el.removeEventListener("seeked", fim);
        const delta = el.currentTime - atual;
        // diferença positiva pequena entre quadros consecutivos ≈ duração do quadro da fonte
        if (delta > 0.005 && delta < 0.2) {
          const anterior = this.passoFonte.get(assetId);
          this.passoFonte.set(assetId, anterior ? Math.min(anterior, delta) : delta);
        }
        this.medicaoRender.seekMs += performance.now() - t0;
        resolve();
      };
      el.addEventListener("seeked", fim, { once: true });
      window.setTimeout(fim, 2000);
      try {
        el.currentTime = Math.max(0, alvoS);
      } catch {
        fim();
      }
    });
  }

  /** posiciona cada mídia no quadro exato e desenha (assíncrono, determinístico) */
  async renderizarQuadro(state: ProjectState, t: number) {
    const ativos = this.ativos(state, t).filter((c) => c.assetId);
    await Promise.all(
      ativos.map((c) => {
        const m = this.midias.get(c.assetId!);
        if (!m) return Promise.resolve();
        const alvo = ((c.sourceIn || 0) + (t - c.start) * clamp(c.speed || 1, 0.25, 4)) / 1000;
        return this.buscarExato(c.assetId!, m.el, alvo);
      }),
    );
    const t1 = performance.now();
    this.desenhar(state, t);
    this.medicaoRender.desenhoMs += performance.now() - t1;
  }

  /** pixels RGBA do quadro atual, prontos para o FFmpeg */
  quadroRGBA(): Uint8Array {
    const { width, height } = this.canvas;
    const t0 = performance.now();
    const dados = this.ctx.getImageData(0, 0, width, height).data;
    const saida = new Uint8Array(dados.buffer.slice(0));
    this.medicaoRender.leituraMs += performance.now() - t0;
    return saida;
  }

  /** assinatura barata do quadro atual — permite repetir o frame anterior no
      FFmpeg sem pagar 8 MB de IPC quando nada mudou na tela */
  static assinatura(px: Uint8Array): number {
    const u32 = new Uint32Array(px.buffer, px.byteOffset, px.byteLength >> 2);
    let h = 0x811c9dc5 ^ u32.length;
    for (let i = 0; i < u32.length; i += 4) {
      h = (h ^ u32[i]!) >>> 0;
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h >>> 0;
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
