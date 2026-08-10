import { useEffect, useRef, useState } from "react";
import {
  ChevronFirst,
  ChevronLast,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
} from "lucide-react";
import { timecode } from "@/lib/editair/types";

export type Plataforma = "nenhuma" | "reels" | "tiktok" | "shorts";

const SAFE: Record<Plataforma, { top: number; bottom: number; left: number; right: number }> = {
  nenhuma: { top: 5, bottom: 5, left: 5, right: 5 },
  reels: { top: 6, bottom: 22, left: 4, right: 18 },
  tiktok: { top: 8, bottom: 20, left: 4, right: 20 },
  shorts: { top: 6, bottom: 18, left: 4, right: 16 },
};

const RATIOS: { id: string; label: string; w: number; h: number }[] = [
  { id: "9:16", label: "9:16 — Reels / TikTok / Shorts", w: 1080, h: 1920 },
  { id: "16:9", label: "16:9 — Horizontal", w: 1920, h: 1080 },
  { id: "4:5", label: "4:5 — Instagram Feed", w: 1080, h: 1350 },
  { id: "1:1", label: "1:1 — Quadrado", w: 1080, h: 1080 },
];

type Props = {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  width: number;
  height: number;
  originalWidth?: number;
  originalHeight?: number;
  fps: number;
  playheadMs: number;
  durationMs: number;
  tocando: boolean;
  volume: number;
  mudo: boolean;
  qualidade: number;
  onPlayPause: () => void;
  onSeek: (ms: number) => void;
  onFrame: (delta: number) => void;
  onVolume: (v: number) => void;
  onMudo: (m: boolean) => void;
  onQualidade: (q: number) => void;
  onFormato: (w: number, h: number) => void;
};


