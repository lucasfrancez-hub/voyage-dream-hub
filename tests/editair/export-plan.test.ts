import { describe, expect, it } from "vitest";
import { fracaoDireta, framesCompostos, planejarExport, valeCaminhoRapido } from "@/lib/editair/export-plan";
import { estadoVazio, transformPadrao, type EditairClip, type ProjectState } from "@/lib/editair/types";

const OPTS = {
  duracaoMs: 10_000,
  width: 1080,
  height: 1920,
  caminhos: { a1: "/tmp/a1.mp4", a2: "/tmp/a2.mp4" },
  dimensoes: { a1: { width: 1080, height: 1920 }, a2: { width: 2160, height: 3840 } },
};

const clip = (p: Partial<EditairClip>): EditairClip =>
  ({
    id: "c1",
    trackId: "t-video",
    kind: "video",
    assetId: "a1",
    start: 0,
    duration: 10_000,
    sourceIn: 0,
    volume: 1,
    speed: 1,
    transform: transformPadrao(),
    ...p,
  }) as EditairClip;

const projeto = (clips: EditairClip[]): ProjectState => ({ ...estadoVazio(1080, 1920, 30), clips });

describe("planejador de exportação", () => {
  it("corte puro vira um único trecho direto (não passa pelo canvas)", () => {
    const segs = planejarExport(projeto([clip({})]), OPTS);
    expect(segs).toHaveLength(1);
    expect(segs[0]).toMatchObject({ tipo: "direto", startMs: 0, endMs: 10_000, sourceInMs: 0, sourceOutMs: 10_000 });
    expect(fracaoDireta(segs)).toBe(1);
    expect(framesCompostos(segs, 30)).toBe(0);
  });

  it("legenda no meio divide em direto / composto / direto", () => {
    const segs = planejarExport(
      projeto([
        clip({}),
        clip({ id: "leg", trackId: "t-caption", kind: "caption", assetId: undefined, start: 4000, duration: 2000 }),
      ]),
      OPTS,
    );
    expect(segs.map((s) => s.tipo)).toEqual(["direto", "composto", "direto"]);
    expect(segs[1]).toMatchObject({ startMs: 4000, endMs: 6000 });
    // o trecho direto seguinte continua de onde parou dentro do arquivo
    expect(segs[2]).toMatchObject({ sourceInMs: 6000, sourceOutMs: 10_000 });
    expect(framesCompostos(segs, 30)).toBe(60);
  });

  it("velocidade, transformação, efeito e congelamento forçam composição", () => {
    for (const p of [
      { speed: 2 },
      { transform: { ...transformPadrao(), scale: 1.2 } },
      { transform: { ...transformPadrao(), x: 40 } },
      { congelado: true },
      { flipH: true },
      { chroma: { ativo: true } as EditairClip["chroma"] },
      { keyframes: [{ atMs: 0, prop: "scale", valor: 1 }] as EditairClip["keyframes"] },
    ]) {
      const segs = planejarExport(projeto([clip(p)]), OPTS);
      expect(segs.map((s) => s.tipo), JSON.stringify(p)).toEqual(["composto"]);
    }
  });

  it("arquivo com proporção diferente do projeto não pode ir direto (fit não é identidade)", () => {
    const segs = planejarExport(projeto([clip({ assetId: "a2" })]), {
      ...OPTS,
      dimensoes: { a2: { width: 1920, height: 1080 } },
      caminhos: { a2: "/tmp/a2.mp4" },
    });
    expect(segs.map((s) => s.tipo)).toEqual(["composto"]);
  });

  it("sem arquivo local (nuvem) não há caminho rápido", () => {
    const segs = planejarExport(projeto([clip({})]), { ...OPTS, caminhos: {} });
    expect(segs.map((s) => s.tipo)).toEqual(["composto"]);
    expect(valeCaminhoRapido(segs)).toBe(false);
  });

  it("trecho direto curto demais volta para composição e funde com o vizinho", () => {
    const segs = planejarExport(
      projeto([
        clip({}),
        clip({ id: "leg", trackId: "t-caption", kind: "caption", assetId: undefined, start: 0, duration: 9700 }),
      ]),
      OPTS,
    );
    // sobrariam 300ms diretos no fim: não compensa abrir um FFmpeg para isso
    expect(segs.map((s) => s.tipo)).toEqual(["composto"]);
    expect(segs[0]).toMatchObject({ startMs: 0, endMs: 10_000 });
  });

  it("dois clipes de vídeo em sequência geram dois trechos diretos", () => {
    const segs = planejarExport(
      projeto([
        clip({ id: "c1", duration: 4000 }),
        clip({ id: "c2", start: 4000, duration: 6000, sourceIn: 12_000 }),
      ]),
      OPTS,
    );
    expect(segs.map((s) => s.tipo)).toEqual(["direto", "direto"]);
    expect(segs[1]).toMatchObject({ sourceInMs: 12_000, sourceOutMs: 18_000 });
    expect(valeCaminhoRapido(segs)).toBe(true);
  });

  it("projeto quase todo composto não usa o pipeline híbrido", () => {
    const segs = planejarExport(
      projeto([
        clip({}),
        clip({ id: "leg", trackId: "t-caption", kind: "caption", assetId: undefined, start: 0, duration: 9000 }),
      ]),
      OPTS,
    );
    expect(fracaoDireta(segs)).toBeCloseTo(0.1, 2);
    expect(valeCaminhoRapido(segs)).toBe(false);
  });
});
