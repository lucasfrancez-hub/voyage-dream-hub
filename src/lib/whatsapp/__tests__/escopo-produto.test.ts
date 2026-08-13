import { describe, it, expect } from "vitest";
import {
  contemProdutoCombinado,
  podeIrParaCentral,
  ehDuvidaAntesDeColeta,
  duvidaSemConteudo,
} from "../escopo-produto";

describe("trava de escopo — só aéreo vai para Paula/Bruno", () => {
  const somenteAereo = [
    "Quero passagem para Recife",
    "Quero só o voo",
    "Pode ser somente o voo",
    "Quero uma passagem, sem hotel",
    "Quero ida e volta para Salvador",
  ];
  for (const t of somenteAereo) {
    it(`libera: ${t}`, () => expect(podeIrParaCentral(t)).toBe(true));
  }

  const combinado = [
    "Pode ser hotel e aéreo",
    "Quero aéreo e hotel",
    "Quero passagem e hotel para Recife",
    "Quero um pacote para Buenos Aires",
    "Preciso de hotel e passagem",
    "Quero voo + hotel",
    "Quero viagem completa",
    "Estou vendo voo e hotel ainda",
  ];
  for (const t of combinado) {
    it(`bloqueia: ${t}`, () => {
      expect(contemProdutoCombinado(t)).toBe(true);
      expect(podeIrParaCentral(t)).toBe(false);
    });
  }
});

describe("entender antes de coletar", () => {
  it("dúvida anunciada sem conteúdo pede o assunto", () => {
    expect(duvidaSemConteudo("Gostaria de tirar algumas dúvidas")).toBe(true);
    expect(ehDuvidaAntesDeColeta("Gostaria de tirar algumas dúvidas")).toBe(true);
  });

  it("dúvida comercial concreta é dúvida, não coleta", () => {
    expect(
      ehDuvidaAntesDeColeta(
        "Queria saber sobre parcelamento no boleto se vocês tem e se funciona de ir viajar mesmo tendo parcelas a pagar",
      ),
    ).toBe(true);
    expect(duvidaSemConteudo("Queria saber sobre parcelamento no boleto")).toBe(false);
  });

  it("pedido direto de viagem não é dúvida", () => {
    expect(ehDuvidaAntesDeColeta("Quero passagem para Recife")).toBe(false);
    expect(duvidaSemConteudo("Quero passagem para Recife")).toBe(false);
  });
});
