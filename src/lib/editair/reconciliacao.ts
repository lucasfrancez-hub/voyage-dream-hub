/**
 * RECONCILIAÇÃO TEXTO × TIMING
 *
 * O tempo vem do alinhador acústico (whisper.cpp) e é IMUTÁVEL.
 * O Gemini só pode melhorar o TEXTO (ortografia, pontuação, maiúsculas,
 * nomes próprios). Aqui casamos o texto corrigido com as palavras alinhadas
 * preservando exatamente os intervalos originais.
 *
 * Ex.: whisper "via ar"  ->  Gemini "Via Air"
 *      resultado: mesmo start/end, texto novo.
 */

export type PalavraAlinhada = { w: string; start: number; end: number; conf?: number };

const normalizar = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]/gu, "");

/** Distância de edição simples (usada só em palavras curtas/médias). */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (!m || !n) return m || n;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n]!;
}

/**
 * FIDELIDADE À FALA: o revisor só pode mexer em acento/pontuação/caixa e em
 * erro evidente de grafia da MESMA palavra. Troca de palavra ("pra" -> "para",
 * "a gente" -> "nós") ou reescrita é rejeitada.
 */
function variacaoPermitida(original: string, novo: string): boolean {
  const a = normalizar(original);
  const b = normalizar(novo);
  if (a === b) return true; // só mudou acento, caixa ou pontuação
  if (!a || !b) return false;
  // grafia evidente: palavras longas, diferença mínima e mesmo início
  if (Math.min(a.length, b.length) >= 5 && a[0] === b[0] && levenshtein(a, b) <= 1) return true;
  return false;
}

/** Token sem letras nem números (pontuação solta) pode ser inserido. */
const soPontuacao = (t: string) => normalizar(t).length === 0;


/** Divide o texto corrigido em tokens visíveis (mantendo pontuação colada). */
export function tokenizar(texto: string): string[] {
  return texto
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
}

type Passo = { i: number; j: number }; // pares casados (whisper i, gemini j)

/** LCS com banda: preserva a ordem e não explode em áudio longo. */
function casar(a: string[], b: string[], banda = 80): Passo[] {
  const n = a.length;
  const m = b.length;
  if (!n || !m) return [];
  const larg = 2 * banda + 1;
  const dp = new Int32Array((n + 1) * larg);
  const idx = (i: number, j: number) => {
    const d = j - i + banda;
    return d < 0 || d >= larg ? -1 : i * larg + d;
  };
  for (let i = n - 1; i >= 0; i--) {
    for (let d = larg - 1; d >= 0; d--) {
      const j = i + d - banda;
      if (j < 0 || j > m) continue;
      const p = i * larg + d;
      if (j === m) {
        dp[p] = 0;
        continue;
      }
      const pulaA = idx(i + 1, j);
      const pulaB = idx(i, j + 1);
      const diag = idx(i + 1, j + 1);
      const igual = a[i] === b[j] && a[i] !== "";
      let melhor = 0;
      if (igual && diag >= 0) melhor = dp[diag]! + 1;
      if (pulaA >= 0) melhor = Math.max(melhor, dp[pulaA]!);
      if (pulaB >= 0) melhor = Math.max(melhor, dp[pulaB]!);
      dp[p] = melhor;
    }
  }
  const pares: Passo[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    const aqui = idx(i, j);
    if (aqui < 0) break;
    const diag = idx(i + 1, j + 1);
    if (a[i] === b[j] && a[i] !== "" && diag >= 0 && dp[aqui] === dp[diag]! + 1) {
      pares.push({ i, j });
      i++;
      j++;
      continue;
    }
    const pulaA = idx(i + 1, j);
    const pulaB = idx(i, j + 1);
    const va = pulaA >= 0 ? dp[pulaA]! : -1;
    const vb = pulaB >= 0 ? dp[pulaB]! : -1;
    if (va >= vb) i++;
    else j++;
  }
  return pares;
}

/** Reparte um intervalo entre vários textos, proporcional ao tamanho. */
function repartir(inicio: number, fim: number, textos: string[]): PalavraAlinhada[] {
  const total = textos.reduce((s, t) => s + Math.max(1, t.length), 0);
  const dur = Math.max(1, fim - inicio);
  const out: PalavraAlinhada[] = [];
  let cursor = inicio;
  textos.forEach((t, k) => {
    const fatia = k === textos.length - 1 ? fim - cursor : Math.round((Math.max(1, t.length) / total) * dur);
    out.push({ w: t, start: cursor, end: Math.max(cursor + 1, cursor + fatia) });
    cursor += fatia;
  });
  return out;
}

