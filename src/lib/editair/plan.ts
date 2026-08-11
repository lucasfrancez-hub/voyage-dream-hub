/**
 * Inteligência editorial do EditAir.
 *
 * O plano editorial é o "roteiro de montagem" que a IA produz ANTES de cortar:
 * blocos narrativos, tomadas escolhidas (EDL), remoções justificadas, pausas
 * que devem ser preservadas, correções de áudio por trecho e o que NÃO deve
 * ser modificado (cor, enquadramento, exposição, nitidez).
 *
 * O EDL é a base de tudo: cada corte é apenas uma referência
 * (source_in / source_out / timeline_in), então nada é destrutivo — dá para
 * restaurar tomadas, refazer, mover e comparar versões.
 */

import {
  novoId,
  recalcularDuracao,
  transformPadrao,
  enquadramentoInicial,
  type EditairClip,
  type ProjectState,
} from "./types";

export type PapelNarrativo = "gancho" | "desenvolvimento" | "prova" | "conclusao" | "cta";

export type BlocoNarrativo = {
  titulo: string;
  papel: PapelNarrativo;
  fromMs: number;
  toMs: number;
  resumo?: string;
};

export type TipoRemocao =
  | "falso_comeco"
  | "repeticao"
  | "erro"
  | "pausa_longa"
  | "frase_interrompida"
  | "tomada_pior"
  | "off_topic";

export type Remocao = { fromMs: number; toMs: number; tipo: TipoRemocao; motivo: string };
export type Preservacao = { fromMs: number; toMs: number; motivo: string };
export type AjusteAudio = { fromMs: number; toMs: number; ganhoDb: number; motivo: string };

/** Um corte do EDL: sempre referência ao material original. */
export type CorteEdl = {
  sourceInMs: number;
  sourceOutMs: number;
  /** bloco narrativo a que pertence */
  bloco?: string;
  rotulo?: string;
  /** continuidade na entrada deste corte */
  continuidade?: "nenhuma" | "jcut" | "lcut";
};

export type PlanoEditorial = {
  criadoEm: string;
  intencao: string;
  estrategia: string;
  formatoRecomendado: "vertical" | "feed" | "horizontal" | "quadrado";
  originalMs: number;
  estimativaMinMs: number;
  estimativaMaxMs: number;
  ritmo: "calmo" | "equilibrado" | "acelerado";
  blocos: BlocoNarrativo[];
  cortes: CorteEdl[];
  remocoes: Remocao[];
  preservar: Preservacao[];
  audio: AjusteAudio[];
  normalizarMix: boolean;
  preservacoes: {
    cor: boolean;
    enquadramento: boolean;
    exposicao: boolean;
    nitidez: boolean;
    motivo: string;
  };
  continuidade: { usarJcuts: boolean; overlapMs: number; observacao: string };
  avisos: string[];
};

export type Decisao = { atMs: number; tipo: "removido" | "mantido" | "audio" | "continuidade"; texto: string };

export type ModoEdicao = "automatico" | "revisar";

const dbParaGanho = (db: number) => Math.pow(10, db / 20);

export function duracaoDoPlano(plano: PlanoEditorial) {
  return plano.cortes.reduce((s, c) => s + Math.max(0, c.sourceOutMs - c.sourceInMs), 0);
}

/** Justificativas legíveis das decisões maiores do plano. */
export function decisoesDoPlano(plano: PlanoEditorial): Decisao[] {
  const d: Decisao[] = [
    ...plano.remocoes.map((r) => ({
      atMs: r.fromMs,
      tipo: "removido" as const,
      texto: `${rotuloTipo(r.tipo)} — ${r.motivo}`,
    })),
    ...plano.preservar.map((p) => ({ atMs: p.fromMs, tipo: "mantido" as const, texto: p.motivo })),
    ...plano.audio.map((a) => ({
      atMs: a.fromMs,
      tipo: "audio" as const,
      texto: `${a.ganhoDb > 0 ? "+" : ""}${a.ganhoDb} dB — ${a.motivo}`,
    })),
  ];
  if (plano.continuidade.usarJcuts) {
    d.push({ atMs: 0, tipo: "continuidade", texto: plano.continuidade.observacao || "J-cuts leves para suavizar a continuidade." });
  }
  return d.sort((a, b) => a.atMs - b.atMs);
}

export function rotuloTipo(t: TipoRemocao) {
  return (
    {
      falso_comeco: "Falso começo",
      repeticao: "Repetição",
      erro: "Erro de gravação",
      pausa_longa: "Pausa longa",
      frase_interrompida: "Frase interrompida",
      tomada_pior: "Tomada inferior",
      off_topic: "Fora do assunto",
    } as Record<TipoRemocao, string>
  )[t];
}

/** Ganho recomendado para um trecho do material original (em escala de volume). */
function ganhoNoTrecho(plano: PlanoEditorial, fromMs: number, toMs: number) {
  const cobre = plano.audio.filter((a) => a.toMs > fromMs && a.fromMs < toMs);
  if (!cobre.length) return 1;
  const db = cobre.reduce((s, a) => s + a.ganhoDb, 0) / cobre.length;
  return Math.max(0.3, Math.min(2.5, dbParaGanho(db)));
}

export type RoughCut = { state: ProjectState; decisoes: Decisao[]; resumo: string };

