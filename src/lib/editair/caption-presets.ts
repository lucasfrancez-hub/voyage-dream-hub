import { LEGENDA_PADRAO, type CaptionStyle } from "./types";

/**
 * Modelos prontos de legenda do EditAir.
 * São apenas DADOS: nenhum modelo tem lógica própria — a engine e o preview
 * leem os mesmos campos de CaptionStyle para qualquer preset.
 */
export type ModeloLegenda = {
  id: string;
  nome: string;
  descricao: string;
  animado: boolean;
  style: Partial<CaptionStyle>;
};

export const FRASE_DEMO = "Sua viagem começa aqui";

export const MODELOS_LEGENDA: ModeloLegenda[] = [
  {
    id: "clean",
    nome: "Clean",
    descricao: "Branco, bold, sombra discreta.",
    animado: false,
    style: {
      fontFamily: "Inter, system-ui, sans-serif",
      weight: 800,
      fontSize: 62,
      uppercase: false,
      color: "#FFFFFF",
      activeColor: "#FFFFFF",
      stroke: 0,
      shadow: 18,
      shadowColor: "rgba(0,0,0,0.65)",
      background: "none",
      karaoke: false,
      animacao: "fade",
      animacaoPalavra: "nenhuma",
      tracking: 0,
      lineHeight: 1.18,
      maxLines: 2,
      wordsPerBlock: 6,
      y: 0.78,
    },
  },
  {
    id: "destaque",
    nome: "Palavra destaque",
    descricao: "Frase branca, palavra atual em amarelo.",
    animado: true,
    style: {
      fontFamily: "Inter, system-ui, sans-serif",
      weight: 900,
      fontSize: 66,
      uppercase: false,
      color: "#FFFFFF",
      activeColor: "#FFD93D",
      stroke: 6,
      strokeColor: "#000000",
      shadow: 10,
      background: "none",
      karaoke: true,
      animacao: "fade",
      animacaoPalavra: "cor",
      maxLines: 2,
      wordsPerBlock: 5,
      y: 0.78,
    },
  },
  {
    id: "pop",
    nome: "Pop",
    descricao: "Letras grandes, contorno forte e escala.",
    animado: true,
    style: {
      fontFamily: "Inter, system-ui, sans-serif",
      weight: 900,
      fontSize: 82,
      uppercase: true,
      color: "#FFFFFF",
      activeColor: "#F26B1F",
      stroke: 14,
      strokeColor: "#000000",
      shadow: 0,
      background: "none",
      karaoke: true,
      animacao: "pop",
      animacaoPalavra: "pop",
      destaqueEscala: 1.14,
      tracking: 1,
      maxLines: 2,
      wordsPerBlock: 3,
      y: 0.74,
    },
  },
  {
    id: "minimal",
    nome: "Minimal",
    descricao: "Pequeno, elegante, sem caixa.",
    animado: false,
    style: {
      fontFamily: "Inter, system-ui, sans-serif",
      weight: 500,
      fontSize: 44,
      uppercase: false,
      color: "#FFFFFF",
      activeColor: "#FFFFFF",
      stroke: 0,
      shadow: 12,
      background: "none",
      karaoke: false,
      animacao: "fade",
      animacaoPalavra: "nenhuma",
      tracking: 1,
      lineHeight: 1.3,
      maxLines: 2,
      wordsPerBlock: 8,
      y: 0.84,
    },
  },
  {
    id: "box",
    nome: "Box",
    descricao: "Texto dentro de caixa arredondada.",
    animado: false,
    style: {
      fontFamily: "Inter, system-ui, sans-serif",
      weight: 800,
      fontSize: 56,
      uppercase: false,
      color: "#FFFFFF",
      activeColor: "#F26B1F",
      stroke: 0,
      shadow: 0,
      background: "box",
      backgroundColor: "rgba(0,0,0,0.78)",
      paddingX: 26,
      paddingY: 12,
      radius: 20,
      karaoke: true,
      animacao: "subir",
      animacaoPalavra: "cor",
      maxLines: 2,
      wordsPerBlock: 6,
      y: 0.8,
    },
  },
  {
    id: "karaoke",
    nome: "Karaokê",
    descricao: "Palavras mudam conforme são faladas.",
    animado: true,
    style: {
      fontFamily: "Inter, system-ui, sans-serif",
      weight: 900,
      fontSize: 70,
      uppercase: true,
      color: "#FFFFFF",
      activeColor: "#39E27D",
      stroke: 10,
      strokeColor: "#06110A",
      background: "none",
      karaoke: true,
      animacao: "nenhuma",
      animacaoPalavra: "cor",
      destaqueEscala: 1.06,
      maxLines: 2,
      wordsPerBlock: 4,
      y: 0.76,
    },
  },
  {
    id: "impact",
    nome: "Impact",
    descricao: "Caixa alta, fonte pesada, palavra maior.",
    animado: true,
    style: {
      fontFamily: "Impact, 'Arial Black', sans-serif",
      weight: 900,
      fontSize: 92,
      uppercase: true,
      color: "#FFFFFF",
      activeColor: "#FF3B30",
      stroke: 12,
      strokeColor: "#000000",
      background: "none",
      karaoke: true,
      animacao: "escala",
      animacaoPalavra: "pop",
      destaqueEscala: 1.2,
      tracking: 2,
      maxLines: 2,
      wordsPerBlock: 3,
      y: 0.7,
    },
  },
  {
    id: "podcast",
    nome: "Podcast",
    descricao: "Duas linhas, leitura confortável.",
    animado: true,
    style: {
      fontFamily: "Inter, system-ui, sans-serif",
      weight: 700,
      fontSize: 52,
      uppercase: false,
      color: "#E8E8EC",
      activeColor: "#F26B1F",
      stroke: 0,
      shadow: 14,
      background: "soft",
      backgroundColor: "rgba(0,0,0,0.45)",
      paddingX: 22,
      paddingY: 10,
      radius: 12,
      karaoke: true,
      animacao: "fade",
      animacaoPalavra: "cor",
      lineHeight: 1.32,
      maxLines: 2,
      wordsPerBlock: 8,
      y: 0.82,
    },
  },
  {
    id: "news",
    nome: "News",
    descricao: "Sóbrio, limpo e profissional.",
    animado: false,
    style: {
      fontFamily: "Georgia, serif",
      weight: 700,
      fontSize: 48,
      uppercase: false,
      color: "#FFFFFF",
      activeColor: "#FFFFFF",
      stroke: 0,
      shadow: 0,
      background: "box",
      backgroundColor: "rgba(12,24,48,0.9)",
      paddingX: 28,
      paddingY: 12,
      radius: 4,
      karaoke: false,
      animacao: "nenhuma",
      animacaoPalavra: "nenhuma",
      align: "center",
      maxLines: 2,
      wordsPerBlock: 9,
      y: 0.86,
    },
  },
  {
    id: "doodle",
    nome: "Doodle",
    descricao: "Combina com as animações desenhadas.",
    animado: true,
    style: {
      fontFamily: "'Trebuchet MS', 'Comic Sans MS', sans-serif",
      weight: 800,
      fontSize: 64,
      uppercase: false,
      color: "#FFF7E8",
      activeColor: "#F26B1F",
      stroke: 10,
      strokeColor: "#2B1B0E",
      background: "none",
      karaoke: true,
      animacao: "deslizar",
      animacaoPalavra: "pop",
      destaqueEscala: 1.1,
      maxLines: 2,
      wordsPerBlock: 4,
      y: 0.76,
    },
  },
  {
    id: "neon",
    nome: "Neon",
    descricao: "Texto com glow.",
    animado: true,
    style: {
      fontFamily: "Inter, system-ui, sans-serif",
      weight: 900,
      fontSize: 68,
      uppercase: true,
      color: "#FFFFFF",
      activeColor: "#37E1FF",
      stroke: 0,
      shadow: 34,
      shadowColor: "#37E1FF",
      background: "none",
      karaoke: true,
      animacao: "fade",
      animacaoPalavra: "brilho",
      tracking: 2,
      maxLines: 2,
      wordsPerBlock: 4,
      y: 0.75,
    },
  },
  {
    id: "dynamic",
    nome: "Dynamic",
    descricao: "Palavras entram progressivamente.",
    animado: true,
    style: {
      fontFamily: "Inter, system-ui, sans-serif",
      weight: 900,
      fontSize: 74,
      uppercase: true,
      color: "#FFFFFF",
      activeColor: "#F26B1F",
      stroke: 8,
      strokeColor: "#000000",
      background: "none",
      karaoke: true,
      animacao: "escala",
      animacaoPalavra: "progressiva",
      destaqueEscala: 1.12,
      maxLines: 1,
      wordsPerBlock: 3,
      y: 0.74,
    },
  },
];

