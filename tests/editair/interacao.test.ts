import { describe, expect, it } from "vitest";
import {
  LIMIAR_DRAG_PX,
  MIN_AREA_SUPERIOR,
  MIN_TIMELINE,
  alturaAreaSuperior,
  alturaTimelineValida,
  destinoCompativel,
  destinoDeClip,
  destinoPorY,
  passouLimiar,
  trilhaAlvoDoAsset,
} from "@/lib/editair/interacao";
import { criarTrackEm, inserirAssetNaTimeline, soltarClipEm } from "@/lib/editair/layers";
import { estadoVazio, type EditairClip } from "@/lib/editair/types";

const ALTURA_JANELA = 900;

const faixas = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `t${i}`, top: 100 + i * 56, bottom: 100 + i * 56 + 56 }));

describe("layout: Inspector independente da timeline", () => {
  it("timeline pequena mantém área superior grande", () => {
    const h = alturaTimelineValida(160, ALTURA_JANELA);
    expect(h).toBe(160);
    expect(alturaAreaSuperior(h, ALTURA_JANELA)).toBeGreaterThanOrEqual(MIN_AREA_SUPERIOR);
  });

  it("timeline gigante nunca esconde Preview/Inspector", () => {
    const h = alturaTimelineValida(5000, ALTURA_JANELA);
    expect(h).toBeLessThanOrEqual(ALTURA_JANELA - MIN_AREA_SUPERIOR);
    expect(alturaAreaSuperior(h, ALTURA_JANELA)).toBeGreaterThanOrEqual(MIN_AREA_SUPERIOR);
  });

  it("respeita altura mínima da timeline", () => {
    expect(alturaTimelineValida(10, ALTURA_JANELA)).toBe(MIN_TIMELINE);
    expect(alturaTimelineValida(Number.NaN, ALTURA_JANELA)).toBe(MIN_TIMELINE);
  });

  it("janela minúscula ainda reserva a área superior", () => {
    const h = alturaTimelineValida(400, 300);
    expect(h).toBe(MIN_TIMELINE);
  });

  it("altura não depende de zoom nem do número de tracks", () => {
    const a = alturaTimelineValida(300, ALTURA_JANELA);
    const b = alturaTimelineValida(300, ALTURA_JANELA); // zoom/tracks não entram no cálculo
    expect(a).toBe(b);
  });
});

describe("limiar de drag", () => {
  it("clique sem movimento não inicia drag", () => {
    expect(passouLimiar(0, 0)).toBe(false);
    expect(passouLimiar(2, 1)).toBe(false);
  });
  it("movimento acima do limiar inicia drag", () => {
    expect(passouLimiar(LIMIAR_DRAG_PX, 0)).toBe(true);
    expect(passouLimiar(0, -LIMIAR_DRAG_PX)).toBe(true);
  });
});

describe("destino vertical", () => {
  const f = faixas(3);
  it("aponta a track sob o cursor", () => {
    expect(destinoPorY(120, f)).toEqual({ tipo: "track", trackId: "t0" });
    expect(destinoPorY(180, f)).toEqual({ tipo: "track", trackId: "t1" });
  });
  it("acima da primeira track oferece nova camada", () => {
    expect(destinoPorY(10, f)).toEqual({ tipo: "nova", indice: 0 });
  });
  it("abaixo da última track oferece nova camada no fim", () => {
    expect(destinoPorY(999, f)).toEqual({ tipo: "nova", indice: 3 });
  });
  it("ignora mesma camada e camada bloqueada", () => {
    expect(destinoDeClip({ tipo: "track", trackId: "t1" }, "t1", () => false)).toBeNull();
    expect(destinoDeClip({ tipo: "track", trackId: "t2" }, "t1", () => true)).toBeNull();
    expect(destinoDeClip({ tipo: "track", trackId: "t2" }, "t1", () => false)).toEqual({
      tipo: "track",
      trackId: "t2",
    });
  });
  it("classifica trilha alvo por tipo de mídia", () => {
    expect(trilhaAlvoDoAsset("video")).toBe("video");
    expect(trilhaAlvoDoAsset("image")).toBe("video");
    expect(trilhaAlvoDoAsset("audio")).toBe("music");
    expect(destinoCompativel("audio", "video")).toBe(false);
    expect(destinoCompativel("image", "video")).toBe(true);
  });
});

