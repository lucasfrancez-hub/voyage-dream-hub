/**
 * Alinhamento — auditoria e saneamento dos timestamps BRUTOS por palavra.
 *
 * Regra do projeto: nenhuma legenda é "consertada" com número mágico.
 * Antes de qualquer offset, este módulo mede o material real e diz de onde
 * vem o erro: timestamp da palavra, agrupamento, padding ou render.
 *
 * O que ele faz:
 *   1. audita a transcrição bruta (monotonicidade, sobreposição, quantização,
 *      duração por caractere, confiança);
 *   2. saneia o que é claramente inválido (ordem, overlap, duração <= 0);
 *   3. estima offset SOMENTE com evidência: compara o início de cada palavra
 *      com o início real da fala detectada no áudio (VAD/envelope). Só quando
 *      há amostras suficientes e desvio baixo o offset é considerado
 *      sistemático — caso contrário, offset = 0.
 */

export type PalavraBruta = { w: string; start: number; end: number; conf?: number; assetId?: string };

export type AuditoriaPalavras = {
  total: number;
  /** palavras fora de ordem em relação à anterior */
  foraDeOrdem: number;
  /** palavras que começam antes do fim da anterior */
  sobrepostas: number;
  /** palavras com duração <= 0 */
  duracaoInvalida: number;
  /** menor passo comum aparente dos timestamps (10ms = alinhamento fino, 100ms+ = grade grossa) */
  quantizacaoMs: number;
  /** ms por caractere — fala humana fica ~40-110ms/char; muito fora disso indica timestamp inventado */
  msPorCaractere: number;
  duracaoMediaMs: number;
  gapMedioMs: number;
  confiancaMedia: number | null;
  /** os timestamps podem ser usados como verdade? */
  confiavel: boolean;
  observacoes: string[];
};

const mediana = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

const mad = (xs: number[], med: number) => mediana(xs.map((x) => Math.abs(x - med)));

const mdc = (a: number, b: number): number => (b === 0 ? Math.abs(a) : mdc(b, a % b));

export function auditarPalavras(words: PalavraBruta[]): AuditoriaPalavras {
  const obs: string[] = [];
  const total = words.length;
  if (!total) {
    return {
      total: 0, foraDeOrdem: 0, sobrepostas: 0, duracaoInvalida: 0, quantizacaoMs: 0,
      msPorCaractere: 0, duracaoMediaMs: 0, gapMedioMs: 0, confiancaMedia: null,
      confiavel: false, observacoes: ["transcrição vazia"],
    };
  }
  let foraDeOrdem = 0;
  let sobrepostas = 0;
  let duracaoInvalida = 0;
  const gaps: number[] = [];
  const duracoes: number[] = [];
  let chars = 0;
  let passo = 0;
  for (let i = 0; i < words.length; i++) {
    const p = words[i]!;
    const a = words[i - 1];
    if (p.end <= p.start) duracaoInvalida++;
    else duracoes.push(p.end - p.start);
    chars += p.w.replace(/\s/g, "").length;
    if (a) {
      if (p.start < a.start) foraDeOrdem++;
      else if (p.start < a.end) sobrepostas++;
      else gaps.push(p.start - a.end);
    }
    passo = mdc(passo, Math.round(p.start));
    passo = mdc(passo, Math.round(p.end));
  }
  const duracaoMediaMs = Math.round(mediana(duracoes));
  const somaDur = duracoes.reduce((s, d) => s + d, 0);
  const msPorCaractere = chars ? Math.round(somaDur / chars) : 0;
  const confs = words.map((w) => w.conf).filter((c): c is number => typeof c === "number");
  const confiancaMedia = confs.length ? confs.reduce((s, c) => s + c, 0) / confs.length : null;
  const quantizacaoMs = passo || 1;

  if (foraDeOrdem) obs.push(`${foraDeOrdem} palavra(s) fora de ordem`);
  if (sobrepostas) obs.push(`${sobrepostas} palavra(s) sobrepostas à anterior`);
  if (duracaoInvalida) obs.push(`${duracaoInvalida} palavra(s) com duração <= 0`);
  if (quantizacaoMs >= 100) obs.push(`timestamps em grade de ${quantizacaoMs}ms (baixa resolução)`);
  if (msPorCaractere && (msPorCaractere < 25 || msPorCaractere > 160))
    obs.push(`${msPorCaractere}ms por caractere fora da faixa típica de fala (25-160)`);
  if (confiancaMedia != null && confiancaMedia < 0.6) obs.push(`confiança média baixa (${confiancaMedia.toFixed(2)})`);

  const confiavel =
    total > 0 &&
    foraDeOrdem === 0 &&
    duracaoInvalida / total < 0.05 &&
    sobrepostas / total < 0.1 &&
    quantizacaoMs < 100 &&
    (!msPorCaractere || (msPorCaractere >= 25 && msPorCaractere <= 160));

  return {
    total, foraDeOrdem, sobrepostas, duracaoInvalida, quantizacaoMs, msPorCaractere,
    duracaoMediaMs, gapMedioMs: Math.round(mediana(gaps)), confiancaMedia, confiavel,
    observacoes: obs.length ? obs : ["timestamps consistentes"],
  };
}

