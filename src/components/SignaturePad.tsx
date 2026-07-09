import { useEffect, useRef, useState } from "react";
import { Eraser } from "lucide-react";

export type SignaturePadHandle = {
  toDataURL: () => string | null;
  isEmpty: () => boolean;
  clear: () => void;
};

export function SignaturePad({
  value,
  onChange,
  height = 160,
}: {
  value: string | null;
  onChange: (dataUrl: string | null) => void;
  height?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const lastRef = useRef<{ x: number; y: number } | null>(null);
  const [hasInk, setHasInk] = useState(Boolean(value));

  // Resize canvas to container width with device pixel ratio
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.floor(rect.width * dpr);
      canvas.height = Math.floor(height * dpr);
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.scale(dpr, dpr);
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = "#111";
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [height]);

  function pos(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function start(e: React.PointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    drawingRef.current = true;
    lastRef.current = pos(e);
  }
  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    const ctx = canvasRef.current?.getContext("2d");
    const p = pos(e);
    if (!ctx || !lastRef.current) return;
    ctx.beginPath();
    ctx.moveTo(lastRef.current.x, lastRef.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    lastRef.current = p;
    if (!hasInk) setHasInk(true);
  }
  function end() {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    lastRef.current = null;
    const dataUrl = canvasRef.current?.toDataURL("image/png") ?? null;
    onChange(dataUrl);
  }

  function clear() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasInk(false);
    onChange(null);
  }

  return (
    <div className="space-y-2">
      <div
        className="relative rounded-xl border border-border bg-white overflow-hidden"
        style={{ height }}
      >
        <canvas
          ref={canvasRef}
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerLeave={end}
          className="block w-full h-full touch-none cursor-crosshair"
          style={{ height }}
        />
        {!hasInk && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-neutral-400">
            Assine aqui com o dedo ou mouse
          </div>
        )}
        <div className="pointer-events-none absolute bottom-2 left-3 right-3 border-b border-dashed border-neutral-300" />
      </div>
      <div className="flex justify-between items-center text-xs text-muted-foreground">
        <span>Assinatura do portador do cartão</span>
        <button
          type="button"
          onClick={clear}
          className="inline-flex items-center gap-1 text-muted-foreground hover:text-brand-orange"
        >
          <Eraser className="h-3.5 w-3.5" /> limpar
        </button>
      </div>
    </div>
  );
}
