import { posicionarMenu } from "@/lib/editair/layers";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Diamond,
  Film,
  Image as ImageIcon,
  Music,
  Loader2,
  Plus,
  Search,
  Send,
  Sparkles,
  Trash2,
  Upload,
  Wand2,
} from "lucide-react";
import { obterThumb } from "@/lib/editair/media";
import { Button } from "@/components/ui/button";
import { CaptionTemplates } from "@/components/editair/CaptionTemplates";
import { EfeitosGallery } from "@/components/editair/EfeitosGallery";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import {
  AJUSTES_NEUTROS,
  EFEITOS,
  FILTROS,
  FUNDO_PADRAO,
  FUNDO_PRESETS,
  TEXTO_PADRAO,
  TRANSICOES,
  type Ajustes,
  type Fundo,
  type CaptionStyle,
  type EditairClip,
  type KeyProp,
  type ProjectState,
  type TextStyle,
  type Transcript,
  formatarTempo,
} from "@/lib/editair/types";
import type { PlanoEditorial } from "@/lib/editair/plan";
import { PlanoEditorialPanel } from "./PlanoEditorialPanel";
import { StickersPanel } from "./StickersPanel";
import { ModelosPanel } from "./ModelosPanel";
import type { ModeloEditair } from "@/lib/editair/modelos";
import { filtroCss } from "@/lib/editair/engine";
import {
  PainelShell,
  Chips,
  Grade,
  Secao,
  LinhaValor,
  PresetCard,
  BotaoPill,
  Vazio,
  EstilosPreview,
  type PreviewAnim,
} from "./panel-kit";


export type Ferramenta =
  | "midia"
  | "audio"
  | "texto"
  | "stickers"
  | "efeitos"
  | "transicoes"
  | "legendas"
  | "filtros"
  | "ajuste"
  | "fundo"
  | "modelos"
  | "ia";

export type AssetItem = {
  id: string;
  nome: string;
  kind: string;
  durationMs: number;
  url: string;
  thumbUrl?: string | null;
  local?: boolean;
  existe?: boolean;
  localPath?: string | null;
};
export type MensagemIa = { id: string; autor: "usuario" | "ia"; texto: string; ops?: number };

export type ToolPanelProps = {
  ferramenta: Ferramenta;
  state: ProjectState;
  clip: EditairClip | null;
  assets: AssetItem[];
  transcript: Transcript | null;
  mensagens: MensagemIa[];
  pensando: boolean;
  playheadMs: number;
  plano: PlanoEditorial | null;
  etapaIa: string;
  onPlanejar: (objetivo: string) => void;
  onAplicarPlano: () => void;
  onAjustarPlano: (texto: string) => void;
  onDescartarPlano: () => void;
  onImportar: (files: FileList | null) => void;
  onRenomearAsset: (id: string, nome: string) => void;
  onExcluirAsset: (id: string) => void;
  onRelinkAsset?: (id: string) => void;
  onEditarComIaAsset?: (id: string) => void;
  onTranscreverAsset?: (id: string) => void;
  onRevelarAsset?: (id: string) => void;
  onInserirAsset: (id: string) => void;
  onPatchClip: (patch: Partial<EditairClip>) => void;
  onPatchState: (patch: Partial<ProjectState>) => void;
  onCaption: (patch: Partial<CaptionStyle>) => void;
  onAplicarModeloLegenda?: (estilo: CaptionStyle, escopo: "uma" | "todas") => void;
  onAdicionarTexto: (init?: { text?: string; style?: Partial<TextStyle>; label?: string }) => void;
  onAplicarModelo?: (modelo: ModeloEditair) => void;
  /** captura um frame do reprodutor para usar como capa de modelo */
  onCapturarCapa?: () => string | null;
  onAnalisar: () => void;
  onGerarLegendas: () => void;
  onCortarPausas: () => void;
  onSepararAudio: () => void;
  onNormalizar: () => void;
  onExtrairAudio: () => void;
  onKeyframe: (prop: KeyProp) => void;
  onEnviarIa: (texto: string) => void;
  onSeek: (ms: number) => void;
  /** roda uma demonstração do clipe atual no reprodutor (sem render) */
  onDemonstrarClip?: () => void;
  onApagarTrecho: (from: number, to: number) => void;
  fundoPronto?: boolean;
  fundoCarregando?: boolean;
};


const SUGESTOES = [
  "Tira todas as pausas e silêncios",
  "Coloca legenda em todo o vídeo",
  "Abaixa a música e sobe a minha voz",
  "Dá um zoom em mim aqui",
];

export function ToolPanel(p: ToolPanelProps) {
  switch (p.ferramenta) {
    case "midia":
      return <PainelMidia {...p} />;
    case "audio":
      return <PainelAudio {...p} />;
    case "texto":
      return <PainelTexto {...p} />;
    case "efeitos":
      return <PainelEfeitos {...p} />;
    case "transicoes":
      return <PainelTransicoes {...p} />;
    case "legendas":
      return <PainelLegendas {...p} />;
    case "filtros":
      return <PainelFiltros {...p} />;
    case "ajuste":
      return <PainelAjuste {...p} />;
    case "fundo":
      return <PainelFundo {...p} />;
    case "ia":
      return <PainelIa {...p} />;
    case "stickers":
      return <StickersPanel onInserir={(t, st, rot) => p.onAdicionarTexto({ text: t, style: st, label: rot })} />;
    default:
      return <ModelosPanel state={p.state} capa={p.onCapturarCapa} onAplicar={(m) => p.onAplicarModelo?.(m)} />;
  }
}


/* ------------------------------- Mídia ------------------------------- */

function MiniaturaAsset({ asset }: { asset: AssetItem }) {
  const [src, setSrc] = useState<string | null>(asset.thumbUrl ?? null);
  const [erro, setErro] = useState(false);

  useEffect(() => {
    let vivo = true;
    setSrc(asset.thumbUrl ?? null);
    setErro(false);
    if (asset.thumbUrl || asset.kind === "audio" || asset.existe === false || !asset.url) return;
    void obterThumb(asset.id, asset.url, 0, 96).then((d) => {
      if (!vivo) return;
      if (d) setSrc(d);
      else setErro(true);
    });
    return () => {
      vivo = false;
    };
  }, [asset.id, asset.url, asset.thumbUrl, asset.kind, asset.existe]);

  const Icone = asset.kind === "audio" ? Music : asset.kind === "image" ? ImageIcon : Film;
  return (
    <div className="flex h-10 w-16 shrink-0 items-center justify-center overflow-hidden rounded border border-white/10 bg-black/40">
      {src && !erro ? (
        <img src={src} alt="" className="h-full w-full object-cover" onError={() => setErro(true)} />
      ) : (
        <Icone className="h-4 w-4 text-white/40" />
      )}
    </div>
  );
}

