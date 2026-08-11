/* Contornos do EditAir — desenhados a partir da máscara/recorte do clipe.
   Tudo é não destrutivo: o contorno é só uma propriedade do clipe e é
   redesenhado a cada quadro, tanto no preview quanto na exportação
   (o exportador usa exatamente estas funções, via engine.renderizarQuadro). */

export type ContornoPresetId =
  | "nenhum"
  | "solido"
  | "papel"
  | "luminescencia"
  | "desenho"
  | "pb"
  | "duplo"
  | "tracejado"
  | "sombra";

export type Contorno = {
  preset: ContornoPresetId;
  /** compatibilidade com a versão antiga */
  ativo?: boolean;
  cor: string;
  cor2: string;
  /** 0..50 (px na escala do palco de 1080) */
  largura: number;
  /** 0..100 */
  opacidade: number;
  /** suavidade da borda do traço 0..100 */
  suavidade: number;
  /** expansão extra 0..100 */
  expansao: number;
  /** feather do recorte 0..100 */
  feather: number;
  /** brilho/glow 0..100 */
  glow: number;
  /** deslocamento da sombra, em px */
  deslocX: number;
  deslocY: number;
};

export const CONTORNO_PADRAO: Contorno = {
  preset: "nenhum",
  cor: "#FFFFFF",
  cor2: "#F26B1F",
  largura: 10,
  opacidade: 100,
  suavidade: 20,
  expansao: 0,
  feather: 20,
  glow: 40,
  deslocX: 14,
  deslocY: 14,
};

export type ContornoPreset = {
  id: ContornoPresetId;
  nome: string;
  descricao: string;
  patch: Partial<Contorno>;
  /** presets da V1 aparecem primeiro na galeria */
  v1?: boolean;
};

export const CONTORNO_PRESETS: ContornoPreset[] = [
  { id: "nenhum", nome: "Nenhum", descricao: "Somente o recorte, sem borda.", patch: {}, v1: true },
  {
    id: "solido",
    nome: "Traço sólido",
    descricao: "Borda uniforme ao redor da pessoa.",
    patch: { cor: "#FFFFFF", largura: 10, suavidade: 12, glow: 0 },
    v1: true,
  },
  {
    id: "papel",
    nome: "Traço papel",
    descricao: "Contorno branco irregular, estilo sticker.",
    patch: { cor: "#FFFFFF", largura: 18, suavidade: 4, expansao: 10, glow: 0 },
    v1: true,
  },
  {
    id: "luminescencia",
    nome: "Luminescência",
    descricao: "Glow colorido atrás do recorte.",
    patch: { cor: "#F26B1F", largura: 8, suavidade: 70, glow: 85 },
    v1: true,
  },
  {
    id: "desenho",
    nome: "Desenho à mão",
    descricao: "Linha irregular desenhada ao redor.",
    patch: { cor: "#FFFFFF", largura: 6, suavidade: 8, glow: 0 },
    v1: true,
  },
  {
    id: "sombra",
    nome: "Sombra recortada",
    descricao: "Silhueta deslocada atrás da pessoa.",
    patch: { cor: "#000000", largura: 0, suavidade: 45, glow: 0, deslocX: 18, deslocY: 18, opacidade: 65 },
    v1: true,
  },
  {
    id: "pb",
    nome: "Traço preto e branco",
    descricao: "Dois contornos combinados para destaque.",
    patch: { cor: "#FFFFFF", cor2: "#000000", largura: 10, suavidade: 8 },
  },
  {
    id: "duplo",
    nome: "Traço duplo",
    descricao: "Duas bordas com cores diferentes.",
    patch: { cor: "#FFFFFF", cor2: "#F26B1F", largura: 9, suavidade: 6 },
  },
  {
    id: "tracejado",
    nome: "Traço pontilhado",
    descricao: "Contorno pontilhado/tracejado.",
    patch: { cor: "#FFFFFF", largura: 12, suavidade: 4 },
  },
];

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/** Passos circulares usados para "dilatar" a silhueta. */
function passos(qtd: number, raio: number, semente = 0) {
  const out: [number, number][] = [];
  for (let i = 0; i < qtd; i++) {
    const ang = (i / qtd) * Math.PI * 2;
    const r = semente ? raio * (0.72 + 0.42 * pseudo(i + semente)) : raio;
    out.push([Math.cos(ang) * r, Math.sin(ang) * r]);
  }
  return out;
}

