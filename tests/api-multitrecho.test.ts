/**
 * Multitrecho da API interna VIA AIR: validação das pernas, situação do grupo
 * e consistência entre implementação, OpenAPI, documentação, Postman e SDK.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  MULTICITY_MAX_LEGS,
  MULTICITY_MIN_LEGS,
  statusDoGrupo,
  validarPernas,
} from "@/lib/api/multicity.server";

const raiz = process.cwd();
const ler = (p: string) => readFileSync(join(raiz, p), "utf8");
const openapi = ler("docs/openapi.yaml");
const doc = ler("docs/SKYHUB_INTEGRATION.md");
const postman = ler("docs/ViaAir-Internal-API.postman_collection.json");
const sdk = ler("src/lib/viaair-api-client/index.ts");
const tipos = ler("src/lib/viaair-api-client/types.ts");
const rotaBusca = ler("src/routes/api/public/internal/v1/flights.multicity.search.ts");
const rotaCheckouts = ler("src/routes/api/public/internal/v1/multicity.checkouts.ts");
const rotaGrupo = ler("src/routes/api/public/internal/v1/multicity.groups.$groupId.ts");
const rotaPax = ler("src/routes/api/public/internal/v1/multicity.groups.$groupId.passengers.ts");
const rotaRevalida = ler("src/routes/api/public/internal/v1/multicity.groups.$groupId.revalidate.ts");

const perna = (origin: string, destination: string, departureDate: string) => ({
  origin,
  destination,
  departureDate,
});

describe("validação das pernas", () => {
  it("aceita 2 pernas", () => {
    expect(validarPernas([perna("GRU", "MIA", "2026-10-10"), perna("MIA", "JFK", "2026-10-15")])).toEqual([]);
  });

  it("aceita 3 pernas", () => {
    expect(
      validarPernas([
        perna("GRU", "MIA", "2026-10-10"),
        perna("MIA", "JFK", "2026-10-15"),
        perna("JFK", "GRU", "2026-10-20"),
      ]),
    ).toEqual([]);
  });

  it("recusa menos de 2 pernas", () => {
    expect(validarPernas([perna("GRU", "MIA", "2026-10-10")]).join(" ")).toContain(
      `pelo menos ${MULTICITY_MIN_LEGS}`,
    );
  });

  it("recusa mais pernas do que o sistema suporta", () => {
    const muitas = Array.from({ length: MULTICITY_MAX_LEGS + 1 }, (_, i) =>
      perna("GRU", "MIA", `2026-10-${String(10 + i).padStart(2, "0")}`),
    );
    expect(validarPernas(muitas).join(" ")).toContain(`máximo suportado é de ${MULTICITY_MAX_LEGS}`);
  });

  it("recusa data fora de ordem cronológica", () => {
    const erros = validarPernas([perna("GRU", "MIA", "2026-10-15"), perna("MIA", "JFK", "2026-10-10")]);
    expect(erros.join(" ")).toContain("não pode ser anterior");
  });

  it("recusa data inválida e origem igual ao destino", () => {
    const erros = validarPernas([perna("GRU", "GRU", "10/10/2026"), perna("MIA", "JFK", "2026-10-15")]);
    expect(erros.join(" ")).toContain("AAAA-MM-DD");
    const iguais = validarPernas([perna("GRU", "GRU", "2026-10-10"), perna("MIA", "JFK", "2026-10-15")]);
    expect(iguais.join(" ")).toContain("origem e destino não podem ser iguais");
  });

  it("recusa código IATA incompleto", () => {
    expect(validarPernas([perna("GR", "MIA", "2026-10-10"), perna("MIA", "JFK", "2026-10-15")]).join(" ")).toContain(
      "3 letras",
    );
  });
});

describe("situação do grupo", () => {
  it("todas criadas → AWAITING_PAYMENT", () => {
    expect(
      statusDoGrupo([
        { status: "CREATED", checkoutCriado: true },
        { status: "CREATED", checkoutCriado: true },
      ]),
    ).toBe("AWAITING_PAYMENT");
  });

  it("criação parcial de checkout → PARTIALLY_CREATED", () => {
    expect(
      statusDoGrupo([
        { status: "CREATED", checkoutCriado: true },
        { status: "FAILED", checkoutCriado: false },
      ]),
    ).toBe("PARTIALLY_CREATED");
  });

  it("uma paga e outra recusada → PARTIALLY_PAID", () => {
    expect(
      statusDoGrupo([
        { status: "CUSTOMER_PAYMENT_PAID", paymentStatus: "PAID" },
        { status: "AWAITING_PAYMENT", paymentStatus: "DECLINED" },
      ]),
    ).toBe("PARTIALLY_PAID");
  });

  it("todas pagas sem bilhete → PAID", () => {
    expect(
      statusDoGrupo([
        { status: "LOCATOR_RECEIVED", paymentStatus: "PAID" },
        { status: "LOCATOR_RECEIVED", paymentStatus: "PAID" },
      ]),
    ).toBe("PAID");
  });

  it("emissão parcial → PARTIALLY_ISSUED", () => {
    expect(
      statusDoGrupo([
        { status: "TICKETS_RECEIVED", paymentStatus: "PAID", ticketStatus: "ISSUED" },
        { status: "LOCATOR_RECEIVED", paymentStatus: "PAID", ticketStatus: "PENDING" },
      ]),
    ).toBe("PARTIALLY_ISSUED");
  });

  it("conclusão total → COMPLETE apenas quando todas concluídas", () => {
    expect(
      statusDoGrupo([
        { status: "COMPLETE", paymentStatus: "PAID", ticketStatus: "ISSUED" },
        { status: "COMPLETE", paymentStatus: "PAID", ticketStatus: "ISSUED" },
      ]),
    ).toBe("COMPLETE");
  });

  it("revisão manual e falha total", () => {
    expect(statusDoGrupo([{ status: "MANUAL_REVIEW" }, { status: "COMPLETE", ticketStatus: "ISSUED" }])).toBe(
      "MANUAL_REVIEW",
    );
    expect(statusDoGrupo([{ status: "FAILED" }, { status: "FAILED" }])).toBe("FAILED");
    expect(statusDoGrupo([])).toBe("FAILED");
  });
});

describe("rotas multitrecho", () => {
  it("a busca compõe uma pesquisa só-ida por perna e não esconde a falha", () => {
    expect(rotaBusca).toContain("searchFlights");
    expect(rotaBusca).toContain("sequence");
    expect(rotaBusca).toContain("error");
    expect(rotaBusca).toContain("MULTICITY");
  });

  it("cada perna gera um checkout próprio, nunca um carrinho único", () => {
    expect(rotaCheckouts).toContain("createFlightCart");
    expect(rotaCheckouts).toContain("criarCheckoutRef");
    expect(rotaCheckouts).toContain("groupId");
  });

  it("os endpoints mutáveis aceitam Idempotency-Key", () => {
    for (const rota of [rotaCheckouts, rotaPax, rotaRevalida]) {
      expect(rota).toContain("comIdempotencia");
    }
  });

  it("passageiros são propagados a cada checkout com erro isolado por perna", () => {
    expect(rotaPax).toContain("enviarPassageiros");
    expect(rotaPax).toContain("PARTIALLY_APPLIED");
  });

  it("a revalidação devolve resultado por reserva e totais", () => {
    expect(rotaRevalida).toContain("PRICE_CHANGED");
    expect(rotaRevalida).toContain("previousTotal");
    expect(rotaRevalida).toContain("currentTotal");
  });

  it("a consulta do grupo traz pagamento, localizador e bilhete por reserva", () => {
    for (const campo of ["paymentStatus", "supplierPaymentStatus", "locator", "ticketStatus"]) {
      expect(rotaGrupo).toContain(campo);
    }
  });
});

describe("avisos com groupId", () => {
  const webhooks = ler("src/lib/api/webhooks.server.ts");
  it("o payload do aviso recebe groupId e sequence quando a reserva é de um grupo", () => {
    expect(webhooks).toContain("contextoDeGrupo");
    expect(webhooks).toContain("groupId");
    expect(webhooks).toContain("sequence");
    expect(doc).toContain('"groupId": "grp_...", "sequence": 2');
  });
});

describe("contrato multitrecho sincronizado", () => {
  const caminhos = [
    "/flights/multicity/search",
    "/multicity/checkouts",
    "/multicity/groups/{groupId}",
    "/multicity/groups/{groupId}/passengers",
    "/multicity/groups/{groupId}/revalidate",
  ];

  it("todo endpoint está no OpenAPI, na documentação e no Postman", () => {
    for (const p of caminhos) {
      expect(openapi).toContain(`  ${p}:`);
      expect(doc).toContain(p);
      expect(postman).toContain(p.replace("{groupId}", "{{group_id}}"));
    }
  });

  it("o SDK expõe os cinco métodos e os tipos multitrecho", () => {
    for (const m of [
      "searchMultiCity",
      "createMultiCityCheckouts",
      "getMultiCityGroup",
      "setMultiCityPassengers",
      "revalidateMultiCityGroup",
    ]) {
      expect(sdk).toContain(m);
    }
    for (const t of [
      "MultiCitySearchRequest",
      "MultiCitySearchResponse",
      "MultiCityLeg",
      "MultiCityOffer",
      "MultiCityGroup",
      "MultiCityReservation",
    ]) {
      expect(tipos).toContain(t);
    }
  });

  it("as situações do grupo são as mesmas em todos os artefatos", () => {
    for (const s of [
      "CREATED",
      "PARTIALLY_CREATED",
      "AWAITING_PAYMENT",
      "PARTIALLY_PAID",
      "PAID",
      "PARTIALLY_ISSUED",
      "COMPLETE",
      "MANUAL_REVIEW",
      "FAILED",
    ]) {
      expect(openapi).toContain(s);
      expect(doc).toContain(s);
      expect(tipos).toContain(s);
    }
  });

  it("os identificadores do grupo e da pesquisa são opacos", () => {
    expect(doc).toContain("mcs_");
    expect(doc).toContain("grp_");
    expect(doc).not.toContain("searchKey");
    expect(doc).not.toContain("flightKey");
  });
});
