import { describe, it, expect } from "vitest";
import { aplicarViciosDeLinguagem } from "../text-utils.server";

describe("vícios de linguagem (fala de gente)", () => {
  it("troca você por vc mantendo a caixa", () => {
    expect(aplicarViciosDeLinguagem("Você prefere manhã? posso reservar para você")).toBe(
      "Vc prefere manhã? posso reservar pra vc",
    );
  });

  it("troca está/estão por tá/tão", () => {
    expect(aplicarViciosDeLinguagem("O voo está confirmado e as taxas estão inclusas")).toBe(
      "O voo tá confirmado e as taxas tão inclusas",
    );
  });

  it("não mexe dentro de links", () => {
    const txt = "olha aqui https://site.com/voce/esta-ok e me diz se você gostou";
    expect(aplicarViciosDeLinguagem(txt)).toBe(
      "olha aqui https://site.com/voce/esta-ok e me diz se vc gostou",
    );
  });

  it("não quebra palavras que contêm o termo", () => {
    expect(aplicarViciosDeLinguagem("estamos vendo e vocês avisam")).toBe(
      "estamos vendo e vocês avisam",
    );
  });
});
