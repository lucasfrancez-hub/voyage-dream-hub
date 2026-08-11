/* Gestos de navegação da timeline (roda, pan e scrollbar custom).

   Lógica pura, sem DOM, para poder ser testada e para manter o componente
   apenas com a parte de eventos. No Electron/macOS não dá para confiar na
   scrollbar overlay nativa nem no comportamento padrão de wheel horizontal:
   tudo aqui é explícito. */

export type LeituraRoda = {
  deltaX: number;
  deltaY: number;
  deltaMode?: number;
  shiftKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
};

export type AcaoRoda =
  /** deslocamento horizontal em px a somar no scrollLeft */
  | { tipo: "horizontal"; dx: number }
  /** deslocamento vertical em px a somar no scrollTop */
  | { tipo: "vertical"; dy: number }
  /** novo zoom (px por segundo) já clampeado */
  | { tipo: "zoom"; zoom: number };

/** deltaMode: 0 = pixel, 1 = linha, 2 = página. Firefox/Electron usam linha. */
export function normalizarDelta(valor: number, deltaMode = 0): number {
  const fator = deltaMode === 1 ? 16 : deltaMode === 2 ? 100 : 1;
  return valor * fator;
}

/**
 * Classifica um evento de roda/trackpad.
 * - ctrl/cmd (ou pinça do trackpad) → zoom exponencial ancorado no cursor
 * - shift ou deltaX dominante → pan horizontal
 * - resto → scroll vertical normal
 */
export function interpretarRoda(
  e: LeituraRoda,
  zoomAtual: number,
  limites: { min: number; max: number },
): AcaoRoda {
  const dx = normalizarDelta(e.deltaX ?? 0, e.deltaMode);
  const dy = normalizarDelta(e.deltaY ?? 0, e.deltaMode);
  if (e.ctrlKey || e.metaKey) {
    const z = zoomAtual * Math.exp(-dy * 0.0015);
    return { tipo: "zoom", zoom: Math.min(limites.max, Math.max(limites.min, z)) };
  }
  if (e.shiftKey) return { tipo: "horizontal", dx: dy || dx };
  if (Math.abs(dx) > Math.abs(dy)) return { tipo: "horizontal", dx };
  return { tipo: "vertical", dy };
}

export function limitar(valor: number, min: number, max: number): number {
  if (!Number.isFinite(valor)) return min;
  return Math.max(min, Math.min(max, valor));
}

/** Pan com Espaço/botão do meio: o conteúdo acompanha a mão. */
export function panScrollLeft(scrollInicial: number, deltaPonteiroX: number, maxScroll: number): number {
  return limitar(scrollInicial - deltaPonteiroX, 0, Math.max(0, maxScroll));
}

export function panScrollTop(scrollInicial: number, deltaPonteiroY: number, maxScroll: number): number {
  return limitar(scrollInicial - deltaPonteiroY, 0, Math.max(0, maxScroll));
}

export type MetricaScrollbar = {
  /** a barra é necessária? */
  visivel: boolean;
  /** largura do polegar em px */
  largura: number;
  /** deslocamento do polegar dentro da trilha em px */
  x: number;
  /** curso útil (trilha - polegar) */
  curso: number;
};

const POLEGAR_MIN = 32;

/** Geometria do polegar da scrollbar horizontal desenhada por nós. */
export function metricaScrollbar(
  scrollLeft: number,
  scrollWidth: number,
  clientWidth: number,
  trilhaPx: number,
): MetricaScrollbar {
  const maxScroll = Math.max(0, scrollWidth - clientWidth);
  if (maxScroll <= 1 || trilhaPx <= 0 || clientWidth <= 0) {
    return { visivel: false, largura: trilhaPx, x: 0, curso: 0 };
  }
  const largura = Math.max(POLEGAR_MIN, Math.min(trilhaPx, (clientWidth / scrollWidth) * trilhaPx));
  const curso = Math.max(1, trilhaPx - largura);
  const x = limitar((scrollLeft / maxScroll) * curso, 0, curso);
  return { visivel: true, largura, x, curso };
}

/** Converte um arraste do polegar (px na trilha) em scrollLeft. */
export function scrollDoPolegar(
  xPolegar: number,
  metrica: Pick<MetricaScrollbar, "curso">,
  scrollWidth: number,
  clientWidth: number,
): number {
  const maxScroll = Math.max(0, scrollWidth - clientWidth);
  if (metrica.curso <= 0) return 0;
  return limitar((xPolegar / metrica.curso) * maxScroll, 0, maxScroll);
}

/** Clique direto na trilha: centraliza o polegar no ponto clicado. */
export function scrollDoCliqueNaTrilha(
  xClique: number,
  metrica: MetricaScrollbar,
  scrollWidth: number,
  clientWidth: number,
): number {
  return scrollDoPolegar(xClique - metrica.largura / 2, metrica, scrollWidth, clientWidth);
}

export type TipoGesto = "pan" | "splitter" | "scrub" | "clip" | "marquee" | "scrollbar" | "nenhum";

/**
 * Classificação única do pointerdown na timeline. Só depois de decidir o gesto
 * é que o componente chama preventDefault/stopPropagation ou registra listeners
 * globais — evitando que uma interação roube a outra.
 */
export function classificarGesto(e: {
  button: number;
  espacoPressionado: boolean;
  altKey?: boolean;
  alvo?: "clip" | "regua" | "playhead" | "vazio" | "scrollbar" | "splitter";
}): TipoGesto {
  if (e.alvo === "splitter") return "splitter";
  if (e.alvo === "scrollbar") return "scrollbar";
  // pan tem prioridade sobre tudo dentro da área rolável
  if (e.button === 1 || (e.espacoPressionado && e.button === 0)) return "pan";
  if (e.button !== 0) return "nenhum";
  if (e.alvo === "playhead" || e.alvo === "regua") return "scrub";
  if (e.alvo === "clip") return "clip";
  if (e.altKey) return "scrub";
  return "marquee";
}
