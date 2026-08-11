import { describe, it, expect } from "vitest";
import { montarLegendas, janelasDaTimeline, projetarPalavras } from "@/lib/editair/legendas";
import { aplicarOps } from "@/lib/editair/ops";
import { aplicarVelocidade } from "@/lib/editair/velocidade";
import { transformPadrao, type EditairClip, type ProjectState, type Transcript } from "@/lib/editair/types";

const clip = (p: Partial<EditairClip>): EditairClip => ({
  id: p.id ?? "c1",
  trackId: "t-video",
  kind: "video",
  assetId: "entrevista",
  start: 0,
  duration: 1000,
  sourceIn: 0,
  volume: 1,
  speed: 1,
  transform: transformPadrao(),
  ...p,
});

const projeto = (clips: EditairClip[]): ProjectState => ({
  version: 1,
  tracks: [
    { id: "t-video", kind: "video", name: "Vídeo" },
    { id: "t-caption", kind: "caption", name: "Legendas" },
  ],
  clips,
  durationMs: 60_000,
  captionStyle: { fontSize: 48, y: 80, color: "#fff", activeColor: "#F26B1F", uppercase: false } as never,
  width: 1080,
  height: 1920,
  fps: 30,
});

/** Asset de 60s: uma palavra por segundo, "p0".."p59". */
const transcript60: Transcript = {
  words: Array.from({ length: 60 }, (_, i) => ({ w: `p${i}`, start: i * 1000, end: i * 1000 + 900 })),
  segments: [],
};

const palavrasDe = (clips: EditairClip[]) => clips.flatMap((c) => c.words ?? []);

describe("Legendas seguem a timeline, não o arquivo original", () => {
  // 0–10s, 20–30s e 45–50s da fonte, já com o buraco fechado (ripple)
  const editado = projeto([
    clip({ id: "A", start: 0, duration: 10_000, sourceIn: 0 }),
    clip({ id: "B", start: 10_000, duration: 10_000, sourceIn: 20_000 }),
    clip({ id: "C", start: 20_000, duration: 5_000, sourceIn: 45_000 }),
  ]);

  it("não legenda trechos que foram cortados da timeline", () => {
    const ws = palavrasDe(montarLegendas(editado, transcript60));
    const nomes = ws.map((w) => w.w);
    for (const i of [10, 15, 19, 30, 40, 44, 50, 55, 59]) expect(nomes).not.toContain(`p${i}`);
    for (const i of [0, 9, 20, 29, 45, 49]) expect(nomes).toContain(`p${i}`);
  });

  it("converte tempo de fonte para tempo de timeline", () => {
    const ws = palavrasDe(montarLegendas(editado, transcript60));
    // source 20s (clip B, start 10s, sourceIn 20s) → timeline 10s
    expect(ws.find((w) => w.w === "p20")!.start).toBe(10_000);
    // source 45s (clip C, start 20s, sourceIn 45s) → timeline 20s
    expect(ws.find((w) => w.w === "p45")!.start).toBe(20_000);
    // source 49s → timeline 24s
    expect(ws.find((w) => w.w === "p49")!.start).toBe(24_000);
  });

  it("mantém as legendas dentro da duração da timeline", () => {
    const legendas = montarLegendas(editado, transcript60);
    for (const l of legendas) {
      expect(l.start).toBeGreaterThanOrEqual(0);
      expect(l.start + l.duration).toBeLessThanOrEqual(25_000 + 300);
    }
  });

  it("não duplica fala quando o mesmo asset aparece em vários clipes", () => {
    const ws = palavrasDe(montarLegendas(editado, transcript60));
    const contagem = new Map<string, number>();
    ws.forEach((w) => contagem.set(w.w, (contagem.get(w.w) ?? 0) + 1));
    expect([...contagem.values()].every((n) => n === 1)).toBe(true);
  });

  it("gera legendas separadas quando o mesmo trecho é usado duas vezes", () => {
    const dobrado = projeto([
      clip({ id: "A", start: 0, duration: 3000, sourceIn: 0 }),
      clip({ id: "A2", start: 3000, duration: 3000, sourceIn: 0 }),
    ]);
    const ws = palavrasDe(montarLegendas(dobrado, transcript60));
    expect(ws.filter((w) => w.w === "p0")).toHaveLength(2);
    expect(ws.filter((w) => w.w === "p0").map((w) => w.start).sort((a, b) => a - b)).toEqual([0, 3000]);
  });

  it("cada legenda é um clipe individual na track Legendas", () => {
    const legendas = montarLegendas(editado, transcript60);
    expect(legendas.length).toBeGreaterThan(1);
    expect(legendas.every((l) => l.trackId === "t-caption" && l.kind === "caption")).toBe(true);
    expect(new Set(legendas.map((l) => l.id)).size).toBe(legendas.length);
  });

  it("não mistura falas de clipes diferentes no mesmo bloco", () => {
    const legendas = montarLegendas(editado, transcript60);
    expect(legendas.every((l) => !!l.linkClipId)).toBe(true);
  });

  it("respeita velocidade 2x, 1x e 0.5x usando a mesma fórmula de velocidade.ts", () => {
    for (const [speed, dur, fim] of [
      [1, 10_000, 10_000],
      [2, 5_000, 5_000],
      [0.5, 20_000, 20_000],
    ] as const) {
      const p = projeto([clip({ id: "A", start: 0, duration: dur, sourceIn: 0, speed })]);
      const ws = palavrasDe(montarLegendas(p, transcript60));
      expect(ws.map((w) => w.w)).toContain("p0");
      expect(ws.map((w) => w.w)).not.toContain("p10");
      const ultimo = ws[ws.length - 1]!;
      expect(ultimo.end).toBeLessThanOrEqual(fim + 1);
      // source 5s comprimido/esticado pela velocidade
      expect(ws.find((w) => w.w === "p5")!.start).toBe(Math.round(5000 / speed));
    }
  });

  it("janelas só consideram clipes com áudio existentes na timeline", () => {
    const p = projeto([
      clip({ id: "A", start: 0, duration: 5000 }),
      clip({ id: "M", start: 0, duration: 5000, kind: "video", muted: true }),
    ]);
    expect(janelasDaTimeline(p).map((j) => j.clipId)).toEqual(["A"]);
  });

  it("palavra parcialmente cortada é aparada no limite do clipe", () => {
    const p = projeto([clip({ id: "A", start: 0, duration: 500, sourceIn: 0 })]);
    const ws = projetarPalavras(transcript60.words, janelasDaTimeline(p));
    expect(ws).toHaveLength(1);
    expect(ws[0]!.end).toBe(500);
  });
});

