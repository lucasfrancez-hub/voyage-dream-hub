import { describe, expect, it } from "vitest";
import {
  buildHotelSearchUrl,
  buildPackageSearchUrl,
  buildPropertyDetailUrl,
  dedupeResults,
  findPropertyNodes,
  normalizeDomCard,
  normalizePropertyNode,
  parseInstallments,
  parseMoney,
} from "@/lib/expedia/normalize";

describe("normalização Expedia TAAP", () => {
  it("monta a URL de pesquisa com adultos por quarto", () => {
    const url = buildHotelSearchUrl({
      destination: "Rio de Janeiro",
      startDate: "2026-03-10",
      endDate: "2026-03-14",
      rooms: 2,
      adults: 2,
    });
    expect(url).toContain("destination=Rio+de+Janeiro");
    expect(url).toContain("startDate=2026-03-10");
    expect(url).toContain("adults=2%2C2");
  });

  it("lê valores em pt-BR e en-US", () => {
    expect(parseMoney("R$ 1.234,56")).toBe(1234.56);
    expect(parseMoney("US$ 1,234.56")).toBe(1234.56);
    expect(parseMoney("indisponível")).toBeNull();
  });

  it("encontra e normaliza propriedades dentro do JSON da operadora", () => {
    const payload = {
      data: {
        propertySearch: {
          properties: [
            {
              id: "12345",
              name: "Hotel Copacabana",
              price: {
                lead: { amount: 480.5, currency: "BRL" },
                displayMessages: [{ lineItems: [{ price: { formatted: "R$ 480,50" } }] }],
              },
              reviews: { score: 9.2, total: 1200 },
              propertyImage: { image: { url: "//img.expedia.com/a.jpg" } },
              destinationInfo: { regionName: "Copacabana" },
              star: 4,
            },
          ],
        },
      },
    };
    const nodes = findPropertyNodes(payload);
    expect(nodes).toHaveLength(1);
    const hotel = normalizePropertyNode(nodes[0], "s1");
    expect(hotel).toMatchObject({
      property_id: "12345",
      name: "Hotel Copacabana",
      review_score: 9.2,
      review_count: 1200,
      rating: 4,
      available: true,
    });
    expect(hotel?.price.nightly).toBe(480.5);
    expect(hotel?.image).toBe("https://img.expedia.com/a.jpg");
  });

  it("normaliza card do DOM e marca esgotado", () => {
    const hotel = normalizeDomCard(
      {
        propertyId: null,
        name: "Pousada Sol",
        image: "/img/b.jpg",
        href: "/Hotel-Search?x=1",
        priceText: "R$ 320,00",
        totalText: "R$ 960,00",
        reviewText: "8,6 (340 avaliações)",
        starText: "3 estrelas",
        locationText: "Centro",
        soldOut: true,
      },
      null,
    );
    expect(hotel?.price.nightly).toBe(320);
    expect(hotel?.price.total).toBe(960);
    expect(hotel?.price.currency).toBe("BRL");
    expect(hotel?.available).toBe(false);
    expect(hotel?.detail_url).toContain("https://www.expediataap.com.br/Hotel-Search");
  });

  it("remove duplicados mantendo o registro mais completo", () => {
    const base = {
      source: "EXPEDIA_TAAP" as const,
      search_id: null,
      property_id: "1",
      name: "Hotel X",
      destination: null,
      image: null,
      rating: null,
      review_score: null,
      review_count: null,
      price: { currency: null, nightly: null, total: null },
      detail_url: null,
      available: true,
    };
    const out = dedupeResults([
      base,
      { ...base, image: "https://x/a.jpg", price: { currency: "BRL", nightly: 100, total: 300 } },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].price.nightly).toBe(100);
  });
});

describe("URLs reais do TAAP", () => {
  const base = {
    destination: "Maringá, Paraná, Brasil",
    startDate: "2026-08-28",
    endDate: "2026-08-29",
    rooms: 1,
    adults: 2,
    regionId: "2279",
    latLong: "-23.420999,-51.933056",
  };

  it("monta pesquisa standalone sem valores fixos", () => {
    const url = new URL(buildHotelSearchUrl(base));
    expect(url.origin).toBe("https://www.expediataap.com.br");
    expect(url.searchParams.get("rate_type")).toBe("standalone");
    expect(url.searchParams.get("d1")).toBe("2026-08-28");
    expect(url.searchParams.get("regionId")).toBe("2279");
    const outro = new URL(buildHotelSearchUrl({ ...base, destination: "Recife", regionId: null, latLong: null }));
    expect(outro.searchParams.get("destination")).toBe("Recife");
    expect(outro.searchParams.get("regionId")).toBeNull();
  });

  it("monta pacote voo+hotel e nunca inventa misId", () => {
    const url = new URL(
      buildPackageSearchUrl({ ...base, origin: "Aeroporto Regional Silvio Name Junior (MGF), Brasil" }),
    );
    expect(url.searchParams.get("packageType")).toBe("fh");
    expect(url.searchParams.get("searchProduct")).toBe("hotel");
    expect(url.searchParams.get("tripType")).toBe("ROUND_TRIP");
    expect(url.searchParams.get("cabinClass")).toBe("COACH");
    expect(url.searchParams.get("misId")).toBeNull();
    const comMis = new URL(buildPackageSearchUrl({ ...base, misId: "AgiKgOGZ" }));
    expect(comMis.searchParams.get("misId")).toBe("AgiKgOGZ");
  });

  it("preserva a URL de detalhe vinda da listagem", () => {
    const url = new URL(
      buildPropertyDetailUrl({
        propertyId: "48019",
        detailUrl: "https://www.expediataap.com.br/Maringa-Hoteis-Hotel-Deville.h48019.Hotel-Reservas",
        startDate: "2026-08-28",
        endDate: "2026-08-29",
        rooms: 1,
        adults: 2,
        searchId: "79472168",
      }),
    );
    expect(url.pathname).toContain("h48019");
    expect(url.searchParams.get("chkin")).toBe("2026-08-28");
    expect(url.searchParams.get("rm1")).toBe("a2");
    expect(url.searchParams.get("searchId")).toBe("79472168");
  });

  it("lê parcelamento apenas do que a página informa", () => {
    expect(parseInstallments(["sem parcelas"])).toBeNull();
    const p = parseInstallments(["em 10x de R$ 250,00"]);
    expect(p?.max_installments).toBe(10);
    expect(p?.plans[0].amount).toBe(250);
  });
});
