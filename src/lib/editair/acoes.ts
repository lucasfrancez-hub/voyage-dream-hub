/**
 * Ações do menu de contexto da timeline como transformações puras de estado.
 *
 * Tudo aqui devolve um estado novo (um único passo de undo/redo) e preserva
 * todas as propriedades do clipe: texto, efeitos, velocidade, transform,
 * volume, legendas, animações, keyframes etc.
 */
import { podeEditarClip, type ResultadoCamada } from "./layers";
import {
  novoId,
  recalcularDuracao,
  type EditairClip,
  type EditairTrack,
  type Marcador,
  type ProjectState,
} from "./types";

const trilha = (s: ProjectState, id: string) => s.tracks.find((t) => t.id === id) ?? null;

/** ids realmente editáveis (ignora clipes travados e camadas bloqueadas). */
export function idsEditaveis(s: ProjectState, ids: string[]): string[] {
  return ids.filter((id) => podeEditarClip(s, id).ok);
}

/**
 * Clona um conjunto de clipes gerando ids novos e remapeando as referências
 * internas (legenda vinculada e par vídeo↔áudio) para os clones.
 */
export function clonarClips(clips: EditairClip[], deslocamentoMs = 0): EditairClip[] {
  const mapaId = new Map(clips.map((c) => [c.id, novoId()] as const));
  const mapaVinculo = new Map<string, string>();
  for (const c of clips) {
    if (c.vinculoAudio && !mapaVinculo.has(c.vinculoAudio)) mapaVinculo.set(c.vinculoAudio, novoId());
  }
  return clips.map((c) => {
    const clone: EditairClip = {
      ...c,
      // cópias profundas do que é objeto/array, para o clone não compartilhar referência
      transform: { ...c.transform },
      textStyle: c.textStyle ? { ...c.textStyle } : undefined,
      captionStyle: c.captionStyle ? { ...c.captionStyle } : undefined,
      words: c.words ? c.words.map((w) => ({ ...w })) : undefined,
      keyframes: c.keyframes ? c.keyframes.map((k) => ({ ...k })) : undefined,
      efeitos: c.efeitos ? JSON.parse(JSON.stringify(c.efeitos)) : undefined,
      animacao: c.animacao ? { ...c.animacao } : undefined,
      ajustes: c.ajustes ? { ...c.ajustes } : undefined,
      eq: c.eq ? { ...c.eq } : undefined,
      id: mapaId.get(c.id)!,
      start: Math.max(0, c.start + deslocamentoMs),
    };
    if (c.linkClipId && mapaId.has(c.linkClipId)) clone.linkClipId = mapaId.get(c.linkClipId);
    if (c.vinculoAudio) clone.vinculoAudio = mapaVinculo.get(c.vinculoAudio);
    return clone;
  });
}

const NOME_KIND: Record<EditairTrack["kind"], string> = {
  text: "Texto",
  caption: "Legendas",
  broll: "B-roll",
  video: "Vídeo",
  voice: "Voz",
  music: "Música",
};

/** Cria uma camada do mesmo tipo no índice pedido (0 = topo). */
function criarCamada(s: ProjectState, kind: EditairTrack["kind"], indice: number): { state: ProjectState; track: EditairTrack } {
  const n = s.tracks.filter((t) => t.kind === kind).length + 1;
  const nova: EditairTrack = {
    id: `t-${kind}-${n}-${Math.random().toString(36).slice(2, 6)}`,
    kind,
    name: `${NOME_KIND[kind]} ${n}`,
  };
  const tracks = [...s.tracks];
  tracks.splice(Math.max(0, Math.min(tracks.length, indice)), 0, nova);
  return { state: { ...s, tracks }, track: nova };
}

const conflita = (a: { start: number; duration: number }, b: { start: number; duration: number }) =>
  a.start < b.start + b.duration && b.start < a.start + a.duration;

/**
 * Copia clipes MANTENDO a posição temporal, porém numa camada acima da original.
 * Reutiliza a camada de cima quando ela é do mesmo tipo, está livre no intervalo
 * e destravada; caso contrário cria uma camada nova logo acima.
 */