export function PlayerStage({
  canvasRef,
  width,
  height,
  fps,
  playheadMs,
  durationMs,
  tocando,
  volume,
  mudo,
  qualidade,
  onPlayPause,
  onSeek,
  onFrame,
  onVolume,
  onMudo,
  onQualidade,
  onFormato,
}: Props) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [plataforma, setPlataforma] = useState<Plataforma>("nenhuma");
  const [mostrarUi, setMostrarUi] = useState(true);
  const [safeArea, setSafeArea] = useState(true);
  const [grade, setGrade] = useState(false);
  const [centro, setCentro] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [fullscreen, setFullscreen] = useState(false);
  const ratioAtual = `${Math.round((width / height) * 100) / 100}`;

  useEffect(() => {
    const h = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", h);
    return () => document.removeEventListener("fullscreenchange", h);
  }, []);

  const alternarTela = async () => {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await stageRef.current?.requestFullscreen().catch(() => {});
  };

  const safe = SAFE[plataforma];

  return (
    <div ref={stageRef} className="grid min-h-0 grid-rows-[46px_1fr_56px] bg-[#10151b]">
      {/* cabeçalho */}
      <div className="flex items-center gap-2 border-b border-white/10 px-3">
        <strong className="text-[13px]">Reprodutor</strong>
        <span className="text-[11px] text-white/35">
          {width}×{height}
        </span>
        <div className="flex-1" />
        <select
          value={plataforma}
          onChange={(e) => setPlataforma(e.target.value as Plataforma)}
          className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[11px] outline-none"
          title="Visualização da plataforma"
        >
          <option value="nenhuma">Sem interface</option>
          <option value="reels">Instagram Reels</option>
          <option value="tiktok">TikTok</option>
          <option value="shorts">YouTube Shorts</option>
        </select>
        <select
          value={RATIOS.find((r) => Math.abs(r.w / r.h - width / height) < 0.02)?.id ?? "custom"}
          onChange={(e) => {
            const r = RATIOS.find((x) => x.id === e.target.value);
            if (r) onFormato(r.w, r.h);
          }}
          className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[11px] outline-none"
          title="Proporção do projeto"
        >
          {RATIOS.map((r) => (
            <option key={r.id} value={r.id}>
              {r.label}
            </option>
          ))}
          <option value="custom">Personalizado ({ratioAtual})</option>
        </select>
        <button
          onClick={() => void alternarTela()}
          className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[11px] hover:bg-white/10"
          title="Tela inteira (ESC para sair)"
        >
          {fullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
        </button>
      </div>

      {/* palco */}
      <div className="relative flex min-h-0 items-center justify-center overflow-hidden bg-[#0b0e12] p-3">
        <div
          className="relative overflow-hidden rounded shadow-[0_16px_30px_rgba(0,0,0,.45)]"
          style={{
            aspectRatio: `${width} / ${height}`,
            height: `min(100%, ${(zoom * 100).toFixed(0)}%)`,
            maxHeight: "100%",
            maxWidth: "100%",
            transform: zoom > 1 ? `scale(${zoom})` : undefined,
          }}
        >
          <canvas ref={canvasRef} className="block h-full w-full bg-black" />

          {safeArea ? (
            <div
              className="pointer-events-none absolute border border-dashed border-white/70"
              style={{ top: `${safe.top}%`, bottom: `${safe.bottom}%`, left: `${safe.left}%`, right: `${safe.right}%` }}
            />
          ) : null}
          {grade ? (
            <div className="pointer-events-none absolute inset-0">
              <div className="absolute inset-0 grid grid-cols-3 grid-rows-3">
                {Array.from({ length: 9 }, (_, i) => (
                  <div key={i} className="border border-white/15" />
                ))}
              </div>
            </div>
          ) : null}
          {centro ? (
            <div className="pointer-events-none absolute inset-0">
              <div className="absolute left-1/2 top-0 h-full w-px bg-[#F26B1F]/60" />
              <div className="absolute left-0 top-1/2 h-px w-full bg-[#F26B1F]/60" />
            </div>
          ) : null}

          {plataforma !== "nenhuma" && mostrarUi ? <OverlayPlataforma plataforma={plataforma} /> : null}
        </div>

        {/* painel de visualização */}
        <div className="absolute right-4 top-4 w-[212px] rounded-xl border border-white/10 bg-[#101519]/95 p-3 text-[11px] backdrop-blur">
          <p className="mb-2 font-semibold">Visualização</p>
          <Check label="Interface da plataforma" checked={mostrarUi} onChange={setMostrarUi} disabled={plataforma === "nenhuma"} />
          <Check label="Área segura" checked={safeArea} onChange={setSafeArea} />
          <Check label="Grade" checked={grade} onChange={setGrade} />
          <Check label="Centro" checked={centro} onChange={setCentro} />
          <div className="mt-3 border-t border-white/10 pt-2">
            <label className="mb-1 block text-white/50">Zoom do canvas — {(zoom * 100).toFixed(0)}%</label>
            <input
              type="range"
              min={50}
              max={200}
              step={5}
              value={zoom * 100}
              onChange={(e) => setZoom(Number(e.target.value) / 100)}
              className="w-full accent-[#F26B1F]"
            />
            <button onClick={() => setZoom(1)} className="mt-1 w-full rounded border border-white/10 py-1 hover:bg-white/10">
              Ajustar à tela
            </button>
          </div>
          <div className="mt-3 border-t border-white/10 pt-2">
            <label className="mb-1 block text-white/50">Qualidade do preview</label>
            <select
              value={qualidade}
              onChange={(e) => onQualidade(Number(e.target.value))}
              className="w-full rounded border border-white/10 bg-white/5 px-2 py-1 outline-none"
            >
              <option value={1}>Alta (100%)</option>
              <option value={0.66}>Média (66%)</option>
              <option value={0.4}>Rápida (40%)</option>
            </select>
          </div>
        </div>
      </div>

      {/* transporte */}
      <div className="relative flex items-center justify-center gap-4 border-t border-white/10 bg-[#0f141a]">
        <span className="absolute left-4 font-mono text-[11px] text-[#F26B1F]">
          {timecode(playheadMs, fps)} / {timecode(durationMs, fps)}
        </span>
        <BotaoT title="Ir para o início" onClick={() => onSeek(0)}>
          <ChevronFirst className="h-5 w-5" />
        </BotaoT>
        <BotaoT title="Frame anterior" onClick={() => onFrame(-1)}>
          <SkipBack className="h-4 w-4" />
        </BotaoT>
        <button
          onClick={onPlayPause}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-[#F26B1F] text-white transition hover:bg-[#d95c14]"
          title="Play / Pause (espaço)"
        >
          {tocando ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </button>
        <BotaoT title="Próximo frame" onClick={() => onFrame(1)}>
          <SkipForward className="h-4 w-4" />
        </BotaoT>
        <BotaoT title="Ir para o final" onClick={() => onSeek(durationMs)}>
          <ChevronLast className="h-5 w-5" />
        </BotaoT>

        <div className="absolute right-4 flex items-center gap-2">
          <BotaoT title="Mudo" onClick={() => onMudo(!mudo)}>
            {mudo ? <VolumeX className="h-4 w-4 text-red-400" /> : <Volume2 className="h-4 w-4" />}
          </BotaoT>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(volume * 100)}
            onChange={(e) => onVolume(Number(e.target.value) / 100)}
            className="w-24 accent-[#F26B1F]"
            title="Volume do preview"
          />
        </div>
      </div>
    </div>
  );
}

function BotaoT({ children, onClick, title }: { children: React.ReactNode; onClick: () => void; title: string }) {
  return (
    <button title={title} onClick={onClick} className="rounded p-1.5 text-white/85 transition hover:bg-white/10">
      {children}
    </button>
  );
}

function Check({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className={`my-1.5 flex items-center gap-2 ${disabled ? "opacity-40" : "cursor-pointer"}`}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="accent-[#F26B1F]"
      />
      {label}
    </label>
  );
}

function OverlayPlataforma({ plataforma }: { plataforma: Plataforma }) {
  const usuario = plataforma === "tiktok" ? "@viaair" : "@viaair";
  return (
    <div className="pointer-events-none absolute inset-0 text-white">
      <div className="absolute right-[3%] top-[45%] flex flex-col items-center gap-5 text-[10px]">
        <div className="flex flex-col items-center gap-1">
          <span className="text-2xl">♡</span>
          <span>12,4 mil</span>
        </div>
        <div className="flex flex-col items-center gap-1">
          <span className="text-2xl">◯</span>
          <span>318</span>
        </div>
        <div className="flex flex-col items-center gap-1">
          <span className="text-2xl">➤</span>
          <span>2.104</span>
        </div>
        <div className="h-7 w-7 rounded-md border border-white/60" />
      </div>
      <div className="absolute bottom-[6%] left-[4%] right-[22%] space-y-1 text-[11px] drop-shadow">
        <p className="font-semibold">{usuario}</p>
        <p className="opacity-90">Descrição do vídeo com hashtags #viaair #passagens</p>
        <p className="opacity-80">♫ áudio original — {usuario}</p>
      </div>
      {plataforma === "shorts" ? (
        <div className="absolute bottom-[2%] left-0 right-0 h-[1px] bg-white/40" />
      ) : null}
    </div>
  );
}
