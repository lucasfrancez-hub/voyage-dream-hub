/* Validação funcional: camadas, drag vertical, lock/hidden/mute/solo,
   menu contextual, ações do menu, undo/redo, IA no escopo do clipe e persistência.
   Usa exatamente as funções que a rota e a Timeline chamam em produção. */
import { describe, expect, it } from "vitest";
import {
  acaoDeClip,
  alternarTrack,
  criarTrackEm,
  excluirTrack,
  moverClipCamada,
  novaCamadaJunto,
  ordemDeCamadas,
  podeEditarClip,
  posicionarMenu,
  reordenarTracks,
  soltarClipEm,
  type ResultadoCamada,
} from "@/lib/editair/layers";
import { aplicarOps, type EditairOp } from "@/lib/editair/ops";
import {
  estadoVazio,
  normalizarEstado,
  novoId,
  recalcularDuracao,
  transformPadrao,
  type EditairClip,
  type ProjectState,
} from "@/lib/editair/types";

/* --------- histórico igual ao da rota (aplicar / desfazer / refazer) --------- */
class Editor {
  private hist: ProjectState[] = [];
  private fut: ProjectState[] = [];
  constructor(public state: ProjectState) {}
  aplicar(p: ProjectState) {
    this.hist.push(this.state);
    this.fut = [];
    this.state = recalcularDuracao(p);
  }
  usar(r: ResultadoCamada) {
    if (r.ok) this.aplicar(r.state);
    return r;
  }
  desfazer() {
    const a = this.hist.pop();
    if (!a) return;
    this.fut.push(this.state);
    this.state = a;
  }
  refazer() {
    const p = this.fut.pop();
    if (!p) return;
    this.hist.push(this.state);
    this.state = p;
  }
}

function clip(over: Partial<EditairClip> & { id: string; trackId: string }): EditairClip {
  return {
    kind: "video",
    assetId: `asset-${over.id}`,
    start: 0,
    duration: 4000,
    sourceIn: 0,
    volume: 1,
    speed: 1,
    transform: transformPadrao(),
    label: over.id,
    ...over,
  } as EditairClip;
}

/** Projeto de teste: Vídeo 1/2/3 com um clipe em cada camada. */
function projeto3Camadas() {
  let s = estadoVazio();
  // pilha: índice 0 = topo. Vídeo 3 (topo) > Vídeo 2 > Vídeo 1 (base = t-video)
  const r2 = criarTrackEm(s, 0);
  s = r2.state;
  const r3 = criarTrackEm(s, 0);
  s = r3.state;
  const v2 = r2.trackId;
  const v3 = r3.trackId;
  s = recalcularDuracao({
    ...s,
    clips: [
      clip({ id: "A", trackId: "t-video" }),
      clip({ id: "B", trackId: v2 }),
      clip({ id: "C", trackId: v3 }),
    ],
  });
  return { s, v1: "t-video", v2, v3 };
}

describe("1. camadas / tracks", () => {
  it("três vídeos em três camadas distintas", () => {
    const { s, v1, v2, v3 } = projeto3Camadas();
    expect(s.clips.map((c) => c.trackId)).toEqual([v1, v2, v3]);
    expect(new Set([v1, v2, v3]).size).toBe(3);
  });

  it("ordem visual: Vídeo 3 acima de Vídeo 2 acima de Vídeo 1", () => {
    const { s, v1, v2, v3 } = projeto3Camadas();
    const ordem = ordemDeCamadas(s);
    expect(ordem.indexOf(v3)).toBeLessThan(ordem.indexOf(v2));
    expect(ordem.indexOf(v2)).toBeLessThan(ordem.indexOf(v1));
  });

  it("reordenar pelo cabeçalho muda a prioridade imediatamente", () => {
    const ed = new Editor(projeto3Camadas().s);
    const antes = ordemDeCamadas(ed.state);
    ed.usar(reordenarTracks(ed.state, 0, 2));
    const depois = ordemDeCamadas(ed.state);
    expect(depois[2]).toBe(antes[0]);
    expect(depois.length).toBe(antes.length);
    ed.desfazer();
    expect(ordemDeCamadas(ed.state)).toEqual(antes);
  });
});

