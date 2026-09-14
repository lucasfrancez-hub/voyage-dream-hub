import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { API_SCOPES, SKYHUB_DEFAULT_SCOPES } from "@/lib/api/scopes";
import { statusDoPagamento, statusDoPedido } from "@/lib/api/normalize";
import { verificarAssinaturaWebhook } from "@/lib/viaair-api-client";

describe("permissões da API", () => {
  it("todas as permissões da Sky Hub existem na lista oficial", () => {
    for (const s of SKYHUB_DEFAULT_SCOPES) expect(API_SCOPES).toContain(s);
  });

  it("a Sky Hub não recebe permissão de reserva de hotel ou carro", () => {
    expect(SKYHUB_DEFAULT_SCOPES).not.toContain("hotels:book");
    expect(SKYHUB_DEFAULT_SCOPES).not.toContain("cars:book");
  });
});

describe("tradução de situações", () => {
  it("separa pagamento do cliente e do fornecedor", () => {
    expect(statusDoPedido("CUSTOMER_PAID")).toBe("CUSTOMER_PAYMENT_PAID");
    expect(statusDoPedido("PROVIDER_PAID")).toBe("SUPPLIER_PAYMENT_PAID");
  });

  it("reconhece as etapas finais", () => {
    expect(statusDoPedido("COMPLETE")).toBe("COMPLETE");
    expect(statusDoPedido("LOCATOR_RECEIVED")).toBe("LOCATOR_RECEIVED");
    expect(statusDoPedido("TICKETS_RECEIVED")).toBe("TICKETS_RECEIVED");
  });

  it("entende as situações do Pix em português", () => {
    expect(statusDoPagamento("ativa")).toBe("ACTIVE");
    expect(statusDoPagamento("concluida")).toBe("PAID");
    expect(statusDoPagamento("cancelada")).toBe("CANCELLED");
    expect(statusDoPagamento("estornada")).toBe("REFUNDED");
  });
});

describe("assinatura dos avisos", () => {
  const secret = "segredo-de-teste-1234567890";
  const timestamp = "1790000000";
  const rawBody = JSON.stringify({ id: "evt_1", event: "order.completed" });
  const assinatura =
    "sha256=" + createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");

  it("aceita assinatura correta", async () => {
    await expect(
      verificarAssinaturaWebhook({ secret, timestamp, rawBody, signature: assinatura }),
    ).resolves.toBe(true);
  });

  it("recusa corpo alterado", async () => {
    await expect(
      verificarAssinaturaWebhook({ secret, timestamp, rawBody: `${rawBody} `, signature: assinatura }),
    ).resolves.toBe(false);
  });

  it("recusa senha errada", async () => {
    await expect(
      verificarAssinaturaWebhook({ secret: "outra-senha-qualquer", timestamp, rawBody, signature: assinatura }),
    ).resolves.toBe(false);
  });
});