/** ruído determinístico (mesma borda no preview e na exportação) */
function pseudo(i: number) {
  const x = Math.sin(i * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

function scratch(w: number, h: number, cache: HTMLCanvasElement[], idx: number) {
  let cv = cache[idx];
  if (!cv) {
    cv = document.createElement("canvas");
    cache[idx] = cv;
  }
  if (cv.width !== w || cv.height !== h) {
    cv.width = w;
    cv.height = h;
  }
  const ctx = cv.getContext("2d")!;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, w, h);
  return { cv, ctx };
}

/**
 * Desenha a silhueta (alpha do recorte) preenchida com uma cor, dilatada em `raio`.
 */
function silhueta(
  destino: CanvasRenderingContext2D,
  recorte: CanvasImageSource,
  w: number,
  h: number,
  cor: string,
  raio: number,
  irregular = false,
  blur = 0,
  cache: HTMLCanvasElement[] = [],
) {
  const { cv, ctx } = scratch(w, h, cache, 0);
  const qtd = raio > 0 ? Math.max(10, Math.min(48, Math.round(raio * 2.2))) : 0;
  if (qtd) {
    for (const [dx, dy] of passos(qtd, raio, irregular ? 7 : 0)) {
      ctx.drawImage(recorte, dx, dy, w, h);
    }
  }
  ctx.drawImage(recorte, 0, 0, w, h);
  // pinta tudo com a cor mantendo o alpha
  ctx.globalCompositeOperation = "source-in";
  ctx.fillStyle = cor;
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = "source-over";

  destino.save();
  if (blur > 0.3) destino.filter = `blur(${blur.toFixed(1)}px)`;
  destino.drawImage(cv, 0, 0, w, h);
  destino.restore();
}

export type OpcoesContorno = {
  /** escala em relação a 1080p (para o traço ter o mesmo peso em qualquer resolução) */
  escala?: number;
  alpha?: number;
  cache?: HTMLCanvasElement[];
};

/**
 * Desenha o contorno ATRÁS do recorte. `recorte` é um canvas do tamanho do
 * palco contendo apenas o sujeito (fundo transparente).
 */
export function desenharContorno(
  ctx: CanvasRenderingContext2D,
  recorte: CanvasImageSource,
  w: number,
  h: number,
  cfg: Contorno,
  opts: OpcoesContorno = {},
) {
  if (!cfg || cfg.preset === "nenhum") return;
  const esc = opts.escala ?? Math.min(w, h) / 1080;
  const cache = opts.cache ?? [];
  const larg = clamp(cfg.largura, 0, 50) * esc;
  const expansao = (clamp(cfg.expansao, 0, 100) / 100) * 12 * esc;
  const raio = larg + expansao;
  const suav = (clamp(cfg.suavidade, 0, 100) / 100) * 10 * esc;
  const alpha = (clamp(cfg.opacidade, 0, 100) / 100) * (opts.alpha ?? 1);
  if (alpha <= 0) return;

  ctx.save();
  ctx.globalAlpha = alpha;

  switch (cfg.preset) {
    case "solido":
      silhueta(ctx, recorte, w, h, cfg.cor, raio, false, suav, cache);
      break;
    case "papel":
      // borda branca irregular (recorte de papel) com um leve degrau interno
      silhueta(ctx, recorte, w, h, cfg.cor, raio * 1.25, true, suav * 0.6, cache);
      silhueta(ctx, recorte, w, h, cfg.cor, raio * 0.9, true, 0, cache);
      break;
    case "luminescencia": {
      const glow = (clamp(cfg.glow, 0, 100) / 100) * 60 * esc;
      ctx.save();
      ctx.globalAlpha = alpha * 0.85;
      silhueta(ctx, recorte, w, h, cfg.cor, raio + glow * 0.4, false, glow, cache);
      ctx.restore();
      silhueta(ctx, recorte, w, h, cfg.cor, raio, false, suav, cache);
      break;
    }
    case "desenho": {
      // três passadas irregulares finas, como uma caneta tremida
      for (let i = 0; i < 3; i++) {
        ctx.save();
        ctx.globalAlpha = alpha * (0.55 + i * 0.15);
        ctx.translate((pseudo(i * 3 + 1) - 0.5) * 3 * esc, (pseudo(i * 3 + 2) - 0.5) * 3 * esc);
        silhueta(ctx, recorte, w, h, cfg.cor, raio * (0.7 + i * 0.25), true, suav * 0.4, cache);
        ctx.restore();
      }
      break;
    }
    case "pb":
      silhueta(ctx, recorte, w, h, cfg.cor2 || "#000000", raio * 1.9, false, suav, cache);
      silhueta(ctx, recorte, w, h, cfg.cor, raio, false, suav * 0.5, cache);
      break;
    case "duplo":
      silhueta(ctx, recorte, w, h, cfg.cor2 || "#F26B1F", raio * 2.1, false, suav, cache);
      silhueta(ctx, recorte, w, h, cfg.cor, raio, false, suav * 0.5, cache);
      break;
    case "tracejado": {
      const { cv, ctx: c2 } = scratch(w, h, cache, 1);
      silhueta(c2, recorte, w, h, cfg.cor, raio, false, suav * 0.4, cache);
      // fura o traço com um padrão pontilhado
      const passo = Math.max(6, raio * 1.6);
      c2.globalCompositeOperation = "destination-out";
      c2.fillStyle = "#000";
      for (let yy = 0; yy < h; yy += passo) {
        for (let xx = ((yy / passo) % 2) * (passo / 2); xx < w; xx += passo) {
          c2.beginPath();
          c2.arc(xx, yy, passo * 0.28, 0, Math.PI * 2);
          c2.fill();
        }
      }
      c2.globalCompositeOperation = "source-over";
      ctx.drawImage(cv, 0, 0, w, h);
      break;
    }
    case "sombra": {
      ctx.save();
      ctx.translate(cfg.deslocX * esc, cfg.deslocY * esc);
      silhueta(ctx, recorte, w, h, cfg.cor || "#000000", raio, false, Math.max(suav, 4 * esc), cache);
      ctx.restore();
      break;
    }
  }

  ctx.restore();
}

/** Normaliza contornos antigos ({ativo,cor,largura}) para o formato atual. */
export function normalizarContorno(c: Partial<Contorno> | undefined | null): Contorno {
  if (!c) return { ...CONTORNO_PADRAO };
  const preset: ContornoPresetId = c.preset ?? (c.ativo ? "solido" : "nenhum");
  return { ...CONTORNO_PADRAO, ...c, preset };
}

/** Preset aplicado por cima do contorno atual, preservando ajustes manuais de cor quando faz sentido. */
export function aplicarPreset(atual: Contorno, id: ContornoPresetId): Contorno {
  const preset = CONTORNO_PRESETS.find((p) => p.id === id);
  return { ...CONTORNO_PADRAO, ...atual, ...(preset?.patch ?? {}), preset: id };
}
