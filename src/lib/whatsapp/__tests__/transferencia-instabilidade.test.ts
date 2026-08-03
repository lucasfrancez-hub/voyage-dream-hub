import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {} }));
vi.mock("../protocol-runtime.server", () => ({ logProtocolEvent: vi.fn() }));

import {
  MAX_RECOVERY_ATTEMPTS,
  classificarFalha,
  montarBriefingTransferencia,
} from "../transferencia-instabilidade.server";

const req = {
  id: "abc",
  origin: "CWB",
  destination: "Paris",
  destination_airport: "CDG",
  departure_date: "2026-09-10",
  return_date: "2026-09-20",
  trip_type: "roundtrip",
  adults: 2,
  children: 1,
  infants: 0,
  baggage_filter: true,
  direct_flight_filter: false,
  max_connections: 1,
  included_airlines: ["LATAM"],
  excluded_airlines: null,
  departure_time_preference: "manha",
  return_time_preference: null,
  pending_question: "confirm_origin",
  customer_nudge_count: 2,
  recovery_attempts: 2,
} as never;

describe("válvula de segurança — transferência por instabilidade", () => {
  it("classifica timeout, browserless e worker interrompido", () => {
    expect(classificarFalha(new Error("Request timed out after 30s"))).toBe("timeout_pesquisa");
    expect(classificarFalha(new Error("browserless connection refused"))).toBe("browserless_indisponivel");
    expect(classificarFalha(new Error("worker terminated"))).toBe("worker_interrompido");
    expect(classificarFalha(new Error("qualquer coisa"))).toBe("erro_interno_ferramenta");
  });

  it("limite de recuperação é 2 tentativas", () => {
    expect(MAX_RECOVERY_ATTEMPTS).toBe(2);
  });

  it("briefing traz origem, destino, datas, pax, bagagem, filtros e motivo", () => {
    const b = montarBriefingTransferencia({
      req,
      motivo: "timeout_pesquisa",
      pesquisasConcluidas: 1,
      pesquisasPendentes: 1,
    });
    expect(b).toContain("CWB");
    expect(b).toContain("Paris");
    expect(b).toContain("2026-09-10");
    expect(b).toContain("2 adulto(s)");
    expect(b).toContain("Bagagem despachada: SIM");
    expect(b).toContain("LATAM");
    expect(b).toContain("Pesquisas concluídas: 1");
    expect(b).toContain("Pesquisas pendentes: 1");
    expect(b).toContain("timeout na pesquisa");
    expect(b).toContain("IA pausada");
  });

  it("briefing funciona mesmo sem solicitação salva", () => {
    const b = montarBriefingTransferencia({ req: null, motivo: "reconciliador_falhou" });
    expect(b).toContain("não informada");
    expect(b).toContain("reconciliador");
  });
});
