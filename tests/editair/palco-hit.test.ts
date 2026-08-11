import { describe, expect, it } from "vitest";
import { alvoNoPonto, corpoNoPonto, handleNoPonto, type CaixaPalco } from "@/lib/editair/palco-hit";

const video: CaixaPalco = { id: "v1", kind: "video", cx: 0.5, cy: 0.5, w: 1, h: 1 };
const legenda: CaixaPalco = { id: "leg1", kind: "caption", cx: 0.5, cy: 0.8, w: 0.86, h: 0.1, resize: "caixa" };
const els = [video, legenda];
const tol = { x: 0.01, y: 0.006 };

describe("prioridade do hit-test no Reprodutor", () => {
  it("legenda ganha do vídeo quando o ponto está sobre ela", () => {
    expect(corpoNoPonto(els, { x: 0.5, y: 0.8 })?.id).toBe("leg1");
    expect(alvoNoPonto(els, { x: 0.5, y: 0.8 }, null, tol)).toEqual({ id: "leg1", modo: "mover" });
  });

  it("fora da legenda o gesto vai para o vídeo", () => {
    expect(alvoNoPonto(els, { x: 0.5, y: 0.2 }, null, tol)).toEqual({ id: "v1", modo: "mover" });
  });

  it("clicar direto na legenda funciona sem tê-la selecionado antes", () => {
    expect(alvoNoPonto(els, { x: 0.3, y: 0.79 }, "v1", tol)?.id).toBe("leg1");
  });

  it("handles do selecionado têm prioridade e viram resize de caixa", () => {
    const canto = { x: 0.5 + 0.86 / 2, y: 0.8 - 0.05 };
    expect(alvoNoPonto(els, canto, "leg1", tol)).toEqual({ id: "leg1", modo: "caixa", canto: "ne" });
    // no corpo continua sendo movimento
    expect(alvoNoPonto(els, { x: 0.5, y: 0.8 }, "leg1", tol)?.modo).toBe("mover");
  });

  it("elemento de vídeo usa escala nos cantos e tem alça de giro", () => {
    expect(handleNoPonto(video, { x: 0, y: 0 }, tol)).toEqual({ id: "v1", modo: "escala", canto: "nw" });
    expect(handleNoPonto(video, { x: 0.5, y: 0 - tol.y * 2 }, tol)?.modo).toBe("giro");
  });

  it("elemento bloqueado não expõe handles", () => {
    expect(handleNoPonto({ ...legenda, bloqueado: true }, { x: 0.93, y: 0.75 }, tol)).toBeNull();
  });
});
