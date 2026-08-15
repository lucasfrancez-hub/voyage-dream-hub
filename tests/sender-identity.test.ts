import { describe, expect, it } from "vitest";
import { aiSender, isAiSender } from "@/lib/whatsapp/sender-identity";
import { detectPendingQuestion } from "@/lib/whatsapp/pending-question-detect";
import { parseCidadeLivre, resolvePendingFlightAnswer } from "@/lib/whatsapp/short-answer";

describe("identidade real do agente", () => {
  it("grava o slug do agente que falou", () => {
    expect(aiSender("bruno")).toBe("bruno");
    expect(aiSender("Paula")).toBe("paula");
    expect(aiSender("giovani")).toBe("giovani");
  });

  it("cai para camila quando não há slug (histórico antigo)", () => {
    expect(aiSender(null)).toBe("camila");
    expect(aiSender("human")).toBe("camila");
  });

  it("classifica IA vs não-IA", () => {
    expect(isAiSender("bruno")).toBe(true);
    expect(isAiSender("camila")).toBe(true);
    expect(isAiSender("customer")).toBe(false);
    expect(isAiSender("human")).toBe(false);
    expect(isAiSender("system")).toBe(false);
  });
});

describe("origem não pode ser perguntada duas vezes (protocolo 095)", () => {
  it("detecta a pergunta pendente do texto real enviado", () => {
    expect(detectPendingQuestion("De qual cidade vc pretende embarcar?")).toBe("ask_origin");
  });

  it("resolve a cidade em texto livre e persiste a origem", () => {
    const r = resolvePendingFlightAnswer({
      pending_question: "ask_origin",
      pending_question_context: {},
      texto: "Maringa",
    });
    expect(r.resolved).toBe(true);
    expect(r.patch.origin).toBe("Maringa");
    expect(r.patch.origin_status).toBe("informed_by_customer");
    expect(r.next_action).toBe("ask_destination");
  });

  it("aceita variações com preposição", () => {
    expect(parseCidadeLivre("saio de maringa")).toBe("Maringa");
    expect(parseCidadeLivre("de curitiba")).toBe("Curitiba");
    expect(parseCidadeLivre("sim")).toBeNull();
    expect(parseCidadeLivre("2")).toBeNull();
  });
});