function PainelMidia({
  assets,
  onImportar,
  onRenomearAsset,
  onExcluirAsset,
  onInserirAsset,
  onRelinkAsset,
  onEditarComIaAsset,
  onTranscreverAsset,
  onRevelarAsset,
  onExtrairAudio,
}: ToolPanelProps) {
  const [busca, setBusca] = useState("");
  const [menu, setMenu] = useState<{ x: number; y: number; id: string } | null>(null);
  const [renomeando, setRenomeando] = useState<string | null>(null);
  const [categoria, setCategoria] = useState<"todos" | "video" | "image" | "audio">("todos");
  const [ordem, setOrdem] = useState<"nome" | "duracao">("nome");

  const lista = useMemo(() => {
    let l = assets.filter((a) => a.nome.toLowerCase().includes(busca.toLowerCase()));
    if (categoria !== "todos") l = l.filter((a) => a.kind === categoria);
    return [...l].sort((a, b) => (ordem === "nome" ? a.nome.localeCompare(b.nome) : b.durationMs - a.durationMs));
  }, [assets, busca, categoria, ordem]);

  return (
    <Painel titulo="Mídia">
      <label
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          onImportar(e.dataTransfer.files);
        }}
        className="mb-3 flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-white/20 bg-[#1f8389]/15 py-3 text-xs font-semibold text-white transition hover:bg-[#1f8389]/25"
      >
        <Upload className="h-4 w-4" /> Importar mídia (ou arraste aqui)
        <input type="file" accept="video/*,audio/*,image/*" multiple hidden onChange={(e) => onImportar(e.target.files)} />
      </label>

      <div className="mb-2 flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/30" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Pesquisar"
            className="w-full rounded-lg border border-white/10 bg-white/5 py-1.5 pl-7 pr-2 text-[11px] outline-none"
          />
        </div>
        <select
          value={ordem}
          onChange={(e) => setOrdem(e.target.value as "nome" | "duracao")}
          className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-[11px] outline-none"
        >
          <option value="nome">Nome</option>
          <option value="duracao">Duração</option>
        </select>
      </div>

      <div className="mb-3 flex flex-wrap gap-1.5">
        {(
          [
            ["todos", "Todos"],
            ["video", "Vídeos"],
            ["image", "Imagens"],
            ["audio", "Áudios"],
          ] as const
        ).map(([v, l]) => (
          <button
            key={v}
            onClick={() => setCategoria(v)}
            className={`rounded-md border px-2.5 py-1 text-[11px] transition ${
              categoria === v ? "border-[#F26B1F] bg-[#F26B1F]/15 text-white" : "border-white/10 text-white/60 hover:bg-white/5"
            }`}
          >
            {l}
          </button>
        ))}
      </div>

      {lista.length === 0 ? (
        <p className="text-[11px] text-white/35">Nenhuma mídia. Importe um vídeo para começar.</p>
      ) : (
        <div className="space-y-2">
          {lista.map((a) => (
            <div
              key={a.id}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData("application/x-editair-asset", a.id);
                e.dataTransfer.setData("text/plain", a.id);
                e.dataTransfer.effectAllowed = "copy";
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                setMenu({ x: e.clientX, y: e.clientY, id: a.id });
              }}
              className="rounded-lg border border-white/10 bg-white/[0.03] p-2"
            >
              {a.existe === false ? (
                <button
                  onClick={() => onRelinkAsset?.(a.id)}
                  className="mb-1.5 w-full rounded bg-red-600/80 px-2 py-1 text-[10px] font-medium text-white"
                >
                  Mídia offline — localizar arquivo
                </button>
              ) : null}
              <div className="flex items-center gap-2">
                <MiniaturaAsset asset={a} />
                <div className="min-w-0 flex-1">
                  {renomeando === a.id ? (
                    <input
                      autoFocus
                      defaultValue={a.nome}
                      onBlur={(e) => {
                        const n = e.target.value.trim();
                        if (n && n !== a.nome) onRenomearAsset(a.id, n);
                        setRenomeando(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") e.currentTarget.blur();
                        if (e.key === "Escape") setRenomeando(null);
                      }}
                      className="w-full rounded bg-black/40 px-1 py-0.5 text-[11px] text-white outline-none"
                    />
                  ) : (
                    <p className="truncate text-[11px]">{a.nome}</p>
                  )}
                  <p className="text-[10px] uppercase text-white/35">
                    {a.kind === "video" ? "Vídeo" : a.kind === "audio" ? "Áudio" : "Imagem"}
                    {a.existe === false ? " · offline" : ""}
                  </p>
                </div>
                <span className="ml-auto shrink-0 text-[10px] text-white/35">{formatarTempo(a.durationMs)}</span>
              </div>
              <div className="mt-1.5 flex gap-1">
                <button
                  onClick={() => onInserirAsset(a.id)}
                  className="rounded border border-white/10 px-2 py-0.5 text-[10px] hover:bg-white/10"
                >
                  <Plus className="mr-0.5 inline h-3 w-3" />
                  Inserir
                </button>
                <button
                  onClick={() => setRenomeando(a.id)}
                  className="rounded border border-white/10 px-2 py-0.5 text-[10px] hover:bg-white/10"
                >
                  Renomear
                </button>
                <button
                  onClick={() => onExcluirAsset(a.id)}
                  className="ml-auto rounded border border-white/10 px-2 py-0.5 text-[10px] text-red-400 hover:bg-red-500/10"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {menu ? (
        <MenuFlutuante x={menu.x} y={menu.y} onFechar={() => setMenu(null)}>
          {([
            { nome: "Abrir no editor", acao: () => onInserirAsset(menu.id) },
            { nome: "Adicionar à timeline", acao: () => onInserirAsset(menu.id) },
            onEditarComIaAsset ? { nome: "✨ Editar com IA", acao: () => onEditarComIaAsset(menu.id), destaque: true } : null,
            onTranscreverAsset ? { nome: "Transcrever", acao: () => onTranscreverAsset(menu.id) } : null,
            { nome: "Extrair áudio", acao: () => onExtrairAudio() },
            onRevelarAsset ? { nome: "Mostrar no Finder", acao: () => onRevelarAsset(menu.id) } : null,
            assets.find((a) => a.id === menu.id)?.existe === false && onRelinkAsset
              ? { nome: "Relinkar arquivo", acao: () => onRelinkAsset(menu.id) }
              : null,
            { nome: "Renomear", acao: () => setRenomeando(menu.id) },
            { nome: "Remover da Biblioteca", acao: () => onExcluirAsset(menu.id), perigo: true },
          ] as Array<{ nome: string; acao: () => void; destaque?: boolean; perigo?: boolean } | null>)
            .filter((i): i is { nome: string; acao: () => void; destaque?: boolean; perigo?: boolean } => !!i)
            .map((i) => (
              <button
                key={i.nome}
                onClick={() => {
                  i.acao();
                  setMenu(null);
                }}
                className={`block w-full px-3 py-2 text-left hover:bg-white/10 ${
                  i.destaque ? "font-medium text-[#F26B1F]" : i.perigo ? "text-red-400 hover:bg-red-500/10" : ""
                }`}
              >
                {i.nome}
              </button>
            ))}
        </MenuFlutuante>
      ) : null}
    </Painel>
  );
}

/** Menu flutuante com collision detection (flip/shift) para nunca sair da viewport. */
function MenuFlutuante({
  x,
  y,
  onFechar,
  children,
}: {
  x: number;
  y: number;
  onFechar: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos(posicionarMenu(x, y, r.width, r.height, window.innerWidth, window.innerHeight));
  }, [x, y]);

  useEffect(() => {
    const fechar = () => onFechar();
    window.addEventListener("pointerdown", fechar);
    return () => window.removeEventListener("pointerdown", fechar);
  }, [onFechar]);

  return (
    <div
      ref={ref}
      onPointerDown={(e) => e.stopPropagation()}
      style={{ left: pos?.x ?? x, top: pos?.y ?? y, visibility: pos ? "visible" : "hidden" }}
      className="fixed z-[70] flex max-h-[calc(100vh-16px)] w-56 flex-col overflow-y-auto overscroll-contain rounded-xl border border-white/10 bg-[#12171d] py-1 text-[12px] shadow-2xl"
    >
      {children}
    </div>
  );
}

/* ------------------------------- Áudio ------------------------------- */

function PainelAudio({ state, clip, onPatchClip, onPatchState, onSepararAudio, onNormalizar, onExtrairAudio, onKeyframe }: ToolPanelProps) {
  return (
    <Painel titulo="Áudio">
      {clip ? (
        <>
          <Campo label={`Volume — ${Math.round(clip.volume * 100)}%`} keyProp="volume" onKeyframe={onKeyframe}>
            <Slider value={[clip.volume * 100]} min={0} max={200} step={1} onValueChange={([v]) => onPatchClip({ volume: v / 100 })} />
          </Campo>
          <Campo label={`Fade in — ${clip.fadeInMs ?? 0} ms`}>
            <Slider value={[clip.fadeInMs ?? 0]} min={0} max={4000} step={50} onValueChange={([v]) => onPatchClip({ fadeInMs: v })} />
          </Campo>
          <Campo label={`Fade out — ${clip.fadeOutMs ?? 0} ms`}>
            <Slider value={[clip.fadeOutMs ?? 0]} min={0} max={4000} step={50} onValueChange={([v]) => onPatchClip({ fadeOutMs: v })} />
          </Campo>
          <Campo label={`Velocidade — ${clip.speed.toFixed(2)}x`}>
            <Slider value={[clip.speed * 100]} min={50} max={300} step={5} onValueChange={([v]) => onPatchClip({ speed: v / 100 })} />
          </Campo>
          <label className="my-2 flex cursor-pointer items-center gap-2 text-xs text-white/70">
            <input type="checkbox" checked={!!clip.muted} onChange={(e) => onPatchClip({ muted: e.target.checked })} className="accent-[#F26B1F]" />
            Silenciar este clipe
          </label>
          <div className="flex flex-wrap gap-1.5 py-2">
            <BotaoSec onClick={onNormalizar}>Normalizar</BotaoSec>
            <BotaoSec onClick={onSepararAudio}>Separar áudio</BotaoSec>
            <BotaoSec onClick={onExtrairAudio}>Extrair áudio</BotaoSec>
          </div>
        </>
      ) : (
        <p className="mb-3 text-[11px] text-white/35">Selecione um clipe para ajustar volume, fades e velocidade.</p>
      )}

      <div className="mt-3 space-y-2 border-t border-white/10 pt-3">
        <p className="text-xs font-medium text-white/60">Processamento do projeto</p>
        <label className="flex cursor-pointer items-center gap-2 text-xs text-white/70">
          <input
            type="checkbox"
            checked={!!state.audioFx?.voz}
            onChange={(e) => onPatchState({ audioFx: { voz: e.target.checked, ruido: !!state.audioFx?.ruido } })}
            className="accent-[#F26B1F]"
          />
          Melhorar voz (compressor + corte de graves)
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-xs text-white/70">
          <input
            type="checkbox"
            checked={!!state.audioFx?.ruido}
            onChange={(e) => onPatchState({ audioFx: { voz: !!state.audioFx?.voz, ruido: e.target.checked } })}
            className="accent-[#F26B1F]"
          />
          Redução de ruído (filtro de graves)
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-xs text-white/70">
          <input
            type="checkbox"
            checked={!!state.ducking?.ativo}
            onChange={(e) => onPatchState({ ducking: { ativo: e.target.checked, reducao: state.ducking?.reducao ?? 70 } })}
            className="accent-[#F26B1F]"
          />
          Ducking — abaixar música na voz
        </label>
        {state.ducking?.ativo ? (
          <Campo label={`Redução — ${state.ducking.reducao}%`}>
            <Slider
              value={[state.ducking.reducao]}
              min={10}
              max={95}
              step={5}
              onValueChange={([v]) => onPatchState({ ducking: { ativo: true, reducao: v } })}
            />
          </Campo>
        ) : null}
      </div>
    </Painel>
  );
}

/* ------------------------------- Texto ------------------------------- */

function PainelTexto({ clip, onAdicionarTexto, onPatchClip, onKeyframe }: ToolPanelProps) {
  const st: TextStyle = { ...TEXTO_PADRAO, ...(clip?.textStyle ?? {}) };
  const patchStyle = (patch: Partial<TextStyle>) => onPatchClip({ textStyle: { ...st, ...patch } });
  const eTexto = clip?.kind === "text";

  return (
    <Painel titulo="Texto">
      <Button size="sm" className="mb-3 w-full bg-[#F26B1F] text-xs hover:bg-[#d95c14]" onClick={() => onAdicionarTexto()}>
        <Plus className="mr-1 h-3.5 w-3.5" /> Adicionar texto no playhead
      </Button>
      {!eTexto ? (
        <p className="text-[11px] text-white/35">Selecione um clipe de texto na timeline para editar as propriedades.</p>
      ) : (
        <>
          <Campo label="Conteúdo">
            <textarea
              value={clip?.text ?? ""}
              onChange={(e) => onPatchClip({ text: e.target.value })}
              rows={3}
              className="w-full resize-none rounded-lg border border-white/10 bg-white/5 p-2 text-xs outline-none focus:border-[#F26B1F]/60"
            />
          </Campo>
          <Campo label="Fonte">
            <select
              value={st.fontFamily}
              onChange={(e) => patchStyle({ fontFamily: e.target.value })}
              className="w-full rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-xs outline-none"
            >
              <option value="Inter, system-ui, sans-serif">Inter</option>
              <option value="Georgia, serif">Georgia</option>
              <option value="Impact, sans-serif">Impact</option>
              <option value="'Courier New', monospace">Courier</option>
              <option value="'Trebuchet MS', sans-serif">Trebuchet</option>
            </select>
          </Campo>
          <Campo label={`Tamanho — ${st.fontSize}px`}>
            <Slider value={[st.fontSize]} min={24} max={220} step={2} onValueChange={([v]) => patchStyle({ fontSize: v })} />
          </Campo>
          <Campo label={`Peso — ${st.weight}`}>
            <Slider value={[st.weight]} min={300} max={900} step={100} onValueChange={([v]) => patchStyle({ weight: v })} />
          </Campo>
          <div className="grid grid-cols-2 gap-2">
            <Campo label="Cor">
              <input type="color" value={st.color} onChange={(e) => patchStyle({ color: e.target.value })} className="h-8 w-full rounded border border-white/10 bg-transparent" />
            </Campo>
            <Campo label="Contorno">
              <input type="color" value={st.strokeColor} onChange={(e) => patchStyle({ strokeColor: e.target.value })} className="h-8 w-full rounded border border-white/10 bg-transparent" />
            </Campo>
          </div>
          <Campo label={`Espessura do contorno — ${st.stroke}`}>
            <Slider value={[st.stroke]} min={0} max={30} step={1} onValueChange={([v]) => patchStyle({ stroke: v })} />
          </Campo>
          <Campo label={`Sombra — ${st.shadow}`}>
            <Slider value={[st.shadow]} min={0} max={40} step={1} onValueChange={([v]) => patchStyle({ shadow: v })} />
          </Campo>
          <Campo label="Alinhamento">
            <div className="flex gap-1.5">
              {(["left", "center", "right"] as const).map((a) => (
                <button
                  key={a}
                  onClick={() => patchStyle({ align: a })}
                  className={`flex-1 rounded border px-2 py-1 text-[11px] ${st.align === a ? "border-[#F26B1F] bg-[#F26B1F]/15" : "border-white/10 text-white/60"}`}
                >
                  {a === "left" ? "Esq." : a === "center" ? "Centro" : "Dir."}
                </button>
              ))}
            </div>
          </Campo>
          <Campo label="Fundo">
            <select
              value={st.background}
              onChange={(e) => patchStyle({ background: e.target.value as TextStyle["background"] })}
              className="w-full rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-xs outline-none"
            >
              <option value="none">Sem fundo</option>
              <option value="box">Caixa sólida</option>
              <option value="soft">Caixa suave</option>
            </select>
          </Campo>
          <Campo label="Animação">
            <select
              value={st.animacao}
              onChange={(e) => patchStyle({ animacao: e.target.value as TextStyle["animacao"] })}
              className="w-full rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-xs outline-none"
            >
              <option value="nenhuma">Nenhuma</option>
              <option value="fade">Fade</option>
              <option value="pop">Pop</option>
              <option value="subir">Subir</option>
              <option value="digitar">Digitar</option>
            </select>
          </Campo>
          <TransformCampos clip={clip} onPatchClip={onPatchClip} onKeyframe={onKeyframe} />
        </>
      )}
    </Painel>
  );
}

/* ------------------------------ Fundo ------------------------------ */

const MODOS: { id: Fundo["modo"]; nome: string }[] = [
  { id: "nenhum", nome: "Original" },
  { id: "desfoque", nome: "Desfocar" },
  { id: "cor", nome: "Cor sólida" },
  { id: "midia", nome: "Mídia" },
  { id: "remover", nome: "Remover" },
];

function PainelFundo({ clip, assets, onPatchClip, onKeyframe, fundoPronto, fundoCarregando }: ToolPanelProps) {
  const f: Fundo = { ...FUNDO_PADRAO, ...(clip?.fundo ?? {}) };
  const set = (patch: Partial<Fundo>) => {
    const proximo: Fundo = { ...f, ...patch };
    onPatchClip({ fundo: proximo.modo === "nenhum" ? undefined : proximo });
  };

  const poster = assets.find((a) => a.id === clip?.assetId)?.thumbUrl ?? null;

  if (!clip || (clip.kind !== "video" && clip.kind !== "image")) {
    return (
      <PainelShell titulo="Fundo">
        <Vazio>Selecione um clipe de vídeo para tratar o fundo.</Vazio>
      </PainelShell>
    );
  }

  return (
    <PainelShell titulo="Fundo" contagem={f.modo === "nenhum" ? "original" : MODOS.find((m) => m.id === f.modo)?.nome}>
      <Grade cols={2}>
        {FUNDO_PRESETS.map((pr) => (
          <PresetCard
            key={pr.id}
            nome={pr.nome}
            poster={poster}
            filtro={pr.patch.desfoque ? `blur(${Math.round((pr.patch.desfoque / 100) * 6)}px)` : undefined}
            onClick={() => set(pr.patch)}
          />
        ))}
      </Grade>

      <div className="mt-3">
        <Chips itens={MODOS.map((m) => ({ id: m.id, nome: m.nome }))} valor={f.modo} onChange={(v) => set({ modo: v })} />
      </div>

      {f.modo !== "nenhum" ? (
        <>
          <Secao titulo="Aparência">
            {f.modo === "desfoque" || f.modo === "midia" ? (
              <LinhaValor
                label="Desfoque"
                valor={`${f.desfoque}%`}
                acao={
                  <button
                    title="Keyframe no desfoque"
                    onClick={() => onKeyframe("fundoBlur")}
                    className="rounded p-0.5 text-white/40 transition hover:bg-white/10 hover:text-[#F26B1F]"
                  >
                    <Diamond className="h-3 w-3" />
                  </button>
                }
              >
                <Slider value={[f.desfoque]} min={0} max={100} step={5} onValueChange={([v]) => set({ desfoque: v })} />
              </LinhaValor>
            ) : null}

            {f.modo === "cor" ? (
              <LinhaValor label="Cor do fundo" valor={f.cor.toUpperCase()}>
                <input
                  type="color"
                  value={f.cor}
                  onChange={(e) => set({ cor: e.target.value })}
                  className="h-8 w-full cursor-pointer rounded-lg border border-white/10 bg-transparent"
                />
              </LinhaValor>
            ) : null}

            {f.modo === "midia" ? (
              <LinhaValor label="Mídia de fundo">
                <select
                  value={f.assetId ?? ""}
                  onChange={(e) => set({ assetId: e.target.value || undefined })}
                  className="w-full rounded-lg border border-white/10 bg-black/40 px-2 py-1.5 text-xs outline-none"
                >
                  <option value="">Selecione…</option>
                  {assets.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.nome}
                    </option>
                  ))}
                </select>
              </LinhaValor>
            ) : null}
          </Secao>

          <Secao titulo="Recorte">
            <LinhaValor label="Suavidade da borda" valor={`${f.suavidade}%`}>
              <Slider value={[f.suavidade]} min={0} max={100} step={5} onValueChange={([v]) => set({ suavidade: v })} />
            </LinhaValor>
            <LinhaValor label="Expandir / contrair" valor={`${f.borda > 0 ? "+" : ""}${f.borda}`}>
              <Slider value={[f.borda]} min={-50} max={50} step={1} onValueChange={([v]) => set({ borda: v })} />
            </LinhaValor>
            <LinhaValor label="Estabilidade da máscara" valor={`${f.estabilidade}%`}>
              <Slider value={[f.estabilidade]} min={0} max={95} step={5} onValueChange={([v]) => set({ estabilidade: v })} />
            </LinhaValor>
            <div className="flex gap-1.5">
              {(["rapida", "alta"] as const).map((q) => (
                <BotaoPill key={q} ativo={f.qualidade === q} onClick={() => set({ qualidade: q })} className="flex-1">
                  {q === "rapida" ? "Rápida (preview)" : "Alta (render)"}
                </BotaoPill>
              ))}
            </div>
          </Secao>

          <Secao titulo="Contorno" aberta={!!f.contorno?.ativo}>
            <label className="flex cursor-pointer items-center gap-2 text-[11px] text-white/60">
              <input
                type="checkbox"
                className="accent-[#F26B1F]"
                checked={!!f.contorno?.ativo}
                onChange={(e) =>
                  set({ contorno: { cor: f.contorno?.cor ?? "#FFFFFF", largura: f.contorno?.largura ?? 4, ativo: e.target.checked } })
                }
              />
              Contorno suave na pessoa
            </label>
            {f.contorno?.ativo ? (
              <>
                <LinhaValor label="Largura" valor={`${f.contorno.largura}px`}>
                  <Slider
                    value={[f.contorno.largura]}
                    min={1}
                    max={20}
                    step={1}
                    onValueChange={([v]) => set({ contorno: { ...f.contorno!, largura: v } })}
                  />
                </LinhaValor>
                <LinhaValor label="Cor do contorno" valor={(f.contorno.cor ?? "#FFFFFF").toUpperCase()}>
                  <input
                    type="color"
                    value={f.contorno.cor ?? "#FFFFFF"}
                    onChange={(e) => set({ contorno: { ...f.contorno!, cor: e.target.value } })}
                    className="h-8 w-full cursor-pointer rounded-lg border border-white/10 bg-transparent"
                  />
                </LinhaValor>
              </>
            ) : null}
          </Secao>

          <p className="px-1 pt-1 text-[10px] leading-relaxed text-white/35">
            {fundoCarregando
              ? "Carregando o modelo de segmentação…"
              : fundoPronto
                ? "Segmentação ativa — o áudio e o tempo do clipe não são alterados."
                : "A segmentação inicia automaticamente ao aplicar o fundo."}
          </p>
        </>
      ) : null}
    </PainelShell>
  );
}


