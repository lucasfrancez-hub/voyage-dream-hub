import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatarTempo, type EditairClip } from "@/lib/editair/types";
import type { AssetInfo } from "./Timeline";

/**
 * Mostra o arquivo original inteiro e destaca exatamente qual trecho o clipe usa.
 * Nada aqui altera o arquivo: é só leitura do source.
 */
export function SourceDialog({
  clip,
  asset,
  aberto,
  onFechar,
  onRestaurar,
}: {
  clip: EditairClip | null;
  asset: AssetInfo | null;
  aberto: boolean;
  onFechar: () => void;
  onRestaurar: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [pos, setPos] = useState(0);

  const speed = clip?.speed || 1;
  const inMs = clip?.sourceIn ?? 0;
  const outMs = clip ? clip.sourceIn + clip.duration * speed : 0;
  const total = asset?.durationMs || 1;

  useEffect(() => {
    if (!aberto || !videoRef.current) return;
    videoRef.current.currentTime = inMs / 1000;
    setPos(inMs);
  }, [aberto, inMs]);

  const irPara = (ms: number) => {
    setPos(ms);
    if (videoRef.current) videoRef.current.currentTime = ms / 1000;
  };

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && onFechar()}>
      <DialogContent className="border-white/10 bg-[#12171d] text-white sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-sm">Material original — {asset?.name ?? ""}</DialogTitle>
        </DialogHeader>

        {asset && clip ? (
          <div className="space-y-4">
            {asset.kind !== "audio" ? (
              <video
                ref={videoRef}
                src={asset.url}
                className="max-h-[46vh] w-full rounded-xl bg-black object-contain"
                controls
                onTimeUpdate={(e) => setPos(e.currentTarget.currentTime * 1000)}
              />
            ) : null}

            <div
              className="relative h-12 cursor-pointer overflow-hidden rounded-lg border border-white/10 bg-[repeating-linear-gradient(45deg,rgba(255,255,255,.06)_0_6px,transparent_6px_12px)]"
              onPointerDown={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                irPara(((e.clientX - r.left) / r.width) * total);
              }}
            >
              <div
                className="absolute top-0 h-full border-x-2 border-[#F26B1F] bg-[#F26B1F]/25"
                style={{ left: `${(inMs / total) * 100}%`, width: `${((outMs - inMs) / total) * 100}%` }}
              />
              <div className="absolute top-0 h-full w-px bg-white" style={{ left: `${(pos / total) * 100}%` }} />
            </div>

            <div className="grid grid-cols-3 gap-2 text-[11px]">
              <Info titulo="Source In" valor={formatarTempo(inMs, true)} />
              <Info titulo="Source Out" valor={formatarTempo(outMs, true)} />
              <Info titulo="Duração do arquivo" valor={formatarTempo(total, true)} />
            </div>

            <p className="text-[11px] text-white/40">
              A parte pontilhada continua existindo no arquivo original. Puxe as bordas do clipe na timeline para
              trazê-la de volta a qualquer momento.
            </p>

            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={onFechar} className="text-white/70">
                Fechar
              </Button>
              <Button onClick={onRestaurar} className="bg-[#F26B1F] hover:bg-[#d95c14]">
                Restaurar duração original
              </Button>
            </div>
          </div>
        ) : (
          <p className="py-8 text-center text-sm text-white/40">Este clipe não vem de um arquivo de mídia.</p>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Info({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
      <p className="text-white/45">{titulo}</p>
      <p className="font-mono text-white">{valor}</p>
    </div>
  );
}
