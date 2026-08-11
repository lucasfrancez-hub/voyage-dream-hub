/* TEMPORÁRIO — harness de auditoria da timeline (será removido). */
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { WorkspaceLayout } from "@/components/editair/WorkspaceLayout";
import { Timeline } from "@/components/editair/Timeline";
import type { ProjectState } from "@/lib/editair/types";

export const Route = createFileRoute("/audit-timeline")({
  ssr: false,
  component: Harness,
  head: () => ({ meta: [{ title: "Audit timeline" }, { name: "robots", content: "noindex, nofollow" }] }),
});

const tracks = [
  { id: "t-video", name: "Vídeo 1", kind: "video" },
  { id: "t-video-2", name: "Vídeo 2", kind: "video" },
  { id: "t-music", name: "Música", kind: "music" },
];

const clips = Array.from({ length: 12 }, (_, i) => ({
  id: `c${i}`,
  trackId: tracks[i % 3]!.id,
  start: i * 20000,
  duration: 15000,
  inPoint: 0,
  assetId: "a1",
  kind: "video",
}));

const state = {
  id: "audit",
  name: "audit",
  durationMs: 300000,
  tracks,
  clips,
  marcadores: [{ id: "m1", atMs: 40000, cor: "#F26B1F", nota: "m" }],
} as unknown as ProjectState;

function Harness() {
  const [altura, setAltura] = useState(300);
  const [zoom, setZoom] = useState(60);
  const [sel, setSel] = useState<string[]>([]);
  const [ms, setMs] = useState(5000);
  return (
    <WorkspaceLayout
      alturaTimeline={altura}
      onAlturaTimeline={setAltura}
      topbar={<div className="h-full">topbar</div>}
      rail={<div>rail</div>}
      biblioteca={<div>bib</div>}
      player={<div>player</div>}
      inspector={<div>insp</div>}
      timeline={
        <>
          <div className="border-b border-white/10">toolbar</div>
          <Timeline
            state={state}
            playheadMs={ms}
            zoom={zoom}
            onZoom={setZoom}
            selecionados={sel}
            selecao={null}
            assets={{ a1: { id: "a1", url: "", durationMs: 60000, kind: "video", name: "a" } }}
            snapping
            rippleTrim={false}
            onSeek={setMs}
            onSelecionar={setSel}
            onSelecao={() => {}}
            onAlterarClip={() => {}}
            onAlterarClips={() => {}}
            onToggleTrack={() => {}}
            onAbrirSource={() => {}}
            onRestaurarClip={() => {}}
          />
        </>
      }
    />
  );
}