/* ------------------------------ Efeitos ------------------------------ */

function PainelEfeitos({ clip, assets, onPatchClip, onDemonstrarClip }: ToolPanelProps) {
  const poster = assets.find((a) => a.id === clip?.assetId)?.thumbUrl ?? undefined;
  return (
    <Painel titulo="Animação e efeitos">
      {!clip ? (
        <p className="text-[11px] text-white/35">Selecione um clipe para aplicar um efeito.</p>
      ) : (
        <EfeitosGallery
          key={clip.id}
          efeitos={clip.efeitos}
          poster={poster}
          onDemonstrar={onDemonstrarClip}
          onPrevia={(ef) => onPatchClip({ efeitos: ef })}
          onAplicar={(ef) => onPatchClip({ efeitos: ef, efeito: undefined })}
        />
      )}
    </Painel>
  );
}

/* ---------------------------- Transições ----------------------------- */

function PainelTransicoes({ clip, assets, onPatchClip }: ToolPanelProps) {
  const dur = clip?.transicao?.durationMs ?? 500;
  const poster = assets.find((a) => a.id === clip?.assetId)?.thumbUrl ?? null;

  if (!clip) {
    return (
      <PainelShell titulo="Transições">
        <Vazio>Selecione o clipe de destino — a transição é aplicada na entrada dele.</Vazio>
      </PainelShell>
    );
  }

  return (
    <PainelShell titulo="Transições" contagem={`${TRANSICOES.length} presets`}>
      <EstilosPreview />
      <p className="mb-2 text-[10px] text-white/35">Passe o mouse no card para ver a transição rodando.</p>
      <Grade cols={2}>
        <PresetCard
          nome="Nenhuma"
          ativo={!clip.transicao}
          poster={poster}
          onClick={() => onPatchClip({ transicao: undefined })}
        />
        {TRANSICOES.map((t) => (
          <PresetCard
            key={t.id}
            nome={t.nome}
            ativo={clip.transicao?.tipo === t.id}
            poster={poster}
            anim={t.id as PreviewAnim}
            onClick={() => onPatchClip({ transicao: { tipo: t.id, durationMs: dur } })}
          />
        ))}
      </Grade>

      {clip.transicao ? (
        <div className="mt-3">
          <LinhaValor label="Duração" valor={`${dur} ms`}>
            <Slider
              value={[dur]}
              min={100}
              max={2000}
              step={50}
              onValueChange={([v]) => onPatchClip({ transicao: { tipo: clip.transicao!.tipo, durationMs: v } })}
            />
          </LinhaValor>
          <div className="flex gap-1.5">
            {[300, 500, 800, 1200].map((v) => (
              <BotaoPill
                key={v}
                ativo={dur === v}
                onClick={() => onPatchClip({ transicao: { tipo: clip.transicao!.tipo, durationMs: v } })}
              >
                {v} ms
              </BotaoPill>
            ))}
          </div>
        </div>
      ) : null}
    </PainelShell>
  );
}


