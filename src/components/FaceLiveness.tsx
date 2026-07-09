import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Check, Loader2, RefreshCcw, ShieldCheck, XCircle } from "lucide-react";

export type LivenessResult = {
  photos: string[];
  motion_scores: number[];
  min_motion_score: number;
  captured_at: string;
  user_agent: string | null;
  challenges?: string[];
  face_detector_used?: boolean;
};

type Step = {
  key: string;
  label: string;
  hint: string;
  // "fit" = rosto precisa preencher X% do oval; "far" = rosto pequeno; "any" = qualquer
  distance: "far" | "fit" | "near" | "any";
};

const STEPS: Step[] = [
  { key: "fit",   label: "Encaixe seu rosto no oval",       hint: "Fique bem enquadrado, com boa iluminação", distance: "fit" },
  { key: "near",  label: "Aproxime lentamente o rosto",     hint: "Chegue mais perto até preencher o oval",   distance: "near" },
  { key: "right", label: "Vire devagar para a direita",     hint: "Sem sair do enquadramento",                distance: "any" },
  { key: "left",  label: "Agora vire devagar para a esquerda", hint: "Continue com o rosto no quadro",       distance: "any" },
  { key: "smile", label: "Sorria olhando para a câmera",    hint: "Um sorriso natural já basta",              distance: "any" },
];

const MIN_MOTION_THRESHOLD = 0.035;
// FaceDetector nativa (Chrome Android). Se não existir, caímos no fallback.
type FDBox = { boundingBox: DOMRectReadOnly };
type FaceDetectorLike = { detect: (source: CanvasImageSource) => Promise<FDBox[]> };

