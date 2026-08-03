import { describe, expect, it } from "vitest";
import {
  classifyCustomerMessage,
  detectarMudancaDeNecessidade,
  isShortCustomerMessage,
  resolvePendingFlightAnswer,
} from "../short-answer";
import { stripMarkdownForWhatsApp } from "../text-utils.server";

describe("mensagens curtas nunca reiniciam o atendimento", () => {
  for (const t of ["isso", "Isso mesmo", "?", "??", "ok", "conseguiu?", "no aguardo", "sim"]) {
    it(`curta: ${t}`, () => expect(isShortCustomerMessage(t)).toBe(true));
  }
  it("cobrança é classificada como nudge", () => {
    expect(classifyCustomerMessage("?")).toBe("nudge");
    expect(classifyCustomerMessage("conseguiu ver?")).toBe("nudge");
  });
  it('"ok" durante a pesquisa é só aguardo, não confirmação', () => {
    expect(classifyCustomerMessage("ok", { pesquisaEmAndamento: true })).toBe("nudge");
    expect(classifyCustomerMessage("ok")).toBe("affirmative");
  });
});

describe("só mudança real de necessidade troca o setor", () => {
  it("mensagem curta nunca troca", () => {
    expect(detectarMudancaDeNecessidade("isso")).toBeNull();
    expect(detectarMudancaDeNecessidade("?")).toBeNull();
  });
  it("hotel/carro/pacote trocam", () => {
    expect(detectarMudancaDeNecessidade("na verdade eu quero um hotel em Natal")).toBe("hotel");
    expect(detectarMudancaDeNecessidade("quero alugar um carro em Orlando")).toBe("carro");
    expect(detectarMudancaDeNecessidade("tem pacote pra Porto Seguro?")).toBe("pacote");
  });
});

describe("resolvedor determinístico da pergunta pendente", () => {
  it('"isso" confirma a origem sugerida', () => {
    const r = resolvePendingFlightAnswer({
      pending_question: "confirm_origin",
      pending_question_context: { origin: "Maringá" },
      texto: "isso",
    });
    expect(r.resolved).toBe(true);
    expect(r.patch.origin).toBe("Maringá");
    expect(r.patch.origin_status).toBe("confirmed_by_customer");
    expect(r.next_action).toBe("ask_destination");
  });

  it('"não" derruba a origem e volta a perguntar', () => {
    const r = resolvePendingFlightAnswer({
      pending_question: "confirm_origin",
      pending_question_context: { origin: "Maringá" },
      texto: "não",
    });
    expect(r.patch.origin).toBeNull();
    expect(r.next_action).toBe("ask_origin");
  });

  it("número de passageiros dispara a pesquisa", () => {
    const r = resolvePendingFlightAnswer({ pending_question: "ask_passengers", texto: "2 adultos" });
    expect(r.patch.adults).toBe(2);
    expect(r.next_action).toBe("run_search");
  });

  it('"só eu" vira 1 passageiro', () => {
    expect(resolvePendingFlightAnswer({ pending_question: "ask_passengers", texto: "só eu" }).patch.adults).toBe(1);
  });

  it("cobrança não resolve nada", () => {
    expect(
      resolvePendingFlightAnswer({ pending_question: "ask_passengers", texto: "?" }).resolved,
    ).toBe(false);
  });

  it("bagagem sim/não vira filtro", () => {
    expect(resolvePendingFlightAnswer({ pending_question: "ask_baggage", texto: "sim" }).patch.baggage_filter).toBe(true);
    expect(
      resolvePendingFlightAnswer({ pending_question: "ask_baggage", texto: "sem bagagem" }).patch.baggage_filter,
    ).toBe(false);
  });
});

describe("nenhum negrito sai pro cliente", () => {
  it("remove asterisco simples do WhatsApp", () => {
    expect(stripMarkdownForWhatsApp("*Bruno:* olha as opções")).toBe("Bruno: olha as opções");
    expect(stripMarkdownForWhatsApp("valor *R$ 1.017,57*")).toBe("valor R$ 1.017,57");
  });
  it("remove negrito markdown e títulos", () => {
    expect(stripMarkdownForWhatsApp("**Opções**\n## Título")).toBe("Opções\nTítulo");
  });
  it("não sobra asterisco solto", () => {
    expect(stripMarkdownForWhatsApp("preço * final")).not.toContain("*");
  });
});
