import { describe, it, expect } from "vitest";
import { origemRespondidaNoProtocolo } from "@/lib/whatsapp/airflow-guard";
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
});
