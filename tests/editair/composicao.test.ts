import { describe, expect, it } from "vitest";
import {
  duracaoComposicao,
  duracaoEfetiva,
  planoDeAudio,
  tempoNaFonte,
  estimarBytes,
} from "@/lib/editair/composicao";
import type { EditairClip, ProjectState } from "@/lib/editair/types";

const clip = (p: Partial<EditairClip>): EditairClip =>
  ({
    id: "c1",
    trackId: "t-video",
    kind: "video",
    assetId: "a1",
    start: 0,
    duration: 3000,
    sourceIn: 0,
    volume: 1,
    speed: 1,
    transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 },
  }) as EditairClip;

const projeto = (clips: EditairClip[]): ProjectState =>
  ({
    id: "p",
    width: 1080,
    height: 1920,
    fps: 30,
    durationMs: 0,
    clips,
    tracks: [
      { id: "t-video", nome: "Vídeo", tipo: "video" },
      { id: "t-music", nome: "Música", tipo: "audio" },
    ],
  }) as unknown as ProjectState;

describe("composição do export", () => {
  it("usa o trecho da timeline, não a duração do arquivo original", () => {
    const st = projeto([clip({ duration: 3000 })]);
    expect(duracaoComposicao(st, { a1: 206_000 })).toBe(3000);
  });

  it("nunca ultrapassa o que resta do arquivo a partir de sourceIn", () => {
    const c = clip({ duration: 30_000, sourceIn: 8000 });
    expect(duracaoEfetiva(c, { a1: 10_000 })).toBe(2000);
  });

  it("respeita a velocidade no limite da fonte", () => {
    const c = clip({ duration: 30_000, sourceIn: 0, speed: 2 });
    expect(duracaoEfetiva(c, { a1: 10_000 })).toBe(5000);
  });

  it("duração é o fim do último clipe da timeline", () => {
    const st = projeto([
      clip({ id: "c1", start: 0, duration: 2000 }),
      clip({ id: "c2", start: 5000, duration: 1500 }),
    ]);
    expect(duracaoComposicao(st)).toBe(6500);
  });

  it("mapeia timeline -> arquivo respeitando sourceIn e speed", () => {
    const c = clip({ start: 1000, sourceIn: 4000, speed: 2 });
    expect(tempoNaFonte(c, 1000)).toBe(4000);
    expect(tempoNaFonte(c, 2000)).toBe(6000);
  });

  it("plano de áudio recorta o trecho certo e aplica o delay da timeline", () => {
    const st = projeto([clip({ start: 2000, duration: 3000, sourceIn: 10_000 })]);
    const [seg] = planoDeAudio(st, { a1: "/tmp/a.mp4" }, { a1: 200_000 });
    expect(seg).toMatchObject({ sourceInMs: 10_000, sourceOutMs: 13_000, delayMs: 2000 });
  });

  it("ignora clipes mudos no plano de áudio", () => {
    const st = projeto([clip({ muted: true })]);
    expect(planoDeAudio(st, { a1: "/tmp/a.mp4" })).toHaveLength(0);
  });

  it("estima o tamanho com base na duração real", () => {
    const b = estimarBytes({ duracaoMs: 3000, videoBps: 8_000_000, audioBps: 192_000, comVideo: true, comAudio: true });
    expect(b).toBe(Math.round(((8_000_000 + 192_000) * 3) / 8));
  });
});
