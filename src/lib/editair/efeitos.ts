/**
 * Biblioteca de efeitos do EditAir — entrada, momento (loop) e saída.
 *
 * Tudo aqui é PURO: a mesma função `calcularEfeitos` alimenta a engine de
 * render (canvas) e as miniaturas animadas da galeria (CSS transform).
 * Nada de assets pesados: os previews são só matemática + CSS.
 */

export type CamadaEfeito = "entrada" | "momento" | "saida";
export type EasingId = "linear" | "suave" | "forte" | "elastico";

export type EfeitoDef = {
  id: string;
  nome: string;
  camada: CamadaEfeito;
  descricao: string;
};

export type EfeitoAplicado = {
  id: string;
  /** duração da entrada/saída em ms (ignorada no momento/loop) */
  duracaoMs?: number;
  /** 0..100 */
  intensidade: number;
  easing?: EasingId;
  /** multiplicador de velocidade do loop (momento) */
  velocidade?: number;
};

export type EfeitosClip = {
  entrada?: EfeitoAplicado;
  momento?: EfeitoAplicado;
  saida?: EfeitoAplicado;
};

/** Deslocamentos acumulados que a engine aplica sobre o transform do clipe. */
export type DeltaEfeito = {
  dx: number;
  dy: number;
  escala: number;
  opacidade: number;
  rotacao: number;
  blur: number;
};

export const DELTA_NEUTRO: DeltaEfeito = { dx: 0, dy: 0, escala: 1, opacidade: 1, rotacao: 0, blur: 0 };

export const EFEITOS_ENTRADA: EfeitoDef[] = [
  { id: "fade-in", nome: "Fade in", camada: "entrada", descricao: "Aparece suavemente" },
  { id: "zoom-in", nome: "Zoom in", camada: "entrada", descricao: "Cresce até o tamanho normal" },
  { id: "pop-in", nome: "Pop", camada: "entrada", descricao: "Entrada com estouro" },
  { id: "slide-esq", nome: "Slide esquerda", camada: "entrada", descricao: "Entra pela esquerda" },
  { id: "slide-dir", nome: "Slide direita", camada: "entrada", descricao: "Entra pela direita" },
  { id: "slide-cima", nome: "Slide cima", camada: "entrada", descricao: "Entra por cima" },
  { id: "slide-baixo", nome: "Slide baixo", camada: "entrada", descricao: "Entra por baixo" },
  { id: "blur-in", nome: "Blur in", camada: "entrada", descricao: "Sai do desfoque" },
  { id: "bounce-in", nome: "Bounce", camada: "entrada", descricao: "Quica ao entrar" },
  { id: "giro-in", nome: "Giro suave", camada: "entrada", descricao: "Gira levemente ao entrar" },
];

export const EFEITOS_SAIDA: EfeitoDef[] = [
  { id: "fade-out", nome: "Fade out", camada: "saida", descricao: "Some suavemente" },
  { id: "zoom-out", nome: "Zoom out", camada: "saida", descricao: "Afasta ao sair" },
  { id: "slide-out", nome: "Slide out", camada: "saida", descricao: "Sai pela lateral" },
  { id: "blur-out", nome: "Blur out", camada: "saida", descricao: "Desfoca ao sair" },
  { id: "shrink-out", nome: "Shrink", camada: "saida", descricao: "Encolhe até sumir" },
  { id: "drop-out", nome: "Drop", camada: "saida", descricao: "Cai para baixo" },
  { id: "giro-out", nome: "Giro", camada: "saida", descricao: "Gira ao sair" },
  { id: "dissolve-out", nome: "Dissolve", camada: "saida", descricao: "Dissolve com leve zoom" },
];

export const EFEITOS_MOMENTO: EfeitoDef[] = [
  { id: "shake", nome: "Shake", camada: "momento", descricao: "Tremida de câmera" },
  { id: "pulso", nome: "Pulso", camada: "momento", descricao: "Escala pulsando" },
  { id: "zoom-lento", nome: "Zoom lento", camada: "momento", descricao: "Aproximação contínua" },
  { id: "pan-suave", nome: "Pan suave", camada: "momento", descricao: "Deslize horizontal lento" },
  { id: "flutuacao", nome: "Flutuação", camada: "momento", descricao: "Sobe e desce devagar" },
  { id: "tremor-leve", nome: "Tremor leve", camada: "momento", descricao: "Vibração discreta" },
  { id: "glitch", nome: "Glitch", camada: "momento", descricao: "Deslocamento digital" },
  { id: "flicker", nome: "Flicker", camada: "momento", descricao: "Piscada de luz" },
  { id: "respiracao", nome: "Respiração", camada: "momento", descricao: "Escala respirando" },
  { id: "handheld", nome: "Handheld", camada: "momento", descricao: "Câmera na mão sutil" },
  { id: "mov-horizontal", nome: "Movimento horizontal", camada: "momento", descricao: "Vai e volta na horizontal" },
  { id: "mov-vertical", nome: "Movimento vertical", camada: "momento", descricao: "Vai e volta na vertical" },
  { id: "vinheta", nome: "Vinheta", camada: "momento", descricao: "Escurece as bordas" },
];

