import { describe, expect, it } from "vitest";
import {
  centralBriefHasMissingOrigin,
  isInvalidMissingOriginResponse,
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
    expect(safeMissingOriginResponse("Lucas Silva")).toBe(
      "Boa tarde, Lucas!\n\nDe qual cidade você vai embarcar?",
    );
  });
});