export function copiarEmCamadaAcima(
  s: ProjectState,
  clips: EditairClip[],
): ResultadoCamada & { novosIds?: string[] } {
  if (!clips.length) return { ok: false, erro: "Nada para copiar." };
  let base = s;
  const novos: EditairClip[] = [];

  // agrupa por camada de origem, de baixo para cima (índice maior primeiro)
  const grupos = new Map<string, EditairClip[]>();
  for (const c of clips) {
    const tid = trilha(base, c.trackId) ? c.trackId : (base.tracks[0]?.id ?? c.trackId);
    grupos.set(tid, [...(grupos.get(tid) ?? []), c]);
  }
  const ordenados = [...grupos.entries()].sort(
    (a, b) => base.tracks.findIndex((t) => t.id === b[0]) - base.tracks.findIndex((t) => t.id === a[0]),
  );

  for (const [tid, grupo] of ordenados) {
    const origem = trilha(base, tid);
    if (!origem) continue;
    const iOrigem = base.tracks.findIndex((t) => t.id === tid);
    const acima = base.tracks[iOrigem - 1];
    const clones = clonarClips(grupo, 0).map((c, k) => ({ ...c, start: grupo[k]!.start }));

    const livre =
      acima &&
      acima.kind === origem.kind &&
      !acima.locked &&
      !base.clips.some((x) => x.trackId === acima.id && clones.some((n) => conflita(n, x))) &&
      !novos.some((x) => x.trackId === acima.id && clones.some((n) => conflita(n, x)));

    let destinoId: string;
    if (livre && acima) {
      destinoId = acima.id;
    } else {
      const r = criarCamada(base, origem.kind, iOrigem);
      base = r.state;
      destinoId = r.track.id;
    }
    novos.push(...clones.map((c) => ({ ...c, trackId: destinoId })));
  }

  if (!novos.length) return { ok: false, erro: "Não foi possível criar a cópia." };
  return {
    ok: true,
    novosIds: novos.map((c) => c.id),
    state: recalcularDuracao({ ...base, clips: [...base.clips, ...novos] }),
  };
}

/**
 * Duplica a seleção na MESMA posição temporal, numa camada imediatamente acima.
 */
export function duplicarClips(s: ProjectState, ids: string[]): ResultadoCamada & { novosIds?: string[] } {
  const alvo = idsEditaveis(s, ids);
  if (!alvo.length) return { ok: false, erro: "Nada para duplicar (seleção vazia ou bloqueada)." };
  return copiarEmCamadaAcima(s, s.clips.filter((c) => alvo.includes(c.id)));
}

/**
 * Cola o clipboard interno preservando a posição temporal original e as
 * distâncias entre os clipes, sempre numa camada nova/livre acima da original.
 */
export function colarClips(
  s: ProjectState,
  clipboard: EditairClip[],
  _playheadMs?: number,
): ResultadoCamada & { novosIds?: string[] } {
  if (!clipboard.length) return { ok: false, erro: "Nada copiado ainda." };
  return copiarEmCamadaAcima(s, clipboard);
}


/**
 * Congela/descongela o(s) clipe(s). Ao congelar guardamos a velocidade
 * original em `speedAntes` para o descongelar devolver exatamente o que era.
 */
export function alternarCongelado(s: ProjectState, ids: string[], forcar?: boolean): ResultadoCamada {
  const alvo = idsEditaveis(s, ids).filter((id) => {
    const c = s.clips.find((x) => x.id === id);
    return c?.kind === "video" || c?.kind === "image";
  });
  if (!alvo.length) return { ok: false, erro: "Só clipes de vídeo ou imagem podem ser congelados." };
  const primeiro = s.clips.find((c) => c.id === alvo[0])!;
  const congelar = forcar ?? !primeiro.congelado;
  return {
    ok: true,
    state: {
      ...s,
      clips: s.clips.map((c) => {
        if (!alvo.includes(c.id)) return c;
        return congelar
          ? { ...c, congelado: true, speedAntes: c.congelado ? c.speedAntes : c.speed, speed: 0.01 }
          : { ...c, congelado: false, speed: c.speedAntes ?? 1, speedAntes: undefined };
      }),
    },
  };
}

