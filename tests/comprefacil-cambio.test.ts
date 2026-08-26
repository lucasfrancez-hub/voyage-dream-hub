import { describe, expect, it } from "vitest";
import { paraBRL, valorBRL } from "@/lib/comprefacil/cambio";

describe("câmbio CompreFácil", () => {
  it("converte moeda estrangeira pelo câmbio do payload", () => {
    expect(paraBRL(221.89, { moedaNet: { Sigla: "USD" }, moedaListagem: { Sigla: "BRL" }, taxa: 5.32 })).toBe(1180.45);
  });
  it("não converte quando já está em real", () => {
    expect(paraBRL(500, { moedaNet: { Sigla: "BRL" }, moedaListagem: { Sigla: "BRL" }, taxa: 5.32 })).toBe(500);
  });
  it("prefere o valor de listagem já em BRL", () => {
    expect(valorBRL({ MoedaNet: { Sigla: "EUR" }, MoedaListagem: { Sigla: "BRL" }, Taxa: 6, ValorListagem: 900, ValorVenda: 100 }, { listagem: [900], bruto: [100] })).toBe(900);
  });
  it("converte euro quando só há valor NET", () => {
    expect(valorBRL({ MoedaNet: { Sigla: "EUR" }, MoedaListagem: { Sigla: "BRL" }, Taxa: 6, ValorVenda: 100 }, { listagem: [undefined], bruto: [100] })).toBe(600);
  });
});
