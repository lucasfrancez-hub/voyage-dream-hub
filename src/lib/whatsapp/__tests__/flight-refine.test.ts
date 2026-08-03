import { describe, it, expect } from "vitest";
import {
  detectRefineIntents,
  buildRefineBlock,
  type RefineBaseSearch,
} from "../flight-refine";
import { stripMarkdownForWhatsApp } from "../text-utils.server";

const base: RefineBaseSearch = {
  origem: "Maringá",
  origem_iata: "MGF",
  destino: "São Paulo",
  destino_iata: "GRU",
  data_ida: "2026-08-11",
  data_volta: null,
  adultos: 1,
  criancas: 0,
  bebes: 0,
  bagagem_despachada: false,
  somente_voo_direto: false,
  companhias_incluidas: null,
  companhias_excluidas: null,
};

const kinds = (t: string) => detectRefineIntents(t).map((i) => i.kind);

describe("continuidade da pesquisa aérea", () => {
  it("cenário 1: 'tem mais opções?' é continuação", () => {
    expect(kinds("tem mais opcoes?")).toContain("mais_opcoes");
    expect(kinds("tem outras?")).toContain("mais_opcoes");
    expect(kinds("tem outras alternativas?")).toContain("mais_opcoes");
  });

  it("cenário 2: 'tem por Congonhas?' vira novo destino CGH", () => {
    const [i] = detectRefineIntents("por congonhas?");
    expect(i.kind).toBe("aeroporto_destino");
    expect(i.iata).toBe("CGH");
  });

  it("cenário 3: Viracopos/Campinas mantém demais parâmetros", () => {
    const intents = detectRefineIntents("pode ser Viracopos?");
    expect(intents[0].iata).toBe("VCP");
    const bloco = buildRefineBlock(base, intents);
    expect(bloco).toContain("origem: Maringá (MGF)");
    expect(bloco).toContain("data_ida: 2026-08-11");
    expect(bloco).toContain("adultos: 1");
    expect(bloco).toContain('destino = "VCP"');
    expect(detectRefineIntents("e Campinas?")[0].iata).toBe("VCP");
  });

  it("cenário 4: 'e sem conexão?' altera só o filtro", () => {
    expect(kinds("e sem conexao?")).toEqual(["sem_conexao"]);
  });

  it("cenário 5: 'quanto fica com bagagem?'", () => {
    expect(kinds("quanto fica com bagagem?")).toContain("com_bagagem");
    expect(kinds("sem bagagem fica quanto?")).toContain("sem_bagagem");
  });

  it("cenário 6: outra companhia / companhia citada", () => {
    expect(kinds("tem outra companhia?")).toContain("companhia");
    const [i] = detectRefineIntents("tem da Latam?").filter((x) => x.kind === "companhia");
    expect(i.companhia).toBe("LATAM");
  });

  it("cenário 7: voo mais cedo prioriza horário", () => {
    expect(kinds("tem voo mais cedo?")).toContain("mais_cedo");
    expect(kinds("tem algum mais tarde?")).toContain("mais_tarde");
  });

  it("cenário 8: mais barato", () => {
    expect(kinds("tem mais barato?")).toContain("mais_barato");
  });

  it("'saindo de Congonhas' muda a ORIGEM", () => {
    const [i] = detectRefineIntents("tem saindo de Congonhas?");
    expect(i.kind).toBe("aeroporto_origem");
    expect(i.iata).toBe("CGH");
  });

  it("mensagem sem intenção de refino não gera bloco", () => {
    expect(detectRefineIntents("obrigado!")).toEqual([]);
    expect(buildRefineBlock(base, [])).toBe("");
  });

  it("bloco proíbe negativa sem nova pesquisa", () => {
    const bloco = buildRefineBlock(base, detectRefineIntents("tem por congonhas?"));
    expect(bloco).toContain("pesquisar_passagens AGORA");
    expect(bloco.toLowerCase()).toContain("proibido responder");
  });

  it("cenário 9: nenhuma resposta com Markdown", () => {
    const sujo =
      "## Opções\n\n**Latam** às 10:10 __direto__\n\n* item um\n\nPosso ver `outra data`";
    const limpo = stripMarkdownForWhatsApp(sujo);
    expect(limpo).not.toMatch(/\*\*|__|^#/m);
    expect(limpo).toContain("Latam");
    expect(limpo).toContain("- item um");
    expect(limpo).toContain("outra data");
  });
});
