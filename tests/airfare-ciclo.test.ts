import { describe, expect, it } from "vitest";
import {
  curationDay,
  diffFare,
  fitCandidateTimeoutToBudget,
} from "@/lib/airfare-promos.worker.server";
import { datesProgress } from "@/lib/airfare-promos.discovery.server";

const base = {
  total_price: 1180,
  airline_iata: "LA",
  outbound_fare_id: "f1",
  inbound_fare_id: null,
  outbound_itinerary_id: "i1",
  inbound_itinerary_id: null,
  stops: 0,
  has_checked_baggage: false,
  interest_free_installments: 6,
  interest_free_installment_value: 196.67,
};

describe("ciclo 06h x 12h", () => {
  it("sem alteração", () => expect(diffFare(base, { ...base })).toEqual([]));
  it("preço", () => expect(diffFare(base, { ...base, total_price: 1029 })).toContain("price"));
  it("companhia", () => expect(diffFare(base, { ...base, airline_iata: "G3" })).toContain("airline"));
  it("voo e tarifa", () => {
    const d = diffFare(base, { ...base, outbound_fare_id: "f2", outbound_itinerary_id: "i2" });
    expect(d).toEqual(expect.arrayContaining(["fare_id", "flight"]));
  });
  it("bagagem e parcelamento", () => {
    const d = diffFare(base, { ...base, has_checked_baggage: true, interest_free_installments: 10 });
    expect(d).toEqual(expect.arrayContaining(["baggage", "installment"]));
  });
  it("dia BRT no formato ISO", () => expect(curationDay(new Date("2026-08-13T02:00:00Z"))).toBe("2026-08-12"));
});

describe("orçamento do worker autônomo", () => {
  it("reduz o timeout nominal para caber numa invocação de 100s", () => {
    expect(fitCandidateTimeoutToBudget(135_000, 100_000)).toBe(75_000);
  });

  it("não reserva candidata quando nem a janela operacional mínima cabe", () => {
    expect(fitCandidateTimeoutToBudget(110_000, 84_999)).toBeNull();
  });
});

describe("checkpoint de datas reais", () => {
  it("preserva o total e retoma da próxima oportunidade pendente", () => {
    const pendingLeads = Array.from({ length: 17 }, (_, i) => ({ signature: `rota-${i}` }));
    expect(datesProgress({ pendingLeads: pendingLeads as never, datesTotal: 55, datesDone: 38 })).toEqual({
      done: 38,
      total: 55,
    });
  });

  it("recupera o progresso de checkpoints antigos sem voltar a zero", () => {
    const pendingLeads = Array.from({ length: 16 }, (_, i) => ({ signature: `rota-${i}` }));
    expect(datesProgress({ pendingLeads: pendingLeads as never, datesTotal: 20 })).toEqual({
      done: 4,
      total: 20,
    });
  });
});
