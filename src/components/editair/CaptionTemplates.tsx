import { useEffect, useMemo, useRef, useState } from "react";
import { Heart, Trash2 } from "lucide-react";
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

/**
 * Miniatura real do preset: usa o MESMO objeto de estilo que a engine usa
 * para desenhar a legenda no vídeo. Animação só roda no hover (performance).
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

export function CaptionTemplates({ atual, onAplicar, temSelecao }: Props) {
  const [favoritos, setFavoritos] = useState<string[]>(() => lerFavoritos());
  const [meus, setMeus] = useState<ModeloLegenda[]>(() => lerMeusModelos());
  const [selecionado, setSelecionado] = useState<string | null>(atual.presetId ?? null);
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [hover, setHover] = useState<string | null>(null);
  const [nomeNovo, setNomeNovo] = useState("");

  const lista = useMemo(() => {
    const base = [...meus, ...MODELOS_LEGENDA];
    if (filtro === "favoritos") return base.filter((m) => favoritos.includes(m.id));
    if (filtro === "meus") return meus;
    if (filtro === "todos") return base;
    return base.filter((m) => !m.id.startsWith("meu-") && categoriaDoModelo(m) === filtro);
  }, [meus, favoritos, filtro]);

  const aplicar = (m: ModeloLegenda, escopo: "uma" | "todas") => {
    setSelecionado(m.id);
    onAplicar(estiloDoModelo(m, atual), escopo);
  };

  const abas: { id: Filtro; nome: string }[] = [
    { id: "todos", nome: "Todos" },
    ...CATEGORIAS_LEGENDA.map((c) => ({ id: c.id as Filtro, nome: c.nome })),
    { id: "favoritos", nome: "Favoritos" },
    { id: "meus", nome: "Meus modelos" },
  ];

  return (
    <div className="mb-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-white/60">Modelos</span>
        <span className="text-[10px] text-white/35">{lista.length} estilos</span>
      </div>

      <div className="-mx-1 mb-2 flex gap-1 overflow-x-auto px-1 pb-1">
        {abas.map((f) => (
          <button
            key={f.id}
            onClick={() => setFiltro(f.id)}
            className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] ${
              filtro === f.id ? "bg-[#F26B1F] text-white" : "bg-white/5 text-white/60 hover:bg-white/10"
            }`}
          >
            {f.nome}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2">
        {lista.map((m) => {
          const estilo = estiloDoModelo(m, atual);
          const ativo = selecionado === m.id;
          return (
            <div
              key={m.id}
              onMouseEnter={() => setHover(m.id)}
              onMouseLeave={() => setHover((h) => (h === m.id ? null : h))}
              className={`group relative overflow-hidden rounded-xl border p-2 ${
                ativo ? "border-[#F26B1F] bg-[#F26B1F]/10" : "border-white/10 bg-black/40 hover:border-white/25"
              }`}
            >
              <button
                onClick={() => aplicar(m, "uma")}
                title={`${m.nome} — ${m.descricao}`}
                className="block w-full"
              >
                <MiniPreview estilo={estilo} ativoHover={hover === m.id} />
              </button>

              <div className="mt-1.5 flex items-center justify-between gap-1">
                <span className="truncate text-[10px] text-white/70" title={m.descricao}>
                  {m.nome}
                </span>
                <div className="flex items-center gap-1">
                  {m.id.startsWith("meu-") && (
                    <button
                      onClick={() => setMeus(apagarMeuModelo(m.id))}
                      title="Excluir modelo"
                      className="text-white/40 hover:text-red-400"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                  <button
                    onClick={() => setFavoritos(alternarFavorito(m.id))}
                    title="Favoritar"
                    className={favoritos.includes(m.id) ? "text-[#F26B1F]" : "text-white/35 hover:text-white/70"}
                  >
                    <Heart className="h-3 w-3" fill={favoritos.includes(m.id) ? "currentColor" : "none"} />
                  </button>
                </div>
              </div>

              <div className="mt-1 flex gap-1">
                <button
                  onClick={() => aplicar(m, "uma")}
                  disabled={!temSelecao}
                  className="flex-1 rounded-md bg-white/5 py-1 text-[9px] text-white/70 hover:bg-white/10 disabled:opacity-40"
                >
                  Nesta legenda
                </button>
                <button
                  onClick={() => aplicar(m, "todas")}
                  className="flex-1 rounded-md bg-white/5 py-1 text-[9px] text-white/70 hover:bg-white/10"
                >
                  Em todas
                </button>
              </div>
            </div>
          );
        })}
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
