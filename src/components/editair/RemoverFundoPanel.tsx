/* Painel "Remover plano de fundo" do Inspector.
   Tudo é não destrutivo: o arquivo original nunca muda — recorte, refinamento e
   contorno são propriedades do clipe e continuam editáveis a qualquer momento. */
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { ContornoGallery } from "@/components/editair/ContornoGallery";
import { normalizarContorno, type Contorno } from "@/lib/editair/contorno";
import { FUNDO_PADRAO, REFINO_PADRAO, type EditairClip, type Fundo } from "@/lib/editair/types";

const LARANJA = "#F26B1F";

type Props = {
  clip: EditairClip;
  onPatchClip: (patch: Partial<EditairClip>) => void;
  /** roda a análise do recorte e reporta o progresso (0..100) */
  onAnalisarFundo?: (onProgresso: (pct: number) => void, cancelado: () => boolean) => Promise<boolean>;
};

export function RemoverFundoPanel({ clip, onPatchClip, onAnalisarFundo }: Props) {
  const fundo = clip.fundo;
  const ativo = fundo?.modo === "remover";
  const contorno = normalizarContorno(fundo?.contorno);
  const refino = fundo?.refino ?? REFINO_PADRAO;

  const [progresso, setProgresso] = useState<number | null>(null);
  const [avancado, setAvancado] = useState(false);
  const cancelar = useRef(false);
  /** estado anterior guardado enquanto o preset está apenas em pré-visualização */
  const [pendente, setPendente] = useState<Fundo | null>(null);

  const patchFundo = useCallback(
    (patch: Partial<Fundo>) => onPatchClip({ fundo: { ...FUNDO_PADRAO, ...(clip.fundo ?? {}), ...patch } }),
    [clip.fundo, onPatchClip],
  );

  const analisar = useCallback(async () => {
    if (!onAnalisarFundo) return;
    cancelar.current = false;
    setProgresso(0);
    try {
      await onAnalisarFundo((p) => setProgresso(p), () => cancelar.current);
    } finally {
      setProgresso(null);
    }
  }, [onAnalisarFundo]);

  const alternar = useCallback(() => {
    if (ativo) {
      cancelar.current = true;
      patchFundo({ modo: "nenhum" });
      return;
    }
    patchFundo({ modo: "remover", refino: { ...REFINO_PADRAO, ...(clip.fundo?.refino ?? {}) } });
    void analisar();
  }, [ativo, analisar, clip.fundo?.refino, patchFundo]);

  // Esc cancela a pré-visualização e restaura o estado anterior
  useEffect(() => {
    if (!pendente) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      onPatchClip({ fundo: pendente });
      setPendente(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pendente, onPatchClip]);

  const preverContorno = (c: Contorno) => {
    if (!pendente) setPendente({ ...FUNDO_PADRAO, ...(clip.fundo ?? {}) });
    patchFundo({ contorno: { ...c, ativo: c.preset !== "nenhum" } });
  };

  const setContorno = (patch: Partial<Contorno>) =>
    patchFundo({ contorno: { ...contorno, ...patch, ativo: (patch.preset ?? contorno.preset) !== "nenhum" } });

  return (
    <div className="space-y-3" data-testid="painel-remover-fundo">
      <button
        type="button"
        onClick={alternar}
        className="flex w-full items-center justify-between rounded-lg border px-2.5 py-2 text-[12px] transition"
        style={{
          borderColor: ativo ? LARANJA : "rgba(255,255,255,0.10)",
          background: ativo ? "rgba(242,107,31,0.12)" : "rgba(0,0,0,0.25)",
        }}
        data-testid="toggle-remocao-automatica"
      >
        <span className="flex items-center gap-2">
          <Sparkles className="h-3.5 w-3.5" style={{ color: LARANJA }} />
          Remoção automática
        </span>
        <span
          className="h-4 w-8 rounded-full p-[2px] transition"
          style={{ background: ativo ? LARANJA : "rgba(255,255,255,0.18)" }}
        >
          <span
            className="block h-3 w-3 rounded-full bg-white transition-transform"
            style={{ transform: ativo ? "translateX(16px)" : "none" }}
          />
        </span>
      </button>

      {progresso != null ? (
        <div className="rounded-lg border border-white/10 bg-black/25 p-2" data-testid="progresso-recorte">
          <div className="mb-1 flex items-center gap-2 text-[11px] text-white/70">
            <Loader2 className="h-3 w-3 animate-spin" style={{ color: LARANJA }} />
            Processando {progresso}%
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
            <div className="h-full transition-all" style={{ width: `${progresso}%`, background: LARANJA }} />
          </div>
        </div>
      ) : null}

      {!ativo ? (
        <p className="text-[11px] leading-relaxed text-white/40">
          Detecta a pessoa/objeto principal e remove o fundo. O resultado fica transparente: qualquer camada abaixo
          aparece atrás do recorte.
        </p>
      ) : (
        <>
          <div className="space-y-2">
            <p className="text-[11px] font-medium text-white/60">Contorno</p>
            <ContornoGallery valor={contorno} onPrever={preverContorno} />
            {pendente ? (
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  className="h-7 flex-1 text-[11px]"
                  style={{ background: LARANJA }}
                  onClick={() => setPendente(null)}
                  data-testid="aplicar-contorno"
                >
                  Aplicar
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-[11px]"
                  onClick={() => {
                    onPatchClip({ fundo: pendente });
                    setPendente(null);
                  }}
                >
                  Esc — cancelar
                </Button>
              </div>
            ) : null}
          </div>

          {contorno.preset !== "nenhum" ? (
            <div className="space-y-2 rounded-lg border border-white/10 bg-black/20 p-2">
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={contorno.cor}
                  onChange={(e) => setContorno({ cor: e.target.value })}
                  className="h-7 w-10 shrink-0 rounded border border-white/10 bg-transparent"
                  aria-label="Cor do contorno"
                />
                <input
                  value={contorno.cor.toUpperCase()}
                  onChange={(e) => setContorno({ cor: e.target.value })}
                  className="h-7 w-full rounded border border-white/10 bg-black/40 px-2 text-[11px]"
                />
              </div>
              {contorno.preset === "duplo" || contorno.preset === "pb" ? (
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={contorno.cor2}
                    onChange={(e) => setContorno({ cor2: e.target.value })}
                    className="h-7 w-10 shrink-0 rounded border border-white/10 bg-transparent"
                    aria-label="Cor secundária"
                  />
                  <span className="text-[11px] text-white/50">Cor secundária</span>
                </div>
              ) : null}
              <Faixa label="Espessura" v={contorno.largura} max={50} onChange={(v) => setContorno({ largura: v })} />
              <Faixa label="Opacidade" v={contorno.opacidade} onChange={(v) => setContorno({ opacidade: v })} />
              <Faixa label="Suavidade" v={contorno.suavidade} onChange={(v) => setContorno({ suavidade: v })} />
              <Faixa label="Expansão" v={contorno.expansao} onChange={(v) => setContorno({ expansao: v })} />
              <Faixa label="Feather" v={contorno.feather} onChange={(v) => setContorno({ feather: v })} />
              <Faixa label="Glow" v={contorno.glow} onChange={(v) => setContorno({ glow: v })} />
              {contorno.preset === "sombra" ? (
                <>
                  <Faixa
                    label="Deslocamento X"
                    v={contorno.deslocX}
                    min={-80}
                    max={80}
                    onChange={(v) => setContorno({ deslocX: v })}
                  />
                  <Faixa
                    label="Deslocamento Y"
                    v={contorno.deslocY}
                    min={-80}
                    max={80}
                    onChange={(v) => setContorno({ deslocY: v })}
                  />
                </>
              ) : null}
            </div>
          ) : null}

          <div className="rounded-lg border border-white/10 bg-black/20">
            <button
              type="button"
              onClick={() => setAvancado((a) => !a)}
              className="flex w-full items-center justify-between px-2.5 py-2 text-[11px] text-white/70"
            >
              Refinar recorte
              <ChevronDown className={`h-3.5 w-3.5 transition ${avancado ? "rotate-180" : ""}`} />
            </button>
            {avancado ? (
              <div className="space-y-2 border-t border-white/10 p-2">
                <Faixa
                  label="Suavizar borda"
                  v={fundo?.suavidade ?? FUNDO_PADRAO.suavidade}
                  onChange={(v) => patchFundo({ suavidade: v })}
                />
                <Faixa
                  label="Feather"
                  v={refino.feather}
                  onChange={(v) => patchFundo({ refino: { ...refino, feather: v } })}
                />
                <Faixa
                  label="Expandir / contrair máscara"
                  v={fundo?.borda ?? 0}
                  min={-100}
                  onChange={(v) => patchFundo({ borda: v })}
                />
                <Faixa
                  label="Reduzir halo"
                  v={refino.halo}
                  onChange={(v) => patchFundo({ refino: { ...refino, halo: v } })}
                />
                <Faixa
                  label="Estabilidade temporal"
                  v={fundo?.estabilidade ?? FUNDO_PADRAO.estabilidade}
                  max={95}
                  onChange={(v) => patchFundo({ estabilidade: v })}
                />
                <div className="flex items-center gap-2 pt-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 flex-1 border border-white/10 text-[11px]"
                    onClick={() =>
                      patchFundo({ qualidade: fundo?.qualidade === "alta" ? "rapida" : "alta" })
                    }
                  >
                    Qualidade: {fundo?.qualidade === "alta" ? "alta" : "rápida"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 border border-white/10 text-[11px]"
                    onClick={() => void analisar()}
                    disabled={progresso != null}
                  >
                    Reanalisar
                  </Button>
                </div>
              </div>
            ) : null}
          </div>

          <p className="text-[11px] leading-relaxed text-white/35">
            A máscara fica em cache (asset + trecho + versão do modelo). Trocar cor ou espessura do traço redesenha na
            hora, sem rodar a IA de novo.
          </p>
        </>
      )}
    </div>
  );
}

function Faixa({
  label,
  v,
  min = 0,
  max = 100,
  onChange,
}: {
  label: string;
  v: number;
  min?: number;
  max?: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 flex items-center justify-between text-[11px] text-white/55">
        {label}
        <span className="text-white/35">{Math.round(v)}</span>
      </span>
      <Slider value={[v]} min={min} max={max} step={1} onValueChange={([x]) => onChange(x)} />
    </label>
  );
}