/* ----------------------------- Legendas ------------------------------ */

function PainelLegendas({
  state,
  clip,
  onAplicarModeloLegenda,
  transcript,
  onAnalisar,
  onGerarLegendas,
  onCaption,
  onSeek,
  onApagarTrecho,
  playheadMs,
}: ToolPanelProps) {
  const cs = state.captionStyle;
  const [sel, setSel] = useState<{ a: number; b: number } | null>(null);
  const palavras = transcript?.words ?? [];
  const intervalo = sel
    ? { a: Math.min(sel.a, sel.b), b: Math.max(sel.a, sel.b) }
    : null;

  return (
    <Painel titulo="Legendas">
      <div className="mb-3 flex gap-2">
        <BotaoSec onClick={onAnalisar}>Transcrever</BotaoSec>
        <BotaoSec onClick={onGerarLegendas}>Gerar legendas</BotaoSec>
      </div>

      <CaptionTemplates
        atual={{ ...cs, ...(clip?.kind === "caption" ? clip.captionStyle ?? {} : {}) }}
        temSelecao={clip?.kind === "caption"}
        onAplicar={(estilo, escopo) =>
          onAplicarModeloLegenda ? onAplicarModeloLegenda(estilo, escopo) : onCaption(estilo)
        }
      />

      <Campo label={`Tamanho — ${cs.fontSize}px`}>
        <Slider value={[cs.fontSize]} min={28} max={140} step={2} onValueChange={([v]) => onCaption({ fontSize: v })} />
      </Campo>
      <Campo label={`Altura na tela — ${Math.round(cs.y * 100)}%`}>
        <Slider value={[cs.y * 100]} min={10} max={95} step={1} onValueChange={([v]) => onCaption({ y: v / 100 })} />
      </Campo>
      <Campo label="Fonte">
        <select
          value={cs.fontFamily}
          onChange={(e) => onCaption({ fontFamily: e.target.value })}
          className="w-full rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-xs outline-none"
        >
          <option value="Inter, system-ui, sans-serif">Inter</option>
          <option value="Impact, sans-serif">Impact</option>
          <option value="Georgia, serif">Georgia</option>
          <option value="'Trebuchet MS', sans-serif">Trebuchet</option>
        </select>
      </Campo>
      <div className="grid grid-cols-2 gap-2">
        <Campo label="Cor">
          <input type="color" value={cs.color} onChange={(e) => onCaption({ color: e.target.value })} className="h-8 w-full rounded border border-white/10 bg-transparent" />
        </Campo>
        <Campo label="Palavra ativa">
          <input type="color" value={cs.activeColor} onChange={(e) => onCaption({ activeColor: e.target.value })} className="h-8 w-full rounded border border-white/10 bg-transparent" />
        </Campo>
      </div>
      <Campo label="Animação">
        <select
          value={cs.animacao}
          onChange={(e) => onCaption({ animacao: e.target.value as CaptionStyle["animacao"] })}
          className="w-full rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-xs outline-none"
        >
          <option value="nenhuma">Nenhuma</option>
          <option value="fade">Fade</option>
          <option value="pop">Pop</option>
          <option value="subir">Subir</option>
        </select>
      </Campo>
      <label className="my-2 flex cursor-pointer items-center gap-2 text-xs text-white/70">
        <input type="checkbox" checked={cs.karaoke} onChange={(e) => onCaption({ karaoke: e.target.checked })} className="accent-[#F26B1F]" />
        Destaque palavra a palavra (karaokê)
      </label>
      <label className="mb-3 flex cursor-pointer items-center gap-2 text-xs text-white/70">
        <input type="checkbox" checked={cs.uppercase} onChange={(e) => onCaption({ uppercase: e.target.checked })} className="accent-[#F26B1F]" />
        MAIÚSCULAS
      </label>

      <div className="border-t border-white/10 pt-3">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-medium text-white/60">Transcrição</p>
          {intervalo && palavras.length ? (
            <button
              onClick={() => {
                onApagarTrecho(palavras[intervalo.a].start, palavras[intervalo.b].end);
                setSel(null);
              }}
              className="text-[11px] text-red-400 hover:underline"
            >
              apagar trecho
            </button>
          ) : null}
        </div>
        {palavras.length ? (
          <div className="max-h-64 overflow-y-auto text-sm leading-7">
            {palavras.map((w, i) => {
              const ativa = playheadMs >= w.start && playheadMs < w.end;
              const dentro = intervalo != null && i >= intervalo.a && i <= intervalo.b;
              return (
                <span
                  key={`${i}-${w.start}`}
                  onMouseDown={() => setSel({ a: i, b: i })}
                  onMouseEnter={(e) => {
                    if (e.buttons === 1) setSel((c) => (c ? { ...c, b: i } : { a: i, b: i }));
                  }}
                  onClick={() => onSeek(w.start)}
                  className={`cursor-pointer rounded px-0.5 ${
                    dentro ? "bg-red-500/30 text-white" : ativa ? "bg-[#F26B1F] text-white" : "text-white/70 hover:bg-white/10"
                  }`}
                >
                  {w.w}{" "}
                </span>
              );
            })}
          </div>
        ) : (
          <p className="text-[11px] text-white/35">Clique em “Transcrever” para liberar a edição por texto.</p>
        )}
      </div>
    </Painel>
  );
}

