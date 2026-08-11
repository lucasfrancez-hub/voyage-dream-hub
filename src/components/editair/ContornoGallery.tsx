/* Galeria visual de contornos do recorte.
   Cada card desenha o resultado REAL com a mesma função usada no player e na
   exportação (desenharContorno), sobre uma silhueta de exemplo. */
import { useEffect, useRef, useState } from "react";
import {
  CONTORNO_PRESETS,
  aplicarPreset,
  desenharContorno,
  type Contorno,
  type ContornoPresetId,
} from "@/lib/editair/contorno";

const LARANJA = "#F26B1F";
const W = 150;
const H = 190;

/** Silhueta de pessoa usada como amostra (mesmo alpha que a máscara real produz). */
function silhuetaExemplo() {
  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  const g = cv.getContext("2d")!;
  const grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, "#8fa6c4");
  grad.addColorStop(1, "#3d4b60");
  g.fillStyle = grad;
  // cabeça
  g.beginPath();
  g.ellipse(W / 2, H * 0.34, W * 0.17, H * 0.15, 0, 0, Math.PI * 2);
  g.fill();
  // ombros / tronco
  g.beginPath();
  g.moveTo(W * 0.2, H);
  g.quadraticCurveTo(W * 0.24, H * 0.58, W / 2, H * 0.55);
  g.quadraticCurveTo(W * 0.76, H * 0.58, W * 0.8, H);
  g.closePath();
  g.fill();
  return cv;
}

let amostra: HTMLCanvasElement | null = null;
function getAmostra() {
  if (!amostra) amostra = silhuetaExemplo();
  return amostra;
}

function Miniatura({ cfg, animar }: { cfg: Contorno; animar: boolean }) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const cache: HTMLCanvasElement[] = [];
    let raf = 0;
    let vivo = true;

    const pintar = (fase: number) => {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, W, H);
      // "fundo" xadrez discreto, mostrando que o recorte é transparente
      ctx.fillStyle = "#161b22";
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "rgba(255,255,255,0.035)";
      for (let y = 0; y < H; y += 12) {
        for (let x = ((y / 12) % 2) * 12; x < W; x += 24) ctx.fillRect(x, y, 12, 12);
      }
      const escala = W / 420;
      const usado: Contorno = animar
        ? { ...cfg, largura: cfg.largura * (0.75 + 0.35 * (0.5 + 0.5 * Math.sin(fase))) }
        : cfg;
      desenharContorno(ctx, getAmostra(), W, H, usado, { escala, cache });
      ctx.drawImage(getAmostra(), 0, 0, W, H);
    };

    if (animar) {
      const t0 = performance.now();
      const loop = () => {
        if (!vivo) return;
        pintar((performance.now() - t0) / 320);
        raf = requestAnimationFrame(loop);
      };
      loop();
    } else {
      pintar(0);
    }
    return () => {
      vivo = false;
      if (raf) cancelAnimationFrame(raf);
    };
  }, [cfg, animar]);

  return <canvas ref={ref} width={W} height={H} className="h-full w-full rounded-[7px]" />;
}

type Props = {
  valor: Contorno;
  /** clique = preview imediato no player (ainda não confirmado) */
  onPrever: (c: Contorno) => void;
  /** só presets da V1 */
  somenteV1?: boolean;
};

export function ContornoGallery({ valor, onPrever, somenteV1 }: Props) {
  const [hover, setHover] = useState<ContornoPresetId | null>(null);
  const lista = somenteV1 ? CONTORNO_PRESETS.filter((p) => p.v1) : CONTORNO_PRESETS;

  return (
    <div className="grid grid-cols-3 gap-2" data-testid="contorno-gallery">
      {lista.map((p) => {
        const cfg = aplicarPreset(valor, p.id);
        const ativo = valor.preset === p.id;
        return (
          <button
            key={p.id}
            type="button"
            title={p.descricao}
            onMouseEnter={() => setHover(p.id)}
            onMouseLeave={() => setHover((h) => (h === p.id ? null : h))}
            onClick={() => onPrever(cfg)}
            className="group overflow-hidden rounded-lg border bg-black/30 text-left transition"
            style={{ borderColor: ativo ? LARANJA : "rgba(255,255,255,0.10)" }}
            data-testid={`contorno-${p.id}`}
          >
            <div className="aspect-[3/4] w-full">
              <Miniatura cfg={cfg} animar={hover === p.id} />
            </div>
            <div
              className="truncate px-1.5 py-1 text-[10px]"
              style={{ color: ativo ? LARANJA : "rgba(255,255,255,0.7)" }}
            >
              {p.nome}
            </div>
          </button>
        );
      })}
    </div>
  );
}
