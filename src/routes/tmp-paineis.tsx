import { createFileRoute } from "@tanstack/react-router";
import { ToolPanel, type ToolPanelProps } from "@/components/editair/ToolPanels";
import { estadoVazio, novoId, transformPadrao, type EditairClip } from "@/lib/editair/types";

export const Route = createFileRoute("/tmp-paineis")({ component: Tmp });

function Tmp() {
  const base = estadoVazio();
  const clip: EditairClip = {
    id: novoId(),
    trackId: base.tracks[0]?.id ?? "t-v1",
    kind: "video",
    start: 0,
    duration: 6000,
    sourceIn: 0,
    volume: 100,
    speed: 1,
    transform: transformPadrao(),
    assetId: "a1",
    label: "Clipe demo",
  };
  const state = { ...base, clips: [clip] };
  const props = {
    state,
    clip,
    assets: [{ id: "a1", nome: "demo.mp4", kind: "video", duration: 6000, url: "", thumbUrl: null }],
    transcript: null,
    mensagens: [],
    pensando: false,
    playheadMs: 0,
    plano: null,
    etapaIa: "",
    onPlanejar: () => {},
    onAplicarPlano: () => {},
    onAjustarPlano: () => {},
    onDescartarPlano: () => {},
    onImportar: () => {},
    onRenomearAsset: () => {},
    onExcluirAsset: () => {},
    onInserirAsset: () => {},
    onPatchClip: () => {},
    onPatchState: () => {},
    onCaption: () => {},
    onAdicionarTexto: () => {},
    onAnalisar: () => {},
    onGerarLegendas: () => {},
    onCortarPausas: () => {},
    onSepararAudio: () => {},
    onNormalizar: () => {},
    onExtrairAudio: () => {},
    onKeyframe: () => {},
    onEnviarIa: () => {},
    onSeek: () => {},
    onApagarTrecho: () => {},
  } as unknown as ToolPanelProps;

  const ferramentas = ["transicoes", "filtros", "ajuste", "fundo", "stickers", "modelos"] as const;

  return (
    <div className="flex gap-3 bg-[#111214] p-4 text-white" style={{ height: "100vh" }}>
      {ferramentas.map((f) => (
        <div key={f} data-painel={f} className="h-full w-[300px] overflow-hidden rounded-xl bg-[#17181b]">
          <ToolPanel {...props} ferramenta={f as ToolPanelProps["ferramenta"]} />
        </div>
      ))}
    </div>
  );
}
