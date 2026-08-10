/* Engine local de mídia: ffprobe/ffmpeg nativos embutidos no app.
   Nada aqui envia arquivo para a internet — tudo roda na máquina do usuário. */
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const { dirs, lerSettings } = require("./paths.cjs");

function desempacotar(p) {
  // dentro do .asar os binários ficam em app.asar.unpacked
  return p ? p.replace("app.asar", "app.asar.unpacked") : p;
}

const FFMPEG = desempacotar(require("ffmpeg-static"));
const FFPROBE = desempacotar(require("ffprobe-static").path);

function existeFfmpeg() {
  try {
    return Boolean(FFMPEG && fs.existsSync(FFMPEG) && FFPROBE && fs.existsSync(FFPROBE));
  } catch {
    return false;
  }
}

function exec(bin, args, { onProgress, timeoutMs = 0 } = {}) {
  return new Promise((resolve, reject) => {
    const ps = spawn(bin, args, { windowsHide: true });
    let out = "";
    let err = "";
    ps.stdout.on("data", (d) => {
      out += d.toString();
      if (out.length > 8_000_000) out = out.slice(-4_000_000);
    });
    ps.stderr.on("data", (d) => {
      const txt = d.toString();
      err += txt;
      if (err.length > 200_000) err = err.slice(-100_000);
      if (onProgress) onProgress(txt);
    });
    ps.on("error", reject);
    ps.on("close", (code) => (code === 0 ? resolve({ out, err }) : reject(new Error(err.slice(-2000) || `código ${code}`))));
    if (timeoutMs) setTimeout(() => ps.kill("SIGKILL"), timeoutMs);
  });
}

const hashPath = (p) => crypto.createHash("sha1").update(p).digest("hex").slice(0, 16);

async function probe(arquivo) {
  const { out } = await exec(FFPROBE, [
    "-v", "error",
    "-print_format", "json",
    "-show_format",
    "-show_streams",
    arquivo,
  ]);
  const json = JSON.parse(out || "{}");
  const streams = json.streams || [];
  const v = streams.find((s) => s.codec_type === "video");
  const a = streams.find((s) => s.codec_type === "audio");
  const fpsTexto = v?.avg_frame_rate && v.avg_frame_rate !== "0/0" ? v.avg_frame_rate : "30/1";
  const [n, d] = fpsTexto.split("/").map(Number);
  const rot = Math.abs(Number(v?.side_data_list?.[0]?.rotation ?? 0)) % 180;
  const largura = rot === 90 ? Number(v?.height ?? 0) : Number(v?.width ?? 0);
  const altura = rot === 90 ? Number(v?.width ?? 0) : Number(v?.height ?? 0);
  const stat = fs.statSync(arquivo);
  return {
    durationMs: Math.round(Number(json.format?.duration ?? 0) * 1000),
    width: largura,
    height: altura,
    fps: d ? Math.round((n / d) * 1000) / 1000 : 30,
    hasVideo: Boolean(v),
    hasAudio: Boolean(a),
    videoCodec: v?.codec_name ?? null,
    audioCodec: a?.codec_name ?? null,
    sizeBytes: stat.size,
    mtimeMs: stat.mtimeMs,
    kind: v ? "video" : a ? "audio" : "image",
  };
}

async function thumbnail(arquivo, meta) {
  const destino = path.join(dirs.thumbnails(), `${hashPath(arquivo)}.jpg`);
  if (fs.existsSync(destino)) return destino;
  const emSegundos = Math.max(0, Math.min((meta?.durationMs ?? 0) / 1000 * 0.1, ((meta?.durationMs ?? 0) / 1000) - 0.1));
  await exec(FFMPEG, [
    "-y", "-ss", String(emSegundos.toFixed(3)),
    "-i", arquivo,
    "-frames:v", "1",
    "-vf", "scale=480:-2",
    "-q:v", "4",
    destino,
  ], { timeoutMs: 120000 });
  return fs.existsSync(destino) ? destino : null;
}

