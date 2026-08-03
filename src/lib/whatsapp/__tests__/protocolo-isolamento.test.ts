import { describe, expect, it } from "vitest";
import { mentionsPreviousAttendance, shouldLoadPreviousContext } from "../history-reference";
import { originIsUsable, resolveOriginState } from "../flight-origin-state";

describe("histórico anterior só entra por referência explícita", () => {
  it("mensagem nova e neutra não carrega protocolo anterior", () => {
    for (const t of ["Oi, boa tarde", "Quero uma passagem para Recife", "Tem pacote pra Maceió?"]) {
      expect(mentionsPreviousAttendance(t)).toBe(false);
      expect(shouldLoadPreviousContext({ lastCustomerText: t })).toBe(false);
    }
  });

  it("cliente puxando assunto antigo libera o contexto", () => {
    for (const t of [
      "E a cotação que vocês mandaram?",
      "Da outra vez eu falei com a Camila",
      "O comercial não me retornou",
      "Voltei pra fechar",
      "Qual o localizador do meu pedido?",
    ]) {
      expect(mentionsPreviousAttendance(t)).toBe(true);
    }
  });

  it("responder a uma mensagem antiga também libera", () => {
    expect(shouldLoadPreviousContext({ lastCustomerText: "essa aqui", hasQuotedOldMessage: true })).toBe(
      true,
    );
  });
});

describe("origem é estado do protocolo, não do histórico", () => {
  const agora = new Date().toISOString();

  it("sem inbound informando origem, a pesquisa continua bloqueada", () => {
    const state = resolveOriginState({
      origin: "Maringá",
      inbound: [{ id: "1", content: "quero ir pra São Paulo", created_at: agora }],
      askedOriginAt: null,
      suggestedOrigin: "Maringá",
    });
    expect(originIsUsable(state)).toBe(false);
  });

  it("cliente citando a cidade libera", () => {
    const state = resolveOriginState({
      origin: "Maringá",
      inbound: [{ id: "1", content: "saio de Maringá mesmo", created_at: agora }],
      askedOriginAt: null,
      suggestedOrigin: null,
    });
    expect(originIsUsable(state)).toBe(true);
  });

  it("um 'isso mesmo' depois da pergunta de confirmação libera a sugerida", () => {
    const perguntaEm = new Date(Date.now() - 60_000).toISOString();
    const state = resolveOriginState({
      origin: "Maringá",
      inbound: [{ id: "1", content: "isso mesmo", created_at: agora }],
      askedOriginAt: perguntaEm,
      suggestedOrigin: "Maringá",
    });
    expect(originIsUsable(state)).toBe(true);
  });
});
