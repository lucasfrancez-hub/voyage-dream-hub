import { describe, expect, it } from "vitest";
import {
  classificarGesto,
  interpretarRoda,
  metricaScrollbar,
  normalizarDelta,
  panScrollLeft,
  panScrollTop,
  scrollDoCliqueNaTrilha,
  scrollDoPolegar,
} from "@/lib/editair/pan-timeline";

const LIM = { min: 4, max: 600 };

describe("roda / trackpad", () => {
  it("normaliza deltaMode de linha e página", () => {
    expect(normalizarDelta(3, 0)).toBe(3);
    expect(normalizarDelta(3, 1)).toBe(48);
    expect(normalizarDelta(2, 2)).toBe(200);
  });

  it("shift + wheel vira horizontal", () => {
    expect(interpretarRoda({ deltaX: 0, deltaY: 120, shiftKey: true }, 100, LIM)).toEqual({
      tipo: "horizontal",
      dx: 120,
    });
  });

  it("deltaX dominante do trackpad vira horizontal", () => {
    expect(interpretarRoda({ deltaX: -40, deltaY: 4 }, 100, LIM)).toEqual({ tipo: "horizontal", dx: -40 });
  });

  it("scroll vertical comum continua vertical", () => {
    expect(interpretarRoda({ deltaX: 0, deltaY: 90 }, 100, LIM)).toEqual({ tipo: "vertical", dy: 90 });
  });

  it("pinça (ctrl) faz zoom exponencial e respeita limites", () => {
    const aproximar = interpretarRoda({ deltaX: 0, deltaY: -100, ctrlKey: true }, 100, LIM);
    expect(aproximar.tipo).toBe("zoom");
    if (aproximar.tipo === "zoom") expect(aproximar.zoom).toBeGreaterThan(100);
    const teto = interpretarRoda({ deltaX: 0, deltaY: -100000, ctrlKey: true }, 100, LIM);
    if (teto.tipo === "zoom") expect(teto.zoom).toBe(600);
    const piso = interpretarRoda({ deltaX: 0, deltaY: 100000, ctrlKey: true }, 100, LIM);
    if (piso.tipo === "zoom") expect(piso.zoom).toBe(4);
  });
});

describe("pan com a mão", () => {
  it("conteúdo acompanha o ponteiro (arrastar para a esquerda avança)", () => {
    expect(panScrollLeft(500, -200, 4000)).toBe(700);
    expect(panScrollLeft(500, 200, 4000)).toBe(300);
  });

  it("nunca passa dos limites", () => {
    expect(panScrollLeft(100, 900, 4000)).toBe(0);
    expect(panScrollLeft(3900, -900, 4000)).toBe(4000);
    expect(panScrollTop(0, 50, 300)).toBe(0);
  });

  it("pan de 1000px com timeline longa chega ao ponto esperado", () => {
    expect(panScrollLeft(0, -1000, 30000)).toBe(1000);
  });
});

describe("scrollbar própria", () => {
  it("some quando não há transbordo", () => {
    expect(metricaScrollbar(0, 800, 800, 400).visivel).toBe(false);
  });

  it("polegar proporcional e com tamanho mínimo", () => {
    const m = metricaScrollbar(0, 4000, 1000, 400);
    expect(m.visivel).toBe(true);
    expect(Math.round(m.largura)).toBe(100);
    const min = metricaScrollbar(0, 400000, 1000, 400);
    expect(min.largura).toBe(32);
  });

  it("posição do polegar acompanha o scrollLeft", () => {
    const fim = metricaScrollbar(3000, 4000, 1000, 400);
    expect(Math.round(fim.x)).toBe(Math.round(fim.curso));
  });

  it("arrastar o polegar volta o scrollLeft equivalente", () => {
    const m = metricaScrollbar(0, 4000, 1000, 400);
    expect(Math.round(scrollDoPolegar(m.curso, m, 4000, 1000))).toBe(3000);
    expect(scrollDoPolegar(-50, m, 4000, 1000)).toBe(0);
  });

  it("clique na trilha centraliza o polegar no ponto", () => {
    const m = metricaScrollbar(0, 4000, 1000, 400);
    const x = scrollDoCliqueNaTrilha(200, m, 4000, 1000);
    expect(x).toBeGreaterThan(0);
    expect(x).toBeLessThan(3000);
  });
});

describe("classificação única de gestos", () => {
  it("Espaço + botão esquerdo = pan, mesmo sobre um clipe", () => {
    expect(classificarGesto({ button: 0, espacoPressionado: true, alvo: "clip" })).toBe("pan");
  });
  it("botão do meio = pan", () => {
    expect(classificarGesto({ button: 1, espacoPressionado: false, alvo: "vazio" })).toBe("pan");
  });
  it("sem Espaço o clipe continua arrastável", () => {
    expect(classificarGesto({ button: 0, espacoPressionado: false, alvo: "clip" })).toBe("clip");
  });
  it("régua e playhead fazem scrub; vazio faz marquee", () => {
    expect(classificarGesto({ button: 0, espacoPressionado: false, alvo: "regua" })).toBe("scrub");
    expect(classificarGesto({ button: 0, espacoPressionado: false, alvo: "playhead" })).toBe("scrub");
    expect(classificarGesto({ button: 0, espacoPressionado: false, alvo: "vazio" })).toBe("marquee");
    expect(classificarGesto({ button: 0, espacoPressionado: false, altKey: true, alvo: "vazio" })).toBe("scrub");
  });
  it("splitter e scrollbar nunca são roubados pelo pan", () => {
    expect(classificarGesto({ button: 0, espacoPressionado: true, alvo: "splitter" })).toBe("splitter");
    expect(classificarGesto({ button: 1, espacoPressionado: true, alvo: "scrollbar" })).toBe("scrollbar");
  });
});
