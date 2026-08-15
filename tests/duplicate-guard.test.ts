import { describe, expect, it } from "vitest";
import { isDuplicateText, normalizeForDuplicate } from "@/lib/whatsapp/duplicate-guard.server";

describe("trava de mensagem duplicada", () => {
  it("ignora acento, pontuação e prefixo do agente", () => {
    expect(normalizeForDuplicate("Bruno: De qual cidade você pretende embarcar?")).toBe(
      normalizeForDuplicate("de qual cidade voce pretende embarcar"),
    );
  });

  it("bloqueia a mesma pergunta repetida", () => {
    const anteriores = ["Bruno: De qual cidade você pretende embarcar?", "Oi, Lucas! Tudo bem?"];
    expect(isDuplicateText("De qual cidade voce pretende embarcar?", anteriores)).toBe(true);
  });

  it("libera mensagem nova", () => {
    const anteriores = ["De qual cidade você pretende embarcar?"];
    expect(isDuplicateText("Qual a data da ida?", anteriores)).toBe(false);
  });

  it("não trava confirmações curtas", () => {
    expect(isDuplicateText("Perfeito!", ["Perfeito!"])).toBe(false);
  });
});
