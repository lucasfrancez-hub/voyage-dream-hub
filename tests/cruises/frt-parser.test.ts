/**
 * FRTKroozeCruiseParser — testes sobre HTML real (fixtures) da FRT/Krooze.
 * Regra mestra: nunca limitar quantidade, nunca depender de ID Angular.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

type ParserApi = {
  PARSER_NAME: string;
  PARSER_VERSION: string;
  FRT_SELECTORS: Record<string, string[]>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  createParser: (doc: Document, options?: Record<string, unknown>) => any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  helpers: any;
};

let P: ParserApi;

const parserPath = fileURLToPath(new URL("../../extension-cruzeiros/frt-parser.js", import.meta.url));
const fixturePath = (name: string) =>
  fileURLToPath(new URL(`../fixtures/frt/${name}`, import.meta.url));

function loadFixture(name: string) {
  const dom = new JSDOM(readFileSync(fixturePath(name), "utf8"), {
    url: "https://www.krooze.com.br/checkout",
  });
  return dom.window.document as unknown as Document;
}

function parserFor(name: string) {
  const doc = loadFixture(name);
  return P.createParser(doc, { url: "https://www.krooze.com.br/checkout" });
}

beforeAll(() => {
  const code = readFileSync(parserPath, "utf8");
  const mod: { exports: Record<string, unknown> } = { exports: {} };
  new Function("module", "exports", code)(mod, mod.exports);
  P = mod.exports as unknown as ParserApi;
});

describe("helpers", () => {
  it("parses BRL values correctly", () => {
    const { moneyToNumber } = P.helpers;
    expect(moneyToNumber("R$ 16.656,00")).toBe(16656);
    expect(moneyToNumber("R$ 720,00")).toBe(720);
    expect(moneyToNumber("R$ 1.920,00")).toBe(1920);
    expect(moneyToNumber("R$\u00a0179,00")).toBe(179);
    expect(moneyToNumber("")).toBeNull();
    expect(moneyToNumber(null)).toBeNull();
  });

  it("normalizes dates and profiles", () => {
    expect(P.helpers.normalizeDate("29/12/2026")).toBe("2026-12-29");
    expect(P.helpers.normalizePassengerProfile("por criança")).toBe("child");
    expect(P.helpers.normalizePassengerProfile("por bebê")).toBe("infant");
    expect(P.helpers.normalizePassengerProfile("por jovem")).toBe("young");
    expect(P.helpers.normalizePassengerProfile("por adulto")).toBe("adult");
  });

  it("is versioned", () => {
    expect(P.PARSER_NAME).toBe("FRTKroozeCruiseParser");
    expect(P.PARSER_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

describe("selector map", () => {
  it("never relies on Angular ids or _ngcontent attributes", () => {
    const all = JSON.stringify(P.FRT_SELECTORS);
    expect(all).not.toMatch(/ngb-nav-\d+/);
    expect(all).not.toMatch(/_ngcontent/);
    expect(all).not.toMatch(/_nghost/);
    expect(all).not.toMatch(/nth-child|first-child/);
  });
});

describe("checkout", () => {
  it("identifies the checkout page", () => {
    expect(parserFor("checkout-interna.html").detectPageType()).toBe("checkout");
    expect(parserFor("checkout-interna.html").detectContent()).toEqual(
      expect.arrayContaining(["cruise_summary", "cabin_types", "cabin_categories", "prices", "insurance"]),
    );
  });

  it("reads the price summary", () => {
    const summary = parserFor("checkout-interna.html").parsePriceSummary();
    expect(summary.cruise.name).toBe("Réveillon em alto Mar 26/27");
    expect(summary.cruise.departure_date).toBe("2026-12-29");
    expect(summary.cruise.nights).toBe(4);
    expect(summary.cruise.embark_port).toBe("Santos, Brasil");
    expect(summary.cruise.disembark_port).toBe("Santos, Brasil");
    expect(summary.occupancy.passengers).toBe(1);
    expect(summary.pricing.fare_name).toBe("MELHORES PROMOÇÕES");
    expect(summary.pricing.total).toBe(16656);
    expect(summary.pricing.taxes).toBe(1800);
    expect(summary.pricing.passengers).toEqual([{ label: "Passageiro 1", value: 14856 }]);
    expect(summary.pricing.installment).toMatchObject({
      has_entry: true,
      installments: 12,
      interest_free: true,
    });
  });

  it("reads cabin types with background images and upgrades", () => {
    const types = parserFor("checkout-interna.html").parseCabinTypes();
    expect(types).toHaveLength(2);
    expect(types[0]).toMatchObject({ type: "interna", source_name: "Interna", selected: true });
    expect(types[0].image_url).toContain("/img/interna.jpg");
    expect(types[1]).toMatchObject({ type: "varanda", upgrade: 1920, selected: false });
    expect(types[1].image_url).toContain("/img/varanda.jpg");
  });

  it("extracts every cabin category, single and multiple codes", () => {
    const cats = parserFor("checkout-interna.html").parseVisibleCabinCategories("Interna");
    expect(cats).toHaveLength(2);
    expect(cats[0]).toMatchObject({ name: "Interna - Garantida", codes: ["512"], selected: true });
    expect(cats[1]).toMatchObject({
      name: "Interna Superior",
      codes: ["222", "223", "224"],
      upgrade: 720,
      selected: false,
    });
    expect(cats[0].image_url).toContain("/img/interna-garantida.jpg");
  });

  it("extracts every amenity card", () => {
    const cats = parserFor("checkout-interna.html").parseVisibleCabinCategories("Interna");
    expect(cats[0].amenities.map((a: { name: string }) => a.name)).toEqual([
      "Refeições",
      "Não escolhe cabine",
      "Show Inclusos",
    ]);
    expect(cats[1].amenities.map((a: { name: string }) => a.name)).toContain("Cabine Melhor Localizada");
  });

  it("extracts the insurance separately from additionals", () => {
    const [insurance] = parserFor("checkout-interna.html").parseInsurances();
    expect(insurance.name).toContain("SEGURO HERO");
    expect(insurance.price_per_person).toBe(179);
    expect(insurance.coverage_url).toContain("/cobertura/hero-nacional.pdf");
  });

  it("does not limit cabin quantity", () => {
    const base = readFileSync(fixturePath("checkout-interna.html"), "utf8");
    const block = `
      <div class="cabin-type-detail">
        <div class="cabin-description__infos">
          <span class="name">Suíte @@</span><span class="category">Categoria: 9@@</span>
        </div>
      </div>`;
    const many = Array.from({ length: 25 }, (_, i) => block.replace(/@@/g, String(i + 1))).join("");
    const html = base.replace(
      '<div class="container-cabin-type-detail">',
      `<div class="container-cabin-type-detail">${many}`,
    );
    const dom = new JSDOM(html, { url: "https://www.krooze.com.br/checkout" });
    const parser = P.createParser(dom.window.document as unknown as Document);
    const cats = parser.parseVisibleCabinCategories("Suíte");
    expect(cats).toHaveLength(27);
    expect(cats.filter((c: { type: string }) => c.type === "suite")).toHaveLength(27);
  });

  it("warns instead of failing when the total is missing", () => {
    const html = readFileSync(fixturePath("checkout-interna.html"), "utf8").replace(
      '<span class="price">R$ 16.656,00</span>',
      "<span></span>",
    );
    const dom = new JSDOM(html, { url: "https://www.krooze.com.br/checkout" });
    const parser = P.createParser(dom.window.document as unknown as Document);
    const summary = parser.parsePriceSummary();
    expect(summary.pricing.total).toBeNull();
    expect(summary.cruise.name).toBe("Réveillon em alto Mar 26/27");
    expect(parser.warnings).toContain("pricing.total não detectado");
  });

  it("falls back to document.title for the cruise name", () => {
    const html = readFileSync(fixturePath("checkout-interna.html"), "utf8")
      .replace("<h2>Réveillon em alto Mar 26/27</h2>", "<h2></h2>")
      .replace("<body>", "<head><title>Cruzeiro Krooze</title></head><body>");
    const dom = new JSDOM(html, { url: "https://www.krooze.com.br/checkout" });
    const parser = P.createParser(dom.window.document as unknown as Document);
    expect(parser.parsePriceSummary().cruise.name).toBe("Cruzeiro Krooze");
    const nameLog = parser.logs.find((l: { field: string }) => l.field === "cruise.name");
    expect(nameLog.confidence).toBeLessThan(1);
  });
});

describe("additionals modal", () => {
  it("detects the modal without using ngb ids", () => {
    expect(parserFor("additional-modal.html").detectPageType()).toBe("additionals");
  });

  it("extracts every option with name, code and prices by profile", () => {
    const additionals = parserFor("additional-modal.html").parseAdditionals("Transfers");
    expect(additionals).toHaveLength(3);

    const [first] = additionals;
    expect(first.name).toBe("Transfer ida e volta - GUARULHOS > SANTOS - 11h");
    expect(first.code).toBe("2TRANSFERINOUTGRU11");
    expect(first.category).toBe("Transfers");
    expect(first.prices).toEqual([
      { profile: "adult", source_label: "por adulto", value: 350 },
      { profile: "young", source_label: "por jovem", value: 350 },
      { profile: "child", source_label: "por criança", value: 350 },
    ]);

    expect(additionals[1].prices.map((p: { profile: string }) => p.profile)).toEqual(["adult", "infant"]);
    expect(additionals[2].code).toBe("2PARKSANTOS5");
  });

  it("never invents an image when the holder is empty", () => {
    const [first] = parserFor("additional-modal.html").parseAdditionals("Transfers");
    expect(first.image_url).toBe("");
  });

  it("exposes all side-nav tabs by text", () => {
    const doc = loadFixture("additional-modal.html");
    const names = [...doc.querySelectorAll(".side-nav__item .span-icon-name")].map((el) =>
      (el.textContent || "").trim(),
    );
    expect(names).toEqual(["Outros", "Seguro", "Transfers"]);
  });

  it("does not limit the number of additionals", () => {
    const base = readFileSync(fixturePath("additional-modal.html"), "utf8");
    const block = `
      <button class="list-options__option">
        <div class="description"><div class="description__text"><h3>Adicional @@ <span>(COD@@)</span></h3></div></div>
        <div class="prices"><div class="prices__item"><span class="price">R$ 10,00</span><span>por adulto</span></div></div>
      </button>`;
    const many = Array.from({ length: 50 }, (_, i) => block.replace(/@@/g, String(i + 1))).join("");
    const dom = new JSDOM(base.replace('<div class="list-options">', `<div class="list-options">${many}`), {
      url: "https://www.krooze.com.br/checkout",
    });
    const parser = P.createParser(dom.window.document as unknown as Document);
    expect(parser.parseAdditionals("Transfers")).toHaveLength(53);
  });
});

describe("ship details", () => {
  it("parses the itinerary with labelled times", () => {
    const days = parserFor("ship-details.html").parseItinerary();
    expect(days).toHaveLength(5);
    expect(days[0]).toMatchObject({ day: 1, date: "2026-12-29", port: "Santos", departure: "19:00" });
    expect(days[2]).toMatchObject({ day: 3, port: "Búzios", arrival: "08:00", departure: "18:00" });
    expect(days[0].map_image_url).toContain("/img/mapa-roteiro.png");
  });

  it("parses the technical sheet and the technical drawing", () => {
    const sheet = parserFor("ship-details.html").parseTechnicalSheet();
    expect(sheet.specs).toMatchObject({
      tamanho: "139.400 ton",
      inauguracao: "2012",
      decks: "18",
      passageiros: "3502",
      cabines: "1751",
      tripulantes: "1370",
      velocidade: "23 nós",
    });
    expect(sheet.technical_drawing_url).toContain("desenho-tecnico");
  });

  it("parses every deck plan available", () => {
    const decks = parserFor("ship-details.html").parseDeckPlans();
    expect(decks.map((d: { deck_number: number }) => d.deck_number)).toEqual([5, 6, 18]);
  });

  it("keeps gallery photos and videos but drops interface icons", () => {
    const media = parserFor("ship-details.html").parseMedia(null, "gallery", "ship");
    const urls = media.map((m: { source_url: string }) => m.source_url);
    expect(urls.some((u: string) => u.includes("foto-1.jpg"))).toBe(true);
    expect(urls.some((u: string) => u.includes("logo-msc.svg"))).toBe(false);
    const video = media.find((m: { media_type: string }) => m.media_type === "video");
    expect(video).toMatchObject({ provider: "youtube" });
  });

  it("parses attractions and informational ship cabins", () => {
    const parser = parserFor("ship-details.html");
    const attractions = parser.parseAttractions();
    expect(attractions.map((a: { name: string }) => a.name)).toEqual(
      expect.arrayContaining(["Restaurante Villa Rossa", "Piscina Family"]),
    );
    const cabins = parser.parseShipCabins();
    expect(cabins.map((c: { cabin_type: string }) => c.cabin_type)).toEqual(
      expect.arrayContaining(["interna", "varanda"]),
    );
    expect(cabins.find((c: { name: string }) => c.name === "Interna Superior")).toMatchObject({
      capacity: 4,
      size_m2: "14",
    });
  });
});

describe("multiple snapshots consolidate into one cruise", () => {
  it("dedupes cabin categories by type + sorted codes across snapshots", () => {
    const keyOf = (c: { type: string; codes: string[] }) =>
      `${c.type}|${[...c.codes].sort().join(",")}`;
    const snap1 = parserFor("checkout-interna.html").parseVisibleCabinCategories("Interna");
    const snap2 = parserFor("checkout-interna.html").parseVisibleCabinCategories("Interna");
    const merged = P.helpers.unique([...snap1, ...snap2], keyOf);
    expect(merged).toHaveLength(2);
  });

  it("dedupes additionals by code across snapshots", () => {
    const a = parserFor("additional-modal.html").parseAdditionals("Transfers");
    const b = parserFor("additional-modal.html").parseAdditionals("Outros");
    const merged = P.helpers.unique([...a, ...b], (x: { code: string }) => x.code);
    expect(merged).toHaveLength(3);
  });
});
