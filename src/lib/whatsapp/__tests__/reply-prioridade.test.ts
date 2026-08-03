/**
 * PRIORIDADE DO REPLY sobre a memória conversacional.
 * Cenário obrigatório: cliente responde ao card de Congonhas pedindo bagagem.
 */
import { describe, expect, it } from "vitest";
import {
  baseFromRepliedOption,
  buildRefineBlock,
  detectRefineIntents,
  type RefineBaseSearch,
  type RepliedOption,
} from "../flight-refine";

// Última pesquisa da conversa foi São Paulo/Guarulhos.
const ULTIMA_PESQUISA: RefineBaseSearch = {
  origem: "Maringá",
  origem_iata: "MGF",
  destino: "São Paulo",
  destino_iata: "GRU",
  data_ida: "2026-08-11",
  data_volta: null,
  adultos: 1,
  criancas: 0,
  bebes: 0,
};

// O card respondido é o de Congonhas.
const CARD_CONGONHAS: RepliedOption = {
  option_index: 2,
  companhia: "Latam",
  saida: "16:40",
  chegada: "18:00",
  data_ida: "2026-08-11",
  valor_formatado: "R$ 1.017,57",
  ida_origem_iata: "MGF",
  ida_destino_iata: "CGH",
};

describe("reply tem prioridade absoluta sobre a última pesquisa", () => {
  it("a base do refino vem do card respondido, não do GRU da última pesquisa", () => {
    const base = baseFromRepliedOption(ULTIMA_PESQUISA, CARD_CONGONHAS);
    expect(base.destino_iata).toBe("CGH");
    expect(base.destino_iata).not.toBe("GRU");
    expect(base.origem_iata).toBe("MGF");
    expect(base.data_ida).toBe("2026-08-11");
    expect(base.adultos).toBe(1);
  });

  it('"consegue cotar com bagagem?" vira refino de bagagem mantendo Congonhas', () => {
    const intents = detectRefineIntents("consegue cotar com bagagem?");
    expect(intents.map((i) => i.kind)).toContain("com_bagagem");

    const bloco = buildRefineBlock(
      baseFromRepliedOption(ULTIMA_PESQUISA, CARD_CONGONHAS),
      intents,
      { fonte: "reply", opcao: CARD_CONGONHAS },
    );
    expect(bloco).toContain("REFERÊNCIA TRAVADA PELO REPLY");
    expect(bloco).toContain("CGH");
    expect(bloco).toContain("somente_com_bagagem = true");
    expect(bloco).not.toContain("GRU");
  });

  it("sem reply, a base continua sendo a última pesquisa", () => {
    const bloco = buildRefineBlock(ULTIMA_PESQUISA, detectRefineIntents("com bagagem"), {
      fonte: "ultima_referencia",
    });
    expect(bloco).not.toContain("REFERÊNCIA TRAVADA PELO REPLY");
    expect(bloco).toContain("GRU");
  });

  it("reply preserva os demais filtros ao trocar de aeroporto", () => {
    const base = baseFromRepliedOption(
      { ...ULTIMA_PESQUISA, adultos: 2, criancas: 1, somente_voo_direto: true },
      CARD_CONGONHAS,
    );
    const bloco = buildRefineBlock(base, detectRefineIntents("tem por Viracopos?"), {
      fonte: "reply",
      opcao: CARD_CONGONHAS,
    });
    expect(bloco).toContain("adultos: 2");
    expect(bloco).toContain("criancas: 1");
    expect(bloco).toContain("somente_voo_direto: true");
    expect(bloco).toContain("VCP");
  });

  it("sem base anterior, o reply ainda monta a pesquisa a partir do card", () => {
    const base = baseFromRepliedOption(null, CARD_CONGONHAS);
    expect(base.origem_iata).toBe("MGF");
    expect(base.destino_iata).toBe("CGH");
    expect(base.destino).toBe("São Paulo");
  });
});
