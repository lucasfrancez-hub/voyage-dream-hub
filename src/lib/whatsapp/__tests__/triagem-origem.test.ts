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

  it("flag ausente (undefined) bloqueia — origem só passa com confirmação explícita", () => {
    const r = validateFlightSearch({ ...base });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.campos).toContain("origem");
  });

  it("instrução proíbe usar origem de pacote pronto como origem do aéreo", () => {
    const r = validateFlightSearch({ ...base, origem_informada_pelo_cliente: false });
    if (!r.ok) expect(r.instrucao).toMatch(/pacote pronto/i);
  });
});

describe("separação de regras de origem: pacote x aéreo", () => {
  it("prompt dos Consultores trata origem alternativa como oferta do catálogo", async () => {
    const { CAMILA_SYSTEM_PROMPT } = await import("../../chat/camila-prompt");
    expect(CAMILA_SYSTEM_PROMPT).toMatch(/ORIGEM ALTERNATIVA É OFERTA DO CATÁLOGO/i);
    expect(CAMILA_SYSTEM_PROMPT).toMatch(/substituir silenciosamente/i);
  });

  it("prompt da Central proíbe origem alternativa no aéreo", async () => {
    const { buildCentralBasePrompt } = await import("../central-especialistas.server");
    const p = buildCentralBasePrompt("paula", "f");
    expect(p).toMatch(/NÃO EXISTE "ORIGEM ALTERNATIVA" NO AÉREO/i);
    expect(p).toMatch(/nunca troque Maringá por Curitiba/i);
  });
});

describe("normalização humana do atendimento", () => {
  it("obriga todos os consultores a responder se estão bem também", async () => {
    const { CAMILA_SYSTEM_PROMPT } = await import("../../chat/camila-prompt");
    expect(CAMILA_SYSTEM_PROMPT).toMatch(/Tô bem também/i);
    expect(CAMILA_SYSTEM_PROMPT).toMatch(/nunca responda só "sim"/i);
  });

  it("obriga o setor aéreo a se apresentar antes de coletar dados", async () => {
    const { buildCentralBasePrompt } = await import("../central-especialistas.server");
    const prompt = buildCentralBasePrompt("Bruno", "m");
    expect(prompt).toMatch(/APRESENTAÇÃO OBRIGATÓRIA/i);
    expect(prompt).toMatch(/Sou o Bruno, do setor aéreo da VIA AIR/i);
    expect(prompt).toMatch(/tá bem também/i);
  });
});
