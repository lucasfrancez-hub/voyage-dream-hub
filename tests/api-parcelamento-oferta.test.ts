/**
 * Tabela de parcelamento por oferta (regras VIA AIR):
 * sem juros até o teto da companhia; acima disso, markup cadastrado.
 */
import { describe, expect, it } from "vitest";
import { montarPlanoDeParcelamento } from "@/lib/api/installment-plan";

const markups = { 5: 6.08, 6: 7.12, 7: 8.16, 8: 9.21, 9: 10.26, 10: 11.33, 11: 12.39, 12: 19.98 };

describe("plano de parcelamento da oferta", () => {
  it("LATAM: 1x a 4x sem juros e 5x a 12x com markup", () => {
    const p = montarPlanoDeParcelamento({ total: 1000, airline: "LATAM Airlines", markups })!;
    expect(p.source).toBe("VIAAIR_RULES");
    expect(p.estimated).toBe(true);
    expect(p.maxInterestFree).toBe(4);
    expect(p.maxInstallments).toBe(12);
    const semJuros = p.options.filter((o) => o.interestFree).map((o) => o.installments);
    expect(semJuros).toEqual([1, 2, 3, 4]);
    const doze = p.options.find((o) => o.installments === 12)!;
    expect(doze.markupPercent).toBe(19.98);
    expect(doze.total).toBe(1199.8);
    expect(doze.installmentValue).toBe(99.98);
  });

  it("sem juros divide o valor exato, sem acréscimo", () => {
    const p = montarPlanoDeParcelamento({ total: 573.14, airline: "GOL", markups })!;
    const cinco = p.options.find((o) => o.installments === 5)!;
    expect(cinco.interestFree).toBe(true);
    expect(cinco.total).toBe(573.14);
    expect(cinco.installmentValue).toBe(114.63);
  });

  it("companhia sem parcelamento fica só à vista", () => {
    const p = montarPlanoDeParcelamento({ total: 5000, airline: "Korean Air", markups })!;
    expect(p.pixOnly).toBe(true);
    expect(p.options).toHaveLength(1);
    expect(p.options[0]!.installments).toBe(1);
  });

  it("valor inválido não gera tabela", () => {
    expect(montarPlanoDeParcelamento({ total: 0, airline: "GOL", markups })).toBeNull();
  });
});
