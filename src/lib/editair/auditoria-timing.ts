/**
 * Auditoria de TIMING das palavras — mede antes de corrigir.
 *
 * Este módulo não altera o relógio de ninguém. Ele só responde, com número:
 *   1. os timestamps recebidos são temporalmente possíveis?
 *   2. cada palavra caiu dentro do bloco (chunk) de onde ela veio?
 *   3. quanto elas erram contra os inícios de fala reais medidos no áudio (VAD)?
 *
 * Resultado inválido = transcrição rejeitada antes de virar legenda.
 */

export type PalavraAuditada = {
  w: string;
  /** tempo ABSOLUTO na fonte, em ms */
  start: number;
  end: number;
  conf?: number;
  /** janela do bloco de onde a palavra veio (ms absolutos) */
  chunkIni?: number;
  chunkFim?: number;
};

export type OnsetFala = { inicio: number; fim: number };

export type MetricasTiming = {
  total: number;
  amostras: number;
  erroMedianoMs: number;
  erroP95Ms: number;
  maiorErroMs: number;
  foraDeOrdem: number;
  acima250: number;
  acima500: number;
  acima1000: number;
  /** palavras em região completamente errada (fora do bloco de origem ou fora do áudio) */
  regiaoErrada: number;
};

export type ValidacaoTiming = {
  valida: boolean;
  metricas: MetricasTiming;
  motivos: string[];
};

const mediana = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : Math.round((s[m - 1]! + s[m]!) / 2);
};

const percentil = (xs: number[], p: number) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))]!;
};

/**
 * Converte o tempo devolvido pelo modelo (SEGUNDOS relativos ao bloco) em ms
 * absolutos da fonte. Aplicado UMA vez, no ponto único de entrada.
 * Ex.: bloco 60_000ms, palavra em 13.4s → 73_400ms (nunca 13_400).
 */
export const absolutizar = (segundosRelativos: number, offsetMs: number) =>
  Math.round(segundosRelativos * 1000) + offsetMs;

/** A palavra pertence mesmo ao bloco que a produziu? (tolerância de borda) */
export function dentroDoBloco(p: PalavraAuditada, toleranciaMs = 1500) {
  if (p.chunkIni == null || p.chunkFim == null) return true;
  return p.start >= p.chunkIni - toleranciaMs && p.start <= p.chunkFim + toleranciaMs;
}

/**
 * Mede o erro das palavras contra os inícios de fala detectados no áudio.
 * Cada onset é comparado com a palavra mais próxima em tempo.
 */
export function medirContraVad(palavras: PalavraAuditada[], onsets: OnsetFala[]): number[] {
  const erros: number[] = [];
  for (const o of onsets) {
    let melhor = Infinity;
    for (const p of palavras) {
      const d = Math.abs(p.start - o.inicio);
      if (d < melhor) melhor = d;
    }
    if (Number.isFinite(melhor)) erros.push(melhor);
  }
  return erros;
}

export function medirTiming(
  palavras: PalavraAuditada[],
  onsets: OnsetFala[],
  duracaoFonteMs: number,
): MetricasTiming {
  let foraDeOrdem = 0;
  let regiaoErrada = 0;
  for (let i = 0; i < palavras.length; i++) {
    const p = palavras[i]!;
    const a = palavras[i - 1];
    if (a && p.start < a.start) foraDeOrdem++;
    if (!dentroDoBloco(p) || p.start < 0 || (duracaoFonteMs > 0 && p.start > duracaoFonteMs + 1500)) regiaoErrada++;
  }
  const erros = medirContraVad(palavras, onsets);
  return {
    total: palavras.length,
    amostras: erros.length,
    erroMedianoMs: mediana(erros),
    erroP95Ms: percentil(erros, 0.95),
    maiorErroMs: erros.length ? Math.max(...erros) : 0,
    foraDeOrdem,
    acima250: erros.filter((e) => e > 250).length,
    acima500: erros.filter((e) => e > 500).length,
    acima1000: erros.filter((e) => e > 1000).length,
    regiaoErrada,
  };
}

/**
 * Critério de aceite para legenda estilo karaokê.
 * Rejeita o que é temporalmente impossível — não tenta consertar.
 */
export function validarTiming(
  palavras: PalavraAuditada[],
  onsets: OnsetFala[],
  duracaoFonteMs: number,
): ValidacaoTiming {
  const m = medirTiming(palavras, onsets, duracaoFonteMs);
  const motivos: string[] = [];
  if (!m.total) motivos.push("transcrição vazia");
  if (m.regiaoErrada > 0)
    motivos.push(`${m.regiaoErrada} palavra(s) em região impossível (fora do bloco de origem ou do áudio)`);
  if (m.total && m.foraDeOrdem / m.total > 0.02)
    motivos.push(`${m.foraDeOrdem} palavra(s) fora de ordem`);
  if (m.amostras >= 5 && m.erroMedianoMs > 400)
    motivos.push(`erro mediano de ${m.erroMedianoMs}ms contra a fala real`);
  if (m.amostras >= 5 && m.erroP95Ms > 1500)
    motivos.push(`P95 de ${m.erroP95Ms}ms contra a fala real`);
  return { valida: motivos.length === 0, metricas: m, motivos };
}

export type LinhaComparacao = {
  palavra: string;
  real: number | null;
  a: number;
  b: number | null;
  difA: number | null;
  difB: number | null;
};

/** Tabela A/B: mesma fala, dois provedores, contra o onset real mais próximo. */
export function compararProvedores(
  a: PalavraAuditada[],
  b: PalavraAuditada[],
  onsets: OnsetFala[],
): LinhaComparacao[] {
  const maisProximo = (t: number) => {
    let melhor: number | null = null;
    for (const o of onsets) if (melhor == null || Math.abs(o.inicio - t) < Math.abs(melhor - t)) melhor = o.inicio;
    return melhor;
  };
  return a.map((p, i) => {
    const par = b[i] ?? null;
    const real = maisProximo(p.start);
    return {
      palavra: p.w,
      real,
      a: p.start,
      b: par ? par.start : null,
      difA: real == null ? null : p.start - real,
      difB: real == null || !par ? null : par.start - real,
    };
  });
}
