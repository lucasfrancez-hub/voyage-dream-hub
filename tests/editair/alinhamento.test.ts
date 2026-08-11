import { describe, expect, it } from "vitest";
import {
  aplicarPadding,
  auditarSegmentacao,
  LIMITES_PADRAO,
  linhasVisuais,
  quebraProibida,
  segmentarLegado,
  segmentarLegendas,
  unidadesDeFala,
  type PalavraTempo,
} from "@/lib/editair/segmentacao";
import {
  aplicarOffset,
  auditarPalavras,
  estimarOffset,
  normalizarPalavras,
  tabelaPalavras,
} from "@/lib/editair/alinhamento";

const p = (w: string, start: number, end: number, clipId = "c1"): PalavraTempo => ({ w, start, end, clipId });

/**
 * Trecho REAL de fala (locução do Lucas), com frase curta, frase longa,
 * vírgula, pausa curta (~40-90ms), pausa longa (>500ms), fala rápida e lenta.
 */
export const FALA_REAL: PalavraTempo[] = [
  p("Pra", 0, 180), p("quem", 190, 360), p("não", 370, 520), p("me", 530, 640), p("conhece,", 650, 1080),
  p("eu", 1320, 1450), p("sou", 1460, 1620), p("o", 1630, 1690), p("Lucas.", 1700, 2180),
  p("Eu", 2600, 2740), p("sou", 2750, 2900), p("engenheiro", 2910, 3520), p("civil,", 3530, 3980),
  p("e", 4300, 4400), p("o", 4410, 4470), p("mais", 4480, 4700), p("engraçado", 4710, 5290),
  p("é", 5300, 5380), p("que", 5390, 5520), p("hoje", 5530, 5760), p("eu", 5770, 5880),
  p("tenho", 5890, 6150), p("uma", 6160, 6300), p("agência", 6310, 6820), p("de", 6830, 6910),
  p("viagens.", 6920, 7480),
];

const textos = (bs: PalavraTempo[][]) => bs.map((b) => b.map((x) => x.w).join(" "));

describe("A/B — timestamps brutos por palavra", () => {
  it("aponta transcrição saudável como confiável", () => {
    const a = auditarPalavras(FALA_REAL);
    expect(a.total).toBe(26);
    expect(a.foraDeOrdem).toBe(0);
    expect(a.sobrepostas).toBe(0);
    expect(a.duracaoInvalida).toBe(0);
    expect(a.msPorCaractere).toBeGreaterThan(25);
    expect(a.msPorCaractere).toBeLessThan(160);
    expect(a.confiavel).toBe(true);
  });

  it("denuncia grade grossa de 100ms (timestamp inventado pelo modelo)", () => {
    const grade = FALA_REAL.map((x) => ({ ...x, start: Math.round(x.start / 100) * 100, end: Math.round(x.end / 100) * 100 }));
    const a = auditarPalavras(grade);
    expect(a.quantizacaoMs).toBeGreaterThanOrEqual(100);
    expect(a.confiavel).toBe(false);
    expect(a.observacoes.join(" ")).toMatch(/grade/);
  });

  it("denuncia sobreposição e duração inválida", () => {
    const ruim = [p("um", 0, 500), p("dois", 300, 700), p("três", 800, 800)];
    const a = auditarPalavras(ruim);
    expect(a.sobrepostas).toBe(1);
    expect(a.duracaoInvalida).toBe(1);
    expect(a.confiavel).toBe(false);
  });

  it("normaliza sem inventar: ordena, corrige overlap e duração zero", () => {
    const n = normalizarPalavras([p("dois", 300, 700), p("um", 0, 500), p("três", 800, 800)]);
    expect(n.map((x) => x.w)).toEqual(["um", "dois", "três"]);
    expect(n[1]!.start).toBe(500);
    expect(n[2]!.end).toBeGreaterThan(n[2]!.start);
  });

  it("tabela de auditoria traz palavra | start | end | conf", () => {
    const t = tabelaPalavras([{ ...FALA_REAL[0]!, conf: 0.94 }, FALA_REAL[1]!]);
    expect(t[0]).toMatchObject({ palavra: "Pra", start: 0, end: 180, conf: 0.94 });
    expect(t[1]!.gapAnterior).toBe(10);
  });
});

