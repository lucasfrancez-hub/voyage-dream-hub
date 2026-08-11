import { describe, expect, it } from "vitest";
import {
  absolutizar,
  compararProvedores,
  dentroDoBloco,
  medirTiming,
  validarTiming,
  type PalavraAuditada,
} from "@/lib/editair/auditoria-timing";

const p = (w: string, start: number, dur = 300, extra: Partial<PalavraAuditada> = {}): PalavraAuditada => ({
  w,
  start,
  end: start + dur,
  ...extra,
});

describe("offset de bloco", () => {
  it("palavra em 13.4s do 2º bloco vira 73.4s absolutos", () => {
    expect(absolutizar(13.4, 60_000)).toBe(73_400);
  });
  it("nunca aplica o offset duas vezes", () => {
    const abs = absolutizar(13.4, 60_000);
    expect(absolutizar(abs / 1000, 0)).toBe(73_400);
  });
  it("primeiro bloco não desloca nada", () => {
    expect(absolutizar(2.41, 0)).toBe(2_410);
  });
});

describe("região impossível", () => {
  it("acusa palavra do 2º bloco caindo no começo", () => {
    const w = p("meio", 13_400, 300, { chunkIni: 60_000, chunkFim: 120_000 });
    expect(dentroDoBloco(w)).toBe(false);
    const v = validarTiming([w], [], 180_000);
    expect(v.valida).toBe(false);
    expect(v.metricas.regiaoErrada).toBe(1);
  });
  it("aceita palavra dentro do próprio bloco", () => {
    expect(dentroDoBloco(p("ok", 73_400, 300, { chunkIni: 60_000, chunkFim: 120_000 }))).toBe(true);
  });
  it("rejeita palavra além da duração do áudio", () => {
    expect(validarTiming([p("tarde", 200_000)], [], 100_000).valida).toBe(false);
  });
});

describe("métricas contra a fala real", () => {
  const onsets = [
    { inicio: 1_000, fim: 1_500 },
    { inicio: 5_000, fim: 5_600 },
    { inicio: 9_000, fim: 9_800 },
    { inicio: 13_000, fim: 13_500 },
    { inicio: 17_000, fim: 17_900 },
  ];

  it("mede erro mediano, P95 e maior erro", () => {
    const palavras = [p("a", 1_050), p("b", 5_300), p("c", 9_900), p("d", 13_100), p("e", 18_600)];
    const m = medirTiming(palavras, onsets, 30_000);
    expect(m.amostras).toBe(5);
    expect(m.erroMedianoMs).toBe(300);
    expect(m.maiorErroMs).toBe(1_600);
    expect(m.acima250).toBe(3);
    expect(m.acima500).toBe(2);
    expect(m.acima1000).toBe(1);
  });

  it("conta palavras fora de ordem", () => {
    const m = medirTiming([p("a", 5_000), p("b", 1_000)], onsets, 30_000);
    expect(m.foraDeOrdem).toBe(1);
  });

  it("aprova alinhamento preciso", () => {
    const palavras = onsets.map((o, i) => p(`w${i}`, o.inicio + 40));
    expect(validarTiming(palavras, onsets, 30_000).valida).toBe(true);
  });

  it("reprova alinhamento com erro mediano alto", () => {
    const palavras = onsets.map((o, i) => p(`w${i}`, o.inicio + 900));
    const v = validarTiming(palavras, onsets, 30_000);
    expect(v.valida).toBe(false);
    expect(v.motivos.join(" ")).toContain("erro mediano");
  });
});

describe("comparação A/B", () => {
  it("monta a tabela palavra × real × A × B", () => {
    const onsets = [{ inicio: 2_410, fim: 2_900 }];
    const linhas = compararProvedores([p("exemplo", 2_600)], [p("exemplo", 2_430)], onsets);
    expect(linhas[0]).toMatchObject({ palavra: "exemplo", real: 2_410, a: 2_600, b: 2_430, difA: 190, difB: 20 });
  });
});
