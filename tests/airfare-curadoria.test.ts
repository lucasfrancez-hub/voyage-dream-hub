import { describe, expect, it } from "vitest";
import { curateOrigin, type CurationInput } from "@/lib/airfare-promos.curation";
import { NATIONAL_DESTINATION_EXCLUSIONS } from "@/lib/airfare-promos.config";

function cand(p: Partial<CurationInput> & { destination_iata: string }): CurationInput {
  return {
    signature: `${p.origin_iata ?? "MGF"}-${p.destination_iata}-${p.departure_date ?? "2026-05-10"}`,
    scope: p.scope ?? "nacional",
    origin_iata: p.origin_iata ?? "MGF",
    destination_iata: p.destination_iata,
    destination_city: p.destination_city ?? null,
    departure_date: p.departure_date ?? "2026-05-10",
    return_date: p.return_date ?? "2026-05-17",
    reference_price: p.reference_price ?? 900,
  };
}

describe("curadoria nacional", () => {
  it("exclui VCP, GRU, CGH, CWB e POA como destino", () => {
    const lista = ["VCP", "GRU", "CGH", "CWB", "POA"].map((d) =>
      cand({ destination_iata: d, reference_price: 300 }),
    );
    const res = curateOrigin("MGF", lista, 10);
    expect(res.selected).toHaveLength(0);
    expect(res.decisions.every((d) => d.status === "excluida")).toBe(true);
    for (const d of ["VCP", "GRU", "CGH", "CWB", "POA"]) {
      expect(NATIONAL_DESTINATION_EXCLUSIONS.has(d)).toBe(true);
    }
  });

  it("aplica a composição por categoria (até 4 NE, 2 Rio, 1 N/CO, 3 flexíveis)", () => {
    const excluidos = ["VCP", "GRU", "CGH", "CWB", "POA"].map((d, i) =>
      cand({ destination_iata: d, reference_price: 200 + i }),
    );
    const validos = ["REC", "MCZ", "SSA", "FOR", "NAT", "JPA", "GIG", "FLN", "CNF", "SLZ", "AJU"].map(
      (d, i) => cand({ destination_iata: d, reference_price: 700 + i * 10 }),
    );
    const res = curateOrigin("MGF", [...excluidos, ...validos], 10);
    const destinos = res.selected.map((c) => c.destination_iata);
    const nordeste = destinos.filter((d) =>
      ["REC", "MCZ", "SSA", "FOR", "NAT", "JPA", "SLZ", "AJU"].includes(d),
    );
    expect(nordeste.length).toBeLessThanOrEqual(4);
    expect(destinos.filter((d) => ["GIG", "SDU", "RIO"].includes(d)).length).toBeLessThanOrEqual(2);
    expect(res.selected.length).toBeLessThanOrEqual(10);
    expect(res.selected.some((c) => NATIONAL_DESTINATION_EXCLUSIONS.has(c.destination_iata))).toBe(false);
    expect(res.excluded).toBe(5);
  });

  it("não completa a cota com rota fraca: publica só o que é bom", () => {
    const fracas = ["REC", "MCZ", "SSA", "FOR", "NAT"].map((d) =>
      cand({ destination_iata: d, reference_price: 2400 }),
    );
    const boa = cand({ destination_iata: "JPA", reference_price: 700 });
    const res = curateOrigin("MGF", [...fracas, boa], 10);
    expect(res.selected).toHaveLength(1);
    expect(res.selected[0]!.destination_iata).toBe("JPA");
  });

  it("prefere destinos de lazer/Nordeste em preços equivalentes", () => {
    const res = curateOrigin(
      "MGF",
      [
        cand({ destination_iata: "BSB", reference_price: 900 }),
        cand({ destination_iata: "MCZ", reference_price: 900 }),
      ],
      1,
    );
    expect(res.selected[0]!.destination_iata).toBe("MCZ");
  });

  it("limita repetição do mesmo destino a 2 e só com justificativa", () => {
    const lista = [
      cand({ destination_iata: "REC", departure_date: "2026-05-10", reference_price: 700 }),
      cand({ destination_iata: "REC", departure_date: "2026-05-12", reference_price: 705 }), // sem justificativa
      cand({ destination_iata: "REC", departure_date: "2026-09-12", reference_price: 900 }), // outro período
      cand({ destination_iata: "REC", departure_date: "2026-11-12", reference_price: 950 }), // 3ª, barrada
    ];
    const res = curateOrigin("MGF", lista, 10);
    expect(res.selected.filter((c) => c.destination_iata === "REC")).toHaveLength(2);
  });
});

describe("curadoria internacional", () => {
  const intl = (d: string, price: number) =>
    cand({ scope: "internacional", origin_iata: "GRU", destination_iata: d, reference_price: price });

  it("respeita a distribuição preferencial por região", () => {
    const lista = [
      intl("LIS", 2600), intl("MAD", 2700), intl("CDG", 2800), intl("FCO", 2900), intl("AMS", 3000),
      intl("MIA", 2400), intl("JFK", 2500), intl("MCO", 2550), intl("LAX", 2900),
      intl("EZE", 1300), intl("SCL", 1500), intl("BOG", 1700),
      intl("CUN", 2400), intl("MEX", 2600),
    ];
    const res = curateOrigin("GRU", lista, 10);
    const regiao = (d: string) =>
      ["LIS", "MAD", "CDG", "FCO", "AMS"].includes(d)
        ? "europa"
        : ["MIA", "JFK", "MCO", "LAX"].includes(d)
          ? "eua"
          : ["EZE", "SCL", "BOG"].includes(d)
            ? "sul"
            : "caribe";
    const conta = res.selected.reduce<Record<string, number>>((acc, c) => {
      const r = regiao(c.destination_iata);
      acc[r] = (acc[r] ?? 0) + 1;
      return acc;
    }, {});
    expect(conta.europa).toBeGreaterThanOrEqual(3);
    expect(conta.eua).toBeGreaterThanOrEqual(2);
    expect(conta.sul).toBeGreaterThanOrEqual(2);
    expect(conta.caribe).toBeGreaterThanOrEqual(1);
    expect(res.selected).toHaveLength(10);
  });

  it("aceita Ásia/África apenas como oportunidade excepcional", () => {
    const caro = curateOrigin("GRU", [intl("BKK", 5500)], 5);
    expect(caro.selected).toHaveLength(0);
    const excepcional = curateOrigin("GRU", [intl("BKK", 3200)], 5);
    expect(excepcional.selected).toHaveLength(1);
  });

  it("flexíveis internacionais só entram com tarifa excepcional", () => {
    const lista = [
      intl("LIS", 2600), intl("MAD", 2700), intl("CDG", 2800), intl("FCO", 2850),
      intl("BCN", 2900), intl("OPO", 2950), intl("ATH", 3000),
      intl("EZE", 1300), intl("SCL", 1500),
    ];
    const res = curateOrigin("GRU", lista, 9);
    // 3 Europa (cota) + 2 América do Sul (cota) + até 2 flexíveis excepcionais
    expect(res.selected.length).toBeLessThanOrEqual(7);
    expect(res.selected.length).toBeGreaterThanOrEqual(5);
  });
});
