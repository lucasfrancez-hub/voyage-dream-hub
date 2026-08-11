/**
 * Painel de Modelos — salva as camadas gráficas do projeto atual
 * (texto, legendas, stickers) e reaplica em qualquer outro projeto.
 */
import { useEffect, useState } from "react";
import { Layers, Plus, Trash2 } from "lucide-react";
import { PainelShell, Vazio, BotaoPill } from "./panel-kit";
import {
  excluirModelo,
  lerModelos,
  renomearModelo,
  salvarModelo,
  clipsDoModelo,
  type ModeloEditair,
} from "@/lib/editair/modelos";
import type { ProjectState } from "@/lib/editair/types";
import { formatarTempo } from "@/lib/editair/types";
import { toast } from "sonner";

export function ModelosPanel({
  state,
  capa,
  onAplicar,
}: {
  state: ProjectState;
  /** captura um frame do reprodutor para usar como capa */
  capa?: () => string | null;
  onAplicar: (modelo: ModeloEditair) => void;
}) {
  const [lista, setLista] = useState<ModeloEditair[]>([]);
  const [renomeando, setRenomeando] = useState<string | null>(null);

  useEffect(() => setLista(lerModelos()), []);

  const disponiveis = clipsDoModelo(state).length;

  const salvar = () => {
    if (!disponiveis) {
      toast.error("Adicione texto, stickers ou legendas antes de salvar um modelo.");
      return;
    }
    const nome = `Modelo ${new Date().toLocaleDateString("pt-BR")} ${new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
    const m = salvarModelo(nome, state, capa?.() ?? null);
    if (!m) return;
    setLista(lerModelos());
    setRenomeando(m.id);
    toast.success("Modelo salvo");
  };

  return (
    <PainelShell titulo="Modelos" contagem={lista.length ? `${lista.length} salvos` : undefined}>
      <button
        onClick={salvar}
        className="mb-3 flex w-full items-center justify-between gap-2 rounded-xl border border-dashed border-[#F26B1F]/50 bg-[#F26B1F]/[0.07] px-3 py-3 text-left transition hover:bg-[#F26B1F]/[0.14]"
      >
        <span>
          <span className="block text-[12px] font-semibold text-white">Salvar este projeto como modelo</span>
          <span className="text-[10px] text-white/45">
            {disponiveis ? `${disponiveis} camada(s) gráfica(s) serão guardadas` : "nenhuma camada gráfica no projeto ainda"}
          </span>
        </span>
        <Plus className="h-4 w-4 shrink-0 text-[#F26B1F]" />
      </button>

      {lista.length === 0 ? (
        <Vazio>
          Nenhum modelo ainda. Monte uma abertura, uma oferta ou um encerramento com texto e stickers e salve aqui — depois é só um
          clique para reaproveitar.
        </Vazio>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {lista.map((m) => (
            <div
              key={m.id}
              className="group overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.03] transition hover:border-white/20"
            >
              <button onClick={() => onAplicar(m)} className="block w-full text-left" title="Aplicar no playhead">
                <div className="relative aspect-video overflow-hidden bg-black/50">
                  {m.capa ? (
                    <img src={m.capa} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-[linear-gradient(135deg,#3a2a20,#7d4a26)]">
                      <Layers className="h-5 w-5 text-white/50" />
                    </div>
                  )}
                  <span className="absolute bottom-1 left-1 rounded bg-black/70 px-1.5 py-0.5 text-[9px] text-white/80">
                    {formatarTempo(m.duracaoMs)}
                  </span>
                </div>
              </button>
              <div className="flex items-center gap-1 px-2 py-1.5">
                {renomeando === m.id ? (
                  <input
                    autoFocus
                    defaultValue={m.nome}
                    onBlur={(e) => {
                      renomearModelo(m.id, e.target.value.trim() || m.nome);
                      setRenomeando(null);
                      setLista(lerModelos());
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") e.currentTarget.blur();
                      if (e.key === "Escape") setRenomeando(null);
                    }}
                    className="w-full rounded bg-black/50 px-1 py-0.5 text-[10px] outline-none"
                  />
                ) : (
                  <button
                    onDoubleClick={() => setRenomeando(m.id)}
                    className="min-w-0 flex-1 truncate text-left text-[10px] text-white/70"
                    title="Duplo clique para renomear"
                  >
                    {m.nome}
                  </button>
                )}
                <button
                  onClick={() => {
                    excluirModelo(m.id);
                    setLista(lerModelos());
                  }}
                  className="shrink-0 rounded p-0.5 text-white/30 opacity-0 transition hover:text-red-400 group-hover:opacity-100"
                  title="Excluir modelo"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {lista.length ? (
        <div className="mt-3 flex justify-end">
          <BotaoPill onClick={() => setLista(lerModelos())}>Atualizar lista</BotaoPill>
        </div>
      ) : null}
    </PainelShell>
  );
}
