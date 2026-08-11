/* Protocolo editair-media:// com arquivos REAIS gerados por ffmpeg.
   Valida 200, 206/Range, Content-Type, 404, path com espaços/acentos e integridade dos bytes. */
import { beforeAll, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
// @ts-expect-error módulo CJS do Electron testado fora do runtime
import { responderMidia } from "../../desktop/lib/media-stream.cjs";

const dir = path.join(os.tmpdir(), "editair-fixtures");
let videoPath = "";
let videoAcento = "";
let imagemPath = "";
let audioPath = "";
let temFfmpeg = true;

function url(p: string) {
  return `editair-media://local/?p=${encodeURIComponent(p)}`;
}
function req(p: string, range?: string) {
  return new Request(url(p), { headers: range ? { range } : {} });
}

beforeAll(() => {
  fs.mkdirSync(dir, { recursive: true });
  videoPath = path.join(dir, "amostra.mp4");
  videoAcento = path.join(dir, "Vídeo com espaço & acento.mp4");
  imagemPath = path.join(dir, "quadro.png");
  audioPath = path.join(dir, "som.wav");
  try {
    execFileSync("ffmpeg", [
      "-y", "-f", "lavfi", "-i", "testsrc=size=320x240:rate=25:duration=2",
      "-f", "lavfi", "-i", "sine=frequency=440:duration=2",
      "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-movflags", "+faststart", videoPath,
    ], { stdio: "ignore" });
    fs.copyFileSync(videoPath, videoAcento);
    execFileSync("ffmpeg", ["-y", "-f", "lavfi", "-i", "testsrc=size=64x64:duration=1", "-frames:v", "1", imagemPath], { stdio: "ignore" });
    execFileSync("ffmpeg", ["-y", "-f", "lavfi", "-i", "sine=frequency=300:duration=1", audioPath], { stdio: "ignore" });
  } catch {
    temFfmpeg = false;
  }
});

describe("10. protocolo editair-media:// (arquivos reais)", () => {
  it.runIf(temFfmpeg)("serve o vídeo inteiro com 200, tipo e tamanho corretos", async () => {
    const res = await responderMidia(req(videoPath));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("video/mp4");
    expect(res.headers.get("accept-ranges")).toBe("bytes");
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(bytes.length).toBe(fs.statSync(videoPath).size);
    // assinatura MP4: "ftyp" no offset 4
    expect(Buffer.from(bytes.slice(4, 8)).toString()).toBe("ftyp");
  });

  it.runIf(temFfmpeg)("responde 206 com Content-Range para seek/scrub", async () => {
    const total = fs.statSync(videoPath).size;
    const res = await responderMidia(req(videoPath, "bytes=100-199"));
    expect(res.status).toBe(206);
    expect(res.headers.get("content-range")).toBe(`bytes 100-199/${total}`);
    expect(res.headers.get("content-length")).toBe("100");
    const buf = Buffer.from(await res.arrayBuffer());
    expect(buf.length).toBe(100);
    expect(buf.equals(fs.readFileSync(videoPath).subarray(100, 200))).toBe(true);
  });

  it.runIf(temFfmpeg)("range aberto (bytes=N-) devolve até o fim do arquivo", async () => {
    const total = fs.statSync(videoPath).size;
    const res = await responderMidia(req(videoPath, "bytes=1000-"));
    expect(res.status).toBe(206);
    expect(res.headers.get("content-range")).toBe(`bytes 1000-${total - 1}/${total}`);
    expect(Number(res.headers.get("content-length"))).toBe(total - 1000);
  });

  it.runIf(temFfmpeg)("lida com caminho contendo espaços e acentos", async () => {
    const res = await responderMidia(req(videoAcento));
    expect(res.status).toBe(200);
    expect(Number(res.headers.get("content-length"))).toBe(fs.statSync(videoAcento).size);
  });

  it.runIf(temFfmpeg)("define o Content-Type certo para imagem e áudio", async () => {
    expect((await responderMidia(req(imagemPath))).headers.get("content-type")).toBe("image/png");
    expect((await responderMidia(req(audioPath))).headers.get("content-type")).toBe("audio/wav");
  });

  it("arquivo inexistente → 404 (mostra 'mídia offline', não tela preta silenciosa)", async () => {
    const res = await responderMidia(req(path.join(dir, "nao-existe.mp4")));
    expect(res.status).toBe(404);
  });

  it("url sem parâmetro de caminho → 404", async () => {
    const res = await responderMidia(new Request("editair-media://local/"));
    expect(res.status).toBe(404);
  });

  it.runIf(temFfmpeg)("libera CORS para o canvas não ficar 'tainted'", async () => {
    const res = await responderMidia(req(videoPath));
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
  });
});

describe("11. metadados via ffprobe (mesma fonte usada pela biblioteca)", () => {
  it.runIf(temFfmpeg)("extrai duração e dimensões reais do fixture", () => {
    const saida = execFileSync("ffprobe", [
      "-v", "quiet", "-print_format", "json", "-show_format", "-show_streams", videoPath,
    ]).toString();
    const info = JSON.parse(saida);
    const v = info.streams.find((s: { codec_type: string }) => s.codec_type === "video");
    expect(Math.round(Number(info.format.duration))).toBe(2);
    expect(v.width).toBe(320);
    expect(v.height).toBe(240);
    expect(info.streams.some((s: { codec_type: string }) => s.codec_type === "audio")).toBe(true);
  });
});
