/**
 * Guarda de consistência: implementação x OpenAPI x documentação x Postman x SDK.
 * Falha se um endpoint ou nome de campo divergir entre os artefatos entregues.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const raiz = process.cwd();
const openapi = readFileSync(join(raiz, "docs/openapi.yaml"), "utf8");
const doc = readFileSync(join(raiz, "docs/SKYHUB_INTEGRATION.md"), "utf8");
const postman = readFileSync(join(raiz, "docs/ViaAir-Internal-API.postman_collection.json"), "utf8");
const sdk = readFileSync(join(raiz, "src/lib/viaair-api-client/index.ts"), "utf8");
const tipos = readFileSync(join(raiz, "src/lib/viaair-api-client/types.ts"), "utf8");

const rotas = readdirSync(join(raiz, "src/routes/api/public/internal/v1"))
  .filter((f) => f.endsWith(".ts"))
  .map((f) => f.replace(/\.ts$/, ""));

/** Converte o nome do arquivo de rota no caminho público. */
function caminho(arquivo: string): string {
  return (
    "/" +
    arquivo
      .split(".")
      .map((p) => (p.startsWith("$") ? `{${p.slice(1)}}` : p))
      .join("/")
  );
}

const caminhosDaApi = rotas
  .map(caminho)
  // webhooks/dispatch é interno (cron), não faz parte do contrato da Sky Hub
  .filter((p) => p !== "/webhooks/dispatch");

