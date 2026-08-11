/* Testes comportamentais do pipeline de mídia do EditAir (Web + Desktop).
   Cobrem: bootstrap, fila de pendentes, galeria→projeto, clips, primeiro frame,
   scrub, persistência, proteção contra recriação de clips e normalização. */
import { describe, expect, it } from "vitest";
import { EditorSimulado, midiaDesktop, midiaWeb } from "../harness/editor";
import { aplicarAssetsIniciais, clipsIniciais, midiaParaAsset, PonteAssets } from "@/lib/editair/bootstrap";
import { estadoVazio } from "@/lib/editair/types";

describe("1. bootstrap do projeto (sem canvas)", () => {
  it("popula assets, termina o carregamento e enfileira pendentes antes da engine", async () => {
    const ed = new EditorSimulado();
    await ed.abrirProjeto({ state: null, midias: [midiaWeb({ id: "a1" })] });

    expect(ed.assets).toHaveLength(1);
    expect(ed.carregando).toBe(false);
    expect(ed.engine).toBeNull();
    expect(ed.ponte.temEngine()).toBe(false);
    expect(ed.ponte.pendentesIds()).toEqual(["a1"]);
  });

  it("entrega os pendentes quando o canvas monta depois", async () => {
    const ed = new EditorSimulado();
    await ed.abrirProjeto({ state: null, midias: [midiaWeb({ id: "a1" }), midiaWeb({ id: "a2" })] });
    await ed.montarCanvas();

    expect(ed.engine!.carregados).toEqual(new Set(["a1", "a2"]));
    expect(ed.ponte.pendentesIds()).toEqual([]);
  });

  it("avisa quando a mídia não abre, sem travar o resto da fila", async () => {
    const ed = new EditorSimulado();
    await ed.abrirProjeto({ state: null, midias: [midiaWeb({ id: "ok" }), midiaWeb({ id: "ruim" })] });
    await ed.montarCanvas(["ruim"]);

    expect(ed.engine!.carregados.has("ok")).toBe(true);
    expect(ed.falhasAvisadas).toEqual(["ruim"]);
  });
});

describe("2. galeria → editor", () => {
  it("cria o projeto com clip vinculado ao asset (track, start, duration)", async () => {
    const ed = new EditorSimulado();
    await ed.abrirProjeto({ state: null, midias: [midiaWeb({ id: "g1", durationMs: 12000 })] });

    expect(ed.assets.find((a) => a.id === "g1")).toBeTruthy();
    const clip = ed.state.clips[0];
    expect(ed.state.clips).toHaveLength(1);
    expect(clip.assetId).toBe("g1");
    expect(clip.trackId).toBe("t-video");
    expect(clip.kind).toBe("video");
    expect(clip.start).toBe(0);
    expect(clip.duration).toBe(12000);
    expect(clip.sourceIn).toBe(0);
    expect(ed.state.durationMs).toBeGreaterThanOrEqual(12000);
  });

  it("encadeia vários assets por trilha e separa áudio de vídeo", () => {
    const clips = clipsIniciais([
      midiaParaAsset(midiaWeb({ id: "v1", durationMs: 4000 })),
      midiaParaAsset(midiaWeb({ id: "v2", durationMs: 6000 })),
      midiaParaAsset(midiaWeb({ id: "m1", kind: "audio", durationMs: 9000 })),
      midiaParaAsset(midiaWeb({ id: "i1", kind: "image", durationMs: 0 })),
    ]);
    expect(clips.map((c) => [c.trackId, c.start, c.duration])).toEqual([
      ["t-video", 0, 4000],
      ["t-video", 4000, 6000],
      ["t-music", 0, 9000],
      ["t-video", 10000, 5000], // imagem sem duração vira 5s
    ]);
  });
});

