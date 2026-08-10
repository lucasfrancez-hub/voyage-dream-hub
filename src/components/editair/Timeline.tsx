import { useCallback, useMemo, useRef, useState } from "react";
import { Eye, EyeOff, Volume2, VolumeX } from "lucide-react";
import type { EditairClip, ProjectState } from "@/lib/editair/types";
import { formatarTempo } from "@/lib/editair/types";

const CORES: Record<string, string> = {
  "t-text": "bg-violet-500/70 border-violet-300/40",
  "t-caption": "bg-amber-500/70 border-amber-300/40",
  "t-broll": "bg-sky-500/70 border-sky-300/40",
  "t-video": "bg-[#F26B1F]/80 border-[#F26B1F]/50",
  "t-voice": "bg-emerald-500/70 border-emerald-300/40",
  "t-music": "bg-fuchsia-500/70 border-fuchsia-300/40",
};

type Props = {
  state: ProjectState;
  playheadMs: number;
  zoom: number; // px por segundo
  selectedClipId: string | null;
  selecao: { fromMs: number; toMs: number } | null;
  waveform?: number[] | null;
  onSeek: (ms: number) => void;
  onSelectClip: (id: string | null) => void;
  onSelecao: (s: { fromMs: number; toMs: number } | null) => void;
  onMoveClip: (id: string, startMs: number) => void;
  onToggleTrack: (trackId: string, campo: "muted" | "hidden") => void;
};

