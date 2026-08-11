/**
 * Layout de texto da legenda — puro e compartilhado entre preview, templates e
 * exportação. Nada aqui toca em canvas: a medição chega por callback para o
 * mesmo cálculo rodar em teste, no motor 2D e no HTML dos modelos.
 */

export type Caps = "original" | "upper" | "lower";

/** Capitalização é só visual: o texto original do clipe nunca é alterado. */
export function aplicarCaps(texto: string, caps?: Caps, uppercaseLegado?: boolean): string {
  const modo: Caps = caps ?? (uppercaseLegado ? "upper" : "original");
  if (modo === "upper") return texto.toUpperCase();
  if (modo === "lower") return texto.toLowerCase();
  return texto;
}

export type Medir = (s: string) => number;

/**
 * Quebra em até `maxLinhas`, sempre em espaços (nunca corta palavra) e
 * buscando equilíbrio visual entre as linhas quando são duas.
 */
export function quebrarBalanceado(medir: Medir, texto: string, max: number, maxLinhas = 2): string[] {
  const palavras = texto.split(/\s+/).filter(Boolean);
  if (!palavras.length) return [];
  if (maxLinhas <= 1 || medir(texto) <= max) {
    return maxLinhas <= 1 ? [palavras.join(" ")] : [palavras.join(" ")].filter(Boolean);
  }
  if (palavras.length === 1) return [palavras[0]];

  if (maxLinhas === 2) {
    let melhor: { linhas: string[]; custo: number } | null = null;
    for (let i = 1; i < palavras.length; i++) {
      const a = palavras.slice(0, i).join(" ");
      const b = palavras.slice(i).join(" ");
      const la = medir(a);
      const lb = medir(b);
      // estouro pesa muito mais que desequilíbrio: preferimos duas linhas
      // parelhas e, se nada couber, a divisão menos ruim.
      const estouro = Math.max(0, la - max) + Math.max(0, lb - max);
      const custo = estouro * 1000 + Math.abs(la - lb);
      if (!melhor || custo < melhor.custo) melhor = { linhas: [a, b], custo };
    }
    return melhor!.linhas;
  }

  // 3+ linhas: guloso simples, ainda sem cortar palavras.
  const linhas: string[] = [];
  let atual = "";
  for (const p of palavras) {
    const tentativa = atual ? `${atual} ${p}` : p;
    if (atual && medir(tentativa) > max) {
      linhas.push(atual);
      atual = p;
    } else atual = tentativa;
  }
  if (atual) linhas.push(atual);
  return linhas.slice(0, maxLinhas);
}

/**
 * Casa a palavra desenhada com o índice em `words[]`. Ressincroniza olhando
 * vizinhos: texto revisado à mão (pontuação, acento, caixa) não pode desligar
 * o karaokê.
 */
export function limparPalavra(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");
}

export function casarIndicePalavra(
  palavraDesenhada: string,
  indiceAtual: number,
  words: { w: string }[],
  janela = 2,
): number {
  if (!words.length) return -1;
  const alvo = limparPalavra(palavraDesenhada);
  if (!alvo) return indiceAtual < words.length ? indiceAtual : -1;
  if (limparPalavra(words[indiceAtual]?.w ?? "") === alvo) return indiceAtual;
  for (let d = 1; d <= janela; d++) {
    if (limparPalavra(words[indiceAtual + d]?.w ?? "") === alvo) return indiceAtual + d;
    if (indiceAtual - d >= 0 && limparPalavra(words[indiceAtual - d]?.w ?? "") === alvo) return indiceAtual - d;
  }
  // sem casamento textual: a ordem ainda é confiável enquanto houver palavras
  return indiceAtual < words.length ? indiceAtual : -1;
}
