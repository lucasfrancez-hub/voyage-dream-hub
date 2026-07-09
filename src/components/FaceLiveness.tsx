import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Check, Loader2, RefreshCcw, ShieldCheck, XCircle } from "lucide-react";

export type LivenessResult = {
  photos: string[]; // 3 data URLs (jpeg base64)
  motion_scores: number[]; // diffs between step 1↔2 and 2↔3
  min_motion_score: number;
  captured_at: string; // ISO
  user_agent: string | null;
};

type Step = {
  key: string;
  label: string;
  hint: string;
};

const STEPS: Step[] = [
  { key: "front", label: "Olhe para a câmera de frente", hint: "Mantenha o rosto centralizado e bem iluminado" },
  { key: "right", label: "Vire lentamente a cabeça para a direita", hint: "Sem tirar o rosto do quadro" },
  { key: "left", label: "Agora vire lentamente para a esquerda", hint: "Continue enquadrando o rosto" },
];

// Movimento mínimo (0-1) entre frames consecutivos para considerar prova de vida válida.
// Uma foto estática marcaria ~0.01. Movimento real de cabeça marca >0.06.
const MIN_MOTION_THRESHOLD = 0.04;

export function FaceLiveness({
  value,
  onChange,
}: {
  value: LivenessResult | null;
  onChange: (result: LivenessResult | null) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [status, setStatus] = useState<"idle" | "starting" | "running" | "capturing" | "done" | "error">(
    value ? "done" : "idle",
  );
  const [currentStep, setCurrentStep] = useState(0);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [photos, setPhotos] = useState<string[]>(value?.photos ?? []);

  const stopCamera = useCallback(() => {
    const s = streamRef.current;
    if (s) {
      s.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  useEffect(() => () => stopCamera(), [stopCamera]);

  async function startCamera() {
    setErrorMsg("");
    setStatus("starting");
    setPhotos([]);
    setCurrentStep(0);
    onChange(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setStatus("running");
      // pequena espera para o vídeo estabilizar antes do primeiro desafio
      setTimeout(() => runStep(0, []), 800);
    } catch (err) {
      setStatus("error");
      setErrorMsg(
        err instanceof Error && err.name === "NotAllowedError"
          ? "Você precisa permitir o acesso à câmera para continuar."
          : "Não conseguimos acessar a câmera. Tente novamente ou use outro dispositivo.",
      );
    }
  }

  function capture(): string | null {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.videoWidth === 0) return null;
    const w = video.videoWidth;
    const h = video.videoHeight;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    // espelhar horizontalmente para ficar natural (selfie)
    ctx.save();
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, w, h);
    ctx.restore();
    return canvas.toDataURL("image/jpeg", 0.7);
  }

  async function runStep(idx: number, collected: string[]) {
    setCurrentStep(idx);
    // contagem regressiva 3-2-1
    for (let n = 3; n >= 1; n--) {
      setCountdown(n);
      await sleep(700);
    }
    setCountdown(null);
    setStatus("capturing");
    await sleep(150);
    const photo = capture();
    if (!photo) {
      setStatus("error");
      setErrorMsg("Falha ao capturar a imagem. Reinicie o processo.");
      return;
    }
    const next = [...collected, photo];
    setPhotos(next);

    if (idx < STEPS.length - 1) {
      setStatus("running");
      await sleep(500);
      runStep(idx + 1, next);
    } else {
      // terminou — computar movimento e finalizar
      const scores: number[] = [];
      for (let i = 1; i < next.length; i++) {
        const s = await computeDiff(next[i - 1], next[i]);
        scores.push(s);
      }
      const minScore = scores.length ? Math.min(...scores) : 0;
      stopCamera();
      if (minScore < MIN_MOTION_THRESHOLD) {
        setStatus("error");
        setErrorMsg(
          "Não detectamos movimento suficiente entre as capturas. Tente novamente movendo a cabeça de forma clara.",
        );
        return;
      }
      const result: LivenessResult = {
        photos: next,
        motion_scores: scores,
        min_motion_score: minScore,
        captured_at: new Date().toISOString(),
        user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
      };
      setStatus("done");
      onChange(result);
    }
  }

  function reset() {
    stopCamera();
    setPhotos([]);
    setStatus("idle");
    setErrorMsg("");
    setCurrentStep(0);
    onChange(null);
  }

  const step = STEPS[currentStep];

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-border bg-black/90 overflow-hidden relative aspect-[4/3]">
        {(status === "idle" || status === "error") && !photos.length && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6 text-white/80">
            <Camera className="h-10 w-10 mb-3 text-white/60" />
            <p className="text-sm max-w-xs">
              Faremos 3 capturas rápidas para provar que é você mesmo(a) na frente do dispositivo.
            </p>
            <button
              type="button"
              onClick={startCamera}
              className="mt-4 inline-flex items-center gap-2 rounded-full bg-gradient-brand px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-glow)] hover:opacity-90 transition"
            >
              <Camera className="h-4 w-4" /> Iniciar verificação
            </button>
          </div>
        )}

        <video
          ref={videoRef}
          playsInline
          muted
          className="w-full h-full object-cover"
          style={{ transform: "scaleX(-1)", display: status === "running" || status === "capturing" || status === "starting" ? "block" : "none" }}
        />
        <canvas ref={canvasRef} className="hidden" />

        {(status === "running" || status === "capturing") && step && (
          <div className="absolute inset-x-0 top-0 p-3 bg-gradient-to-b from-black/70 to-transparent text-white">
            <div className="flex items-center justify-between text-[10px] uppercase tracking-widest opacity-80">
              <span>Passo {currentStep + 1} de {STEPS.length}</span>
              <span>Prova de vida</span>
            </div>
            <div className="mt-1 text-sm font-semibold">{step.label}</div>
            <div className="text-[11px] opacity-80">{step.hint}</div>
          </div>
        )}

        {countdown !== null && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="h-24 w-24 rounded-full bg-black/60 flex items-center justify-center text-4xl font-display text-white animate-pulse">
              {countdown}
            </div>
          </div>
        )}

        {status === "capturing" && countdown === null && (
          <div className="absolute inset-0 bg-white/40 flex items-center justify-center">
            <Camera className="h-10 w-10 text-white" />
          </div>
        )}

        {status === "done" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-white bg-green-600/80">
            <Check className="h-12 w-12 mb-2" />
            <div className="text-sm font-semibold">Verificação concluída</div>
          </div>
        )}

        {status === "starting" && (
          <div className="absolute inset-0 flex items-center justify-center text-white/80">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        )}
      </div>

      {photos.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {photos.map((p, i) => (
            <div key={i} className="relative rounded-lg overflow-hidden border border-border">
              <img src={p} alt={`Captura ${i + 1}`} className="w-full h-20 object-cover" />
              <div className="absolute bottom-0 inset-x-0 bg-black/60 text-white text-[10px] px-1 py-0.5 text-center">
                {STEPS[i]?.key ?? `#${i + 1}`}
              </div>
            </div>
          ))}
        </div>
      )}

      {errorMsg && (
        <div className="flex items-start gap-2 rounded-xl border border-red-500/50 bg-red-500/10 p-3 text-xs text-red-600 dark:text-red-300">
          <XCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <ShieldCheck className="h-3.5 w-3.5 text-brand-orange" />
          <span>Imagens processadas no seu dispositivo e enviadas cifradas.</span>
        </div>
        {(status === "done" || status === "error") && (
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-1 hover:text-brand-orange"
          >
            <RefreshCcw className="h-3.5 w-3.5" /> refazer
          </button>
        )}
      </div>
    </div>
  );
}

