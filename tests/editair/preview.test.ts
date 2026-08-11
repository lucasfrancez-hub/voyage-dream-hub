import { describe, expect, it } from "vitest";
import { EditairEngine } from "@/lib/editair/engine";
import { inserirAssetNaTimeline } from "@/lib/editair/layers";
import { estadoVazio, type EditairClip, type ProjectState } from "@/lib/editair/types";

type Chamada = { args: number[] };

function canvasFake(w: number, h: number) {
  const chamadas: Chamada[] = [];
  const ctx = {
    canvas: null as unknown,
    filter: "none",
    globalAlpha: 1,
    globalCompositeOperation: "source-over",
    fillStyle: "#000",
    font: "",
    textAlign: "left",
    textBaseline: "top",
    setTransform() {},
    save() {},
    restore() {},
    translate() {},
    rotate() {},
    scale() {},
    clearRect() {},
    fillRect() {},
    fillText() {},
    beginPath() {},
    closePath() {},
    fill() {},
    stroke() {},
    createRadialGradient: () => ({ addColorStop() {} }),
    drawImage: (...args: unknown[]) => {
      chamadas.push({ args: args.slice(1).map((v) => Number(v)) });
    },
  };
  const canvas = { width: w, height: h, getContext: () => ctx };
  return { canvas: canvas as unknown as HTMLCanvasElement, chamadas };
}

function imagemFake(w: number, h: number) {
  return { naturalWidth: w, naturalHeight: h } as unknown as HTMLImageElement;
}

function projetoComImagem(): { state: ProjectState; clip: EditairClip } {
  const r = inserirAssetNaTimeline(estadoVazio(), {
    id: "img1",
    nome: "foto.jpg",
    kind: "image",
    durationMs: 5000,
  });
  if (!r.ok) throw new Error(r.erro);
  return { state: r.state, clip: r.clip };
}

describe("enquadramento inicial", () => {
  it("nasce centralizado, fit, rotação 0 e opacidade 1", () => {
    const { clip } = projetoComImagem();
    expect(clip.transform).toEqual({ x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 });
    expect(clip.enquadramento).toBe("fit");
  });
});

describe("preview — desenho", () => {
  it("mantém o vídeo dentro do canvas mesmo com a escala física defasada", () => {
    const { canvas, chamadas } = canvasFake(960, 540); // canvas físico a 50%
    const eng = new EditairEngine(canvas, 1920, 1080);
    const r = inserirAssetNaTimeline(estadoVazio(), { id: "v1", nome: "a.mp4", kind: "video", durationMs: 4000 });
    if (!r.ok) throw new Error(r.erro);
    (eng as unknown as { imagens: Map<string, HTMLImageElement> }).imagens.set("v1", imagemFake(1920, 1080));
    eng.desenhar(r.state, 100);
    const d = chamadas.at(-1)!.args;
    const [, , , , dx, dy, dw, dh] = d;
    // desenho centralizado na origem transladada e cabendo no quadro do projeto
    expect(dx).toBeCloseTo(-dw / 2);
    expect(dy).toBeCloseTo(-dh / 2);
    expect(dw).toBeLessThanOrEqual(1920 + 1);
    expect(dh).toBeLessThanOrEqual(1080 + 1);
  });

  it("desenha a imagem em TODOS os quadros enquanto o playhead está dentro do clipe", () => {
    const { canvas, chamadas } = canvasFake(1920, 1080);
    const eng = new EditairEngine(canvas, 1920, 1080);
    const { state, clip } = projetoComImagem();
    (eng as unknown as { imagens: Map<string, HTMLImageElement> }).imagens.set("img1", imagemFake(1000, 1000));
    for (const t of [0, 1000, 2500, 4999]) {
      chamadas.length = 0;
      eng.sincronizar(state, t, true); // tocando
      eng.desenhar(state, t);
      expect(chamadas.length, `t=${t}`).toBe(1);
    }
    // depois do fim, some
    chamadas.length = 0;
    eng.desenhar(state, clip.start + clip.duration + 1);
    expect(chamadas.length).toBe(0);
  });

  it("mídia offline em outra trilha não apaga a imagem visível", () => {
    const { canvas, chamadas } = canvasFake(1920, 1080);
    const eng = new EditairEngine(canvas, 1920, 1080);
    const { state } = projetoComImagem();
    const comVideo = inserirAssetNaTimeline(state, { id: "v9", nome: "b.mp4", kind: "video", durationMs: 5000 }, {
      trackId: "t-broll",
      startMs: 0,
    });
    if (!comVideo.ok) throw new Error(comVideo.erro);
    (eng as unknown as { imagens: Map<string, HTMLImageElement> }).imagens.set("img1", imagemFake(1000, 1000));
    (eng as unknown as { falhas: Set<string> }).falhas.add("v9");
    eng.desenhar(comVideo.state, 1200);
    expect(chamadas.length).toBe(1); // a imagem continua desenhada
  });
});