describe("2. drag vertical entre camadas", () => {
  it("clip de Vídeo 1 vai para Vídeo 2 preservando/atualizando o start; undo volta", () => {
    const { s, v2 } = projeto3Camadas();
    const ed = new Editor(s);
    ed.usar(soltarClipEm(ed.state, "A", { tipo: "track", trackId: v2 }, 1500));
    const a = ed.state.clips.find((c) => c.id === "A")!;
    expect(a.trackId).toBe(v2);
    expect(a.start).toBe(1500);
    ed.desfazer();
    expect(ed.state.clips.find((c) => c.id === "A")!.trackId).toBe("t-video");
    expect(ed.state.clips.find((c) => c.id === "A")!.start).toBe(0);
  });

  it("soltar acima da camada mais alta cria uma nova camada e move o clip; undo remove tudo", () => {
    const { s } = projeto3Camadas();
    const ed = new Editor(s);
    const tracksAntes = ed.state.tracks.length;
    const r = ed.usar(soltarClipEm(ed.state, "A", { tipo: "nova", indice: 0 }, 800)) as { ok: true; trackId: string };
    expect(ed.state.tracks.length).toBe(tracksAntes + 1);
    expect(ordemDeCamadas(ed.state)[0]).toBe(r.trackId);
    expect(ed.state.clips.find((c) => c.id === "A")!.trackId).toBe(r.trackId);
    ed.desfazer();
    expect(ed.state.tracks.length).toBe(tracksAntes);
    expect(ed.state.clips.find((c) => c.id === "A")!.trackId).toBe("t-video");
  });

  it("soltar abaixo da pilha cria camada no fim", () => {
    const { s } = projeto3Camadas();
    const r = soltarClipEm(s, "C", { tipo: "nova", indice: s.tracks.length }, 0) as { ok: true; trackId: string };
    expect(r.ok).toBe(true);
    expect(ordemDeCamadas(r.state ?? s).at(-1)).toBe(r.trackId);
  });
});

describe("3. camada bloqueada", () => {
  it("bloqueia mover, dividir, aparar, excluir e ripple — e volta a funcionar ao desbloquear", () => {
    const { s, v2 } = projeto3Camadas();
    const travado = alternarTrack(s, "t-video", "locked");
    expect(travado.tracks.find((t) => t.id === "t-video")!.locked).toBe(true);

    expect(podeEditarClip(travado, "A").ok).toBe(false);
    for (const acao of ["dividir", "aparar", "excluir", "ripple", "duplicar"] as const) {
      const r = acaoDeClip(travado, "A", acao, { playheadMs: 2000 });
      expect(r.ok, acao).toBe(false);
      if (!r.ok) expect(r.erro).toMatch(/bloqueada/i);
    }
    expect(soltarClipEm(travado, "A", { tipo: "track", trackId: v2 }, 500).ok).toBe(false);
    expect(moverClipCamada(travado, "A", -1).ok).toBe(false);

    const solto = alternarTrack(travado, "t-video", "locked");
    expect(acaoDeClip(solto, "A", "dividir", { playheadMs: 2000 }).ok).toBe(true);
    expect(soltarClipEm(solto, "A", { tipo: "track", trackId: v2 }, 500).ok).toBe(true);
  });

  it("mover um clipe PARA uma camada bloqueada também é recusado", () => {
    const { s, v2 } = projeto3Camadas();
    const travado = alternarTrack(s, v2, "locked");
    const r = soltarClipEm(travado, "A", { tipo: "track", trackId: v2 }, 0);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erro).toMatch(/bloqueada/i);
    // mover pelo menu para a vizinha bloqueada também é recusado
    const iA = travado.tracks.findIndex((t) => t.id === "t-video");
    const iV2 = travado.tracks.findIndex((t) => t.id === v2);
    if (Math.abs(iA - iV2) === 1) expect(moverClipCamada(travado, "A", iV2 < iA ? -1 : 1).ok).toBe(false);
  });
});

