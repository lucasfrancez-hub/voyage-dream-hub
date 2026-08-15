import { describe, expect, it } from "vitest";
import {
  centralBriefHasMissingOrigin,
  isInvalidMissingOriginResponse,
  origemJaFoiRespondidaNoProtocolo,
  origemRespondidaNoProtocolo,
  safeMissingOriginResponse,
} from "../airflow-guard";

describe("guard determinístico do fluxo aéreo sem origem", () => {
  it("reconhece o estado estruturado de origem ausente", () => {
    expect(
      centralBriefHasMissingOrigin(
        "✈️ Cotação de passagem aérea\n📍 Origem: NÃO informada — pergunte de qual cidade ele vai embarcar\n📍 Destino: São Paulo",
      ),
    ).toBe(true);
  });

  it.each([
    "Não encontrei um pacote pronto para São Paulo",
    "Consigo montar uma proposta personalizada",
    "Tenho voo saindo de Paranavaí",
    "Podemos usar o aeroporto mais próximo",
    "Vou encaminhar para o Comercial",
  ])("bloqueia resposta incompatível: %s", (text) => {
    expect(isInvalidMissingOriginResponse(text)).toBe(true);
  });

  it("gera somente a pergunta segura com o nome", () => {
    expect(safeMissingOriginResponse("Lucas Silva")).toMatch(
      /^(Bom dia|Boa tarde|Boa noite), Lucas!\n\nDe qual cidade você pretende embarcar\?$/,
    );
  });

  it("reconhece cidade curta respondida após a pergunta de origem", () => {
    const mensagens = {
      outbound: [{ content: "De qual cidade você pretende embarcar?", created_at: "2026-08-15T03:26:00Z" }],
      inbound: [{ content: "Maringa", created_at: "2026-08-15T03:26:20Z" }],
    };

    expect(origemJaFoiRespondidaNoProtocolo(mensagens)).toBe(true);
    expect(origemRespondidaNoProtocolo(mensagens)).toBe("Maringa");
  });

  it("reconhece a abreviação real 'vc' e não repete a origem", () => {
    const mensagens = {
      outbound: [{ content: "De qual cidade vc pretende embarcar?", created_at: "2026-08-15T03:55:09Z" }],
      inbound: [{ content: "Maringa", created_at: "2026-08-15T03:55:22Z" }],
    };

    expect(origemJaFoiRespondidaNoProtocolo(mensagens)).toBe(true);
    expect(origemRespondidaNoProtocolo(mensagens)).toBe("Maringa");
  });
});