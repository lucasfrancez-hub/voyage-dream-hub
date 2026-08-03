/**
 * Análise multimodal de imagens recebidas pelo WhatsApp.
 * SERVER-ONLY.
 *
 * Infraestrutura COMUM a todos os agentes (consultores, Central de
 * Especialistas e pós-venda): a leitura acontece na ingestão da mensagem,
 * antes de qualquer agente rodar, e o resultado entra no conteúdo da
 * mensagem — logo, na memória do protocolo e no contexto de qualquer agente.
 */

const MODEL = "openai/gpt-5.4";
const MAX_BYTES = 12 * 1024 * 1024; // limite defensivo pro data URL
const TIMEOUT_MS = 25_000;

/** Marcador que carrega a leitura da imagem dentro do conteúdo da mensagem. */
export const ANALISE_TAG = "[[analise-imagem]]";

/** Tipos que o modelo multimodal consegue ler diretamente. */
export function isAnalyzableImage(mimeType: string): boolean {
  const base = mimeType.split(";")[0].trim().toLowerCase();
  return (
    base === "image/jpeg" ||
    base === "image/jpg" ||
    base === "image/png" ||
    base === "image/webp" ||
    base === "image/gif" ||
    base === "image/heic" ||
    base === "image/heif"
  );
}

const PROMPT = `Você é o módulo de visão da VIA AIR (agência de viagens). Leia a imagem enviada por um cliente no WhatsApp e extraia TUDO que for útil pro atendimento.

A imagem pode ser: print de site, print de companhia aérea (Gol, Latam, Azul, Google Flights, Decolar), print de hotel (Booking, Airbnb), print de reserva, print de app, print de erro, print de conversa, documento fotografado, comprovante, voucher, bilhete, cartão de embarque, QR Code, mapa, tabela, arte, foto de produto ou objeto.

Responda em português, em texto puro, sem markdown, no formato:

TIPO: <o que é a imagem>
LEITURA: <resumo do que está escrito/mostrado>
DADOS:
- <cada dado relevante em uma linha>

Regras:
- Transcreva números exatamente como aparecem (valores, datas, horários, códigos de aeroporto, localizadores, voo, CPF, documento, número de reserva).
- Voos: companhia, origem e destino (com IATA quando visível), data, horário de partida e chegada, duração, paradas/conexões, bagagem e preço por adulto e total.
- Hotéis: nome, cidade, datas de check-in e check-out, tipo de quarto, regime, número de hóspedes e valor.
- Prints de conversa: transcreva as mensagens na ordem, indicando quem falou.
- Documentos/comprovantes/bilhetes: nome, documento, datas, valores, localizador.
- Erros: transcreva a mensagem de erro exata.
- Imagem sem texto: descreva objetivamente o que aparece.
- Se algo estiver ilegível, escreva exatamente ILEGÍVEL nessa linha — nunca invente.
- Se a imagem inteira estiver ilegível, responda apenas: ILEGIVEL`;

export type ImageAnalysis = {
  ok: boolean;
  texto: string | null;
  ilegivel: boolean;
  erro?: string;
};