/** Estilo completo resultante de um modelo. */
export function estiloDoModelo(m: ModeloLegenda, base: CaptionStyle = LEGENDA_PADRAO): CaptionStyle {
  return { ...LEGENDA_PADRAO, ...base, ...m.style, presetId: m.id };
}

/* ------------------- favoritos e modelos personalizados ------------------- */

const K_FAV = "editair:legendas:favoritos";
const K_MEUS = "editair:legendas:meus";

const ler = <T,>(chave: string, fallback: T): T => {
  if (typeof localStorage === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(chave);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};
const gravar = (chave: string, valor: unknown) => {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(chave, JSON.stringify(valor));
  } catch {
    /* storage cheio: ignora */
  }
};

export const lerFavoritos = () => ler<string[]>(K_FAV, []);
export function alternarFavorito(id: string) {
  const atual = lerFavoritos();
  const novo = atual.includes(id) ? atual.filter((x) => x !== id) : [...atual, id];
  gravar(K_FAV, novo);
  return novo;
}

export const lerMeusModelos = () => ler<ModeloLegenda[]>(K_MEUS, []);
export function salvarMeuModelo(nome: string, style: CaptionStyle) {
  const id = `meu-${Date.now().toString(36)}`;
  const modelo: ModeloLegenda = {
    id,
    nome: nome.trim() || "Meu modelo",
    descricao: "Modelo personalizado",
    animado: style.animacao !== "nenhuma" || (style.animacaoPalavra ?? "nenhuma") !== "nenhuma",
    style: { ...style, presetId: id },
  };
  const lista = [modelo, ...lerMeusModelos().filter((m) => m.nome !== modelo.nome)];
  gravar(K_MEUS, lista);
  return lista;
}
export function apagarMeuModelo(id: string) {
  const lista = lerMeusModelos().filter((m) => m.id !== id);
  gravar(K_MEUS, lista);
  return lista;
}

