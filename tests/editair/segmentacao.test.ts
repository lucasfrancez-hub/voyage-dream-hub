import { describe, expect, it } from "vitest";
import {
  auditarSegmentacao,
  segmentarLegendas,
  unidadesDeFala,
  type PalavraTempo,
} from "@/lib/editair/segmentacao";

/** transcrição real de exemplo: "Pra quem não me conhece..." com timestamps de fala */
export const FALA: PalavraTempo[] = [
  ["Pra", 0, 180], ["quem", 190, 360], ["não", 370, 520], ["me", 530, 640], ["conhece,", 650, 1080],
  ["eu", 1320, 1450], ["sou", 1460, 1620], ["o", 1630, 1690], ["Lucas.", 1700, 2180],
  ["Eu", 2600, 2740], ["sou", 2750, 2900], ["engenheiro", 2910, 3520], ["civil,", 3530, 3980],
  ["e", 4300, 4400], ["o", 4410, 4470], ["mais", 4480, 4700], ["engraçado", 4710, 5290],
  ["é", 5300, 5380], ["que", 5390, 5520], ["hoje", 5530, 5760], ["eu", 5770, 5880],
  ["tenho", 5890, 6150], ["uma", 6160, 6300], ["agência", 6310, 6820], ["de", 6830, 6910],
  ["viagens.", 6920, 7480],
].map(([w, start, end]) => ({ w: w as string, start: start as number, end: end as number, clipId: "c1" }));

describe("segmentação por fala", () => {
  it("quebra unidades por pontuação final e pausa, não por contagem", () => {
    const u = unidadesDeFala(FALA);
    expect(u.map((b) => b.map((p) => p.w).join(" "))).toEqual([
      "Pra quem não me conhece,",
      "eu sou o Lucas.",
      "Eu sou engenheiro civil,",
      "e o mais engraçado é que hoje eu tenho uma agência de viagens.",
    ]);
  });

  it("start/end do bloco vêm das palavras", () => {
    for (const b of segmentarLegendas(FALA)) {
      expect(b[0]!.start).toBe(b[0]!.start);
      const start = b[0]!.start;
      const end = b[b.length - 1]!.end;
      expect(end).toBeGreaterThan(start);
    }
    const primeiro = segmentarLegendas(FALA)[0]!;
    expect(primeiro[0]!.start).toBe(0);
    expect(primeiro[primeiro.length - 1]!.end).toBe(1080);
  });

  it("não corta no meio de sintagma para igualar tamanhos", () => {
    const textos = segmentarLegendas(FALA).map((b) => b.map((p) => p.w).join(" "));
    expect(textos).toContain("Pra quem não me conhece,");
    expect(textos).toContain("eu sou o Lucas.");
    expect(textos).toContain("Eu sou engenheiro civil,");
    // nenhum bloco termina em artigo/preposição solta
    for (const t of textos) expect(/\b(o|a|de|da|do|uma|um|que|e)$/i.test(t.replace(/[.,!?]$/, ""))).toBe(false);
  });

  it("respeita o limite visual só como trava, quebrando no melhor ponto", () => {
    for (const b of segmentarLegendas(FALA)) {
      const t = b.map((p) => p.w).join(" ");
      expect(t.length).toBeLessThanOrEqual(42);
      expect(b.length).toBeLessThanOrEqual(9);
    }
  });

  it("nunca junta palavras de clipes diferentes", () => {
    const misto: PalavraTempo[] = [
      { w: "olá", start: 0, end: 200, clipId: "a" },
      { w: "mundo", start: 210, end: 400, clipId: "b" },
    ];
    expect(segmentarLegendas(misto).length).toBe(2);
  });

  it("auditoria mostra timestamps, agrupamento antigo e novo", () => {
    const a = auditarSegmentacao(FALA);
    expect(a.palavras.length).toBe(FALA.length);
    expect(a.antigo.length).toBeGreaterThan(0);
    expect(a.novo.length).toBeGreaterThan(0);
    // o novo respeita as fronteiras de frase; o antigo não
    expect(a.novo.some((l) => l.texto === "eu sou o Lucas.")).toBe(true);
    expect(a.antigo.some((l) => l.texto === "eu sou o Lucas.")).toBe(false);
  });
});
