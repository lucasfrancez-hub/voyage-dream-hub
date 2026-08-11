import { useEffect, useMemo, useRef, useState } from "react";
import { Heart, RotateCcw, Trash2 } from "lucide-react";
import {
  CATEGORIAS_LEGENDA,
  FRASE_DEMO,
  MODELOS_LEGENDA,
  alternarFavorito,
  apagarMeuModelo,
  categoriaDoModelo,
  cssDoModelo,
  estiloDoModelo,
  lerFavoritos,
  lerMeusModelos,
  salvarMeuModelo,
  type ModeloLegenda,
} from "@/lib/editair/caption-presets";
import type { CaptionStyle } from "@/lib/editair/types";

type Props = {
  atual: CaptionStyle;
  /** aplica o estilo: escopo "uma" = legenda selecionada, "todas" = todas as legendas */
  onAplicar: (estilo: CaptionStyle, escopo: "uma" | "todas") => void;
  temSelecao: boolean;
};

type Filtro = "todos" | "favoritos" | "meus" | (typeof CATEGORIAS_LEGENDA)[number]["id"];

const PALAVRAS = FRASE_DEMO.split(" ");

/** Só anima o que está visível na tela (performance com dezenas de cards). */
function useVisivel<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [visivel, setVisivel] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setVisivel(true);
      return;
    }
    const io = new IntersectionObserver((entradas) => setVisivel(entradas.some((e) => e.isIntersecting)), {
      rootMargin: "120px",
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return { ref, visivel };
}

/**
 * Miniatura real do preset: usa o MESMO objeto de estilo que a engine usa
 * para desenhar a legenda no vídeo. Card parado = estático; hover = animado.
 */
function MiniPreview({ estilo, ativoHover }: { estilo: CaptionStyle; ativoHover: boolean }) {
  const [idx, setIdx] = useState(-1);
  const timer = useRef<number | null>(null);
  const animado = estilo.karaoke || (estilo.animacaoPalavra ?? "nenhuma") !== "nenhuma";

  useEffect(() => {
    if (!ativoHover || !animado) {
      if (timer.current) window.clearInterval(timer.current);
      timer.current = null;
      setIdx(-1);
      return;
    }
    setIdx(0);
    timer.current = window.setInterval(() => setIdx((i) => (i + 1) % PALAVRAS.length), 420);
    return () => {
      if (timer.current) window.clearInterval(timer.current);
      timer.current = null;
    };
  }, [ativoHover, animado]);

  const base = cssDoModelo(estilo);
  const alinhamento = estilo.align === "left" ? "flex-start" : estilo.align === "right" ? "flex-end" : "center";
  const posicao = (estilo.y ?? 0.8) > 0.82 ? "flex-end" : (estilo.y ?? 0.8) < 0.7 ? "center" : "flex-end";
  const escala = Math.min(1.25, Math.max(0.55, (estilo.fontSize ?? 60) / 70));

  return (
    <div
      className="relative flex h-20 w-full overflow-hidden rounded-lg bg-[radial-gradient(circle_at_28%_18%,#33333d,#0e0e12)] p-1.5"
      style={{ alignItems: posicao, justifyContent: alinhamento }}
    >
      <span
        style={{
          ...base,
          fontSize: 13 * escala,
          lineHeight: estilo.lineHeight ?? 1.15,
          display: "inline-block",
          maxWidth: "100%",
        }}
      >
        {PALAVRAS.map((p, i) => {
          const destaque = animado && i === idx;
          return (
            <span
              key={`${p}-${i}`}
              style={{
                display: "inline-block",
                margin: "0 2px",
                transition: "transform .18s ease, color .18s ease, opacity .18s ease",
                color: destaque ? estilo.activeColor : (base.color as string),
                transform: destaque ? `scale(${estilo.destaqueEscala ?? 1.08})` : "scale(1)",
                opacity: animado && (estilo.animacaoPalavra ?? "") === "progressiva" && idx >= 0 && i > idx ? 0.25 : 1,
                textShadow:
                  destaque && (estilo.animacaoPalavra ?? "") === "brilho"
                    ? `0 0 10px ${estilo.activeColor}`
                    : (base.textShadow as string | undefined),
              }}
            >
              {p}
            </span>
          );
        })}
      </span>
    </div>
  );
}

function Card({
  modelo,
  estilo,
  ativo,
  favorito,
  onAplicar,
  onFavoritar,
  onExcluir,
  temSelecao,
}: {
  modelo: ModeloLegenda;
  estilo: CaptionStyle;
  ativo: boolean;
  favorito: boolean;
  onAplicar: (escopo: "uma" | "todas") => void;
  onFavoritar: () => void;
  onExcluir?: () => void;
  temSelecao: boolean;
}) {
  const [hover, setHover] = useState(false);
  const { ref, visivel } = useVisivel<HTMLDivElement>();

  return (
    <div
      ref={ref}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className={`group relative overflow-hidden rounded-xl border p-2 transition ${
        ativo ? "border-[#F26B1F] bg-[#F26B1F]/10" : "border-white/10 bg-black/40 hover:border-white/25"
      }`}
    >
      <button onClick={() => onAplicar("uma")} title={`${modelo.nome} — ${modelo.descricao}`} className="block w-full">
        <MiniPreview estilo={estilo} ativoHover={hover && visivel} />
      </button>

      <div className="mt-1.5 flex items-center justify-between gap-1">
        <span className="truncate text-[10px] text-white/70" title={modelo.descricao}>
          {modelo.nome}
        </span>
        <div className="flex items-center gap-1">
          {onExcluir ? (
            <button onClick={onExcluir} title="Excluir modelo" className="text-white/40 hover:text-red-400">
              <Trash2 className="h-3 w-3" />
            </button>
          ) : null}
          <button
            onClick={onFavoritar}
            title="Favoritar"
            className={favorito ? "text-[#F26B1F]" : "text-white/35 hover:text-white/70"}
          >
            <Heart className="h-3 w-3" fill={favorito ? "currentColor" : "none"} />
          </button>
        </div>
      </div>

      <div className="mt-1 flex gap-1">
        <button
          onClick={() => onAplicar("uma")}
          disabled={!temSelecao}
          className="flex-1 rounded-md bg-white/5 py-1 text-[9px] text-white/70 hover:bg-white/10 disabled:opacity-40"
        >
          Nesta legenda
        </button>
        <button
          onClick={() => onAplicar("todas")}
          className="flex-1 rounded-md bg-white/5 py-1 text-[9px] text-white/70 hover:bg-white/10"
        >
          Em todas
        </button>
      </div>
    </div>
  );
}

export function CaptionTemplates({ atual, onAplicar, temSelecao }: Props) {
  const [favoritos, setFavoritos] = useState<string[]>(() => lerFavoritos());
  const [meus, setMeus] = useState<ModeloLegenda[]>(() => lerMeusModelos());
  const [selecionado, setSelecionado] = useState<string | null>(atual.presetId ?? null);
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [nomeNovo, setNomeNovo] = useState("");
  /** estilo anterior ao início da experimentação (Esc volta pra ele) */
  const original = useRef<{ estilo: CaptionStyle; escopo: "uma" | "todas" } | null>(null);
  const [experimentando, setExperimentando] = useState(false);

  const lista = useMemo(() => {
    const base = [...meus, ...MODELOS_LEGENDA];
    if (filtro === "favoritos") return base.filter((m) => favoritos.includes(m.id));
    if (filtro === "meus") return meus;
    if (filtro === "todos") return base;
    return base.filter((m) => !m.id.startsWith("meu-") && categoriaDoModelo(m) === filtro);
  }, [meus, favoritos, filtro]);

  const aplicar = (m: ModeloLegenda, escopo: "uma" | "todas") => {
    if (!original.current) original.current = { estilo: atual, escopo };
    setSelecionado(m.id);
    setExperimentando(true);
    onAplicar(estiloDoModelo(m, atual), escopo);
  };

  const desfazer = () => {
    const o = original.current;
    if (!o) return;
    onAplicar(o.estilo, o.escopo);
    setSelecionado(o.estilo.presetId ?? null);
    original.current = null;
    setExperimentando(false);
  };

  useEffect(() => {
    if (!experimentando) return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") desfazer();
    };
    window.addEventListener("keydown", aoTeclar, true);
    return () => window.removeEventListener("keydown", aoTeclar, true);
  });

  const categorias: { id: Filtro; nome: string }[] = [
    { id: "todos", nome: "Todos" },
    { id: "favoritos", nome: "Favoritos" },
    ...CATEGORIAS_LEGENDA.map((c) => ({ id: c.id as Filtro, nome: c.nome })),
    { id: "meus", nome: "Meus modelos" },
  ];

  return (
    <div className="mb-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-white/60">Modelos</span>
        <div className="flex items-center gap-2">
          {experimentando ? (
            <button
              onClick={desfazer}
              className="flex items-center gap-1 rounded-full bg-white/5 px-2 py-0.5 text-[9px] text-white/60 hover:bg-white/10"
            >
              <RotateCcw className="h-3 w-3" /> Voltar (Esc)
            </button>
          ) : null}
          <span className="text-[10px] text-white/35">{lista.length} estilos</span>
        </div>
      </div>

      <div className="flex gap-2">
        {/* categorias — coluna lateral */}
        <div className="w-[86px] shrink-0 space-y-0.5 overflow-y-auto pr-1" style={{ maxHeight: 420 }}>
          {categorias.map((c) => (
            <button
              key={c.id}
              onClick={() => setFiltro(c.id)}
              className={`block w-full truncate rounded-md px-2 py-1.5 text-left text-[10px] transition ${
                filtro === c.id ? "bg-[#F26B1F]/15 font-semibold text-[#F26B1F]" : "text-white/55 hover:bg-white/5"
              }`}
            >
              {c.nome}
            </button>
          ))}
        </div>

        {/* grade de cards */}
        <div className="min-w-0 flex-1 overflow-y-auto pr-0.5" style={{ maxHeight: 420 }}>
          {lista.length === 0 ? (
            <p className="py-6 text-center text-[10px] text-white/35">Nenhum modelo nesta categoria ainda.</p>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {lista.map((m) => (
                <Card
                  key={m.id}
                  modelo={m}
                  estilo={estiloDoModelo(m, atual)}
                  ativo={selecionado === m.id}
                  favorito={favoritos.includes(m.id)}
                  temSelecao={temSelecao}
                  onAplicar={(escopo) => aplicar(m, escopo)}
                  onFavoritar={() => setFavoritos(alternarFavorito(m.id))}
                  onExcluir={m.id.startsWith("meu-") ? () => setMeus(apagarMeuModelo(m.id)) : undefined}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="mt-2 flex gap-1">
        <input
          value={nomeNovo}
          onChange={(e) => setNomeNovo(e.target.value)}
          placeholder="Nome do meu modelo"
          className="flex-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-[10px] outline-none placeholder:text-white/30"
        />
        <button
          onClick={() => {
            setMeus(salvarMeuModelo(nomeNovo || `Meu modelo ${meus.length + 1}`, atual));
            setNomeNovo("");
          }}
          className="rounded-lg border border-dashed border-white/15 px-2 py-1.5 text-[10px] text-white/70 hover:bg-white/5"
        >
          Salvar estilo atual
        </button>
      </div>
    </div>
  );
}