const caminhosOpenapi = openapi
  .split("\n")
  .filter((l) => /^ {2}\/[a-z{]/.test(l))
  .map((l) => l.trim().replace(/:$/, ""));

describe("endpoints publicados", () => {
  it("toda rota implementada está no OpenAPI", () => {
    for (const p of caminhosDaApi) expect(caminhosOpenapi).toContain(p);
  });

  it("o OpenAPI não inventa endpoint que não existe", () => {
    for (const p of caminhosOpenapi) expect(caminhosDaApi).toContain(p);
  });

  it("toda rota aparece na documentação e na coleção Postman", () => {
    for (const p of caminhosDaApi) {
      const semParam = p
        .replace(/\{checkoutId\}/g, "")
        .replace(/\{orderId\}/g, "")
        .replace(/\{paymentId\}/g, "")
        .replace(/\{groupId\}/g, "");
      const trecho = semParam.replace(/\/\//g, "/");
      expect(doc.includes(p) || doc.includes(trecho)).toBe(true);
      const postmanPath = p
        .replace("{checkoutId}", "{{checkout_id}}")
        .replace("{orderId}", "{{order_id}}")
        .replace("{paymentId}", "{{payment_id}}")
        .replace("{groupId}", "{{group_id}}");
      expect(postman).toContain(postmanPath);
    }
  });

  it("a v1 é aérea: nenhum endpoint de hotel, carro, seguro, produto ou pacote", () => {
    for (const p of caminhosDaApi) {
      expect(p).not.toMatch(/^\/(hotels|cars|travel-insurance|products|packages)\b/);
    }
    expect(doc).toContain("Escopo da v1: somente aéreo");
    expect(openapi).toContain("**Escopo da v1: somente aéreo**");
  });
});

describe("tokenização de cartão", () => {
  const rota = readFileSync(
    join(raiz, "src/routes/api/public/internal/v1/checkouts.$checkoutId.payments.card-token.ts"),
    "utf8",
  );

  it("a implementação devolve cardToken/cardKey", () => {
    expect(rota).toContain("cardToken: cofre.cofre.Token");
    expect(rota).toContain("cardKey: cofre.cofre.Key");
  });

  it("todos os artefatos usam o mesmo contrato de entrada e de saída", () => {
    for (const campo of [
      "holderName",
      "expirationMonth",
      "expirationYear",
      "documentNumber",
      "cardToken",
      "cardKey",
      "lastDigits",
    ]) {
      expect(rota).toContain(campo);
      expect(openapi).toContain(campo);
      expect(doc).toContain(campo);
      expect(postman).toContain(campo);
      expect(tipos).toContain(campo);
    }
  });

  it("o SDK não usa mais os nomes antigos", () => {
    expect(sdk).not.toMatch(/\bexpMonth\b|\bexpYear\b/);
    expect(tipos).not.toMatch(/\bexpMonth\b|\bexpYear\b/);
    expect(tipos).not.toMatch(/token:\s*string;\s*\n\s*key:\s*string/);
  });

  it("PAN e CVV nunca são devolvidos", () => {
    expect(rota).not.toMatch(/number:\s*parsed\.data\.number.*ok\(/s);
    expect(openapi).not.toContain("pan:");
  });
});

describe("parcelamento", () => {
  const rota = readFileSync(
    join(raiz, "src/routes/api/public/internal/v1/checkouts.$checkoutId.installments.ts"),
    "utf8",
  );
  it("usa cardToken/cardKey em todos os artefatos, nunca cardBin", () => {
    expect(rota).toContain("cardToken");
    expect(rota).not.toContain("cardBin");
    expect(postman).toContain('\\"cardToken\\": \\"{{card_token}}\\"');
    expect(sdk).toContain("cardToken: string; cardKey: string");
    expect(doc).toContain('"amount": 471.00, "cardToken"');
  });
});

describe("Pix", () => {
  const rota = readFileSync(
    join(raiz, "src/routes/api/public/internal/v1/checkouts.$checkoutId.payments.pix.ts"),
    "utf8",
  );
  const pagamento = readFileSync(
    join(raiz, "src/routes/api/public/internal/v1/payments.$paymentId.ts"),
    "utf8",
  );
  const cobranca = readFileSync(join(raiz, "src/lib/pix-cobranca.server.ts"), "utf8");

  it("a imagem do QR Code é sempre Data URI", () => {
    expect(cobranca).toContain("data:image/png;base64,");
    expect(openapi).toContain("Data URI pronta");
    expect(doc).toContain("data:image/png;base64,");
    expect(tipos).toContain("data:image/png;base64,");
  });

  it("criação e consulta devolvem os mesmos campos", () => {
    for (const campo of ["qrCode", "qrCodeImage", "invoiceUrl", "expiresAt", "status", "provider"]) {
      expect(rota).toContain(campo);
      expect(pagamento).toContain(campo);
      expect(openapi).toContain(campo);
      expect(tipos).toContain(campo);
    }
  });

  it("a criação exige amount e payer.documentNumber", () => {
    expect(rota).toContain("amount: z.number()");
    expect(rota).toContain("documentNumber");
    expect(postman).toContain('\\"amount\\": 471.00');
    expect(doc).toContain('"amount": 471.00,');
  });
});

describe("reconferência de tarifa", () => {
  it("expectedAmount é obrigatório em todos os artefatos", () => {
    const rota = readFileSync(
      join(raiz, "src/routes/api/public/internal/v1/checkouts.$checkoutId.revalidate.ts"),
      "utf8",
    );
    expect(rota).toContain("expectedAmount");
    expect(openapi).toContain("expectedAmount");
    expect(doc).toContain("expectedAmount");
    expect(postman).toContain("expectedAmount");
    expect(sdk).toContain("revalidate(checkoutId: string, expectedAmount: number)");
  });
});

describe("passageiros", () => {
  it("o contrato é type/gender/documentType/nationalityCountryId", () => {
    for (const campo of ["documentType", "nationalityCountryId", "gender", "birthDate"]) {
      expect(openapi).toContain(campo);
      expect(doc).toContain(campo);
      expect(postman).toContain(campo);
      expect(tipos).toContain(campo);
    }
    expect(tipos).not.toContain("passengerType");
    expect(doc).not.toContain("passengerType");
  });
});

describe("segurança da documentação", () => {
  it("nenhum token real aparece nos arquivos entregues", () => {
    for (const arquivo of [openapi, doc, postman]) {
      expect(arquivo).not.toMatch(/vai_(live|test)_(?!xxx)[A-Za-z0-9_-]{20,}/);
    }
  });
});