/* ------------------------------ Filtros ------------------------------ */

function PainelFiltros({ clip, assets, onPatchClip }: ToolPanelProps) {
  const poster = assets.find((a) => a.id === clip?.assetId)?.thumbUrl ?? null;
  const atual = clip?.filtro?.id ?? "nenhum";
  const intensidade = clip?.filtro?.intensidade ?? 100;

  if (!clip || (clip.kind !== "video" && clip.kind !== "image")) {
    return (
      <PainelShell titulo="Filtros">
        <Vazio>Selecione um clipe de vídeo ou imagem para aplicar um filtro.</Vazio>
      </PainelShell>
    );
  }

  return (
    <PainelShell titulo="Filtros" contagem={`${FILTROS.length - 1} presets`}>
      <Grade cols={2}>
        {FILTROS.map((f) => (
          <PresetCard
            key={f.id}
            nome={f.nome}
            ativo={atual === f.id}
            poster={poster}
            filtro={filtroCss(clip.ajustes, f.id === "nenhum" ? undefined : { id: f.id, intensidade })}
            onClick={() =>
              onPatchClip({ filtro: f.id === "nenhum" ? undefined : { id: f.id, intensidade } })
            }
          />
        ))}
      </Grade>

      {clip.filtro ? (
        <div className="mt-3">
          <LinhaValor label="Intensidade" valor={`${clip.filtro.intensidade}%`}>
            <Slider
              value={[clip.filtro.intensidade]}
              min={5}
              max={100}
              step={5}
              onValueChange={([v]) => onPatchClip({ filtro: { id: clip.filtro!.id, intensidade: v } })}
            />
          </LinhaValor>
        </div>
      ) : null}
    </PainelShell>
  );
}


