import { describe, expect, it } from "vitest";
import {
  computeRisk,
  detectDeterministicSignals,
  levelFromScore,
  preFormattedScore,
  type FraudMessage,
} from "../fraud/signals";

const msg = (content: string, direction: "inbound" | "outbound" = "inbound"): FraudMessage => ({
  direction,
  content,
  created_at: new Date().toISOString(),
});

describe("motor antifraude", () => {
  it("não sobe risco por número internacional isolado", () => {
    const { signals, reducers } = detectDeterministicSignals({
      messages: [msg("Oi, boa tarde! Moro em Lisboa e queria ver uma passagem pra Florianópolis, quanto fica?")],
      wa_phone: "351915118615",
    });
    expect(signals.find((s) => s.code === "INTL_MISMATCH")).toBeUndefined();
    const { score } = computeRisk(signals, reducers);
    expect(score).toBeLessThan(25);
  });

  it("reconhece pedido pré-formatado sem transferir sozinho", () => {
    const pf = preFormattedScore(
      "Seria um voo em 16 de setembro - Lisboa para Florianópolis (FLN), um passageiro, sem bagagem despachada, com retorno entre 20 ou 21 de setembro.",
    );
    expect(pf).toBeGreaterThan(0.5);
    const { signals, reducers } = detectDeterministicSignals({
      messages: [
        msg(
          "Seria um voo em 16 de setembro - Lisboa para Florianópolis (FLN), um passageiro, sem bagagem despachada, com retorno entre 20 ou 21 de setembro.",
        ),
      ],
      wa_phone: "351915118615",
    });
    const calc = computeRisk(signals, reducers);
    expect(calc.transfer_required).toBe(false);
  });

  it("tentativa de contornar o checkout + pressão vira risco alto e transferência", () => {
    const { signals, reducers } = detectDeterministicSignals({
      messages: [
        msg("Voo 20/09 GRU para MIA, 1 passageiro, sem bagagem despachada, retorno 25/09"),
        msg("pode ser"),
        msg("manda o link"),
        msg("preciso emitir agora, urgente"),
        msg("já tentei por aí e não funciona, tem outro lugar pra passar o cartão?"),
      ],
      wa_phone: "351915118615",
      travel_date: new Date(Date.now() + 2 * 86400000).toISOString(),
    });
    const calc = computeRisk(signals, reducers);
    expect(calc.score).toBeGreaterThanOrEqual(65);
    expect(calc.transfer_required).toBe(true);
    expect(calc.clusters.map((c) => c.code)).toContain("CONTORNO_CHECKOUT");
  });

  it("redutores derrubam o risco quando o cliente segue o fluxo oficial", () => {
    const base = detectDeterministicSignals({
      messages: [
        msg("o link deu erro no meu cartão"),
        msg("ah ok, vou tentar de novo por aí"),
        msg("qual o horário do voo e tem bagagem?"),
        msg("tem opção mais barata em outra data?"),
      ],
      wa_phone: "5544999999999",
    });
    const comAceite = computeRisk(base.signals, [
      ...base.reducers,
      { code: "CHECKOUT_ACCEPTED", intensity: 0.9, evidence: [], source: "ia" },
    ]);
    const semAceite = computeRisk(base.signals, base.reducers);
    expect(comAceite.score).toBeLessThan(semAceite.score);
  });

  it("faixas de nível seguem o briefing", () => {
    expect(levelFromScore(18)).toBe("baixo");
    expect(levelFromScore(47)).toBe("moderado");
    expect(levelFromScore(71)).toBe("alto");
    expect(levelFromScore(89)).toBe("critico");
  });
});
