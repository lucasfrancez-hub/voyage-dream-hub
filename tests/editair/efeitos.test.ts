import { describe, expect, it } from "vitest";
import {
  DELTA_NEUTRO,
  EFEITOS_ENTRADA,
  EFEITOS_MOMENTO,
  EFEITOS_SAIDA,
  aplicarEasing,
  calcularEfeitos,
  cssDoDelta,
  efeitoPadrao,
  efeitosDaCamada,
  marcadoresEfeitos,
  temVinheta,
} from "@/lib/editair/efeitos";
import { CATEGORIAS_LEGENDA, MODELOS_LEGENDA, categoriaDoModelo, estiloDoModelo } from "@/lib/editair/caption-presets";

describe("catálogo de efeitos", () => {
  it("tem entrada, momento e saída conforme o briefing", () => {
    expect(EFEITOS_ENTRADA.length).toBeGreaterThanOrEqual(10);
    expect(EFEITOS_SAIDA.length).toBeGreaterThanOrEqual(8);
    expect(EFEITOS_MOMENTO.length).toBeGreaterThanOrEqual(12);
  });
  it("não repete ids entre camadas", () => {
    const ids = [...EFEITOS_ENTRADA, ...EFEITOS_MOMENTO, ...EFEITOS_SAIDA].map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it("efeitosDaCamada devolve a lista certa", () => {
    expect(efeitosDaCamada("entrada")).toBe(EFEITOS_ENTRADA);
    expect(efeitosDaCamada("momento")).toBe(EFEITOS_MOMENTO);
    expect(efeitosDaCamada("saida")).toBe(EFEITOS_SAIDA);
  });
});

describe("easing", () => {
  it("respeita os limites", () => {
    for (const e of ["linear", "suave", "forte", "elastico"] as const) {
      expect(aplicarEasing(0, e)).toBeCloseTo(0, 5);
      expect(aplicarEasing(1, e)).toBeCloseTo(1, 5);
    }
  });
});

describe("calcularEfeitos", () => {
  it("sem efeitos devolve delta neutro", () => {
    expect(calcularEfeitos(undefined, 100, 3000)).toEqual(DELTA_NEUTRO);
  });

  it("fade in começa transparente e termina opaco", () => {
    const ef = { entrada: { id: "fade-in", intensidade: 100, duracaoMs: 600, easing: "linear" as const } };
    expect(calcularEfeitos(ef, 0, 3000).opacidade).toBeCloseTo(0, 3);
    expect(calcularEfeitos(ef, 600, 3000).opacidade).toBeCloseTo(1, 3);
    expect(calcularEfeitos(ef, 2000, 3000).opacidade).toBeCloseTo(1, 3);
  });

  it("fade out só age no final", () => {
    const ef = { saida: { id: "fade-out", intensidade: 100, duracaoMs: 500, easing: "linear" as const } };
    expect(calcularEfeitos(ef, 1000, 3000).opacidade).toBeCloseTo(1, 3);
    expect(calcularEfeitos(ef, 3000, 3000).opacidade).toBeCloseTo(0, 3);
  });

  it("entrada + momento + saída coexistem", () => {
    const ef = {
      entrada: { id: "zoom-in", intensidade: 100, duracaoMs: 500, easing: "linear" as const },
      momento: { id: "flutuacao", intensidade: 100, velocidade: 1 },
      saida: { id: "fade-out", intensidade: 100, duracaoMs: 500, easing: "linear" as const },
    };
    const inicio = calcularEfeitos(ef, 50, 4000);
    expect(inicio.escala).toBeLessThan(1);
    const meio = calcularEfeitos(ef, 2000, 4000);
    expect(meio.opacidade).toBeCloseTo(1, 3);
    const fim = calcularEfeitos(ef, 3900, 4000);
    expect(fim.opacidade).toBeLessThan(0.5);
  });

  it("slides usam a largura/altura de referência", () => {
    const d = calcularEfeitos(
      { entrada: { id: "slide-esq", intensidade: 100, duracaoMs: 600, easing: "linear" } },
      0,
      3000,
      { w: 1000, h: 500 },
    );
    expect(d.dx).toBeLessThan(-100);
  });

  it("opacidade e escala ficam em faixas válidas", () => {
    for (const e of [...EFEITOS_ENTRADA, ...EFEITOS_MOMENTO, ...EFEITOS_SAIDA]) {
      const camada = e.camada;
      const ef = { [camada]: efeitoPadrao(e.id, camada) };
      for (const t of [0, 100, 900, 2500, 3000]) {
        const d = calcularEfeitos(ef, t, 3000);
        expect(d.opacidade).toBeGreaterThanOrEqual(0);
        expect(d.opacidade).toBeLessThanOrEqual(1);
        expect(Number.isFinite(d.escala)).toBe(true);
        expect(d.escala).toBeGreaterThan(0);
      }
    }
  });

  it("vinheta é reportada para a engine desenhar", () => {
    expect(temVinheta({ momento: { id: "vinheta", intensidade: 80 } })).toBeCloseTo(0.8, 3);
    expect(temVinheta({ momento: { id: "shake", intensidade: 80 } })).toBe(0);
  });
});

describe("marcadores na timeline", () => {
  it("mostra entrada, momento e saída", () => {
    const m = marcadoresEfeitos(
      {
        entrada: { id: "fade-in", intensidade: 60, duracaoMs: 800 },
        momento: { id: "shake", intensidade: 50 },
        saida: { id: "fade-out", intensidade: 60, duracaoMs: 600 },
      },
      4000,
    );
    expect(m).toEqual({ entradaMs: 800, saidaMs: 600, temMomento: true });
  });
  it("limita a metade da duração do clipe", () => {
    const m = marcadoresEfeitos({ entrada: { id: "fade-in", intensidade: 60, duracaoMs: 5000 } }, 2000);
    expect(m.entradaMs).toBe(1000);
    expect(m.temMomento).toBe(false);
  });
});

describe("css do delta (miniaturas)", () => {
  it("gera transform e opacidade", () => {
    const css = cssDoDelta({ dx: 10, dy: -5, escala: 1.2, opacidade: 0.5, rotacao: 3, blur: 0 }, 1);
    expect(css.transform).toContain("scale(1.2)");
    expect(css.opacity).toBe(0.5);
    expect(css.filter).toBeUndefined();
  });
});

describe("galeria de legendas", () => {
  it("tem uma biblioteca grande de presets", () => {
    expect(MODELOS_LEGENDA.length).toBeGreaterThanOrEqual(15);
  });
  it("ids são únicos", () => {
    const ids = MODELOS_LEGENDA.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it("todo preset cai numa categoria conhecida", () => {
    const validas = CATEGORIAS_LEGENDA.map((c) => c.id);
    for (const m of MODELOS_LEGENDA) expect(validas).toContain(categoriaDoModelo(m));
  });
  it("o preview usa o mesmo estilo completo da engine", () => {
    for (const m of MODELOS_LEGENDA) {
      const s = estiloDoModelo(m);
      expect(s.presetId).toBe(m.id);
      expect(s.fontFamily).toBeTruthy();
      expect(s.color).toBeTruthy();
      expect(s.activeColor).toBeTruthy();
      expect(s.fontSize).toBeGreaterThan(10);
    }
  });
  it("cada categoria tem pelo menos dois modelos", () => {
    for (const c of CATEGORIAS_LEGENDA) {
      expect(MODELOS_LEGENDA.filter((m) => categoriaDoModelo(m) === c.id).length).toBeGreaterThanOrEqual(2);
    }
  });
});
