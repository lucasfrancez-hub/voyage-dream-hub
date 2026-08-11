/* Exportação híbrida do EditAir (caminho rápido + composição).

   Trechos "diretos" (corte puro de um vídeo, sem nada desenhado por cima) são
   cortados e recodificados direto pelo FFmpeg, com decodificação e codificação
   por hardware — nunca passam pelo canvas nem pelo IPC.

   Trechos "compostos" (legenda, imagem sobreposta, transformação, efeito…)
   continuam vindo quadro a quadro do renderer, como antes.

   No fim, os pedaços são concatenados sem recodificar (concat demuxer, -c copy)
   e o áudio original é mixado uma única vez. Todos os pedaços saem com o mesmo
   codec/resolução/fps/GOP, que é o que permite o concat sem recodificar. */
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { FFMPEG } = require("./media.cjs");
const rf = require("./render-frames.cjs");

const ms2s = (ms) => (Math.max(0, ms) / 1000).toFixed(3);

/** Concorrência dos cortes diretos: mais que isso satura o encoder do Mac. */
const PARALELO = 2;

function execFfmpeg(args, onLinha) {
  return new Promise((resolve, reject) => {
    const ps = spawn(FFMPEG, args, { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    ps.stderr.on("data", (d) => {
      const txt = d.toString();
      err = (err + txt).slice(-4000);
      onLinha?.(txt);
    });
    ps.on("error", reject);
    ps.on("close", (code) => (code === 0 ? resolve(true) : reject(new Error(err.split("\n").slice(-6).join(" ")))));
    return ps;
  });
}

/**
 * spec: igual ao render por quadros + { segmentos: [{tipo,startMs,endMs,arquivo,sourceInMs,sourceOutMs}] }
 */
async function iniciarPlano(spec, onProgress) {
  const {
    destino,
    width,
    height,
    fps = 30,
    formato = "mp4",
    codec = "h264",
    videoBitrate,
    preset = "recomendado",
    audio = [],
    comAudio = true,
    segmentos = [],
  } = spec;

  const bruto = videoBitrate || (height >= 2160 ? "45M" : height >= 1440 ? "24M" : height >= 1080 ? "14M" : "8M");
  const bv = typeof bruto === "number" ? `${Math.round(bruto / 1000)}k` : bruto;
  const enc = await rf.argsEncoder({ preset, formato, codec, bv, fps });

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "editair-export-"));
  const partes = segmentos.map((s, i) => ({
    ...s,
    indice: i,
    frames: Math.max(1, Math.round(((s.endMs - s.startMs) / 1000) * fps)),
    arquivoSaida: path.join(tmp, `parte-${String(i).padStart(4, "0")}.${formato === "webm" ? "webm" : "mp4"}`),
    pronto: false,
  }));

  const job = {
    id: crypto.randomUUID(),
    destino,
    tmp,
    width,
    height,
    fps,
    formato,
    audio,
    comAudio: comAudio && audio.length > 0,
    enc,
    encoder: enc.encoder,
    hardware: enc.hardware,
    preset,
    partes,
    framesTotais: partes.reduce((t, p) => t + p.frames, 0),
    framesFeitos: 0,
    diretoMs: 0,
    estado: "rodando",
    onProgress,
    subjob: null,
    diretosPromise: null,
  };

  job.diretosPromise = rodarDiretos(job);
  return job;
}

/** argumentos comuns a TODO pedaço: mesma geometria, fps e GOP curto */
function argsSaidaComuns(job) {
  return [
    "-an",
    "-vsync", "cfr",
    "-r", String(job.fps),
    ...job.enc.args,
    // GOP curto mantém os pedaços independentes e o concat perfeitamente alinhado
    "-g", String(Math.max(1, Math.round(job.fps))),
    "-movflags", "+faststart",
  ];
}

/** Corte puro: FFmpeg lê, decodifica (hardware) e recodifica sem passar pelo app. */
async function renderDireto(job, parte) {
  const dur = (parte.endMs - parte.startMs) / 1000;
  const escala =
    `scale=${job.width}:${job.height}:force_original_aspect_ratio=decrease,` +
    `pad=${job.width}:${job.height}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,format=yuv420p`;
  const args = [
    "-y",
    "-hide_banner",
    ...(process.platform === "darwin" ? ["-hwaccel", "videotoolbox"] : []),
    "-ss", ms2s(parte.sourceInMs),
    "-t", dur.toFixed(3),
    "-i", parte.arquivo,
    "-map", "0:v:0",
    "-vf", escala,
    "-frames:v", String(parte.frames),
    ...argsSaidaComuns(job),
    parte.arquivoSaida,
  ];
  const t0 = Date.now();
  await execFfmpeg(args, () => {
    /* progresso do pedaço é contabilizado ao concluir */
  });
  job.diretoMs += Date.now() - t0;
  parte.pronto = true;
  job.framesFeitos += parte.frames;
  job.onProgress?.(job.framesFeitos, job.framesTotais);
}

