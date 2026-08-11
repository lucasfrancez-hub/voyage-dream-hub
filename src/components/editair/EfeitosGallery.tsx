import { useEffect, useRef, useState } from "react";
import { Check, Play, X } from "lucide-react";
import { useVisivel } from "@/hooks/use-visivel";
import { Slider } from "@/components/ui/slider";
import {
  DELTA_NEUTRO,
  calcularEfeitos,
  cssDoDelta,
  duracaoDemo,
  efeitoPadrao,
  efeitosDaCamada,
  type CamadaEfeito,
  type EasingId,
  type EfeitoAplicado,
  type EfeitosClip,
} from "@/lib/editair/efeitos";

type Props = {
  efeitos: EfeitosClip | undefined;
  /** miniatura do clipe selecionado — usada como mídia demonstrativa nos cards */
  poster?: string;
  /** roda a demonstração do efeito no reprodutor, sobre o clipe real */
  onDemonstrar?: () => void;
  /** aplica de verdade no clipe */
  onAplicar: (ef: EfeitosClip | undefined) => void;
  /** pré-visualização temporária no reprodutor (não confirmada) */
  onPrevia?: (ef: EfeitosClip | undefined) => void;
};

const CAMADAS: { id: CamadaEfeito; nome: string }[] = [
  { id: "entrada", nome: "Entrada" },
  { id: "momento", nome: "Momento" },
  { id: "saida", nome: "Saída" },
];

const EASINGS: { id: EasingId; nome: string }[] = [
  { id: "suave", nome: "Suave" },
  { id: "linear", nome: "Linear" },
  { id: "forte", nome: "Forte" },
  { id: "elastico", nome: "Elástico" },
];

/** Miniatura leve: só anima no hover, usando a MESMA matemática da engine. */
function MiniEfeito({
  id,
  camada,
  ativo,
  poster,
}: {
  id: string;
  camada: CamadaEfeito;
  ativo: boolean;
  poster?: string;
}) {
  const alvo = useRef<HTMLDivElement>(null);
  const raf = useRef<number | null>(null);

  useEffect(() => {
    const el = alvo.current;
    if (!el) return;
    if (!ativo) {
      if (raf.current) cancelAnimationFrame(raf.current);
      raf.current = null;
      const s = cssDoDelta(DELTA_NEUTRO, 0.25);
      el.style.transform = s.transform;
      el.style.opacity = "1";
      el.style.filter = "none";
      return;
    }
    const total = duracaoDemo(camada);
    const t0 = performance.now();
    const passo = () => {
      const t = (performance.now() - t0) % total;
      const ef: EfeitosClip =
        camada === "entrada"
          ? { entrada: { ...efeitoPadrao(id, camada), duracaoMs: total * 0.6 } }
          : camada === "saida"
            ? { saida: { ...efeitoPadrao(id, camada), duracaoMs: total * 0.6 } }
            : { momento: efeitoPadrao(id, camada) };
      const d = calcularEfeitos(ef, t, total, { w: 120, h: 80 });
      const s = cssDoDelta(d, 0.25);
      el.style.transform = s.transform;
      el.style.opacity = String(s.opacity);
      el.style.filter = s.filter ?? "none";
      raf.current = requestAnimationFrame(passo);
    };
    raf.current = requestAnimationFrame(passo);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
      raf.current = null;
    };
  }, [ativo, id, camada]);

  return (
    <div className="relative h-14 w-full overflow-hidden rounded-lg bg-[#0d0d11]">
      <div
        ref={alvo}
        className="absolute inset-1 overflow-hidden rounded-md bg-[linear-gradient(135deg,#F26B1F,#8b3a10_60%,#1d4f55)] shadow-inner"
        style={{ willChange: "transform, opacity, filter" }}
      >
        {poster ? (
          <img src={poster} alt="" draggable={false} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-[9px] font-semibold text-white/80">VIA AIR</div>
        )}
      </div>
    </div>
  );
}

