import { describe, expect, it } from "vitest";
import { EditairEngine } from "@/lib/editair/engine";
import { estadoVazio, LEGENDA_PADRAO, type EditairClip, type ProjectState } from "@/lib/editair/types";

/** ctx fake: 10px por caractere, registra fillText. */
function canvasFake(w: number, h: number) {
  const textos: { s: string; y: number }[] = [];
  const ctx: Record<string, unknown> = {
    canvas: null,
    filter: "none", globalAlpha: 1, globalCompositeOperation: "source-over",
    fillStyle: "#000", strokeStyle: "#000", font: "", textAlign: "left", textBaseline: "top",
    lineWidth: 1, lineJoin: "round", shadowBlur: 0, shadowColor: "#000", letterSpacing: "0px",
    setTransform() {}, save() {}, restore() {}, translate() {}, rotate() {}, scale() {},
    clearRect() {}, fillRect() {}, beginPath() {}, closePath() {}, fill() {}, stroke() {},
    roundRect() {}, strokeText() {}, drawImage() {},
    createRadialGradient: () => ({ addColorStop() {} }),
    measureText: (s: string) => ({ width: s.length * 10 }),
    fillText: (s: string, _x: number, y: number) => { textos.push({ s, y }); },
  };
  const canvas = { width: w, height: h, getContext: () => ctx };
  return { canvas: canvas as unknown as HTMLCanvasElement, textos };
}

const TEXTO = "COM TURISMO NUNCA ESTEVE NOS MEUS PLANOS";

function projeto(boxWidth: number): ProjectState {
  const leg: EditairClip = {
    id: "leg1", trackId: "t-caption", kind: "caption", start: 0, duration: 2000,
    sourceIn: 0, volume: 1, speed: 1,
    transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 },
    text: TEXTO,
    captionStyle: { ...LEGENDA_PADRAO, fontSize: 60, boxWidth, animacao: "nenhuma", animacaoSaida: "nenhuma" },
  } as EditairClip;
  return { ...estadoVazio(), clips: [leg] };
}

function linhas(boxWidth: number) {
  const { canvas, textos } = canvasFake(1080, 1920);
  const eng = new EditairEngine(canvas, 1080, 1920);
  eng.desenhar(projeto(boxWidth), 500);
  return [...new Set(textos.map((t) => t.y))].length;
}

describe("largura da caixa controla a quebra", () => {
  it("caixa larga = uma linha; caixa estreita = duas", () => {
    expect(linhas(1)).toBe(1);
    expect(linhas(0.3)).toBe(2);
  });
});