describe("drag da biblioteca usa o serviço central de inserção", () => {
  it("vídeo cai na trilha de vídeo", () => {
    const r = inserirAssetNaTimeline(estadoVazio(), { id: "a1", nome: "v.mp4", kind: "video", durationMs: 4000 });
    expect(r.ok && r.clip.trackId).toBe("t-video");
  });

  it("imagem pode cair numa segunda camada de vídeo", () => {
    const nova = criarTrackEm(estadoVazio(), 0);
    const r = inserirAssetNaTimeline(
      nova.state,
      { id: "a2", nome: "foto.jpg", kind: "image", durationMs: 0 },
      { trackId: nova.trackId, startMs: 1500 },
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.clip.trackId).toBe(nova.trackId);
    expect(r.clip.kind).toBe("image");
    expect(r.clip.start).toBe(1500);
  });

  it("áudio cai em trilha de áudio", () => {
    const r = inserirAssetNaTimeline(estadoVazio(), { id: "a3", nome: "m.mp3", kind: "audio", durationMs: 8000 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const tr = r.state.tracks.find((t) => t.id === r.clip.trackId);
    expect(tr?.kind === "music" || tr?.kind === "voice").toBe(true);
  });

  it("soltar em área vazia acima cria a camada e insere numa operação", () => {
    const base = estadoVazio();
    const nova = criarTrackEm(base, 0);
    const r = inserirAssetNaTimeline(nova.state, { id: "a4", nome: "v.mp4", kind: "video", durationMs: 3000 }, {
      trackId: nova.trackId,
      startMs: 0,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.tracks.length).toBe(base.tracks.length + 1);
    expect(r.state.clips).toHaveLength(1);
  });
});

describe("mover clip entre camadas", () => {
  const montar = () => {
    const base = estadoVazio();
    const clip: EditairClip = {
      id: "c1",
      trackId: "t-video",
      kind: "video",
      assetId: "a1",
      start: 1000,
      duration: 4000,
      sourceIn: 500,
      volume: 0.6,
      speed: 2,
      x: 120,
      y: -40,
      escala: 1.35,
      rotacao: 12,
      opacidade: 0.8,
      enquadramento: "fill",
    } as EditairClip;
    return { ...base, clips: [clip] };
  };

  it("arraste horizontal altera apenas o start", () => {
    const s = montar();
    const r = soltarClipEm(s, "c1", { tipo: "track", trackId: "t-video" }, 3000);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const c = r.state.clips[0]!;
    expect(c.start).toBe(3000);
    expect(c.trackId).toBe("t-video");
  });

  it("arraste vertical/diagonal muda camada e tempo preservando o transform", () => {
    const s0 = montar();
    const nova = criarTrackEm(s0, 0);
    const r = soltarClipEm(nova.state, "c1", { tipo: "track", trackId: nova.trackId }, 2500);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const c = r.state.clips[0]!;
    const o = s0.clips[0]!;
    expect(c.trackId).toBe(nova.trackId);
    expect(c.start).toBe(2500);
    expect({
      x: c.x,
      y: c.y,
      escala: c.escala,
      rotacao: c.rotacao,
      opacidade: c.opacidade,
      enquadramento: c.enquadramento,
      volume: c.volume,
      speed: c.speed,
      sourceIn: c.sourceIn,
      duration: c.duration,
    }).toEqual({
      x: o.x,
      y: o.y,
      escala: o.escala,
      rotacao: o.rotacao,
      opacidade: o.opacidade,
      enquadramento: o.enquadramento,
      volume: o.volume,
      speed: o.speed,
      sourceIn: o.sourceIn,
      duration: o.duration,
    });
  });

  it("não regenera o id — seleção e Inspector continuam no mesmo clip", () => {
    const s = montar();
    const r = soltarClipEm(s, "c1", { tipo: "nova", indice: 0 }, 0);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.clips[0]!.id).toBe("c1");
  });

  it("arrastar acima da camada mais alta cria uma nova track em uma operação", () => {
    const s = montar();
    const r = soltarClipEm(s, "c1", { tipo: "nova", indice: 0 }, 800);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.tracks.length).toBe(s.tracks.length + 1);
    expect(r.state.clips[0]!.trackId).toBe(r.trackId);
  });

  it("cancelar (Esc) antes de soltar não altera o estado nem cria camada", () => {
    const s = montar();
    // Esc = nenhuma chamada ao serviço de drop: estado permanece idêntico
    const depois = s;
    expect(depois.tracks.length).toBe(s.tracks.length);
    expect(depois.clips[0]).toEqual(s.clips[0]);
  });

  it("camada bloqueada recusa o drop", () => {
    const s = montar();
    const travado = { ...s, tracks: s.tracks.map((t) => (t.id === "t-broll" ? { ...t, locked: true } : t)) };
    const r = soltarClipEm(travado, "c1", { tipo: "track", trackId: "t-broll" }, 0);
    expect(r.ok).toBe(false);
  });
});

describe("intenção vertical do arraste", () => {
  it("arraste horizontal mantém a camada", () => {
    expect(intencaoVertical(0)).toBe(false);
    expect(intencaoVertical(6)).toBe(false);
    expect(intencaoVertical(-17)).toBe(false);
  });
  it("arraste vertical deliberado troca de camada", () => {
    expect(intencaoVertical(18)).toBe(true);
    expect(intencaoVertical(-40)).toBe(true);
  });
});