function Controles({
  valor,
  camada,
  onMudar,
}: {
  valor: EfeitoAplicado;
  camada: CamadaEfeito;
  onMudar: (v: EfeitoAplicado) => void;
}) {
  return (
    <div className="mt-2 space-y-2 rounded-lg border border-white/10 bg-white/[0.03] p-2">
      <label className="block text-[10px] text-white/55">
        Intensidade — {valor.intensidade}%
        <Slider
          className="mt-1"
          value={[valor.intensidade]}
          min={5}
          max={100}
          step={5}
          onValueChange={([v]) => onMudar({ ...valor, intensidade: v })}
        />
      </label>
      {camada === "momento" ? (
        <label className="block text-[10px] text-white/55">
          Velocidade — {(valor.velocidade ?? 1).toFixed(1)}x
          <Slider
            className="mt-1"
            value={[(valor.velocidade ?? 1) * 10]}
            min={2}
            max={30}
            step={1}
            onValueChange={([v]) => onMudar({ ...valor, velocidade: v / 10 })}
          />
        </label>
      ) : (
        <>
          <label className="block text-[10px] text-white/55">
            Duração — {valor.duracaoMs ?? 600} ms
            <Slider
              className="mt-1"
              value={[valor.duracaoMs ?? 600]}
              min={120}
              max={2500}
              step={20}
              onValueChange={([v]) => onMudar({ ...valor, duracaoMs: v })}
            />
          </label>
          <div className="flex flex-wrap gap-1">
            {EASINGS.map((e) => (
              <button
                key={e.id}
                onClick={() => onMudar({ ...valor, easing: e.id })}
                className={`rounded-full px-2 py-0.5 text-[9px] ${
                  (valor.easing ?? "suave") === e.id ? "bg-[#F26B1F] text-white" : "bg-white/5 text-white/60 hover:bg-white/10"
                }`}
              >
                {e.nome}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function CardEfeito({
  id,
  nome,
  descricao,
  camada,
  poster,
  selecionado,
  hover,
  onHover,
  onClick,
}: {
  id: string;
  nome: string;
  descricao: string;
  camada: CamadaEfeito;
  poster?: string;
  selecionado: boolean;
  hover: boolean;
  onHover: (v: boolean) => void;
  onClick: () => void;
}) {
  const { ref, visivel } = useVisivel<HTMLButtonElement>();
  return (
    <button
      ref={ref}
      title={descricao}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      onClick={onClick}
      className={`overflow-hidden rounded-xl border p-1.5 text-left transition ${
        selecionado ? "border-[#F26B1F] bg-[#F26B1F]/15" : "border-white/10 bg-black/40 hover:border-white/25"
      }`}
    >
      <MiniEfeito id={id} camada={camada} ativo={hover && visivel} poster={poster} />
      <span className="mt-1 flex items-center gap-1 truncate text-[10px] text-white/70">
        {selecionado ? <Play className="h-2.5 w-2.5 shrink-0 text-[#F26B1F]" /> : null}
        {nome}
      </span>
    </button>
  );
}

export function EfeitosGallery({ efeitos, poster, onAplicar, onPrevia, onDemonstrar }: Props) {
  const [camada, setCamada] = useState<CamadaEfeito>("entrada");
  const [hover, setHover] = useState<string | null>(null);
  const [previa, setPrevia] = useState<EfeitosClip | null>(null);
  const originalRef = useRef<EfeitosClip | undefined>(efeitos);

  const atual = previa ?? efeitos;
  const selecionado = atual?.[camada];

  /* Esc cancela a pré-visualização e restaura exatamente o estado anterior */
  useEffect(() => {
    if (!previa) return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setPrevia(null);
      onPrevia?.(originalRef.current);
    };
    window.addEventListener("keydown", aoTeclar, true);
    return () => window.removeEventListener("keydown", aoTeclar, true);
  }, [previa, onPrevia]);

  const escolher = (id: string) => {
    if (!previa) originalRef.current = efeitos;
    const base = atual ?? {};
    const proximo: EfeitosClip =
      selecionado?.id === id ? { ...base, [camada]: undefined } : { ...base, [camada]: efeitoPadrao(id, camada) };
    setPrevia(proximo);
    onPrevia?.(proximo);
    onDemonstrar?.();
  };

  const mudarParams = (v: EfeitoAplicado) => {
    const proximo = { ...(atual ?? {}), [camada]: v };
    setPrevia(proximo);
    onPrevia?.(proximo);
    onDemonstrar?.();
  };

  const confirmar = () => {
    const p = previa;
    setPrevia(null);
    const limpo = p && (p.entrada || p.momento || p.saida) ? p : undefined;
    onAplicar(limpo);
    originalRef.current = limpo;
  };

  const cancelar = () => {
    setPrevia(null);
    onPrevia?.(originalRef.current);
  };

  const resumo = (["entrada", "momento", "saida"] as CamadaEfeito[])
    .map((c) => (atual?.[c] ? `${c === "saida" ? "saída" : c}: ${atual[c]!.id}` : null))
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="space-y-2">
      <div className="flex gap-1">
        {CAMADAS.map((c) => (
          <button
            key={c.id}
            onClick={() => setCamada(c.id)}
            className={`flex-1 rounded-lg px-2 py-1.5 text-[11px] ${
              camada === c.id ? "bg-[#F26B1F] text-white" : "bg-white/5 text-white/60 hover:bg-white/10"
            }`}
          >
            {c.nome}
            {atual?.[c.id] ? <span className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-white/80 align-middle" /> : null}
          </button>
        ))}
      </div>

      <p className="text-[10px] text-white/35">
        Entrada, momento e saída coexistem. Passe o mouse para ver a miniatura animada; clique para assistir no reprodutor, sobre o seu próprio clipe. Nada é renderizado agora — só na exportação.
      </p>

      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => {
            if (!previa) originalRef.current = efeitos;
            const proximo = { ...(atual ?? {}), [camada]: undefined };
            setPrevia(proximo);
            onPrevia?.(proximo);
          }}
          className={`rounded-xl border px-2 py-3 text-[11px] ${
            !selecionado ? "border-[#F26B1F] bg-[#F26B1F]/15" : "border-white/10 hover:bg-white/5"
          }`}
        >
          Nenhum
        </button>
        {efeitosDaCamada(camada).map((e) => (
          <CardEfeito
            key={e.id}
            id={e.id}
            nome={e.nome}
            descricao={e.descricao}
            camada={camada}
            poster={poster}
            selecionado={selecionado?.id === e.id}
            hover={hover === e.id}
            onHover={(v) => setHover(v ? e.id : null)}
            onClick={() => escolher(e.id)}
          />
        ))}
      </div>

      {selecionado ? <Controles valor={selecionado} camada={camada} onMudar={mudarParams} /> : null}

      {resumo ? <p className="truncate text-[10px] text-white/40">{resumo}</p> : null}

      {previa ? (
        <div className="flex gap-2">
          <button
            onClick={confirmar}
            className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-[#F26B1F] py-1.5 text-[11px] font-semibold text-white"
          >
            <Check className="h-3.5 w-3.5" /> Aplicar
          </button>
          <button
            onClick={cancelar}
            className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-white/10 py-1.5 text-[11px] text-white/70 hover:bg-white/5"
          >
            <X className="h-3.5 w-3.5" /> Cancelar (Esc)
          </button>
        </div>
      ) : null}
    </div>
  );
}