/* ------------------------------ Ajustes ------------------------------ */

const CAMPOS_AJUSTE: { k: keyof Ajustes; l: string }[] = [
  { k: "exposicao", l: "Exposição" },
  { k: "brilho", l: "Brilho" },
  { k: "contraste", l: "Contraste" },
  { k: "saturacao", l: "Saturação" },
  { k: "temperatura", l: "Temperatura" },
  { k: "tint", l: "Tint" },
  { k: "highlights", l: "Highlights" },
  { k: "shadows", l: "Shadows" },
  { k: "whites", l: "Whites" },
  { k: "blacks", l: "Blacks" },
];

const GRUPOS_AJUSTE: { titulo: string; campos: (keyof Ajustes)[] }[] = [
  { titulo: "Luz", campos: ["exposicao", "brilho", "contraste", "highlights", "shadows", "whites", "blacks"] },
  { titulo: "Cor", campos: ["saturacao", "temperatura", "tint"] },
];

function PainelAjuste({ clip, assets, onPatchClip, onKeyframe }: ToolPanelProps) {
  const aj: Ajustes = { ...AJUSTES_NEUTROS, ...(clip?.ajustes ?? {}) };
  const poster = assets.find((a) => a.id === clip?.assetId)?.thumbUrl ?? null;
  const alterado = CAMPOS_AJUSTE.some((c) => aj[c.k] !== 0);

  if (!clip) {
    return (
      <PainelShell titulo="Ajuste">
        <Vazio>Selecione um clipe na timeline para ajustar luz e cor.</Vazio>
      </PainelShell>
    );
  }

  return (
    <PainelShell
      titulo="Ajuste"
      contagem={alterado ? "editado" : "neutro"}
      acoes={<BotaoPill onClick={() => onPatchClip({ ajustes: { ...AJUSTES_NEUTROS } })}>Redefinir</BotaoPill>}
    >
      <div className="mb-3 overflow-hidden rounded-xl border border-white/[0.08] bg-black/40">
        <div className="relative aspect-video">
          {poster ? (
            <img src={poster} alt="" style={{ filter: filtroCss(aj, clip.filtro) }} className="h-full w-full object-cover" />
          ) : (
            <div style={{ filter: filtroCss(aj, clip.filtro) }} className="h-full w-full bg-[linear-gradient(135deg,#5a3a24,#8a5330_45%,#2c2118)]" />
          )}
          <span className="absolute bottom-1.5 left-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[9px] text-white/70">prévia</span>
        </div>
      </div>

      {GRUPOS_AJUSTE.map((g) => (
        <Secao key={g.titulo} titulo={g.titulo}>
          {g.campos.map((k) => {
            const label = CAMPOS_AJUSTE.find((c) => c.k === k)?.l ?? k;
            return (
              <LinhaValor key={k} label={label} valor={`${aj[k] > 0 ? "+" : ""}${aj[k]}`}>
                <Slider
                  value={[aj[k]]}
                  min={-100}
                  max={100}
                  step={1}
                  onValueChange={([v]) => onPatchClip({ ajustes: { ...aj, [k]: v } })}
                />
              </LinhaValor>
            );
          })}
        </Secao>
      ))}

      <Secao titulo="Transformar" aberta={false}>
        <TransformCampos clip={clip} onPatchClip={onPatchClip} onKeyframe={onKeyframe} />
      </Secao>
    </PainelShell>
  );
}


