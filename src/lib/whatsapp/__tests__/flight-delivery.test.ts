import { describe, it, expect } from "vitest";
import {
  META_OPCOES,
  MIN_OPCOES,
  CLAIM_TTL_MS,
  SOFT_DEADLINE_MS,
  EMERGENCIA_MS,
  expectedOptions,
  quoteStatus,
  claimExpirado,
  opcaoDisponivel,
  emEmergencia,
  proximoIntervaloMs,
  cotacaoConcluida,
} from "../flight-delivery";

describe("quantidade prevista", () => {
  it("meta de 3 opções, mínimo 2", () => {
    expect(META_OPCOES).toBe(3);
    expect(MIN_OPCOES).toBe(2);
  });
  it("nunca prevê mais do que o motor salvou", () => {
    expect(expectedOptions(5)).toBe(3);
    expect(expectedOptions(2)).toBe(2);
    expect(expectedOptions(1)).toBe(1);
    expect(expectedOptions(0)).toBe(0);
  });
});

describe("conclusão da cotação (independe do formato)", () => {
  it("3 previstas só concluem com as 3 entregues", () => {
    expect(cotacaoConcluida(1, 3)).toBe(false);
    expect(cotacaoConcluida(2, 3)).toBe(false);
    expect(cotacaoConcluida(3, 3)).toBe(true);
  });
  it("mistura de card e texto conta igual", () => {
    // 1 card + 2 fallbacks textuais = 3 entregues
    expect(quoteStatus(3, 3)).toBe("completed");
  });
  it("entrega parcial não vira completed", () => {
    expect(quoteStatus(2, 3)).toBe("partially_delivered");
    expect(quoteStatus(0, 3)).toBe("pending");
  });
  it("cancelada nunca conclui", () => {
    expect(quoteStatus(3, 3, { cancelled: true })).toBe("cancelled");
  });
});

describe("claim expira e devolve a opção para a fila", () => {
  const agora = Date.now();
  it("claim vencido é reprocessável", () => {
    expect(claimExpirado(new Date(agora - CLAIM_TTL_MS - 1).toISOString(), agora)).toBe(true);
    expect(claimExpirado(new Date(agora + 10_000).toISOString(), agora)).toBe(false);
  });
  it("opção entregue nunca volta para a fila (sem duplicidade)", () => {
    expect(opcaoDisponivel({ delivery_status: "delivered_card", claim_expires_at: null }, agora)).toBe(false);
    expect(opcaoDisponivel({ delivery_status: "pending", claim_expires_at: null }, agora)).toBe(true);
    expect(
      opcaoDisponivel(
        { delivery_status: "rendering", claim_expires_at: new Date(agora + 30_000).toISOString() },
        agora,
      ),
    ).toBe(false);
    expect(
      opcaoDisponivel(
        { delivery_status: "rendering", claim_expires_at: new Date(agora - 1).toISOString() },
        agora,
      ),
    ).toBe(true);
  });
});

describe("prazos", () => {
  it("card tem 6s; depois disso sai em texto", () => {
    expect(SOFT_DEADLINE_MS).toBe(6_000);
  });
  it("cotação parada por mais de 5 min entra em emergência", () => {
    expect(EMERGENCIA_MS).toBe(300_000);
    const inicio = Date.now() - 6 * 60_000;
    expect(emEmergencia({ created_at: new Date(inicio).toISOString(), delivered_options_count: 1, expected_options: 3 })).toBe(true);
    expect(emEmergencia({ created_at: new Date(Date.now() - 10_000).toISOString(), delivered_options_count: 1, expected_options: 3 })).toBe(false);
  });
  it("intervalo entre opções fica entre 30s e 90s", () => {
    for (let i = 0; i < 50; i++) {
      const ms = proximoIntervaloMs();
      expect(ms).toBeGreaterThanOrEqual(30_000);
      expect(ms).toBeLessThanOrEqual(90_000);
    }
  });
});