/**
 * Fase 1 — monta o rough cut a partir do EDL do plano.
 * Mantém o material original intocado: cada clipe é apenas uma janela do asset.
 */
export function montarRoughCut(
  state: ProjectState,
  plano: PlanoEditorial,
  assetId: string,
  opcoes: { aplicarAudio?: boolean; aplicarContinuidade?: boolean } = {},
): RoughCut {
  const aplicarAudio = opcoes.aplicarAudio ?? true;
  const usarContinuidade = (opcoes.aplicarContinuidade ?? true) && plano.continuidade.usarJcuts;
  const overlap = Math.max(80, Math.min(600, plano.continuidade.overlapMs || 220));

  const cortes = plano.cortes
    .map((c) => ({ ...c, sourceInMs: Math.max(0, Math.round(c.sourceInMs)), sourceOutMs: Math.round(c.sourceOutMs) }))
    .filter((c) => c.sourceOutMs - c.sourceInMs >= 200);

  const clips: EditairClip[] = [];
  const decisoes: Decisao[] = [];
  let cursor = 0;

  cortes.forEach((corte, i) => {
    const dur = corte.sourceOutMs - corte.sourceInMs;
    const volume = aplicarAudio ? ganhoNoTrecho(plano, corte.sourceInMs, corte.sourceOutMs) : 1;
    const continuidade = usarContinuidade && i > 0 ? (corte.continuidade ?? "nenhuma") : "nenhuma";

    const base: EditairClip = {
      id: novoId(),
      trackId: "t-video",
      kind: "video",
      assetId,
      start: cursor,
      duration: dur,
      sourceIn: corte.sourceInMs,
      volume,
      speed: 1,
      ...enquadramentoInicial(),
      fadeInMs: i === 0 ? 0 : 40,
      fadeOutMs: i === cortes.length - 1 ? 0 : 40,
      label: corte.rotulo?.slice(0, 30) ?? corte.bloco?.slice(0, 30) ?? `tomada ${i + 1}`,
    };

    if (continuidade === "jcut") {
      // o áudio do próximo trecho entra antes da imagem
      const lead = Math.min(overlap, dur - 200);
      clips.push({
        ...base,
        id: novoId(),
        trackId: "t-voice",
        kind: "audio",
        start: cursor,
        duration: lead,
        sourceIn: corte.sourceInMs,
        fadeInMs: 60,
        fadeOutMs: 0,
        label: "J-cut",
      });
      clips.push({
        ...base,
        start: cursor + lead,
        duration: dur - lead,
        sourceIn: corte.sourceInMs + lead,
      });
      decisoes.push({ atMs: cursor, tipo: "continuidade", texto: "J-cut: o áudio desta tomada entra antes da imagem." });
    } else if (continuidade === "lcut") {
      // o áudio da tomada anterior continua sobre o início desta imagem
      const anterior = cortes[i - 1];
      const cauda = Math.min(overlap, dur - 200);
      clips.push({
        id: novoId(),
        trackId: "t-voice",
        kind: "audio",
        assetId,
        start: cursor,
        duration: cauda,
        sourceIn: anterior.sourceOutMs,
        volume,
        speed: 1,
        transform: transformPadrao(),
        fadeInMs: 0,
        fadeOutMs: 80,
        label: "L-cut",
      });
      clips.push({ ...base, muted: true, duration: cauda, label: `${base.label} (L-cut)` });
      clips.push({
        ...base,
        id: novoId(),
        start: cursor + cauda,
        duration: dur - cauda,
        sourceIn: corte.sourceInMs + cauda,
        fadeInMs: 0,
      });
      decisoes.push({ atMs: cursor, tipo: "continuidade", texto: "L-cut: o áudio da tomada anterior continua sobre a imagem seguinte." });
    } else {
      clips.push(base);
    }

    if (aplicarAudio && Math.abs(volume - 1) > 0.05) {
      const db = Math.round(20 * Math.log10(volume) * 10) / 10;
      decisoes.push({
        atMs: cursor,
        tipo: "audio",
        texto: `${db > 0 ? "+" : ""}${db} dB nesta tomada — nível abaixo/acima da média da voz.`,
      });
    }

    cursor += dur;
  });

  // trilhas que não são de vídeo/voz são preservadas (música, texto, legendas já existentes)
  const preservados = state.clips.filter((c) => c.trackId === "t-music" || c.trackId === "t-broll");

  const novo = recalcularDuracao({ ...state, clips: [...preservados, ...clips] });
  const removidoMs = Math.max(0, plano.originalMs - cursor);

  return {
    state: novo,
    decisoes: [...decisoesDoPlano(plano), ...decisoes].sort((a, b) => a.atMs - b.atMs),
    resumo: `${cortes.length} tomadas montadas · ${Math.round(removidoMs / 1000)}s removidos · duração final ${Math.round(cursor / 1000)}s`,
  };
}

/** Exporta o EDL atual da timeline (para comparar versões / restaurar). */
export function edlDoEstado(state: ProjectState) {
  return {
    cuts: state.clips
      .filter((c) => c.trackId === "t-video" && c.assetId)
      .sort((a, b) => a.start - b.start)
      .map((c) => ({
        source: c.assetId,
        source_in: Number((c.sourceIn / 1000).toFixed(2)),
        source_out: Number(((c.sourceIn + c.duration * c.speed) / 1000).toFixed(2)),
        timeline_in: Number((c.start / 1000).toFixed(2)),
      })),
  };
}
