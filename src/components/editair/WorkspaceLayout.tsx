import { type ReactNode, useCallback, useEffect, useRef } from "react";
import {
  ALTURA_SPLITTER,
  LARGURAS_WORKSPACE,
  alturaDistribuivel,
  clampAlturaTimeline,
  gridRowsWorkspace,
} from "@/lib/editair/layout-workspace";

type Props = {
  topbar: ReactNode;
  rail: ReactNode;
  biblioteca: ReactNode;
  player: ReactNode;
  inspector: ReactNode;
  timeline: ReactNode;
  alturaTimeline: number;
  onAlturaTimeline: (h: number) => void;
};

/**
 * Estrutura do editor em duas regiões independentes:
 *
 *   Workspace (grid de LINHAS)
 *     ├── Topbar
 *     ├── UpperWorkspace (grid de COLUNAS próprio)
 *     ├── HorizontalSplitter
 *     └── Timeline
 *
 * A altura da timeline vive apenas na 4ª linha do workspace; as colunas da
 * área superior são declaradas dentro do UpperWorkspace e nunca participam
 * do cálculo vertical.
 */
export function WorkspaceLayout({
  topbar,
  rail,
  biblioteca,
  player,
  inspector,
  timeline,
  alturaTimeline,
  onAlturaTimeline,
}: Props) {
  const arrastando = useRef(false);

  const disponivel = useCallback(
    () => alturaDistribuivel(typeof window === "undefined" ? 900 : window.innerHeight),
    [],
  );

  // rejustar ao redimensionar a janela (nunca mexe em larguras)
  useEffect(() => {
    const ajustar = () => onAlturaTimeline(clampAlturaTimeline(alturaTimeline, disponivel()));
    window.addEventListener("resize", ajustar);
    return () => window.removeEventListener("resize", ajustar);
  }, [alturaTimeline, disponivel, onAlturaTimeline]);

  /* Arrasto do splitter.
     No Electron/macOS listeners de window podem perder pointermove quando o
     ponteiro passa por cima de iframes/canvas/áreas com captura própria; por
     isso capturamos o ponteiro no próprio elemento e ouvimos nele. */
  const iniciarArrasto = (e: React.PointerEvent<HTMLDivElement>) => {
    if (arrastando.current) return;
    arrastando.current = true;
    const alvo = e.currentTarget;
    const ponteiro = e.pointerId;
    try {
      alvo.setPointerCapture(ponteiro);
    } catch {
      /* navegador sem captura: os listeners de window abaixo cobrem */
    }
    const y0 = e.clientY;
    const h0 = alturaTimeline;
    const mover = (ev: PointerEvent) => onAlturaTimeline(clampAlturaTimeline(h0 + (y0 - ev.clientY), disponivel()));
    const encerrar = () => {
      if (!arrastando.current) return;
      arrastando.current = false;
      try {
        if (alvo.hasPointerCapture?.(ponteiro)) alvo.releasePointerCapture(ponteiro);
      } catch {
        /* já liberado */
      }
      alvo.removeEventListener("pointermove", mover);
      alvo.removeEventListener("pointerup", encerrar);
      alvo.removeEventListener("pointercancel", encerrar);
      alvo.removeEventListener("lostpointercapture", encerrar);
      window.removeEventListener("pointermove", mover);
      window.removeEventListener("pointerup", encerrar);
      window.removeEventListener("pointercancel", encerrar);
      window.removeEventListener("blur", encerrar);
      window.removeEventListener("keydown", cancelar);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
    const cancelar = (ev: KeyboardEvent) => {
      if (ev.key !== "Escape") return;
      onAlturaTimeline(h0);
      encerrar();
    };
    document.body.style.userSelect = "none";
    document.body.style.cursor = "row-resize";
    alvo.addEventListener("pointermove", mover);
    alvo.addEventListener("pointerup", encerrar);
    alvo.addEventListener("pointercancel", encerrar);
    alvo.addEventListener("lostpointercapture", encerrar);
    window.addEventListener("pointermove", mover);
    window.addEventListener("pointerup", encerrar);
    window.addEventListener("pointercancel", encerrar);
    window.addEventListener("blur", encerrar);
    window.addEventListener("keydown", cancelar);
  };


  return (
    <div
      className="grid h-[calc(100vh-3.5rem)] overflow-hidden bg-[#0c0f13]"
      style={{ gridTemplateRows: gridRowsWorkspace(alturaTimeline) }}
      data-testid="editair-layout"
    >
      <div className="min-w-0 overflow-hidden" data-testid="editair-topbar">
        {topbar}
      </div>

      {/* ÁREA SUPERIOR — dona exclusiva das colunas */}
      <div
        data-testid="editair-upper"
        className="grid min-h-0 min-w-0 overflow-hidden [--w-biblioteca:300px] [--w-inspector:282px] [--w-min-player:320px] xl:[--w-biblioteca:340px] xl:[--w-inspector:312px] xl:[--w-min-player:420px]"
        style={{
          gridTemplateColumns: `${LARGURAS_WORKSPACE.rail}px var(--w-biblioteca) minmax(var(--w-min-player), 1fr) var(--w-inspector)`,
        }}
      >
        <div className="flex min-h-0 min-w-0 flex-col overflow-hidden" data-testid="editair-rail">
          {rail}
        </div>
        <div className="min-h-0 min-w-0 overflow-hidden" data-testid="editair-biblioteca">
          {biblioteca}
        </div>
        <div className="grid min-h-0 min-w-0 overflow-hidden" data-testid="editair-player">
          {player}
        </div>
        <div className="grid min-h-0 min-w-0 overflow-hidden" data-testid="editair-inspector-col">
          {inspector}
        </div>
      </div>

      {/* SPLITTER — visual de 6px, área de toque de 18px (Fitts / Electron) */}
      <div
        style={{ height: ALTURA_SPLITTER }}
        className="group relative z-40 flex items-center justify-center bg-white/5 transition hover:bg-[#F26B1F]/40"
      >
        <span className="pointer-events-none h-0.5 w-16 rounded-full bg-white/20 group-hover:bg-[#F26B1F]" />
        <div
          role="separator"
          aria-orientation="horizontal"
          aria-label="Redimensionar timeline"
          data-testid="editair-splitter"
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            e.preventDefault();
            e.stopPropagation();
            iniciarArrasto(e);
          }}
          onDoubleClick={() => onAlturaTimeline(clampAlturaTimeline(320, disponivel()))}
          style={{ touchAction: "none" }}
          className="absolute inset-x-0 -top-1.5 -bottom-1.5 cursor-row-resize"
        />
      </div>


      {/* TIMELINE */}
      <div className="grid min-h-0 min-w-0 grid-rows-[42px_1fr] overflow-hidden border-t border-white/10" data-testid="editair-timeline-region">
        {timeline}
      </div>
    </div>
  );
}