export const TODOS_EFEITOS = [...EFEITOS_ENTRADA, ...EFEITOS_MOMENTO, ...EFEITOS_SAIDA];

export function efeitosDaCamada(camada: CamadaEfeito): EfeitoDef[] {
  return camada === "entrada" ? EFEITOS_ENTRADA : camada === "saida" ? EFEITOS_SAIDA : EFEITOS_MOMENTO;
}

export function acharEfeito(id: string | undefined): EfeitoDef | null {
  if (!id) return null;
  return TODOS_EFEITOS.find((e) => e.id === id) ?? null;
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

export function aplicarEasing(p: number, easing: EasingId = "suave"): number {
  const q = clamp(p, 0, 1);
  if (easing === "linear") return q;
  if (easing === "forte") return q < 0.5 ? 4 * q * q * q : 1 - Math.pow(-2 * q + 2, 3) / 2;
  if (easing === "elastico") {
    if (q === 0 || q === 1) return q;
    return Math.pow(2, -9 * q) * Math.sin((q * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1;
  }
  return 1 - Math.pow(1 - q, 3); // suave (easeOutCubic)
}

/** Efeito de entrada/saída: `p` = 0 (fora) → 1 (posição final). */
function deltaTransicao(id: string, p: number, forca: number, base: { w: number; h: number }): Partial<DeltaEfeito> {
  const f = 1 - p; // quanto falta
  switch (id) {
    case "fade-in":
    case "fade-out":
      return { opacidade: p };
    case "zoom-in":
      return { escala: 1 - 0.35 * forca * f, opacidade: 0.4 + 0.6 * p };
    case "zoom-out":
      return { escala: 1 + 0.45 * forca * f, opacidade: p };
    case "pop-in":
      return { escala: 1 + 0.5 * forca * Math.sin(Math.PI * f), opacidade: p };
    case "slide-esq":
      return { dx: -base.w * 0.6 * forca * f, opacidade: 0.5 + 0.5 * p };
    case "slide-dir":
    case "slide-out":
      return { dx: base.w * 0.6 * forca * f, opacidade: 0.5 + 0.5 * p };
    case "slide-cima":
      return { dy: -base.h * 0.5 * forca * f, opacidade: 0.5 + 0.5 * p };
    case "slide-baixo":
      return { dy: base.h * 0.5 * forca * f, opacidade: 0.5 + 0.5 * p };
    case "blur-in":
    case "blur-out":
      return { blur: 26 * forca * f, opacidade: 0.4 + 0.6 * p };
    case "bounce-in":
      return { dy: -base.h * 0.35 * forca * f * Math.cos(f * Math.PI * 2.2), escala: 1 - 0.1 * forca * f };
    case "giro-in":
      return { rotacao: -18 * forca * f, escala: 1 - 0.15 * forca * f, opacidade: p };
    case "giro-out":
      return { rotacao: 22 * forca * f, escala: 1 - 0.2 * forca * f, opacidade: p };
    case "shrink-out":
      return { escala: 1 - 0.85 * forca * f, opacidade: p };
    case "drop-out":
      return { dy: base.h * 0.7 * forca * f * f, rotacao: 8 * forca * f, opacidade: p };
    case "dissolve-out":
      return { opacidade: p, escala: 1 + 0.08 * forca * f, blur: 10 * forca * f };
    default:
      return {};
  }
}

/** Efeito de momento/loop: `tl` em segundos desde o início do clipe. */
function deltaMomento(id: string, tl: number, forca: number, duracaoS: number): Partial<DeltaEfeito> {
  switch (id) {
    case "shake":
      return { dx: Math.sin(tl * 34) * 14 * forca, dy: Math.cos(tl * 29) * 14 * forca };
    case "tremor-leve":
      return { dx: Math.sin(tl * 52) * 4 * forca, dy: Math.cos(tl * 47) * 4 * forca };
    case "handheld":
      return {
        dx: (Math.sin(tl * 1.7) + Math.sin(tl * 3.1) * 0.4) * 10 * forca,
        dy: (Math.cos(tl * 1.3) + Math.cos(tl * 2.7) * 0.4) * 8 * forca,
        rotacao: Math.sin(tl * 0.9) * 0.8 * forca,
      };
    case "pulso":
      return { escala: 1 + Math.sin(tl * 6) * 0.06 * forca };
    case "respiracao":
      return { escala: 1 + Math.sin(tl * 1.6) * 0.04 * forca };
    case "zoom-lento":
      return { escala: 1 + (tl / Math.max(0.5, duracaoS)) * 0.25 * forca };
    case "pan-suave":
      return { dx: (tl / Math.max(0.5, duracaoS)) * 90 * forca - 45 * forca, escala: 1 + 0.08 * forca };
    case "flutuacao":
      return { dy: Math.sin(tl * 1.2) * 16 * forca };
    case "mov-horizontal":
      return { dx: Math.sin(tl * 2) * 24 * forca };
    case "mov-vertical":
      return { dy: Math.sin(tl * 2) * 24 * forca };
    case "glitch":
      return { dx: (Math.random() - 0.5) * 18 * forca, opacidade: Math.random() > 0.92 ? 0.75 : 1 };
    case "flicker":
      return { opacidade: 1 - Math.abs(Math.sin(tl * 9)) * 0.35 * forca };
    default:
      return {}; // vinheta é desenhada pela engine, não altera transform
  }
}

const somar = (acc: DeltaEfeito, d: Partial<DeltaEfeito>): DeltaEfeito => ({
  dx: acc.dx + (d.dx ?? 0),
  dy: acc.dy + (d.dy ?? 0),
  escala: acc.escala * (d.escala ?? 1),
  opacidade: acc.opacidade * (d.opacidade ?? 1),
  rotacao: acc.rotacao + (d.rotacao ?? 0),
  blur: acc.blur + (d.blur ?? 0),
});

/**
 * Combina entrada + momento + saída num único delta.
 * As três camadas coexistem — nenhuma cancela a outra.
 */
export function calcularEfeitos(
  ef: EfeitosClip | undefined,
  tLocalMs: number,
  duracaoClipMs: number,
  base: { w: number; h: number } = { w: 1080, h: 1920 },
): DeltaEfeito {
  if (!ef) return { ...DELTA_NEUTRO };
  let acc = { ...DELTA_NEUTRO };
  const t = Math.max(0, tLocalMs);
  const total = Math.max(1, duracaoClipMs);

  if (ef.entrada && ef.entrada.id !== "nenhum") {
    const dur = Math.max(80, ef.entrada.duracaoMs ?? 600);
    if (t < dur) {
      const p = aplicarEasing(t / dur, ef.entrada.easing);
      acc = somar(acc, deltaTransicao(ef.entrada.id, p, (ef.entrada.intensidade ?? 60) / 100, base));
    }
  }
  if (ef.momento && ef.momento.id !== "nenhum") {
    const vel = ef.momento.velocidade ?? 1;
    acc = somar(
      acc,
      deltaMomento(ef.momento.id, (t / 1000) * vel, (ef.momento.intensidade ?? 50) / 100, total / 1000),
    );
  }
  if (ef.saida && ef.saida.id !== "nenhum") {
    const dur = Math.max(80, ef.saida.duracaoMs ?? 600);
    const restante = total - t;
    if (restante < dur) {
      const p = aplicarEasing(Math.max(0, restante) / dur, ef.saida.easing);
      acc = somar(acc, deltaTransicao(ef.saida.id, p, (ef.saida.intensidade ?? 60) / 100, base));
    }
  }
  acc.opacidade = clamp(acc.opacidade, 0, 1);
  acc.escala = clamp(acc.escala, 0.01, 8);
  return acc;
}

/** Existe vinheta ativa no momento? (a engine desenha por cima) */
export function temVinheta(ef: EfeitosClip | undefined): number {
  return ef?.momento?.id === "vinheta" ? (ef.momento.intensidade ?? 50) / 100 : 0;
}

/** CSS pronto para as miniaturas animadas da galeria. */
export function cssDoDelta(d: DeltaEfeito, escalaPreview = 0.12): { transform: string; opacity: number; filter?: string } {
  return {
    transform: `translate(${d.dx * escalaPreview}px, ${d.dy * escalaPreview}px) scale(${d.escala}) rotate(${d.rotacao}deg)`,
    opacity: d.opacidade,
    filter: d.blur > 0.4 ? `blur(${d.blur * escalaPreview * 2}px)` : undefined,
  };
}

/** Configuração inicial ao escolher um preset numa camada. */
export function efeitoPadrao(id: string, camada: CamadaEfeito): EfeitoAplicado {
  return camada === "momento"
    ? { id, intensidade: 50, velocidade: 1 }
    : { id, intensidade: 60, duracaoMs: 600, easing: "suave" };
}

/** Loop de demonstração usado nos cards (ms). */
export function duracaoDemo(camada: CamadaEfeito): number {
  return camada === "momento" ? 2400 : 1400;
}

/** Efeitos ativos de um clipe, para marcação na timeline. */
export function marcadoresEfeitos(ef: EfeitosClip | undefined, duracaoMs: number) {
  const entradaMs = ef?.entrada && ef.entrada.id !== "nenhum" ? Math.min(duracaoMs / 2, ef.entrada.duracaoMs ?? 600) : 0;
  const saidaMs = ef?.saida && ef.saida.id !== "nenhum" ? Math.min(duracaoMs / 2, ef.saida.duracaoMs ?? 600) : 0;
  return {
    entradaMs,
    saidaMs,
    temMomento: !!ef?.momento && ef.momento.id !== "nenhum",
  };
}
