import { useEffect, useMemo, useRef, useState } from "react";
import { Play, Pause } from "lucide-react";
import { cn } from "@/lib/utils";

/** Barras "aleatórias" porém estáveis por áudio (mesma URL = mesmo desenho). */
function gerarBarras(seed: string, total = 28): number[] {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  const barras: number[] = [];
  for (let i = 0; i < total; i++) {
    h = (h * 1103515245 + 12345) & 0x7fffffff;
    barras.push(0.28 + ((h >> 8) % 1000) / 1000 * 0.72);
  }
  return barras;
}

function fmt(s: number): string {
  if (!Number.isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${String(r).padStart(2, "0")}`;
}

const VELOCIDADES = [1, 1.5, 2] as const;

interface Props {
  src: string;
  isOut: boolean;
}

export function AudioMessage({ src, isOut }: Props) {
  const ref = useRef<HTMLAudioElement | null>(null);
  const fillRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number>(0);
  const [tocando, setTocando] = useState(false);
  const [atual, setAtual] = useState(0);
  const [duracao, setDuracao] = useState(0);
  const [velocidade, setVelocidade] = useState<number>(1);

  const barras = useMemo(() => gerarBarras(src), [src]);

  useEffect(() => {
    const el = ref.current;
    if (el) el.playbackRate = velocidade;
  }, [velocidade]);

  const aplicar = (p: number) => {
    if (fillRef.current) {
      fillRef.current.style.clipPath = `inset(0 ${(100 - p * 100).toFixed(2)}% 0 0)`;
    }
  };

  // Atualiza o preenchimento em tempo real (60fps) com easing para suavidade.
  useEffect(() => {
    const alvo = () => {
      const el = ref.current;
      return el && Number.isFinite(el.duration) && el.duration > 0
        ? Math.min(1, el.currentTime / el.duration)
        : 0;
    };
    let exibido = alvo();
    const tick = () => {
      const t = alvo();
      // Interpola em direção ao tempo real: suaviza saltos do timeupdate
      exibido += (t - exibido) * 0.2;
      if (Math.abs(t - exibido) < 0.002) exibido = t;
      aplicar(exibido);
      rafRef.current = requestAnimationFrame(tick);
    };
    if (tocando) {
      rafRef.current = requestAnimationFrame(tick);
    } else {
      // Parado: posiciona direto, sem animação
      aplicar(alvo());
    }
    return () => cancelAnimationFrame(rafRef.current);
  }, [tocando]);

  function alternar() {
    const el = ref.current;
    if (!el) return;
    if (el.paused) void el.play();
    else el.pause();
  }

  function buscar(e: React.MouseEvent<HTMLDivElement>) {
    const el = ref.current;
    if (!el || !Number.isFinite(el.duration)) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    el.currentTime = pct * el.duration;
    setAtual(el.currentTime);
    aplicar(pct);
  }

  const ativa = isOut ? "bg-white" : "bg-[var(--brand-orange,#F26B1F)]";
  const inativa = isOut ? "bg-white/40" : "bg-black/15";

  const grade = (cor: string) => (
    <div className="flex h-6 items-end gap-[2px]">
      {barras.map((altura, i) => (
        <div key={i} className={cn("flex-1 rounded-full", cor)} style={{ height: `${Math.round(altura * 24)}px` }} />
      ))}
    </div>
  );

  return (
    <div className="mb-1 flex w-60 max-w-full items-center gap-3">
      <audio
        ref={ref}
        src={src}
        preload="metadata"
        onPlay={() => setTocando(true)}
        onPause={() => setTocando(false)}
        onEnded={() => {
          setTocando(false);
          setAtual(0);
          aplicar(0);
        }}
        onTimeUpdate={(e) => setAtual(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => {
          const d = e.currentTarget.duration;
          if (Number.isFinite(d)) setDuracao(d);
        }}
        onDurationChange={(e) => {
          const d = e.currentTarget.duration;
          if (Number.isFinite(d)) setDuracao(d);
        }}
      />

      <button
        type="button"
        onClick={alternar}
        title={tocando ? "Pausar" : "Reproduzir"}
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors",
          isOut ? "bg-white/20 text-white hover:bg-white/30" : "bg-black/5 text-foreground/70 hover:bg-black/10",
        )}
      >
        {tocando ? <Pause className="h-5 w-5 fill-current" /> : <Play className="ml-0.5 h-5 w-5 fill-current" />}
      </button>

      <div className="flex flex-1 flex-col gap-1.5">
        <div onClick={buscar} className="relative h-6 cursor-pointer">
          {/* Camada de fundo (inativa) */}
          {grade(inativa)}
          {/* Camada de progresso: corte contínuo, sem "pulo" de bloco em bloco */}
          <div ref={fillRef} className="absolute inset-0" style={{ clipPath: "inset(0 100% 0 0)" }}>
            {grade(ativa)}
          </div>
        </div>
        <div className="flex items-center justify-between">
          <span className={cn("text-[10px] font-medium", isOut ? "text-white/80" : "text-foreground/50")}>
            {fmt(atual)} / {duracao ? fmt(duracao) : "--:--"}
          </span>
          <button
            type="button"
            title="Velocidade de reprodução"
            onClick={() =>
              setVelocidade((v) => VELOCIDADES[(VELOCIDADES.indexOf(v as 1) + 1) % VELOCIDADES.length])
            }
            className={cn(
              "rounded-full px-1.5 py-0.5 text-[10px] font-bold transition-colors",
              isOut ? "bg-white/20 text-white hover:bg-white/30" : "bg-black/5 text-foreground/70 hover:bg-black/10",
            )}
          >
            {velocidade}x
          </button>
        </div>
      </div>
    </div>
  );
}