describe("3. importação dentro do projeto", () => {
  it("asset importado antes da engine vira pendente e é entregue depois", async () => {
    const ed = new EditorSimulado();
    await ed.abrirProjeto({ state: estadoVazio(), midias: [] });

    const r = await ed.importar(midiaWeb({ id: "novo" }));
    expect(r).toBe("pendente");
    expect(ed.ponte.temPendente("novo")).toBe(true);

    await ed.montarCanvas();
    expect(ed.engine!.carregados.has("novo")).toBe(true);
    expect(ed.ponte.temPendente("novo")).toBe(false);
  });

  it("com a engine já criada, o import carrega imediatamente", async () => {
    const ed = new EditorSimulado();
    await ed.abrirProjeto({ state: estadoVazio(), midias: [] });
    await ed.montarCanvas();

    const antes = ed.engine!.contar("carregar");
    const r = await ed.importar(midiaWeb({ id: "depois" }));
    expect(r).toBe("carregado");
    expect(ed.engine!.contar("carregar")).toBe(antes + 1);
    expect(ed.ponte.pendentesIds()).toEqual([]);
  });

  it("asset sem url é ignorado (não fica preso na fila)", async () => {
    const ponte = new PonteAssets(() => ({ state: estadoVazio(), playhead: 0 }));
    const r = await ponte.carregar(midiaParaAsset(midiaWeb({ id: "vazio", url: "" })));
    expect(r).toBe("ignorado");
    expect(ponte.pendentesIds()).toEqual([]);
  });
});

describe("5. primeiro frame sem Play", () => {
  it("sincronizar() e desenhar() são chamados logo após a inicialização", async () => {
    const ed = new EditorSimulado();
    await ed.abrirProjeto({ state: null, midias: [midiaWeb({ id: "a1" })] });
    await ed.montarCanvas();

    expect(ed.tocando).toBe(false);
    expect(ed.engine!.contar("sincronizar")).toBeGreaterThanOrEqual(1);
    expect(ed.engine!.contar("desenhar")).toBeGreaterThanOrEqual(1);
    const ultima = ed.engine!.chamadas.at(-1)!;
    expect(ultima.metodo).toBe("desenhar");
  });

  it("projeto sem mídia também pinta o frame inicial", async () => {
    const ed = new EditorSimulado();
    await ed.abrirProjeto({ state: estadoVazio(), midias: [] });
    await ed.montarCanvas();
    expect(ed.engine!.contar("desenhar")).toBe(1);
  });
});

describe("6. scrub com playback pausado", () => {
  it("engine recebe o novo tempo e redesenha", async () => {
    const ed = new EditorSimulado();
    await ed.abrirProjeto({ state: null, midias: [midiaWeb({ id: "a1" })] });
    await ed.montarCanvas();
    ed.engine!.chamadas = [];

    ed.moverPlayhead(2500);
    ed.moverPlayhead(4100);

    const tempos = ed.engine!.chamadas.filter((c) => c.metodo === "desenhar").map((c) => c.args[1]);
    expect(tempos).toEqual([2500, 4100]);
    const sincs = ed.engine!.chamadas.filter((c) => c.metodo === "sincronizar");
    expect(sincs.every((c) => c.args[2] === false)).toBe(true);
  });
});

describe("7. persistência", () => {
  it("assetId, clips, duração, sourceIn e a flag sobrevivem ao salvar/reabrir", async () => {
    const ed = new EditorSimulado();
    await ed.abrirProjeto({ state: null, midias: [midiaWeb({ id: "p1", durationMs: 7000 })] });
    ed.state = {
      ...ed.state,
      clips: ed.state.clips.map((c) => ({ ...c, sourceIn: 1500, duration: 5000 })),
    };
    const salvo = ed.salvar();

    const ed2 = new EditorSimulado();
    await ed2.abrirProjeto({ state: salvo, midias: [midiaWeb({ id: "p1", durationMs: 7000 })] });

    expect(ed2.state.clips).toHaveLength(1);
    expect(ed2.state.clips[0].assetId).toBe("p1");
    expect(ed2.state.clips[0].sourceIn).toBe(1500);
    expect(ed2.state.clips[0].duration).toBe(5000);
    expect(ed2.state.assetsIniciaisAplicados).toBe(true);
    expect(ed2.state.durationMs).toBe(salvo.durationMs);
  });
});

