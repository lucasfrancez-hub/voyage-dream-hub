/* Servidor do protocolo editair-media:// — arquivos locais com Range real.
   Fica separado do main.cjs para poder ser testado fora do Electron. */
const fs = require("node:fs");
const path = require("node:path");
const { Readable } = require("node:stream");

const TIPOS = {
  ".mp4": "video/mp4",
  ".m4v": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
  ".mkv": "video/x-matroska",
  ".avi": "video/x-msvideo",
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

function tipoMime(arquivo) {
  return TIPOS[path.extname(arquivo).toLowerCase()] || "application/octet-stream";
}

/** Recebe { url, method, headers } (Request do Electron serve direto). */
async function responderMidia(request) {
  try {
    const u = new URL(request.url);
    // URLSearchParams.get já decodifica o valor. Um segundo decode quebrava
    // nomes válidos como "Vídeo 100%.mp4" com URI malformed.
    const alvo = u.searchParams.get("p") || "";
    if (!alvo || !fs.existsSync(alvo)) return new Response("not found", { status: 404 });
    const stat = fs.statSync(alvo);
    if (!stat.isFile()) return new Response("not found", { status: 404 });

    const total = stat.size;
    const range = request.headers?.get ? request.headers.get("range") : null;
    let inicio = 0;
    let fim = Math.max(0, total - 1);
    let status = 200;
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/i.exec(range.trim());
      if (!match) {
        return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${total}` } });
      }
      if (match[1]) inicio = Number(match[1]);
      if (match[2]) fim = Math.min(fim, Number(match[2]));
      if (!match[1] && match[2]) inicio = Math.max(0, total - Number(match[2]));
      if (inicio > fim || inicio >= total) {
        return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${total}` } });
      }
      status = 206;
    }

    const headers = new Headers({
      "Content-Type": tipoMime(alvo),
      "Content-Length": String(fim - inicio + 1),
      "Accept-Ranges": "bytes",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "*",
      "Access-Control-Expose-Headers": "Content-Length, Content-Range, Accept-Ranges",
    });
    if (status === 206) headers.set("Content-Range", `bytes ${inicio}-${fim}/${total}`);
    if (request.method === "HEAD") return new Response(null, { status, headers });
    const corpo = Readable.toWeb(fs.createReadStream(alvo, { start: inicio, end: fim }));
    return new Response(corpo, { status, headers });
  } catch (e) {
    return new Response(String(e), { status: 500 });
  }
}

module.exports = { responderMidia, tipoMime };