/** CSS equivalente ao preset — usado nos mini-previews da galeria. */
export function cssDoModelo(s: CaptionStyle): React.CSSProperties {
  const sombra = s.shadow ? `0 0 ${s.shadow}px ${s.shadowColor ?? "rgba(0,0,0,.6)"}` : undefined;
  const contorno = s.stroke ? `${Math.max(1, s.stroke / 6)}px ${s.strokeColor}` : undefined;
  return {
    fontFamily: s.fontFamily,
    fontWeight: s.weight,
    color: s.color,
    textTransform: s.uppercase ? "uppercase" : "none",
    letterSpacing: `${(s.tracking ?? 0) / 4}px`,
    lineHeight: s.lineHeight ?? 1.18,
    textAlign: s.align ?? "center",
    textShadow: sombra,
    WebkitTextStroke: contorno,
    paintOrder: "stroke fill",
    background:
      s.background === "none" ? "transparent" : s.backgroundColor ?? (s.background === "box" ? "rgba(0,0,0,.78)" : "rgba(0,0,0,.45)"),
    padding: s.background === "none" ? 0 : `${(s.paddingY ?? 6) / 2}px ${(s.paddingX ?? 18) / 2}px`,
    borderRadius: s.background === "none" ? 0 : (s.radius ?? 14) / 2,
  } as React.CSSProperties;
}
