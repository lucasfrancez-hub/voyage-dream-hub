import { describe, expect, it } from "vitest";
import { heuristicaAereo } from "../triage.server";
import { validateFlightSearch } from "../flight-search-validation";

describe("regressão: pedido de passagem vai para a Central", () => {
  const aereo = [
    "Quero uma passagem para São paulo",
    "Quero uma passagem",
    "Preciso de passagem",
    "Quero um voo para Recife",
    "Tem voo para Salvador?",
    "Quero ida e volta para Salvador",
    "Quero só ida",
    "Quero passagem aérea",
    "Quero viajar de avião",
    "Quero passagem de Maringá para São Paulo",
    "Quero viajar para São Paulo",
    "Quero ir para Recife",
  ];
  for (const t of aereo) {
    it(`aéreo: ${t}`, () => expect(heuristicaAereo(t)).toBe(true));
  }

  const naoAereo = [
    "Quero um pacote para Porto Seguro",
    "Quero hotel em Natal",
    "Quero voo e hotel para Maceió",
    "Quero cancelar minha reserva",
    "Oi, boa tarde",
    "Quero ir para Foz de ônibus",
  ];
  for (const t of naoAereo) {
    it(`não aéreo: ${t}`, () => expect(heuristicaAereo(t)).toBe(false));
  }
});

describe("origem nunca presumida", () => {
  const base = {
    origem: "Paranavaí",
    destino: "São Paulo",
    tipo_trecho: "somente_ida" as const,
    data_ida: "2099-01-10",
    data_informada_pelo_cliente: true,
    pax_informado_pelo_cliente: true,
    adultos: 1,
  };

  it("bloqueia pesquisa quando a origem não foi informada pelo cliente", () => {
    const r = validateFlightSearch({ ...base, origem_informada_pelo_cliente: false });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.faltam_dados).toBe(true);
      expect(r.campos).toContain("origem");
      expect(r.instrucao).toMatch(/embarcar/i);
    }
  });

  it("permite pesquisa quando o cliente informou a origem", () => {
    const r = validateFlightSearch({ ...base, origem_informada_pelo_cliente: true });
    expect(r.ok).toBe(true);
  });

  it("origem vazia continua bloqueando", () => {
    const r = validateFlightSearch({ ...base, origem: "", origem_informada_pelo_cliente: true });
    expect(r.ok).toBe(false);
  });
});