/** Picos de áudio (waveform) calculados localmente e guardados em cache JSON. */
async function waveform(arquivo, pontos = 1200) {
  const destino = path.join(dirs.waveforms(), `${hashPath(arquivo)}.json`);
  if (fs.existsSync(destino)) return JSON.parse(fs.readFileSync(destino, "utf8"));
  const pcm = path.join(dirs.waveforms(), `${hashPath(arquivo)}.raw`);
  await exec(FFMPEG, ["-y", "-i", arquivo, "-ac", "1", "-ar", "8000", "-f", "s16le", pcm], { timeoutMs: 600000 });
  const buf = fs.readFileSync(pcm);
  fs.rmSync(pcm, { force: true });
  const total = Math.floor(buf.length / 2);
  const bloco = Math.max(1, Math.floor(total / pontos));
  const picos = [];
  for (let i = 0; i < total; i += bloco) {
    let max = 0;
    for (let j = i; j < Math.min(i + bloco, total); j++) {
      const v = Math.abs(buf.readInt16LE(j * 2));
      if (v > max) max = v;
    }
    picos.push(Math.round((max / 32768) * 1000) / 1000);
  }
  const dados = { picos, criadoEm: Date.now() };
  fs.writeFileSync(destino, JSON.stringify(dados));
  return dados;
}

/** Proxy 720p local para preview fluido. O master nunca é substituído. */
async function proxy(arquivo, meta, onProgress) {
  const destino = path.join(dirs.proxies(), `${hashPath(arquivo)}_720.mp4`);
  if (fs.existsSync(destino)) return destino;
  const encoder = await melhorEncoder("h264");
  await exec(FFMPEG, [
    "-y", "-i", arquivo,
    "-vf", "scale=-2:720",
    "-r", String(Math.min(meta?.fps || 30, 30)),
    "-c:v", encoder,
    "-b:v", "3M",
    "-c:a", "aac", "-b:a", "128k",
    "-movflags", "+faststart",
    destino,
  ], { onProgress, timeoutMs: 0 });
  return fs.existsSync(destino) ? destino : null;
}

let cacheEncoders = null;
async function encodersDisponiveis() {
  if (cacheEncoders) return cacheEncoders;
  try {
    const { out } = await exec(FFMPEG, ["-hide_banner", "-encoders"]);
    cacheEncoders = out;
  } catch {
    cacheEncoders = "";
  }
  return cacheEncoders;
}

async function melhorEncoder(codec) {
  const s = lerSettings();
  const lista = await encodersDisponiveis();
  const tem = (n) => lista.includes(n);
  if (s.aceleracaoHardware) {
    if (codec === "h265") {
      if (process.platform === "darwin" && tem("hevc_videotoolbox")) return "hevc_videotoolbox";
      if (tem("hevc_nvenc")) return "hevc_nvenc";
      if (tem("hevc_qsv")) return "hevc_qsv";
      if (tem("hevc_amf")) return "hevc_amf";
    } else if (codec === "h264") {
      if (process.platform === "darwin" && tem("h264_videotoolbox")) return "h264_videotoolbox";
      if (tem("h264_nvenc")) return "h264_nvenc";
      if (tem("h264_qsv")) return "h264_qsv";
      if (tem("h264_amf")) return "h264_amf";
    }
  }
  if (codec === "h265") return "libx265";
  if (codec === "av1") return tem("libsvtav1") ? "libsvtav1" : "libaom-av1";
  if (codec === "vp9") return "libvpx-vp9";
  return "libx264";
}

async function capacidades() {
  const lista = await encodersDisponiveis();
  return {
    plataforma: process.platform,
    arquitetura: process.arch,
    ffmpeg: existeFfmpeg(),
    videotoolbox: lista.includes("h264_videotoolbox"),
    nvenc: lista.includes("h264_nvenc"),
    qsv: lista.includes("h264_qsv"),
    amf: lista.includes("h264_amf"),
    av1: lista.includes("libsvtav1") || lista.includes("libaom-av1"),
  };
}