describe("4. camada oculta", () => {
  it("continua na timeline, some do preview e volta ao mostrar", () => {
    const { s, v3 } = projeto3Camadas();
    const oculto = alternarTrack(s, v3, "hidden");
    expect(oculto.tracks.find((t) => t.id === v3)!.hidden).toBe(true);
    expect(oculto.clips.some((c) => c.trackId === v3)).toBe(true); // clip permanece
    expect(visiveisNoPreview(oculto, 100)).toEqual(["A", "B"]);
    const devolta = alternarTrack(oculto, v3, "hidden");
    expect(visiveisNoPreview(devolta, 100)).toEqual(["A", "B", "C"]);
  });
});

/** Mesma regra do engine.desenhar: pula trilha hidden e ordena por índice de track. */
function visiveisNoPreview(s: ProjectState, t: number) {
  const idx = new Map(s.tracks.map((tr, i) => [tr.id, i] as const));
  return s.clips
    .filter((c) => t >= c.start && t <= c.start + c.duration)
    .filter((c) => !s.tracks.find((tr) => tr.id === c.trackId)?.hidden)
    .sort((a, b) => -(idx.get(a.trackId) ?? 99) - -(idx.get(b.trackId) ?? 99))
    .map((c) => c.id);
}

/** Mesma regra do engine.ganhoDoClipe (mute/solo/track). */
function ganho(s: ProjectState, cid: string) {
  const c = s.clips.find((x) => x.id === cid)!;
  const tr = s.tracks.find((t) => t.id === c.trackId);
  if (s.tracks.some((t) => t.solo) && !tr?.solo) return 0;
  if (c.muted || c.semAudio || tr?.muted) return 0;
  return c.volume;
}

describe("5. mute / solo", () => {
  it("mute na track zera o ganho só dela", () => {
    const { s, v2 } = projeto3Camadas();
    const m = alternarTrack(s, v2, "muted");
    expect(ganho(m, "B")).toBe(0);
    expect(ganho(m, "A")).toBe(1);
  });

  it("solo em uma track silencia todas as outras", () => {
    const { s, v3 } = projeto3Camadas();
    const so = alternarTrack(s, v3, "solo");
    expect(ganho(so, "C")).toBe(1);
    expect(ganho(so, "A")).toBe(0);
    expect(ganho(so, "B")).toBe(0);
  });

  it("silenciar o clipe pelo menu zera só aquele clipe (e é reversível)", () => {
    const ed = new Editor(projeto3Camadas().s);
    ed.usar(acaoDeClip(ed.state, "A", "silenciar"));
    expect(ganho(ed.state, "A")).toBe(0);
    expect(ganho(ed.state, "B")).toBe(1);
    ed.desfazer();
    expect(ganho(ed.state, "A")).toBe(1);
  });
});

describe("6. picture-in-picture", () => {
  it("clip de cima escalado/deslocado não apaga o de baixo e mantém a ordem", () => {
    const { s, v2 } = projeto3Camadas();
    const pip = aplicarOps(
      s,
      [{ op: "set_transform", clipId: "B", scale: 0.3, x: 300, y: -500 }] as EditairOp[],
      null,
    ).state;
    const b = pip.clips.find((c) => c.id === "B")!;
    expect(b.transform.scale).toBe(0.3);
    expect(b.transform.x).toBe(300);
    expect(b.transform.y).toBe(-500);
    expect(b.trackId).toBe(v2);
    // A (base) continua visível e B é desenhado depois (por cima)
    const ordem = visiveisNoPreview(pip, 100);
    expect(ordem).toContain("A");
    expect(ordem.indexOf("A")).toBeLessThan(ordem.indexOf("B"));
    expect(pip.clips.find((c) => c.id === "A")!.transform.scale).toBe(1);
  });
});

