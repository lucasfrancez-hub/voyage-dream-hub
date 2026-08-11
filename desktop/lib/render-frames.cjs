/* Render final nativo do EditAir Desktop.
   O renderer desenha cada quadro no canvas (mesmo motor do preview) e envia os
   pixels crus por IPC; aqui os quadros entram no FFmpeg por stdin e o áudio é
   montado direto dos arquivos originais (atrim/atempo/adelay/amix).
   Assim o render não depende de requestAnimationFrame nem da janela visível. */
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { FFMPEG, melhorEncoder } = require("./media.cjs");

const jobs = new Map();

function cadeiaAtempo(speed) {
  const partes = [];
  let s = Math.min(4, Math.max(0.25, speed || 1));
  while (s > 2) {
    partes.push("atempo=2");
    s /= 2;
  }
  while (s < 0.5) {
    partes.push("atempo=0.5");
    s *= 2;
  }
  if (Math.abs(s - 1) > 0.001) partes.push(`atempo=${s.toFixed(4)}`);
  return partes;
}

function filtrosDeAudio(audio) {
  const filtros = [];
  const rotulos = [];
  audio.forEach((a, i) => {
    const idx = i + 1; // 0 = vídeo (pipe)
    const cadeia = [
      `atrim=start=${(a.sourceInMs / 1000).toFixed(3)}:end=${(a.sourceOutMs / 1000).toFixed(3)}`,
      "asetpts=PTS-STARTPTS",
      ...cadeiaAtempo(a.speed),
      `volume=${(a.volume ?? 1).toFixed(3)}`,
      "aresample=48000",
    ];
    if (a.delayMs > 0) cadeia.push(`adelay=${Math.round(a.delayMs)}|${Math.round(a.delayMs)}`);
    filtros.push(`[${idx}:a]${cadeia.join(",")}[a${i}]`);
    rotulos.push(`[a${i}]`);
  });
  if (!audio.length) return null;
  filtros.push(`${rotulos.join("")}amix=inputs=${audio.length}:normalize=0:dropout_transition=0[aout]`);
  return filtros.join(";");
}

/** vídeo vindo do pipe: garante dimensões pares e pixel format compatível */
const FILTRO_VIDEO = "[0:v]scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p[vout]";


/**
 * Inicia um render por quadros.
 * spec: { destino, width, height, fps, totalFrames, formato, codec, videoBitrate, audio: [], comAudio }
 */
async function iniciar(spec, onProgress) {
  const {
    destino,
    width,
    height,
    fps = 30,
    totalFrames = 0,
    formato = "mp4",
    codec = "h264",
    videoBitrate,
    audio = [],
    comAudio = true,
  } = spec;

  fs.mkdirSync(path.dirname(destino), { recursive: true });
  const usaAudio = comAudio && audio.length > 0;

  const args = [
    "-y",
    "-f", "rawvideo",
    "-pix_fmt", "rgba",
    "-s", `${width}x${height}`,
    "-r", String(fps),
    "-i", "pipe:0",
  ];
  for (const a of audio) args.push("-i", a.path);

  const fa = usaAudio ? filtrosDeAudio(audio) : null;
  args.push("-filter_complex", fa ? `${FILTRO_VIDEO};${fa}` : FILTRO_VIDEO);
  args.push("-map", "[vout]");
  if (fa) args.push("-map", "[aout]");
  else args.push("-an");


  const bv =
    videoBitrate || (height >= 2160 ? "45M" : height >= 1440 ? "24M" : height >= 1080 ? "14M" : "8M");

  args.push(
    "-c:v", formato === "webm" ? await melhorEncoder("vp9") : await melhorEncoder(codec),
    "-pix_fmt", "yuv420p",
    "-b:v", typeof bv === "number" ? `${Math.round(bv / 1000)}k` : bv,
    "-r", String(fps),
  );
  if (usaAudio) args.push("-c:a", formato === "webm" ? "libopus" : "aac", "-b:a", "256k", "-shortest");
  if (formato === "mp4") args.push("-movflags", "+faststart");
  args.push(destino);

  const proc = spawn(FFMPEG, args, { stdio: ["pipe", "ignore", "pipe"] });
  const job = {
    proc,
    destino,
    totalFrames,
    frames: 0,
    estado: "rodando",
    erro: "",
    log: "",
    fim: null,
  };
  proc.stderr.on("data", (d) => {
    job.log = (job.log + d.toString()).slice(-4000);
  });
  job.fim = new Promise((resolve, reject) => {
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) resolve(destino);
      else reject(new Error(job.log.split("\n").slice(-6).join(" ").trim() || `FFmpeg saiu com código ${code}`));
    });
  });
  proc.stdin.on("error", () => {
    /* ffmpeg pode fechar antes; erro real vem do close */
  });
  job.onProgress = onProgress;
  return job;
}

/** escreve um quadro (Buffer RGBA) respeitando o backpressure do FFmpeg */
function enviarQuadro(job, buffer) {
  return new Promise((resolve, reject) => {
    if (job.estado !== "rodando") return resolve(false);
    const ok = job.proc.stdin.write(buffer, (e) => (e ? reject(e) : null));
    job.frames += 1;
    job.onProgress?.(job.frames, job.totalFrames);
    if (ok) resolve(true);
    else job.proc.stdin.once("drain", () => resolve(true));
  });
}

async function finalizar(job) {
  job.proc.stdin.end();
  const destino = await job.fim;
  job.estado = "concluido";
  return destino;
}

function cancelar(job) {
  job.estado = "cancelado";
  try {
    job.proc.stdin.destroy();
    job.proc.kill("SIGKILL");
  } catch {
    /* ignora */
  }
  try {
    if (job.destino && fs.existsSync(job.destino)) fs.rmSync(job.destino, { force: true });
  } catch {
    /* ignora */
  }
}

module.exports = { jobs, iniciar, enviarQuadro, finalizar, cancelar, cadeiaAtempo, filtrosDeAudio };