/* --------------------------------- IA -------------------------------- */

function PainelIa({
  mensagens,
  pensando,
  onEnviarIa,
  onCortarPausas,
  onGerarLegendas,
  onAnalisar,
  plano,
  etapaIa,
  onPlanejar,
  onAplicarPlano,
  onAjustarPlano,
  onDescartarPlano,
  onSeek,
}: ToolPanelProps) {
  const [texto, setTexto] = useState("");
  const enviar = () => {
    const t = texto.trim();
    if (!t || pensando) return;
    setTexto("");
    onEnviarIa(t);
  };
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
        <Sparkles className="h-4 w-4 text-[#F26B1F]" />
        <span className="text-sm font-medium">EditAir IA</span>
      </div>
      <div className="flex flex-wrap gap-1.5 border-b border-white/10 p-3">
        <BotaoSec onClick={onAnalisar}>
          <Wand2 className="mr-1 inline h-3 w-3" /> Transcrever
        </BotaoSec>
        <BotaoSec onClick={onCortarPausas}>Cortar pausas</BotaoSec>
        <BotaoSec onClick={onGerarLegendas}>Legendar</BotaoSec>
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        <PlanoEditorialPanel
          plano={plano}
          pensando={pensando}
          etapa={etapaIa}
          onPlanejar={onPlanejar}
          onAplicar={onAplicarPlano}
          onAjustar={onAjustarPlano}
          onDescartar={onDescartarPlano}
          onSeek={onSeek}
        />

        {mensagens.length === 0 ? (
          <div className="space-y-2">
            <p className="text-xs text-white/40">Fale como você falaria com um editor:</p>
            {SUGESTOES.map((s) => (
              <button
                key={s}
                onClick={() => onEnviarIa(s)}
                className="block w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-left text-xs text-white/70 transition hover:border-[#F26B1F]/50 hover:text-white"
              >
                {s}
              </button>
            ))}
          </div>
        ) : (
          mensagens.map((m) => (
            <div
              key={m.id}
              className={`max-w-[92%] rounded-2xl px-3 py-2 text-xs leading-relaxed ${
                m.autor === "usuario" ? "ml-auto bg-[#F26B1F] text-white" : "bg-white/[0.06] text-white/80"
              }`}
            >
              {m.texto}
              {m.ops ? <span className="mt-1 block text-[10px] opacity-60">{m.ops} operação(ões) aplicada(s)</span> : null}
            </div>
          ))
        )}
        {pensando ? (
          <div className="flex items-center gap-2 text-xs text-white/40">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> pensando…
          </div>
        ) : null}
      </div>
      <div className="border-t border-white/10 p-3">
        <div className="flex items-end gap-2">
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                enviar();
              }
            }}
            rows={2}
            placeholder="Ex.: abaixa a música e corta aqui"
            className="min-h-[44px] flex-1 resize-none rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs outline-none placeholder:text-white/30 focus:border-[#F26B1F]/60"
          />
          <Button onClick={enviar} disabled={pensando} size="icon" className="h-10 w-10 shrink-0 bg-[#F26B1F] hover:bg-[#d95c14]">
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ genéricos ---------------------------- */

