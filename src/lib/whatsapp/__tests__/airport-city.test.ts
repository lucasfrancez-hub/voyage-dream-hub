/**
 * Normalização cidade × aeroporto e memória do filtro.
 * Cenários 1 a 5 do briefing.
 */
import { describe, expect, it } from "vitest";
import {
  aeroportosDaCidade,
  atendePedido,
  cidadeDoAeroporto,
  interpretarLocal,
  isCodigoDeCidade,
} from "../airport-city";
import { buildRefineBlock, detectRefineIntents } from "../flight-refine";

describe("Cenário 1 — cliente diz a cidade", () => {
  it('"Quero São Paulo" pesquisa a cidade (GRU + CGH)', () => {
    const r = interpretarLocal("quero São Paulo");
    expect(r?.tipo).toBe("cidade");
    expect(r?.codigo_pesquisa).toBe("SAO");
    expect(r?.is_cidade).toBe(true);
    expect(r?.aeroportos).toEqual(expect.arrayContaining(["GRU", "CGH"]));
  });
});

describe("Cenário 2 — cliente diz o aeroporto", () => {
  it('"Quero Congonhas" pesquisa apenas CGH', () => {
    const r = interpretarLocal("quero Congonhas");
    expect(r?.tipo).toBe("aeroporto");
    expect(r?.codigo_pesquisa).toBe("CGH");
    expect(r?.aeroportos).toEqual(["CGH"]);
    expect(r?.cidade).toBe("São Paulo");
  });
});

describe("Cenário 3 — Guarulhos", () => {
  it('"Quero Guarulhos" pesquisa apenas GRU', () => {
    const r = interpretarLocal("quero Guarulhos");
    expect(r?.tipo).toBe("aeroporto");
    expect(r?.aeroporto_iata).toBe("GRU");
    expect(r?.aeroportos).toEqual(["GRU"]);
  });

  it("aeroporto específico tem prioridade mesmo citando a cidade junto", () => {
    const r = interpretarLocal("São Paulo, mas por Congonhas");
    expect(r?.aeroporto_iata).toBe("CGH");
  });
});

describe("Cenário 4 — 'Tem por Congonhas?' atualiza o filtro", () => {
  it("vira refino de destino com CGH e trava o filtro no bloco", () => {
    const intents = detectRefineIntents("tem por Congonhas?");
    expect(intents).toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: "aeroporto_destino", iata: "CGH" })]),
    );

    const bloco = buildRefineBlock(
      {
        origem: "Maringá",
        origem_iata: "MGF",
        destino: "São Paulo",
        destino_iata: "SAO",
        data_ida: "2026-08-11",
        data_volta: null,
        adultos: 1,
        criancas: 0,
        bebes: 0,
      },
      intents,
    );
    expect(bloco).toContain("FILTRO TRAVADO");
    expect(bloco).toContain("aeroporto_destino = CGH");
    expect(bloco).toContain("cidade_destino = São Paulo");
    // não perde os demais filtros
    expect(bloco).toContain("MGF");
    expect(bloco).toContain("2026-08-11");
  });
});

describe("Cenário 5 — validação cruzada", () => {
  it("o bloco proíbe negativa quando o motor retornou opções", () => {
    const bloco = buildRefineBlock(
      {
        origem: "Maringá",
        origem_iata: "MGF",
        destino: "São Paulo",
        destino_iata: "SAO",
        data_ida: "2026-08-11",
        data_volta: null,
        adultos: 1,
        criancas: 0,
        bebes: 0,
      },
      detectRefineIntents("tem por Congonhas?"),
    );
    expect(bloco).toContain("VALIDAÇÃO CRUZADA");
    expect(bloco).toContain("opcoes > 0");
  });

  it("retorno CGH atende o pedido travado em CGH", () => {
    const pedido = interpretarLocal("congonhas");
    expect(atendePedido(pedido, "CGH")).toBe(true);
    expect(atendePedido(pedido, "GRU")).toBe(false);
  });

  it("retorno GRU ou CGH atende o pedido de cidade São Paulo", () => {
    const pedido = interpretarLocal("são paulo");
    expect(atendePedido(pedido, "GRU")).toBe(true);
    expect(atendePedido(pedido, "CGH")).toBe(true);
    expect(atendePedido(pedido, "GIG")).toBe(false);
  });
});

describe("mapa cidade × aeroportos", () => {
  it("cobre as cidades do briefing", () => {
    expect(aeroportosDaCidade("São Paulo")).toEqual(expect.arrayContaining(["GRU", "CGH"]));
    expect(aeroportosDaCidade("Rio de Janeiro")).toEqual(expect.arrayContaining(["GIG", "SDU"]));
    expect(aeroportosDaCidade("Belo Horizonte")).toEqual(expect.arrayContaining(["CNF", "PLU"]));
    expect(aeroportosDaCidade("Londres")).toEqual(
      expect.arrayContaining(["LHR", "LGW", "STN", "LTN", "LCY"]),
    );
    expect(aeroportosDaCidade("Paris")).toEqual(expect.arrayContaining(["CDG", "ORY"]));
    expect(aeroportosDaCidade("Nova York")).toEqual(expect.arrayContaining(["JFK", "EWR", "LGA"]));
  });

  it("resolve a cidade de um aeroporto e reconhece código de cidade", () => {
    expect(cidadeDoAeroporto("SDU")?.cidade).toBe("Rio de Janeiro");
    expect(isCodigoDeCidade("SAO")).toBe(true);
    expect(isCodigoDeCidade("CGH")).toBe(false);
  });

  it("não confunde texto solto com aeroporto", () => {
    expect(interpretarLocal("quero viajar barato")).toBeNull();
  });
});
