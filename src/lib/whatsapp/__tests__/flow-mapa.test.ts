import { describe, expect, it } from "vitest";
import { casarPalavrasChave, fluxoParaTexto, validarFluxo, type FlowNode } from "../flow";

const nodes: FlowNode[] = [
  { id: "a", position: { x: 0, y: 0 }, data: { titulo: "Aéreo", tipo: "intencao", setor: "aereo", descricao: "", keywords: ["passagem", "voo"] } },
  { id: "p", position: { x: 0, y: 100 }, data: { titulo: "Pacote", tipo: "intencao", setor: "consultoria", descricao: "", keywords: ["pacote", "pacote completo"] } },
];

describe("mapa de fluxo", () => {
  it("casa palavra-chave simples", () => {
    expect(casarPalavrasChave("quero uma passagem pra Lisboa", nodes)?.setor).toBe("aereo");
  });

  it("ignora acento e caixa", () => {
    expect(casarPalavrasChave("QUERO UM PACOTE", nodes)?.setor).toBe("consultoria");
  });

  it("prefere o gatilho mais específico", () => {
    const m = casarPalavrasChave("quero passagem e pacote completo", nodes);
    expect(m?.setor).toBe("consultoria");
  });

  it("não casa dentro de outra palavra", () => {
    expect(casarPalavrasChave("ele voou de raiva", nodes)).toBeNull();
  });

  it("vira texto pra IA com setor e gatilhos", () => {
    const t = fluxoParaTexto({ nome: "Fluxo", nodes, edges: [{ id: "e1", source: "a", target: "p" }] });
    expect(t).toContain("Aéreo");
    expect(t).toContain("gatilhos: passagem, voo");
    expect(t).toContain("segue para: Pacote");
  });

  it("acusa seta quebrada", () => {
    expect(validarFluxo(nodes, [{ id: "x", source: "a", target: "zzz" }])[0]).toContain("Seta x");
  });
});
