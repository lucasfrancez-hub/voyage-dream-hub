/**
 * Segmentação de legendas do EditAir.
 *
 * A legenda é construída PELA FALA, não por tamanho fixo. A ordem de decisão é:
 *
 *   timestamps reais → pontuação → pausa natural → unidade de sentido → limite visual
 *
 * Os limites (caracteres, palavras, duração) são apenas trava de segurança
 * visual: eles nunca escolhem sozinhos onde uma frase começa ou termina, só
 * forçam uma quebra quando a unidade natural não cabe na tela — e mesmo aí a
 * quebra cai no melhor ponto linguístico disponível.
 *
 * O intervalo do bloco é consequência das palavras:
 *   start = start da primeira palavra   |   end = end da última palavra
 */

export type PalavraTempo = { w: string; start: number; end: number; clipId?: string };

export type LimitesLegenda = {
  /** trava visual de caracteres por bloco */
  maxChars: number;
  /** trava visual de palavras por bloco */
  maxPalavras: number;
  /** trava de duração por bloco (ms) */
  maxDuracao: number;
  /** pausa que já indica fim de unidade de fala (ms) */
  pausaFrase: number;
  /** pausa mínima após vírgula/;/: para fechar a unidade ali (ms) */
  pausaVirgula: number;
};

export const LIMITES_PADRAO: LimitesLegenda = {
  maxChars: 46,
  maxPalavras: 9,
  maxDuracao: 4200,
  pausaFrase: 600,
  pausaVirgula: 150,
};

const FIM_DE_FRASE = /[.!?…]+["'”’)\]]?$/;
const PONTUACAO_MEDIA = /[,;:—–]["'”’)\]]?$/;

/** conectivos que costumam iniciar uma nova unidade de sentido */
const CONECTIVOS = new Set([
  "e", "mas", "porém", "entretanto", "ou", "porque", "pois", "que", "então",
  "aí", "daí", "quando", "enquanto", "embora", "se", "como", "logo", "portanto",
  "só", "também", "já", "depois", "antes", "para", "pra", "além",
]);

/** palavras fracas para terminar um bloco (artigos, preposições, verbo de ligação) */
const FRACOS = new Set([
  "o", "a", "os", "as", "um", "uma", "de", "da", "do", "das", "dos", "em", "no", "na",
  "por", "com", "pra", "para", "que", "e", "é", "ao", "à", "meu", "minha", "seu", "sua",
]);

const limpar = (w: string) =>
  w.toLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");

const texto = (ws: PalavraTempo[]) => ws.map((w) => w.w).join(" ");
const chars = (ws: PalavraTempo[]) => texto(ws).length;
const dur = (ws: PalavraTempo[]) => ws[ws.length - 1]!.end - ws[0]!.start;

const cabe = (ws: PalavraTempo[], lim: LimitesLegenda) =>
  chars(ws) <= lim.maxChars && ws.length <= lim.maxPalavras && dur(ws) <= lim.maxDuracao;

/**
 * Passo 1 — unidades naturais de fala.
 * Quebra por troca de clipe (corte da timeline), por pontuação final e por
 * pausa real entre palavras. Nada de contagem de palavras aqui.
 */
export function unidadesDeFala(palavras: PalavraTempo[], lim = LIMITES_PADRAO): PalavraTempo[][] {
  const unidades: PalavraTempo[][] = [];
  let atual: PalavraTempo[] = [];
  const fechar = () => {
    if (atual.length) unidades.push(atual);
    atual = [];
  };
  for (const p of palavras) {
    const anterior = atual[atual.length - 1];
    if (anterior && anterior.clipId !== undefined && p.clipId !== undefined && anterior.clipId !== p.clipId) {
      fechar();
    } else if (anterior && p.start - anterior.end >= lim.pausaFrase) {
      fechar();
    }
    atual.push(p);
    if (FIM_DE_FRASE.test(p.w)) fechar();
    else if (PONTUACAO_MEDIA.test(p.w)) {
      // vírgula seguida de respiro já é fronteira natural de unidade
      const prox = palavras[palavras.indexOf(p) + 1];
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
    // evita bloco de uma palavra solta quando há alternativa
    if (ws.length > 3 && (esq.length < 2 || dir.length < 2)) continue;

    let nota = 0;
    const anterior = ws[i - 1]!;
    const proxima = ws[i]!;
    if (PONTUACAO_MEDIA.test(anterior.w)) nota += 6; // vírgula manda mais que tamanho
    const pausa = proxima.start - anterior.end;
    nota += Math.min(pausa / 90, 5); // pausa natural
    if (CONECTIVOS.has(limpar(proxima.w))) nota += 3; // nova unidade de sentido
    if (FRACOS.has(limpar(anterior.w))) nota -= 4; // não deixar artigo/preposição pendurado
    if (chars(esq) <= lim.maxChars && esq.length <= lim.maxPalavras) nota += 2;
    if (chars(dir) <= lim.maxChars && dir.length <= lim.maxPalavras) nota += 2;
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
  return blocos;
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

export type LinhaAuditoria = { texto: string; start: number; end: number; palavras: number };

const resumir = (b: PalavraTempo[]): LinhaAuditoria => ({
  texto: texto(b),
  start: b[0]!.start,
  end: b[b.length - 1]!.end,
  palavras: b.length,
});

/**
 * Auditoria: timestamps brutos + agrupamento antigo × novo, para provar se o
 * problema é timestamp, conversão source→timeline ou apenas segmentação.
 */
export function auditarSegmentacao(palavras: PalavraTempo[], lim: LimitesLegenda = LIMITES_PADRAO) {
  return {
    palavras: palavras.map((p) => ({ w: p.w, start: p.start, end: p.end, clipId: p.clipId })),
    antigo: segmentarLegado(palavras).map(resumir),
    novo: segmentarLegendas(palavras, lim).map(resumir),
  };
}
