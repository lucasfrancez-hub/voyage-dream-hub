import type { EditairClip, ProjectState } from "./types";

/**
 * Planejador de exportação — caminho rápido x composição.
 *
 * Exportar quadro a quadro pelo canvas é caro: em 4K cada quadro custa ~8x mais
 * pixels que em 1080p, e cada quadro exige seek/decode + leitura de pixels +
 * IPC. Só que a maior parte de um vídeo comum é "corte puro": um único clipe de
 * vídeo, em velocidade e enquadramento normais, sem nada desenhado por cima.
 *
 * Esse trecho pode ir DIRETO para o FFmpeg (decode e encode por hardware, sem
 * passar pelo canvas). O compositor continua responsável apenas pelos trechos
 * que realmente precisam ser desenhados: legenda, texto, imagem sobreposta,
 * transformação, efeito, transição, velocidade, congelamento etc.
 *
 * Este módulo é puro: decide o plano, não executa nada.
 */

export type SegmentoDireto = {
  tipo: "direto";
  startMs: number;
  endMs: number;
  clipId: string;
  /** arquivo local do asset (só existe caminho rápido com arquivo em disco) */
  arquivo: string;
  /** trecho do arquivo de origem correspondente */
  sourceInMs: number;
  sourceOutMs: number;
};

export type SegmentoComposto = { tipo: "composto"; startMs: number; endMs: number };
export type Segmento = SegmentoDireto | SegmentoComposto;

export type DimFonte = { width: number; height: number };

export type OpcoesPlano = {
  duracaoMs: number;
  width: number;
  height: number;
  /** assetId → caminho local do arquivo */
  caminhos: Record<string, string | undefined>;
  /** assetId → dimensões do arquivo (para confirmar que "fit" é identidade) */
  dimensoes?: Record<string, DimFonte | undefined>;
  /** trechos diretos menores que isto não compensam (spawn do FFmpeg) */
  minimoDiretoMs?: number;
};

const DESENHADOS = new Set(["video", "image", "text", "caption"]);
const quase = (a: number, b: number, tol = 0.001) => Math.abs(a - b) <= tol;

/** O clipe é um corte puro (nada além de recortar o arquivo de origem)? */
export function clipeEhCortePuro(c: EditairClip, opts: OpcoesPlano): boolean {
  if (c.kind !== "video" || !c.assetId) return false;
  if (!opts.caminhos[c.assetId]) return false;
  if (!quase(c.speed ?? 1, 1)) return false;
  if (c.congelado || c.reverso) return false;

  const t = c.transform ?? { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 };
  if (!quase(t.x, 0) || !quase(t.y, 0) || !quase(t.scale, 1) || !quase(t.rotation, 0) || !quase(t.opacity, 1)) {
    return false;
  }
  if (c.flipH || c.flipV) return false;
  if (c.keyframes?.length) return false;
  if (c.transicao && c.transicao.durationMs > 0) return false;
  if (c.fadeInMs || c.fadeOutMs) return false;
  if (c.filtro && c.filtro.id !== "nenhum") return false;
  if (c.efeito && c.efeito.id !== "nenhum") return false;
  if (c.efeitos && Object.keys(c.efeitos).length) return false;
  if (c.ajustes) return false;
  if (c.chroma?.ativo) return false;
  if (c.fundo && c.fundo.modo && c.fundo.modo !== "nenhum") return false;
  if (c.mascara || c.recorte || c.animacao || c.aprimorar) return false;
  if (c.blend && c.blend !== "normal") return false;

  // "fit" só é identidade quando o arquivo tem exatamente a proporção do projeto
  const dim = opts.dimensoes?.[c.assetId];
  if (!dim || !dim.width || !dim.height) return false;
  return quase(dim.width / dim.height, opts.width / opts.height, 0.01);
}

/**
 * Divide a timeline em segmentos, marcando o que pode ir direto ao FFmpeg.
 * Cada fronteira de clipe vira um corte; intervalos vizinhos do mesmo tipo
 * (e, no caso direto, do mesmo clipe) são fundidos.
 */