function TransformCampos({
  clip,
  onPatchClip,
  onKeyframe,
}: {
  clip: EditairClip | null;
  onPatchClip: (patch: Partial<EditairClip>) => void;
  onKeyframe: (prop: KeyProp) => void;
}) {
  if (!clip) return null;
  const t = clip.transform;
  return (
    <>
      <Campo label={`Escala — ${Math.round(t.scale * 100)}%`} keyProp="scale" onKeyframe={onKeyframe}>
        <Slider value={[t.scale * 100]} min={20} max={300} step={1} onValueChange={([v]) => onPatchClip({ transform: { ...t, scale: v / 100 } })} />
      </Campo>
      <div className="grid grid-cols-2 gap-2">
        <Campo label="X" keyProp="x" onKeyframe={onKeyframe}>
          <Input
            type="number"
            value={t.x}
            onChange={(e) => onPatchClip({ transform: { ...t, x: Number(e.target.value) } })}
            className="h-8 border-white/10 bg-white/5 text-xs"
          />
        </Campo>
        <Campo label="Y" keyProp="y" onKeyframe={onKeyframe}>
          <Input
            type="number"
            value={t.y}
            onChange={(e) => onPatchClip({ transform: { ...t, y: Number(e.target.value) } })}
            className="h-8 border-white/10 bg-white/5 text-xs"
          />
        </Campo>
      </div>
      <Campo label={`Rotação — ${t.rotation}°`} keyProp="rotation" onKeyframe={onKeyframe}>
        <Slider value={[t.rotation]} min={-180} max={180} step={1} onValueChange={([v]) => onPatchClip({ transform: { ...t, rotation: v } })} />
      </Campo>
      <Campo label={`Opacidade — ${Math.round(t.opacity * 100)}%`} keyProp="opacity" onKeyframe={onKeyframe}>
        <Slider value={[t.opacity * 100]} min={0} max={100} step={1} onValueChange={([v]) => onPatchClip({ transform: { ...t, opacity: v / 100 } })} />
      </Campo>
      {clip.keyframes?.length ? (
        <div className="mb-3 flex items-center justify-between text-[11px] text-white/45">
          <span>{clip.keyframes.length} keyframe(s)</span>
          <button onClick={() => onPatchClip({ keyframes: [] })} className="text-red-400 hover:underline">
            limpar
          </button>
        </div>
      ) : null}
    </>
  );
}

function Painel({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-white/10 px-4 py-3 text-sm font-semibold">{titulo}</div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
    </div>
  );
}

function Campo({
  label,
  children,
  keyProp,
  onKeyframe,
}: {
  label: string;
  children: React.ReactNode;
  keyProp?: KeyProp;
  onKeyframe?: (p: KeyProp) => void;
}) {
  return (
    <div className="mb-3">
      <div className="mb-1.5 flex items-center justify-between">
        <p className="text-[11px] text-white/45">{label}</p>
        {keyProp && onKeyframe ? (
          <button
            onClick={() => onKeyframe(keyProp)}
            title="Criar keyframe no playhead"
            className="rounded p-0.5 text-white/35 transition hover:bg-white/10 hover:text-[#F26B1F]"
          >
            <Diamond className="h-3 w-3" />
          </button>
        ) : null}
      </div>
      {children}
    </div>
  );
}

function BotaoSec({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-[11px] text-white/80 transition hover:bg-white/10"
    >
      {children}
    </button>
  );
}

function EmBreve({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <Painel titulo={titulo}>
      <div className="rounded-xl border border-dashed border-white/15 bg-white/[0.03] p-4 text-xs text-white/50">
        <p className="mb-1 font-medium text-white/80">Em breve</p>
        {texto}
      </div>
    </Painel>
  );
}