/** Duração mínima plausível de uma palavra, proporcional ao tamanho dela. */
const duracaoMinima = (w: string) => Math.max(60, Math.min(400, w.replace(/\s/g, "").length * 28));

/**
 * Saneia sem inventar: ordena, corrige duração <= 0 e desfaz sobreposição
 * empurrando o início da palavra seguinte (nunca mexendo no relógio global).
 */
export function normalizarPalavras(words: PalavraBruta[]): PalavraBruta[] {
  const ordenadas = words
    .filter((w) => w && typeof w.w === "string" && w.w.trim().length > 0 && Number.isFinite(w.start) && Number.isFinite(w.end))
    .map((w) => ({ ...w, w: w.w.trim(), start: Math.round(w.start), end: Math.round(w.end) }))
    .sort((a, b) => a.start - b.start || a.end - b.end);

  const saida: PalavraBruta[] = [];
  for (const p of ordenadas) {
    const a = saida[saida.length - 1];
    let start = Math.max(0, p.start);
    if (a && start < a.end) start = a.end;
    let end = p.end;
    if (end <= start) end = start + duracaoMinima(p.w);
    saida.push({ ...p, start, end });
  }
  return saida;
}

export type Onset = { inicio: number; fim: number };

export type EstimativaOffset = {
  amostras: number;
  medianaMs: number;
  dispersaoMs: number;
  /** só true quando há evidência real de latência constante */
  sistematico: boolean;
  motivo: string;
};

export const OFFSET_CONFIG = {
  /** mínimo de trechos de fala comparados para confiar na medida */
  minAmostras: 5,
  /** abaixo disso o desalinhamento é imperceptível — não mexer */
  minMs: 80,
  /** acima disso o erro é variável (não é offset, é alinhamento ruim) */
  maxDispersaoMs: 60,
  /** janela para casar a palavra com o início de fala correspondente */
  janelaMs: 700,
};

/**
 * Compara o start das palavras com o início real dos trechos de fala do áudio
 * (envelope/VAD). Se todas as palavras estão atrasadas na MESMA medida, existe
 * latência sistemática e o offset é legítimo. Se o erro varia, o problema é o
 * alinhamento palavra a palavra e offset global só pioraria.
 */
export function estimarOffset(
  palavras: PalavraBruta[],
  onsets: Onset[],
  cfg = OFFSET_CONFIG,
): EstimativaOffset {
  const diffs: number[] = [];
  for (const o of onsets) {
    // primeira palavra que começa dentro da janela ao redor deste início de fala
    const p = palavras.find((x) => x.start >= o.inicio - cfg.janelaMs && x.start <= o.inicio + cfg.janelaMs);
    if (p) diffs.push(p.start - o.inicio);
  }
  if (diffs.length < cfg.minAmostras) {
    return { amostras: diffs.length, medianaMs: 0, dispersaoMs: 0, sistematico: false, motivo: "amostras insuficientes para provar latência" };
  }
  const med = Math.round(mediana(diffs));
  const disp = Math.round(mad(diffs, med));
  if (Math.abs(med) < cfg.minMs)
    return { amostras: diffs.length, medianaMs: med, dispersaoMs: disp, sistematico: false, motivo: "desvio dentro do imperceptível" };
  if (disp > cfg.maxDispersaoMs)
    return { amostras: diffs.length, medianaMs: med, dispersaoMs: disp, sistematico: false, motivo: "erro variável: é alinhamento, não latência" };
  return { amostras: diffs.length, medianaMs: med, dispersaoMs: disp, sistematico: true, motivo: "latência constante medida contra o áudio" };
}

/** Aplica o offset SOMENTE quando a estimativa provou latência sistemática. */
export function aplicarOffset(palavras: PalavraBruta[], est: EstimativaOffset): PalavraBruta[] {
  if (!est.sistematico || !est.medianaMs) return palavras;
  const d = est.medianaMs;
  return palavras.map((p) => ({ ...p, start: Math.max(0, p.start - d), end: Math.max(1, p.end - d) }));
}

/** Tabela de auditoria (palavra | start | end | conf) para conferir contra o áudio. */
export function tabelaPalavras(palavras: PalavraBruta[], ate = 40) {
  return palavras.slice(0, ate).map((p, i) => ({
    i,
    palavra: p.w,
    start: p.start,
    end: p.end,
    duracao: p.end - p.start,
    gapAnterior: i > 0 ? p.start - palavras[i - 1]!.end : 0,
    conf: p.conf ?? null,
  }));
}
