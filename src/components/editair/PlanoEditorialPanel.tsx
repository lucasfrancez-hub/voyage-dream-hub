import { useState } from "react";
import { Brain, Check, Loader2, RotateCcw, Scissors, ShieldCheck, Volume2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatarTempo } from "@/lib/editair/types";
import { decisoesDoPlano, duracaoDoPlano, type PlanoEditorial } from "@/lib/editair/plan";

const PAPEL: Record<string, string> = {
  gancho: "Gancho",
  desenvolvimento: "Desenvolvimento",
  prova: "Prova",
  conclusao: "Conclusão",
  cta: "Chamada",
};

export type PlanoEditorialPanelProps = {
  plano: PlanoEditorial | null;
  pensando: boolean;
  etapa: string;
  onPlanejar: (objetivo: string) => void;
  onAplicar: () => void;
  onAjustar: (texto: string) => void;
  onDescartar: () => void;
  onSeek: (ms: number) => void;
};

export function PlanoEditorialPanel(p: PlanoEditorialPanelProps) {
  const [objetivo, setObjetivo] = useState("");
  const [ajuste, setAjuste] = useState("");

  if (p.pensando && !p.plano) {
    return (
      <div className="rounded-xl border border-[#F26B1F]/30 bg-[#F26B1F]/[0.06] p-4 text-xs text-white/70">
        <div className="flex items-center gap-2 font-medium text-white">
          <Loader2 className="h-4 w-4 animate-spin text-[#F26B1F]" /> Assistindo o material…
        </div>
        <p className="mt-2 text-white/50">{p.etapa || "Analisando áudio, imagem e o que você quis dizer."}</p>
      </div>
    );
  }

  if (!p.plano) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
        <div className="flex items-center gap-2 text-xs font-medium text-white">
          <Brain className="h-4 w-4 text-[#F26B1F]" /> Editor-chefe
        </div>
        <p className="mt-1.5 text-[11px] leading-relaxed text-white/45">
          Ele assiste o vídeo inteiro, entende a narrativa e propõe um plano de montagem antes de cortar qualquer coisa.
        </p>
        <textarea
          value={objetivo}
          onChange={(e) => setObjetivo(e.target.value)}
          rows={2}
          placeholder="Objetivo (opcional): ex. Reels de venda para Instagram, tom leve"
          className="mt-2 w-full resize-none rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[11px] outline-none placeholder:text-white/30 focus:border-[#F26B1F]/60"
        />
        <Button
          onClick={() => p.onPlanejar(objetivo.trim())}
          className="mt-2 h-9 w-full bg-[#F26B1F] text-xs hover:bg-[#d95c14]"
        >
          Analisar e propor edição
        </Button>
      </div>
    );
  }

  const plano = p.plano;
  const final = duracaoDoPlano(plano);
  const decisoes = decisoesDoPlano(plano);
  const preservacoes = [
    plano.preservacoes.cor && "cor",
    plano.preservacoes.enquadramento && "enquadramento",
    plano.preservacoes.exposicao && "exposição",
    plano.preservacoes.nitidez && "nitidez",
  ].filter(Boolean) as string[];

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-[#F26B1F]/30 bg-[#F26B1F]/[0.06] p-3">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-xs font-medium text-white">
            <Brain className="h-4 w-4 text-[#F26B1F]" /> Estratégia recomendada
          </span>
          <button onClick={p.onDescartar} className="text-white/40 transition hover:text-white">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-white/75">{plano.estrategia || plano.intencao}</p>
        <div className="mt-2.5 grid grid-cols-3 gap-2 text-center">
          <Metrica titulo="Original" valor={formatarTempo(plano.originalMs)} />
          <Metrica titulo="Final" valor={formatarTempo(final)} destaque />
          <Metrica titulo="Tomadas" valor={String(plano.cortes.length)} />
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5 text-[10px]">
          <Tag>{plano.ritmo}</Tag>
          <Tag>{plano.formatoRecomendado}</Tag>
          {plano.continuidade.usarJcuts ? <Tag>J/L-cuts</Tag> : null}
          {plano.audio.length ? <Tag>{plano.audio.length} ajuste(s) de áudio</Tag> : null}
        </div>
      </div>

      {plano.blocos.length ? (
        <Secao titulo="Narrativa">
          <div className="space-y-1">
            {plano.blocos.map((b, i) => (
              <button
                key={i}
                onClick={() => p.onSeek(b.fromMs)}
                className="flex w-full items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-left text-[11px] transition hover:border-[#F26B1F]/50"
              >
                <span className="rounded bg-[#F26B1F]/20 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-[#F26B1F]">
                  {PAPEL[b.papel] ?? b.papel}
                </span>
                <span className="flex-1 truncate text-white/80">{b.titulo}</span>
                <span className="tabular-nums text-white/35">{formatarTempo(b.fromMs)}</span>
              </button>
            ))}
          </div>
        </Secao>
      ) : null}

      <Secao titulo={`Decisões (${decisoes.length})`}>
        <div className="max-h-64 space-y-1 overflow-y-auto pr-1">
          {decisoes.map((d, i) => (
            <button
              key={i}
              onClick={() => p.onSeek(d.atMs)}
              className="flex w-full gap-2 rounded-lg border border-white/[0.07] bg-white/[0.02] px-2.5 py-1.5 text-left transition hover:border-white/20"
            >
              <span className="mt-0.5">
                {d.tipo === "removido" ? (
                  <Scissors className="h-3 w-3 text-red-400" />
                ) : d.tipo === "audio" ? (
                  <Volume2 className="h-3 w-3 text-sky-400" />
                ) : d.tipo === "mantido" ? (
                  <ShieldCheck className="h-3 w-3 text-emerald-400" />
                ) : (
                  <RotateCcw className="h-3 w-3 text-[#F26B1F]" />
                )}
              </span>
              <span className="flex-1 text-[11px] leading-snug text-white/70">{d.texto}</span>
              <span className="tabular-nums text-[10px] text-white/30">{formatarTempo(d.atMs)}</span>
            </button>
          ))}
        </div>
      </Secao>

      {preservacoes.length ? (
        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/[0.05] px-3 py-2 text-[11px] leading-relaxed text-emerald-200/80">
          <span className="font-medium">Sem mexer em {preservacoes.join(", ")}.</span> {plano.preservacoes.motivo}
        </div>
      ) : null}

      {plano.avisos.length ? (
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/[0.05] px-3 py-2 text-[11px] text-amber-200/80">
          {plano.avisos.map((a, i) => (
            <p key={i}>• {a}</p>
          ))}
        </div>
      ) : null}

      <div className="space-y-2">
        <textarea
          value={ajuste}
          onChange={(e) => setAjuste(e.target.value)}
          rows={2}
          placeholder="Quer mudar algo antes de montar? Ex.: mantém a parte do preço e deixa mais curto"
          className="w-full resize-none rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[11px] outline-none placeholder:text-white/30 focus:border-[#F26B1F]/60"
        />
        <div className="flex gap-2">
          <Button
            variant="outline"
            disabled={p.pensando || !ajuste.trim()}
            onClick={() => {
              p.onAjustar(ajuste.trim());
              setAjuste("");
            }}
            className="h-9 flex-1 border-white/15 bg-transparent text-xs hover:bg-white/5"
          >
            {p.pensando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Refazer plano"}
          </Button>
          <Button onClick={p.onAplicar} disabled={p.pensando} className="h-9 flex-1 bg-[#F26B1F] text-xs hover:bg-[#d95c14]">
            <Check className="mr-1 h-3.5 w-3.5" /> Montar edição
          </Button>
        </div>
        <p className="text-center text-[10px] text-white/30">Nada é destrutivo: o material original continua intacto.</p>
      </div>
    </div>
  );
}

function Metrica({ titulo, valor, destaque }: { titulo: string; valor: string; destaque?: boolean }) {
  return (
    <div className="rounded-lg bg-black/25 px-2 py-1.5">
      <div className="text-[9px] uppercase tracking-wide text-white/35">{titulo}</div>
      <div className={`text-xs font-semibold tabular-nums ${destaque ? "text-[#F26B1F]" : "text-white/85"}`}>{valor}</div>
    </div>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-white/55">{children}</span>;
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-[10px] uppercase tracking-wide text-white/35">{titulo}</div>
      {children}
    </div>
  );
}