describe("7. menu contextual — collision detection", () => {
  const VW = 1280;
  const VH = 800;
  const W = 220;
  const H = 320;

  it("no topo: abre para baixo, sem sair da tela", () => {
    expect(posicionarMenu(100, 20, W, H, VW, VH)).toEqual({ x: 100, y: 20 });
  });

  it("no meio: mantém a posição do cursor", () => {
    expect(posicionarMenu(600, 300, W, H, VW, VH)).toEqual({ x: 600, y: 300 });
  });

  it("perto do rodapé: vira para cima", () => {
    const p = posicionarMenu(600, 760, W, H, VW, VH);
    expect(p.y).toBeLessThan(760);
    expect(p.y + H).toBeLessThanOrEqual(VH);
    expect(p.y).toBeGreaterThanOrEqual(8);
  });

  it("canto direito: desloca para a esquerda", () => {
    const p = posicionarMenu(1270, 200, W, H, VW, VH);
    expect(p.x + W).toBeLessThanOrEqual(VW - 8 + 1);
    expect(p.x).toBeLessThan(1270);
  });

  it("canto esquerdo: nunca fica negativo", () => {
    expect(posicionarMenu(2, 100, W, H, VW, VH).x).toBeGreaterThanOrEqual(8);
  });

  it("canto inferior direito: flip + shift ao mesmo tempo", () => {
    const p = posicionarMenu(1275, 790, W, H, VW, VH);
    expect(p.x + W).toBeLessThanOrEqual(VW);
    expect(p.y + H).toBeLessThanOrEqual(VH);
  });

  it("menu maior que a janela: encosta na margem em vez de cortar por cima", () => {
    const p = posicionarMenu(400, 400, 300, 2000, VW, VH);
    expect(p.y).toBe(8);
    expect(p.x).toBeGreaterThanOrEqual(8);
  });
});