/** Roda os cortes diretos em paralelo enquanto o renderer cuida dos compostos. */
async function rodarDiretos(job) {
  const fila = job.partes.filter((p) => p.tipo === "direto");
  let i = 0;
  const trabalhador = async () => {
    while (i < fila.length && job.estado === "rodando") {
      const parte = fila[i++];
      await renderDireto(job, parte);
    }
  };
  await Promise.all(Array.from({ length: Math.min(PARALELO, fila.length) }, trabalhador));
}

/** Abre um pedaço composto: os quadros chegam do renderer, como no modo antigo. */
async function abrirComposto(job, indice) {
  const parte = job.partes[indice];
  if (!parte || parte.tipo !== "composto") throw new Error("Segmento composto inválido");
  const sub = await rf.iniciar({
    destino: parte.arquivoSaida,
    width: job.width,
    height: job.height,
    fps: job.fps,
    totalFrames: parte.frames,
    formato: job.formato,
    codec: job.enc.encoder.includes("265") ? "h265" : "h264",
    preset: job.preset,
    audio: [],
    comAudio: false,
    argsEncoderProntos: job.enc,
    gop: job.fps,
  });
  job.subjob = { sub, parte };
  return { frames: parte.frames };
}

async function quadroComposto(job, buffer) {
  if (!job.subjob) throw new Error("Nenhum segmento composto aberto");
  await rf.enviarQuadro(job.subjob.sub, buffer);
  job.framesFeitos += 1;
  job.onProgress?.(job.framesFeitos, job.framesTotais);
}

async function repetirComposto(job, vezes = 1) {
  if (!job.subjob) throw new Error("Nenhum segmento composto aberto");
  await rf.repetirQuadro(job.subjob.sub, vezes);
  job.framesFeitos += vezes;
  job.onProgress?.(job.framesFeitos, job.framesTotais);
}

async function fecharComposto(job) {
  if (!job.subjob) return null;
  const { sub, parte } = job.subjob;
  await rf.finalizar(sub);
  parte.pronto = true;
  job.subjob = null;
  return parte.arquivoSaida;
}

/** Junta os pedaços sem recodificar e mixa o áudio original em uma única passada. */
async function finalizarPlano(job) {
  await job.diretosPromise;
  const faltando = job.partes.filter((p) => !p.pronto);
  if (faltando.length) throw new Error(`Segmentos não finalizados: ${faltando.length}`);

  const lista = path.join(job.tmp, "partes.txt");
  fs.writeFileSync(lista, job.partes.map((p) => `file '${p.arquivoSaida.replace(/'/g, "'\\''")}'`).join("\n"));

  fs.mkdirSync(path.dirname(job.destino), { recursive: true });
  const args = ["-y", "-hide_banner", "-f", "concat", "-safe", "0", "-i", lista];
  for (const a of job.audio) args.push("-i", a.path);
  const fa = job.comAudio ? rf.filtrosDeAudio(job.audio) : null;
  if (fa) {
    args.push("-filter_complex", fa, "-map", "0:v:0", "-map", "[aout]");
    args.push("-c:a", job.formato === "webm" ? "libopus" : "aac", "-b:a", "256k", "-shortest");
  } else {
    args.push("-map", "0:v:0", "-an");
  }
  // vídeo já está no codec final: concat sem recodificar (rápido e sem perda)
  args.push("-c:v", "copy");
  if (job.formato === "mp4") args.push("-movflags", "+faststart");
  args.push(job.destino);

  await execFfmpeg(args);
  job.estado = "concluido";
  limparTmp(job);
  return job.destino;
}

function limparTmp(job) {
  try {
    fs.rmSync(job.tmp, { recursive: true, force: true });
  } catch {
    /* ignora */
  }
}

function cancelarPlano(job) {
  job.estado = "cancelado";
  try {
    if (job.subjob) rf.cancelar(job.subjob.sub);
  } catch {
    /* ignora */
  }
  limparTmp(job);
  try {
    if (job.destino && fs.existsSync(job.destino)) fs.rmSync(job.destino, { force: true });
  } catch {
    /* ignora */
  }
}

module.exports = {
  iniciarPlano,
  abrirComposto,
  quadroComposto,
  repetirComposto,
  fecharComposto,
  finalizarPlano,
  cancelarPlano,
};
