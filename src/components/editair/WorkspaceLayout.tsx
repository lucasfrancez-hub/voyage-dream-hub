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

  const iniciarArrasto = (clientY: number) => {
    if (arrastando.current) return;
    arrastando.current = true;
    const y0 = clientY;
    const h0 = alturaTimeline;
    const mover = (ev: PointerEvent) => onAlturaTimeline(clampAlturaTimeline(h0 + (y0 - ev.clientY), disponivel()));
    const encerrar = () => {
      arrastando.current = false;
      window.removeEventListener("pointermove", mover);
      window.removeEventListener("pointerup", encerrar);
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
    window.addEventListener("pointermove", mover);
    window.addEventListener("pointerup", encerrar);
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

      {/* SPLITTER — pertence à divisão superior ↔ timeline */}
      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label="Redimensionar timeline"
        data-testid="editair-splitter"
        style={{ height: ALTURA_SPLITTER }}
        onPointerDown={(e) => {
          e.preventDefault();
          iniciarArrasto(e.clientY);
        }}
        className="group flex cursor-row-resize items-center justify-center bg-white/5 transition hover:bg-[#F26B1F]/40"
      >
        <span className="h-0.5 w-16 rounded-full bg-white/20 group-hover:bg-[#F26B1F]" />
      </div>

      {/* TIMELINE */}
      <div className="grid min-h-0 min-w-0 grid-rows-[42px_1fr] overflow-hidden border-t border-white/10" data-testid="editair-timeline-region">
        {timeline}
      </div>
    </div>
  );
}
