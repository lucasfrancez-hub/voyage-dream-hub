// @vitest-environment jsdom
/* Regressão: arrastar horizontalmente vídeo, imagem e legenda na timeline.
   O bug era o <img> do filmstrip iniciando drag-and-drop nativo → pointercancel
   → o arraste do clipe era cancelado. Legenda (sem filmstrip) funcionava. */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, fireEvent } from "@testing-library/react";
import { Timeline } from "@/components/editair/Timeline";
import { estadoVazio, type EditairClip, type ProjectState } from "@/lib/editair/types";

vi.mock("@/lib/editair/media", () => ({
  obterThumb: vi.fn(async () => "data:image/jpeg;base64,AAA"),
  obterPicos: vi.fn(async () => [0.2, 0.5, 0.8]),
  picosEmCache: vi.fn(() => null),
}));

afterEach(cleanup);

function clipe(over: Partial<EditairClip>): EditairClip {
  return {
    id: "c",
    trackId: "t-video",
    assetId: "a1",
    kind: "video",
    start: 10_000,
    duration: 4000,
    sourceIn: 0,
    sourceOut: 4000,
    speed: 1,
    transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 },
    ...over,
  } as EditairClip;
}

function montar(clips: EditairClip[], onAlterarClip = vi.fn()) {
  const base = estadoVazio();
  const state: ProjectState = { ...base, clips, durationMs: 60_000 };
  const props = {
    state,
    playheadMs: 0,
    zoom: 100, // 0,1 px/ms
    selecionados: [],
    selecao: null,
    assets: [{ id: "a1", name: "a.mp4", url: "blob:a", durationMs: 30_000 }],
    snapping: false,
    rippleTrim: false,
    onSeek: vi.fn(),
    onSelecionar: vi.fn(),
    onSelecao: vi.fn(),
    onAlterarClip,
    onAlterarClips: vi.fn(),
    onToggleTrack: vi.fn(),
    onAbrirSource: vi.fn(),
    onRestaurarClip: vi.fn(),
  } as unknown as Parameters<typeof Timeline>[0];
  return { ...render(<Timeline {...props} />), onAlterarClip };
}

/** Simula clicar no corpo do clipe e arrastar deltaPx horizontalmente. */
function arrastar(el: Element, deltaPx: number) {
  fireEvent.pointerDown(el, { button: 0, clientX: 200, clientY: 100 });
  fireEvent(window, new PointerEvent("pointermove", { clientX: 200 + deltaPx, clientY: 100, bubbles: true }));
  fireEvent(window, new PointerEvent("pointerup", { clientX: 200 + deltaPx, clientY: 100, bubbles: true }));
}

function corpoDoClipe(container: HTMLElement, titulo: string) {
  const el = container.querySelector(`[title="${titulo}"]`);
  if (!el) throw new Error(`clipe "${titulo}" não encontrado`);
  return el;
}

describe("arraste horizontal do clipe", () => {
  for (const kind of ["video", "image", "caption"] as const) {
    it(`${kind}: arrastar para a direita muda o start`, () => {
      const onAlterarClip = vi.fn();
      const c = clipe({ id: kind, kind, label: kind, text: kind === "caption" ? kind : undefined });
      const { container } = montar([c], onAlterarClip);
      arrastar(corpoDoClipe(container, kind), 300); // +3s a 0,1 px/ms
      const chamada = onAlterarClip.mock.calls.find((ch) => ch[1]?.start !== undefined);
      expect(chamada, `${kind} não iniciou o arraste`).toBeTruthy();
      expect(chamada![1].start).toBeGreaterThan(c.start);
    });

    it(`${kind}: arrastar para a esquerda muda o start`, () => {
      const onAlterarClip = vi.fn();
      const c = clipe({ id: kind, kind, label: kind, text: kind === "caption" ? kind : undefined });
      const { container } = montar([c], onAlterarClip);
      arrastar(corpoDoClipe(container, kind), -200);
      const chamada = onAlterarClip.mock.calls.find((ch) => ch[1]?.start !== undefined);
      expect(chamada, `${kind} não iniciou o arraste`).toBeTruthy();
      expect(chamada![1].start).toBeLessThan(c.start);
    });
  }

  it("miniaturas do filmstrip não roubam o mouse nem são arrastáveis", async () => {
    const { container } = montar([clipe({ id: "v", label: "v" })]);
    await new Promise((r) => setTimeout(r, 0));
    const imgs = container.querySelectorAll<HTMLImageElement>('[data-testid="filmstrip-thumb"]');
    for (const img of imgs) {
      expect(img.draggable).toBe(false);
      expect(img.className).toContain("pointer-events-none");
    }
  });
});
