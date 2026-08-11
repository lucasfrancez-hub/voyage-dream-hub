/**
 * Segmentação de legendas do EditAir.
 *
 * A legenda é construída PELA FALA, não por tamanho fixo. A ordem de decisão é:
 *
 *   timestamps reais → pontuação → pausa acústica → mudança de oração /
 *   unidade de sentido → limite visual do preset
 *
 * Os limites (caracteres, linhas, palavras, duração) são apenas trava de
 * segurança visual: eles nunca escolhem sozinhos onde uma frase começa ou
 * termina, só forçam uma quebra quando a unidade natural não cabe na tela — e
 * mesmo aí a quebra cai no melhor ponto sintático disponível.
 *
 * O intervalo do bloco é consequência das palavras:
 *   start = start da primeira palavra   |   end = end da última palavra
 * (o padding visual é aplicado depois, em `aplicarPadding`, e é conservador.)
 */

export type PalavraTempo = { w: string; start: number; end: number; clipId?: string };

export type LimitesLegenda = {
  /** trava visual de caracteres por bloco */
  maxChars: number;
  /** máximo de linhas na tela */
  maxLinhas: number;
  /** caracteres por linha (largura do preset) */
  maxCharsLinha: number;
  /** trava visual de palavras por bloco */
  maxPalavras: number;
  /** trava de duração por bloco (ms) */
  maxDuracao: number;
  /** bloco mais curto que isso vira flash — só é permitido se a fala for assim */
  minDuracao: number;
  /** gap abaixo disso é fluxo contínuo da fala */
  pausaCurta: number;
  /** gap nesta faixa depende da sintaxe */
  pausaMedia: number;
  /** pausa que já indica fim de unidade de fala (ms) */
  pausaFrase: number;
  /** pausa mínima após vírgula/;/: para fechar a unidade ali (ms) */
  pausaVirgula: number;
  /** padding visual antes da primeira palavra (ms) */
  leadInMs: number;
  /** padding visual depois da última palavra (ms) */
  leadOutMs: number;
  /** respiro mínimo entre dois blocos, para o padding nunca invadir o próximo */
  folgaMinima: number;
};

export const LIMITES_PADRAO: LimitesLegenda = {
  maxChars: 46,
  maxLinhas: 2,
  maxCharsLinha: 24,
  maxPalavras: 9,
  maxDuracao: 4200,
  minDuracao: 700,
  pausaCurta: 100,
  pausaMedia: 300,
  pausaFrase: 500,
  pausaVirgula: 150,
  leadInMs: 60,
  leadOutMs: 120,
  folgaMinima: 40,
};