export type ResultadoReconciliacao = {
  palavras: PalavraAlinhada[];
  /** quantas palavras tiveram o texto trocado pelo revisor */
  alteradas: number;
  /** true se o texto corrigido divergiu demais e foi descartado */
  descartado: boolean;
};

/**
 * Aplica o texto corrigido sobre as palavras alinhadas SEM tocar em start/end.
 * Se o casamento ficar abaixo de 60%, o texto corrigido é descartado por
 * segurança — alinhamento nunca é sacrificado por correção textual.
 */
export function reconciliar(alinhadas: PalavraAlinhada[], textoCorrigido: string): ResultadoReconciliacao {
  const base = alinhadas.filter((p) => p.w.trim().length > 0);
  const tokens = tokenizar(textoCorrigido);
  if (!base.length || !tokens.length) return { palavras: base, alteradas: 0, descartado: true };

  const na = base.map((p) => normalizar(p.w));
  const nb = tokens.map(normalizar);
  const pares = casar(na, nb);

  const cobertura = pares.length / Math.min(na.length, nb.length);
  if (cobertura < 0.6) return { palavras: base, alteradas: 0, descartado: true };

  const saida: PalavraAlinhada[] = [];
  let alteradas = 0;
  let i = 0; // cursor whisper
  let j = 0; // cursor gemini

  const emitirBloco = (ate_i: number, ate_j: number) => {
    // trecho não casado: mantém os tempos das palavras do whisper,
    // distribuindo o texto novo dentro do MESMO intervalo.
    const fonte = base.slice(i, ate_i);
    const novos = tokens.slice(j, ate_j);
    if (!fonte.length) {
      // inserção pura de texto: cola no fim da última palavra emitida
      const ultimo = saida[saida.length - 1];
      if (ultimo && novos.length) {
        ultimo.w = `${ultimo.w} ${novos.join(" ")}`.trim();
        alteradas++;
      }
      return;
    }
    if (!novos.length) {
      // o revisor apagou o trecho: preserva o áudio real, mantém texto original
      saida.push(...fonte);
      return;
    }
    const ini = fonte[0]!.start;
    const fim = fonte[fonte.length - 1]!.end;
    const repartido = repartir(ini, fim, novos);
    alteradas += repartido.length;
    saida.push(...repartido.map((p, k) => ({ ...p, conf: fonte[Math.min(k, fonte.length - 1)]!.conf })));
  };

  for (const par of pares) {
    if (par.i > i || par.j > j) emitirBloco(par.i, par.j);
    const orig = base[par.i]!;
    const novo = tokens[par.j]!;
    if (novo !== orig.w) alteradas++;
    saida.push({ ...orig, w: novo }); // TEMPO INTACTO
    i = par.i + 1;
    j = par.j + 1;
  }
  if (i < base.length || j < tokens.length) emitirBloco(base.length, tokens.length);

  // sanidade final: ordem monotônica e tempos preservados
  const palavras = saida
    .filter((p) => p.w.trim().length > 0 && Number.isFinite(p.start) && Number.isFinite(p.end))
    .map((p) => ({ ...p, w: p.w.trim(), end: Math.max(p.end, p.start + 20) }))
    .sort((a, b) => a.start - b.start);

  return { palavras, alteradas, descartado: false };
}

/** Agrupa palavras em segmentos de frase (pontuação ou tamanho máximo). */
export function segmentarFrases(palavras: PalavraAlinhada[], maxPalavras = 14) {
  const segments: Array<{ start: number; end: number; text: string }> = [];
  let atual: PalavraAlinhada[] = [];
  for (const w of palavras) {
    atual.push(w);
    if (/[.!?…]$/.test(w.w) || atual.length >= maxPalavras) {
      segments.push({ start: atual[0]!.start, end: atual[atual.length - 1]!.end, text: atual.map((x) => x.w).join(" ") });
      atual = [];
    }
  }
  if (atual.length) segments.push({ start: atual[0]!.start, end: atual[atual.length - 1]!.end, text: atual.map((x) => x.w).join(" ") });
  return segments;
}
