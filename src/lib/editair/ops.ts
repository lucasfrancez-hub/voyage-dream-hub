import {
  FUNDO_PADRAO,
  ANIMACAO_PADRAO,
  type AnimacaoTipo,
  type TrackKind,
  type TransicaoTipo,
  type Fundo,
  type EditairClip,
  type EditairTrack,
  type ProjectState,
  type Transcript,
  novoId,
  recalcularDuracao,
  transformPadrao,
  enquadramentoInicial,
} from "./types";
import { aplicarVelocidade } from "./velocidade";

/**
 * Operações estruturadas do EditAir.
 * A IA nunca escreve no estado diretamente — ela emite estas operações,
 * o que mantém tudo reversível (undo/redo) e auditável.
 */
export type EditairOp =
  | { op: "split_clip"; clipId: string; atMs: number }
  | { op: "trim_clip"; clipId: string; startMs?: number; durationMs?: number }
  | { op: "extend_clip"; clipId: string; direction: "left" | "right"; ms: number; ripple?: boolean }
  | { op: "restore_clip"; clipId: string }
  | { op: "move_clip"; clipId: string; startMs: number; trackId?: string }
  | { op: "delete_clip"; clipId: string }
  | { op: "delete_range"; fromMs: number; toMs: number; ripple?: boolean }
  | { op: "set_volume"; clipId?: string; trackId?: string; volume: number }
  | { op: "set_transform"; clipId: string; scale?: number; x?: number; y?: number; opacity?: number; rotation?: number }
  | { op: "set_speed"; clipId: string; speed: number; ripple?: boolean }
  | { op: "add_text"; text: string; startMs: number; durationMs: number }
  | { op: "add_caption_style"; fontSize?: number; y?: number; color?: string; activeColor?: string; uppercase?: boolean }
  | { op: "rebuild_captions"; mode?: "frase" | "palavra" }
  | { op: "remove_captions" }
  | { op: "mute_track"; trackId: string; muted: boolean }
  | { op: "delete_text_range"; query: string }
  /* --- camadas e montagem (edição profissional em camadas) --- */
  | { op: "create_track"; ref?: string; kind: TrackKind; name: string; acima?: string }
  | { op: "rename_track"; trackId: string; name: string }
  | {
      op: "insert_clip";
      ref?: string;
      trackId: string;
      assetId?: string;
      kind?: "video" | "image" | "audio" | "text";
      startMs: number;
      durationMs: number;
      sourceInMs?: number;
      label?: string;
      text?: string;
    }
  | { op: "ripple_delete"; clipId: string }
  | { op: "create_caption"; text: string; startMs: number; durationMs: number; trackId?: string }
  | { op: "update_caption"; clipId: string; text?: string; startMs?: number; durationMs?: number }
  | { op: "add_animation"; clipId: string; entrada?: AnimacaoTipo; saida?: AnimacaoTipo; duracaoMs?: number }
  | { op: "add_effect"; clipId: string; efeitoId: string; camada?: "entrada" | "momento" | "saida"; intensidade?: number }
  | { op: "add_transition"; clipId: string; tipo: TransicaoTipo; durationMs?: number }
  | {
      op: "remove_silences";
      clipId?: string;
      minSilencioMs?: number;
      padMs?: number;
      /** trechos de fala (ms na timeline). Se ausente, usa a transcrição. */
      falas?: { fromMs: number; toMs: number }[];
    }
  | {
      op: "set_background";
      clipId?: string;
      modo?: Fundo["modo"];
      desfoque?: number;
      suavidade?: number;
      borda?: number;
      cor?: string;
      assetId?: string;
      contorno?: boolean;
      estabilidade?: number;
      qualidade?: "rapida" | "alta";
    };

export type OpResult = { state: ProjectState; log: string[] };

/** Duração real de cada arquivo de origem (ms), por assetId. */
export type SourceDurations = Record<string, number>;

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/**
 * Quanto o clipe ainda pode crescer para cada lado (em ms de timeline),
 * respeitando os limites reais do arquivo de origem. Edição não destrutiva:
 * o material aparado continua existindo no source.
 */
