import { describe, expect, it } from "vitest";
import { pareceNomeDePessoa, resolveOriginState } from "../src/lib/whatsapp/flight-origin-state";
import { parseCidadeLivre } from "../src/lib/whatsapp/short-answer";

describe("origem nunca pode ser nome de pessoa", () => {
  it("reconhece o nome do atendente mesmo com erro de digitação", () => {
    expect(pareceNomeDePessoa("Robertp")).toBe(true);
    expect(pareceNomeDePessoa("Camilla")).toBe(true);
    expect(pareceNomeDePessoa("Bruna", ["Bruno"])).toBe(true);
  });

  it("não confunde cidade de verdade com nome", () => {
    expect(pareceNomeDePessoa("Maringá")).toBe(false);
    expect(pareceNomeDePessoa("São Paulo")).toBe(false);
    expect(pareceNomeDePessoa("Curitiba")).toBe(false);
  });

  it("bloqueia o vocativo como origem confirmada", () => {
    const state = resolveOriginState({
      origin: "Robertp",
      inbound: [
        {
          id: "m1",
          content: "Robertp quero ver uma passagem para São Paulo dia 11/10",
          created_at: "2026-08-15T04:29:33Z",
        },
      ],
    });
    expect(state.status).toBe("missing");
  });

  it("continua aceitando cidade escrita pelo cliente", () => {
    const state = resolveOriginState({
      origin: "Maringá",
      inbound: [{ id: "m1", content: "saio de maringa", created_at: "2026-08-15T04:29:33Z" }],
    });
    expect(state.status).toBe("explicitly_informed");
  });

  it("parseCidadeLivre ignora nomes de pessoa", () => {
    expect(parseCidadeLivre("robertp")).toBeNull();
    expect(parseCidadeLivre("maringa")).toBe("Maringa");
  });
});