/** Envia a imagem ao modelo multimodal e devolve a leitura estruturada. */
export async function analyzeImage(params: {
  blob: Blob;
  mimeType: string;
  caption?: string | null;
  contexto?: string | null;
  conversationId?: string;
}): Promise<ImageAnalysis> {
  const { blob, mimeType, caption, contexto, conversationId } = params;
  const key = process.env.LOVABLE_API_KEY;
  const log = (event: string, extra: Record<string, unknown> = {}) =>
    console.log(
      JSON.stringify({
        event,
        conversation_id: conversationId ?? null,
        mime_type: mimeType,
        bytes: blob.size,
        at: new Date().toISOString(),
        ...extra,
      }),
    );

  if (!key) {
    log("image_analysis_failed", { reason: "missing_api_key" });
    return { ok: false, texto: null, ilegivel: false, erro: "missing_api_key" };
  }
  if (!isAnalyzableImage(mimeType)) {
    log("image_analysis_skipped", { reason: "unsupported_mime" });
    return { ok: false, texto: null, ilegivel: false, erro: "unsupported_mime" };
  }
  if (blob.size > MAX_BYTES) {
    log("image_analysis_failed", { reason: "too_large" });
    return { ok: false, texto: null, ilegivel: false, erro: "too_large" };
  }

  log("image_analysis_started");
  const started = Date.now();

  try {
    const base64 = bytesToBase64(new Uint8Array(await blob.arrayBuffer()));
    const dataUrl = `data:${mimeType.split(";")[0].trim()};base64,${base64}`;

    const partesTexto = [PROMPT];
    if (caption?.trim()) partesTexto.push(`\nLegenda enviada pelo cliente: ${caption.trim()}`);
    if (contexto?.trim()) partesTexto.push(`\nContexto atual da conversa: ${contexto.trim()}`);

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        signal: ctrl.signal,
        body: JSON.stringify({
          model: MODEL,
          input: [
            {
              role: "user",
              content: [
                { type: "input_text", text: partesTexto.join("\n") },
                { type: "input_image", image_url: dataUrl },
              ],
            },
          ],
        }),
      });
    } finally {
      clearTimeout(timer);
    }

    const raw = await res.text();
    if (!res.ok) {
      log("image_analysis_failed", { reason: "gateway_error", status: res.status, body: raw.slice(0, 300) });
      return { ok: false, texto: null, ilegivel: false, erro: `gateway_${res.status}` };
    }

    const data = JSON.parse(raw) as {
      output_text?: string;
      output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
      choices?: Array<{ message?: { content?: string } }>;
    };
    const texto = (
      data.output_text ??
      data.output
        ?.flatMap((item) => item.content ?? [])
        .filter((part) => part?.type === "output_text" || typeof part?.text === "string")
        .map((part) => part.text ?? "")
        .join("") ??
      data.choices?.[0]?.message?.content ??
      ""
    ).trim();
    if (!texto) {
      log("image_analysis_failed", { reason: "empty_response" });
      return { ok: false, texto: null, ilegivel: false, erro: "empty_response" };
    }

    const ilegivel = /^ileg[ií]vel\.?$/i.test(texto.trim());
    log("image_analysis_completed", {
      duration_ms: Date.now() - started,
      ilegivel,
      chars: texto.length,
      extracted_preview: texto.replace(/\s+/g, " ").slice(0, 220),
    });
    if (ilegivel) log("image_analysis_unreadable");

    return { ok: true, texto, ilegivel };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log("image_analysis_failed", { reason: "exception", message: msg.slice(0, 200) });
    return { ok: false, texto: null, ilegivel: false, erro: "exception" };
  }
}

/**
 * Bloco que entra no conteúdo da mensagem para que TODOS os agentes leiam
 * a imagem como parte normal do histórico do protocolo.
 */
export function buildAnalysisBlock(analysis: ImageAnalysis): string {
  if (analysis.ok && analysis.texto && !analysis.ilegivel) {
    return `${ANALISE_TAG} O cliente enviou uma imagem e ela JÁ FOI LIDA. Use estes dados como se o cliente tivesse digitado. NUNCA peça print, foto ou imagem de novo.\n${analysis.texto}`;
  }
  if (analysis.ok && analysis.ilegivel) {
    return `${ANALISE_TAG} A imagem foi processada mas está ilegível. Só agora é permitido pedir uma imagem melhor: diga que tentou ler e peça mais resolução ou um recorte da parte importante.`;
  }
  return `${ANALISE_TAG} Falha técnica ao ler a imagem (${analysis.erro ?? "desconhecida"}). Diga que tentou abrir a imagem e não conseguiu, e peça para reenviar.`;
}

/** true quando o conteúdo da mensagem já carrega uma leitura de imagem. */
export function hasImageAnalysis(content: string | null | undefined): boolean {
  return !!content && content.includes(ANALISE_TAG);
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}