describe("8. ações do menu de contexto", () => {
  const mk = () => new Editor(projeto3Camadas().s);

  it("dividir no playhead gera dois clipes contíguos e entra no undo", () => {
    const ed = mk();
    ed.usar(acaoDeClip(ed.state, "A", "dividir", { playheadMs: 1500 }));
    const naTrilha = ed.state.clips.filter((c) => c.trackId === "t-video").sort((a, b) => a.start - b.start);
    expect(naTrilha).toHaveLength(2);
    expect(naTrilha[0].duration).toBe(1500);
    expect(naTrilha[1].start).toBe(1500);
    expect(naTrilha[0].start + naTrilha[0].duration).toBe(naTrilha[1].start);
    ed.desfazer();
    expect(ed.state.clips.filter((c) => c.trackId === "t-video")).toHaveLength(1);
  });

  it("dividir fora do clipe é recusado com mensagem clara", () => {
    const r = acaoDeClip(projeto3Camadas().s, "A", "dividir", { playheadMs: 9999 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erro).toMatch(/playhead/i);
  });

  it("aparar corta a duração no playhead", () => {
    const ed = mk();
    ed.usar(acaoDeClip(ed.state, "A", "aparar", { playheadMs: 2500 }));
    expect(ed.state.clips.find((c) => c.id === "A")!.duration).toBe(2500);
    ed.desfazer();
    expect(ed.state.clips.find((c) => c.id === "A")!.duration).toBe(4000);
  });

  it("restaurar devolve a duração integral do arquivo", () => {
    const ed = mk();
    ed.usar(acaoDeClip(ed.state, "A", "aparar", { playheadMs: 1000 }));
    expect(ed.state.clips.find((c) => c.id === "A")!.duration).toBe(1000);
    ed.usar(acaoDeClip(ed.state, "A", "restaurar", { playheadMs: 0, duracoesFonte: { "asset-A": 9000 } }));
    expect(ed.state.clips.find((c) => c.id === "A")!.duration).toBe(9000);
  });

  it("duplicar cria cópia logo depois, com id novo e mesma track", () => {
    const ed = mk();
    ed.usar(acaoDeClip(ed.state, "A", "duplicar"));
    const naTrilha = ed.state.clips.filter((c) => c.trackId === "t-video");
    expect(naTrilha).toHaveLength(2);
    const copia = naTrilha.find((c) => c.id !== "A")!;
    expect(copia.start).toBe(4000);
    expect(copia.assetId).toBe("asset-A");
    ed.desfazer();
    expect(ed.state.clips.filter((c) => c.trackId === "t-video")).toHaveLength(1);
  });

  it("excluir remove só o clipe alvo", () => {
    const ed = mk();
    ed.usar(acaoDeClip(ed.state, "B", "excluir"));
    expect(ed.state.clips.map((c) => c.id)).toEqual(["A", "C"]);
    ed.desfazer();
    expect(ed.state.clips.map((c) => c.id)).toEqual(["A", "B", "C"]);
  });

  it("ripple delete puxa os clipes seguintes da mesma camada", () => {
    let s = projeto3Camadas().s;
    s = recalcularDuracao({
      ...s,
      clips: [...s.clips, clip({ id: "A2", trackId: "t-video", start: 4000 }), clip({ id: "A3", trackId: "t-video", start: 8000 })],
    });
    const ed = new Editor(s);
    ed.usar(acaoDeClip(ed.state, "A", "ripple"));
    expect(ed.state.clips.find((c) => c.id === "A2")!.start).toBe(0);
    expect(ed.state.clips.find((c) => c.id === "A3")!.start).toBe(4000);
    // outras camadas intactas
    expect(ed.state.clips.find((c) => c.id === "B")!.start).toBe(0);
    ed.desfazer();
    expect(ed.state.clips.find((c) => c.id === "A2")!.start).toBe(4000);
  });

  it("mover camada acima/abaixo e criar camada acima/abaixo", () => {
    const ed = mk();
    const idxAntes = ordemDeCamadas(ed.state).indexOf("t-video");
    ed.usar(moverClipCamada(ed.state, "A", -1)); // sobe um nível na pilha
    const idxA = ordemDeCamadas(ed.state).indexOf(ed.state.clips.find((c) => c.id === "A")!.trackId);
    expect(idxA).toBe(idxAntes - 1);
    ed.usar(moverClipCamada(ed.state, "A", 1));
    expect(ed.state.clips.find((c) => c.id === "A")!.trackId).toBe("t-video");

    const nTracks = ed.state.tracks.length;
    ed.usar(novaCamadaJunto(ed.state, "A", -1)); // camada nova acima
    expect(ed.state.tracks.length).toBe(nTracks + 1);
    const novaAcima = ed.state.clips.find((c) => c.id === "A")!.trackId;
    const ordem = ordemDeCamadas(ed.state);
    expect(ordem.indexOf(novaAcima)).toBe(ordem.indexOf("t-video") - 1); // fica logo acima da original

    ed.usar(novaCamadaJunto(ed.state, "A", 1)); // camada nova abaixo
    expect(ed.state.tracks.length).toBe(nTracks + 2);
    ed.desfazer();
    expect(ed.state.tracks.length).toBe(nTracks + 1);
  });

  it("mover além da pilha avisa em vez de quebrar", () => {
    const { s } = projeto3Camadas();
    const r = moverClipCamada(s, "C", -1);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erro).toMatch(/direção/i);
  });

  it("extrair áudio cria clipe na camada de voz e marca o original sem áudio", () => {
    const ed = mk();
    ed.usar(acaoDeClip(ed.state, "A", "extrair-audio"));
    const audio = ed.state.clips.find((c) => c.kind === "audio")!;
    expect(audio.assetId).toBe("asset-A");
    expect(ed.state.clips.find((c) => c.id === "A")!.semAudio).toBe(true);
    expect(ganho(ed.state, "A")).toBe(0);
  });

  it("excluir camada só funciona se estiver vazia", () => {
    const { s, v2 } = projeto3Camadas();
    expect(excluirTrack(s, v2).ok).toBe(false);
    const vazia = { ...s, clips: s.clips.filter((c) => c.trackId !== v2) };
    const r = excluirTrack(vazia, v2);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.state.tracks.some((t) => t.id === v2)).toBe(false);
  });
});

