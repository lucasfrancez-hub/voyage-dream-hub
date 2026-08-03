import { describe, it, expect } from "vitest";
import { detectarInteressePacote } from "../pacote-intent";

describe("intenção de pacote no atendimento aéreo", () => {
  const positivos = [
    "Quero ver pacotes também",
    "Tem pacote?",
    "Queria uma opção de pacote",
    "Quero pacote para viajar",
    "Tem algum pacote barato?",
    "Queria ver umas opções completas",
    "Tem pacote com hotel?",
    "Quero conhecer outros destinos também",
    "Queria ver pacote de praia",
    "Tem promoção de pacote?",
    "Bruno, queria ver umas opções de pacotes tbem",
  ];
  it.each(positivos)("detecta: %s", (t) => {
    expect(detectarInteressePacote(t)).toBe(true);
  });

  const negativos = [
    "Me manda essa com bagagem",
    "Quero passagem de Maringá para São Paulo dia 12/08",
    "Qual o valor total com taxas?",
    "Acabou meu pacote de dados",
    "",
  ];
  it.each(negativos)("não detecta: %s", (t) => {
    expect(detectarInteressePacote(t)).toBe(false);
  });
});