export function Timeline({
  state,
  playheadMs,
  zoom,
  selectedClipId,
  selecao,
  waveform,
  onSeek,
  onSelectClip,
  onSelecao,
  onMoveClip,
  onToggleTrack,
}: Props) {
  const areaRef = useRef<HTMLDivElement>(null);
  const [arrastando, setArrastando] = useState<{ id: string; offsetMs: number } | null>(null);

  const pxPorMs = zoom / 1000;
  const larguraTotal = Math.max(900, (state.durationMs + 4000) * pxPorMs);

  const msDoEvento = useCallback(
    (clientX: number) => {
      const el = areaRef.current;
      if (!el) return 0;
      const rect = el.getBoundingClientRect();
      return Math.max(0, Math.round((clientX - rect.left + el.scrollLeft) / pxPorMs));
    },
    [pxPorMs],
  );

  const marcas = useMemo(() => {
    const passo = zoom > 120 ? 1000 : zoom > 60 ? 2000 : zoom > 30 ? 5000 : 10000;
    const out: number[] = [];
    for (let t = 0; t <= state.durationMs + 4000; t += passo) out.push(t);
    return out;
  }, [zoom, state.durationMs]);

  const aoMoverMouse = (e: React.MouseEvent) => {
    if (!arrastando) return;
    const ms = Math.max(0, msDoEvento(e.clientX) - arrastando.offsetMs);
    onMoveClip(arrastando.id, ms);
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#0E0E11]">
      <div className="flex min-h-0 flex-1">
        {/* cabeçalho das trilhas */}
        <div className="w-36 shrink-0 border-r border-white/10 bg-[#111114]">
          <div className="h-7 border-b border-white/10" />
          {state.tracks.map((t) => (
            <div
              key={t.id}
              className="flex h-14 items-center justify-between gap-1 border-b border-white/5 px-3 text-[11px] text-white/60"
            >
              <span className="truncate">{t.name}</span>
              <div className="flex items-center gap-0.5">
                <button
                  onClick={() => onToggleTrack(t.id, "hidden")}
                  className="rounded p-1 text-white/35 hover:bg-white/10 hover:text-white"
                  title="Mostrar/ocultar"
                >
                  {t.hidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
                <button
                  onClick={() => onToggleTrack(t.id, "muted")}
                  className="rounded p-1 text-white/35 hover:bg-white/10 hover:text-white"
                  title="Mudo"
                >
                  {t.muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* área rolável */}
        <div
          ref={areaRef}
          className="relative min-h-0 flex-1 overflow-x-auto overflow-y-hidden"
          onMouseMove={aoMoverMouse}
          onMouseUp={() => setArrastando(null)}
          onMouseLeave={() => setArrastando(null)}
        >
          <div style={{ width: larguraTotal }} className="relative">
            {/* régua */}
            <div
              className="sticky top-0 z-20 h-7 cursor-pointer border-b border-white/10 bg-[#111114]"
              onMouseDown={(e) => {
                const inicio = msDoEvento(e.clientX);
                onSeek(inicio);
                onSelecao(null);
                const mover = (ev: MouseEvent) => {
                  const atual = msDoEvento(ev.clientX);
                  if (Math.abs(atual - inicio) > 60) {
                    onSelecao({ fromMs: Math.min(inicio, atual), toMs: Math.max(inicio, atual) });
                  }
                };
                const soltar = () => {
                  window.removeEventListener("mousemove", mover);
                  window.removeEventListener("mouseup", soltar);
                };
                window.addEventListener("mousemove", mover);
                window.addEventListener("mouseup", soltar);
              }}
            >
              {marcas.map((t) => (
                <div key={t} className="absolute top-0 h-full" style={{ left: t * pxPorMs }}>
                  <div className="h-2 w-px bg-white/20" />
                  <span className="ml-1 text-[10px] text-white/35">{formatarTempo(t)}</span>
                </div>
              ))}
            </div>

            {/* seleção */}
            {selecao ? (
              <div
                className="pointer-events-none absolute top-7 z-10 h-full border-x border-[#F26B1F]/60 bg-[#F26B1F]/10"
                style={{ left: selecao.fromMs * pxPorMs, width: (selecao.toMs - selecao.fromMs) * pxPorMs }}
              />
            ) : null}

            {/* trilhas */}
            {state.tracks.map((t) => (
              <div key={t.id} className="relative h-14 border-b border-white/5">
                {t.id === "t-video" && waveform?.length ? (
                  <Waveform dados={waveform} largura={state.durationMs * pxPorMs} />
                ) : null}
                {state.clips
                  .filter((c) => c.trackId === t.id)
                  .map((c) => (
                    <Clipe
                      key={c.id}
                      clip={c}
                      pxPorMs={pxPorMs}
                      selecionado={selectedClipId === c.id}
                      onSelect={() => onSelectClip(c.id)}
                      onDragStart={(offsetMs) => setArrastando({ id: c.id, offsetMs })}
                    />
                  ))}
              </div>
            ))}

            {/* playhead */}
            <div
              className="pointer-events-none absolute top-0 z-30 h-full w-px bg-[#F26B1F]"
              style={{ left: playheadMs * pxPorMs }}
            >
              <div className="-ml-[5px] h-2.5 w-2.5 rotate-45 bg-[#F26B1F]" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Clipe({
  clip,
  pxPorMs,
  selecionado,
  onSelect,
  onDragStart,
}: {
  clip: EditairClip;
  pxPorMs: number;
  selecionado: boolean;
  onSelect: () => void;
  onDragStart: (offsetMs: number) => void;
}) {
  return (
    <div
      onMouseDown={(e) => {
        onSelect();
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        onDragStart(Math.round((e.clientX - rect.left) / pxPorMs));
      }}
      className={`absolute top-1.5 flex h-11 cursor-grab items-center overflow-hidden rounded-md border px-2 text-[11px] text-white/90 transition ${
        CORES[clip.trackId] ?? "bg-white/20 border-white/20"
      } ${selecionado ? "ring-2 ring-white" : ""}`}
      style={{ left: clip.start * pxPorMs, width: Math.max(6, clip.duration * pxPorMs) }}
      title={clip.label ?? clip.text ?? clip.kind}
    >
      <span className="truncate">{clip.label ?? clip.text ?? clip.kind}</span>
    </div>
  );
}

function Waveform({ dados, largura }: { dados: number[]; largura: number }) {
  const max = Math.max(...dados, 0.001);
  return (
    <svg className="absolute inset-0 h-full opacity-25" width={largura} height={56} preserveAspectRatio="none">
      {dados.map((v, i) => {
        const h = (v / max) * 46;
        const x = (i / dados.length) * largura;
        return <rect key={i} x={x} y={28 - h / 2} width={Math.max(1, largura / dados.length - 0.5)} height={h} fill="#ffffff" />;
      })}
    </svg>
  );
}