describe("B — offset só com evidência", () => {
  const onsets = FALA_REAL.filter((_, i) => [0, 5, 9, 13].includes(i)).map((x) => ({ inicio: x.start, fim: x.end }));

  it("não aplica offset quando as amostras são poucas", () => {
    const e = estimarOffset(FALA_REAL, onsets);
    expect(e.sistematico).toBe(false);
    expect(aplicarOffset(FALA_REAL, e)).toBe(FALA_REAL);
  });

  it("não aplica offset quando o erro é variável (é alinhamento, não latência)", () => {
    const base = [0, 1000, 2000, 3000, 4000, 5000];
    const erros = [30, 400, -120, 260, 20, 500];
    const palavras = base.map((b, i) => p(`w${i}`, b + erros[i]!, b + erros[i]! + 200));
    const e = estimarOffset(palavras, base.map((b) => ({ inicio: b, fim: b + 200 })));
    expect(e.sistematico).toBe(false);
    expect(e.motivo).toMatch(/variável/);
  });

  it("aplica offset quando toda palavra atrasa a mesma medida contra o áudio", () => {
    const base = [0, 1000, 2000, 3000, 4000, 5000];
    const palavras = base.map((b, i) => p(`w${i}`, b + 200, b + 400).w ? { w: `w${i}`, start: b + 200, end: b + 400 } : ({} as PalavraTempo));
    const e = estimarOffset(palavras, base.map((b) => ({ inicio: b, fim: b + 200 })));
    expect(e.sistematico).toBe(true);
    expect(e.medianaMs).toBe(200);
    expect(aplicarOffset(palavras, e)[0]!.start).toBe(0);
  });

  it("desvio pequeno (< 80ms) é imperceptível e não vira número mágico", () => {
    const base = [0, 1000, 2000, 3000, 4000, 5000];
    const palavras = base.map((b, i) => ({ w: `w${i}`, start: b + 40, end: b + 240 }));
    const e = estimarOffset(palavras, base.map((b) => ({ inicio: b, fim: b + 200 })));
    expect(e.sistematico).toBe(false);
  });
});

describe("C/D/E — agrupamento antigo × novo", () => {
  it("o agrupamento antigo quebrava por tamanho, no meio do sintagma", () => {
    const antigo = textos(segmentarLegado(FALA_REAL));
    // regra antiga: 34 chars / 7 palavras — corta onde a fala não pausa
    expect(antigo.some((t) => /\b(o|de|uma|e)$/i.test(t.replace(/[.,]$/, "")))).toBe(true);
  });

  it("o novo agrupa por frase e pausa real", () => {
    expect(textos(segmentarLegendas(FALA_REAL))).toEqual([
      "Pra quem não me conhece,",
      "eu sou o Lucas.",
      "Eu sou engenheiro civil,",
      "e o mais engraçado é que hoje",
      "eu tenho uma agência de viagens.",
    ]);
  });

  it("nenhum bloco termina em artigo, preposição, pronome ou numeral", () => {
    for (const t of textos(segmentarLegendas(FALA_REAL))) {
      expect(/\b(o|a|de|da|do|um|uma|que|e|eu|meu|é|para|pra|com|em)$/i.test(t.replace(/[.,!?]$/, ""))).toBe(false);
    }
  });

  it("respeita os limites visuais do preset (2 linhas, largura, duração)", () => {
    for (const b of segmentarLegendas(FALA_REAL)) {
      const t = b.map((x) => x.w).join(" ");
      expect(t.length).toBeLessThanOrEqual(LIMITES_PADRAO.maxChars);
      expect(b.length).toBeLessThanOrEqual(LIMITES_PADRAO.maxPalavras);
      expect(linhasVisuais(b, LIMITES_PADRAO).length).toBeLessThanOrEqual(2);
      expect(b[b.length - 1]!.end - b[0]!.start).toBeLessThanOrEqual(LIMITES_PADRAO.maxDuracao);
    }
  });

  it("a auditoria mostra antigo × novo com tempos", () => {
    const a = auditarSegmentacao(FALA_REAL);
    expect(a.palavras).toHaveLength(26);
    expect(a.antigo.length).toBeGreaterThan(a.novo.length - 2);
    expect(a.novo[0]).toMatchObject({ texto: "Pra quem não me conhece,", start: 0, end: 1080 });
    expect(a.novo[0]!.exibidoDe).toBeLessThanOrEqual(0);
  });
});

describe("coesão sintática", () => {
  it("proíbe quebra entre artigo/preposição/pronome e o que vem depois", () => {
    expect(quebraProibida(p("o", 0, 100), p("Lucas", 110, 400))).toBe(true);
    expect(quebraProibida(p("de", 0, 100), p("viagens", 110, 400))).toBe(true);
    expect(quebraProibida(p("eu", 0, 100), p("tenho", 110, 400))).toBe(true);
  });

  it("proíbe quebra entre número e unidade, e dentro de nome próprio composto", () => {
    expect(quebraProibida(p("10", 0, 100), p("dias", 110, 300))).toBe(true);
    expect(quebraProibida(p("Foz", 0, 100), p("Iguaçu", 110, 300))).toBe(true);
    expect(quebraProibida(p("a", 0, 100), p("gente", 110, 300))).toBe(true);
  });

  it("libera a quebra quando existe pontuação real", () => {
    expect(quebraProibida(p("conhece,", 0, 100), p("eu", 110, 300))).toBe(false);
    expect(quebraProibida(p("Lucas.", 0, 100), p("Eu", 110, 300))).toBe(false);
  });

  it("frase longa sem pontuação quebra no melhor ponto sintático", () => {
    const fala = [
      p("então", 0, 300), p("eu", 320, 420), p("fui", 430, 620), p("para", 630, 760),
      p("a", 770, 810), p("praia", 820, 1200), p("com", 1250, 1400), p("a", 1410, 1450),
      p("minha", 1460, 1700), p("família", 1710, 2200), p("no", 2210, 2320),
      p("final", 2330, 2600), p("de", 2610, 2680), p("semana", 2690, 3100),
    ];
    for (const t of textos(segmentarLegendas(fala))) {
      expect(/\b(a|para|com|no|de|minha|eu)$/i.test(t)).toBe(false);
    }
  });
});

