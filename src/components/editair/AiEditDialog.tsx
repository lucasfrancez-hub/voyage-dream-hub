import { useEffect, useState } from "react";
import { Check, Layers, Lock, Sparkles, X } from "lucide-react";

const SUGESTOES = [
  "Remover pausas",
  "Cortes dinâmicos",
  "Gerar legendas",
  "Destacar palavras importantes",
  "Adicionar B-roll",
  "Criar cena com IA na introdução",
  "Melhorar áudio",
  "Desfocar fundo",
];

export type AiEditEscopo = { titulo: string; detalhe?: string };
export type AiEscopoId = "clipe" | "cena" | "projeto";

export type PlanoPreview = {
  titulo: string;
  resposta: string;
  resumo: string[];
};

type Props = {
  aberto: boolean;
  escopo: AiEditEscopo | null;
  escopoId: AiEscopoId;
  podeClipe: boolean;
  /** trava o escopo no clipe (aberto pelo botão direito em cima do vídeo) */
  bloqueado?: boolean;
  onEscopoId: (e: AiEscopoId) => void;
  processando: boolean;
  etapa: string;
  etapas?: string[];
  plano?: PlanoPreview | null;
  onFechar: () => void;
  onPlanejar: (instrucao: string) => void;
  onAplicar: () => void;
  onDescartarPlano: () => void;
};

const ESCOPOS: { id: AiEscopoId; label: string; dica: string }[] = [
  { id: "clipe", label: "Este clipe", dica: "Altera somente o clipe selecionado" },
  { id: "cena", label: "Cena", dica: "Altera os clipes da cena atual" },
  { id: "projeto", label: "Projeto", dica: "Pode reorganizar o projeto inteiro" },
];

export function AiEditDialog({
  aberto,
  escopo,
  escopoId,
  podeClipe,
  bloqueado = false,
  onEscopoId,
  processando,
  etapa,
  etapas = [],
  plano,
  onFechar,
  onPlanejar,
  onAplicar,
  onDescartarPlano,
}: Props) {
  const [texto, setTexto] = useState("");

  useEffect(() => {
    if (aberto) setTexto("");
  }, [aberto]);

  if (!aberto) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onPointerDown={onFechar}>
      <div
        className="max-h-[86vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-white/10 bg-[#12171d] p-5 shadow-2xl"
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

        {/* escopo explícito: a IA nunca mexe fora do que foi pedido */}
        {bloqueado ? (
          <div className="mb-3 flex items-center gap-1.5 rounded-xl border border-[#F26B1F]/30 bg-[#F26B1F]/10 px-3 py-2 text-[11.5px] text-white/70">
            <Lock className="h-3.5 w-3.5 text-[#F26B1F]" />
            A edição vale só para este clipe.
          </div>
        ) : (
          <div className="mb-3 flex gap-1 rounded-xl border border-white/10 bg-black/30 p-1">
            {ESCOPOS.filter((e) => e.id !== "clipe" || podeClipe).map((e) => (
              <button
                key={e.id}
                title={e.dica}
                onClick={() => onEscopoId(e.id)}
                className={`flex-1 rounded-lg px-2 py-1.5 text-[11.5px] transition ${
                  escopoId === e.id ? "bg-[#F26B1F] font-semibold text-white" : "text-white/60 hover:bg-white/10"
                }`}
              >
                {e.label}
              </button>
            ))}
          </div>
        )}

        {plano ? (
          <div className="rounded-xl border border-[#F26B1F]/30 bg-[#F26B1F]/5 p-3">
            <p className="mb-1 flex items-center gap-1.5 text-[12px] font-semibold text-white">
              <Layers className="h-3.5 w-3.5 text-[#F26B1F]" /> Plano de edição
            </p>
            <p className="mb-2 text-[11.5px] text-white/55">{plano.resposta}</p>
            <ul className="space-y-1">
              {plano.resumo.map((linha, i) => (
                <li key={i} className="flex items-start gap-1.5 text-[12px] text-white/80">
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#F26B1F]" />
                  <span>{linha}</span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[10.5px] text-white/40">
              Tudo entra na timeline em camadas separadas e editáveis. Um Desfazer reverte a edição inteira.
            </p>
          </div>
        ) : (
          <>
            <textarea
              autoFocus
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              rows={4}
              placeholder="Ex.: remova as pausas e os erros de fala, faça cortes dinâmicos, gere legendas com destaque e coloque B-roll quando eu falo de avião."
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
          </>
        )}

        {processando ? (
          <div className="mt-4 space-y-1">
            {etapas.map((e) => (
              <p key={e} className="flex items-center gap-2 text-[11.5px] text-white/45">
                <Check className="h-3 w-3 text-emerald-400" />
                {e}
              </p>
            ))}
            <p className="flex items-center gap-2 text-[12px] text-[#F26B1F]">
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-[#F26B1F] border-t-transparent" />
              {etapa || "Processando..."}
            </p>
          </div>
        ) : null}

        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            onClick={plano ? onDescartarPlano : onFechar}
            className="rounded-lg px-3 py-2 text-[12px] text-white/60 hover:bg-white/10"
          >
            Cancelar
          </button>
          {plano ? (
            <button
              disabled={processando}
              onClick={onAplicar}
              className="rounded-lg bg-[#F26B1F] px-4 py-2 text-[12px] font-semibold text-white transition hover:bg-[#d95c14] disabled:opacity-50"
            >
              Aplicar edição
            </button>
          ) : (
            <button
              disabled={!texto.trim() || processando}
              onClick={() => onPlanejar(texto.trim())}
              className="rounded-lg bg-[#F26B1F] px-4 py-2 text-[12px] font-semibold text-white transition hover:bg-[#d95c14] disabled:opacity-50"
            >
              Editar com IA
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
