/* Inspector do EditAir — painel de propriedades contextual (estilo CapCut).
   Muda automaticamente conforme o tipo do elemento selecionado. */
import { useState } from "react";
import {
  ArrowDownToLine,
  ArrowUpToLine,
  Copy,
  Diamond,
  Lock,
  LockOpen,
  Scissors,
  Sparkles,
  Unlink,
  Wand2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  ANIMACOES,
  ANIMACAO_PADRAO,
  APRIMORAR_PADRAO,
  BLEND_MODES,
  CHROMA_PADRAO,
  FUNDO_PADRAO,
  LEGENDA_PADRAO,
  MASCARA_PADRAO,
  RECORTE_CHEIO,
  RECORTE_RATIOS,
  TEXTO_PADRAO,
  type AnimacaoClip,
  type Aprimorar,
  type CaptionStyle,
  type EditairClip,
  type KeyProp,
  type Mascara,
  type ProjectState,
  type Recorte,
  type TextStyle,
} from "@/lib/editair/types";

export type AcoesInspector = {
  onPatchClip: (patch: Partial<EditairClip>) => void;
  onPatchState: (patch: Partial<ProjectState>) => void;
  onCaption: (patch: Partial<CaptionStyle>) => void;
  onKeyframe: (prop: KeyProp) => void;
  onDuplicar: () => void;
  onCamada: (dir: "frente" | "tras") => void;
  onDesvincularAudio: () => void;
  onExtrairAudio: () => void;
  onNormalizar: () => void;
  onSepararAudio: () => void;
};

type Props = AcoesInspector & {
  state: ProjectState;
  clip: EditairClip | null;
  assets: { id: string; nome: string }[];
};

const LARANJA = "#F26B1F";

export function Inspector(p: Props) {
  const { clip } = p;

  return (
    <aside className="flex min-h-0 w-full flex-col border-l border-white/10 bg-[#12171d]">
      <div className="flex h-[46px] shrink-0 items-center gap-2 border-b border-white/10 px-3">
        <strong className="text-[13px]">Inspector</strong>
        <span className="truncate text-[11px] text-white/35">{clip ? rotulo(clip) : "Nada selecionado"}</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3 text-[12px]">
        {!clip ? (
          <div className="mt-10 px-4 text-center text-[11px] leading-relaxed text-white/35">
            Selecione um clipe ou elemento
            <br />
            para editar suas propriedades.
          </div>
        ) : clip.kind === "text" ? (
          <InspTexto {...p} clip={clip} />
        ) : clip.kind === "caption" ? (
          <InspLegenda {...p} clip={clip} />
        ) : clip.kind === "audio" ? (
          <PainelAudioClip {...p} clip={clip} />
        ) : (
          <InspVisual {...p} clip={clip} />
        )}
      </div>
    </aside>
  );
}

function rotulo(c: EditairClip) {
  if (c.kind === "text") return "TEXTO";
  if (c.kind === "caption") return "LEGENDAS";
  if (c.kind === "audio") return "ÁUDIO";
  if (c.kind === "image") return "IMAGEM";
  return c.trackId === "t-broll" ? "B-ROLL / VÍDEO" : "VÍDEO";
}

/* ============================== VÍDEO / IMAGEM ============================== */

type AbaTopo = "video" | "audio" | "velocidade" | "animacao" | "rastreamento" | "ajuste";
type AbaVideo = "basico" | "recorte" | "mascara" | "aprimorar";

function InspVisual(p: Props & { clip: EditairClip }) {
  const { clip } = p;
  const imagem = clip.kind === "image";
  const [aba, setAba] = useState<AbaTopo>("video");
  const [sub, setSub] = useState<AbaVideo>("basico");

  const abas: { id: AbaTopo; nome: string }[] = [
    { id: "video", nome: imagem ? "Imagem" : "Vídeo" },
    ...(imagem ? [] : [{ id: "audio" as const, nome: "Áudio" }]),
    { id: "velocidade", nome: "Velocidade" },
    { id: "animacao", nome: "Animação" },
    { id: "rastreamento", nome: "Rastreamento" },
    { id: "ajuste", nome: "Ajuste" },
  ];

  return (
    <div className="space-y-3">
      <Abas itens={abas} valor={aba} onChange={(v) => setAba(v as AbaTopo)} />

      {aba === "video" ? (
        <>
          <Abas
            pequeno
            itens={[
              { id: "basico", nome: "Básico" },
              { id: "recorte", nome: "Recorte" },
              { id: "mascara", nome: "Máscara" },
              { id: "aprimorar", nome: "Aprimorar" },
            ]}
            valor={sub}
            onChange={(v) => setSub(v as AbaVideo)}
          />
          {sub === "basico" ? <Basico {...p} clip={clip} /> : null}
          {sub === "recorte" ? <PainelRecorte {...p} clip={clip} /> : null}
          {sub === "mascara" ? <PainelMascara {...p} clip={clip} /> : null}
          {sub === "aprimorar" ? <PainelAprimorar {...p} clip={clip} /> : null}
        </>
      ) : null}

      {aba === "audio" ? <PainelAudioClip {...p} clip={clip} /> : null}
      {aba === "velocidade" ? <PainelVelocidade {...p} clip={clip} /> : null}
      {aba === "animacao" ? <PainelAnimacao {...p} clip={clip} /> : null}
      {aba === "rastreamento" ? <PainelRastreamento {...p} clip={clip} /> : null}
      {aba === "ajuste" ? <PainelAjustes {...p} clip={clip} /> : null}
    </div>
  );
}

