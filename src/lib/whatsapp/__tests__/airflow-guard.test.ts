import { describe, expect, it } from "vitest";
import {
  centralBriefHasMissingOrigin,
  isInvalidMissingOriginResponse,
  isValidOriginQuestion,
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
  it("reconhece a pergunta da Paula mesmo com prefixo do nome", () => {
    const mensagens = {
      outbound: [{ content: "Paula:\n\nDe qual cidade vc pretende embarcar?", created_at: "2026-08-15T03:55:09Z" }],
      inbound: [{ content: "Curitiba", created_at: "2026-08-15T03:55:22Z" }],
    };

    expect(origemJaFoiRespondidaNoProtocolo(mensagens)).toBe(true);
    expect(origemRespondidaNoProtocolo(mensagens)).toBe("Curitiba");
  });
  it.each([
    "De qual cidade vc pretende embarcar?",
    "De qual cidade você pretende embarcar?",
    "De qual cidade vc vai sair?",
    "De onde vc embarca?",
    "De onde vc vai partir?",
    "Qual a cidade de embarque?",
    "qual cidade de origem?",
    "Qual a origem do voo?",
  ])("reconhece a pergunta de origem em qualquer redação: %s", (t) => {
    expect(isValidOriginQuestion(t)).toBe(true);
  });

  it("não confunde outras perguntas com a de origem", () => {
    expect(isValidOriginQuestion("Para qual cidade vc quer viajar?")).toBe(false);
    expect(isValidOriginQuestion("Quantas pessoas vão embarcar nessa viagem?")).toBe(false);
  });
});
