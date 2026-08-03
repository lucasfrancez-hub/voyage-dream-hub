/**
 * Pipeline multimodal comum a todos os agentes.
 * Testes 1 a 7 do briefing, com o gateway multimodal mockado.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ANALISE_TAG,
  analyzeImage,
  buildAnalysisBlock,
  hasImageAnalysis,
  isAnalyzableImage,
} from "../image-vision.server";

const blob = (bytes = 64) => new Blob([new Uint8Array(bytes)], { type: "image/png" });

const mockGateway = (content: string) => {
  const fetchMock = vi.fn(async () =>
    new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
};

beforeEach(() => {
  process.env.LOVABLE_API_KEY = "test-key";
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("tipos aceitos", () => {
  it("aceita os formatos que o WhatsApp entrega", () => {
    for (const m of ["image/jpeg", "image/png", "image/webp", "image/heic", "image/jpeg; charset=binary"]) {
      expect(isAnalyzableImage(m)).toBe(true);
    }
    expect(isAnalyzableImage("audio/ogg")).toBe(false);
    expect(isAnalyzableImage("application/pdf")).toBe(false);
  });
});

describe("envio ao modelo multimodal", () => {
  it("manda texto + imagem (não só texto) para o gateway", async () => {
    const fetchMock = mockGateway("TIPO: print\nLEITURA: ok\nDADOS:\n- x");
    await analyzeImage({ blob: blob(), mimeType: "image/png", caption: "olha isso", conversationId: "c1" });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("/v1/chat/completions");
    const body = JSON.parse(String(init.body));
    const parts = body.messages[0].content;
    expect(Array.isArray(parts)).toBe(true);
    expect(parts.some((p: { type: string }) => p.type === "text")).toBe(true);
    const img = parts.find((p: { type: string }) => p.type === "image_url");
    expect(img.image_url.url.startsWith("data:image/png;base64,")).toBe(true);
    // a legenda do cliente acompanha a imagem
    expect(parts[0].text).toContain("olha isso");
  });

  it("nunca ignora a imagem por falta de texto", async () => {
    const fetchMock = mockGateway("TIPO: foto\nLEITURA: mala azul");
    const r = await analyzeImage({ blob: blob(), mimeType: "image/jpeg", caption: "" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(r.ok).toBe(true);
  });
});

describe("extração por tipo de imagem", () => {
  it("Teste 1 — print da Gol: companhia, horários, aeroportos, valor e data", async () => {
    mockGateway(
      [
        "TIPO: print do site da Gol",
        "LEITURA: seleção de voo de ida Maringa - Sao Paulo",
        "DADOS:",
        "- Companhia: GOL",
        "- Origem: MGF Maringa",
        "- Destino: CGH Sao Paulo",
        "- Data: ter. 11 ago. 2026",
        "- Partida: 14:45 / Chegada: 16:00",
        "- Voo direto, duracao 1H15M",
        "- Preco: R$ 730,65 por adulto (total ida R$ 730,65)",
      ].join("\n"),
    );
    const r = await analyzeImage({ blob: blob(), mimeType: "image/png" });
    const bloco = buildAnalysisBlock(r);
    for (const dado of ["GOL", "MGF", "CGH", "11 ago", "14:45", "730,65"]) {
      expect(bloco).toContain(dado);
    }
    expect(hasImageAnalysis(bloco)).toBe(true);
  });

  it("Teste 2 — print da LATAM", async () => {
    mockGateway("TIPO: print LATAM\nDADOS:\n- LATAM LA3090\n- GRU 08:10 -> REC 11:30\n- 12/09/2026\n- R$ 1.240,00");
    const bloco = buildAnalysisBlock(await analyzeImage({ blob: blob(), mimeType: "image/png" }));
    expect(bloco).toContain("LA3090");
    expect(bloco).toContain("1.240,00");
  });

  it("Teste 3 — print da Booking: hotel, datas e valores", async () => {
    mockGateway("TIPO: print Booking\nDADOS:\n- Hotel Grand Orlando\n- Check-in 10/12 / Check-out 15/12\n- Quarto duplo\n- R$ 3.200,00");
    const bloco = buildAnalysisBlock(await analyzeImage({ blob: blob(), mimeType: "image/webp" }));
    expect(bloco).toContain("Grand Orlando");
    expect(bloco).toContain("Check-in 10/12");
    expect(bloco).toContain("3.200,00");
  });

  it("Teste 4 — print de conversa", async () => {
    mockGateway("TIPO: print de conversa\nLEITURA:\n- Cliente: pode remarcar?\n- Cia: taxa de R$ 180,00");
    const bloco = buildAnalysisBlock(await analyzeImage({ blob: blob(), mimeType: "image/png" }));
    expect(bloco).toContain("pode remarcar?");
    expect(bloco).toContain("180,00");
  });

  it("Teste 5 — foto de documento", async () => {
    mockGateway("TIPO: RG fotografado\nDADOS:\n- Nome: MARIA SOUZA\n- CPF 123.456.789-00\n- Nascimento 04/07/1988");
    const bloco = buildAnalysisBlock(await analyzeImage({ blob: blob(), mimeType: "image/jpeg" }));
    expect(bloco).toContain("MARIA SOUZA");
    expect(bloco).toContain("04/07/1988");
  });

  it("Teste 6 — print de erro", async () => {
    mockGateway("TIPO: print de erro\nLEITURA: 'Pagamento recusado pelo emissor (cod. 51)'");
    const bloco = buildAnalysisBlock(await analyzeImage({ blob: blob(), mimeType: "image/png" }));
    expect(bloco).toContain("Pagamento recusado");
    expect(bloco).toContain("51");
  });

  it("Teste 7 — imagem sem texto", async () => {
    mockGateway("TIPO: foto de objeto\nLEITURA: mala de bordo cinza com rodinhas");
    const bloco = buildAnalysisBlock(await analyzeImage({ blob: blob(), mimeType: "image/jpeg" }));
    expect(bloco).toContain("mala de bordo");
    // o bloco sempre orienta a relacionar com a conversa e proíbe pedir print
    expect(bloco).toContain("NUNCA peça print");
  });
});

describe("nunca pedir print de novo", () => {
  it("imagem legível proíbe explicitamente pedir novo print", () => {
    const bloco = buildAnalysisBlock({ ok: true, texto: "TIPO: print", ilegivel: false });
    expect(bloco.startsWith(ANALISE_TAG)).toBe(true);
    expect(bloco).toContain("JÁ FOI LIDA");
    expect(bloco).toContain("NUNCA peça print");
  });

  it("só libera pedir outra imagem depois de tentativa real de leitura", () => {
    const bloco = buildAnalysisBlock({ ok: true, texto: "ILEGIVEL", ilegivel: true });
    expect(bloco).toContain("ilegível");
    expect(bloco).toContain("resolução");
  });

  it("falha técnica pede reenvio explicando a tentativa", () => {
    const bloco = buildAnalysisBlock({ ok: false, texto: null, ilegivel: false, erro: "gateway_500" });
    expect(bloco).toContain("gateway_500");
    expect(bloco).toContain("reenviar");
  });

  it("detecta a leitura dentro do conteúdo da mensagem do histórico", () => {
    const content = `[[media:image|https://x/y.png|print.png]]\n🖼️ [imagem recebida]\n${buildAnalysisBlock({ ok: true, texto: "TIPO: print Gol", ilegivel: false })}`;
    expect(hasImageAnalysis(content)).toBe(true);
    expect(hasImageAnalysis("mensagem só de texto")).toBe(false);
  });
});

describe("falhas não derrubam o atendimento", () => {
  it("sem chave, devolve falha controlada", async () => {
    delete process.env.LOVABLE_API_KEY;
    const r = await analyzeImage({ blob: blob(), mimeType: "image/png" });
    expect(r.ok).toBe(false);
    expect(r.erro).toBe("missing_api_key");
  });

  it("erro do gateway não lança exceção", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("boom", { status: 500 })));
    const r = await analyzeImage({ blob: blob(), mimeType: "image/png" });
    expect(r.ok).toBe(false);
    expect(r.erro).toBe("gateway_500");
  });
});
