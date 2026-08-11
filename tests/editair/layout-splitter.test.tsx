import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { WorkspaceLayout } from "@/components/editair/WorkspaceLayout";
import {
  ALTURA_SPLITTER,
  MIN_AREA_SUPERIOR,
  MIN_TIMELINE,
  MAX_TIMELINE,
  alturaDistribuivel,
  clampAlturaTimeline,
  gridRowsWorkspace,
  redimensionarTimeline,
  type LayoutWorkspace,
} from "@/lib/editair/layout-workspace";

const LAYOUT: LayoutWorkspace = { alturaTimeline: 300, larguraBiblioteca: 300, larguraInspector: 282 };
const DISPONIVEL = alturaDistribuivel(1200);

describe("layout do workspace — estados independentes", () => {
  it("arrastar +200px só altera a altura da timeline", () => {
    const depois = redimensionarTimeline(LAYOUT, 200, DISPONIVEL);
    expect(depois.alturaTimeline).toBe(500);
    expect(depois.larguraBiblioteca).toBe(LAYOUT.larguraBiblioteca);
    expect(depois.larguraInspector).toBe(LAYOUT.larguraInspector);
  });

  it("movimento inverso volta ao estado original", () => {
    const volta = redimensionarTimeline(redimensionarTimeline(LAYOUT, 200, DISPONIVEL), -200, DISPONIVEL);
    expect(volta).toEqual(LAYOUT);
  });

  it("o splitter para no limite, sem comprimir as colunas", () => {
    const enorme = redimensionarTimeline(LAYOUT, 5000, DISPONIVEL);
    expect(enorme.alturaTimeline).toBeLessThanOrEqual(MAX_TIMELINE);
    expect(enorme.alturaTimeline).toBeLessThanOrEqual(DISPONIVEL - MIN_AREA_SUPERIOR);
    expect(enorme.larguraBiblioteca).toBe(LAYOUT.larguraBiblioteca);

    const minimo = redimensionarTimeline(LAYOUT, -5000, DISPONIVEL);
    expect(minimo.alturaTimeline).toBe(MIN_TIMELINE);
    expect(minimo.larguraInspector).toBe(LAYOUT.larguraInspector);
  });

  it("a altura distribuível desconta header, topbar e o próprio splitter", () => {
    expect(alturaDistribuivel(1000)).toBe(1000 - 56 - 46 - ALTURA_SPLITTER);
    // a soma das linhas nunca estoura o container (sem scroll da página)
    const h = clampAlturaTimeline(9999, alturaDistribuivel(800));
    expect(46 + MIN_AREA_SUPERIOR + ALTURA_SPLITTER + h).toBeLessThanOrEqual(800 - 56);
  });

  it("as linhas do workspace não contêm nenhuma definição de coluna", () => {
    const linhas = gridRowsWorkspace(420);
    expect(linhas).toContain("420px");
    expect(linhas).not.toMatch(/columns|76px|282px/);
  });
});

describe("WorkspaceLayout no DOM", () => {
  function montar(altura = 300, onAltura = vi.fn()) {
    const r = render(
      <WorkspaceLayout
        alturaTimeline={altura}
        onAlturaTimeline={onAltura}
        topbar={<div>topbar</div>}
        rail={<div>rail</div>}
        biblioteca={<div>Biblioteca</div>}
        player={<div>Reprodutor</div>}
        inspector={<div>Inspector</div>}
        timeline={<div>Timeline</div>}
      />,
    );
    return { ...r, onAltura };
  }

  it("arrastar o splitter 200px para cima só muda a altura pedida", () => {
    const onAltura = vi.fn();
    montar(300, onAltura);
    const upper = screen.getByTestId("editair-upper") as HTMLElement;
    const colunasAntes = upper.style.gridTemplateColumns;
    const layout = screen.getByTestId("editair-layout") as HTMLElement;
    const linhasAntes = layout.style.gridTemplateRows;

    fireEvent.pointerDown(screen.getByTestId("editair-splitter"), { clientY: 800 });
    fireEvent(window, Object.assign(new Event("pointermove"), { clientY: 600 }));
    fireEvent(window, new Event("pointerup"));

    expect(onAltura).toHaveBeenCalledWith(500);
    // nenhuma largura recalculada e nenhuma coluna tocada
    expect(upper.style.gridTemplateColumns).toBe(colunasAntes);
    expect(colunasAntes).toContain("minmax(var(--w-min-player), 1fr)");
    expect(linhasAntes).toBe(layout.style.gridTemplateRows);
  });

  it("as três regiões superiores continuam visíveis e na mesma coluna", () => {
    montar(700);
    expect(screen.getByText("Biblioteca")).toBeTruthy();
    expect(screen.getByText("Reprodutor")).toBeTruthy();
    expect(screen.getByText("Inspector")).toBeTruthy();
    const upper = screen.getByTestId("editair-upper");
    expect(upper.contains(screen.getByTestId("editair-player"))).toBe(true);
    expect(upper.contains(screen.getByTestId("editair-inspector-col"))).toBe(true);
    // o splitter é irmão da área superior, não filho dela
    expect(upper.contains(screen.getByTestId("editair-splitter"))).toBe(false);
  });

  it("a altura da timeline só aparece na 4ª linha e a raiz não deixa a página estourar", () => {
    montar(420);
    const layout = screen.getByTestId("editair-layout") as HTMLElement;
    expect(layout.style.gridTemplateRows.endsWith("420px")).toBe(true);
    expect(layout.className).toContain("overflow-hidden");
  });

  it("Esc cancela o arrasto e restaura a altura inicial", () => {
    const onAltura = vi.fn();
    montar(300, onAltura);
    fireEvent.pointerDown(screen.getByTestId("editair-splitter"), { clientY: 800 });
    fireEvent(window, Object.assign(new Event("pointermove"), { clientY: 700 }));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onAltura).toHaveBeenLastCalledWith(300);
  });
});
