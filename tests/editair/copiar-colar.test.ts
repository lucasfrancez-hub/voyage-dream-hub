/* Copiar/Colar/Duplicar compartilham o mesmo pipeline (copiarEmCamadaAcima):
   mesma posição temporal, IDs novos, camada imediatamente acima. */
import { describe, expect, it } from "vitest";
import { colarClips, duplicarClips, copiarEmCamadaAcima } from "@/lib/editair/acoes";
import { estadoVazio, recalcularDuracao, type EditairClip, type ProjectState } from "@/lib/editair/types";

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

const base = (clips: EditairClip[]): ProjectState => recalcularDuracao({ ...estadoVazio(), clips });

describe("copiar/colar interno", () => {
  it("colar 1 clipe: mesma posição, ID novo, camada acima", () => {
    const s = base([clip({ start: 4000 })]);
    const r = colarClips(s, [clip({ start: 4000 })], 99999);
    expect(r.ok).toBe(true);
    const novo = r.state!.clips.find((c) => c.id !== "c1")!;
    expect(novo.start).toBe(4000);
    expect(novo.duration).toBe(3000);
    expect(novo.id).not.toBe("c1");
    expect(novo.trackId).not.toBe("t-video");
    const iNovo = r.state!.tracks.findIndex((t) => t.id === novo.trackId);
    const iOrig = r.state!.tracks.findIndex((t) => t.id === "t-video");
    expect(iNovo).toBeLessThan(iOrig);
  });

  it("ignora o playhead — não cola na posição atual", () => {
    const s = base([clip({ start: 2000 })]);
    const r = colarClips(s, [clip({ start: 2000 })], 50000);
    expect(r.state!.clips.every((c) => c.start === 2000)).toBe(true);
  });

  it("duplicar usa o mesmo pipeline do colar", () => {
    const s = base([clip({ start: 1000 })]);
    const dup = duplicarClips(s, ["c1"]);
    const col = colarClips(s, [clip({ start: 1000 })]);
    expect(dup.state!.tracks.length).toBe(col.state!.tracks.length);
    expect(dup.state!.clips.find((c) => c.id !== "c1")!.start).toBe(1000);
  });

  it("seleção múltipla preserva distâncias e camadas relativas", () => {
    const s = base([
      clip({ id: "a", trackId: "t-broll", start: 0 }),
      clip({ id: "b", trackId: "t-broll", start: 8000 }),
      clip({ id: "c", trackId: "t-video", start: 4000 }),
    ]);
    const r = copiarEmCamadaAcima(s, s.clips);
    const novos = r.state!.clips.filter((c) => !["a", "b", "c"].includes(c.id));
    expect(novos).toHaveLength(3);
    expect(novos.map((c) => c.start).sort((x, y) => x - y)).toEqual([0, 4000, 8000]);
    // os dois do B-roll continuam juntos, o do Vídeo em outra camada
    const tracksNovas = new Set(novos.map((c) => c.trackId));
    expect(tracksNovas.size).toBe(2);
    // originais intactos
    for (const id of ["a", "b", "c"]) {
      expect(r.state!.clips.find((c) => c.id === id)).toEqual(s.clips.find((c) => c.id === id));
    }
  });

  it("conflito na camada de cima cria mais uma camada", () => {
    const s = base([clip({ id: "a", trackId: "t-video", start: 0 }), clip({ id: "b", trackId: "t-broll", start: 0 })]);
    const r = copiarEmCamadaAcima(s, [s.clips.find((c) => c.id === "a")!]);
    const novo = r.state!.clips.find((c) => !["a", "b"].includes(c.id))!;
    expect(novo.trackId).not.toBe("t-broll");
    expect(r.state!.tracks.length).toBe(s.tracks.length + 1);
  });
});
