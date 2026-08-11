import { describe, expect, it } from "vitest";
import { inserirAssetNaTimeline } from "@/lib/editair/layers";
import { estadoVazio } from "@/lib/editair/types";

const asset = { id: "a1", nome: "clipe.mov", kind: "video", durationMs: 4000 };

describe("inserirAssetNaTimeline", () => {
  it("insere vídeo no fim da trilha de vídeo", () => {
    const r = inserirAssetNaTimeline(estadoVazio(), asset);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.clip.trackId).toBe("t-video");
    expect(r.clip.start).toBe(0);
    expect(r.state.clips).toHaveLength(1);
  });

  it("cria camada quando o projeto não tem trilha de vídeo", () => {
    const base = estadoVazio();
    const s = { ...base, tracks: base.tracks.filter((t) => t.kind !== "video") };
    const r = inserirAssetNaTimeline(s, asset);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.criouTrack).toBe(true);
    expect(r.state.tracks.some((t) => t.id === r.clip.trackId)).toBe(true);
  });

  it("respeita destino do arrastar-e-soltar", () => {
    const r = inserirAssetNaTimeline(estadoVazio(), asset, { trackId: "t-broll", startMs: 2500 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.clip.trackId).toBe("t-broll");
    expect(r.clip.start).toBe(2500);
  });

  it("recusa camada bloqueada com motivo", () => {
    const base = estadoVazio();
    const s = { ...base, tracks: base.tracks.map((t) => (t.id === "t-video" ? { ...t, locked: true } : t)) };
    const r = inserirAssetNaTimeline(s, asset, { trackId: "t-video" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erro).toMatch(/bloqueada/i);
  });

  it("áudio vai para a trilha de música", () => {
    const r = inserirAssetNaTimeline(estadoVazio(), { ...asset, kind: "audio" });
    expect(r.ok && r.clip.trackId).toBe("t-music");
  });
});
