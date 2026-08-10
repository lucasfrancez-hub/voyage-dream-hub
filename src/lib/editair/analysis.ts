/**
 * Análise técnica do material bruto — o que o "cérebro editorial" enxerga
 * antes de decidir qualquer corte: áudio por trecho, pausas, e leitura
 * visual (exposição, contraste, nitidez, cor e enquadramento).
 *
 * Nada aqui decide corte: isto só mede. A decisão é do plano editorial.
 */

import { calcularEnvelope, detectarFala, type Envelope } from "./audio";

export type TrechoAudio = {
  fromMs: number;
  toMs: number;
  /** nível médio do trecho em dBFS */
  dbfs: number;
  /** diferença para o nível médio da fala do vídeo, em dB */
  deltaDb: number;
};

export type PausaMedida = { fromMs: number; toMs: number; ms: number };

export type AmostraVisual = {
  atMs: number;
  brilho: number; // 0..1
  contraste: number; // 0..1 (desvio padrão da luminância)
  nitidez: number; // 0..1 (energia de bordas)
  saturacao: number; // 0..1
};

export type LeituraVisual = {
  amostras: AmostraVisual[];
  brilhoMedio: number;
  contrasteMedio: number;
  nitidezMedia: number;
  saturacaoMedia: number;
  exposicaoOk: boolean;
  contrasteOk: boolean;
  nitidezOk: boolean;
  corOk: boolean;
  /** proporção real do material */
  ratio: number;
  enquadramento: "vertical" | "quadrado" | "horizontal";
  /** o material já está no formato do projeto? */
  enquadramentoOk: boolean;
  barras: boolean;
};

export type AnaliseTecnica = {
  durationMs: number;
  falas: TrechoAudio[];
  pausas: PausaMedida[];
  nivelMedioDb: number;
  ruidoDb: number;
  trechosBaixos: TrechoAudio[];
  clipping: boolean;
  visual: LeituraVisual | null;
};

const dB = (v: number) => 20 * Math.log10(Math.max(v, 1e-6));

function nivelTrecho(env: Envelope, fromMs: number, toMs: number) {
  const a = Math.max(0, Math.floor(fromMs / env.hopMs));
  const b = Math.min(env.rms.length, Math.ceil(toMs / env.hopMs));
  let soma = 0;
  let n = 0;
  for (let i = a; i < b; i++) {
    const v = env.rms[i] ?? 0;
    if (v <= 0) continue;
    soma += v * v;
    n++;
  }
  if (!n) return -60;
  return dB(Math.sqrt(soma / n));
}

/** Mede áudio por trecho, sem aplicar nada. */
export function analisarAudio(audio: AudioBuffer): Omit<AnaliseTecnica, "visual"> {
  const env = calcularEnvelope(audio, 20);
  const { regioes, pausas } = detectarFala(env);

  const falas: TrechoAudio[] = regioes.map((r) => ({
    fromMs: Math.round(r.start),
    toMs: Math.round(r.end),
    dbfs: Number(nivelTrecho(env, r.start, r.end).toFixed(1)),
    deltaDb: 0,
  }));

  // nível médio ponderado pela duração das falas
  const totalMs = falas.reduce((s, f) => s + (f.toMs - f.fromMs), 0) || 1;
  const medio = falas.reduce((s, f) => s + f.dbfs * (f.toMs - f.fromMs), 0) / totalMs;
  for (const f of falas) f.deltaDb = Number((f.dbfs - medio).toFixed(1));

  const ordenado = Array.from(env.rms).sort((a, b) => a - b);
  const ruidoDb = Number(dB(ordenado[Math.floor(ordenado.length * 0.15)] ?? 0).toFixed(1));

  let clipping = false;
  const canal = audio.getChannelData(0);
  for (let i = 0; i < canal.length; i += 97) {
    if (Math.abs(canal[i]) > 0.995) {
      clipping = true;
      break;
    }
  }

  return {
    durationMs: Math.round(env.durationMs),
    falas,
    pausas: pausas.map((p) => ({ fromMs: Math.round(p.start), toMs: Math.round(p.end), ms: Math.round(p.end - p.start) })),
    nivelMedioDb: Number(medio.toFixed(1)),
    ruidoDb,
    trechosBaixos: falas.filter((f) => f.deltaDb <= -2.5),
    clipping,
  };
}

