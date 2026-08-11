import { describe, expect, it } from "vitest";
import { aplicarOps, gerarLegendas } from "@/lib/editair/ops";
import { aplicarTextoLegenda } from "@/lib/editair/texto-legenda";
import { estadoInicial, type EditairClip, type ProjectState, type Transcript } from "@/lib/editair/types";

const palavras = [
  ["Pra", 0, 180], ["quem", 190, 360], ["não", 370, 520], ["me", 530, 640], ["conhece,", 650, 1080],
  ["eu", 1320, 1450], ["sou", 1460, 1620], ["o", 1630, 1690], ["Lucas.", 1700, 2180],
] as const;

const transcript: Transcript = {
  text: palavras.map((p) => p[0]).join(" "),
  words: palavras.map(([w, start, end]) => ({ w, start, end })),
} as Transcript;

function projeto(): ProjectState {
  const base = estadoInicial();
  const clip: EditairClip = {
    id: "v1",
    trackId: "t-video",
    kind: "video",
    assetId: "a1",
    start: 0,
    duration: 3000,
    sourceIn: 0,
    volume: 1,
    speed: 1,
    transform: { scale: 1, x: 0, y: 0, opacity: 1, rotation: 0 },
  } as EditairClip;
  return { ...base, clips: [clip] };
}

function comLegendas() {
  const s = projeto();
  return { ...s, clips: [...s.clips, ...gerarLegendas(s, transcript, "frase")] };
}

describe("edição manual do texto da legenda", () => {
  it("altera só o conteúdo, preservando timing e estilo", () => {
    const s = comLegendas();
    const leg = s.clips.find((c) => c.kind === "caption")!;
    const patch = aplicarTextoLegenda(leg, "Pra quem ainda não me conhece");
    expect(patch.text).toBe("Pra quem ainda não me conhece");
    expect(patch.textoManual).toBe(true);
    const novo = { ...leg, ...patch };
    expect(novo.start).toBe(leg.start);
    expect(novo.duration).toBe(leg.duration);
    expect(novo.captionStyle).toEqual(leg.captionStyle);
    expect(novo.kind).toBe("caption"); // continua clip editável, nunca vira imagem
  });

  it("mantém o timestamp real das palavras que continuam iguais (karaokê)", () => {
    const s = comLegendas();
    const leg = s.clips.find((c) => c.kind === "caption")!;
    const antes = leg.words!;
    const novo = { ...leg, ...aplicarTextoLegenda(leg, "Pra quem ainda não me conhece") };
    const pra = novo.words!.find((w) => w.w === "Pra")!;
    expect(pra.start).toBe(antes.find((w) => w.w === "Pra")!.start);
    expect(novo.words!.map((w) => w.w)).toContain("ainda");
    // ordem crescente e dentro do intervalo do bloco
    for (let i = 1; i < novo.words!.length; i++) {
      expect(novo.words![i]!.start).toBeGreaterThanOrEqual(novo.words![i - 1]!.start);
    }
  });

  it("op update_caption marca a legenda como manual", () => {
    const s = comLegendas();
    const leg = s.clips.find((c) => c.kind === "caption")!;
    const r = aplicarOps(s, [{ op: "update_caption", clipId: leg.id, text: "Texto corrigido" }], transcript);
    const nova = r.state.clips.find((c) => c.id === leg.id)!;
    expect(nova.text).toBe("Texto corrigido");
    expect(nova.textoManual).toBe(true);
  });

  it("regerar legendas não sobrescreve a correção manual", () => {
    let s = comLegendas();
    const leg = s.clips.find((c) => c.kind === "caption")!;
    s = aplicarOps(s, [{ op: "update_caption", clipId: leg.id, text: "Pra quem ainda não me conhece" }], transcript).state;
    const r = aplicarOps(s, [{ op: "rebuild_captions" }], transcript).state;
    const manual = r.clips.find((c) => c.id === leg.id);
    expect(manual?.text).toBe("Pra quem ainda não me conhece");
    // nenhum bloco novo nasce por cima do intervalo corrigido
    const sobrepostas = r.clips.filter(
      (c) => c.kind === "caption" && c.id !== leg.id && c.start < leg.start + leg.duration && c.start + c.duration > leg.start,
    );
    expect(sobrepostas).toHaveLength(0);
  });

  it("texto vazio não quebra o clip", () => {
    const s = comLegendas();
    const leg = s.clips.find((c) => c.kind === "caption")!;
    const novo = { ...leg, ...aplicarTextoLegenda(leg, "   ") };
    expect(novo.text).toBe("");
    expect(novo.words).toBeUndefined();
    expect(novo.duration).toBe(leg.duration);
  });
});
