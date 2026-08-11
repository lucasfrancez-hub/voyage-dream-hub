/**
 * Hit-test do Reprodutor (puro e testável).
 *
 * Regra de prioridade, sempre nesta ordem:
 *   handles do elemento selecionado → legenda/texto → outros overlays → vídeo/imagem.
 *
 * O vídeo ocupa o frame inteiro, então ele SÓ pode receber o gesto quando não
 * há nenhuma legenda/overlay sob o ponteiro.
 */

export type CaixaPalco = {
  id: string;
  kind: string;
  /** centro e tamanho em fração do frame (0..1) */
  cx: number;
  cy: number;
  w: number;
  h: number;
  bloqueado?: boolean;
  /** "caixa" = os cantos mudam só a largura do texto (nunca a fonte) */
  resize?: "escala" | "caixa";
};

export type ModoGesto = "mover" | "escala" | "caixa" | "giro";
export type AlvoPalco = { id: string; modo: ModoGesto; canto?: "ne" | "nw" | "se" | "sw" };

const CAMADA: Record<string, number> = { caption: 30, text: 20 };
export const camadaDe = (kind: string) => CAMADA[kind] ?? 10;

export type Ponto = { x: number; y: number };
/** tolerância dos handles, em fração do frame (eixos separados: o frame não é quadrado) */
export type Tol = { x: number; y: number };

const dentro = (el: CaixaPalco, p: Ponto) =>
  Math.abs(p.x - el.cx) <= el.w / 2 && Math.abs(p.y - el.cy) <= el.h / 2;

/** Handles do elemento selecionado — sempre a maior prioridade. */
export function handleNoPonto(el: CaixaPalco | null | undefined, p: Ponto, tol: Tol): AlvoPalco | null {
  if (!el || el.bloqueado) return null;
  const modoCaixa = (el.resize ?? "escala") === "caixa";
  const cantos: { canto: AlvoPalco["canto"]; x: number; y: number }[] = [
    { canto: "nw", x: el.cx - el.w / 2, y: el.cy - el.h / 2 },
    { canto: "ne", x: el.cx + el.w / 2, y: el.cy - el.h / 2 },
    { canto: "sw", x: el.cx - el.w / 2, y: el.cy + el.h / 2 },
    { canto: "se", x: el.cx + el.w / 2, y: el.cy + el.h / 2 },
  ];
  for (const c of cantos) {
    if (Math.abs(p.x - c.x) <= tol.x && Math.abs(p.y - c.y) <= tol.y) {
      return { id: el.id, modo: modoCaixa ? "caixa" : "escala", canto: c.canto };
    }
  }
  if (!modoCaixa) {
    const gx = el.cx;
    const gy = el.cy - el.h / 2 - tol.y * 2;
    if (Math.abs(p.x - gx) <= tol.x && Math.abs(p.y - gy) <= tol.y) return { id: el.id, modo: "giro" };
  }
  return null;
}

/** Elemento sob o ponteiro respeitando a ordem de camadas (legenda antes do vídeo). */
export function corpoNoPonto(elementos: CaixaPalco[], p: Ponto): CaixaPalco | null {
  const ordenados = [...elementos].sort((a, b) => camadaDe(b.kind) - camadaDe(a.kind));
  return ordenados.find((el) => dentro(el, p)) ?? null;
}

/** Alvo completo do gesto: handles → corpo (legenda/overlay/vídeo). */
export function alvoNoPonto(
  elementos: CaixaPalco[],
  p: Ponto,
  selecionadoId: string | null | undefined,
  tol: Tol,
): AlvoPalco | null {
  const sel = elementos.find((e) => e.id === selecionadoId) ?? null;
  const h = handleNoPonto(sel, p, tol);
  if (h) return h;
  const corpo = corpoNoPonto(elementos, p);
  return corpo ? { id: corpo.id, modo: "mover" } : null;
}
