import { describe, expect, it } from "vitest";
import {
  CONTORNO_PADRAO,
  CONTORNO_PRESETS,
  aplicarPreset,
  normalizarContorno,
} from "@/lib/editair/contorno";
import { chaveMascara, VERSAO_MODELO } from "@/lib/editair/mask-cache";

describe("contorno do recorte", () => {
  it("a V1 entrega os presets combinados", () => {
    const v1 = CONTORNO_PRESETS.filter((p) => p.v1).map((p) => p.id);
    expect(v1).toEqual(["nenhum", "solido", "papel", "luminescencia", "desenho", "sombra"]);
  });

  it("normaliza contorno antigo ({ativo}) para preset", () => {
    expect(normalizarContorno({ ativo: true, cor: "#fff", largura: 4 }).preset).toBe("solido");
    expect(normalizarContorno(undefined).preset).toBe("nenhum");
  });

  it("aplicar preset preserva ajustes manuais fora do patch", () => {
    const base = { ...CONTORNO_PADRAO, deslocX: 40, opacidade: 55 };
    const solido = aplicarPreset(base, "solido");
    expect(solido.preset).toBe("solido");
    expect(solido.deslocX).toBe(40);
    expect(solido.opacidade).toBe(55);
  });

  it("trocar a cor do traço não muda a chave do cache da máscara", () => {
    const a = chaveMascara("asset-1", "rapida", 42);
    const b = chaveMascara("asset-1", "rapida", 42);
    expect(a).toBe(b);
    expect(a).toContain(VERSAO_MODELO);
    expect(chaveMascara("asset-1", "alta", 42)).not.toBe(a);
  });
});
