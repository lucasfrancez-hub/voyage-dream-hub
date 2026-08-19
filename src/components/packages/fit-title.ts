/**
 * Auto-fit do título das artes (Story/Feed).
 * Reduz a fonte quando o nome do destino é longo, para o bloco de título
 * não invadir a imagem nem empurrar o resto da arte.
 *
 * @param lines  linhas do título (ex.: ["BETO", "CARRERO WORLD"])
 * @param base   tamanho de fonte padrão (px)
 * @param avail  largura útil disponível (px)
 * @param maxH   altura máxima do bloco de título (px)
 */
export function fitDestSize(lines: string[], base: number, avail: number, maxH: number) {
  const CW = 0.62; // largura média de caractere maiúsculo Montserrat 900 (em em)
  const LH = 0.92; // line-height do título
  const words = lines.filter(Boolean).map((l) => l.trim().split(/\s+/));
  if (!words.length) return base;

  const countLines = (size: number) => {
    let total = 0;
    for (const ws of words) {
      let n = 1;
      let cur = 0;
      for (const w of ws) {
        const wWidth = w.length * CW * size;
        const spaceW = cur ? CW * size : 0;
        if (cur && cur + spaceW + wWidth > avail) {
          n += 1;
          cur = wWidth;
        } else {
          cur += spaceW + wWidth;
        }
      }
      total += n;
    }
    return total;
  };

  const min = Math.round(base * 0.4);
  for (let size = base; size >= min; size -= 2) {
    if (countLines(size) * LH * size <= maxH) return size;
  }
  return min;
}

/**
 * Ajusta a fonte para o destino caber SEMPRE em uma única linha.
 * Nunca quebra em duas linhas (evita empurrar/cortar o resto da arte).
 */
export function fitOneLineSize(text: string, base: number, avail: number, min = 34) {
  const CW = 0.62; // largura média de caractere maiúsculo Montserrat 900 (em em)
  const len = text.trim().length;
  if (!len) return base;
  const size = Math.floor(avail / (len * CW));
  return Math.max(min, Math.min(base, size));
}
