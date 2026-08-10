import { useMemo, useState } from "react";
import { Loader2, Send, Sparkles, Trash2, Scissors } from "lucide-react";
import type { CaptionStyle, EditairClip, Transcript } from "@/lib/editair/types";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";

/* ---------------- Chat com o diretor de IA ---------------- */

export type MensagemIa = { id: string; autor: "usuario" | "ia"; texto: string; ops?: number };

export function AiChat({
  mensagens,
  pensando,
  onEnviar,
  sugestoes,
}: {
  mensagens: MensagemIa[];
  pensando: boolean;
  onEnviar: (texto: string) => void;
  sugestoes: string[];
}) {
  const [texto, setTexto] = useState("");
  const enviar = () => {
    const t = texto.trim();
    if (!t || pensando) return;
    setTexto("");
    onEnviar(t);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
        <Sparkles className="h-4 w-4 text-[#F26B1F]" />
        <span className="text-sm font-medium">Diretor de edição</span>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        {mensagens.length === 0 ? (
          <div className="space-y-2">
            <p className="text-xs text-white/40">
              Fale como você falaria com um editor. Exemplos:
            </p>
            {sugestoes.map((s) => (
              <button
                key={s}
                onClick={() => onEnviar(s)}
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
              className={`max-w-[90%] rounded-2xl px-3 py-2 text-xs leading-relaxed ${
                m.autor === "usuario"
                  ? "ml-auto bg-[#F26B1F] text-white"
                  : "bg-white/[0.06] text-white/80"
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
            placeholder="Ex.: tira as pausas e coloca legenda"
            className="min-h-[44px] flex-1 resize-none rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs outline-none placeholder:text-white/30 focus:border-[#F26B1F]/60"
          />
          <Button
            onClick={enviar}
            disabled={pensando}
            size="icon"
            className="h-10 w-10 shrink-0 bg-[#F26B1F] hover:bg-[#d95c14]"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Transcrição editável ---------------- */

export function TranscriptPanel({
  transcript,
  playheadMs,
  onSeek,
  onApagarTrecho,
}: {
  transcript: Transcript | null;
  playheadMs: number;
  onSeek: (ms: number) => void;
  onApagarTrecho: (fromMs: number, toMs: number) => void;
}) {
  const [sel, setSel] = useState<{ a: number; b: number } | null>(null);
  const palavras = transcript?.words ?? [];

  const intervalo = useMemo(() => {
    if (!sel) return null;
    const a = Math.min(sel.a, sel.b);
    const b = Math.max(sel.a, sel.b);
    return { from: palavras[a]?.start ?? 0, to: palavras[b]?.end ?? 0, a, b };
  }, [sel, palavras]);

  if (!palavras.length) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-xs text-white/35">
        Nenhuma transcrição ainda. Clique em “Analisar” para transcrever o áudio e liberar a edição por texto.
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <span className="text-sm font-medium">Transcrição</span>
        {intervalo ? (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-[11px] text-red-400 hover:bg-red-500/10"
            onClick={() => {
              onApagarTrecho(intervalo.from, intervalo.to);
              setSel(null);
            }}
          >
            <Trash2 className="mr-1 h-3.5 w-3.5" /> apagar trecho
          </Button>
        ) : (
          <span className="text-[10px] text-white/30">clique e arraste sobre o texto</span>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4 text-sm leading-7">
        {palavras.map((w, i) => {
          const ativa = playheadMs >= w.start && playheadMs < w.end;
          const dentro = intervalo != null && i >= intervalo.a && i <= intervalo.b;
          return (
            <span
              key={`${i}-${w.start}`}
              onMouseDown={() => setSel({ a: i, b: i })}
              onMouseEnter={(e) => {
                if (e.buttons === 1) setSel((cur) => (cur ? { ...cur, b: i } : { a: i, b: i }));
              }}
              onClick={() => onSeek(w.start)}
              className={`cursor-pointer rounded px-0.5 transition ${
                dentro ? "bg-red-500/30 text-white" : ativa ? "bg-[#F26B1F] text-white" : "text-white/70 hover:bg-white/10"
              }`}
            >
              {w.w}{" "}
            </span>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------- Inspetor ---------------- */

export function Inspector({
  clip,
  captionStyle,
  onClip,
  onCaption,
  onDividir,
  onExcluir,
}: {
  clip: EditairClip | null;
  captionStyle: CaptionStyle;
  onClip: (patch: Partial<EditairClip>) => void;
  onCaption: (patch: Partial<CaptionStyle>) => void;
  onDividir: () => void;
  onExcluir: () => void;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto">
      <div className="border-b border-white/10 px-4 py-3 text-sm font-medium">Propriedades</div>
      <div className="space-y-5 p-4">
        {clip ? (
          <>
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" className="flex-1 bg-white/10 text-xs hover:bg-white/20" onClick={onDividir}>
                <Scissors className="mr-1 h-3.5 w-3.5" /> Dividir
              </Button>
              <Button size="sm" variant="ghost" className="text-xs text-red-400 hover:bg-red-500/10" onClick={onExcluir}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
            <Campo label={`Volume — ${Math.round(clip.volume * 100)}%`}>
              <Slider
                value={[clip.volume * 100]}
                min={0}
                max={200}
                step={5}
                onValueChange={([v]) => onClip({ volume: v / 100 })}
              />
            </Campo>
            <Campo label={`Velocidade — ${clip.speed.toFixed(2)}x`}>
              <Slider
                value={[clip.speed * 100]}
                min={50}
                max={300}
                step={5}
                onValueChange={([v]) => onClip({ speed: v / 100 })}
              />
            </Campo>
            <Campo label={`Zoom — ${Math.round(clip.transform.scale * 100)}%`}>
              <Slider
                value={[clip.transform.scale * 100]}
                min={50}
                max={250}
                step={1}
                onValueChange={([v]) => onClip({ transform: { ...clip.transform, scale: v / 100 } })}
              />
            </Campo>
            <div className="grid grid-cols-2 gap-2">
              <Campo label="Posição X">
                <Input
                  type="number"
                  value={clip.transform.x}
                  onChange={(e) => onClip({ transform: { ...clip.transform, x: Number(e.target.value) } })}
                  className="h-8 border-white/10 bg-white/5 text-xs"
                />
              </Campo>
              <Campo label="Posição Y">
                <Input
                  type="number"
                  value={clip.transform.y}
                  onChange={(e) => onClip({ transform: { ...clip.transform, y: Number(e.target.value) } })}
                  className="h-8 border-white/10 bg-white/5 text-xs"
                />
              </Campo>
            </div>
            {clip.kind === "text" || clip.kind === "caption" ? (
              <Campo label="Texto">
                <Input
                  value={clip.text ?? ""}
                  onChange={(e) => onClip({ text: e.target.value })}
                  className="h-8 border-white/10 bg-white/5 text-xs"
                />
              </Campo>
            ) : null}
          </>
        ) : (
          <p className="text-xs text-white/35">Selecione um clipe na timeline.</p>
        )}

        <div className="space-y-4 border-t border-white/10 pt-5">
          <p className="text-xs font-medium text-white/60">Estilo das legendas</p>
          <Campo label={`Tamanho — ${captionStyle.fontSize}px`}>
            <Slider
              value={[captionStyle.fontSize]}
              min={28}
              max={120}
              step={2}
              onValueChange={([v]) => onCaption({ fontSize: v })}
            />
          </Campo>
          <Campo label={`Altura na tela — ${Math.round(captionStyle.y * 100)}%`}>
            <Slider
              value={[captionStyle.y * 100]}
              min={20}
              max={92}
              step={1}
              onValueChange={([v]) => onCaption({ y: v / 100 })}
            />
          </Campo>
          <div className="grid grid-cols-2 gap-2">
            <Campo label="Cor">
              <input
                type="color"
                value={captionStyle.color}
                onChange={(e) => onCaption({ color: e.target.value })}
                className="h-8 w-full cursor-pointer rounded border border-white/10 bg-transparent"
              />
            </Campo>
            <Campo label="Destaque">
              <input
                type="color"
                value={captionStyle.activeColor}
                onChange={(e) => onCaption({ activeColor: e.target.value })}
                className="h-8 w-full cursor-pointer rounded border border-white/10 bg-transparent"
              />
            </Campo>
          </div>
          <label className="flex items-center gap-2 text-xs text-white/60">
            <input
              type="checkbox"
              checked={captionStyle.uppercase}
              onChange={(e) => onCaption({ uppercase: e.target.checked })}
              className="accent-[#F26B1F]"
            />
            MAIÚSCULAS
          </label>
        </div>
      </div>
    </div>
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-[11px] text-white/45">{label}</p>
      {children}
    </div>
  );
}
