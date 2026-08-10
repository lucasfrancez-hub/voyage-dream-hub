/**
 * Análise de áudio no navegador: envelope, detecção de fala, silêncios
 * e montagem da primeira edição automática (conceito EDVID).
 */

export type Envelope = {
  /** RMS por janela */
  rms: Float32Array;
  /** duração de cada janela em ms */
  hopMs: number;
  durationMs: number;
};

export type RegiaoFala = { start: number; end: number };

export async function decodificarAudio(arquivo: Blob): Promise<AudioBuffer> {
  const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  const buf = await arquivo.arrayBuffer();
  const audio = await ctx.decodeAudioData(buf);
  void ctx.close();
  return audio;
}

export function calcularEnvelope(audio: AudioBuffer, hopMs = 20): Envelope {
  const canal = audio.getChannelData(0);
  const hop = Math.max(1, Math.floor((audio.sampleRate * hopMs) / 1000));
  const n = Math.floor(canal.length / hop);
  const rms = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let soma = 0;
    const ini = i * hop;
    for (let j = 0; j < hop; j++) {
      const v = canal[ini + j] ?? 0;
      soma += v * v;
    }
    rms[i] = Math.sqrt(soma / hop);
  }
  return { rms, hopMs, durationMs: (audio.length / audio.sampleRate) * 1000 };
}

/** Waveform reduzida para desenhar na timeline. */
export function reduzirWaveform(env: Envelope, pontos = 600): number[] {
  const out: number[] = [];
  const passo = env.rms.length / pontos;
  let pico = 0.0001;
  for (let i = 0; i < pontos; i++) {
    let max = 0;
    for (let j = Math.floor(i * passo); j < Math.floor((i + 1) * passo); j++) {
      max = Math.max(max, env.rms[j] ?? 0);
    }
    out.push(max);
    pico = Math.max(pico, max);
  }
  return out.map((v) => v / pico);
}

export type OpcoesFala = {
  /** silêncio maior que isso vira corte (ms) */
  pausaMaximaMs: number;
  /** margem preservada antes/depois da fala (ms) */
  margemMs: number;
  /** trechos de fala menores que isso são descartados */
  minimoFalaMs: number;
};

export const FALA_PADRAO: OpcoesFala = { pausaMaximaMs: 450, margemMs: 90, minimoFalaMs: 220 };

/** Detecta regiões de fala com limiar adaptativo (ruído de fundo + margem). */
export function detectarFala(env: Envelope, opcoes: OpcoesFala = FALA_PADRAO): {
  regioes: RegiaoFala[];
  pausas: RegiaoFala[];
  limiar: number;
} {
  const ordenado = Array.from(env.rms).sort((a, b) => a - b);
  const ruido = ordenado[Math.floor(ordenado.length * 0.2)] || 0;
  const forte = ordenado[Math.floor(ordenado.length * 0.95)] || 0.01;
  const limiar = Math.max(ruido * 2.4, forte * 0.08, 0.004);

  const regioes: RegiaoFala[] = [];
  let abertura: number | null = null;
  for (let i = 0; i < env.rms.length; i++) {
    const ativo = env.rms[i] > limiar;
    const t = i * env.hopMs;
    if (ativo && abertura == null) abertura = t;
    if (!ativo && abertura != null) {
      regioes.push({ start: abertura, end: t });
      abertura = null;
    }
  }
  if (abertura != null) regioes.push({ start: abertura, end: env.durationMs });

  // une regiões separadas por pausas curtas (respiração natural — não cortar)
  const unidas: RegiaoFala[] = [];
  for (const r of regioes) {
    const ultimo = unidas[unidas.length - 1];
    if (ultimo && r.start - ultimo.end < opcoes.pausaMaximaMs) {
      ultimo.end = r.end;
    } else {
      unidas.push({ ...r });
    }
  }

  const finais = unidas
    .filter((r) => r.end - r.start >= opcoes.minimoFalaMs)
    .map((r) => ({
      start: Math.max(0, r.start - opcoes.margemMs),
      end: Math.min(env.durationMs, r.end + opcoes.margemMs),
    }));

  const pausas: RegiaoFala[] = [];
  let cursor = 0;
  for (const r of finais) {
    if (r.start - cursor > opcoes.pausaMaximaMs) pausas.push({ start: cursor, end: r.start });
    cursor = r.end;
  }
  if (env.durationMs - cursor > opcoes.pausaMaximaMs) pausas.push({ start: cursor, end: env.durationMs });

  return { regioes: finais, pausas, limiar };
}

/** Converte um AudioBuffer em WAV 16 kHz mono (formato aceito pela transcrição). */
export function paraWav16k(audio: AudioBuffer, inicioMs = 0, fimMs?: number): Blob {
  const alvo = 16000;
  const sr = audio.sampleRate;
  const canal = audio.getChannelData(0);
  const ini = Math.floor((inicioMs / 1000) * sr);
  const fim = Math.min(canal.length, Math.floor(((fimMs ?? audio.duration * 1000) / 1000) * sr));
  const razao = sr / alvo;
  const n = Math.max(0, Math.floor((fim - ini) / razao));
  const pcm = new Int16Array(n);
  for (let i = 0; i < n; i++) {
    const v = canal[ini + Math.floor(i * razao)] ?? 0;
    pcm[i] = Math.max(-1, Math.min(1, v)) * 0x7fff;
  }
  const header = new ArrayBuffer(44);
  const view = new DataView(header);
  const escrever = (off: number, txt: string) => {
    for (let i = 0; i < txt.length; i++) view.setUint8(off + i, txt.charCodeAt(i));
  };
  escrever(0, "RIFF");
  view.setUint32(4, 36 + pcm.byteLength, true);
  escrever(8, "WAVE");
  escrever(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, alvo, true);
  view.setUint32(28, alvo * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  escrever(36, "data");
  view.setUint32(40, pcm.byteLength, true);
  return new Blob([header, pcm.buffer], { type: "audio/wav" });
}

export function blobParaBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = () => reject(new Error("Falha ao ler arquivo"));
    fr.onload = () => {
      const r = String(fr.result);
      resolve(r.slice(r.indexOf(",") + 1));
    };
    fr.readAsDataURL(blob);
  });
}

/** Lê duração e dimensões de um arquivo de vídeo/áudio local. */
export function lerMetadados(arquivo: File): Promise<{ durationMs: number; width: number; height: number }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(arquivo);
    const ehVideo = arquivo.type.startsWith("video");
    const el = document.createElement(ehVideo ? "video" : "audio");
    el.preload = "metadata";
    el.onloadedmetadata = () => {
      const v = el as HTMLVideoElement;
      resolve({
        durationMs: Math.round((el.duration || 0) * 1000),
        width: ehVideo ? v.videoWidth : 0,
        height: ehVideo ? v.videoHeight : 0,
      });
      URL.revokeObjectURL(url);
    };
    el.onerror = () => {
      resolve({ durationMs: 0, width: 0, height: 0 });
      URL.revokeObjectURL(url);
    };
    el.src = url;
  });
}