function Basico(p: Props & { clip: EditairClip }) {
  const { clip, onPatchClip, onKeyframe } = p;
  const tr = clip.transform;
  const [uniforme, setUniforme] = useState(true);
  const setTr = (patch: Partial<typeof tr>) => onPatchClip({ transform: { ...tr, ...patch } });

  const modo = clip.enquadramento ?? "preencher";

  return (
    <div className="space-y-4">
      <Secao titulo="Transformar">
        <div className="flex gap-1 rounded-lg border border-white/10 p-1">
          {(["fit", "preencher"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => onPatchClip({ enquadramento: m })}
              className={`flex-1 rounded px-2 py-1 text-[11px] ${
                modo === m ? "bg-[#F26B1F] text-black" : "text-white/60 hover:bg-white/10"
              }`}
            >
              {m === "fit" ? "Ajustar (Fit)" : "Preencher"}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Num label="Posição X" value={Math.round(tr.x)} onChange={(v) => setTr({ x: v })} kf={() => onKeyframe("x")} />
          <Num label="Posição Y" value={Math.round(tr.y)} onChange={(v) => setTr({ y: v })} kf={() => onKeyframe("y")} />
        </div>
        <Linha label={`Escala — ${(tr.scale * 100).toFixed(0)}%`} kf={() => onKeyframe("scale")}>
          <Slider value={[tr.scale * 100]} min={10} max={400} step={1} onValueChange={([v]) => setTr({ scale: v / 100 })} />
        </Linha>
        <label className="flex items-center gap-2 text-[11px] text-white/60">
          <input type="checkbox" checked={uniforme} onChange={(e) => setUniforme(e.target.checked)} className="accent-[#F26B1F]" />
          Escala uniforme
        </label>
        <Linha label={`Rotação — ${Math.round(tr.rotation)}°`} kf={() => onKeyframe("rotation")}>
          <Slider value={[tr.rotation]} min={-180} max={180} step={1} onValueChange={([v]) => setTr({ rotation: v })} />
        </Linha>
        <div className="grid grid-cols-2 gap-2">
          <Toggle ativo={!!clip.flipH} onClick={() => onPatchClip({ flipH: !clip.flipH })}>
            Espelhar horizontal
          </Toggle>
          <Toggle ativo={!!clip.flipV} onClick={() => onPatchClip({ flipV: !clip.flipV })}>
            Espelhar vertical
          </Toggle>
        </div>
      </Secao>

      <Secao titulo="Composição">
        <Campo label="Modo de mistura">
          <select
            value={clip.blend ?? "normal"}
            onChange={(e) => onPatchClip({ blend: e.target.value as EditairClip["blend"] })}
            className="w-full rounded-md border border-white/10 bg-black/40 px-2 py-1.5 text-xs"
          >
            {BLEND_MODES.map((b) => (
              <option key={b.id} value={b.id}>
                {b.nome}
              </option>
            ))}
          </select>
        </Campo>
        <Linha label={`Opacidade — ${Math.round(tr.opacity * 100)}%`} kf={() => onKeyframe("opacity")}>
          <Slider value={[tr.opacity * 100]} min={0} max={100} step={1} onValueChange={([v]) => setTr({ opacity: v / 100 })} />
        </Linha>
      </Secao>

      <Secao titulo="Ferramentas rápidas">
        <div className="grid grid-cols-2 gap-2">
          <Acao
            ativo={clip.fundo?.modo === "remover"}
            onClick={() =>
              onPatchClip({
                fundo:
                  clip.fundo?.modo === "remover"
                    ? undefined
                    : { ...FUNDO_PADRAO, ...(clip.fundo ?? {}), modo: "remover" },
              })
            }
          >
            Remover fundo
          </Acao>
          <Acao
            ativo={clip.fundo?.modo === "desfoque"}
            onClick={() =>
              onPatchClip({
                fundo:
                  clip.fundo?.modo === "desfoque"
                    ? undefined
                    : { ...FUNDO_PADRAO, ...(clip.fundo ?? {}), modo: "desfoque" },
              })
            }
          >
            Desfocar fundo
          </Acao>
          <Acao
            ativo={!!clip.chroma?.ativo}
            onClick={() => onPatchClip({ chroma: { ...CHROMA_PADRAO, ...(clip.chroma ?? {}), ativo: !clip.chroma?.ativo } })}
          >
            Chroma Key
          </Acao>
          <Acao
            onClick={() =>
              onPatchClip({
                transform: { ...clip.transform, x: 0, y: 0, scale: 1, rotation: 0 },
                recorte: { ...RECORTE_CHEIO },
              })
            }
          >
            Auto reframe
          </Acao>
          <Acao
            ativo={!!clip.aprimorar?.estabilizar}
            onClick={() =>
              onPatchClip({
                aprimorar: { ...APRIMORAR_PADRAO, ...(clip.aprimorar ?? {}), estabilizar: !clip.aprimorar?.estabilizar },
              })
            }
          >
            Estabilizar
          </Acao>
          <Acao
            ativo={!!clip.aprimorar?.qualidade}
            onClick={() =>
              onPatchClip({
                aprimorar: { ...APRIMORAR_PADRAO, ...(clip.aprimorar ?? {}), qualidade: !clip.aprimorar?.qualidade },
              })
            }
          >
            Melhorar imagem
          </Acao>
        </div>
        {clip.chroma?.ativo ? (
          <div className="mt-2 space-y-1 rounded-lg border border-white/10 bg-black/20 p-2">
            <Campo label="Cor do fundo (chroma)">
              <input
                type="color"
                value={clip.chroma.cor}
                onChange={(e) => onPatchClip({ chroma: { ...clip.chroma!, cor: e.target.value } })}
                className="h-7 w-full rounded border border-white/10 bg-transparent"
              />
            </Campo>
            <Linha label={`Tolerância — ${clip.chroma.tolerancia}`}>
              <Slider
                value={[clip.chroma.tolerancia]}
                min={0}
                max={100}
                step={1}
                onValueChange={([v]) => onPatchClip({ chroma: { ...clip.chroma!, tolerancia: v } })}
              />
            </Linha>
            <Linha label={`Suavidade — ${clip.chroma.suavidade}`}>
              <Slider
                value={[clip.chroma.suavidade]}
                min={0}
                max={100}
                step={1}
                onValueChange={([v]) => onPatchClip({ chroma: { ...clip.chroma!, suavidade: v } })}
              />
            </Linha>
            <Linha label={`Remover derrame — ${clip.chroma.derrame}`}>
              <Slider
                value={[clip.chroma.derrame]}
                min={0}
                max={100}
                step={1}
                onValueChange={([v]) => onPatchClip({ chroma: { ...clip.chroma!, derrame: v } })}
              />
            </Linha>
          </div>
        ) : null}
      </Secao>

      <Secao titulo="Camada">
        <div className="grid grid-cols-2 gap-2">
          <Acao onClick={() => p.onCamada("frente")}>
            <ArrowUpToLine className="mr-1 inline h-3 w-3" /> Para frente
          </Acao>
          <Acao onClick={() => p.onCamada("tras")}>
            <ArrowDownToLine className="mr-1 inline h-3 w-3" /> Para trás
          </Acao>
          <Acao onClick={p.onDuplicar}>
            <Copy className="mr-1 inline h-3 w-3" /> Duplicar
          </Acao>
          <Acao ativo={!!clip.bloqueado} onClick={() => onPatchClip({ bloqueado: !clip.bloqueado })}>
            {clip.bloqueado ? <Lock className="mr-1 inline h-3 w-3" /> : <LockOpen className="mr-1 inline h-3 w-3" />}
            {clip.bloqueado ? "Bloqueado" : "Bloquear"}
          </Acao>
        </div>
      </Secao>
    </div>
  );
}

function PainelRecorte({ clip, onPatchClip }: Props & { clip: EditairClip }) {
  const rec: Recorte = clip.recorte ?? RECORTE_CHEIO;
  const set = (patch: Partial<Recorte>) => onPatchClip({ recorte: { ...rec, ...patch } });
  const aplicarRatio = (ratio: number | null) => {
    if (ratio == null) return set({ ...RECORTE_CHEIO });
    // mantém centro e ajusta ao ratio dentro do frame
    let w = 1;
    let h = 1;
    if (ratio >= 1) h = 1 / ratio;
    else w = ratio;
    set({ x: (1 - w) / 2, y: (1 - h) / 2, w, h });
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        {RECORTE_RATIOS.map((r) => (
          <button
            key={r.id}
            onClick={() => aplicarRatio(r.ratio)}
            className="rounded-lg border border-white/10 px-2 py-2 text-[11px] hover:bg-white/5"
          >
            {r.nome}
          </button>
        ))}
      </div>
      <Linha label={`Esquerda — ${(rec.x * 100).toFixed(0)}%`}>
        <Slider value={[rec.x * 100]} min={0} max={80} step={1} onValueChange={([v]) => set({ x: v / 100 })} />
      </Linha>
      <Linha label={`Topo — ${(rec.y * 100).toFixed(0)}%`}>
        <Slider value={[rec.y * 100]} min={0} max={80} step={1} onValueChange={([v]) => set({ y: v / 100 })} />
      </Linha>
      <Linha label={`Largura — ${(rec.w * 100).toFixed(0)}%`}>
        <Slider value={[rec.w * 100]} min={10} max={100} step={1} onValueChange={([v]) => set({ w: v / 100 })} />
      </Linha>
      <Linha label={`Altura — ${(rec.h * 100).toFixed(0)}%`}>
        <Slider value={[rec.h * 100]} min={10} max={100} step={1} onValueChange={([v]) => set({ h: v / 100 })} />
      </Linha>
      <Button size="sm" variant="ghost" className="w-full text-xs" onClick={() => set({ ...RECORTE_CHEIO })}>
        Restaurar recorte
      </Button>
      <p className="text-[11px] text-white/35">O recorte aparece imediatamente no reprodutor.</p>
    </div>
  );
}

const MASCARAS: { id: Mascara["tipo"]; nome: string }[] = [
  { id: "nenhuma", nome: "Nenhuma" },
  { id: "retangulo", nome: "Retângulo" },
  { id: "circulo", nome: "Círculo" },
  { id: "linear", nome: "Linear" },
  { id: "espelho", nome: "Espelho" },
];

function PainelMascara({ clip, onPatchClip }: Props & { clip: EditairClip }) {
  const mk: Mascara = { ...MASCARA_PADRAO, ...(clip.mascara ?? {}) };
  const set = (patch: Partial<Mascara>) => {
    const prox = { ...mk, ...patch };
    onPatchClip({ mascara: prox.tipo === "nenhuma" ? undefined : prox });
  };
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        {MASCARAS.map((m) => (
          <button
            key={m.id}
            onClick={() => set({ tipo: m.id })}
            className={`rounded-lg border px-2 py-2 text-[11px] ${
              mk.tipo === m.id ? "border-[#F26B1F] bg-[#F26B1F]/15" : "border-white/10 hover:bg-white/5"
            }`}
          >
            {m.nome}
          </button>
        ))}
      </div>
      {mk.tipo !== "nenhuma" ? (
        <>
          <Linha label={`Posição X — ${(mk.x * 100).toFixed(0)}%`}>
            <Slider value={[mk.x * 100]} min={0} max={100} step={1} onValueChange={([v]) => set({ x: v / 100 })} />
          </Linha>
          <Linha label={`Posição Y — ${(mk.y * 100).toFixed(0)}%`}>
            <Slider value={[mk.y * 100]} min={0} max={100} step={1} onValueChange={([v]) => set({ y: v / 100 })} />
          </Linha>
          <Linha label={`Largura — ${(mk.w * 100).toFixed(0)}%`}>
            <Slider value={[mk.w * 100]} min={5} max={150} step={1} onValueChange={([v]) => set({ w: v / 100 })} />
          </Linha>
          <Linha label={`Altura — ${(mk.h * 100).toFixed(0)}%`}>
            <Slider value={[mk.h * 100]} min={5} max={150} step={1} onValueChange={([v]) => set({ h: v / 100 })} />
          </Linha>
          <Linha label={`Rotação — ${mk.rotation}°`}>
            <Slider value={[mk.rotation]} min={-180} max={180} step={1} onValueChange={([v]) => set({ rotation: v })} />
          </Linha>
          <Linha label={`Feather — ${mk.feather}%`}>
            <Slider value={[mk.feather]} min={0} max={100} step={1} onValueChange={([v]) => set({ feather: v })} />
          </Linha>
          <Toggle ativo={mk.inverter} onClick={() => set({ inverter: !mk.inverter })}>
            Inverter máscara
          </Toggle>
        </>
      ) : null}
    </div>
  );
}

const FERRAMENTAS_IA: { k: keyof Aprimorar; nome: string; desc: string }[] = [
  { k: "qualidade", nome: "Melhorar qualidade", desc: "Contraste, cor e brancos recalibrados" },
  { k: "ruido", nome: "Reduzir ruído visual", desc: "Suavização fina do granulado" },
  { k: "nitidez", nome: "Melhorar nitidez", desc: "Realce de microcontraste" },
  { k: "rosto", nome: "Melhorar rosto", desc: "Pele mais clara e uniforme" },
  { k: "luz", nome: "Auto iluminação", desc: "Levanta sombras e controla estouros" },
  { k: "estabilizar", nome: "Estabilização", desc: "Margem de segurança e menos tremor" },
  { k: "cor", nome: "Correção de cor automática", desc: "Saturação e temperatura equilibradas" },
];

function PainelAprimorar({ clip, onPatchClip }: Props & { clip: EditairClip }) {
  const ap: Aprimorar = { ...APRIMORAR_PADRAO, ...(clip.aprimorar ?? {}) };
  return (
    <div className="space-y-2">
      {FERRAMENTAS_IA.map((f) => (
        <button
          key={f.k}
          onClick={() => onPatchClip({ aprimorar: { ...ap, [f.k]: !ap[f.k] } })}
          className={`flex w-full items-start gap-2 rounded-lg border px-3 py-2 text-left transition ${
            ap[f.k] ? "border-[#F26B1F] bg-[#F26B1F]/10" : "border-white/10 hover:bg-white/5"
          }`}
        >
          <Sparkles className={`mt-0.5 h-3.5 w-3.5 ${ap[f.k] ? "text-[#F26B1F]" : "text-white/40"}`} />
          <span>
            <span className="block text-[12px]">{f.nome}</span>
            <span className="block text-[10px] text-white/40">{f.desc}</span>
          </span>
        </button>
      ))}
      <Button
        size="sm"
        variant="ghost"
        className="w-full text-xs"
        onClick={() => onPatchClip({ aprimorar: { ...APRIMORAR_PADRAO } })}
      >
        Desativar tudo
      </Button>
    </div>
  );
}

function PainelVelocidade({ clip, onPatchClip }: Props & { clip: EditairClip }) {
  const v = clip.speed || 1;
  return (
    <div className="space-y-3">
      <Linha label={`Velocidade — ${v.toFixed(2)}×`}>
        <Slider value={[v * 100]} min={25} max={400} step={5} onValueChange={([s]) => onPatchClip({ speed: s / 100 })} />
      </Linha>
      <div className="grid grid-cols-4 gap-2">
        {[0.5, 1, 1.5, 2].map((s) => (
          <button
            key={s}
            onClick={() => onPatchClip({ speed: s })}
            className={`rounded-lg border px-2 py-1.5 text-[11px] ${
              Math.abs(v - s) < 0.01 ? "border-[#F26B1F] bg-[#F26B1F]/15" : "border-white/10 hover:bg-white/5"
            }`}
          >
            {s}×
          </button>
        ))}
      </div>
      <Toggle ativo={!!clip.reverso} onClick={() => onPatchClip({ reverso: !clip.reverso })}>
        Reverter clipe
      </Toggle>
      <Toggle ativo={!!clip.congelado} onClick={() => onPatchClip({ congelado: !clip.congelado, speed: clip.congelado ? 1 : 0.01 })}>
        Congelar frame
      </Toggle>
    </div>
  );
}

function PainelAnimacao({ clip, onPatchClip }: Props & { clip: EditairClip }) {
  const an: AnimacaoClip = { ...ANIMACAO_PADRAO, ...(clip.animacao ?? {}) };
  const set = (patch: Partial<AnimacaoClip>) => onPatchClip({ animacao: { ...an, ...patch } });
  return (
    <div className="space-y-3">
      <Campo label="Entrada">
        <select
          value={an.entrada}
          onChange={(e) => set({ entrada: e.target.value as AnimacaoClip["entrada"] })}
          className="w-full rounded-md border border-white/10 bg-black/40 px-2 py-1.5 text-xs"
        >
          {ANIMACOES.map((a) => (
            <option key={a.id} value={a.id}>
              {a.nome}
            </option>
          ))}
        </select>
      </Campo>
      <Campo label="Saída">
        <select
          value={an.saida}
          onChange={(e) => set({ saida: e.target.value as AnimacaoClip["saida"] })}
          className="w-full rounded-md border border-white/10 bg-black/40 px-2 py-1.5 text-xs"
        >
          {ANIMACOES.map((a) => (
            <option key={a.id} value={a.id}>
              {a.nome}
            </option>
          ))}
        </select>
      </Campo>
      <Linha label={`Duração — ${an.duracaoMs} ms`}>
        <Slider value={[an.duracaoMs]} min={120} max={2000} step={20} onValueChange={([v]) => set({ duracaoMs: v })} />
      </Linha>
      <Toggle ativo={an.kenBurns} onClick={() => set({ kenBurns: !an.kenBurns })}>
        Ken Burns (zoom lento)
      </Toggle>
      <Toggle ativo={!!an.loop} onClick={() => set({ loop: !an.loop })}>
        Repetir em loop
      </Toggle>
    </div>
  );
}

function PainelRastreamento({ clip, onPatchClip }: Props & { clip: EditairClip }) {
  return (
    <div className="space-y-3">
      <p className="text-[11px] leading-relaxed text-white/45">
        O rastreamento usa a segmentação de pessoa já disponível no EditAir para manter o recorte colado no movimento.
      </p>
      <Toggle
        ativo={!!clip.fundo && clip.fundo.modo !== "nenhum"}
        onClick={() =>
          onPatchClip({
            fundo: clip.fundo && clip.fundo.modo !== "nenhum" ? undefined : { ...FUNDO_PADRAO, modo: "desfoque" },
          })
        }
      >
        Rastrear pessoa (segmentação)
      </Toggle>
      {clip.fundo && clip.fundo.modo !== "nenhum" ? (
        <Linha label={`Estabilidade do rastreio — ${clip.fundo.estabilidade}%`}>
          <Slider
            value={[clip.fundo.estabilidade]}
            min={0}
            max={95}
            step={5}
            onValueChange={([v]) => onPatchClip({ fundo: { ...clip.fundo!, estabilidade: v } })}
          />
        </Linha>
      ) : null}
    </div>
  );
}

const CAMPOS_AJUSTE = [
  { k: "exposicao", l: "Exposição" },
  { k: "brilho", l: "Brilho" },
  { k: "contraste", l: "Contraste" },
  { k: "saturacao", l: "Saturação" },
  { k: "temperatura", l: "Temperatura" },
  { k: "tint", l: "Tonalidade" },
  { k: "highlights", l: "Altas luzes" },
  { k: "shadows", l: "Sombras" },
] as const;

function PainelAjustes({ clip, onPatchClip }: Props & { clip: EditairClip }) {
  const aj = clip.ajustes ?? {};
  return (
    <div className="space-y-2">
      {CAMPOS_AJUSTE.map((c) => (
        <Linha key={c.k} label={`${c.l} — ${(aj as Record<string, number>)[c.k] ?? 0}`}>
          <Slider
            value={[(aj as Record<string, number>)[c.k] ?? 0]}
            min={-100}
            max={100}
            step={1}
            onValueChange={([v]) => onPatchClip({ ajustes: { ...(clip.ajustes ?? {}), [c.k]: v } as EditairClip["ajustes"] })}
          />
        </Linha>
      ))}
    </div>
  );
}

/* ============================== ÁUDIO ============================== */

function PainelAudioClip(p: Props & { clip: EditairClip }) {
  const { clip, onPatchClip, onPatchState, state } = p;
  const eq = clip.eq ?? { graves: 0, medios: 0, agudos: 0 };
  return (
    <div className="space-y-3">
      <Linha label={`Volume — ${Math.round((clip.volume ?? 1) * 100)}%`} kf={() => p.onKeyframe("volume")}>
        <Slider value={[(clip.volume ?? 1) * 100]} min={0} max={200} step={1} onValueChange={([v]) => onPatchClip({ volume: v / 100 })} />
      </Linha>
      <div className="grid grid-cols-2 gap-2">
        <Num label="Fade-in (ms)" value={clip.fadeInMs ?? 0} onChange={(v) => onPatchClip({ fadeInMs: Math.max(0, v) })} />
        <Num label="Fade-out (ms)" value={clip.fadeOutMs ?? 0} onChange={(v) => onPatchClip({ fadeOutMs: Math.max(0, v) })} />
      </div>
      <Linha label={`Pan — ${((clip.pan ?? 0) * 100).toFixed(0)}`}>
        <Slider value={[(clip.pan ?? 0) * 100]} min={-100} max={100} step={5} onValueChange={([v]) => onPatchClip({ pan: v / 100 })} />
      </Linha>

      <Secao titulo="Equalizador">
        <Linha label={`Graves — ${eq.graves} dB`}>
          <Slider value={[eq.graves]} min={-12} max={12} step={1} onValueChange={([v]) => onPatchClip({ eq: { ...eq, graves: v } })} />
        </Linha>
        <Linha label={`Médios — ${eq.medios} dB`}>
          <Slider value={[eq.medios]} min={-12} max={12} step={1} onValueChange={([v]) => onPatchClip({ eq: { ...eq, medios: v } })} />
        </Linha>
        <Linha label={`Agudos — ${eq.agudos} dB`}>
          <Slider value={[eq.agudos]} min={-12} max={12} step={1} onValueChange={([v]) => onPatchClip({ eq: { ...eq, agudos: v } })} />
        </Linha>
      </Secao>

      <div className="grid grid-cols-2 gap-2">
        <Acao ativo={!!clip.compressor} onClick={() => onPatchClip({ compressor: !clip.compressor })}>
          Compressor
        </Acao>
        <Acao ativo={!!clip.limiter} onClick={() => onPatchClip({ limiter: !clip.limiter })}>
          Limiter
        </Acao>
        <Acao ativo={!!clip.isolarVoz} onClick={() => onPatchClip({ isolarVoz: !clip.isolarVoz })}>
          Isolar voz
        </Acao>
        <Acao
          ativo={!!state.audioFx?.ruido}
          onClick={() => onPatchState({ audioFx: { voz: !!state.audioFx?.voz, ruido: !state.audioFx?.ruido } })}
        >
          Reduzir ruído
        </Acao>
        <Acao
          ativo={!!state.audioFx?.voz}
          onClick={() => onPatchState({ audioFx: { ruido: !!state.audioFx?.ruido, voz: !state.audioFx?.voz } })}
        >
          Melhorar voz
        </Acao>
        <Acao
          ativo={!!state.ducking?.ativo}
          onClick={() =>
            onPatchState({ ducking: { reducao: state.ducking?.reducao ?? 70, ativo: !state.ducking?.ativo } })
          }
        >
          Ducking
        </Acao>
        <Acao onClick={p.onNormalizar}>
          <Wand2 className="mr-1 inline h-3 w-3" /> Normalizar
        </Acao>
        <Acao onClick={p.onExtrairAudio}>
          <Scissors className="mr-1 inline h-3 w-3" /> Extrair áudio
        </Acao>
        <Acao onClick={p.onDesvincularAudio}>
          <Unlink className="mr-1 inline h-3 w-3" /> Desvincular
        </Acao>
        <Acao ativo={!!clip.muted} onClick={() => onPatchClip({ muted: !clip.muted })}>
          {clip.muted ? "Sem som" : "Mudo"}
        </Acao>
      </div>
      {state.ducking?.ativo ? (
        <Linha label={`Redução do ducking — ${state.ducking.reducao}%`}>
          <Slider
            value={[state.ducking.reducao]}
            min={10}
            max={95}
            step={5}
            onValueChange={([v]) => onPatchState({ ducking: { ativo: true, reducao: v } })}
          />
        </Linha>
      ) : null}
    </div>
  );
}

/* ============================== TEXTO ============================== */

function InspTexto(p: Props & { clip: EditairClip }) {
  const { clip, onPatchClip } = p;
  const [aba, setAba] = useState<"basico" | "estilo" | "efeitos" | "animacao">("basico");
  const st: TextStyle = { ...TEXTO_PADRAO, ...(clip.textStyle ?? {}) };
  const setSt = (patch: Partial<TextStyle>) => onPatchClip({ textStyle: { ...st, ...patch } });
  const tr = clip.transform;

  return (
    <div className="space-y-3">
      <Abas
        itens={[
          { id: "basico", nome: "Básico" },
          { id: "estilo", nome: "Estilo" },
          { id: "efeitos", nome: "Efeitos" },
          { id: "animacao", nome: "Animação" },
        ]}
        valor={aba}
        onChange={(v) => setAba(v as typeof aba)}
      />

      {aba === "basico" ? (
        <>
          <Campo label="Conteúdo">
            <textarea
              value={clip.text ?? ""}
              onChange={(e) => onPatchClip({ text: e.target.value })}
              rows={3}
              className="w-full resize-none rounded-md border border-white/10 bg-black/40 px-2 py-1.5 text-xs outline-none"
            />
          </Campo>
          <Campo label="Fonte">
            <select
              value={st.fontFamily}
              onChange={(e) => setSt({ fontFamily: e.target.value })}
              className="w-full rounded-md border border-white/10 bg-black/40 px-2 py-1.5 text-xs"
            >
              <option value="Inter, system-ui, sans-serif">Inter</option>
              <option value="Georgia, serif">Georgia</option>
              <option value="'Courier New', monospace">Courier</option>
              <option value="Impact, sans-serif">Impact</option>
            </select>
          </Campo>
          <Linha label={`Tamanho — ${st.fontSize}px`}>
            <Slider value={[st.fontSize]} min={24} max={220} step={2} onValueChange={([v]) => setSt({ fontSize: v })} />
          </Linha>
          <Linha label={`Peso — ${st.weight}`}>
            <Slider value={[st.weight]} min={300} max={900} step={100} onValueChange={([v]) => setSt({ weight: v })} />
          </Linha>
          <Campo label="Alinhamento">
            <div className="grid grid-cols-3 gap-2">
              {(["left", "center", "right"] as const).map((a) => (
                <button
                  key={a}
                  onClick={() => setSt({ align: a })}
                  className={`rounded-lg border px-2 py-1.5 text-[11px] ${
                    st.align === a ? "border-[#F26B1F] bg-[#F26B1F]/15" : "border-white/10 hover:bg-white/5"
                  }`}
                >
                  {a === "left" ? "Esq." : a === "center" ? "Centro" : "Dir."}
                </button>
              ))}
            </div>
          </Campo>
        </>
      ) : null}

      {aba === "estilo" ? (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Campo label="Cor">
              <input
                type="color"
                value={st.color}
                onChange={(e) => setSt({ color: e.target.value })}
                className="h-8 w-full rounded border border-white/10 bg-transparent"
              />
            </Campo>
            <Campo label="Contorno">
              <input
                type="color"
                value={st.strokeColor}
                onChange={(e) => setSt({ strokeColor: e.target.value })}
                className="h-8 w-full rounded border border-white/10 bg-transparent"
              />
            </Campo>
          </div>
          <Linha label={`Espessura do contorno — ${st.stroke}`}>
            <Slider value={[st.stroke]} min={0} max={30} step={1} onValueChange={([v]) => setSt({ stroke: v })} />
          </Linha>
          <Linha label={`Sombra — ${st.shadow}`}>
            <Slider value={[st.shadow]} min={0} max={40} step={1} onValueChange={([v]) => setSt({ shadow: v })} />
          </Linha>
          <Campo label="Fundo">
            <select
              value={st.background}
              onChange={(e) => setSt({ background: e.target.value as TextStyle["background"] })}
              className="w-full rounded-md border border-white/10 bg-black/40 px-2 py-1.5 text-xs"
            >
              <option value="none">Sem fundo</option>
              <option value="box">Caixa</option>
              <option value="soft">Suave</option>
            </select>
          </Campo>
          <Campo label="Cor do fundo">
            <input
              type="color"
              value={st.backgroundColor}
              onChange={(e) => setSt({ backgroundColor: e.target.value })}
              className="h-8 w-full rounded border border-white/10 bg-transparent"
            />
          </Campo>
        </>
      ) : null}

      {aba === "efeitos" ? (
        <>
          <Linha label={`Opacidade — ${Math.round(tr.opacity * 100)}%`} kf={() => p.onKeyframe("opacity")}>
            <Slider
              value={[tr.opacity * 100]}
              min={0}
              max={100}
              step={1}
              onValueChange={([v]) => onPatchClip({ transform: { ...tr, opacity: v / 100 } })}
            />
          </Linha>
          <div className="grid grid-cols-2 gap-2">
            <Num
              label="Posição X"
              value={Math.round(tr.x)}
              onChange={(v) => onPatchClip({ transform: { ...tr, x: v } })}
              kf={() => p.onKeyframe("x")}
            />
            <Num
              label="Posição Y"
              value={Math.round(tr.y)}
              onChange={(v) => onPatchClip({ transform: { ...tr, y: v } })}
              kf={() => p.onKeyframe("y")}
            />
          </div>
          <Linha label={`Escala — ${(tr.scale * 100).toFixed(0)}%`} kf={() => p.onKeyframe("scale")}>
            <Slider
              value={[tr.scale * 100]}
              min={10}
              max={400}
              step={1}
              onValueChange={([v]) => onPatchClip({ transform: { ...tr, scale: v / 100 } })}
            />
          </Linha>
          <Linha label={`Rotação — ${Math.round(tr.rotation)}°`} kf={() => p.onKeyframe("rotation")}>
            <Slider
              value={[tr.rotation]}
              min={-180}
              max={180}
              step={1}
              onValueChange={([v]) => onPatchClip({ transform: { ...tr, rotation: v } })}
            />
          </Linha>
        </>
      ) : null}

      {aba === "animacao" ? (
        <Campo label="Animação do texto">
          <select
            value={st.animacao}
            onChange={(e) => setSt({ animacao: e.target.value as TextStyle["animacao"] })}
            className="w-full rounded-md border border-white/10 bg-black/40 px-2 py-1.5 text-xs"
          >
            <option value="nenhuma">Nenhuma</option>
            <option value="fade">Fade</option>
            <option value="pop">Pop</option>
            <option value="subir">Subir</option>
            <option value="digitar">Digitar</option>
          </select>
        </Campo>
      ) : null}
    </div>
  );
}

/* ============================== LEGENDA ============================== */

function InspLegenda({ clip, state, onPatchClip, onCaption }: Props & { clip: EditairClip }) {
  const est: CaptionStyle = { ...LEGENDA_PADRAO, ...state.captionStyle, ...(clip.captionStyle ?? {}) };
  const set = (patch: Partial<CaptionStyle>) => onCaption(patch);
  return (
    <div className="space-y-3">
      <Campo label="Texto da legenda">
        <textarea
          value={clip.text ?? ""}
          onChange={(e) => onPatchClip({ text: e.target.value })}
          rows={2}
          className="w-full resize-none rounded-md border border-white/10 bg-black/40 px-2 py-1.5 text-xs outline-none"
        />
      </Campo>
      <Campo label="Fonte">
        <select
          value={est.fontFamily}
          onChange={(e) => set({ fontFamily: e.target.value })}
          className="w-full rounded-md border border-white/10 bg-black/40 px-2 py-1.5 text-xs"
        >
          <option value="Inter, system-ui, sans-serif">Inter</option>
          <option value="Impact, sans-serif">Impact</option>
          <option value="Georgia, serif">Georgia</option>
        </select>
      </Campo>
      <Linha label={`Tamanho — ${est.fontSize}px`}>
        <Slider value={[est.fontSize]} min={24} max={160} step={2} onValueChange={([v]) => set({ fontSize: v })} />
      </Linha>
      <div className="grid grid-cols-2 gap-2">
        <Campo label="Cor">
          <input
            type="color"
            value={est.color}
            onChange={(e) => set({ color: e.target.value })}
            className="h-8 w-full rounded border border-white/10 bg-transparent"
          />
        </Campo>
        <Campo label="Palavra ativa">
          <input
            type="color"
            value={est.activeColor}
            onChange={(e) => set({ activeColor: e.target.value })}
            className="h-8 w-full rounded border border-white/10 bg-transparent"
          />
        </Campo>
      </div>
      <Linha label={`Posição vertical — ${(est.y * 100).toFixed(0)}%`}>
        <Slider value={[est.y * 100]} min={10} max={95} step={1} onValueChange={([v]) => set({ y: v / 100 })} />
      </Linha>
      <Linha label={`Contorno — ${est.stroke}`}>
        <Slider value={[est.stroke]} min={0} max={24} step={1} onValueChange={([v]) => set({ stroke: v })} />
      </Linha>
      <Campo label="Destaque de fundo">
        <select
          value={est.background}
          onChange={(e) => set({ background: e.target.value as CaptionStyle["background"] })}
          className="w-full rounded-md border border-white/10 bg-black/40 px-2 py-1.5 text-xs"
        >
          <option value="none">Sem fundo</option>
          <option value="box">Caixa</option>
          <option value="soft">Suave</option>
        </select>
      </Campo>
      <Campo label="Animação">
        <select
          value={est.animacao}
          onChange={(e) => set({ animacao: e.target.value as CaptionStyle["animacao"] })}
          className="w-full rounded-md border border-white/10 bg-black/40 px-2 py-1.5 text-xs"
        >
          <option value="nenhuma">Nenhuma</option>
          <option value="pop">Pop</option>
          <option value="subir">Subir</option>
          <option value="fade">Fade</option>
        </select>
      </Campo>
      <Toggle ativo={est.karaoke} onClick={() => set({ karaoke: !est.karaoke })}>
        Destacar palavra ativa (karaokê)
      </Toggle>
      <Toggle ativo={est.uppercase} onClick={() => set({ uppercase: !est.uppercase })}>
        Tudo em maiúsculas
      </Toggle>
    </div>
  );
}

/* ============================== primitivos ============================== */

function Abas({
  itens,
  valor,
  onChange,
  pequeno,
}: {
  itens: { id: string; nome: string }[];
  valor: string;
  onChange: (v: string) => void;
  pequeno?: boolean;
}) {
  return (
    <div className={`flex flex-wrap gap-1 rounded-lg bg-black/30 p-1 ${pequeno ? "text-[10px]" : "text-[11px]"}`}>
      {itens.map((i) => (
        <button
          key={i.id}
          onClick={() => onChange(i.id)}
          className={`flex-1 whitespace-nowrap rounded-md px-2 py-1.5 transition ${
            valor === i.id ? "bg-[#F26B1F]/20 text-[#F26B1F]" : "text-white/50 hover:bg-white/5"
          }`}
        >
          {i.nome}
        </button>
      ))}
    </div>
  );
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2 rounded-xl border border-white/10 bg-white/[0.02] p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-white/40">{titulo}</p>
      {children}
    </div>
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="mb-2 block">
      <span className="mb-1 block text-[11px] text-white/50">{label}</span>
      {children}
    </label>
  );
}