/** Extrai só o trecho pedido — usado quando uma IA online precisa mesmo da mídia. */
async function extrairTrecho(arquivo, inicioMs, fimMs, { somenteAudio = false } = {}) {
  const nome = `${hashPath(arquivo)}_${inicioMs}_${fimMs}${somenteAudio ? ".m4a" : ".mp4"}`;
  const destino = path.join(dirs.cache(), "recortes", nome);
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  if (fs.existsSync(destino)) return destino;
  const args = ["-y", "-ss", String(inicioMs / 1000), "-to", String(fimMs / 1000), "-i", arquivo];
  if (somenteAudio) args.push("-vn", "-c:a", "aac", "-b:a", "128k");
  else args.push("-c:v", await melhorEncoder("h264"), "-b:v", "4M", "-c:a", "aac");
  args.push(destino);
  await exec(FFMPEG, args, { timeoutMs: 0 });
  return destino;
}

/** Render final local a partir de uma EDL (lista de cortes não destrutiva). */
async function renderEDL(spec, onProgress) {
  const {
    segmentos = [],
    width = 1080,
    height = 1920,
    fps = 30,
    codec = "h264",
    formato = "mp4",
    destino,
    somenteAudio = false,
    audioFormato = "m4a",
  } = spec;
  if (!segmentos.length) throw new Error("Timeline vazia");

  const args = ["-y"];
  for (const s of segmentos) {
    args.push("-ss", String((s.sourceInMs ?? 0) / 1000));
    args.push("-to", String((s.sourceOutMs ?? 0) / 1000));
    args.push("-i", s.path);
  }

  const filtros = [];
  const rotulos = [];
  segmentos.forEach((s, i) => {
    filtros.push(
      `[${i}:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,fps=${fps}[v${i}]`,
    );
    filtros.push(`[${i}:a]aresample=48000,volume=${s.volume ?? 1}[a${i}]`);
    rotulos.push(`[v${i}][a${i}]`);
  });
  filtros.push(`${rotulos.join("")}concat=n=${segmentos.length}:v=1:a=1[vout][aout]`);

  if (somenteAudio) {
    const soFiltros = segmentos.map((s, i) => `[${i}:a]aresample=48000,volume=${s.volume ?? 1}[a${i}]`);
    soFiltros.push(`${segmentos.map((_, i) => `[a${i}]`).join("")}concat=n=${segmentos.length}:v=0:a=1[aout]`);
    args.push("-filter_complex", soFiltros.join(";"), "-map", "[aout]");
    if (audioFormato === "wav") args.push("-c:a", "pcm_s16le");
    else if (audioFormato === "mp3") args.push("-c:a", "libmp3lame", "-b:a", "192k");
    else args.push("-c:a", "aac", "-b:a", "256k");
  } else {
    args.push(
      "-filter_complex", filtros.join(";"),
      "-map", "[vout]", "-map", "[aout]",
      "-c:v", formato === "webm" ? await melhorEncoder("vp9") : await melhorEncoder(codec),
      "-b:v", height >= 2160 ? "45M" : height >= 1440 ? "24M" : height >= 1080 ? "14M" : "8M",
      "-r", String(fps),
      "-c:a", formato === "webm" ? "libopus" : "aac",
      "-b:a", "256k",
    );
    if (formato === "mp4") args.push("-movflags", "+faststart");
  }
  args.push(destino);
  await exec(FFMPEG, args, { onProgress, timeoutMs: 0 });
  return destino;
}

module.exports = {
  FFMPEG,
  FFPROBE,
  existeFfmpeg,
  probe,
  thumbnail,
  waveform,
  proxy,
  capacidades,
  melhorEncoder,
  extrairTrecho,
  renderEDL,
  hashPath,
};
