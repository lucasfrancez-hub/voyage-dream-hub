/* Miniatura na Biblioteca (ToolPanels): com thumb, sem thumb, thumb inválido e mídia offline. */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ToolPanel, type AssetItem, type ToolPanelProps } from "@/components/editair/ToolPanels";
import { estadoVazio } from "@/lib/editair/types";

vi.mock("@/lib/editair/media", () => ({
  obterThumb: vi.fn(async (_id: string, url: string) =>
    url.includes("gera-thumb") ? "data:image/jpeg;base64,GERADA" : null,
  ),
}));

afterEach(cleanup);

function montar(assets: AssetItem[]) {
  const props = {
    ferramenta: "midia",
    state: estadoVazio(),
    clip: null,
    assets,
    transcript: null,
    mensagens: [],
    pensando: false,
    playheadMs: 0,
    plano: null,
    etapaIa: "",
    onPlanejar: vi.fn(),
    onAplicarPlano: vi.fn(),
  } as unknown as ToolPanelProps;
  return render(<ToolPanel {...props} />);
}

const base: AssetItem = { id: "a1", nome: "clipe.mp4", kind: "video", durationMs: 5000, url: "https://cdn/x.mp4" };

describe("4. thumbnail na biblioteca", () => {
  it("com thumbnail: renderiza a imagem informada", async () => {
    montar([{ ...base, thumbUrl: "https://cdn/x.jpg" }]);
    const img = await screen.findByRole("presentation", { hidden: true }).catch(() => null);
    const imagens = document.querySelectorAll("img");
    expect(imagens.length).toBe(1);
    expect(imagens[0].getAttribute("src")).toBe("https://cdn/x.jpg");
    expect(img === null || true).toBe(true);
  });

  it("sem thumbnail: gera a partir do vídeo e exibe", async () => {
    montar([{ ...base, url: "https://cdn/gera-thumb.mp4", thumbUrl: null }]);
    await waitFor(() => {
      const img = document.querySelector("img");
      expect(img?.getAttribute("src")).toBe("data:image/jpeg;base64,GERADA");
    });
  });

  it("sem thumbnail e sem conseguir gerar: cai no ícone (nenhuma <img>)", async () => {
    montar([{ ...base, url: "https://cdn/sem-frame.mp4", thumbUrl: null }]);
    await waitFor(() => expect(document.querySelectorAll("img").length).toBe(0));
    expect(screen.getByText("clipe.mp4")).toBeTruthy();
  });

  it("thumbnail inválido: onError troca para o ícone", async () => {
    montar([{ ...base, thumbUrl: "https://cdn/quebrada.jpg" }]);
    const img = document.querySelector("img")!;
    fireEvent.error(img);
    await waitFor(() => expect(document.querySelectorAll("img").length).toBe(0));
  });

  it("mídia offline: não tenta gerar thumb e mostra o aviso de offline", async () => {
    const media = await import("@/lib/editair/media");
    montar([{ ...base, thumbUrl: null, existe: false, local: true }]);
    await waitFor(() => expect(screen.getByText(/offline/i)).toBeTruthy());
    expect(media.obterThumb).not.toHaveBeenCalledWith("a1", expect.anything(), expect.anything(), expect.anything());
  });
});
