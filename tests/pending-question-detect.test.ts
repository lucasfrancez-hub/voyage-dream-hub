import { describe, expect, it } from "vitest";
import { detectPendingQuestion } from "@/lib/whatsapp/pending-question-detect";

describe("detecção da pergunta pendente do aéreo", () => {
  it("reconhece a pergunta de origem em várias redações", () => {
    expect(detectPendingQuestion("De qual cidade vc pretende embarcar?")).toBe("ask_origin");
    expect(detectPendingQuestion("De qual cidade você pretende embarcar?")).toBe("ask_origin");
    expect(detectPendingQuestion("De onde vc sai?")).toBe("ask_origin");
    expect(detectPendingQuestion("Qual a cidade de embarque?")).toBe("ask_origin");
  });

  it("reconhece bagagem, passageiros e datas", () => {
    expect(detectPendingQuestion("Vc precisa de bagagem despachada?")).toBe("ask_baggage");
    expect(detectPendingQuestion("Quantas pessoas vão viajar?")).toBe("ask_passengers");
    expect(detectPendingQuestion("Qual a data de ida?")).toBe("ask_dates");
  });

  it("não confunde afirmação com pergunta", () => {
    expect(detectPendingQuestion("Perfeito, então o embarque sai de Maringá")).toBeNull();
    expect(detectPendingQuestion("Para qual cidade vc quer viajar?")).not.toBe("ask_origin");
  });
});
