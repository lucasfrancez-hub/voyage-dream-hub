import { describe, it, expect } from "vitest";
import { avaliarBoleto, REGRAS_BOLETO_PROMPT } from "@/lib/whatsapp/boleto-regras";

describe("elegibilidade de boleto parcelado", () => {
  it("viagem com menos de 60 dias não é elegível", () => {
    const r = avaliarBoleto("hotel_mais_aereo", 45);
    expect(r.elegivel).toBe(false);
    expect(r.modalidade).toBe("nenhuma");
  });

  it("somente aéreo é sempre pré-pago, quitando até 30 dias antes", () => {
    const r = avaliarBoleto("somente_aereo", 90);
    expect(r.modalidade).toBe("pre_pago");
    expect(r.parcelasPosViagem).toBe(false);
    expect(r.quitarAteDiasAntes).toBe(30);
  });

  it("hotel + aéreo pode solicitar pós-viagem com análise de crédito", () => {
    const r = avaliarBoleto("hotel_mais_aereo", 120);
    expect(r.modalidade).toBe("pre_pago_ou_pos_viagem");
    expect(r.parcelasPosViagem).toBe(true);
    expect(r.exigeAnaliseCredito).toBe(true);
  });

  it("exatamente 60 dias é elegível", () => {
    expect(avaliarBoleto("somente_aereo", 60).elegivel).toBe(true);
  });

  it("produto indefinido não promete modalidade", () => {
    const r = avaliarBoleto("indefinido", 90);
    expect(r.parcelasPosViagem).toBe(false);
    expect(r.motivo).toMatch(/não definido/i);
  });
});

describe("bloco de prompt", () => {
  it("contém as travas obrigatórias", () => {
    expect(REGRAS_BOLETO_PROMPT).toMatch(/60 dias/);
    expect(REGRAS_BOLETO_PROMPT).toMatch(/30 dias antes/);
    expect(REGRAS_BOLETO_PROMPT).toMatch(/análise de crédito/);
    expect(REGRAS_BOLETO_PROMPT).toMatch(/PROIBIDO garantir aprovação/);
  });
});
