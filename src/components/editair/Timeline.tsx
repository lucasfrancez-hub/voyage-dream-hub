import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Eye,
  EyeOff,
  Lock,
  LockOpen,
  Volume2,
  VolumeX,
  Headphones,
  Plus,
  GripVertical,
  Pencil,
  Trash2,
} from "lucide-react";
import type { EditairClip, EditairTrack, ProjectState } from "@/lib/editair/types";
import { formatarTempo } from "@/lib/editair/types";
import { posicionarMenu } from "@/lib/editair/layers";
import { limitesDoClip } from "@/lib/editair/ops";
import { obterPicos, obterThumb } from "@/lib/editair/media";

export type AssetInfo = { id?: string; url: string; durationMs: number; kind: string; name: string };

export type AcaoClip =
  | "dividir"
  | "duplicar"
  | "excluir"
  | "bloquear"
  | "mudo"
  | "congelar"
  | "desvincular"
  | "ripple"
  | "copiar"
  | "extrair-audio"
  | "aparar";

/** Destino de um clip solto na timeline. */
export type DestinoSolto = { tipo: "track"; trackId: string } | { tipo: "nova"; indice: number };

const ALTURA_TRILHA = 56; // h-14

const CORES: Record<string, string> = {
  "t-text": "bg-violet-600/70 border-violet-300/40",
  "t-caption": "bg-amber-600/70 border-amber-300/40",
  "t-broll": "bg-sky-600/70 border-sky-300/40",
  "t-video": "bg-[#1d4f55] border-[#2c8d95]",
  "t-voice": "bg-emerald-700/70 border-emerald-400/40",
  "t-music": "bg-[#155445] border-emerald-400/40",
};

type Props = {
  state: ProjectState;
  playheadMs: number;
  zoom: number; // px por segundo
  selecionados: string[];
  selecao: { fromMs: number; toMs: number } | null;
  assets: Record<string, AssetInfo>;
  snapping: boolean;
  rippleTrim: boolean;
  onSeek: (ms: number) => void;
  onSelecionar: (ids: string[]) => void;
  onSelecao: (s: { fromMs: number; toMs: number } | null) => void;
  onAlterarClip: (id: string, patch: Partial<EditairClip>, commit: boolean) => void;
  onAlterarClips: (patches: Record<string, Partial<EditairClip>>, commit: boolean) => void;
  onToggleTrack: (trackId: string, campo: "muted" | "hidden" | "locked" | "solo") => void;
  onAbrirSource: (clipId: string) => void;
  onRestaurarClip: (clipId: string) => void;
  onAcaoClip?: (clipId: string, acao: AcaoClip) => void;
  /** Arquivos arrastados do Finder/Explorer direto para a timeline. */
  onSoltarArquivos?: (arquivos: FileList, ms: number) => void;
  /** Cria uma nova camada de vídeo acima das existentes (composição/PiP). */
  onNovaTrilhaVideo?: () => void;
  /** Clip solto após drag vertical: muda de camada (e de posição). */
  onSoltarClip?: (clipId: string, destino: DestinoSolto, startMs: number) => void;
  /** Move o clip uma camada acima (-1) ou abaixo (+1). */
  onMoverCamada?: (clipId: string, direcao: -1 | 1) => void;
  /** Cria uma camada nova acima (-1) ou abaixo (+1) do clip e move o clip para ela. */
  onNovaCamadaJunto?: (clipId: string, direcao: -1 | 1) => void;
  onReordenarTracks?: (de: number, para: number) => void;
  onRenomearTrack?: (trackId: string, nome: string) => void;
  onExcluirTrack?: (trackId: string) => void;
  onEditarComIa?: (clipId: string) => void;
};

type Dica = { x: number; y: number; titulo: string; valor: string; delta: string } | null;

