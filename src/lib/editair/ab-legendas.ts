/**
 * TESTE A/B — Gemini (estimativa de LLM) × Whisper local (alinhamento acústico).
 *
 * Roda os dois caminhos sobre o MESMO áudio e mede cada um contra os onsets
 * de fala reais detectados no sinal (VAD). Nada aqui altera o projeto.
 */
import { calcularEnvelope, detectarFala, paraWav16k, blobParaBase64 } from "./audio";
import { medirTiming, type MetricasTiming, type PalavraAuditada } from "./auditoria-timing";
import { pontoDesktop } from "./desktop";
import { transcreverBlocoEditair } from "./transcribe.functions";

export type ResultadoAB = {
  duracaoMs: number;
  onsets: number;
  gemini: { metricas: MetricasTiming; palavras: number; ms: number; erro?: string } | null;
  whisper: { metricas: MetricasTiming; palavras: number; ms: number; modelo: string; cache: boolean; erro?: string } | null;
  veredito: string;
};

async function rodarGemini(buf: AudioBuffer): Promise<{ palavras: PalavraAuditada[]; ms: number }> {
  const total = buf.duration * 1000;
  const bloco = 60_000;
  const palavras: PalavraAuditada[] = [];
  const t0 = performance.now();
  for (let ini = 0; ini < total; ini += bloco) {
    const fim = Math.min(total, ini + bloco);
    const b64 = await blobParaBase64(paraWav16k(buf, ini, fim));
    const r = await transcreverBlocoEditair({ data: { audioBase64: b64, offsetMs: Math.round(ini), idioma: "pt" } });
    for (const w of r.words) palavras.push({ ...w, chunkIni: Math.round(ini), chunkFim: Math.round(fim) });
  }
  return { palavras, ms: Math.round(performance.now() - t0) };
}

export async function executarAB(opcoes: {
  buf: AudioBuffer;
  caminhoLocal?: string | null;
  idioma?: string;
}): Promise<ResultadoAB> {
  const { buf, caminhoLocal, idioma = "pt" } = opcoes;
  const duracaoMs = Math.round(buf.duration * 1000);
  const { regioes } = detectarFala(calcularEnvelope(buf));
  const onsets = regioes.map((r) => ({ inicio: r.start, fim: r.end }));

  let gemini: ResultadoAB["gemini"] = null;
  let whisper: ResultadoAB["whisper"] = null;

  try {
    const g = await rodarGemini(buf);
    gemini = { metricas: medirTiming(g.palavras, onsets, duracaoMs), palavras: g.palavras.length, ms: g.ms };
  } catch (e) {
    gemini = {
      metricas: medirTiming([], onsets, duracaoMs),
      palavras: 0,
      ms: 0,
      erro: e instanceof Error ? e.message : String(e),
    };
  }

  const api = pontoDesktop();
  if (api?.transcricao && caminhoLocal) {
    try {
      const t0 = performance.now();
      const r = await api.transcricao.local({ caminho: caminhoLocal, idioma, ignorarCache: true });
      const palavras: PalavraAuditada[] = r.words.map((w) => ({ ...w, chunkIni: 0, chunkFim: duracaoMs }));
      whisper = {
        metricas: medirTiming(palavras, onsets, duracaoMs),
        palavras: palavras.length,
        ms: Math.round(performance.now() - t0),
        modelo: r.modelo,
        cache: r.cache,
      };
    } catch (e) {
      whisper = {
        metricas: medirTiming([], onsets, duracaoMs),
        palavras: 0,
        ms: 0,
        modelo: "-",
        cache: false,
        erro: e instanceof Error ? e.message : String(e),
      };
    }
  }

  const veredito = !whisper
    ? "Alinhador local indisponível (rode no EditAir Desktop com um arquivo local)."
    : whisper.metricas.erroMedianoMs <= (gemini?.metricas.erroMedianoMs ?? Infinity) &&
        whisper.metricas.regiaoErrada === 0
      ? `Whisper local vence: mediana ${whisper.metricas.erroMedianoMs}ms × ${gemini?.metricas.erroMedianoMs ?? "-"}ms, 0 palavra em região impossível.`
      : `Revisar: Whisper mediana ${whisper.metricas.erroMedianoMs}ms, região impossível ${whisper.metricas.regiaoErrada}.`;

  return { duracaoMs, onsets: onsets.length, gemini, whisper, veredito };
}