export function planejarExport(state: ProjectState, opts: OpcoesPlano): Segmento[] {
  const fim = Math.max(0, Math.round(opts.duracaoMs));
  if (fim <= 0) return [];
  const visiveis = state.clips.filter((c) => DESENHADOS.has(c.kind) && c.duration > 0);

  const marcos = new Set<number>([0, fim]);
  for (const c of visiveis) {
    if (c.start > 0 && c.start < fim) marcos.add(Math.round(c.start));
    const f = Math.round(c.start + c.duration);
    if (f > 0 && f < fim) marcos.add(f);
  }
  const cortes = [...marcos].sort((a, b) => a - b);

  const bruto: Segmento[] = [];
  for (let i = 0; i < cortes.length - 1; i++) {
    const a = cortes[i]!;
    const b = cortes[i + 1]!;
    if (b <= a) continue;
    const meio = (a + b) / 2;
    const ativos = visiveis.filter((c) => c.start <= meio && c.start + c.duration > meio);
    const unico = ativos.length === 1 ? ativos[0]! : null;
    if (unico && clipeEhCortePuro(unico, opts)) {
      const desloc = a - unico.start;
      bruto.push({
        tipo: "direto",
        startMs: a,
        endMs: b,
        clipId: unico.id,
        arquivo: opts.caminhos[unico.assetId!]!,
        sourceInMs: Math.round(unico.sourceIn + desloc),
        sourceOutMs: Math.round(unico.sourceIn + desloc + (b - a)),
      });
    } else {
      bruto.push({ tipo: "composto", startMs: a, endMs: b });
    }
  }

  // funde vizinhos contínuos
  const fundido: Segmento[] = [];
  for (const s of bruto) {
    const ant = fundido[fundido.length - 1];
    if (
      ant &&
      ant.endMs === s.startMs &&
      ant.tipo === s.tipo &&
      (s.tipo === "composto" ||
        (ant.tipo === "direto" && ant.clipId === s.clipId && ant.sourceOutMs === s.sourceInMs))
    ) {
      ant.endMs = s.endMs;
      if (ant.tipo === "direto" && s.tipo === "direto") ant.sourceOutMs = s.sourceOutMs;
      continue;
    }
    fundido.push({ ...s });
  }

  // trecho direto curto demais não paga o custo de abrir um FFmpeg só para ele
  const minimo = opts.minimoDiretoMs ?? 700;
  const final: Segmento[] = [];
  for (const s of fundido) {
    const curto = s.tipo === "direto" && s.endMs - s.startMs < minimo;
    const virou: Segmento = curto ? { tipo: "composto", startMs: s.startMs, endMs: s.endMs } : s;
    const ant = final[final.length - 1];
    if (ant && ant.tipo === "composto" && virou.tipo === "composto" && ant.endMs === virou.startMs) {
      ant.endMs = virou.endMs;
      continue;
    }
    final.push(virou);
  }
  return final;
}

/** Quanto da duração total vai pelo caminho rápido (0..1). */
export function fracaoDireta(segs: Segmento[]): number {
  const total = segs.reduce((t, s) => t + (s.endMs - s.startMs), 0);
  if (!total) return 0;
  const direto = segs.filter((s) => s.tipo === "direto").reduce((t, s) => t + (s.endMs - s.startMs), 0);
  return direto / total;
}

/** Vale a pena usar o pipeline híbrido? (abaixo disso o overhead não compensa) */
export function valeCaminhoRapido(segs: Segmento[]): boolean {
  return segs.some((s) => s.tipo === "direto") && fracaoDireta(segs) >= 0.15;
}

/** Frames compostos que ainda precisam passar pelo canvas. */
export function framesCompostos(segs: Segmento[], fps: number): number {
  return segs
    .filter((s) => s.tipo === "composto")
    .reduce((t, s) => t + Math.round(((s.endMs - s.startMs) / 1000) * fps), 0);
}
