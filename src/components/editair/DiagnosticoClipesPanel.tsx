import { useState } from "react";
import { toast } from "sonner";
import { Activity, Copy, Square, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { lerDiag } from "@/lib/editair/diag";

/**
 * Painel flutuante de diagnóstico da troca de clipes.
 * Fica DENTRO do editor: não fecha o projeto, a timeline nem o preview.
 * Somente lê o estado (não altera vídeo, imagem ou legendas).
 */
export function DiagnosticoClipesPanel({ aoFechar }: { aoFechar: () => void }) {
  const [gravando, setGravando] = useState(false);
  const [resultado, setResultado] = useState<string>("");

  const iniciar = () => {
    const d = lerDiag("clipesTraco") as { tracando?: boolean; indisponivel?: boolean; resultado?: unknown };
    if (d?.indisponivel) {
      toast.error("Preview ainda não está pronto — aguarde o projeto carregar.");
      return;
    }
    if (d?.tracando) {
      setGravando(true);
      setResultado("");
      toast.success("Diagnóstico iniciado — dê Play e passe pelo ponto com defeito.");
      return;
    }
    // Estava ligado por outro caminho: desligou agora. Liga de novo, limpo.
    const d2 = lerDiag("clipesTraco") as { tracando?: boolean };
    setGravando(!!d2?.tracando);
    setResultado("");
    if (d2?.tracando) toast.success("Diagnóstico iniciado — dê Play e passe pelo ponto com defeito.");
  };

  const parar = () => {
    const d = lerDiag("clipesTraco") as { tracando?: boolean; resultado?: unknown };
    if (d?.tracando) {
      // ainda ligado (estava desligado antes) — desliga para coletar
      const d2 = lerDiag("clipesTraco") as { resultado?: unknown };
      setResultado(JSON.stringify({ traco: d2?.resultado ?? d2, snapshot: lerDiag("clipes") }, null, 2));
    } else {
      setResultado(JSON.stringify({ traco: d?.resultado ?? d, snapshot: lerDiag("clipes") }, null, 2));
    }
    setGravando(false);
    toast.success("Diagnóstico parado — clique em Copiar resultado.");
  };

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(resultado);
      toast.success("Resultado copiado");
    } catch {
      toast.error("Não consegui copiar — selecione o texto e use Cmd+C.");
    }
  };

  return (
    <div className="pointer-events-auto fixed bottom-4 right-4 z-50 w-[360px] rounded-xl border border-white/10 bg-[#111114]/95 p-3 text-white shadow-2xl backdrop-blur">
      <div className="mb-2 flex items-center gap-2">
        <Activity className="h-4 w-4 text-[#F26B1F]" />
        <span className="text-sm font-semibold">Diagnóstico de clipes</span>
        <span className="flex-1" />
        <button onClick={aoFechar} className="rounded p-1 text-white/60 hover:bg-white/10 hover:text-white" title="Fechar">
          <X className="h-4 w-4" />
        </button>
      </div>

      <p className="mb-2 text-[11px] leading-snug text-white/50">
        Inicie, dê Play, passe pelo trecho com defeito, pare e copie. O projeto continua aberto.
      </p>

      <div className="flex gap-2">
        {!gravando ? (
          <Button size="sm" className="h-8 flex-1 bg-[#F26B1F] text-xs font-bold hover:bg-[#d95c14]" onClick={iniciar}>
            Iniciar diagnóstico
          </Button>
        ) : (
          <Button size="sm" variant="outline" className="h-8 flex-1 gap-1.5 border-white/20 bg-transparent text-xs" onClick={parar}>
            <Square className="h-3 w-3" /> Parar diagnóstico
          </Button>
        )}
        <Button
          size="sm"
          variant="outline"
          className="h-8 gap-1.5 border-white/20 bg-transparent text-xs"
          disabled={!resultado}
          onClick={() => void copiar()}
        >
          <Copy className="h-3 w-3" /> Copiar resultado
        </Button>
      </div>

      {gravando && (
        <div className="mt-2 flex items-center gap-2 text-[11px] text-[#F26B1F]">
          <span className="h-2 w-2 animate-pulse rounded-full bg-[#F26B1F]" />
          Gravando trocas de clipe…
        </div>
      )}

      {resultado && (
        <textarea
          readOnly
          value={resultado}
          className="mt-2 h-40 w-full resize-none rounded-md border border-white/10 bg-black/40 p-2 font-mono text-[10px] text-white/80"
        />
      )}
    </div>
  );
}