export function limitesDoClip(clip: EditairClip, sourceDurations?: SourceDurations) {
  const dur = clip.assetId ? sourceDurations?.[clip.assetId] : undefined;
  const speed = clip.speed || 1;
  const esquerda = clip.assetId ? Math.max(0, clip.sourceIn / speed) : Infinity;
  const usado = clip.sourceIn + clip.duration * speed;
  const direita = dur && dur > 0 ? Math.max(0, (dur - usado) / speed) : Infinity;
  return { esquerda, direita, sourceDuration: dur ?? null };
}

function ordenar(clips: EditairClip[]) {
  return [...clips].sort((a, b) => a.start - b.start);
}


/** Fecha buracos na trilha, mantendo a ordem (ripple). */
export function fecharBuracos(state: ProjectState, trackIds: string[]): ProjectState {
  const clips = [...state.clips];
  for (const trackId of trackIds) {
    const daTrilha = ordenar(clips.filter((c) => c.trackId === trackId));
    let cursor = 0;
    for (const c of daTrilha) {
      const idx = clips.findIndex((x) => x.id === c.id);
      clips[idx] = { ...c, start: cursor };
      cursor += c.duration;
    }
  }
  return recalcularDuracao({ ...state, clips });
}

export function aplicarOps(
  state: ProjectState,
  ops: EditairOp[],
  transcript?: Transcript | null,
  sourceDurations?: SourceDurations,
): OpResult {
  let s: ProjectState = { ...state, clips: [...state.clips], tracks: [...state.tracks] };
  const log: string[] = [];
  /** apelidos criados pela IA ("legendas", "broll-1") → id real da trilha */
  const refs: Record<string, string> = {};
  const resolverTrackId = (valor: string | undefined): string | null => {
    if (!valor) return null;
    if (refs[valor]) return refs[valor];
    const direto = s.tracks.find((t) => t.id === valor);
    if (direto) return direto.id;
    const porNome = s.tracks.find((t) => t.name.toLowerCase() === valor.toLowerCase());
    return porNome?.id ?? null;
  };

  for (const op of ops) {
    switch (op.op) {
      case "split_clip": {
        const c = s.clips.find((x) => x.id === op.clipId);
        if (!c || op.atMs <= c.start || op.atMs >= c.start + c.duration) break;
        const offset = op.atMs - c.start;
        const a: EditairClip = { ...c, duration: offset };
        const b: EditairClip = {
          ...c,
          id: novoId(),
          start: op.atMs,
          duration: c.duration - offset,
          sourceIn: c.sourceIn + offset * c.speed,
          words: c.words?.filter((w) => w.start >= op.atMs),
        };
        a.words = c.words?.filter((w) => w.start < op.atMs);
        s.clips = s.clips.flatMap((x) => (x.id === c.id ? [a, b] : [x]));
        log.push("Clipe dividido");
        break;
      }
      case "trim_clip": {
        s.clips = s.clips.map((c) => {
          if (c.id !== op.clipId) return c;
          const lim = limitesDoClip(c, sourceDurations);
          const next = { ...c };
          if (op.startMs != null) {
            // não deixa passar do começo real do arquivo nem "comer" o clipe todo
            const delta = clamp(op.startMs - c.start, -lim.esquerda, c.duration - 100);
            next.start = Math.max(0, c.start + delta);
            next.sourceIn = Math.max(0, c.sourceIn + delta * c.speed);
            next.duration = Math.max(100, c.duration - delta);
          }
          if (op.durationMs != null) {
            const maxDur = next.duration + lim.direita;
            next.duration = clamp(op.durationMs, 100, Number.isFinite(maxDur) ? maxDur : op.durationMs);
          }
          return next;
        });
        log.push("Clipe ajustado");
        break;
      }
      case "extend_clip": {
        const c = s.clips.find((x) => x.id === op.clipId);
        if (!c) break;
        const lim = limitesDoClip(c, sourceDurations);
        if (op.direction === "left") {
          const ganho = Math.min(Math.abs(op.ms), lim.esquerda, c.start);
          if (ganho <= 0) {
            log.push("Não há mais material antes deste trecho");
            break;
          }
          s.clips = s.clips.map((x) =>
            x.id === c.id
              ? { ...x, start: x.start - ganho, duration: x.duration + ganho, sourceIn: Math.max(0, x.sourceIn - ganho * x.speed) }
              : x,
          );
          log.push(`Clipe estendido ${(ganho / 1000).toFixed(2)}s para a esquerda`);
        } else {
          const ganho = Math.min(Math.abs(op.ms), lim.direita);
          if (ganho <= 0) {
            log.push("Não há mais material depois deste trecho");
            break;
          }
          const fimAntigo = c.start + c.duration;
          s.clips = s.clips.map((x) => {
            if (x.id === c.id) return { ...x, duration: x.duration + ganho };
            if (op.ripple !== false && x.trackId === c.trackId && x.start >= fimAntigo)
              return { ...x, start: x.start + ganho };
            return x;
          });
          log.push(`Clipe estendido ${(ganho / 1000).toFixed(2)}s para a direita`);
        }
        break;
      }
      case "restore_clip": {
        s.clips = s.clips.map((c) => {
          if (c.id !== op.clipId) return c;
          const dur = c.assetId ? sourceDurations?.[c.assetId] : undefined;
          if (!dur) return c;
          const speed = c.speed || 1;
          const recuo = Math.min(c.sourceIn / speed, c.start);
          return { ...c, start: c.start - recuo, sourceIn: 0, duration: Math.max(100, dur / speed) };
        });
        log.push("Duração original restaurada");
        break;
      }

      case "move_clip": {
        s.clips = s.clips.map((c) =>
          c.id === op.clipId
            ? { ...c, start: Math.max(0, op.startMs), trackId: op.trackId ?? c.trackId }
            : c,
        );
        log.push("Clipe movido");
        break;
      }
      case "delete_clip": {
        s.clips = s.clips.filter((c) => c.id !== op.clipId);
        log.push("Clipe removido");
        break;
      }
      case "delete_range": {
        const { fromMs, toMs } = op;
        const novos: EditairClip[] = [];
        for (const c of s.clips) {
          const fim = c.start + c.duration;
          if (fim <= fromMs || c.start >= toMs) {
            novos.push(c);
            continue;
          }
          if (c.start < fromMs) {
            novos.push({ ...c, duration: fromMs - c.start });
          }
          if (fim > toMs) {
            const offset = toMs - c.start;
            novos.push({
              ...c,
              id: novoId(),
              start: toMs,
              duration: fim - toMs,
              sourceIn: c.sourceIn + offset * c.speed,
            });
          }
        }
        s.clips = novos;
        if (op.ripple !== false) {
          const gap = toMs - fromMs;
          s.clips = s.clips.map((c) => (c.start >= toMs ? { ...c, start: c.start - gap } : c));
        }
        log.push(`Trecho removido (${((toMs - fromMs) / 1000).toFixed(1)}s)`);
        break;
      }
      case "set_volume": {
        s.clips = s.clips.map((c) => {
          const alvo = op.clipId ? c.id === op.clipId : op.trackId ? c.trackId === op.trackId : false;
          return alvo ? { ...c, volume: clamp(op.volume, 0, 2) } : c;
        });
        log.push(`Volume em ${Math.round(op.volume * 100)}%`);
        break;
      }
      case "set_transform": {
        s.clips = s.clips.map((c) =>
          c.id === op.clipId
            ? {
                ...c,
                transform: {
                  ...c.transform,
                  scale: op.scale ?? c.transform.scale,
                  x: op.x ?? c.transform.x,
                  y: op.y ?? c.transform.y,
                  opacity: op.opacity ?? c.transform.opacity,
                  rotation: op.rotation ?? c.transform.rotation,
                },
              }
            : c,
        );
        log.push("Enquadramento ajustado");
        break;
      }
      case "set_speed": {
        // a duração visual do clipe passa a refletir a velocidade real
        s = aplicarVelocidade(s, op.clipId, op.speed, { ripple: op.ripple ?? true });
        log.push(`Velocidade ${op.speed}x`);
        break;
      }
      case "add_text": {
        s.clips = [
          ...s.clips,
          {
            id: novoId("txt"),
            trackId: "t-text",
            kind: "text",
            start: Math.max(0, op.startMs),
            duration: Math.max(400, op.durationMs),
            sourceIn: 0,
            volume: 1,
            speed: 1,
            transform: { ...transformPadrao(), y: -300 },
            text: op.text,
            label: op.text.slice(0, 24),
          },
        ];
        log.push("Texto adicionado");
        break;
      }
      case "add_caption_style": {
        s.captionStyle = {
          ...s.captionStyle,
          fontSize: op.fontSize ?? s.captionStyle.fontSize,
          y: op.y ?? s.captionStyle.y,
          color: op.color ?? s.captionStyle.color,
          activeColor: op.activeColor ?? s.captionStyle.activeColor,
          uppercase: op.uppercase ?? s.captionStyle.uppercase,
        };
        log.push("Estilo da legenda atualizado");
        break;
      }
      case "remove_captions": {
        s.clips = s.clips.filter((c) => c.kind !== "caption");
        log.push("Legendas removidas");
        break;
      }
      case "rebuild_captions": {
        s = { ...s, clips: s.clips.filter((c) => c.kind !== "caption") };
        if (transcript?.words?.length) {
          s = { ...s, clips: [...s.clips, ...gerarLegendas(s, transcript, op.mode ?? "frase")] };
          log.push("Legendas regeradas");
        }
        break;
      }
      case "mute_track": {
        s.tracks = s.tracks.map((t) => (t.id === op.trackId ? { ...t, muted: op.muted } : t));
        log.push(op.muted ? "Trilha silenciada" : "Trilha ativada");
        break;
      }
      case "delete_text_range": {
        const alvo = acharTrechoNaTranscricao(transcript, op.query);
        if (alvo) {
          const r = aplicarOps(s, [{ op: "delete_range", fromMs: alvo.start, toMs: alvo.end, ripple: true }], transcript);
          s = r.state;
          log.push(`Removido: "${op.query}"`);
        } else {
          log.push(`Não encontrei "${op.query}" na transcrição`);
        }
        break;
      }

      /* ------------------- camadas / montagem profissional ------------------- */
      case "create_track": {
        const existente = s.tracks.find((t) => t.name.toLowerCase() === op.name.toLowerCase());
        if (existente) {
          if (op.ref) refs[op.ref] = existente.id;
          break;
        }
        const nova: EditairTrack = { id: novoId(`t-${op.kind}`), kind: op.kind, name: op.name };
        const alvo = resolverTrackId(op.acima);
        const idx = alvo ? Math.max(0, s.tracks.findIndex((t) => t.id === alvo)) : 0;
        const tracks = [...s.tracks];
        tracks.splice(idx, 0, nova);
        s = { ...s, tracks };
        if (op.ref) refs[op.ref] = nova.id;
        log.push(`Camada "${op.name}" criada`);
        break;
      }
      case "rename_track": {
        const tid = resolverTrackId(op.trackId);
        if (!tid) break;
        s = { ...s, tracks: s.tracks.map((t) => (t.id === tid ? { ...t, name: op.name } : t)) };
        log.push(`Camada renomeada para "${op.name}"`);
        break;
      }
      case "insert_clip": {
        const tid = resolverTrackId(op.trackId) ?? garantirTrackId(s, "video", "Vídeo");
        if (!s.tracks.some((t) => t.id === tid)) {
          const r = criarTrack(s, "video", "Vídeo 2");
          s = r.state;
        }
        const enq = enquadramentoInicial();
        const clip: EditairClip = {
          id: op.ref ? novoId("clip") : novoId(),
          trackId: tid,
          kind: (op.kind ?? (op.assetId ? "video" : "text")) as EditairClip["kind"],
          assetId: op.assetId,
          start: Math.max(0, Math.round(op.startMs)),
          duration: Math.max(200, Math.round(op.durationMs)),
          sourceIn: Math.max(0, Math.round(op.sourceInMs ?? 0)),
          volume: 1,
          speed: 1,
          transform: enq.transform,
          enquadramento: enq.enquadramento,
          text: op.text,
          label: op.label ?? op.text?.slice(0, 24),
        };
        s = { ...s, clips: [...s.clips, clip] };
        if (op.ref) refs[op.ref] = clip.id;
        log.push(`Clipe inserido em ${(clip.start / 1000).toFixed(1)}s`);
        break;
      }
      case "ripple_delete": {
        const c = s.clips.find((x) => x.id === op.clipId);
        if (!c) break;
        const gap = c.duration;
        s = {
          ...s,
          clips: s.clips
            .filter((x) => x.id !== c.id)
            .map((x) => (x.trackId === c.trackId && x.start >= c.start ? { ...x, start: Math.max(0, x.start - gap) } : x)),
        };
        log.push("Clipe removido (fechando o buraco)");
        break;
      }
      case "create_caption": {
        const tid = resolverTrackId(op.trackId) ?? garantirTrackId(s, "caption", "Legendas");
        if (!s.tracks.some((t) => t.id === tid)) s = criarTrack(s, "caption", "Legendas").state;
        s = {
          ...s,
          clips: [
            ...s.clips,
            {
              id: novoId("leg"),
              trackId: tid,
              kind: "caption",
              start: Math.max(0, Math.round(op.startMs)),
              duration: Math.max(300, Math.round(op.durationMs)),
              sourceIn: 0,
              volume: 1,
              speed: 1,
              transform: transformPadrao(),
              text: op.text,
              label: op.text.slice(0, 20),
            },
          ],
        };
        log.push("Legenda criada");
        break;
      }
      case "update_caption": {
        s = {
          ...s,
          clips: s.clips.map((c) =>
            c.id === op.clipId
              ? {
                  ...c,
                  text: op.text ?? c.text,
                  label: (op.text ?? c.text ?? c.label ?? "").slice(0, 20),
                  start: op.startMs != null ? Math.max(0, Math.round(op.startMs)) : c.start,
                  duration: op.durationMs != null ? Math.max(200, Math.round(op.durationMs)) : c.duration,
                }
              : c,
          ),
        };
        log.push("Legenda atualizada");
        break;
      }
      case "add_animation": {
        s = {
          ...s,
          clips: s.clips.map((c) =>
            c.id === op.clipId
              ? {
                  ...c,
                  animacao: {
                    ...ANIMACAO_PADRAO,
                    ...(c.animacao ?? {}),
                    entrada: op.entrada ?? c.animacao?.entrada ?? "nenhuma",
                    saida: op.saida ?? c.animacao?.saida ?? "nenhuma",
                    duracaoMs: op.duracaoMs ?? c.animacao?.duracaoMs ?? 500,
                  },
                }
              : c,
          ),
        };
        log.push("Animação aplicada");
        break;
      }
      case "add_effect": {
        const camada = op.camada ?? "momento";
        s = {
          ...s,
          clips: s.clips.map((c) => {
            if (c.id !== op.clipId) return c;
            const atual = c.efeitos ?? {};
            return {
              ...c,
              efeitos: {
                ...atual,
                [camada]: {
                  id: op.efeitoId,
                  duracaoMs: camada === "momento" ? Math.max(400, c.duration) : 600,
                  intensidade: op.intensidade ?? 100,
                  easing: "suave" as const,
                },
              },
            };
          }),
        };
        log.push("Efeito aplicado");
        break;
      }
      case "add_transition": {
        s = {
          ...s,
          clips: s.clips.map((c) =>
            c.id === op.clipId ? { ...c, transicao: { tipo: op.tipo, durationMs: op.durationMs ?? 400 } } : c,
          ),
        };
        log.push("Transição adicionada");
        break;
      }
      case "remove_silences": {
        const r = removerSilencios(s, op, transcript);
        s = r.state;
        log.push(...r.log);
        break;
      }

      case "set_background": {
        const alvos = op.clipId
          ? s.clips.filter((c) => c.id === op.clipId)
          : s.clips.filter((c) => c.kind === "video" || c.kind === "image");
        if (!alvos.length) break;
        const ids = new Set(alvos.map((c) => c.id));
        s.clips = s.clips.map((c) => {
          if (!ids.has(c.id)) return c;
          const base: Fundo = { ...FUNDO_PADRAO, ...(c.fundo ?? {}) };
          const fundo: Fundo = {
            ...base,
            modo: op.modo ?? (base.modo === "nenhum" ? "desfoque" : base.modo),
            desfoque: op.desfoque != null ? clamp(op.desfoque, 0, 100) : base.desfoque,
            suavidade: op.suavidade != null ? clamp(op.suavidade, 0, 100) : base.suavidade,
            borda: op.borda != null ? clamp(op.borda, -100, 100) : base.borda,
            cor: op.cor ?? base.cor,
            assetId: op.assetId ?? base.assetId,
            estabilidade: op.estabilidade != null ? clamp(op.estabilidade, 0, 100) : base.estabilidade,
            qualidade: op.qualidade ?? base.qualidade,
            contorno:
              op.contorno != null
                ? { ...(base.contorno ?? { cor: "#FFFFFF", largura: 4 }), ativo: op.contorno }
                : base.contorno,
          };
          return { ...c, fundo: fundo.modo === "nenhum" ? undefined : fundo };
        });
        log.push(op.modo === "nenhum" ? "Fundo original restaurado" : "Fundo tratado");
        break;
      }
    }
  }

  return { state: recalcularDuracao(s), log };
}