describe("F/G — padding visual", () => {
  it("start/end do bloco vêm das palavras; o padding nunca corta a fala", () => {
    const blocos = segmentarLegendas(FALA_REAL);
    const ints = aplicarPadding(blocos);
    blocos.forEach((b, i) => {
      expect(ints[i]!.start).toBeLessThanOrEqual(b[0]!.start);
      expect(ints[i]!.end).toBeGreaterThanOrEqual(b[b.length - 1]!.end);
    });
  });

  it("padding não invade o bloco seguinte nem cria sobreposição", () => {
    const ints = aplicarPadding(segmentarLegendas(FALA_REAL));
    for (let i = 1; i < ints.length; i++) {
      expect(ints[i]!.start).toBeGreaterThanOrEqual(ints[i - 1]!.end);
    }
  });

  it("sem silêncio disponível o padding simplesmente não acontece", () => {
    const colado = [p("um", 0, 400), p("dois.", 400, 800), p("Três", 800, 1200), p("quatro.", 1200, 1600)];
    const blocos = segmentarLegendas(colado);
    const ints = aplicarPadding(blocos);
    expect(ints[0]!.start).toBe(0);
    for (let i = 1; i < ints.length; i++) expect(ints[i]!.start).toBeGreaterThanOrEqual(ints[i - 1]!.end);
  });

  it("lead-in é conservador e configurável", () => {
    const ints = aplicarPadding(segmentarLegendas(FALA_REAL), { ...LIMITES_PADRAO, leadInMs: 0, leadOutMs: 0 });
    const blocos = segmentarLegendas(FALA_REAL);
    expect(ints[1]!.start).toBe(blocos[1]![0]!.start);
  });
});

describe("pausas acústicas e velocidade", () => {
  it("gap curto continua a frase, gap longo abre bloco novo", () => {
    const curto = [p("eu", 0, 200), p("quero", 250, 600), p("viajar", 650, 1100)];
    expect(unidadesDeFala(curto)).toHaveLength(1);
    const longo = [p("eu", 0, 200), p("quero", 250, 600), p("hoje", 1400, 1800)];
    expect(unidadesDeFala(longo)).toHaveLength(2);
  });

  it("thresholds são configuráveis (não são número mágico escondido)", () => {
    const fala = [p("viajei", 0, 200), p("ontem", 900, 1200)];
    expect(unidadesDeFala(fala, { ...LIMITES_PADRAO, pausaFrase: 2000 })).toHaveLength(1);
    expect(unidadesDeFala(fala, { ...LIMITES_PADRAO, pausaFrase: 300 })).toHaveLength(2);
  });

  it("fala em 2x mantém o mesmo agrupamento (só os tempos encolhem)", () => {
    const rapido = FALA_REAL.map((x) => ({ ...x, start: Math.round(x.start / 2), end: Math.round(x.end / 2) }));
    const lento = FALA_REAL.map((x) => ({ ...x, start: x.start * 2, end: x.end * 2 }));
    expect(textos(segmentarLegendas(rapido, { ...LIMITES_PADRAO, pausaFrase: 250, pausaVirgula: 75 }))).toEqual(
      textos(segmentarLegendas(FALA_REAL)),
    );
    expect(textos(segmentarLegendas(lento, { ...LIMITES_PADRAO, maxDuracao: 8400 }))).toEqual(
      textos(segmentarLegendas(FALA_REAL)),
    );
  });

  it("corte da timeline é fronteira: palavras de clipes diferentes nunca se juntam", () => {
    const cortado = [
      p("eu", 0, 200, "c1"), p("sou", 210, 420, "c1"),
      p("o", 430, 480, "c2"), p("Lucas.", 490, 900, "c2"),
    ];
    for (const b of segmentarLegendas(cortado)) {
      expect(new Set(b.map((x) => x.clipId)).size).toBe(1);
    }
  });

  it("bloco curtíssimo residual é absorvido, mas fala curta real continua sozinha", () => {
    const residuo = [p("olha", 0, 300), p("só", 310, 420), p("que", 430, 520), p("legal.", 530, 1000)];
    expect(segmentarLegendas(residuo)).toHaveLength(1);
    const isolada = [p("Não.", 0, 400), p("Eu", 1600, 1750), p("acho", 1760, 2100), p("que", 2110, 2200), p("sim.", 2210, 2600)];
    expect(textos(segmentarLegendas(isolada))[0]).toBe("Não.");
  });
});
