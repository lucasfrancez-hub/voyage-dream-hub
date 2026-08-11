import { useEffect, useState } from "react";
import { Sparkles, X } from "lucide-react";

const SUGESTOES = [
  "Remover pausas",
  "Melhorar áudio",
  "Criar legendas",
  "Adicionar B-roll",
  "Desfocar fundo",
  "Remover fundo",
  "Criar vídeo para Reels",
];

export type AiEditEscopo = { titulo: string; detalhe?: string };

type Props = {
  aberto: boolean;
  escopo: AiEditEscopo | null;
  processando: boolean;
  etapa: string;
  onFechar: () => void;
  onExecutar: (instrucao: string) => void;
  onAnalisar?: (instrucao: string) => void;
};

export function AiEditDialog({ aberto, escopo, processando, etapa, onFechar, onExecutar, onAnalisar }: Props) {
  const [texto, setTexto] = useState("");

  useEffect(() => {
    if (aberto) setTexto("");
  }, [aberto]);

  if (!aberto) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onPointerDown={onFechar}>
      <div
        className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#12171d] p-5 shadow-2xl"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start gap-2">
          <Sparkles className="mt-0.5 h-4 w-4 text-[#F26B1F]" />
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold text-white">Editar com IA</h2>
            {escopo ? (
              <p className="truncate text-[11px] text-white/45">
                {escopo.titulo}
                {escopo.detalhe ? ` · ${escopo.detalhe}` : ""}
              </p>
            ) : null}
          </div>
          <button onClick={onFechar} className="rounded p-1 text-white/40 hover:bg-white/10 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>

        <textarea
          autoFocus
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          rows={4}
          placeholder="Descreva o que você quer fazer com este vídeo..."
          className="w-full resize-none rounded-xl border border-white/10 bg-black/30 p-3 text-[13px] text-white outline-none placeholder:text-white/30 focus:border-[#F26B1F]/60"
        />

        <div className="mt-3 flex flex-wrap gap-1.5">
          {SUGESTOES.map((s) => (
            <button
              key={s}
              onClick={() => setTexto((t) => (t.trim() ? `${t.trim()}. ${s}` : s))}
              className="rounded-full border border-white/10 px-2.5 py-1 text-[11px] text-white/65 transition hover:border-[#F26B1F]/60 hover:bg-[#F26B1F]/10 hover:text-white"
            >
              {s}
            </button>
          ))}
        </div>

        {processando ? (
          <p className="mt-4 flex items-center gap-2 text-[12px] text-[#F26B1F]">
            <span className="h-3 w-3 animate-spin rounded-full border-2 border-[#F26B1F] border-t-transparent" />
            {etapa || "Processando..."}
          </p>
        ) : null}

        <div className="mt-4 flex items-center justify-end gap-2">
          <button onClick={onFechar} className="rounded-lg px-3 py-2 text-[12px] text-white/60 hover:bg-white/10">
            Cancelar
          </button>
          {onAnalisar ? (
            <button
              disabled={!texto.trim() || processando}
              onClick={() => onAnalisar(texto.trim())}
              className="rounded-lg border border-white/15 px-3 py-2 text-[12px] text-white/80 transition hover:bg-white/10 disabled:opacity-40"
            >
              Analisar primeiro
            </button>
          ) : null}
          <button
            disabled={!texto.trim() || processando}
            onClick={() => onExecutar(texto.trim())}
            className="rounded-lg bg-[#F26B1F] px-4 py-2 text-[12px] font-medium text-white transition hover:brightness-110 disabled:opacity-40"
          >
            Executar edição
          </button>
        </div>
      </div>
    </div>
  );
}