/** Busca aproximada de um trecho falado na transcrição. */
export function acharTrechoNaTranscricao(transcript: Transcript | null | undefined, query: string) {
  if (!transcript?.words?.length) return null;
  const norm = (t: string) =>
    t
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9 ]/g, "")
      .trim();
  const alvo = norm(query).split(/\s+/).filter(Boolean);
  if (!alvo.length) return null;
  const palavras = transcript.words;
  let melhor: { i: number; score: number } | null = null;
  for (let i = 0; i <= palavras.length - 1; i++) {
    let acertos = 0;
    for (let j = 0; j < alvo.length && i + j < palavras.length; j++) {
      if (norm(palavras[i + j].w) === alvo[j]) acertos++;
    }
    const score = acertos / alvo.length;
    if (!melhor || score > melhor.score) melhor = { i, score };
  }
  if (!melhor || melhor.score < 0.5) return null;
  const fimIdx = Math.min(palavras.length - 1, melhor.i + alvo.length - 1);
  return { start: palavras[melhor.i].start, end: palavras[fimIdx].end };
}

/** Monta clipes de legenda agrupando palavras em frases curtas. */
export function gerarLegendas(
  state: ProjectState,
  transcript: Transcript,
  modo: "frase" | "palavra" = "frase",
): EditairClip[] {
  const clips: EditairClip[] = [];
  const palavras = transcript.words.filter((w) => w.end > w.start);
  if (!palavras.length) return clips;

  if (modo === "palavra") {
    for (const w of palavras) {
      clips.push(criarLegenda(w.w, w.start, w.end - w.start, [{ ...w }]));
    }
    return clips;
  }

  let bloco: typeof palavras = [];
  const empurrar = () => {
    if (!bloco.length) return;
    const texto = bloco.map((w) => w.w).join(" ");
    clips.push(criarLegenda(texto, bloco[0].start, bloco[bloco.length - 1].end - bloco[0].start, bloco.map((w) => ({ ...w }))));
    bloco = [];
  };

  for (const w of palavras) {
    bloco.push(w);
    const texto = bloco.map((x) => x.w).join(" ");
    const anterior = bloco[bloco.length - 2];
    const pausa = anterior ? w.start - anterior.end : 0;
    if (texto.length >= 34 || bloco.length >= 7 || pausa > 420 || /[.!?]$/.test(w.w)) empurrar();
  }
  empurrar();
  return clips;
}

function criarLegenda(texto: string, start: number, duration: number, words: { w: string; start: number; end: number }[]): EditairClip {
  return {
    id: novoId("leg"),
    trackId: "t-caption",
    kind: "caption",
    start,
    duration: Math.max(300, duration),
    sourceIn: 0,
    volume: 1,
    speed: 1,
    transform: transformPadrao(),
    text: texto,
    words,
    label: texto.slice(0, 20),
  };
}
