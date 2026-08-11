import { describe, expect, it } from "vitest";
import { aplicarOps, type EditairOp } from "@/lib/editair/ops";
import { validarOps, resumoDoPlano, planoGrande } from "@/lib/editair/ia-plano";
import type { ProjectState } from "@/lib/editair/types";
import { TRILHAS_PADRAO } from "@/lib/editair/types";

function projeto(): ProjectState {
  return {
    id: "p1",
    width: 1080,
    height: 1920,
    fps: 30,
    durationMs: 60000,
    tracks: TRILHAS_PADRAO.map((t) => ({ ...t })),
    clips: [
      {
        id: "c1",
        trackId: "t-video",
        kind: "video",
        assetId: "a1",
        start: 0,
        duration: 30000,
        sourceIn: 0,
        volume: 1,
        speed: 1,
        transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1, fit: "fit" },
        label: "fala",
      },
    ],
    captionStyle: { preset: "classico" },
  } as unknown as ProjectState;
}

describe("plano da IA — validação", () => {
  it("descarta operações desconhecidas e ids inexistentes", () => {
    const ops = validarOps(
      [
        { op: "hackear_estado" },
        { op: "split_clip", clipId: "nao-existe", atMs: 1000 },
        { op: "split_clip", clipId: "c1", atMs: 1000 },
      ],
      projeto(),
    );
    expect(ops).toHaveLength(1);
    expect((ops[0] as { clipId: string }).clipId).toBe("c1");
  });

  it("no escopo de um clipe, não deixa a IA tocar em outro clipe", () => {
    const st = projeto();
    st.clips.push({ ...st.clips[0], id: "c2", start: 30000 });
    const ops = validarOps(
      [
        { op: "set_speed", clipId: "c1", speed: 2 },
        { op: "set_speed", clipId: "c2", speed: 2 },
      ],
      st,
      "c1",
    );
    expect(ops).toHaveLength(1);
  });

  it("resume o plano e reconhece plano grande", () => {
    const plano = {
      titulo: "t",
      resposta: "r",
      resumo: [],
      geracoes: [],
      ops: [{ op: "remove_silences" }, { op: "rebuild_captions" }, { op: "create_track" }],
    };
    expect(resumoDoPlano(plano).length).toBeGreaterThan(0);
    expect(planoGrande(plano)).toBe(true);
    expect(planoGrande({ ...plano, ops: [{ op: "split_clip" }] })).toBe(false);
  });
});

describe("edição em camadas — não destrutiva", () => {
  it("remover pausas divide fisicamente o clipe em blocos ligados ao mesmo asset", () => {
    const st = projeto();
    const ops: EditairOp[] = [
      {
        op: "remove_silences",
        clipId: "c1",
        falas: [
          { fromMs: 0, toMs: 8000 },
          { fromMs: 12000, toMs: 20000 },
          { fromMs: 24000, toMs: 30000 },
        ],
      } as EditairOp,
    ];
    const { state } = aplicarOps(st, ops);
    const blocos = state.clips.filter((c) => c.trackId === "t-video");
    expect(blocos.length).toBe(3);
    expect(blocos.every((b) => b.assetId === "a1")).toBe(true);
    // timeline encurtada: nada de buracos entre as falas
    expect(Math.round(blocos[0].start)).toBe(0);
    expect(Math.round(blocos[1].start)).toBe(8000);
    expect(Math.round(blocos[2].start)).toBe(16000);
    // cada bloco continua apontando para o ponto certo do original
    expect(Math.round(blocos[1].sourceIn)).toBe(12000);
  });

  it("cria camada nova e insere clipe nela via ref", () => {
    const st = projeto();
    const { state } = aplicarOps(st, [
      { op: "create_track", ref: "broll", kind: "broll", name: "B-roll" } as EditairOp,
      {
        op: "insert_clip",
        trackId: "broll",
        assetId: "a1",
        kind: "video",
        startMs: 5000,
        durationMs: 3000,
        label: "avião",
      } as EditairOp,
    ]);
    const track = state.tracks.find((t) => t.name === "B-roll");
    expect(track).toBeTruthy();
    const clip = state.clips.find((c) => c.label === "avião");
    expect(clip?.trackId).toBe(track!.id);
    expect(clip?.start).toBe(5000);
    // o clipe principal continua intacto embaixo
    expect(state.clips.find((c) => c.id === "c1")?.duration).toBe(30000);
  });
});
