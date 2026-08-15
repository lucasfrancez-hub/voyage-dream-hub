import { describe, expect, it } from "vitest";
import {
  buildPricingFingerprint,
  calculatedAveragePerPerson,
  normalizeOccupancy,
  occupancyKey,
  occupancyLabel,
} from "@/lib/cruises/pricing-key";

const base = {
  cruiseId: "CRUISE_123",
  departureDate: "2026-11-08",
  cabinType: "varanda",
  cabinCategoryCodes: ["512", "510"],
  fareName: "MELHORES PROMOÇÕES",
};

describe("identidade comercial por ocupação (briefing 84-100)", () => {
  it("normaliza e soma a ocupação", () => {
    const occ = normalizeOccupancy({ adults: 2, children: 1, children_ages: [7, 3] });
    expect(occ.total).toBe(3);
    expect(occ.children_ages).toEqual([3, 7]);
  });

  it("1, 2, 3 e 4 adultos geram fingerprints diferentes", () => {
    const fps = [1, 2, 3, 4].map((adults) =>
      buildPricingFingerprint({ ...base, occupancy: { adults } }),
    );
    expect(new Set(fps).size).toBe(4);
  });

  it("mesma ocupação e mesma cabine geram o mesmo fingerprint, independente da ordem das categorias", () => {
    const a = buildPricingFingerprint({ ...base, occupancy: { adults: 2 } });
    const b = buildPricingFingerprint({
      ...base,
      cabinCategoryCodes: ["510", "512"],
      fareName: "melhores promoções",
      occupancy: { adults: 2, young: 0, children: 0, infants: 0 },
    });
    expect(a).toBe(b);
  });

  it("tarifa ou categoria diferentes mudam o fingerprint", () => {
    const a = buildPricingFingerprint({ ...base, occupancy: { adults: 2 } });
    expect(buildPricingFingerprint({ ...base, fareName: "TARIFA FLEX", occupancy: { adults: 2 } })).not.toBe(a);
    expect(buildPricingFingerprint({ ...base, cabinCategoryCodes: ["601"], occupancy: { adults: 2 } })).not.toBe(a);
  });

  it("occupancy_key separa adultos, jovens, crianças e bebês", () => {
    expect(occupancyKey({ adults: 2 })).toBe("a2-y0-c0-i0");
    expect(occupancyKey({ adults: 2, children: 1, children_ages: [9] })).toBe("a2-y0-c1-i0-9");
    expect(occupancyKey({ adults: 1 })).not.toBe(occupancyKey({ adults: 2 }));
  });

  it("média por pessoa é calculada e nunca substitui o preço individual", () => {
    expect(calculatedAveragePerPerson(12000, { adults: 2 })).toBe(6000);
    expect(calculatedAveragePerPerson(15000, { adults: 3 })).toBe(5000);
    expect(calculatedAveragePerPerson(10000, {})).toBeNull();
    expect(calculatedAveragePerPerson(null, { adults: 2 })).toBeNull();
  });

  it("rotula a ocupação em português", () => {
    expect(occupancyLabel({ adults: 1 })).toBe("1 adulto");
    expect(occupancyLabel({ adults: 2, children: 1 })).toBe("2 adultos + 1 criança");
  });
});
