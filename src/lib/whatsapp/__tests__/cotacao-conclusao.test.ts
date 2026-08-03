import { describe, expect, it } from "vitest";
import { cotacaoConcluida, previstasNaCotacao, MAX_OPCOES } from "../flight-cards-pending.server";

type Opt = Parameters<typeof previstasNaCotacao>[0][number];

const op = (partida: string, total = 1000): Opt =>
  ({ ida: { cia: "LA", voo: "3000", partida }, total }) as unknown as Opt;

describe("conclusão da cotação (formato-agnóstica)", () => {
  it("card + texto + card = 3 entregues = completa", () => {
    const todas = [op("2026-09-01T06:00"), op("2026-09-01T12:00"), op("2026-09-01T19:00")];
    const previstas = previstasNaCotacao(todas, MAX_OPCOES);
    expect(previstas).toBe(3);
    // opção 1 (card), 2 (texto), 3 (card) → todas gravam fingerprint
    expect(cotacaoConcluida(3, previstas)).toBe(true);
  });

  it("não conclui com uma opção ainda pendente", () => {
    const todas = [op("2026-09-01T06:00"), op("2026-09-01T12:00"), op("2026-09-01T19:00")];
    expect(cotacaoConcluida(2, previstasNaCotacao(todas, MAX_OPCOES))).toBe(false);
  });

  it("duas opções entregues em texto (falha dupla de render) fecham a cotação de 2", () => {
    const todas = [op("2026-09-01T06:00"), op("2026-09-01T12:00")];
    const previstas = previstasNaCotacao(todas, MAX_OPCOES);
    expect(previstas).toBe(2);
    expect(cotacaoConcluida(2, previstas)).toBe(true);
  });

  it("rota com uma única opção conclui com 1 (não fica pendente pra sempre)", () => {
    const previstas = previstasNaCotacao([op("2026-09-01T06:00")], MAX_OPCOES);
    expect(previstas).toBe(1);
    expect(cotacaoConcluida(1, previstas)).toBe(true);
  });

  it("opções com o mesmo horário de ida contam como opções distintas", () => {
    // Mesmo horário, tarifas/voltas diferentes = duas alternativas reais:
    // as duas precisam ser entregues, então o previsto é 3.
    const todas = [op("2026-09-01T06:00"), op("2026-09-01T06:00", 1200), op("2026-09-01T12:00")];
    expect(previstasNaCotacao(todas, MAX_OPCOES)).toBe(3);
  });

  it("nunca prevê mais que a meta da política", () => {
    const todas = ["06:00", "09:00", "12:00", "15:00", "19:00"].map((h) => op(`2026-09-01T${h}`));
    expect(previstasNaCotacao(todas, MAX_OPCOES)).toBe(MAX_OPCOES);
  });
});
