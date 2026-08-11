/**
 * Kit visual dos painéis do EditAir — linguagem CapCut:
 * cabeçalho fino, chips segmentados, seções colapsáveis,
 * cards de preset com miniatura e animação no hover.
 */
import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

export const LARANJA = "#F26B1F";

/* --------------------------- casca do painel --------------------------- */

export function PainelShell({
  titulo,
  contagem,
  acoes,
  children,
}: {
  titulo: string;
  contagem?: string;
  acoes?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col bg-[#12171d]">
      <div className="flex shrink-0 items-center gap-2 border-b border-white/[0.07] px-4 py-3">
        <h2 className="text-[13px] font-semibold tracking-tight text-white">{titulo}</h2>
        {contagem ? <span className="text-[10px] text-white/35">{contagem}</span> : null}
        <div className="ml-auto flex items-center gap-1.5">{acoes}</div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">{children}</div>
    </div>
  );
}

/* ------------------------------- vazio -------------------------------- */

export function Vazio({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-6 text-center text-[11px] leading-relaxed text-white/40">
      {children}
    </div>
  );
}

/* ------------------------------- chips -------------------------------- */

export function Chips<T extends string>({
  itens,
  valor,
  onChange,
}: {
  itens: { id: T; nome: string }[];
  valor: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="mb-3 flex gap-1 rounded-xl bg-black/30 p-1">
      {itens.map((i) => (
        <button
          key={i.id}
          onClick={() => onChange(i.id)}
          className={`flex-1 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition ${
            valor === i.id ? "bg-[#F26B1F] text-white shadow-[0_4px_14px_-6px_#F26B1F]" : "text-white/50 hover:bg-white/[0.06] hover:text-white/80"
          }`}
        >
          {i.nome}
        </button>
      ))}
    </div>
  );
}

/* --------------------------- seção colapsável -------------------------- */

export function Secao({
  titulo,
  aberta = true,
  acao,
  children,
}: {
  titulo: string;
  aberta?: boolean;
  acao?: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(aberta);
  return (
    <div className="mb-2 overflow-hidden rounded-xl border border-white/[0.07] bg-white/[0.02]">
      <div className="flex items-center">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex flex-1 items-center gap-1.5 px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-white/55 transition hover:text-white"
        >
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "" : "-rotate-90"}`} />
          {titulo}
        </button>
        {acao ? <div className="pr-2">{acao}</div> : null}
      </div>
      {open ? <div className="space-y-2 px-3 pb-3">{children}</div> : null}
    </div>
  );
}

/* ------------------------- linha de slider fina ------------------------ */

export function LinhaValor({
  label,
  valor,
  children,
  acao,
}: {
  label: string;
  valor?: string;
  children: ReactNode;
  acao?: ReactNode;
}) {
  return (
    <div className="mb-2.5">
      <div className="mb-1.5 flex items-center gap-2">
        <span className="text-[11px] text-white/50">{label}</span>
        <div className="ml-auto flex items-center gap-1">
          {valor ? (
            <span className="rounded-md bg-black/40 px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-white/70">{valor}</span>
          ) : null}
          {acao}
        </div>
      </div>
      {children}
    </div>
  );
}

/* ---------------------------- card de preset --------------------------- */

export type PreviewAnim =
  | "fade"
  | "dissolve"
  | "slide"
  | "zoom"
  | "blur"
  | "whip"
  | "none";

export function PresetCard({
  nome,
  ativo,
  poster,
  filtro,
  anim,
  overlay,
  onClick,
  alto,
}: {
  nome: string;
  ativo?: boolean;
  poster?: string | null;
  /** filtro CSS aplicado na miniatura (preview real) */
  filtro?: string;
  /** animação demonstrada no hover */
  anim?: PreviewAnim;
  overlay?: ReactNode;
  onClick: () => void;
  alto?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`group relative overflow-hidden rounded-xl border text-left transition ${
        ativo
          ? "border-[#F26B1F] bg-[#F26B1F]/[0.08] shadow-[0_0_0_1px_#F26B1F55,0_10px_24px_-14px_#F26B1F]"
          : "border-white/[0.08] bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.06]"
      }`}
    >
      <div className={`relative overflow-hidden bg-black/50 ${alto ? "aspect-[3/4]" : "aspect-video"}`}>
        {poster ? (
          <img
            src={poster}
            alt=""
            style={{ filter: filtro }}
            className={`h-full w-full object-cover ${anim && anim !== "none" ? `ea-anim ea-${anim}` : ""}`}
          />
        ) : (
          <div
            style={{ filter: filtro }}
            className={`h-full w-full bg-[linear-gradient(135deg,#5a3a24,#8a5330_45%,#2c2118)] ${
              anim && anim !== "none" ? `ea-anim ea-${anim}` : ""
            }`}
          />
        )}
        {overlay}
        {ativo ? (
          <span className="absolute right-1.5 top-1.5 rounded-full bg-[#F26B1F] px-1.5 py-0.5 text-[9px] font-bold text-white">ativo</span>
        ) : null}
      </div>
      <div className="truncate px-2 py-1.5 text-[11px] text-white/75 group-hover:text-white">{nome}</div>
    </button>
  );
}

/** grade padrão de presets */
export function Grade({ children, cols = 2 }: { children: ReactNode; cols?: 2 | 3 }) {
  return <div className={`grid gap-2 ${cols === 3 ? "grid-cols-3" : "grid-cols-2"}`}>{children}</div>;
}

/** botão secundário compacto */
export function BotaoPill({
  children,
  onClick,
  ativo,
  className = "",
}: {
  children: ReactNode;
  onClick: () => void;
  ativo?: boolean;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-medium transition ${
        ativo ? "border-[#F26B1F] bg-[#F26B1F]/15 text-[#F26B1F]" : "border-white/10 bg-white/[0.04] text-white/70 hover:bg-white/10 hover:text-white"
      } ${className}`}
    >
      {children}
    </button>
  );
}

/** keyframes usados pelos previews — injetado uma vez */
export function EstilosPreview() {
  return (
    <style>{`
.ea-anim{animation-play-state:paused}
.group:hover .ea-anim{animation-play-state:running}
.ea-fade{animation:eaFade 1.6s ease-in-out infinite}
.ea-dissolve{animation:eaDissolve 1.8s ease-in-out infinite}
.ea-slide{animation:eaSlide 1.6s cubic-bezier(.22,1,.36,1) infinite}
.ea-zoom{animation:eaZoom 1.6s cubic-bezier(.22,1,.36,1) infinite}
.ea-blur{animation:eaBlurA 1.6s ease-in-out infinite}
.ea-whip{animation:eaWhip 1.1s cubic-bezier(.7,0,.3,1) infinite}
@keyframes eaFade{0%,100%{opacity:.15}50%{opacity:1}}
@keyframes eaDissolve{0%,100%{opacity:.2;filter:contrast(1.6)}50%{opacity:1;filter:none}}
@keyframes eaSlide{0%{transform:translateX(-100%)}45%,55%{transform:translateX(0)}100%{transform:translateX(100%)}}
@keyframes eaZoom{0%,100%{transform:scale(1.35);opacity:.3}50%{transform:scale(1);opacity:1}}
@keyframes eaBlurA{0%,100%{filter:blur(8px);opacity:.4}50%{filter:blur(0);opacity:1}}
@keyframes eaWhip{0%{transform:translateX(-60%) skewX(18deg);filter:blur(6px)}50%{transform:none;filter:none}100%{transform:translateX(60%) skewX(-18deg);filter:blur(6px)}}
`}</style>
  );
}
