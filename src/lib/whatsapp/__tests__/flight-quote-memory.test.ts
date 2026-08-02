import { describe, expect, it } from "vitest";
import {
  detectAirlineFilters,
  detectBaggageIntent,
  detectComparisonIntent,
  detectComparisonType,
  detectCustomerChoice,
  detectDurationComparisonIntent,
  detectResendIntent,
  detectSearchFilterIntent,
  resolveOptionReference,
  type QuoteMemory,
  type QuoteOptionMemory,
} from "../flight-quote-memory.server";

const opcao = (i: number, cia: string, saida: string, chegada: string, duracao: string): QuoteOptionMemory => ({
  quote_id: "q1",
  option_index: i,
  companhia: cia,
  saida,
  chegada,
  data_ida: "2026-09-15",
  volta_saida: null,
  volta_chegada: null,
  paradas: i === 1 ? 0 : 1,
  duracao,
  bagagem_despachada: false,
  valor: 1000 + i * 100,
  valor_formatado: `R$ ${1000 + i * 100},00`,
  destaque: "",
  enviada_em: "2026-09-01T10:00:00Z",
  agente: "Paula",
  opcao: {} as QuoteOptionMemory["opcao"],
});

const memorias: QuoteMemory[] = [
  {
    quote_id: "q1",
    criada_em: new Date().toISOString(),
    atual: true,
    cancelada: false,
    escolha_option_index: null,
    rota: "Curitiba → Recife",
    origem_termos: ["Curitiba", "CWB"],
    destino_termos: ["Recife", "REC"],
    idade_horas: 1,
    data_ida: "2026-09-15",
    data_volta: null,
    passageiros: "2 adulto(s)",
    agente_slug: "paula",
    agente_nome: "Paula",
    filtros: null,
    opcoes: [
      opcao(1, "Azul", "08:10", "12:30", "4h20"),
      opcao(2, "Latam", "10:00", "13:10", "3h10"),
    ],
    pendentes: [],
  },
];

describe("comparação por duração", () => {
  const frases = [
    "qual demora menos",
    "qual leva menos tempo",
    "qual é mais rápida",
    "qual tem menor duração",
    "qual viagem é mais curta",
  ];
  it.each(frases)("detecta duração em %s", (f) => {
    expect(detectDurationComparisonIntent(f)).toEqual({ comparison_type: "duration" });
    expect(detectComparisonIntent(f)).toBe("menor_duracao");
    expect(detectComparisonType(f)).toBe("duration");
  });

  it("nunca vira escolha", () => {
    const c = detectCustomerChoice(memorias, "qual demora menos?");
    expect(c?.clara).toBe(false);
    expect(c?.comparison_type).toBe("duration");
  });

  it("resolve a opção de menor duração", () => {
    const ref = resolveOptionReference(memorias, "qual demora menos?");
    expect(ref?.option_index).toBe(2);
    expect(ref?.match).toBe("comparacao");
  });
});

describe("filtros de companhia", () => {
  it.each(["sem Gol", "não quero Gol", "evita Gol", "qualquer uma menos Gol", "tira a Gol"])(
    "exclui em %s",
    (f) => {
      expect(detectAirlineFilters(f).companhias_excluidas?.map((c) => c.toLowerCase())).toContain("gol");
      expect(detectAirlineFilters(f).companhias_incluidas).toBeUndefined();
    },
  );

  it("inclui em 'pode ser Azul ou Latam'", () => {
    const r = detectAirlineFilters("pode ser Azul ou Latam");
    expect(r.companhias_incluidas?.map((c) => c.toLowerCase())).toEqual(["azul", "latam"]);
  });

  it.each(["prefiro Azul", "quero Latam"])("inclui em %s", (f) => {
    expect(detectAirlineFilters(f).companhias_incluidas?.length).toBe(1);
  });

  it("expõe o filtro na intenção de pesquisa", () => {
    expect(detectSearchFilterIntent("sem Gol")?.companhias_excluidas?.length).toBe(1);
  });
});

describe("bagagem", () => {
  it("consultar", () => {
    expect(detectBaggageIntent("essa tem bagagem?")).toBe("consultar");
  });
  it("incluir", () => {
    expect(detectBaggageIntent("quanto fica com bagagem?")).toBe("incluir");
    expect(detectBaggageIntent("quero com uma mala de 23kg")).toBe("incluir");
  });
  it("remover", () => {
    expect(detectBaggageIntent("sem bagagem fica quanto?")).toBe("remover");
    expect(detectBaggageIntent("só bagagem de mão")).toBe("remover");
  });
  it("pergunta de bagagem nunca é decisão", () => {
    const c = detectCustomerChoice(memorias, "a da Azul, quanto fica com bagagem?");
    expect(c?.clara).toBe(false);
    expect(c?.bagagem_intent).toBe("incluir");
  });
});

describe("decisão", () => {
  it.each(["fico com a segunda", "quero essa", "pode emitir a primeira", "pode fechar a segunda"])(
    "marca escolha clara em %s",
    (f) => {
      expect(detectCustomerChoice(memorias, f)?.clara).toBe(true);
    },
  );
});

describe("continuidade da referência", () => {
  const ultima = { quote_id: "q1", option_index: 2, companhia: "Latam", assunto: "bagagem" };
  it.each(["essa tem bagagem?", "quanto fica?", "e a conexão?", "quanto demora?", "ela chega cedo?"])(
    "mantém a opção ativa em %s",
    (f) => {
      const ref = resolveOptionReference(memorias, f, ultima);
      expect(ref?.option_index).toBe(2);
    },
  );
});

describe("reenvio", () => {
  it.each(["manda ela de novo", "reenvia aquela", "manda aquela opção novamente", "pode reenviar"])(
    "detecta reenvio em %s",
    (f) => {
      expect(detectResendIntent(f)).toBe(true);
    },
  );
  it("reenvio por pronome mantém a última referência", () => {
    const ref = resolveOptionReference(memorias, "manda ela de novo", {
      quote_id: "q1",
      option_index: 1,
      companhia: "Azul",
      assunto: null,
    });
    expect(ref?.option_index).toBe(1);
  });
});
