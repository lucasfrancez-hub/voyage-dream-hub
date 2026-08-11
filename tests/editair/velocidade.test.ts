import { describe, expect, it } from "vitest";
import { aplicarVelocidade, duracaoTimeline, janelaFonte, tempoFonte } from "@/lib/editair/velocidade";
import { aplicarOps } from "@/lib/editair/ops";
import { estadoVazio, type EditairClip, type ProjectState } from "@/lib/editair/types";
import { MODELOS_LEGENDA, estiloDoModelo } from "@/lib/editair/caption-presets";

function clipe(p: Partial<EditairClip>): EditairClip {
  return {
    id: "c1",
    trackId: "t-video",
    kind: "video",
    assetId: "a1",
    start: 0,
    duration: 10_000,
    sourceIn: 0,
    volume: 1,
    speed: 1,
    transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 },
    ...p,
  } as EditairClip;
}

function projeto(clips: EditairClip[]): ProjectState {
  return { ...estadoVazio(), clips, durationMs: 10_000 };
}

describe("velocidade", () => {
  it("duração na timeline = fonte utilizada / velocidade", () => {
    expect(duracaoTimeline(10_000, 1)).toBe(10_000);
    expect(duracaoTimeline(10_000, 2)).toBe(5_000);
    expect(duracaoTimeline(10_000, 0.5)).toBe(20_000);
    expect(duracaoTimeline(30_000, 1.5)).toBe(20_000);
  });

  it("preserva sourceIn/sourceOut ao mudar velocidade", () => {
    const st = projeto([clipe({ sourceIn: 10_000, duration: 10_000 })]);
    const novo = aplicarVelocidade(st, "c1", 2);
    const c = novo.clips[0];
    expect(c.duration).toBe(5_000);
    const j = janelaFonte(c);
    expect(j.sourceIn).toBe(10_000);
    expect(j.sourceOut).toBe(20_000);
  });

  it("todas as velocidades mantêm a janela de fonte", () => {
    for (const v of [0.5, 0.75, 1, 1.25, 1.5, 2, 3]) {
      const st = projeto([clipe({ sourceIn: 4_000, duration: 12_000 })]);
      const c = aplicarVelocidade(st, "c1", v).clips[0];
      const j = janelaFonte(c);
      expect(j.sourceIn).toBe(4_000);
      expect(Math.round(j.sourceOut)).toBeCloseTo(16_000, -2);
      expect(c.duration).toBe(Math.round(12_000 / v));
    }
  });

  it("preview e exportação usam a mesma conversão de tempo", () => {
    const c = aplicarVelocidade(projeto([clipe({ sourceIn: 2_000 })]), "c1", 2).clips[0];
    expect(tempoFonte(c, c.start)).toBe(2_000);
    expect(tempoFonte(c, c.start + c.duration)).toBe(12_000);
  });

  it("ripple empurra o clipe seguinte e atualiza duração do projeto", () => {
    const st = projeto([clipe({}), clipe({ id: "c2", start: 10_000, duration: 5_000 })]);
    const novo = aplicarVelocidade(st, "c1", 2);
    expect(novo.clips[1].start).toBe(5_000);
    expect(novo.durationMs).toBe(10_000);
  });

  it("legendas vinculadas acompanham a nova duração", () => {
    const legenda = clipe({
      id: "leg",
      trackId: "t-caption",
      kind: "caption",
      assetId: undefined,
      start: 2_000,
      duration: 4_000,
      words: [{ w: "oi", start: 2_000, end: 3_000 }],
    });
    const novo = aplicarVelocidade(projeto([clipe({}), legenda]), "c1", 2);
    const l = novo.clips.find((c) => c.id === "leg")!;
    expect(l.start).toBe(1_000);
    expect(l.duration).toBe(2_000);
    expect(l.words![0].end).toBe(1_500);
    expect(l.start + l.duration).toBeLessThanOrEqual(novo.clips[0].duration);
  });

  it("op set_speed é reversível (estado original intacto)", () => {
    const st = projeto([clipe({})]);
    const { state: novo } = aplicarOps(st, [{ op: "set_speed", clipId: "c1", speed: 2 }]);
    expect(novo.clips[0].duration).toBe(5_000);
    expect(st.clips[0].duration).toBe(10_000);
  });
});

describe("modelos de legenda", () => {
  it("todos os modelos produzem um estilo completo", () => {
    for (const m of MODELOS_LEGENDA) {
      const e = estiloDoModelo(m);
      expect(e.fontFamily).toBeTruthy();
      expect(e.fontSize).toBeGreaterThan(0);
      expect(e.presetId).toBe(m.id);
      expect(e.maxLines).toBeGreaterThan(0);
    }
  });

  it("edição manual continua possível depois do preset", () => {
    const e = { ...estiloDoModelo(MODELOS_LEGENDA[0]), fontSize: 99 };
    expect(e.fontSize).toBe(99);
    expect(e.presetId).toBe(MODELOS_LEGENDA[0].id);
  });
});