function Linha({ label, children, kf }: { label: string; children: React.ReactNode; kf?: () => void }) {
  return (
    <div className="mb-2">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[11px] text-white/50">{label}</span>
        {kf ? (
          <button onClick={kf} title="Criar keyframe" className="rounded p-0.5 text-white/40 hover:bg-white/10 hover:text-white">
            <Diamond className="h-3 w-3" />
          </button>
        ) : null}
      </div>
      {children}
    </div>
  );
}

function Num({
  label,
  value,
  onChange,
  kf,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  kf?: () => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 flex items-center justify-between text-[11px] text-white/50">
        {label}
        {kf ? (
          <button onClick={kf} title="Criar keyframe" className="rounded p-0.5 hover:bg-white/10">
            <Diamond className="h-3 w-3" />
          </button>
        ) : null}
      </span>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        className="w-full rounded-md border border-white/10 bg-black/40 px-2 py-1.5 text-xs outline-none"
      />
    </label>
  );
}

function Toggle({ ativo, onClick, children }: { ativo?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`w-full rounded-lg border px-2 py-2 text-left text-[11px] transition ${
        ativo ? "border-[#F26B1F] bg-[#F26B1F]/15 text-[#F26B1F]" : "border-white/10 text-white/70 hover:bg-white/5"
      }`}
      style={ativo ? { borderColor: LARANJA } : undefined}
    >
      {children}
    </button>
  );
}

function Acao({ ativo, onClick, children }: { ativo?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg border px-2 py-2 text-[11px] transition ${
        ativo ? "border-[#F26B1F] bg-[#F26B1F]/15 text-[#F26B1F]" : "border-white/10 text-white/70 hover:bg-white/5"
      }`}
    >
      {children}
    </button>
  );
}
