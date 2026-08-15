import { describe, it, expect } from "vitest";
import {
  mentionsCityAsOrigin,
  pareceDestinoNaMensagem,
  pareceNomeDePessoa,
  resolveOriginState,
} from "../flight-origin-state";

describe("flight-origin-state", () => {
  describe("pareceDestinoNaMensagem", () => {
    it.each([
      ["quero uma passagem para São Paulo dia 11/10", "São Paulo"],
      ["voo pra São Paulo", "São Paulo"],
      ["até São Paulo", "São Paulo"],
      ["vou a São Paulo", "São Paulo"],
      ["passagem pro Rio de Janeiro", "Rio de Janeiro"],
      ["queremos ir para Curitiba", "Curitiba"],
      ["destino é Florianópolis", "Florianópolis"],
    ])("detecta destino: %s", (text, city) => {
      expect(pareceDestinoNaMensagem(text, city)).toBe(true);
    });

    it.each([
      ["quero de São Paulo para Recife", "São Paulo"],
      ["sou de São Paulo", "São Paulo"],
      ["voo de São Paulo", "São Paulo"],
      ["embarque em São Paulo", "São Paulo"],
      ["saio de Curitiba", "Curitiba"],
    ])("não confunde com origem: %s", (text, city) => {
      expect(pareceDestinoNaMensagem(text, city)).toBe(false);
    });
  });

  describe("mentionsCityAsOrigin", () => {
    it.each([
      ["quero uma passagem para São Paulo dia 11/10", "São Paulo"],
      ["passagem pro Rio de Janeiro", "Rio de Janeiro"],
    ])("rejeita cidade citada como destino: %s", (text, city) => {
      expect(mentionsCityAsOrigin(text, city)).toBe(false);
    });

    it.each([
      ["sou de Maringá", "Maringá"],
      ["quero de Londrina para São Paulo", "Londrina"],
      ["voo de Curitiba para Recife", "Curitiba"],
    ])("aceita cidade citada como origem: %s", (text, city) => {
      expect(mentionsCityAsOrigin(text, city)).toBe(true);
    });
  });

  describe("resolveOriginState", () => {
    it("não confirma destino como origem", () => {
      const inbound = [
        { id: "1", content: "quero uma passagem para São Paulo dia 11/10", created_at: "2026-08-15T01:46:38Z" },
      ];
      const state = resolveOriginState({ origin: "São Paulo", inbound });
      expect(state.status).toBe("missing");
      expect(state.origin).toBeNull();
    });

    it("confirma origem quando cliente diz explicitamente de onde embarca", () => {
      const inbound = [
        { id: "1", content: "quero uma passagem de Maringá para São Paulo dia 11/10", created_at: "2026-08-15T01:46:38Z" },
      ];
      const state = resolveOriginState({ origin: "Maringá", inbound });
      expect(state.status).toBe("explicitly_informed");
      expect(state.origin).toBe("Maringá");
    });
  });

  describe("pareceNomeDePessoa", () => {
    it.each(["Roberto", "Robertp", "Paula", "Bruno", "Giovani", "Lucas", "Camila"])(
      "rejeita nome de pessoa como cidade: %s",
      (name) => {
        expect(pareceNomeDePessoa(name)).toBe(true);
      },
    );

    it.each(["São Paulo", "Maringá", "Curitiba", "Londrina", "Recife"])(
      "aceita cidade real: %s",
      (city) => {
        expect(pareceNomeDePessoa(city)).toBe(false);
      },
    );
  });
});