const FIM_DE_FRASE = /[.!?…]+["'”’)\]]?$/;
const PONTUACAO_MEDIA = /[,;:—–]["'”’)\]]?$/;

/** conectivos que costumam iniciar uma nova unidade de sentido */
const CONECTIVOS = new Set([
  "e", "mas", "porém", "entretanto", "ou", "porque", "pois", "então",
  "aí", "daí", "quando", "enquanto", "embora", "se", "logo", "portanto",
  "também", "já", "depois", "antes", "além",
]);

/**
 * Nunca terminar um bloco nestas palavras: artigo, preposição, pronome átono,
 * numeral e verbo de ligação ficam grudados no que vem depois.
 */
const NAO_TERMINAR = new Set([
  "o", "a", "os", "as", "um", "uma", "uns", "umas",
  "de", "da", "do", "das", "dos", "em", "no", "na", "nos", "nas", "num", "numa",
  "por", "pelo", "pela", "com", "sem", "sob", "sobre", "entre", "até", "desde",
  "pra", "para", "pro", "ao", "aos", "à", "às",
  "que", "e", "ou", "mas", "se", "como", "quando",
  "meu", "minha", "seu", "sua", "nosso", "nossa", "este", "esta", "esse", "essa",
  "aquele", "aquela", "isso", "isto",
  "eu", "você", "vocês", "ele", "ela", "eles", "elas", "nós", "a gente", "me", "te", "lhe", "se",
  "é", "são", "foi", "era", "está", "tá", "vai", "vou", "tem", "muito", "mais", "menos",
  "sr", "sra", "dr", "dra", "dona", "seu",
]);

/** expressões fixas que não podem ser partidas */
const EXPRESSOES = [
  ["a", "gente"], ["por", "isso"], ["por", "favor"], ["até", "logo"], ["ou", "seja"],
  ["de", "repente"], ["com", "certeza"], ["na", "real"], ["tipo", "assim"], ["cada", "vez"],
];

const UNIDADES = new Set([
  "reais", "real", "mil", "milhões", "milhão", "bilhões", "bilhão", "por", "%", "km", "kg", "m",
  "minutos", "minuto", "horas", "hora", "dias", "dia", "meses", "mês", "anos", "ano", "vezes", "vez",
  "graus", "litros", "metros", "pessoas", "noites", "noite", "diárias", "diária",
]);

const limpar = (w: string) =>
  w.toLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");

const ehNumero = (w: string) => /^[\d.,]+$/.test(limpar(w)) || /^\d/.test(limpar(w));
const ehProprio = (w: string) => /^\p{Lu}/u.test(w.replace(/^[^\p{L}]+/u, ""));
const temPontuacao = (w: string) => FIM_DE_FRASE.test(w) || PONTUACAO_MEDIA.test(w);

/**
 * Quebra proibida entre duas palavras: artigo+substantivo, pronome+verbo,
 * preposição+complemento, número+unidade, nome próprio composto, expressão fixa.
 * Pontuação real sempre libera a fronteira.
 */
export function quebraProibida(anterior: PalavraTempo, proxima: PalavraTempo): boolean {
  if (temPontuacao(anterior.w)) return false;
  const a = limpar(anterior.w);
  const b = limpar(proxima.w);
  if (NAO_TERMINAR.has(a)) return true;
  if (ehNumero(anterior.w) && UNIDADES.has(b)) return true;
  if (ehProprio(anterior.w) && ehProprio(proxima.w)) return true; // "Foz do Iguaçu", "São Paulo"
  if (EXPRESSOES.some(([x, y]) => x === a && y === b)) return true;
  return false;
}

const texto = (ws: PalavraTempo[]) => ws.map((w) => w.w).join(" ");
const chars = (ws: PalavraTempo[]) => texto(ws).length;
const dur = (ws: PalavraTempo[]) => ws[ws.length - 1]!.end - ws[0]!.start;

/** simula a quebra de linha do preset para respeitar "máximo de 2 linhas". */
export function linhasVisuais(ws: PalavraTempo[], lim: LimitesLegenda): string[] {
  const linhas: string[] = [];
  let atual = "";
  for (const p of ws) {
    const cand = atual ? `${atual} ${p.w}` : p.w;
    if (cand.length > lim.maxCharsLinha && atual) {
      linhas.push(atual);
      atual = p.w;
    } else atual = cand;
  }
  if (atual) linhas.push(atual);
  return linhas;
}

const cabe = (ws: PalavraTempo[], lim: LimitesLegenda) =>
  chars(ws) <= lim.maxChars &&
  ws.length <= lim.maxPalavras &&
  dur(ws) <= lim.maxDuracao &&
  linhasVisuais(ws, lim).length <= lim.maxLinhas;

/**
 * Passo 1 — unidades naturais de fala.
 * Quebra por troca de clipe (corte da timeline), por pontuação final e por
 * pausa acústica real. Nada de contagem de palavras aqui.
 */
export function unidadesDeFala(palavras: PalavraTempo[], lim = LIMITES_PADRAO): PalavraTempo[][] {
  const unidades: PalavraTempo[][] = [];
  let atual: PalavraTempo[] = [];
  const fechar = () => {
    if (atual.length) unidades.push(atual);
    atual = [];
  };
  for (let i = 0; i < palavras.length; i++) {
    const p = palavras[i]!;
    const anterior = atual[atual.length - 1];
    if (anterior) {
      const trocouClipe =
        anterior.clipId !== undefined && p.clipId !== undefined && anterior.clipId !== p.clipId;
      const gap = p.start - anterior.end;
      // corte da timeline é fronteira absoluta; pausa longa só quebra se a
      // sintaxe permitir (não deixa artigo/preposição pendurada)
      if (trocouClipe) fechar();
      else if (gap >= lim.pausaFrase && !quebraProibida(anterior, p)) fechar();
    }
    atual.push(p);
    if (FIM_DE_FRASE.test(p.w)) fechar();
    else if (PONTUACAO_MEDIA.test(p.w)) {
      const prox = palavras[i + 1];
      // vírgula seguida de respiro já é fronteira natural de unidade
      if (prox && prox.start - p.end >= lim.pausaVirgula) fechar();
    }
  }
  fechar();
  return unidades;
}

/**
 * Escolhe o melhor ponto de quebra de uma unidade que não cabe na tela.
 * Retorna o índice da primeira palavra da segunda metade.
 */
function melhorQuebra(ws: PalavraTempo[], lim: LimitesLegenda): number {
  const total = chars(ws);
  let melhor = -1;
  let melhorNota = -Infinity;
  for (let i = 1; i < ws.length; i++) {
    const esq = ws.slice(0, i);
    const dir = ws.slice(i);
    const anterior = ws[i - 1]!;
    const proxima = ws[i]!;
    // órfã: bloco de uma palavra solta quando existe alternativa
    if (ws.length > 3 && (esq.length < 2 || dir.length < 2)) continue;

    let nota = 0;
    if (quebraProibida(anterior, proxima)) nota -= 20; // coesão sintática manda
    if (PONTUACAO_MEDIA.test(anterior.w)) nota += 8; // vírgula manda mais que tamanho
    if (FIM_DE_FRASE.test(anterior.w)) nota += 10;
    const pausa = proxima.start - anterior.end;
    if (pausa >= lim.pausaFrase) nota += 6;
    else if (pausa >= lim.pausaMedia) nota += 3.5;
    else if (pausa >= lim.pausaCurta) nota += 1.5;
    if (CONECTIVOS.has(limpar(proxima.w))) nota += 3; // mudança de oração
    if (chars(esq) <= lim.maxChars && esq.length <= lim.maxPalavras) nota += 2;
    if (chars(dir) <= lim.maxChars && dir.length <= lim.maxPalavras) nota += 2;
    if (linhasVisuais(esq, lim).length <= lim.maxLinhas) nota += 1;
    // desempate: evita metades muito desiguais
    nota -= (Math.abs(chars(esq) - chars(dir)) / Math.max(1, total)) * 3;

    if (nota > melhorNota) {
      melhorNota = nota;
      melhor = i;
    }
  }
  if (melhor === -1) melhor = Math.max(1, Math.round(ws.length / 2));
  return melhor;
}

/** Passo 2 — divide a unidade só até caber, sempre pelo melhor ponto linguístico. */
function dividir(ws: PalavraTempo[], lim: LimitesLegenda): PalavraTempo[][] {
  if (ws.length <= 1 || cabe(ws, lim)) return [ws];
  const i = melhorQuebra(ws, lim);
  return [...dividir(ws.slice(0, i), lim), ...dividir(ws.slice(i), lim)];
}

/**
 * Passo 3 — junta um bloco curtíssimo (flash) com o vizinho quando ele é
 * apenas resíduo de quebra, nunca quando a fala realmente é curta e isolada.
 */
function absorverFlashes(blocos: PalavraTempo[][], lim: LimitesLegenda): PalavraTempo[][] {
  const saida: PalavraTempo[][] = [];
  for (const b of blocos) {
    const anterior = saida[saida.length - 1];
    const curto = dur(b) < lim.minDuracao && b.length <= 2 && !FIM_DE_FRASE.test(b[b.length - 1]!.w);
    if (
      curto &&
      anterior &&
      anterior[anterior.length - 1]!.clipId === b[0]!.clipId &&
      b[0]!.start - anterior[anterior.length - 1]!.end < lim.pausaFrase &&
      cabe([...anterior, ...b], lim)
    ) {
      saida[saida.length - 1] = [...anterior, ...b];
      continue;
    }
    saida.push(b);
  }
  return saida;
}

/**
 * Agrupa palavras em blocos de legenda respeitando a fala.
 * As palavras determinam o intervalo — nunca o contrário.
 */
export function segmentarLegendas(
  palavras: PalavraTempo[],
  lim: LimitesLegenda = LIMITES_PADRAO,
): PalavraTempo[][] {
  if (!palavras.length) return [];
  const blocos: PalavraTempo[][] = [];
  for (const unidade of unidadesDeFala(palavras, lim)) {
    for (const b of dividir(unidade, lim)) if (b.length) blocos.push(b);
  }
  return absorverFlashes(blocos, lim);
}

export type IntervaloBloco = { start: number; end: number };

/**
 * Padding visual conservador. O tempo continua vindo das palavras: o lead-in
 * só usa silêncio que existe antes da fala e o lead-out só usa silêncio depois
 * dela, sempre deixando `folgaMinima` de respiro. Nunca antecipa a ponto de
 * criar sensação de atraso nem segura a legenda por cima da frase seguinte.
 */
export function aplicarPadding(blocos: PalavraTempo[][], lim: LimitesLegenda = LIMITES_PADRAO): IntervaloBloco[] {
  return blocos.map((b, i) => {
    const fala = { start: b[0]!.start, end: b[b.length - 1]!.end };
    const anterior = blocos[i - 1];
    const proximo = blocos[i + 1];
    const limiteEsq = anterior ? anterior[anterior.length - 1]!.end + lim.folgaMinima : 0;
    const limiteDir = proximo ? proximo[0]!.start - lim.folgaMinima : Number.POSITIVE_INFINITY;

    const start = Math.max(limiteEsq, fala.start - lim.leadInMs, 0);
    let end = Math.min(limiteDir, fala.end + lim.leadOutMs);
    if (end <= fala.end) end = Math.min(Math.max(fala.end, limiteDir), fala.end + lim.leadOutMs);
    // nunca encurtar a fala real
    return { start: Math.min(start, fala.start), end: Math.max(end, fala.end) };
  });
}

/** Agrupamento antigo (tamanho fixo) — mantido só para auditoria comparativa. */
export function segmentarLegado(palavras: PalavraTempo[]): PalavraTempo[][] {
  const blocos: PalavraTempo[][] = [];
  let bloco: PalavraTempo[] = [];
  const empurrar = () => {
    if (bloco.length) blocos.push(bloco);
    bloco = [];
  };
  for (const p of palavras) {
    const anterior = bloco[bloco.length - 1];
    if (anterior && anterior.clipId !== p.clipId) empurrar();
    bloco.push(p);
    const pausa = anterior && anterior.clipId === p.clipId ? p.start - anterior.end : 0;
    if (texto(bloco).length >= 34 || bloco.length >= 7 || pausa > 420 || /[.!?]$/.test(p.w)) empurrar();
  }
  empurrar();
  return blocos;
}

export type LinhaAuditoria = {
  texto: string;
  start: number;
  end: number;
  palavras: number;
  linhas: number;
  chars: number;
};

const resumir = (b: PalavraTempo[], lim: LimitesLegenda): LinhaAuditoria => ({
  texto: texto(b),
  start: b[0]!.start,
  end: b[b.length - 1]!.end,
  palavras: b.length,
  linhas: linhasVisuais(b, lim).length,
  chars: chars(b),
});

/**
 * Auditoria: timestamps brutos + agrupamento antigo × novo (com o intervalo já
 * com padding), para provar se o problema é timestamp, conversão
 * source→timeline, agrupamento ou padding.
 */
export function auditarSegmentacao(palavras: PalavraTempo[], lim: LimitesLegenda = LIMITES_PADRAO) {
  const novo = segmentarLegendas(palavras, lim);
  const padded = aplicarPadding(novo, lim);
  return {
    palavras: palavras.map((p) => ({ w: p.w, start: p.start, end: p.end, clipId: p.clipId })),
    antigo: segmentarLegado(palavras).map((b) => resumir(b, lim)),
    novo: novo.map((b, i) => ({ ...resumir(b, lim), exibidoDe: padded[i]!.start, exibidoAte: padded[i]!.end })),
  };
}