export function Timeline({
  state,
  playheadMs,
  zoom,
  selecionados,
  selecao,
  assets,
  snapping,
  rippleTrim,
  onSeek,
  onSelecionar,
  onSelecao,
  onAlterarClip,
  onAlterarClips,
  onToggleTrack,
  onAbrirSource,
  onRestaurarClip,
  onAcaoClip,
  onSoltarArquivos,
  onNovaTrilhaVideo,
  onSoltarClip,
  onMoverCamada,
  onNovaCamadaJunto,
  onReordenarTracks,
  onRenomearTrack,
  onExcluirTrack,
  onEditarComIa,
}: Props) {
  const areaRef = useRef<HTMLDivElement>(null);
  const pxPorMs = zoom / 1000;
  const larguraTotal = Math.max(1200, (state.durationMs + 6000) * pxPorMs);
  const [dica, setDica] = useState<Dica>(null);
  const [arrastandoId, setArrastandoId] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; clipId: string } | null>(null);
  const [soltando, setSoltando] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null);
  const [alvo, setAlvo] = useState<DestinoSolto | null>(null);
  const [arrastandoTrack, setArrastandoTrack] = useState<number | null>(null);
  const linhasRef = useRef<Record<string, HTMLDivElement | null>>({});

  /* menu de contexto: collision detection (flip + shift) medindo o menu já renderizado */
  useLayoutEffect(() => {
    if (!menu) {
      setMenuPos(null);
      return;
    }
    const el = menuRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setMenuPos(posicionarMenu(menu.x, menu.y, r.width, r.height, window.innerWidth, window.innerHeight));
  }, [menu]);

  const duracoes = useMemo(() => {
    const m: Record<string, number> = {};
    for (const [id, a] of Object.entries(assets)) m[id] = a.durationMs;
    return m;
  }, [assets]);

  const msDoEvento = useCallback(
    (clientX: number) => {
      const el = areaRef.current;
      if (!el) return 0;
      const rect = el.getBoundingClientRect();
      return Math.max(0, Math.round((clientX - rect.left + el.scrollLeft) / pxPorMs));
    },
    [pxPorMs],
  );

  /** Descobre qual camada (ou zona de nova camada) está sob o cursor. */
  const destinoDoY = useCallback(
    (clientY: number): DestinoSolto | null => {
      const ids = state.tracks.map((t) => t.id);
      const rects = ids
        .map((id) => {
          const el = linhasRef.current[id];
          return el ? ({ id, r: el.getBoundingClientRect() } as const) : null;
        })
        .filter((v): v is { id: string; r: DOMRect } => !!v);
      if (!rects.length) return null;
      const primeiro = rects[0];
      const ultimo = rects[rects.length - 1];
      if (clientY < primeiro.r.top) return { tipo: "nova", indice: 0 };
      if (clientY > ultimo.r.bottom) return { tipo: "nova", indice: state.tracks.length };
      for (const { id, r } of rects) {
        if (clientY >= r.top && clientY <= r.bottom) return { tipo: "track", trackId: id };
      }
      return null;
    },
    [state.tracks],
  );

  const pontosSnap = useMemo(() => {
    const p = [0, playheadMs];
    for (const c of state.clips) {
      p.push(c.start, c.start + c.duration);
    }
    return p;
  }, [state.clips, playheadMs]);

  const encaixar = useCallback(
    (ms: number) => {
      if (!snapping) return ms;
      const tol = 12 / pxPorMs;
      let melhor = ms;
      let dist = tol;
      for (const p of pontosSnap) {
        const d = Math.abs(p - ms);
        if (d < dist) {
          dist = d;
          melhor = p;
        }
      }
      return Math.max(0, Math.round(melhor));
    },
    [snapping, pontosSnap, pxPorMs],
  );

  const marcas = useMemo(() => {
    const passo = zoom > 160 ? 1000 : zoom > 90 ? 2000 : zoom > 40 ? 5000 : zoom > 18 ? 10000 : 30000;
    const out: number[] = [];
    for (let t = 0; t <= state.durationMs + 6000; t += passo) out.push(t);
    return out;
  }, [zoom, state.durationMs]);

  /* arrastar clipe / trim — sempre não destrutivo: mexe só em sourceIn/duração */
  const iniciarArraste = (
    e: React.PointerEvent,
    clip: EditairClip,
    modo: "mover" | "trim-in" | "trim-out",
  ) => {
    const trilha = state.tracks.find((t) => t.id === clip.trackId);
    if (trilha?.locked || clip.bloqueado) return;
    e.stopPropagation();
    const inicioMs = msDoEvento(e.clientX);
    const base = { start: clip.start, duration: clip.duration, sourceIn: clip.sourceIn };
    const lim = limitesDoClip(clip, duracoes);
    const speed = clip.speed || 1;
    const fimAntigo = base.start + base.duration;
    const posteriores = state.clips.filter((c) => c.trackId === clip.trackId && c.start >= fimAntigo && c.id !== clip.id);
    setArrastandoId(clip.id);
    let ultimoStart = base.start;
    let ultimoDestino: DestinoSolto | null = null;

    const mover = (ev: PointerEvent) => {
      const delta = msDoEvento(ev.clientX) - inicioMs;

      if (modo === "mover") {
        ultimoStart = Math.max(0, encaixar(base.start + delta));
        onAlterarClip(clip.id, { start: ultimoStart }, false);
        // drag vertical → camada de destino
        const d = destinoDoY(ev.clientY);
        const mesma = d && d.tipo === "track" && d.trackId === clip.trackId;
        const destinoTravado =
          d && d.tipo === "track" && !!state.tracks.find((t) => t.id === d.trackId)?.locked;
        ultimoDestino = !d || mesma || destinoTravado ? null : d;
        setAlvo(ultimoDestino);
        const dest = ultimoDestino;
        setDica({
          x: ev.clientX,
          y: ev.clientY,
          titulo: !dest
            ? trilha?.name ?? "Camada"
            : dest.tipo === "nova"
              ? "Nova camada"
              : state.tracks.find((t) => t.id === dest.trackId)?.name ?? "Camada",
          valor: formatarTempo(ultimoStart, true),
          delta: `${delta >= 0 ? "+" : "−"}${formatarTempo(Math.abs(delta), true)}`,
        });
        return;
      }

      if (modo === "trim-in") {
        // limite: não passa do início real do arquivo nem some com o clipe
        const bruto = encaixar(base.start + delta) - base.start;
        const dif = Math.max(-Math.min(lim.esquerda, base.start), Math.min(base.duration - 100, bruto));
        const novoSourceIn = Math.max(0, base.sourceIn + dif * speed);
        const patches: Record<string, Partial<EditairClip>> = {
          [clip.id]: rippleTrim
            ? { start: base.start, duration: base.duration - dif, sourceIn: novoSourceIn }
            : { start: base.start + dif, duration: base.duration - dif, sourceIn: novoSourceIn },
        };
        if (rippleTrim) {
          for (const c of posteriores) patches[c.id] = { start: Math.max(0, c.start - dif) };
        }
        onAlterarClips(patches, false);
        onSeek(Math.max(0, (rippleTrim ? base.start : base.start + dif)));
        setDica({
          x: ev.clientX,
          y: ev.clientY,
          titulo: "Source In",
          valor: formatarTempo(novoSourceIn, true),
          delta: `${dif >= 0 ? "+" : "−"}${formatarTempo(Math.abs(dif), true)}`,
        });
        return;
      }

      // trim-out
      const maxDur = Number.isFinite(lim.direita) ? base.duration + lim.direita : Infinity;
      const bruto = encaixar(base.start + base.duration + delta) - base.start;
      const novaDur = Math.max(100, Math.min(maxDur, bruto));
      const dif = novaDur - base.duration;
      const patches: Record<string, Partial<EditairClip>> = { [clip.id]: { duration: novaDur } };
      if (rippleTrim) {
        for (const c of posteriores) patches[c.id] = { start: Math.max(0, c.start + dif) };
      }
      onAlterarClips(patches, false);
      onSeek(base.start + novaDur);
      setDica({
        x: ev.clientX,
        y: ev.clientY,
        titulo: "Source Out",
        valor: formatarTempo(base.sourceIn + novaDur * speed, true),
        delta: `${dif >= 0 ? "+" : "−"}${formatarTempo(Math.abs(dif), true)}`,
      });
    };

    const soltar = () => {
      window.removeEventListener("pointermove", mover);
      window.removeEventListener("pointerup", soltar);
      setDica(null);
      setArrastandoId(null);
      setAlvo(null);
      if (modo === "mover" && ultimoDestino && onSoltarClip) {
        onSoltarClip(clip.id, ultimoDestino, ultimoStart);
        return;
      }
      onAlterarClip(clip.id, {}, true);
    };
    window.addEventListener("pointermove", mover);
    window.addEventListener("pointerup", soltar);
  };

  const clipMenu = menu ? state.clips.find((c) => c.id === menu.clipId) ?? null : null;
  const trilhaMenu = clipMenu ? state.tracks.find((t) => t.id === clipMenu.trackId) ?? null : null;
  const idxTrilhaMenu = trilhaMenu ? state.tracks.findIndex((t) => t.id === trilhaMenu.id) : -1;

  return (
    <div className="relative flex h-full min-h-0 flex-col bg-[#0d1116]" onPointerDown={() => setMenu(null)}>
      <div className="flex min-h-0 flex-1">
        {/* cabeçalho das trilhas */}
        <div className="w-[170px] shrink-0 border-r border-white/10 bg-[#10151b]">
          <div className="flex h-7 items-center justify-between border-b border-white/10 px-2">
            <span className="text-[10px] uppercase tracking-wide text-white/30">Camadas</span>
            {onNovaTrilhaVideo ? (
              <button
                type="button"
                title="Nova camada de vídeo"
                onClick={onNovaTrilhaVideo}
                className="rounded p-0.5 text-white/45 transition hover:bg-white/10 hover:text-white"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>
          {state.tracks.map((t, i) => (
            <TrackLabel
              key={t.id}
              track={t}
              indice={i}
              vazia={!state.clips.some((c) => c.trackId === t.id)}
              arrastandoIndice={arrastandoTrack}
              onToggle={onToggleTrack}
              onRenomear={onRenomearTrack}
              onExcluir={onExcluirTrack}
              onIniciarReorder={setArrastandoTrack}
              onSoltarReorder={(para) => {
                if (arrastandoTrack !== null && arrastandoTrack !== para) onReordenarTracks?.(arrastandoTrack, para);
                setArrastandoTrack(null);
              }}
            />
          ))}
          {onNovaTrilhaVideo ? (
            <button
              type="button"
              onClick={onNovaTrilhaVideo}
              className="flex w-full items-center gap-1.5 px-2 py-2 text-[11px] text-white/45 transition hover:bg-white/5 hover:text-white"
            >
              <Plus className="h-3.5 w-3.5" /> Nova camada de vídeo
            </button>
          ) : null}
        </div>

        {/* área rolável */}
        <div
          ref={areaRef}
          className={`relative min-h-0 flex-1 overflow-auto ${soltando ? "ring-2 ring-inset ring-[#F26B1F]" : ""}`}
          onDragOver={
            onSoltarArquivos
              ? (e) => {
                  e.preventDefault();
                  setSoltando(true);
                }
              : undefined
          }
          onDragLeave={onSoltarArquivos ? () => setSoltando(false) : undefined}
          onDrop={
            onSoltarArquivos
              ? (e) => {
                  e.preventDefault();
                  setSoltando(false);
                  if (e.dataTransfer.files?.length) onSoltarArquivos(e.dataTransfer.files, msDoEvento(e.clientX));
                }
              : undefined
          }
        >
          <div style={{ width: larguraTotal }} className="relative">
            {/* régua */}
            <div
              className="sticky top-0 z-20 h-7 cursor-pointer border-b border-white/10 bg-[#0f141a]"
              onPointerDown={(e) => {
                const inicio = msDoEvento(e.clientX);
                onSeek(inicio);
                onSelecao(null);
                const mover = (ev: PointerEvent) => {
                  const atual = msDoEvento(ev.clientX);
                  if (Math.abs(atual - inicio) > 60) {
                    onSelecao({ fromMs: Math.min(inicio, atual), toMs: Math.max(inicio, atual) });
                  } else {
                    onSeek(atual);
                  }
                };
                const soltar = () => {
                  window.removeEventListener("pointermove", mover);
                  window.removeEventListener("pointerup", soltar);
                };
                window.addEventListener("pointermove", mover);
                window.addEventListener("pointerup", soltar);
              }}
            >
              {marcas.map((t) => (
                <div key={t} className="absolute top-0 h-full" style={{ left: t * pxPorMs }}>
                  <div className="h-2 w-px bg-white/20" />
                  <span className="ml-1 text-[10px] text-white/35">{formatarTempo(t)}</span>
                </div>
              ))}
            </div>

            {selecao ? (
              <div
                className="pointer-events-none absolute top-7 z-10 h-full border-x border-[#F26B1F]/70 bg-[#F26B1F]/10"
                style={{ left: selecao.fromMs * pxPorMs, width: (selecao.toMs - selecao.fromMs) * pxPorMs }}
              />
            ) : null}

            {/* zona de nova camada acima de tudo */}
            {alvo?.tipo === "nova" && alvo.indice === 0 ? (
              <div className="pointer-events-none flex h-6 items-center justify-center border-y border-dashed border-[#F26B1F] bg-[#F26B1F]/10 text-[10px] text-[#F26B1F]">
                Nova camada acima
              </div>
            ) : null}

            {state.tracks.map((t) => (
              <div
                key={t.id}
                ref={(el) => {
                  linhasRef.current[t.id] = el;
                }}
                className={`relative border-b border-white/5 ${
                  alvo?.tipo === "track" && alvo.trackId === t.id ? "bg-[#F26B1F]/10 ring-1 ring-inset ring-[#F26B1F]/60" : ""
                } ${t.hidden ? "opacity-50" : ""}`}
                style={{ height: ALTURA_TRILHA }}
                onPointerDown={(e) => {
                  if (e.target === e.currentTarget) onSelecionar([]);
                }}
              >
                {state.clips
                  .filter((c) => c.trackId === t.id)
                  .map((c) => (
                    <Clipe
                      key={c.id}
                      clip={c}
                      asset={c.assetId ? assets[c.assetId] : undefined}
                      pxPorMs={pxPorMs}
                      selecionado={selecionados.includes(c.id)}
                      arrastando={arrastandoId === c.id}
                      bloqueado={!!t.locked}
                      onSelect={(aditivo) =>
                        onSelecionar(
                          aditivo
                            ? selecionados.includes(c.id)
                              ? selecionados.filter((x) => x !== c.id)
                              : [...selecionados, c.id]
                            : [c.id],
                        )
                      }
                      onArrastar={iniciarArraste}
                      onAbrirSource={() => onAbrirSource(c.id)}
                      onMenu={(x, y) => {
                        setMenuPos(null);
                        setMenu({ x, y, clipId: c.id });
                      }}
                    />
                  ))}
              </div>
            ))}

            {/* zona de nova camada abaixo de tudo */}
            {alvo?.tipo === "nova" && alvo.indice === state.tracks.length ? (
              <div className="pointer-events-none flex h-6 items-center justify-center border-y border-dashed border-[#F26B1F] bg-[#F26B1F]/10 text-[10px] text-[#F26B1F]">
                Nova camada abaixo
              </div>
            ) : null}

            {/* marcadores */}
            {(state.marcadores ?? []).map((m) => (
              <div
                key={m.id}
                title={m.nota ?? "Marcador"}
                className="pointer-events-none absolute top-0 z-20 h-full w-px"
                style={{ left: m.atMs * pxPorMs, background: `${m.cor}66` }}
              >
                <span className="-ml-1 block h-2 w-2 rotate-45" style={{ background: m.cor }} />
              </div>
            ))}

            {/* playhead */}

            <div
              className="absolute top-0 z-30 h-full w-px cursor-ew-resize bg-white"
              style={{ left: playheadMs * pxPorMs }}
              onPointerDown={(e) => {
                e.stopPropagation();
                const mover = (ev: PointerEvent) => onSeek(msDoEvento(ev.clientX));
                const soltar = () => {
                  window.removeEventListener("pointermove", mover);
                  window.removeEventListener("pointerup", soltar);
                };
                window.addEventListener("pointermove", mover);
                window.addEventListener("pointerup", soltar);
              }}
            >
              <div className="-ml-[5px] h-2.5 w-2.5 rounded-b bg-white" />
            </div>
          </div>
        </div>
      </div>

      {dica ? (
        <div
          className="pointer-events-none fixed z-[60] rounded-lg border border-white/15 bg-[#0f141a]/95 px-2.5 py-1.5 text-[11px] shadow-lg backdrop-blur"
          style={{ left: dica.x + 14, top: dica.y - 44 }}
        >
          <p className="text-white/50">{dica.titulo}</p>
          <p className="font-mono text-white">{dica.valor}</p>
          <p className="font-mono text-[#F26B1F]">{dica.delta}</p>
        </div>
      ) : null}

      {menu && clipMenu ? (
        <div
          ref={menuRef}
          className="fixed z-[60] flex max-h-[calc(100vh-16px)] w-60 flex-col overflow-y-auto overscroll-contain rounded-xl border border-white/10 bg-[#12171d] py-1 text-[12px] shadow-2xl"
          style={{ left: menuPos?.x ?? menu.x, top: menuPos?.y ?? menu.y, visibility: menuPos ? "visible" : "hidden" }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {onEditarComIa ? (
            <>
              <button
                className="block w-full px-3 py-2 text-left font-medium text-[#F26B1F] hover:bg-[#F26B1F]/10"
                onClick={() => {
                  onEditarComIa(menu.clipId);
                  setMenu(null);
                }}
              >
                ✨ Editar com IA
              </button>
              <div className="my-1 h-px bg-white/10" />
            </>
          ) : null}

          {[
            { id: "dividir" as const, nome: "Dividir no playhead" },
            { id: "aparar" as const, nome: "Aparar até o playhead" },
            { id: "duplicar" as const, nome: "Duplicar" },
            { id: "copiar" as const, nome: "Copiar" },
          ].map((a) => (
            <button
              key={a.id}
              className="block w-full px-3 py-2 text-left hover:bg-white/10"
              onClick={() => {
                onAcaoClip?.(menu.clipId, a.id);
                setMenu(null);
              }}
            >
              {a.nome}
            </button>
          ))}
          <button
            className="block w-full px-3 py-2 text-left hover:bg-white/10"
            onClick={() => {
              onRestaurarClip(menu.clipId);
              setMenu(null);
            }}
          >
            Restaurar duração original
          </button>
          <button
            className="block w-full px-3 py-2 text-left hover:bg-white/10"
            onClick={() => {
              onAbrirSource(menu.clipId);
              setMenu(null);
            }}
          >
            Abrir material original
          </button>

          {clipMenu.kind === "video" || clipMenu.kind === "audio" ? (
            <>
              <div className="my-1 h-px bg-white/10" />
              <button
                className="block w-full px-3 py-2 text-left hover:bg-white/10"
                onClick={() => {
                  onAcaoClip?.(menu.clipId, "desvincular");
                  setMenu(null);
                }}
              >
                Desvincular áudio
              </button>
              {clipMenu.kind === "video" ? (
                <button
                  className="block w-full px-3 py-2 text-left hover:bg-white/10"
                  onClick={() => {
                    onAcaoClip?.(menu.clipId, "extrair-audio");
                    setMenu(null);
                  }}
                >
                  Extrair áudio para nova faixa
                </button>
              ) : null}
              <button
                className="block w-full px-3 py-2 text-left hover:bg-white/10"
                onClick={() => {
                  onAcaoClip?.(menu.clipId, "mudo");
                  setMenu(null);
                }}
              >
                Silenciar / reativar
              </button>
            </>
          ) : null}

          {clipMenu.kind === "video" || clipMenu.kind === "image" ? (
            <>
              <div className="my-1 h-px bg-white/10" />
              <button
                disabled={idxTrilhaMenu <= 0}
                className="block w-full px-3 py-2 text-left hover:bg-white/10 disabled:opacity-35"
                onClick={() => {
                  onMoverCamada?.(menu.clipId, -1);
                  setMenu(null);
                }}
              >
                Mover para camada acima
              </button>
              <button
                disabled={idxTrilhaMenu < 0 || idxTrilhaMenu >= state.tracks.length - 1}
                className="block w-full px-3 py-2 text-left hover:bg-white/10 disabled:opacity-35"
                onClick={() => {
                  onMoverCamada?.(menu.clipId, 1);
                  setMenu(null);
                }}
              >
                Mover para camada abaixo
              </button>
              <button
                className="block w-full px-3 py-2 text-left hover:bg-white/10"
                onClick={() => {
                  onNovaCamadaJunto?.(menu.clipId, -1);
                  setMenu(null);
                }}
              >
                Criar nova camada acima
              </button>
              <button
                className="block w-full px-3 py-2 text-left hover:bg-white/10"
                onClick={() => {
                  onNovaCamadaJunto?.(menu.clipId, 1);
                  setMenu(null);
                }}
              >
                Criar nova camada abaixo
              </button>
            </>
          ) : null}

          <div className="my-1 h-px bg-white/10" />
          <button
            className="block w-full px-3 py-2 text-left hover:bg-white/10"
            onClick={() => {
              onAcaoClip?.(menu.clipId, "congelar");
              setMenu(null);
            }}
          >
            Congelar frame
          </button>
          <button
            className="block w-full px-3 py-2 text-left hover:bg-white/10"
            onClick={() => {
              onAcaoClip?.(menu.clipId, "bloquear");
              setMenu(null);
            }}
          >
            Bloquear / desbloquear
          </button>
          <div className="my-1 h-px bg-white/10" />
          <button
            className="block w-full px-3 py-2 text-left text-red-400 hover:bg-red-500/10"
            onClick={() => {
              onAcaoClip?.(menu.clipId, "ripple");
              setMenu(null);
            }}
          >
            Ripple delete (fecha o buraco)
          </button>
          <button
            className="block w-full px-3 py-2 text-left text-red-400 hover:bg-red-500/10"
            onClick={() => {
              onAcaoClip?.(menu.clipId, "excluir");
              setMenu(null);
            }}
          >
            Excluir clipe
          </button>
        </div>
      ) : null}
    </div>
  );
}

function TrackLabel({
  track,
  indice,
  vazia,
  arrastandoIndice,
  onToggle,
  onRenomear,
  onExcluir,
  onIniciarReorder,
  onSoltarReorder,
}: {
  track: EditairTrack;
  indice: number;
  vazia: boolean;
  arrastandoIndice: number | null;
  onToggle: (id: string, campo: "muted" | "hidden" | "locked" | "solo") => void;
  onRenomear?: (id: string, nome: string) => void;
  onExcluir?: (id: string) => void;
  onIniciarReorder: (indice: number) => void;
  onSoltarReorder: (indice: number) => void;
}) {
  const audio = track.kind === "voice" || track.kind === "music" || track.kind === "video";
  const [editando, setEditando] = useState(false);
  const [nome, setNome] = useState(track.name);
  const [sobre, setSobre] = useState(false);

  const salvar = () => {
    setEditando(false);
    const n = nome.trim();
    if (n && n !== track.name) onRenomear?.(track.id, n);
    else setNome(track.name);
  };

  return (
    <div
      draggable={!!onRenomear || true}
      onDragStart={() => onIniciarReorder(indice)}
      onDragOver={(e) => {
        e.preventDefault();
        setSobre(true);
      }}
      onDragLeave={() => setSobre(false)}
      onDrop={(e) => {
        e.preventDefault();
        setSobre(false);
        onSoltarReorder(indice);
      }}
      onDragEnd={() => setSobre(false)}
      style={{ height: ALTURA_TRILHA }}
      className={`flex items-center justify-between gap-1 border-b border-white/5 px-1.5 text-[11px] text-white/65 ${
        sobre && arrastandoIndice !== null && arrastandoIndice !== indice ? "bg-[#F26B1F]/15" : ""
      }`}
    >
      <GripVertical className="h-3.5 w-3.5 shrink-0 cursor-grab text-white/25" />
      {editando ? (
        <input
          autoFocus
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          onBlur={salvar}
          onKeyDown={(e) => {
            if (e.key === "Enter") salvar();
            if (e.key === "Escape") {
              setNome(track.name);
              setEditando(false);
            }
          }}
          className="min-w-0 flex-1 rounded bg-black/40 px-1 py-0.5 text-[11px] text-white outline-none"
        />
      ) : (
        <span className="min-w-0 flex-1 truncate" onDoubleClick={() => setEditando(true)} title={track.name}>
          {track.name}
        </span>
      )}
      <div className="flex shrink-0 items-center gap-0.5">
        {onRenomear && !editando ? (
          <IconBtn title="Renomear camada" onClick={() => setEditando(true)}>
            <Pencil className="h-3 w-3" />
          </IconBtn>
        ) : null}
        <IconBtn title="Mostrar/ocultar" onClick={() => onToggle(track.id, "hidden")}>
          {track.hidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
        </IconBtn>
        {audio ? (
          <>
            <IconBtn title="Mudo" onClick={() => onToggle(track.id, "muted")}>
              {track.muted ? <VolumeX className="h-3.5 w-3.5 text-red-400" /> : <Volume2 className="h-3.5 w-3.5" />}
            </IconBtn>
            <IconBtn title="Solo" onClick={() => onToggle(track.id, "solo")}>
              <Headphones className={`h-3.5 w-3.5 ${track.solo ? "text-[#F26B1F]" : ""}`} />
            </IconBtn>
          </>
        ) : null}
        <IconBtn title="Bloquear" onClick={() => onToggle(track.id, "locked")}>
          {track.locked ? <Lock className="h-3.5 w-3.5 text-amber-400" /> : <LockOpen className="h-3.5 w-3.5" />}
        </IconBtn>
        {vazia && onExcluir ? (
          <IconBtn title="Excluir camada vazia" onClick={() => onExcluir(track.id)}>
            <Trash2 className="h-3 w-3 text-red-400" />
          </IconBtn>
        ) : null}
      </div>
    </div>
  );
}

function IconBtn({ children, onClick, title }: { children: React.ReactNode; onClick: () => void; title: string }) {
  return (
    <button
      title={title}
      onClick={onClick}
      className="rounded p-1 text-white/40 transition hover:bg-white/10 hover:text-white"
    >
      {children}
    </button>
  );
}

function Clipe({
  clip,
  asset,
  pxPorMs,
  selecionado,
  arrastando,
  bloqueado,
  onSelect,
  onArrastar,
  onAbrirSource,
  onMenu,
}: {
  clip: EditairClip;
  asset?: AssetInfo;
  pxPorMs: number;
  selecionado: boolean;
  arrastando: boolean;
  bloqueado: boolean;
  onSelect: (aditivo: boolean) => void;
  onArrastar: (e: React.PointerEvent, clip: EditairClip, modo: "mover" | "trim-in" | "trim-out") => void;
  onAbrirSource: () => void;
  onMenu: (x: number, y: number) => void;
}) {
  const largura = Math.max(8, clip.duration * pxPorMs);
  const visual = clip.kind === "video" || clip.kind === "image";
  const sonoro = clip.kind === "audio";
  const speed = clip.speed || 1;
  const dispEsq = asset ? Math.min(clip.sourceIn / speed, 60_000) : 0;
  const dispDir = asset
    ? Math.min(Math.max(0, (asset.durationMs - (clip.sourceIn + clip.duration * speed)) / speed), 60_000)
    : 0;
  const mostrarSobra = (selecionado || arrastando) && !!asset;

  return (
    <>
      {mostrarSobra && dispEsq > 1 ? (
        <div
          className="pointer-events-none absolute top-1.5 h-11 rounded-l-md border border-dashed border-white/25 bg-[repeating-linear-gradient(45deg,rgba(255,255,255,.09)_0_6px,transparent_6px_12px)]"
          style={{ left: (clip.start - dispEsq) * pxPorMs, width: dispEsq * pxPorMs }}
          title="Material disponível no arquivo original"
        />
      ) : null}
      {mostrarSobra && dispDir > 1 ? (
        <div
          className="pointer-events-none absolute top-1.5 h-11 rounded-r-md border border-dashed border-white/25 bg-[repeating-linear-gradient(45deg,rgba(255,255,255,.09)_0_6px,transparent_6px_12px)]"
          style={{ left: (clip.start + clip.duration) * pxPorMs, width: dispDir * pxPorMs }}
          title="Material disponível no arquivo original"
        />
      ) : null}

      <div
        onPointerDown={(e) => {
          if (e.button === 2) return;
          onSelect(e.shiftKey || e.metaKey || e.ctrlKey);
          onArrastar(e, clip, "mover");
        }}
        onDoubleClick={(e) => {
          e.stopPropagation();
          onAbrirSource();
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          onSelect(false);
          onMenu(e.clientX, e.clientY);
        }}
        className={`absolute top-1.5 flex h-11 select-none items-center overflow-hidden rounded-lg border-2 text-[11px] text-white/90 shadow-[0_2px_8px_rgba(0,0,0,.45)] transition ${
          CORES[clip.trackId] ?? (clip.trackId.startsWith("t-video") ? CORES["t-video"] : "bg-white/20 border-white/20")
        } ${selecionado ? "border-[#F26B1F] ring-1 ring-[#F26B1F]/60" : "hover:brightness-110"} ${
          bloqueado || clip.bloqueado ? "cursor-not-allowed opacity-70" : "cursor-grab"
        }`}
        style={{ left: clip.start * pxPorMs, width: largura }}
        title={clip.label ?? clip.text ?? clip.kind}
      >
        {visual && asset ? <Filmstrip clip={clip} asset={asset} largura={largura} /> : null}
        {sonoro && asset ? <WaveClip clip={clip} asset={asset} largura={largura} /> : null}
        {!visual && !sonoro ? (
          <span className="truncate px-2">{clip.text ?? clip.label ?? clip.kind}</span>
        ) : (
          <span className="pointer-events-none absolute bottom-0 left-1 max-w-[90%] truncate rounded-sm bg-black/50 px-1 text-[9px]">
            {clip.label ?? asset?.name ?? ""}
          </span>
        )}
        <span className="pointer-events-none absolute right-1 top-0.5 rounded bg-black/55 px-1 text-[9px] font-mono text-white/80">
          {(clip.duration / 1000).toFixed(1)}s
        </span>
        {clip.bloqueado ? (
          <span className="pointer-events-none absolute left-1 top-0.5 rounded bg-black/55 px-1 text-[9px]">🔒</span>
        ) : null}
        {clip.transicao ? (
          <span className="pointer-events-none absolute left-0 top-0 h-full w-3 bg-gradient-to-r from-white/60 to-transparent" />
        ) : null}
        {!bloqueado && !clip.bloqueado ? (
          <>
            <div
              onPointerDown={(e) => {
                e.stopPropagation();
                onSelect(false);
                onArrastar(e, clip, "trim-in");
              }}
              className={`absolute left-0 top-0 flex h-full w-2.5 cursor-ew-resize items-center justify-center transition ${
                selecionado ? "bg-white/70" : "bg-white/0 hover:bg-white/40"
              }`}
            >
              {selecionado ? <span className="h-5 w-px bg-black/50" /> : null}
            </div>
            <div
              onPointerDown={(e) => {
                e.stopPropagation();
                onSelect(false);
                onArrastar(e, clip, "trim-out");
              }}
              className={`absolute right-0 top-0 flex h-full w-2.5 cursor-ew-resize items-center justify-center transition ${
                selecionado ? "bg-white/70" : "bg-white/0 hover:bg-white/40"
              }`}
            >
              {selecionado ? <span className="h-5 w-px bg-black/50" /> : null}
            </div>
          </>
        ) : null}
      </div>
    </>
  );
}

function Filmstrip({ clip, asset, largura }: { clip: EditairClip; asset: AssetInfo; largura: number }) {
  const passo = 72;
  const qtd = Math.max(1, Math.min(60, Math.ceil(largura / passo)));
  const [imgs, setImgs] = useState<(string | null)[]>([]);

  useEffect(() => {
    let vivo = true;
    const alvos = Array.from({ length: qtd }, (_, i) => clip.sourceIn + (i * passo * clip.speed) / (largura / clip.duration));
    setImgs(Array(qtd).fill(null));
    (async () => {
      for (let i = 0; i < alvos.length; i++) {
        const src = await obterThumb(asset.id || asset.url, asset.url, alvos[i], 72);
        if (!vivo) return;
        setImgs((atual) => {
          const c = [...atual];
          c[i] = src;
          return c;
        });
      }
    })();
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asset.url, qtd, clip.sourceIn, clip.speed, clip.duration]);

  return (
    <div className="flex h-full w-full">
      {imgs.map((src, i) => (
        <div key={i} className="h-full shrink-0 border-r border-black/40" style={{ width: passo }}>
          {src ? <img src={src} alt="" className="h-full w-full object-cover" /> : <div className="h-full w-full bg-black/30" />}
        </div>
      ))}
    </div>
  );
}

function WaveClip({ clip, asset, largura }: { clip: EditairClip; asset: AssetInfo; largura: number }) {
  const [picos, setPicos] = useState<number[] | null>(null);
  useEffect(() => {
    let vivo = true;
    void obterPicos(asset.id || asset.url, asset.url).then((p) => vivo && setPicos(p));
    return () => {
      vivo = false;
    };
  }, [asset.id, asset.url]);

  if (!picos?.length) return <div className="h-full w-full bg-black/20" />;
  const total = asset.durationMs || 1;
  const ini = Math.floor((clip.sourceIn / total) * picos.length);
  const fim = Math.ceil(((clip.sourceIn + clip.duration * clip.speed) / total) * picos.length);
  const fatia = picos.slice(Math.max(0, ini), Math.max(ini + 1, fim));
  const barras = Math.max(4, Math.min(400, Math.floor(largura / 3)));
  const passo = fatia.length / barras;

  return (
    <svg className="h-full w-full" width={largura} height={44} preserveAspectRatio="none">
      {Array.from({ length: barras }, (_, i) => {
        const v = fatia[Math.floor(i * passo)] ?? 0;
        const h = Math.max(2, v * 36);
        return <rect key={i} x={i * 3} y={22 - h / 2} width={2} height={h} fill="#66e0d2" opacity={0.85} />;
      })}
    </svg>
  );
}
