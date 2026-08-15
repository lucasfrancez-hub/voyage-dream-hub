import { describe, it, expect } from "vitest";
import { origemRespondidaNoProtocolo } from "@/lib/whatsapp/airflow-guard";
import { resolveOriginState, mentionsCityAsOrigin, pareceDestinoNaMensagem } from "@/lib/whatsapp/flight-origin-state";

describe("origem", () => {
  it("lê Maringa como resposta", () => {
    expect(origemRespondidaNoProtocolo({
      outbound: [{ content: "De qual cidade você pretende embarcar?", created_at: "2026-08-15T03:26:00Z" }],
      inbound: [{ content: "Maringa", created_at: "2026-08-15T03:26:30Z" }],
    })).toMatch(/Maringa/i);
  });
  it("ignora sim isolado sem sugestão", () => {
    expect(origemRespondidaNoProtocolo({
      outbound: [{ content: "De qual cidade você pretende embarcar?", created_at: "2026-08-15T03:26:00Z" }],
      inbound: [{ content: "sim", created_at: "2026-08-15T03:26:30Z" }],
    })).toBeNull();
  });

  it("não confirma destino como origem", () => {
    const state = resolveOriginState({
      origin: "São Paulo",
      inbound: [
        { id: "m1", content: "quero ver uma passagem para São Paulo dia 11/10", created_at: "2026-08-15T03:26:00Z" },
      ],
    });
    expect(state.status).toBe("missing");
  });

  it("detecta cidade citada como destino", () => {
    expect(pareceDestinoNaMensagem("passagem para São Paulo", "São Paulo")).toBe(true);
    expect(mentionsCityAsOrigin("passagem para São Paulo", "São Paulo")).toBe(false);
  });

  it("mantém cidade de origem quando usada com saída", () => {
    expect(pareceDestinoNaMensagem("quero de Maringá para São Paulo", "Maringá")).toBe(false);
    expect(mentionsCityAsOrigin("quero de Maringá para São Paulo", "Maringá")).toBe(true);
  });
});
