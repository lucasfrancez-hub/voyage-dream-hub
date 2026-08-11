import { useMemo, useState } from "react";
import { Heart, Trash2 } from "lucide-react";
import {
  FRASE_DEMO,
  MODELOS_LEGENDA,
  alternarFavorito,
  apagarMeuModelo,
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

export function CaptionTemplates({ atual, onAplicar, temSelecao }: Props) {
  const [favoritos, setFavoritos] = useState<string[]>(() => lerFavoritos());
  const [meus, setMeus] = useState<ModeloLegenda[]>(() => lerMeusModelos());
  const [selecionado, setSelecionado] = useState<string | null>(atual.presetId ?? null);
  const [filtro, setFiltro] = useState<"todos" | "favoritos" | "meus">("todos");

  const lista = useMemo(() => {
    const base = [...meus, ...MODELOS_LEGENDA];
    if (filtro === "favoritos") return base.filter((m) => favoritos.includes(m.id));
    if (filtro === "meus") return meus;
    return base;
  }, [meus, favoritos, filtro]);

  const aplicar = (m: ModeloLegenda, escopo: "uma" | "todas") => {
    setSelecionado(m.id);
    onAplicar(estiloDoModelo(m, atual), escopo);
  };

  return (
    <div className="mb-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-white/60">Modelos</span>
        <div className="flex gap-1">
          {(["todos", "favoritos", "meus"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFiltro(f)}
              className={`rounded-full px-2 py-0.5 text-[10px] capitalize ${
                filtro === f ? "bg-[#F26B1F] text-white" : "bg-white/5 text-white/60 hover:bg-white/10"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {lista.map((m) => {
          const estilo = estiloDoModelo(m, atual);
          const ativo = selecionado === m.id;
          return (
            <div
              key={m.id}
              className={`group relative overflow-hidden rounded-xl border p-2 ${
                ativo ? "border-[#F26B1F] bg-[#F26B1F]/10" : "border-white/10 bg-black/40 hover:border-white/25"
              }`}
            >
              <button
                onClick={() => aplicar(m, "uma")}
                title="Aplicar nesta legenda"
                className="block h-16 w-full overflow-hidden rounded-lg bg-[radial-gradient(circle_at_30%_20%,#2b2b33,#101014)] px-1"
              >
                <span
                  className={`flex h-full items-center justify-center text-center text-[11px] leading-tight ${
                    m.animado ? "group-hover:animate-[pulse_1.1s_ease-in-out_infinite]" : ""
                  }`}
                  style={{ ...cssDoModelo(estilo), fontSize: 12 }}
                >
                  {FRASE_DEMO}
                </span>
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

      <button
        onClick={() => {
          const nome = window.prompt ? null : null;
          void nome;
          setMeus(salvarMeuModelo(`VIA AIR ${meus.length + 1}`, atual));
        }}
        className="mt-2 w-full rounded-lg border border-dashed border-white/15 py-1.5 text-[10px] text-white/60 hover:bg-white/5"
      >
        Salvar estilo atual como meu modelo
      </button>
    </div>
  );
}