function makeFaceDetector(): FaceDetectorLike | null {
  const w = window as unknown as { FaceDetector?: new (opts?: { fastMode?: boolean }) => FaceDetectorLike };
  if (typeof w.FaceDetector !== "function") return null;
  try {
    return new w.FaceDetector({ fastMode: true });
  } catch {
    return null;
  }
}

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
  const detectorRef = useRef<FaceDetectorLike | null>(null);
  const rafRef = useRef<number | null>(null);

  const [status, setStatus] = useState<"idle" | "starting" | "running" | "capturing" | "done" | "error">(
    value ? "done" : "idle",
  );
  const [currentStep, setCurrentStep] = useState(0);
  const [progress, setProgress] = useState(0); // 0..1 preenchimento do oval
  const [holdProgress, setHoldProgress] = useState(0); // 0..1 tempo mantendo posição
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [photos, setPhotos] = useState<string[]>(value?.photos ?? []);
  const [hint, setHint] = useState<string>("");
  const [detectorAvailable, setDetectorAvailable] = useState<boolean>(false);

  const stopCamera = useCallback(() => {
    const s = streamRef.current;
    if (s) {
      s.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  useEffect(() => () => stopCamera(), [stopCamera]);

  async function startCamera() {
    setErrorMsg("");
    setStatus("starting");
    setPhotos([]);
    setCurrentStep(0);
    setProgress(0);
    setHoldProgress(0);
    onChange(null);
    detectorRef.current = makeFaceDetector();
    setDetectorAvailable(!!detectorRef.current);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 720 }, height: { ideal: 960 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setStatus("running");
      setTimeout(() => runFlow(), 600);
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
    ctx.save();
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, w, h);
    ctx.restore();
    return canvas.toDataURL("image/jpeg", 0.72);
  }

  // detecta rosto (0..1 relativo à altura do frame)
  async function detectFaceSize(): Promise<number | null> {
    const video = videoRef.current;
    const det = detectorRef.current;
    if (!video || !det || video.videoWidth === 0) return null;
    try {
      const faces = await det.detect(video);
      if (!faces.length) return 0;
      const largest = faces.reduce((a, b) => (a.boundingBox.height > b.boundingBox.height ? a : b));
      return Math.min(1, largest.boundingBox.height / video.videoHeight);
    } catch {
      return null;
    }
  }

  async function waitForCondition(step: Step, collected: string[]): Promise<string | null> {
    const started = Date.now();
    const holdMs = 900;
    let holdStart: number | null = null;

    // targets (fração da altura do frame ocupada pelo rosto)
    const targets: Record<Step["distance"], [number, number]> = {
      far: [0.15, 0.35],
      fit: [0.35, 0.60],
      near: [0.55, 0.95],
      any: [0.15, 0.95],
    };
    const [tmin, tmax] = targets[step.distance];

    return new Promise((resolve) => {
      const tick = async () => {
        if (status === "error") return resolve(null);
        // timeout — se não temos detector, capturamos após 2.5s
        const elapsed = Date.now() - started;
        const size = await detectFaceSize();

        if (size == null) {
          // sem detector: usa tempo como progresso
          const p = Math.min(1, elapsed / 2500);
          setProgress(p);
          setHoldProgress(p);
          setHint(step.hint);
          if (p >= 1) return resolve(capture());
        } else {
          setProgress(Math.min(1, size / tmax));
          if (size === 0) {
            setHint("Nenhum rosto detectado. Aproxime-se da câmera.");
            holdStart = null;
            setHoldProgress(0);
          } else if (size < tmin) {
            setHint("Aproxime-se um pouco mais");
            holdStart = null;
            setHoldProgress(0);
          } else if (size > tmax) {
            setHint("Afaste-se um pouco");
            holdStart = null;
            setHoldProgress(0);
          } else {
            setHint("Ótimo! Mantenha a posição…");
            if (holdStart == null) holdStart = Date.now();
            const held = Date.now() - holdStart;
            setHoldProgress(Math.min(1, held / holdMs));
            if (held >= holdMs) return resolve(capture());
          }
          // fallback duro após 15s
          if (elapsed > 15000) return resolve(capture());
        }
        rafRef.current = requestAnimationFrame(() => setTimeout(tick, 120));
      };
      tick();
    });
  }

  async function runFlow() {
    const collected: string[] = [];
    for (let i = 0; i < STEPS.length; i++) {
      setCurrentStep(i);
      setProgress(0);
      setHoldProgress(0);
      const step = STEPS[i];
      setHint(step.hint);
      // contagem regressiva antes de cada passo
      await sleep(400);
      const photo = await waitForCondition(step, collected);
      setStatus("capturing");
      await sleep(180);
      if (!photo) {
        setStatus("error");
        setErrorMsg("Falha ao capturar a imagem. Reinicie o processo.");
        return;
      }
      collected.push(photo);
      setPhotos([...collected]);
      setStatus("running");
      await sleep(400);
    }

    // computa movimento entre capturas
    const scores: number[] = [];
    for (let i = 1; i < collected.length; i++) {
      const s = await computeDiff(collected[i - 1], collected[i]);
      scores.push(s);
    }
    const minScore = scores.length ? Math.min(...scores) : 0;
    stopCamera();
    if (minScore < MIN_MOTION_THRESHOLD && !detectorRef.current) {
      // sem detector, exigimos movimento; com detector, confiamos nos desafios
      setStatus("error");
      setErrorMsg(
        "Não detectamos movimento suficiente entre as capturas. Refaça movendo a cabeça claramente.",
      );
      return;
    }
    const result: LivenessResult = {
      photos: collected,
      motion_scores: scores,
      min_motion_score: minScore,
      captured_at: new Date().toISOString(),
      user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
      challenges: STEPS.map((s) => s.key),
      face_detector_used: !!detectorRef.current,
    };
    setStatus("done");
    onChange(result);
  }

  function reset() {
    stopCamera();
    setPhotos([]);
    setStatus("idle");
    setErrorMsg("");
    setCurrentStep(0);
    setProgress(0);
    setHoldProgress(0);
    onChange(null);
  }

  const step = STEPS[currentStep];
  const live = status === "running" || status === "capturing" || status === "starting";

  // anel de progresso (perímetro aproximado do oval)
  const RING_R = 140; // raio médio
  const RING_C = 2 * Math.PI * RING_R;
  const ringDash = RING_C * (0.4 * progress + 0.6 * holdProgress);

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-border bg-black overflow-hidden relative aspect-[3/4] max-h-[480px]">
        {(status === "idle" || (status === "error" && !photos.length)) && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6 text-white/85 z-20">
            <div className="h-16 w-16 rounded-full border-2 border-brand-orange/70 flex items-center justify-center mb-3">
              <Camera className="h-7 w-7 text-brand-orange" />
            </div>
            <p className="text-sm max-w-xs">
              Faremos uma verificação facial rápida em 5 passos. Encaixe o rosto no oval,
              aproxime, vire a cabeça e sorria.
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
          style={{
            transform: "scaleX(-1)",
            display: live ? "block" : "none",
          }}
        />
        <canvas ref={canvasRef} className="hidden" />

        {/* Máscara com oval recortado + anel de progresso */}
        {live && (
          <>
            <svg
              className="absolute inset-0 w-full h-full pointer-events-none"
              viewBox="0 0 300 400"
              preserveAspectRatio="xMidYMid slice"
            >
              <defs>
                <mask id="oval-mask">
                  <rect x="0" y="0" width="300" height="400" fill="white" />
                  <ellipse cx="150" cy="190" rx="110" ry="150" fill="black" />
                </mask>
              </defs>
              <rect
                x="0"
                y="0"
                width="300"
                height="400"
                fill="rgba(0,0,0,0.55)"
                mask="url(#oval-mask)"
              />
              {/* aro base */}
              <ellipse
                cx="150"
                cy="190"
                rx="110"
                ry="150"
                fill="none"
                stroke="rgba(255,255,255,0.35)"
                strokeWidth="3"
              />
              {/* aro de progresso — usa perímetro aproximado */}
              <ellipse
                cx="150"
                cy="190"
                rx="110"
                ry="150"
                fill="none"
                stroke="url(#ringGrad)"
                strokeWidth="5"
                strokeLinecap="round"
                strokeDasharray={`${ringDash} ${RING_C}`}
                transform="rotate(-90 150 190)"
                style={{ transition: "stroke-dasharray 120ms linear" }}
              />
              <defs>
                <linearGradient id="ringGrad" x1="0" x2="1" y1="0" y2="1">
                  <stop offset="0%" stopColor="#f97316" />
                  <stop offset="100%" stopColor="#fb923c" />
                </linearGradient>
              </defs>
            </svg>

            <div className="absolute inset-x-0 top-0 p-3 text-white z-10 bg-gradient-to-b from-black/70 to-transparent">
              <div className="flex items-center justify-between text-[10px] uppercase tracking-widest opacity-80">
                <span>Passo {currentStep + 1} de {STEPS.length}</span>
                <span>{detectorAvailable ? "Prova de vida · 3D" : "Prova de vida"}</span>
              </div>
              <div className="mt-1 text-base font-semibold">{step?.label}</div>
              <div className="text-[11px] opacity-90 mt-0.5">{hint || step?.hint}</div>
            </div>

            {status === "capturing" && (
              <div className="absolute inset-0 bg-white/40 z-10 flex items-center justify-center">
                <Camera className="h-10 w-10 text-white" />
              </div>
            )}
          </>
        )}

        {status === "done" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-white bg-green-600/85 z-30">
            <Check className="h-12 w-12 mb-2" />
            <div className="text-sm font-semibold">Verificação concluída</div>
          </div>
        )}

        {status === "starting" && (
          <div className="absolute inset-0 flex items-center justify-center text-white/80 z-10">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        )}
      </div>

      {photos.length > 0 && (
        <div className="grid grid-cols-5 gap-2">
          {photos.map((p, i) => (
            <div key={i} className="relative rounded-lg overflow-hidden border border-border">
              <img src={p} alt={`Captura ${i + 1}`} className="w-full h-16 object-cover" />
              <div className="absolute bottom-0 inset-x-0 bg-black/60 text-white text-[9px] px-1 py-0.5 text-center uppercase tracking-wider">
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
          <span>Verificação executada no seu dispositivo · imagens cifradas.</span>
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
    const ga = da[i] * 0.299 + da[i + 1] * 0.587 + da[i + 2] * 0.114;
    const gb = db[i] * 0.299 + db[i + 1] * 0.587 + db[i + 2] * 0.114;
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