function sleep(ms: number) {
  return new Promise((res) => setTimeout(res, ms));
}

// Diferença média de pixels (grayscale, downscaled) entre duas imagens data URL.
// Retorna 0..1. Movimento real de cabeça costuma marcar > 0.06.
async function computeDiff(a: string, b: string): Promise<number> {
  const [ia, ib] = await Promise.all([loadImage(a), loadImage(b)]);
  const size = 64;
  const ca = document.createElement("canvas");
  const cb = document.createElement("canvas");
  ca.width = cb.width = size;
  ca.height = cb.height = size;
  const cxA = ca.getContext("2d");
  const cxB = cb.getContext("2d");
  if (!cxA || !cxB) return 0;
  cxA.drawImage(ia, 0, 0, size, size);
  cxB.drawImage(ib, 0, 0, size, size);
  const da = cxA.getImageData(0, 0, size, size).data;
  const db = cxB.getImageData(0, 0, size, size).data;
  let total = 0;
  const pixels = size * size;
  for (let i = 0; i < da.length; i += 4) {
    const ga = (da[i] * 0.299 + da[i + 1] * 0.587 + da[i + 2] * 0.114);
    const gb = (db[i] * 0.299 + db[i + 1] * 0.587 + db[i + 2] * 0.114);
    total += Math.abs(ga - gb);
  }
  return total / pixels / 255;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