describe("9/10. editar com IA no escopo do clipe", () => {
  const rodarIa = (ed: Editor, ops: EditairOp[]) => {
    // mesmo filtro da rota: ops de clipes inexistentes são descartadas
    const validas = ops.filter((o) => !("clipId" in o) || !o.clipId || ed.state.clips.some((c) => c.id === o.clipId));
    ed.aplicar(aplicarOps(ed.state, validas, null).state);
    return validas.length;
  };

  it("“divida este clip no meio” → split só no clipe alvo, undo restaura", () => {
    const ed = new Editor(projeto3Camadas().s);
    const antes = JSON.parse(JSON.stringify(ed.state.clips.filter((c) => c.id !== "A")));
    rodarIa(ed, [{ op: "split_clip", clipId: "A", atMs: 2000 }]);
    expect(ed.state.clips.filter((c) => c.trackId === "t-video")).toHaveLength(2);
    expect(ed.state.clips.filter((c) => c.id === "B" || c.id === "C")).toEqual(antes);
    ed.desfazer();
    expect(ed.state.clips.filter((c) => c.trackId === "t-video")).toHaveLength(1);
  });

  it("“reduza o volume para 50%” → volume 0.5 apenas no clipe", () => {
    const ed = new Editor(projeto3Camadas().s);
    rodarIa(ed, [{ op: "set_volume", clipId: "A", volume: 0.5 }]);
    expect(ed.state.clips.find((c) => c.id === "A")!.volume).toBe(0.5);
    expect(ed.state.clips.find((c) => c.id === "B")!.volume).toBe(1);
    ed.desfazer();
    expect(ed.state.clips.find((c) => c.id === "A")!.volume).toBe(1);
  });

  it("“aumente a velocidade para 1.2x” → speed 1.2 e duração recalculada", () => {
    const ed = new Editor(projeto3Camadas().s);
    rodarIa(ed, [{ op: "set_speed", clipId: "A", speed: 1.2 }]);
    const a = ed.state.clips.find((c) => c.id === "A")!;
    expect(a.speed).toBeCloseTo(1.2, 5);
    expect(a.duration).toBeGreaterThan(0);
    expect(ed.state.clips.find((c) => c.id === "B")!.speed).toBe(1);
    ed.desfazer();
    expect(ed.state.clips.find((c) => c.id === "A")!.speed).toBe(1);
  });

  it("IA não altera clipes, camadas nem ordem fora do escopo", () => {
    const { s } = projeto3Camadas();
    let base = recalcularDuracao({
      ...s,
      clips: [...s.clips, clip({ id: "D", trackId: "t-video", start: 6000 }), clip({ id: "E", trackId: s.tracks[0].id, start: 2000 })],
    });
    const ed = new Editor(base);
    const outrosAntes = JSON.parse(JSON.stringify(ed.state.clips.filter((c) => c.id !== "A")));
    const tracksAntes = JSON.parse(JSON.stringify(ed.state.tracks));
    rodarIa(ed, [
      { op: "set_volume", clipId: "A", volume: 0.4 },
      { op: "set_transform", clipId: "A", scale: 0.5 },
    ]);
    expect(ed.state.clips.filter((c) => c.id !== "A")).toEqual(outrosAntes);
    expect(ed.state.tracks).toEqual(tracksAntes);
    base = ed.state;
    expect(base.clips.find((c) => c.id === "A")!.transform.scale).toBe(0.5);
  });

  it("op apontando para clipe inexistente é descartada (nada muda)", () => {
    const ed = new Editor(projeto3Camadas().s);
    const antes = JSON.parse(JSON.stringify(ed.state));
    const n = rodarIa(ed, [{ op: "delete_clip", clipId: "fantasma" }]);
    expect(n).toBe(0);
    expect(ed.state.clips).toEqual(antes.clips);
  });
});