/** Amostra frames do vídeo e mede exposição, contraste, nitidez e cor. */
export async function analisarVisual(url: string, durationMs: number, formatoRatio: number, amostras = 8): Promise<LeituraVisual> {
  const video = document.createElement("video");
  video.src = url;
  video.crossOrigin = "anonymous";
  video.muted = true;
  video.preload = "auto";
  await new Promise<void>((res, rej) => {
    video.onloadedmetadata = () => res();
    video.onerror = () => rej(new Error("Não consegui ler o vídeo para análise visual"));
  });

  const cw = 192;
  const ch = Math.max(2, Math.round((cw * video.videoHeight) / Math.max(1, video.videoWidth)));
  const canvas = document.createElement("canvas");
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;

  const dur = durationMs || video.duration * 1000;
  const pontos: AmostraVisual[] = [];
  let barras = false;

  for (let i = 0; i < amostras; i++) {
    const t = (dur * (i + 0.5)) / amostras / 1000;
    await new Promise<void>((res) => {
      const done = () => {
        video.removeEventListener("seeked", done);
        res();
      };
      video.addEventListener("seeked", done);
      video.currentTime = Math.min(Math.max(0.05, t), Math.max(0.1, video.duration - 0.05));
    });
    ctx.drawImage(video, 0, 0, cw, ch);
    const { data } = ctx.getImageData(0, 0, cw, ch);

    let soma = 0;
    let soma2 = 0;
    let sat = 0;
    const luma = new Float32Array(cw * ch);
    for (let p = 0, k = 0; p < data.length; p += 4, k++) {
      const r = data[p] / 255;
      const g = data[p + 1] / 255;
      const b = data[p + 2] / 255;
      const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      luma[k] = y;
      soma += y;
      soma2 += y * y;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      sat += max === 0 ? 0 : (max - min) / max;
    }
    const n = cw * ch;
    const brilho = soma / n;
    const contraste = Math.sqrt(Math.max(0, soma2 / n - brilho * brilho));

    let bordas = 0;
    for (let y = 1; y < ch - 1; y++) {
      for (let x = 1; x < cw - 1; x++) {
        const k = y * cw + x;
        bordas += Math.abs(luma[k] * 4 - luma[k - 1] - luma[k + 1] - luma[k - cw] - luma[k + cw]);
      }
    }
    const nitidez = Math.min(1, bordas / n / 0.25);

    // barras pretas (letterbox / pillarbox)
    let topo = 0;
    let base = 0;
    for (let x = 0; x < cw; x++) {
      topo += luma[x];
      base += luma[(ch - 1) * cw + x];
    }
    if (topo / cw < 0.03 && base / cw < 0.03) barras = true;

    pontos.push({
      atMs: Math.round(t * 1000),
      brilho: Number(brilho.toFixed(3)),
      contraste: Number(contraste.toFixed(3)),
      nitidez: Number(nitidez.toFixed(3)),
      saturacao: Number((sat / n).toFixed(3)),
    });
  }

  const med = (f: (a: AmostraVisual) => number) => pontos.reduce((s, a) => s + f(a), 0) / (pontos.length || 1);
  const brilhoMedio = med((a) => a.brilho);
  const contrasteMedio = med((a) => a.contraste);
  const nitidezMedia = med((a) => a.nitidez);
  const saturacaoMedia = med((a) => a.saturacao);
  const ratio = video.videoWidth / Math.max(1, video.videoHeight);

  video.src = "";

  return {
    amostras: pontos,
    brilhoMedio: Number(brilhoMedio.toFixed(3)),
    contrasteMedio: Number(contrasteMedio.toFixed(3)),
    nitidezMedia: Number(nitidezMedia.toFixed(3)),
    saturacaoMedia: Number(saturacaoMedia.toFixed(3)),
    exposicaoOk: brilhoMedio > 0.28 && brilhoMedio < 0.68,
    contrasteOk: contrasteMedio > 0.12 && contrasteMedio < 0.34,
    nitidezOk: nitidezMedia > 0.18,
    corOk: saturacaoMedia > 0.14 && saturacaoMedia < 0.62,
    ratio: Number(ratio.toFixed(3)),
    enquadramento: ratio < 0.85 ? "vertical" : ratio > 1.2 ? "horizontal" : "quadrado",
    enquadramentoOk: Math.abs(ratio - formatoRatio) < 0.08,
    barras,
  };
}

/** Resumo compacto para enviar à IA (sem despejar milhares de números). */
export function resumirAnalise(a: AnaliseTecnica) {
  return {
    duracaoMs: a.durationMs,
    nivelMedioDb: a.nivelMedioDb,
    ruidoDb: a.ruidoDb,
    clipping: a.clipping,
    falas: a.falas.slice(0, 400).map((f) => ({ de: f.fromMs, ate: f.toMs, db: f.dbfs, delta: f.deltaDb })),
    pausas: a.pausas.slice(0, 200).map((p) => ({ de: p.fromMs, ate: p.toMs, ms: p.ms })),
    visual: a.visual
      ? {
          brilho: a.visual.brilhoMedio,
          contraste: a.visual.contrasteMedio,
          nitidez: a.visual.nitidezMedia,
          saturacao: a.visual.saturacaoMedia,
          exposicaoOk: a.visual.exposicaoOk,
          contrasteOk: a.visual.contrasteOk,
          nitidezOk: a.visual.nitidezOk,
          corOk: a.visual.corOk,
          enquadramento: a.visual.enquadramento,
          enquadramentoOk: a.visual.enquadramentoOk,
          barras: a.visual.barras,
        }
      : null,
  };
}
