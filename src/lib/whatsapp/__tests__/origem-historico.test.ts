import { describe, expect, it } from "vitest";
import {
  isValidOriginQuestion,
  originConfirmQuestion,
  safeMissingOriginResponse,
} from "../airflow-guard";
import { validateFlightSearch } from "../flight-search-validation";

const base = {
  destino: "São Paulo",
  tipo_trecho: "somente_ida" as const,
  data_ida: "2099-01-10",
  data_informada_pelo_cliente: true,
  pax_informado_pelo_cliente: true,
  adultos: 1,
};

describe("origem recuperada do histórico é apenas sugestão", () => {
  it("cenário 1 — sem histórico: pergunta aberta", () => {
    const r = validateFlightSearch({ ...base, origem: null, origem_informada_pelo_cliente: false });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.instrucao).toMatch(/De qual cidade você pretende embarcar/i);
    expect(safeMissingOriginResponse(null)).toBe("De qual cidade você pretende embarcar?");
  });

  it("cenário 2 — histórico com Maringá: pergunta de confirmação e pesquisa bloqueada", () => {
    const r = validateFlightSearch({
      ...base,
      origem: null,
      origem_informada_pelo_cliente: false,
      origem_sugerida_pelo_historico: "Maringá",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.instrucao).toMatch(/Vai manter o embarque por Maringá ou quer mudar a origem/i);
    expect(safeMissingOriginResponse("Ana Paula", "Maringá")).toContain(
      originConfirmQuestion("Maringá"),
    );
  });

  it("sugestão do histórico sozinha nunca libera a pesquisa", () => {
    const r = validateFlightSearch({
      ...base,
      origem: "Maringá",
      origem_informada_pelo_cliente: false,
      origem_sugerida_pelo_historico: "Maringá",
    });
    expect(r.ok).toBe(false);
  });

  it("cenário 3 — cliente confirma a origem anterior", () => {
    const r = validateFlightSearch({
      ...base,
      origem: "Maringá",
      origem_informada_pelo_cliente: true,
      origem_sugerida_pelo_historico: "Maringá",
    });
    expect(r.ok).toBe(true);
  });

  it("cenário 4/5 — cliente troca ou informa origem nova", () => {
    expect(
      validateFlightSearch({
        ...base,
        origem: "Curitiba",
        origem_informada_pelo_cliente: true,
        origem_sugerida_pelo_historico: "Maringá",
      }).ok,
    ).toBe(true);
    expect(
      validateFlightSearch({ ...base, origem: "Londrina", origem_informada_pelo_cliente: true }).ok,
    ).toBe(true);
  });

  it("guard aceita a confirmação da origem sugerida como resposta válida", () => {
    expect(isValidOriginQuestion("Vai manter o embarque por Maringá ou quer mudar a origem?", "Maringá")).toBe(true);
    expect(isValidOriginQuestion("De qual cidade você pretende embarcar?", "Maringá")).toBe(true);
    expect(isValidOriginQuestion("Vou pesquisar saindo de Maringá", "Maringá")).toBe(false);
    // sem sugestão, só a pergunta aberta vale
    expect(isValidOriginQuestion("Vai manter o embarque por Maringá?", null)).toBe(false);
  });
});