describe("13. undo / redo", () => {
  it("desfaz e refaz mover, trocar de track, criar track, reorder, split, trim e IA", () => {
    const ed = new Editor(projeto3Camadas().s);
    const marcos: ProjectState[] = [ed.state];

    ed.usar(soltarClipEm(ed.state, "A", { tipo: "track", trackId: ed.state.tracks[1].id }, 900));
    marcos.push(ed.state);
    ed.usar(novaCamadaJunto(ed.state, "A", -1));
    marcos.push(ed.state);
    ed.usar(reordenarTracks(ed.state, 0, 2));
    marcos.push(ed.state);
    ed.usar(acaoDeClip(ed.state, "B", "dividir", { playheadMs: 1000 }));
    marcos.push(ed.state);
    ed.usar(acaoDeClip(ed.state, "C", "aparar", { playheadMs: 2000 }));
    marcos.push(ed.state);
    ed.aplicar(aplicarOps(ed.state, [{ op: "set_volume", clipId: "C", volume: 0.2 }], null).state);
    marcos.push(ed.state);

    for (let i = marcos.length - 2; i >= 0; i--) {
      ed.desfazer();
      expect(ed.state.clips.length).toBe(marcos[i].clips.length);
      expect(ed.state.tracks.length).toBe(marcos[i].tracks.length);
    }
    for (let i = 1; i < marcos.length; i++) {
      ed.refazer();
      expect(ed.state.clips.length).toBe(marcos[i].clips.length);
      expect(ed.state.tracks.length).toBe(marcos[i].tracks.length);
    }
    expect(ed.state.clips.find((c) => c.id === "C")!.volume).toBe(0.2);
  });
});

describe("14. persistência do projeto", () => {
  it("3 camadas, ordem alterada, hidden, locked, posições e transform voltam idênticos", () => {
    const ed = new Editor(projeto3Camadas().s);
    ed.usar(reordenarTracks(ed.state, 0, 2));
    ed.aplicar(alternarTrack(ed.state, ed.state.tracks[0].id, "hidden"));
    ed.aplicar(alternarTrack(ed.state, ed.state.tracks[1].id, "locked"));
    ed.usar(soltarClipEm(ed.state, "C", { tipo: "track", trackId: ed.state.tracks[2].id }, 3200));
    ed.aplicar(
      aplicarOps(ed.state, [{ op: "set_transform", clipId: "B", scale: 0.35, x: 240, y: -420 }], null).state,
    );

    const salvo = JSON.parse(JSON.stringify(ed.state)) as ProjectState;
    const reaberto = normalizarEstado(salvo, salvo.width, salvo.height, salvo.fps);

    expect(reaberto.tracks.map((t) => [t.id, !!t.hidden, !!t.locked])).toEqual(
      ed.state.tracks.map((t) => [t.id, !!t.hidden, !!t.locked]),
    );
    expect(reaberto.clips.map((c) => [c.id, c.trackId, c.start, c.duration])).toEqual(
      ed.state.clips.map((c) => [c.id, c.trackId, c.start, c.duration]),
    );
    expect(reaberto.clips.find((c) => c.id === "B")!.transform).toEqual({
      ...transformPadrao(),
      scale: 0.35,
      x: 240,
      y: -420,
    });
    expect(reaberto.durationMs).toBe(ed.state.durationMs);
  });

  it("novoId nunca colide ao duplicar em série", () => {
    const ids = new Set(Array.from({ length: 500 }, () => novoId()));
    expect(ids.size).toBe(500);
  });
});