/** true quando o clipe já tem um clipe de áudio separado vivo no projeto. */
export function audioJaSeparado(s: ProjectState, cid: string): boolean {
  const c = s.clips.find((x) => x.id === cid);
  if (!c?.vinculoAudio) return false;
  return s.clips.some((x) => x.id !== cid && x.vinculoAudio === c.vinculoAudio);
}

/**
 * Extrai a faixa de áudio do clipe de vídeo para um clipe independente numa
 * camada de áudio, mantendo o sincronismo. O vídeo fica `semAudio` e os dois
 * passam a compartilhar um `vinculoAudio` (permite revincular depois).
 */
export function extrairAudioDeClip(s: ProjectState, cid: string): ResultadoCamada & { novoId?: string } {
  const c = s.clips.find((x) => x.id === cid);
  if (!c) return { ok: false, erro: "Clipe não encontrado." };
  if (c.kind !== "video") return { ok: false, erro: "Só clipes de vídeo têm áudio para extrair." };
  if (!c.assetId) return { ok: false, erro: "Clipe sem mídia de origem." };
  const editavel = podeEditarClip(s, cid);
  if (!editavel.ok) return { ok: false, erro: editavel.erro! };
  if (audioJaSeparado(s, cid)) return { ok: false, erro: "O áudio deste clipe já está separado." };

  const existente = s.tracks.find((t) => t.kind === "voice") ?? s.tracks.find((t) => t.kind === "music");
  const destino: EditairTrack = existente ?? { id: "t-voice", kind: "voice", name: "Voz" };
  if (destino.locked) return { ok: false, erro: "A camada de áudio está bloqueada." };
  const tracks = existente ? s.tracks : [...s.tracks, destino];

  const vinculo = c.vinculoAudio ?? novoId();
  const [audio] = clonarClips([c]);
  const clipeAudio: EditairClip = {
    ...audio,
    trackId: destino.id,
    kind: "audio",
    label: `Áudio · ${c.label ?? "clipe"}`.trim(),
    vinculoAudio: vinculo,
    // o áudio extraído carrega o som: nunca nasce mudo nem congelado
    semAudio: false,
    muted: false,
    congelado: false,
    speed: c.speed,
    // propriedades visuais não fazem sentido num clipe de áudio
    efeitos: undefined,
    filtro: undefined,
    efeito: undefined,
    animacao: undefined,
    transicao: undefined,
    mascara: undefined,
    chroma: undefined,
    fundo: undefined,
    words: undefined,
    linkClipId: undefined,
  };

  return {
    ok: true,
    novoId: clipeAudio.id,
    state: recalcularDuracao({
      ...s,
      tracks,
      clips: [
        ...s.clips.map((x) => (x.id === cid ? { ...x, semAudio: true, vinculoAudio: vinculo } : x)),
        clipeAudio,
      ],
    }),
  };
}

/** Desfaz a separação: remove o clipe de áudio extraído e devolve o som ao vídeo. */
export function revincularAudio(s: ProjectState, cid: string): ResultadoCamada {
  const c = s.clips.find((x) => x.id === cid);
  if (!c) return { ok: false, erro: "Clipe não encontrado." };
  const editavel = podeEditarClip(s, cid);
  if (!editavel.ok) return { ok: false, erro: editavel.erro! };
  const vinculo = c.vinculoAudio;
  const pares = vinculo ? s.clips.filter((x) => x.id !== cid && x.vinculoAudio === vinculo) : [];
  return {
    ok: true,
    state: recalcularDuracao({
      ...s,
      clips: s.clips
        .filter((x) => !pares.some((p) => p.id === x.id))
        .map((x) => (x.id === cid ? { ...x, semAudio: false, vinculoAudio: undefined } : x)),
    }),
  };
}

/* ---------------- marcadores ---------------- */

export function atualizarMarcador(s: ProjectState, id: string, patch: Partial<Marcador>): ProjectState {
  return { ...s, marcadores: (s.marcadores ?? []).map((m) => (m.id === id ? { ...m, ...patch } : m)) };
}

export function excluirMarcador(s: ProjectState, id: string): ProjectState {
  return { ...s, marcadores: (s.marcadores ?? []).filter((m) => m.id !== id) };
}