describe("8. proteção contra recriação de clips", () => {
  it("clips iniciais são criados uma única vez", async () => {
    const midias = [midiaWeb({ id: "x1" })];
    const ed = new EditorSimulado();
    await ed.abrirProjeto({ state: null, midias });
    expect(ed.state.clips).toHaveLength(1);

    // reabre com o estado salvo: nada é duplicado
    const salvo = ed.salvar();
    const ed2 = new EditorSimulado();
    await ed2.abrirProjeto({ state: salvo, midias });
    expect(ed2.state.clips).toHaveLength(1);
  });

  it("usuário apaga todos os clips → salva → reabre → NÃO recria", async () => {
    const midias = [midiaWeb({ id: "x1" }), midiaWeb({ id: "x2" })];
    const ed = new EditorSimulado();
    await ed.abrirProjeto({ state: null, midias });
    expect(ed.state.clips).toHaveLength(2);

    ed.state = { ...ed.state, clips: [] }; // usuário apagou tudo
    const salvo = ed.salvar();
    expect(salvo.assetsIniciaisAplicados).toBe(true);

    const ed2 = new EditorSimulado();
    await ed2.abrirProjeto({ state: salvo, midias });
    expect(ed2.state.clips).toEqual([]);

    // e continua vazio em uma terceira abertura
    const ed3 = new EditorSimulado();
    await ed3.abrirProjeto({ state: ed2.salvar(), midias });
    expect(ed3.state.clips).toEqual([]);
  });

  it("projeto antigo (sem a flag) com clips existentes só ganha a flag", () => {
    const base = estadoVazio();
    const comClips = {
      ...base,
      clips: clipsIniciais([midiaParaAsset(midiaWeb({ id: "velho" }))]),
    };
    const r = aplicarAssetsIniciais(comClips, [midiaParaAsset(midiaWeb({ id: "velho" }))], []);
    expect(r.clips).toHaveLength(1);
    expect(r.assetsIniciaisAplicados).toBe(true);
  });
});

describe("9. Web × Desktop", () => {
  it("os dois produzem a mesma estrutura consumida pelo editor", () => {
    const web = midiaParaAsset(midiaWeb({ id: "w" }));
    const desk = midiaParaAsset(midiaDesktop({ id: "d" }));
    expect(Object.keys(web).sort()).toEqual(Object.keys(desk).sort());
    expect(web.url.startsWith("https://")).toBe(true);
    expect(desk.url.startsWith("editair-media://")).toBe(true);
    expect(desk.local).toBe(true);
  });

  it("o pipeline trata os dois exatamente igual", async () => {
    const ed = new EditorSimulado();
    await ed.abrirProjeto({
      state: null,
      midias: [midiaWeb({ id: "w" }), midiaDesktop({ id: "d" }) as ReturnType<typeof midiaWeb>],
    });
    await ed.montarCanvas();

    expect(ed.engine!.carregados).toEqual(new Set(["w", "d"]));
    expect(ed.state.clips.map((c) => c.assetId)).toEqual(["w", "d"]);
    const urls = ed.engine!.chamadas.filter((c) => c.metodo === "carregar").map((c) => c.args[1]);
    expect(urls[0]).toMatch(/^https:\/\//);
    expect(urls[1]).toMatch(/^editair-media:\/\//);
  });

  it("mídia desktop offline (existe=false) não é carregada nem quebra a fila", async () => {
    const ed = new EditorSimulado();
    await ed.abrirProjeto({
      state: null,
      midias: [
        midiaDesktop({ id: "off", url: "", existe: false }) as ReturnType<typeof midiaWeb>,
        midiaDesktop({ id: "on" }) as ReturnType<typeof midiaWeb>,
      ],
    });
    await ed.montarCanvas();
    expect(ed.engine!.carregados).toEqual(new Set(["on"]));
  });
});