describe("Edição posterior não deixa legenda órfã", () => {
  const comLegendas = (): ProjectState => {
    const base = projeto([clip({ id: "A", start: 0, duration: 30_000, sourceIn: 0 })]);
    return { ...base, clips: [...base.clips, ...montarLegendas(base, transcript60)] };
  };

  it("ripple delete de um trecho remove as legendas dele e puxa as seguintes", () => {
    const antes = comLegendas();
    const legendasAntes = antes.clips.filter((c) => c.kind === "caption");
    const { state } = aplicarOps(antes, [{ op: "delete_range", fromMs: 10_000, toMs: 20_000, ripple: true }]);
    const depois = state.clips.filter((c) => c.kind === "caption");
    expect(depois.length).toBeLessThan(legendasAntes.length);
    // nada de legenda no buraco nem além da nova duração
    expect(depois.every((c) => c.start + c.duration <= 20_500)).toBe(true);
    // palavras acompanham o deslocamento (continuam dentro do próprio clipe)
    for (const c of depois) {
      for (const w of c.words ?? []) {
        expect(w.start).toBeGreaterThanOrEqual(c.start - 1);
        expect(w.end).toBeLessThanOrEqual(c.start + c.duration + 1);
      }
    }
  });

  it("ripple delete de um clipe inteiro remove as legendas vinculadas", () => {
    const antes = comLegendas();
    const { state } = aplicarOps(antes, [{ op: "ripple_delete", clipId: "A" }]);
    expect(state.clips.filter((c) => c.kind === "caption")).toHaveLength(0);
  });

  it("mudar velocidade arrasta os timestamps das legendas vinculadas", () => {
    const antes = comLegendas();
    const primeira = antes.clips.find((c) => c.kind === "caption")!;
    const depois = aplicarVelocidade(antes, "A", 2);
    const igual = depois.clips.find((c) => c.id === primeira.id)!;
    expect(igual.duration).toBeLessThan(primeira.duration);
    expect(igual.words![0]!.start).toBeLessThanOrEqual(primeira.words![0]!.start);
  });

  it("regerar legendas substitui tudo em uma única operação (um Cmd+Z)", () => {
    const antes = comLegendas();
    const { state } = aplicarOps(antes, [{ op: "rebuild_captions", mode: "frase" }], transcript60);
    const legendas = state.clips.filter((c) => c.kind === "caption");
    expect(legendas.length).toBeGreaterThan(0);
    const ws = palavrasDe(legendas);
    expect(ws.filter((w) => w.w === "p0")).toHaveLength(1);
  });
});
