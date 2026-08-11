import { describe, expect, it } from "vitest";
import {
  estadoVazio,
  limparTracksVazias,
  normalizarEstado,
  recalcularDuracao,
  sincronizarTracks,
  type EditairClip,
  type ProjectState,
} from "@/lib/editair/types";

const clip = (p: Partial<EditairClip>): EditairClip =>
  ({
    id: "c1",
    trackId: "t-video",
    kind: "video",
    start: 0,
    duration: 3000,
    sourceIn: 0,
    volume: 1,
    speed: 1,
    transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 },
    ...p,
  }) as EditairClip;

describe("tracks dinâmicas", () => {
  it("projeto novo começa só com a camada essencial", () => {
    const st = estadoVazio();
    expect(st.tracks.map((t) => t.id)).toEqual(["t-video"]);
  });

  it("adicionar legenda cria a camada Legendas", () => {
    const st = recalcularDuracao({ ...estadoVazio(), clips: [clip({}), clip({ id: "c2", trackId: "t-caption", kind: "caption" })] });
    expect(st.tracks.map((t) => t.id)).toContain("t-caption");
    expect(st.tracks.findIndex((t) => t.id === "t-caption")).toBeLessThan(
      st.tracks.findIndex((t) => t.id === "t-video"),
    );
  });

  it("B-roll e IA gerada também nascem sozinhas, sem duplicar", () => {
    const base = { ...estadoVazio(), clips: [clip({ trackId: "t-broll" }), clip({ id: "c2", trackId: "t-ia" })] };
    const st = sincronizarTracks(base);
    expect(st.tracks.map((t) => t.id)).toEqual(["t-broll", "t-ia", "t-video"]);
    expect(sincronizarTracks(st)).toBe(st);
  });

  it("remover o último clipe de uma camada permite que ela desapareça", () => {
    const comLegenda = sincronizarTracks({
      ...estadoVazio(),
      clips: [clip({}), clip({ id: "c2", trackId: "t-caption", kind: "caption" })],
    });
    const semLegenda = limparTracksVazias({ ...comLegenda, clips: [clip({})] });
    expect(semLegenda.tracks.map((t) => t.id)).toEqual(["t-video"]);
  });

  it("camada protegida (recém-criada/selecionada) sobrevive vazia", () => {
    const st = sincronizarTracks({ ...estadoVazio(), clips: [clip({ trackId: "t-broll" })] });
    const limpo = limparTracksVazias({ ...st, clips: [] }, ["t-broll"]);
    expect(limpo.tracks.map((t) => t.id)).toEqual(["t-broll", "t-video"]);
  });

  it("a camada essencial nunca some", () => {
    expect(limparTracksVazias({ ...estadoVazio(), clips: [] }).tracks).toHaveLength(1);
  });

  it("reabrir o projeto mostra exatamente as camadas salvas", () => {
    const salvo = {
      version: 1,
      tracks: [
        { id: "t-video", kind: "video", name: "Vídeo" },
        { id: "t-music", kind: "music", name: "Música" },
      ],
      clips: [clip({}), clip({ id: "c2", trackId: "t-music", kind: "audio" })],
    } as unknown as ProjectState;
    const st = normalizarEstado(salvo, 1080, 1920, 30);
    expect(st.tracks.map((t) => t.id)).toEqual(["t-video", "t-music"]);
  });

  it("clipe órfão em camada desconhecida ganha uma camada de vídeo extra", () => {
    const st = sincronizarTracks({ ...estadoVazio(), clips: [clip({}), clip({ id: "c2", trackId: "t-video-xy2" })] });
    expect(st.tracks).toHaveLength(2);
    expect(st.tracks.map((t) => t.name)).toEqual(["Vídeo", "Vídeo 2"]);
  });
});
