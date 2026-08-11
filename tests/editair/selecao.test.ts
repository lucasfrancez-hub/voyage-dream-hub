import { describe, expect, it } from "vitest";
import {
  alternar,
  clipsNaCaixa,
  moverSelecao,
  selecaoEditavel,
  selecionarTrack,
  selecionarTudo,
  tracksNaFaixa,
  unir,
} from "@/lib/editair/selecao";
import { estadoVazio, type EditairClip, type ProjectState } from "@/lib/editair/types";

function clip(id: string, trackId: string, start: number, duration = 500): EditairClip {
  return {
    id,
    trackId,
    kind: trackId === "t-caption" ? "caption" : "video",
    start,
    duration,
    sourceIn: 0,
    volume: 1,
    speed: 1,
    transform: { scale: 1, x: 0, y: 0, opacity: 1, rotation: 0 },
  } as EditairClip;
}

function projeto(): ProjectState {
  const base = estadoVazio();
  const clips = [
    clip("v1", "t-video", 0, 2000),
    clip("v2", "t-video", 3000, 1000),
    ...Array.from({ length: 24 }, (_, i) => clip(`leg${i}`, "t-caption", i * 500, 480)),
  ];
  return { ...base, clips };
}

const faixas = [
  { id: "t-video", top: 0, bottom: 56 },
  { id: "t-caption", top: 56, bottom: 112 },
  { id: "t-music", top: 112, bottom: 168 },
];

describe("seleção múltipla por área", () => {
  it("retângulo dentro de uma camada só seleciona os clips daquela camada", () => {
    const s = projeto();
    const ids = clipsNaCaixa(s, { fromMs: 0, toMs: 1200, trackIds: tracksNaFaixa(faixas, 60, 100) });
    expect(ids).toEqual(["leg0", "leg1", "leg2"]);
    expect(ids).not.toContain("v1");
  });

  it("retângulo atravessando várias camadas pega clips de todas", () => {
    const s = projeto();
    const tracks = tracksNaFaixa(faixas, 10, 100);
    expect(tracks).toEqual(["t-video", "t-caption"]);
    const ids = clipsNaCaixa(s, { fromMs: 0, toMs: 1100, trackIds: tracks });
    expect(ids).toContain("v1");
    expect(ids).toContain("leg0");
    expect(ids).toContain("leg2");
  });

  it("basta tocar o clip — não precisa envolvê-lo inteiro", () => {
    const s = projeto();
    const ids = clipsNaCaixa(s, { fromMs: 1900, toMs: 1950, trackIds: ["t-video"] });
    expect(ids).toEqual(["v1"]);
  });

  it("seleciona 20+ legendas de uma vez", () => {
    const s = projeto();
    const ids = clipsNaCaixa(s, { fromMs: 0, toMs: 999999, trackIds: ["t-caption"] });
    expect(ids).toHaveLength(24);
  });

  it("arrastar da direita para a esquerda funciona igual", () => {
    const s = projeto();
    const a = clipsNaCaixa(s, { fromMs: 1200, toMs: 0, trackIds: ["t-caption"] });
    const b = clipsNaCaixa(s, { fromMs: 0, toMs: 1200, trackIds: ["t-caption"] });
    expect(a).toEqual(b);
  });

  it("camada bloqueada não entra na seleção", () => {
    const s0 = projeto();
    const s = { ...s0, tracks: s0.tracks.map((t) => (t.id === "t-caption" ? { ...t, locked: true } : t)) };
    const ids = clipsNaCaixa(s, { fromMs: 0, toMs: 999999, trackIds: ["t-video", "t-caption"] });
    expect(ids).toEqual(["v1", "v2"]);
    expect(selecionarTrack(s, "t-caption")).toEqual([]);
  });
});

describe("seleção por teclado e clique", () => {
  it("Shift + clique adiciona e remove o clip da seleção", () => {
    expect(alternar(["a"], "b")).toEqual(["a", "b"]);
    expect(alternar(["a", "b"], "a")).toEqual(["b"]);
  });

  it("Shift + retângulo soma à seleção anterior sem duplicar", () => {
    expect(unir(["a", "b"], ["b", "c"])).toEqual(["a", "b", "c"]);
  });

  it("Cmd+A seleciona todos os clips editáveis", () => {
    const s = projeto();
    expect(selecionarTudo(s)).toHaveLength(26);
    const travado = { ...s, tracks: s.tracks.map((t) => (t.id === "t-video" ? { ...t, locked: true } : t)) };
    expect(selecionarTudo(travado)).toHaveLength(24);
  });

  it("'Selecionar todos nesta camada' pega só a camada pedida", () => {
    const s = projeto();
    expect(selecionarTrack(s, "t-caption")).toHaveLength(24);
    expect(selecionarTrack(s, "t-video")).toEqual(["v1", "v2"]);
  });

  it("Esc / clique no vazio = seleção vazia (só estado de UI)", () => {
    const s = projeto();
    expect(selecaoEditavel(s, [])).toEqual([]);
    // limpar a seleção não altera nenhum clip
    expect(projeto().clips).toHaveLength(26);
  });
});

describe("operações com vários selecionados", () => {
  it("mover o conjunto mantém as distâncias relativas", () => {
    const s = projeto();
    const patches = moverSelecao(s, ["leg0", "leg1", "leg2"], 1000);
    expect(patches["leg0"]!.start).toBe(1000);
    expect(patches["leg1"]!.start).toBe(1500);
    expect(patches["leg2"]!.start).toBe(2000);
  });

  it("mover para a esquerda trava em zero sem deformar o conjunto", () => {
    const s = projeto();
    const patches = moverSelecao(s, ["leg1", "leg2"], -99999);
    expect(patches["leg1"]!.start).toBe(0);
    expect(patches["leg2"]!.start).toBe(500);
  });

  it("clips de camada bloqueada não se movem", () => {
    const s0 = projeto();
    const s = { ...s0, tracks: s0.tracks.map((t) => (t.id === "t-video" ? { ...t, locked: true } : t)) };
    const patches = moverSelecao(s, ["v1", "leg0"], 500);
    expect(patches["v1"]).toBeUndefined();
    expect(patches["leg0"]!.start).toBe(500);
  });

  it("exclusão múltipla ignora clips de camada bloqueada", () => {
    const s0 = projeto();
    const s = { ...s0, tracks: s0.tracks.map((t) => (t.id === "t-caption" ? { ...t, locked: true } : t)) };
    expect(selecaoEditavel(s, ["v1", "leg0", "leg1"])).toEqual(["v1"]);
  });

  it("selecionar vários não agrupa: cada clip continua independente", () => {
    const s = projeto();
    const ids = selecionarTudo(s);
    const patches = moverSelecao(s, ids, 300);
    // nenhum clip virou filho de outro nem mudou de camada
    for (const c of s.clips) {
      expect(patches[c.id]).toEqual({ start: c.start + 300 });
      expect(c.trackId).toBe(s.clips.find((x) => x.id === c.id)!.trackId);
    }
  });
});
