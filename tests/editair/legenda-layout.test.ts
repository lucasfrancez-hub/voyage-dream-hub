import { describe, expect, it } from "vitest";
import { aplicarCaps, casarIndicePalavra, quebrarBalanceado } from "@/lib/editair/legenda-layout";

/** Medidor determinístico: 10px por caractere. */
const medir = (s: string) => s.length * 10;

describe("aplicarCaps", () => {
  const t = "Com turismo nunca estive nos meus planos.";
  it("mantém o texto original", () => expect(aplicarCaps(t, "original")).toBe(t));
  it("aplica maiúsculas", () => expect(aplicarCaps(t, "upper")).toBe(t.toUpperCase()));
  it("aplica minúsculas", () => expect(aplicarCaps(t, "lower")).toBe(t.toLowerCase()));
  it("respeita o campo legado uppercase quando caps não existe", () => {
    expect(aplicarCaps(t, undefined, true)).toBe(t.toUpperCase());
    expect(aplicarCaps(t, undefined, false)).toBe(t);
  });
  it("voltar para Original recupera a capitalização exata", () => {
    expect(aplicarCaps(aplicarCaps(t, "upper") === t.toUpperCase() ? t : t, "original")).toBe(t);
  });
});

describe("quebrarBalanceado", () => {
  it("mantém uma linha quando cabe", () => {
    expect(quebrarBalanceado(medir, "oi mundo", 200, 2)).toEqual(["oi mundo"]);
  });

  it("quebra em duas linhas equilibradas", () => {
    const linhas = quebrarBalanceado(medir, "COM TURISMO NUNCA ESTEVE NOS MEUS PLANOS", 260, 2);
    expect(linhas).toHaveLength(2);
    const dif = Math.abs(medir(linhas[0]) - medir(linhas[1]));
    expect(dif).toBeLessThanOrEqual(60);
  });

  it("nunca corta palavra no meio", () => {
    const linhas = quebrarBalanceado(medir, "palavraenormequeestourao limite", 100, 2);
    expect(linhas.join(" ").split(/\s+/)).toEqual(["palavraenormequeestourao", "limite"]);
  });

  it("caixa mais estreita produz duas linhas; mais larga produz uma", () => {
    const texto = "COM TURISMO NUNCA ESTEVE NOS MEUS PLANOS";
    expect(quebrarBalanceado(medir, texto, 240, 2)).toHaveLength(2);
    expect(quebrarBalanceado(medir, texto, 2000, 2)).toHaveLength(1);
  });

  it("respeita o teto de linhas", () => {
    const l = quebrarBalanceado(medir, "a b c d e f g h i j k l m n o p", 40, 2);
    expect(l.length).toBeLessThanOrEqual(2);
  });

  it("palavra única não é dividida", () => {
    expect(quebrarBalanceado(medir, "inquebravel", 10, 2)).toEqual(["inquebravel"]);
  });
});

describe("casarIndicePalavra (karaokê)", () => {
  const words = [{ w: "olá" }, { w: "mundo" }, { w: "bonito" }];
  it("casa ignorando caixa e acento", () => {
    expect(casarIndicePalavra("OLÁ", 0, words)).toBe(0);
    expect(casarIndicePalavra("OLA", 0, words)).toBe(0);
  });
  it("casa ignorando pontuação", () => {
    expect(casarIndicePalavra("MUNDO,", 1, words)).toBe(1);
  });
  it("ressincroniza quando o texto foi revisado à mão", () => {
    // desenho perdeu uma palavra: o índice 1 aponta para "mundo", mas a palavra
    // desenhada é "bonito" → deve pular para 2 em vez de desligar o destaque
    expect(casarIndicePalavra("BONITO", 1, words)).toBe(2);
  });
  it("sem casamento textual mantém a ordem posicional", () => {
    expect(casarIndicePalavra("XPTO", 1, words)).toBe(1);
  });
  it("passou do fim de words[] devolve -1", () => {
    expect(casarIndicePalavra("XPTO", 9, words)).toBe(-1);
  });
});
