import { createFileRoute, useParams } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Captions,
  Clapperboard,
  Copy,
  Film,
  Image as ImageIcon,
  Layers,
  Loader2,
  Magnet,
  Music,
  Redo2,
  Save,
  Scissors,
  SlidersHorizontal,
  Focus,
  Sparkles,
  Sticker,
  Trash2,
  Type,
  Undo2,
  Wand2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  abrirProjeto,
  autosaveProjeto,
  ehLocal,
  excluirMidia,
  importarMidias,
  registrarEvento,
  relinkarMidia,
  renomearMidia,
  salvarProjeto,
  type MidiaEditair,
} from "@/lib/editair/store";
import { transcreverBlocoEditair } from "@/lib/editair/transcribe.functions";
import { dirigirEdicaoEditair } from "@/lib/editair/director.functions";
import { AiEditDialog, type AiEscopoId } from "@/components/editair/AiEditDialog";
import { planejarOperacoesEditair, type PlanoIa } from "@/lib/editair/planner.functions";
import { validarOps, resumoDoPlano, planoGrande, executarGeracoes } from "@/lib/editair/ia-plano";
import { LoginNuvemDialog } from "@/components/editair/LoginNuvemDialog";
import { temSessaoNuvem } from "@/lib/editair/nuvem";
import { definirHeaderProjeto, limparHeaderProjeto } from "@/lib/editair/header-state";

import { planejarEdicaoEditair } from "@/lib/editair/brain.functions";
import { normalizarPlano, transcricaoParaPrompt } from "@/lib/editair/brain";
import { analisarAudio, analisarVisual, resumirAnalise, type AnaliseTecnica } from "@/lib/editair/analysis";
import { montarRoughCut, type PlanoEditorial } from "@/lib/editair/plan";
import {
  estadoVazio,
  formatarTempo,
  normalizarEstado,
  novoId,
  recalcularDuracao,
  limparTracksVazias,
  transformPadrao,
  TEXTO_PADRAO,
  type CaptionStyle,
  type EditairClip,
  type KeyProp,
  type ProjectState,
  type Transcript,
} from "@/lib/editair/types";
import { aplicarOps, gerarLegendas, type EditairOp } from "@/lib/editair/ops";
import { aplicarVelocidade } from "@/lib/editair/velocidade";
import {
  acaoDeClip,
  alternarTrack,
  criarTrackEm,
  excluirTrack,
  moverClipCamada as moverClipCamada_,
  novaCamadaJunto as novaCamadaJunto_,
  reordenarTracks as reordenarTracks_,
  soltarClipEm,
  type DestinoCamada,
  type ResultadoCamada,
  inserirAssetNaTimeline,
} from "@/lib/editair/layers";
import {
  blobParaBase64,
  calcularEnvelope,
  decodificarAudio,
  detectarFala,
  encodeWav,
  lerMetadados,
  paraWav16k,
} from "@/lib/editair/audio";
import { EditairEngine } from "@/lib/editair/engine";
import { duracaoComposicao, planoDeAudio } from "@/lib/editair/composicao";
import { aplicarAssetsIniciais, midiaParaAsset, PonteAssets, type AssetBasico } from "@/lib/editair/bootstrap";
import { pontoDesktop } from "@/lib/editair/desktop";
import { consumirHandoff } from "@/lib/editair/handoff";
import { Timeline, type AssetInfo, type DestinoSolto } from "@/components/editair/Timeline";
import { alturaTimelineValida, MIN_AREA_SUPERIOR } from "@/lib/editair/interacao";
import { PlayerStage, type ElementoPalco } from "@/components/editair/PlayerStage";
import { SourceDialog } from "@/components/editair/SourceDialog";
import { Inspector } from "@/components/editair/Inspector";
import { ToolPanel, type AssetItem, type Ferramenta, type MensagemIa } from "@/components/editair/ToolPanels";

import {
  ExportDialog,
  type ExportConfig,
  type ProgressoExport,
  type ResultadoExport,
} from "@/components/editair/ExportDialog";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/editair/$id")({
  ssr: false,
  component: EditorPage,
});

const FERRAMENTAS: { id: Ferramenta; nome: string; icone: React.ReactNode }[] = [
  { id: "midia", nome: "Mídia", icone: <Film className="h-4 w-4" /> },
  { id: "audio", nome: "Áudio", icone: <Music className="h-4 w-4" /> },
  { id: "texto", nome: "Texto", icone: <Type className="h-4 w-4" /> },
  { id: "stickers", nome: "Stickers", icone: <Sticker className="h-4 w-4" /> },
  { id: "efeitos", nome: "Efeitos", icone: <Sparkles className="h-4 w-4" /> },
  { id: "transicoes", nome: "Transições", icone: <Layers className="h-4 w-4" /> },
  { id: "legendas", nome: "Legendas", icone: <Captions className="h-4 w-4" /> },
  { id: "filtros", nome: "Filtros", icone: <ImageIcon className="h-4 w-4" /> },
  { id: "ajuste", nome: "Ajuste", icone: <SlidersHorizontal className="h-4 w-4" /> },
  { id: "fundo", nome: "Fundo", icone: <Focus className="h-4 w-4" /> },
  { id: "modelos", nome: "Modelos", icone: <Clapperboard className="h-4 w-4" /> },
  { id: "ia", nome: "IA", icone: <Wand2 className="h-4 w-4" /> },
];

function EditorPage() {
  const { id } = useParams({ from: "/editair/$id" });
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<EditairEngine | null>(null);
  const audioBufferRef = useRef<AudioBuffer | null>(null);
  const rafRef = useRef<number | null>(null);
  const relogioRef = useRef<{ t0: number; ms0: number } | null>(null);
  const cancelarExportRef = useRef(false);
  const clipboardRef = useRef<EditairClip[]>([]);

  const [carregando, setCarregando] = useState(true);
  const [projetoNome, setProjetoNome] = useState("");
  const [state, setState] = useState<ProjectState>(estadoVazio());
  const [transcript, setTranscript] = useState<Transcript | null>(null);
  const [assets, setAssets] = useState<AssetItem[]>([]);
  const [midias, setMidias] = useState<MidiaEditair[]>([]);

  const [playhead, setPlayhead] = useState(0);
  const [tocando, setTocando] = useState(false);
  const demoRef = useRef<number | null>(null);
  const [zoom, setZoom] = useState(60);
  /* altura da timeline (splitter vertical) — a área superior nunca some */
  const [alturaTimeline, setAlturaTimeline] = useState(300);
  useEffect(() => {
    const ajustar = () => setAlturaTimeline((h) => alturaTimelineValida(h, window.innerHeight - 56 - 46));
    ajustar();
    window.addEventListener("resize", ajustar);
    return () => window.removeEventListener("resize", ajustar);
  }, []);
  const [selecionados, setSelecionados] = useState<string[]>([]);
  const selecionadosRef = useRef<string[]>([]);
  selecionadosRef.current = selecionados;
  const [selecao, setSelecao] = useState<{ fromMs: number; toMs: number } | null>(null);
  const [ferramenta, setFerramenta] = useState<Ferramenta>("midia");
  const [fundoPronto, setFundoPronto] = useState(false);
  const [fundoCarregando, setFundoCarregando] = useState(false);
  const [snapping, setSnapping] = useState(true);
  const [volume, setVolume] = useState(1);
  const [mudo, setMudo] = useState(false);
  const [qualidade, setQualidade] = useState(1);

  const [mensagens, setMensagens] = useState<MensagemIa[]>([]);
  const [pensando, setPensando] = useState(false);
  const [plano, setPlano] = useState<PlanoEditorial | null>(null);
  const [etapaIa, setEtapaIa] = useState("");
  const [objetivoIa, setObjetivoIa] = useState("");
  const [iaClipId, setIaClipId] = useState<string | null>(null);
  const [iaAberto, setIaAberto] = useState(false);
  const [iaEscopo, setIaEscopo] = useState<AiEscopoId>("clipe");
  const [iaPlano, setIaPlano] = useState<PlanoIa | null>(null);
  const [iaEtapasFeitas, setIaEtapasFeitas] = useState<string[]>([]);
  const [loginNuvem, setLoginNuvem] = useState(false);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const [exportAberto, setExportAberto] = useState(false);
  const [progresso, setProgresso] = useState<ProgressoExport>(null);
  const [resultado, setResultado] = useState<ResultadoExport>(null);
  const [pastaExport, setPastaExport] = useState<string | null>(null);
  const [capaExport, setCapaExport] = useState<string | null>(null);

  const [rippleTrim, setRippleTrim] = useState(false);
  const [sourceClipId, setSourceClipId] = useState<string | null>(null);
  const [dimsOriginais, setDimsOriginais] = useState<{ w: number; h: number } | null>(null);
  const [autoEtapa, setAutoEtapa] = useState<"importar" | "planejar" | "montar" | null>(null);
  const autoRef = useRef<{ instrucao: string } | null>(null);

  const historico = useRef<ProjectState[]>([]);
  const futuro = useRef<ProjectState[]>([]);

  // A seleção é estado de interface: não depende de playback nem de a mídia ter
  // carregado. Se o id sumir (id regerado por uma operação), reencontra o mesmo
  // clipe pela trilha/posição para o Inspector nunca "piscar" para vazio.
  const ultimoClipeRef = useRef<EditairClip | null>(null);
  const clipeAtual = useMemo(() => {
    const id = selecionados[0];
    if (!id) {
      ultimoClipeRef.current = null;
      return null;
    }
    const achado = state.clips.find((c) => c.id === id);
    if (achado) {
      ultimoClipeRef.current = achado;
      return achado;
    }
    const anterior = ultimoClipeRef.current;
    const equivalente = anterior
      ? state.clips.find(
          (c) => c.trackId === anterior.trackId && c.start === anterior.start && c.assetId === anterior.assetId,
        )
      : null;
    ultimoClipeRef.current = equivalente ?? null;
    return equivalente ?? null;
  }, [state.clips, selecionados]);

  /**
   * Demonstração instantânea: leva o playhead pro início do clipe e toca um
   * trecho curto. Nada é renderizado — o preview usa as próprias propriedades
   * do clipe (animações/efeitos/legendas). O arquivo só sai na Exportação.
   */
  const demonstrarClipe = useCallback(() => {
    const c = clipeAtual;
    if (!c) return;
    if (demoRef.current) window.clearTimeout(demoRef.current);
    setPlayhead(c.start);
    setTocando(true);
    const dur = Math.min(c.duration, 3000);
    demoRef.current = window.setTimeout(() => {
      setTocando(false);
      setPlayhead(c.start);
      demoRef.current = null;
    }, dur);
  }, [clipeAtual]);

  useEffect(() => () => {
    if (demoRef.current) window.clearTimeout(demoRef.current);
  }, []);


  const assetsMap = useMemo(() => {
    const m: Record<string, AssetInfo> = {};
    for (const a of assets) m[a.id] = { id: a.id, url: a.url, durationMs: a.durationMs, kind: a.kind, name: a.nome };
    return m;
  }, [assets]);

  /** Duração real de cada arquivo — base dos limites de trim não destrutivo. */
  const duracoesFonte = useMemo(() => {
    const m: Record<string, number> = {};
    for (const a of assets) m[a.id] = a.durationMs;
    return m;
  }, [assets]);

  const clipeSource = useMemo(
    () => state.clips.find((c) => c.id === sourceClipId) ?? null,
    [state.clips, sourceClipId],
  );

  /* -------- ponte assets ↔ engine (fila de pendentes) -------- */
  const stateRef = useRef<ProjectState>(state);
  stateRef.current = state;
  const playheadRef = useRef(0);
  playheadRef.current = playhead;

  /** Tratamento da falha de mídia — no Desktop tenta gerar proxy compatível e recarrega. */
  const aoFalharRef = useRef<(a: AssetBasico, erro?: unknown) => void>(() => {});
  const proxyTentado = useRef(new Set<string>());

  const ponteRef = useRef<PonteAssets | null>(null);
  if (!ponteRef.current) {
    ponteRef.current = new PonteAssets(
      () => ({ state: stateRef.current, playhead: playheadRef.current }),
      (a, erro) => aoFalharRef.current(a, erro),
    );
  }
  const ponte = ponteRef.current;


  /** Carrega o asset na engine; se ela ainda não existir, guarda para depois. */
  const carregarNaEngine = useCallback(
    async (a: AssetItem) => {
      await ponte.carregar(a);
    },
    [ponte],
  );

  aoFalharRef.current = (a: AssetBasico, erro?: unknown) => {
    const detalhe = (erro ?? null) as { codigo?: number | null; mensagem?: string; mime?: string | null; status?: number | null } | null;
    console.error("[preview:error] asset não abriu", { asset: a, detalhe });

    const api = pontoDesktop();
    const caminho = a.localPath || null;
    const jaTentou = proxyTentado.current.has(a.id);
    const podeProxy = !!api && !!caminho && a.kind !== "image" && !jaTentou;

    if (!podeProxy) {
      const causa = detalhe?.mensagem ? ` (${detalhe.mensagem})` : "";
      toast.error(`Não foi possível abrir "${a.nome}"${causa}`);
      return;
    }

    proxyTentado.current.add(a.id);
    toast.info(`Convertendo "${a.nome}" para um formato compatível…`);
    void (async () => {
      try {
        const proxy = await api!.midia.proxy(caminho!);
        if (!proxy) throw new Error("proxy não gerado");
        const url = api!.urlLocal(proxy);
        console.log("[preview] proxy gerado", { assetId: a.id, proxy, url });
        setAssets((cur) => cur.map((x) => (x.id === a.id ? { ...x, url } : x)));
        setMidias((cur) => cur.map((m) => (m.id === a.id ? { ...m, url } : m)));
        const r = await ponte.carregar({ ...a, url });
        if (r === "carregado") toast.success(`"${a.nome}" pronta para o preview`);
      } catch (e) {
        console.error("[preview:error] proxy falhou", e);
        toast.error(`Não foi possível converter "${a.nome}". Verifique o codec do arquivo.`);
      }
    })();
  };


  /* ---------------- 1A. bootstrap de DADOS (independe do canvas) ---------------- */
  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const res = await abrirProjeto(id);
        if (!vivo) return;
        const w = res.width || 1080;
        const h = res.height || 1920;
        const fps = res.fps || 30;
        setProjetoNome(res.name);
        setMidias(res.midias);
        if (res.transcript) setTranscript(res.transcript);

        let estado = normalizarEstado(res.state ?? estadoVazio(w, h, fps), w, h, fps);
        const lista: AssetItem[] = res.midias.map(midiaParaAsset);
        setAssets(lista);
        ponte.enfileirar(lista);

        // Projeto novo criado a partir da Galeria: as mídias entram uma única vez
        // na timeline. A flag impede recriar clipes que o usuário apagou de propósito.
        estado = aplicarAssetsIniciais(estado, lista, res.midias);
        setState(estado);

        const primeiro = res.midias.find((m) => m.width > 0 && m.height > 0);
        if (primeiro) setDimsOriginais({ w: primeiro.width, h: primeiro.height });

        // deixa o áudio do primeiro vídeo pronto para a IA mesmo após recarregar
        const principal = lista.find((a) => a.kind !== "image" && a.url);
        if (principal) {
          void (async () => {
            try {
              const resp = await fetch(principal.url);
              const buf = await decodificarAudio(await resp.blob());
              if (vivo) audioBufferRef.current = buf;
            } catch (e) {
              console.warn(`[media] áudio não decodificável asset=${principal.id}`, e);
            }
          })();
        }

        // veio da galeria com instrução: monta o primeiro corte automaticamente
        const handoff = consumirHandoff(id);
        if (handoff?.arquivos?.length) {
          autoRef.current = { instrucao: handoff.instrucao };
          setAutoEtapa("importar");
          void importar(handoff.arquivos);
        } else if (handoff?.instrucao) {
          autoRef.current = { instrucao: handoff.instrucao };
          setAutoEtapa("planejar");
        }
      } catch (e) {
        console.error("[media] falha ao abrir projeto", e);
        toast.error(e instanceof Error ? e.message : "Falha ao abrir o projeto");
      } finally {
        if (vivo) setCarregando(false);
      }
    })();
    return () => {
      vivo = false;
      engineRef.current?.destruir();
      engineRef.current = null;
      ponte.limpar();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  /* ---------------- 1B. bootstrap VISUAL (só depois do canvas montar) ------------- */
  useEffect(() => {
    if (carregando) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    let vivo = true;

    if (!engineRef.current) {
      engineRef.current = new EditairEngine(canvas, stateRef.current.width, stateRef.current.height);
      engineRef.current.definirVolumeMaster(volume);
      engineRef.current.definirMudo(mudo);
      console.log("[engine] criada");
    }
    const eng = engineRef.current;
    ponte.definirEngine(eng);
    eng.redimensionar(stateRef.current.width, stateRef.current.height, qualidade);

    // carrega tudo o que ainda não foi para a engine (bootstrap, import, drag&drop, relink)
    // e pinta o primeiro frame sem precisar apertar Play
    void ponte.drenar(assets, () => vivo);

    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carregando, assets, carregarNaEngine]);


  /* ---------------- render ---------------- */
  useEffect(() => {
    const eng = engineRef.current;
    if (!eng) return;
    eng.redimensionar(state.width, state.height, qualidade);
    if (!tocando) {
      eng.sincronizar(state, playhead, false);
      eng.desenhar(state, playhead);
    }
  }, [state, playhead, tocando, qualidade]);

  useEffect(() => {
    engineRef.current?.definirVolumeMaster(volume);
    engineRef.current?.definirMudo(mudo);
  }, [volume, mudo]);

  useEffect(() => {
    const eng = engineRef.current;
    if (!eng) return;
    if (!tocando) {
      eng.pausarTudo();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      relogioRef.current = null;
      return;
    }
    relogioRef.current = { t0: performance.now(), ms0: playhead };
    const loop = () => {
      const rel = relogioRef.current;
      if (!rel) return;
      const t = rel.ms0 + (performance.now() - rel.t0);
      if (t >= state.durationMs) {
        setTocando(false);
        // Para no último quadro visível (e não 1ms depois do fim), senão o
        // preview fica preto ao terminar — sensação de "a imagem sumiu".
        const fim = Math.max(0, state.durationMs - 1);
        setPlayhead(fim);
        eng.sincronizar(state, fim, false);
        eng.desenhar(state, fim);
        return;
      }

      setPlayhead(t);
      eng.sincronizar(state, t, true);
      eng.desenhar(state, t);
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tocando, state]);

  /* ---------------- histórico ---------------- */
  // ativa a segmentação assim que algum clipe usa tratamento de fundo
  useEffect(() => {
    const fundos = state.clips.filter((c) => c.fundo && c.fundo.modo !== "nenhum");
    if (!fundos.length) return;
    const eng = engineRef.current;
    if (!eng || eng.fundoPronto()) return;
    const qualidade = fundos.some((c) => c.fundo?.qualidade === "alta") ? "alta" : "rapida";
    let vivo = true;
    setFundoCarregando(true);
    void eng
      .ativarFundo(qualidade)
      .then((ok) => {
        if (!vivo) return;
        setFundoPronto(ok);
        if (!ok) toast.error("Não consegui carregar a segmentação de fundo neste navegador.");
      })
      .finally(() => vivo && setFundoCarregando(false));
    return () => {
      vivo = false;
    };
  }, [state.clips]);

  /* camadas criadas à mão (ainda vazias) e a camada do clipe selecionado não são
     varridas pela limpeza automática — o resto some quando fica sem conteúdo. */
  const tracksProtegidas = useRef<Set<string>>(new Set());
  const protegerTrack = useCallback((trackId?: string | null) => {
    if (trackId) tracksProtegidas.current.add(trackId);
  }, []);

  const aplicar = useCallback((proximo: ProjectState) => {
    setState((atual) => {
      historico.current.push(atual);
      if (historico.current.length > 80) historico.current.shift();
      futuro.current = [];
      const base = recalcularDuracao(proximo);
      const selecionadas = base.clips.filter((c) => selecionadosRef.current.includes(c.id)).map((c) => c.trackId);
      return limparTracksVazias(base, [...tracksProtegidas.current, ...selecionadas]);
    });
  }, []);

  const desfazer = useCallback(() => {
    const anterior = historico.current.pop();
    if (!anterior) return;
    setState((atual) => {
      futuro.current.push(atual);
      return anterior;
    });
  }, []);
  const refazer = useCallback(() => {
    const proximo = futuro.current.pop();
    if (!proximo) return;
    setState((atual) => {
      historico.current.push(atual);
      return proximo;
    });
  }, []);

  const salvar = useCallback(
    async (silencioso = true) => {
      setSalvando(true);
      try {
        await salvarProjeto(id, { state, transcript, assetIds: assets.map((a) => a.id) });
        if (!silencioso) toast.success("Projeto salvo");
      } catch (e) {
        if (!silencioso) toast.error(e instanceof Error ? e.message : "Falha ao salvar");
      } finally {
        setSalvando(false);
      }
    },
    [id, state, transcript, assets],
  );

  useEffect(() => {
    if (carregando) return;
    const t = setTimeout(() => void salvar(true), 2500);
    // autosave local contínuo: se o app cair, o projeto volta como estava
    const a = setTimeout(() => void autosaveProjeto(id, state), 800);
    return () => {
      clearTimeout(t);
      clearTimeout(a);
    };
  }, [state, transcript, carregando, salvar, id]);

  /* publica nome/status no header global (único header do EditAir) */
  useEffect(() => {
    definirHeaderProjeto({ nome: projetoNome || null, status: salvando ? "salvando" : "salvo" });
  }, [projetoNome, salvando]);
  useEffect(() => () => limparHeaderProjeto(), []);


  /* ---------------- edição de clipes ---------------- */
  const patchClipe = (patch: Partial<EditairClip>, alvoId?: string) => {
    const cid = alvoId ?? clipeAtual?.id;
    if (!cid) return;
    // velocidade muda a duração real na timeline (e arrasta legendas/clipes seguintes)
    if (patch.speed !== undefined && patch.congelado === undefined) {
      const { speed, ...resto } = patch;
      let novo = aplicarVelocidade(state, cid, speed);
      if (Object.keys(resto).length) {
        novo = { ...novo, clips: novo.clips.map((c) => (c.id === cid ? { ...c, ...resto } : c)) };
      }
      aplicar(novo);
      return;
    }
    aplicar({ ...state, clips: state.clips.map((c) => (c.id === cid ? { ...c, ...patch } : c)) });
  };

  /** Aplica um modelo de legenda numa legenda só ou em todas. */
  const aplicarModeloLegenda = (estilo: CaptionStyle, escopo: "uma" | "todas") => {
    if (escopo === "todas") {
      aplicar({
        ...state,
        captionStyle: estilo,
        clips: state.clips.map((c) => (c.kind === "caption" ? { ...c, captionStyle: estilo } : c)),
      });
      toast.success("Modelo aplicado em todas as legendas");
      return;
    }
    const cid = clipeAtual?.kind === "caption" ? clipeAtual.id : null;
    if (!cid) {
      aplicar({ ...state, captionStyle: estilo });
      toast.success("Modelo aplicado como padrão das legendas");
      return;
    }
    aplicar({ ...state, clips: state.clips.map((c) => (c.id === cid ? { ...c, captionStyle: estilo } : c)) });
    toast.success("Modelo aplicado nesta legenda");
  };

  const alterarClipTimeline = (cid: string, patch: Partial<EditairClip>, commit: boolean) => {
    if (commit) {
      setState((s) => recalcularDuracao({ ...s }));
      return;
    }
    setState((s) => recalcularDuracao({ ...s, clips: s.clips.map((c) => (c.id === cid ? { ...c, ...patch } : c)) }));
  };

  /** Alteração em lote (ripple trim mexe em vários clipes ao mesmo tempo). */
  const alterarClipsTimeline = (patches: Record<string, Partial<EditairClip>>, commit: boolean) => {
    if (commit) {
      setState((s) => recalcularDuracao({ ...s }));
      return;
    }
    setState((s) =>
      recalcularDuracao({
        ...s,
        clips: s.clips.map((c) => (patches[c.id] ? { ...c, ...patches[c.id] } : c)),
      }),
    );
  };


  /* ---------------- camadas (tracks) ---------------- */
  /** Toda a lógica de camadas vive em lib/editair/layers.ts (pura e testável). */
  const usarResultado = (r: ResultadoCamada) => {
    if (!r.ok) return toast.error(r.erro);
    aplicar(r.state);
  };

  const soltarClip = (cid: string, destino: DestinoCamada, startMs: number) =>
    usarResultado(soltarClipEm(state, cid, destino, startMs));

  const moverClipCamada = (cid: string, direcao: -1 | 1) => usarResultado(moverClipCamada_(state, cid, direcao));

  const novaCamadaJunto = (cid: string, direcao: -1 | 1) => {
    const r = novaCamadaJunto_(state, cid, direcao);
    if (r.ok) protegerTrack(r.trackId);
    usarResultado(r);
  };

  const reordenarTracks = (de: number, para: number) => {
    const r = reordenarTracks_(state, de, para);
    if (r.ok) aplicar(r.state);
  };


  /** Devolve o clipe à duração integral do arquivo original (não destrutivo). */
  const restaurarClip = (cid: string) => {
    aplicar(aplicarOps(state, [{ op: "restore_clip", clipId: cid }], transcript, duracoesFonte).state);
    toast.success("Duração original restaurada");
  };




  const dividir = () => {
    const alvos = selecionados.length ? selecionados : state.clips.filter((c) => playhead > c.start && playhead < c.start + c.duration).map((c) => c.id);
    if (!alvos.length) return toast.error("Nada para dividir no playhead.");
    let s = state;
    for (const cid of alvos) {
      s = aplicarOps(s, [{ op: "split_clip", clipId: cid, atMs: playhead }], transcript).state;
    }
    aplicar(s);
  };

  const excluirSelecionados = (ripple = false) => {
    if (!selecionados.length) return;
    let s = state;
    for (const cid of selecionados) {
      s = aplicarOps(s, [{ op: "delete_clip", clipId: cid }], transcript).state;
    }
    if (ripple) {
      const trilhas = Array.from(new Set(state.clips.filter((c) => selecionados.includes(c.id)).map((c) => c.trackId)));
      s = aplicarOps(s, trilhas.map(() => ({ op: "delete_range", fromMs: 0, toMs: 0 })) as EditairOp[], transcript).state;
      // fecha buracos nas trilhas afetadas
      for (const t of trilhas) {
        const daTrilha = s.clips.filter((c) => c.trackId === t).sort((a, b) => a.start - b.start);
        let cursor = 0;
        const mapa = new Map<string, number>();
        for (const c of daTrilha) {
          mapa.set(c.id, cursor);
          cursor += c.duration;
        }
        s = { ...s, clips: s.clips.map((c) => (mapa.has(c.id) ? { ...c, start: mapa.get(c.id)! } : c)) };
      }
    }
    setSelecionados([]);
    aplicar(s);
  };

  const duplicar = () => {
    if (!selecionados.length) return;
    const novos = state.clips
      .filter((c) => selecionados.includes(c.id))
      .map((c) => ({ ...c, id: novoId(), start: c.start + c.duration }));
    aplicar({ ...state, clips: [...state.clips, ...novos] });
    setSelecionados(novos.map((c) => c.id));
  };

  const copiar = () => {
    clipboardRef.current = state.clips.filter((c) => selecionados.includes(c.id)).map((c) => ({ ...c }));
    if (clipboardRef.current.length) toast.success(`${clipboardRef.current.length} clipe(s) copiado(s)`);
  };
  const colar = () => {
    if (!clipboardRef.current.length) return;
    const base = Math.min(...clipboardRef.current.map((c) => c.start));
    const novos = clipboardRef.current.map((c) => ({ ...c, id: novoId(), start: playhead + (c.start - base) }));
    aplicar({ ...state, clips: [...state.clips, ...novos] });
    setSelecionados(novos.map((c) => c.id));
  };

  const apagarTrecho = (fromMs: number, toMs: number) => {
    const { state: novo } = aplicarOps(state, [{ op: "delete_range", fromMs, toMs, ripple: true }], transcript);
    aplicar(novo);
    toast.success("Trecho removido");
  };

  const criarKeyframe = (prop: KeyProp) => {
    if (!clipeAtual) return;
    const tl = Math.round(playhead - clipeAtual.start);
    if (tl < 0 || tl > clipeAtual.duration) return toast.error("Posicione o playhead sobre o clipe.");
    const valor =
      prop === "volume"
        ? clipeAtual.volume
        : prop === "scale"
          ? clipeAtual.transform.scale
          : prop === "opacity"
            ? clipeAtual.transform.opacity
            : prop === "rotation"
              ? clipeAtual.transform.rotation
              : prop === "x"
                ? clipeAtual.transform.x
                : clipeAtual.transform.y;
    const ks = (clipeAtual.keyframes ?? []).filter((k) => !(k.prop === prop && Math.abs(k.atMs - tl) < 30));
    patchClipe({ keyframes: [...ks, { prop, atMs: tl, value: valor }] });
    toast.success(`Keyframe de ${prop} em ${formatarTempo(playhead)}`);
  };

  /* ---------------- seleção direta no reprodutor ---------------- */
  const elementosPalco = useMemo<ElementoPalco[]>(() => {
    const ativos = state.clips.filter(
      (c) => playhead >= c.start && playhead <= c.start + c.duration && c.kind !== "audio" && c.kind !== "caption",
    );
    return ativos.map((c) => {
      const tr = c.transform;
      let w = 1;
      let h = 1;
      if (c.kind === "text") {
        const fs = c.textStyle?.fontSize ?? 64;
        const txt = c.text ?? "";
        w = Math.min(0.92, Math.max(0.15, (txt.length * fs * 0.52) / state.width));
        h = Math.min(0.6, (fs * 1.6) / state.height);
      }
      return {
        id: c.id,
        kind: c.kind,
        cx: 0.5 + tr.x / state.width,
        cy: 0.5 + tr.y / state.height,
        w: w * tr.scale,
        h: h * tr.scale,
        rotation: tr.rotation,
        bloqueado: c.bloqueado,
      };
    });
  }, [state.clips, state.width, state.height, playhead]);

  const moverElemento = (cid: string, dx: number, dy: number) => {
    const c = state.clips.find((x) => x.id === cid);
    if (!c || c.bloqueado) return;
    setState((s) => ({
      ...s,
      clips: s.clips.map((x) => (x.id === cid ? { ...x, transform: { ...x.transform, x: x.transform.x + dx, y: x.transform.y + dy } } : x)),
    }));
  };
  const escalarElemento = (cid: string, fator: number) => {
    setState((s) => ({
      ...s,
      clips: s.clips.map((x) =>
        x.id === cid && !x.bloqueado
          ? { ...x, transform: { ...x.transform, scale: Math.max(0.1, Math.min(6, x.transform.scale * fator)) } }
          : x,
      ),
    }));
  };
  const girarElemento = (cid: string, graus: number) => {
    setState((s) => ({
      ...s,
      clips: s.clips.map((x) =>
        x.id === cid && !x.bloqueado ? { ...x, transform: { ...x.transform, rotation: x.transform.rotation + graus } } : x,
      ),
    }));
  };

  /** ordem de camada = ordem no array de clipes */
  const moverCamada = (dir: "frente" | "tras") => {
    const cid = clipeAtual?.id;
    if (!cid) return;
    const arr = [...state.clips];
    const i = arr.findIndex((c) => c.id === cid);
    const j = dir === "frente" ? i + 1 : i - 1;
    if (i < 0 || j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    aplicar({ ...state, clips: arr });
  };

  const desvincularAudio = () => {
    if (!clipeAtual) return;
    patchClipe({ semAudio: !clipeAtual.semAudio });
    toast.success(clipeAtual.semAudio ? "Áudio vinculado novamente" : "Áudio desvinculado do vídeo");
  };

  const congelarFrame = () => {
    if (!clipeAtual) return;
    patchClipe({ congelado: !clipeAtual.congelado, speed: clipeAtual.congelado ? 1 : 0.01 });
  };

  const adicionarMarcador = () => {
    const m = { id: novoId(), atMs: Math.round(playhead), cor: "#F26B1F" };
    aplicar({ ...state, marcadores: [...(state.marcadores ?? []), m] });
    toast.success("Marcador adicionado");
  };

  /* ---------------- mídia ---------------- */
  const inserirAsset = (
    assetId: string,
    destino?: { trackId?: string; startMs?: number },
    baseState?: ProjectState,
  ) => {
    const a = assets.find((x) => x.id === assetId);
    if (!a) {
      console.warn("[timeline] inserir: asset não encontrado", { assetId, ids: assets.map((x) => x.id) });
      toast.error("Mídia não encontrada na biblioteca deste projeto.");
      return;
    }
    const r = inserirAssetNaTimeline(baseState ?? state, a, destino ?? {});
    if (!r.ok) {
      console.warn("[timeline] inserir recusado", { assetId, erro: r.erro });
      toast.error(r.erro);
      return;
    }
    console.log("[timeline] clip inserido", {
      assetId,
      clipId: r.clip.id,
      trackId: r.clip.trackId,
      start: r.clip.start,
      duration: r.clip.duration,
      criouTrack: r.criouTrack,
      totalClips: r.state.clips.length,
    });
    aplicar(r.state);
    setSelecionados([r.clip.id]);
    void carregarNaEngine(a);
    toast.success(`"${a.nome}" na timeline`);
    return r.clip.id;
  };


  const importar = async (arquivos: FileList | File[] | string[] | null, posicaoMs?: number) => {
    if (!arquivos || (arquivos as { length: number }).length === 0) return;
    setOcupado(ehLocal() ? "Importando mídia…" : "Enviando mídia…");
    try {
      const proximo: ProjectState = { ...state, clips: [...state.clips] };
      const eraVazio = proximo.clips.length === 0;
      let dims: { w: number; h: number } | null = null;
      const novosAssets: AssetItem[] = [];

      const novas = await importarMidias(arquivos, {
        projectId: id,
        aoProgredir: (p) => setOcupado(p.fase === "pronto" ? null : p.mensagem),
      });

      for (const midia of novas) {
        const kind = midia.kind;
        if (!dims && midia.width > 0 && midia.height > 0) dims = { w: midia.width, h: midia.height };
        const novoAsset: AssetItem = {
          id: midia.id,
          nome: midia.nome,
          kind,
          durationMs: midia.durationMs,
          url: midia.url,
          thumbUrl: midia.thumbUrl ?? null,
          local: midia.local,
          existe: midia.existe,
        };
        await carregarNaEngine(novoAsset);
        novosAssets.push(novoAsset);

        const trilha = kind === "audio" ? "t-music" : "t-video";
        const fimTrilha = proximo.clips
          .filter((c) => c.trackId === trilha)
          .reduce((m, c) => Math.max(m, c.start + c.duration), 0);
        proximo.clips.push({
          id: novoId(),
          trackId: trilha,
          kind: kind === "audio" ? "audio" : kind === "image" ? "image" : "video",
          assetId: midia.id,
          start: posicaoMs != null ? Math.max(0, Math.round(posicaoMs)) : fimTrilha,
          duration: Math.max(1000, midia.durationMs || (kind === "image" ? 5000 : 3000)),
          sourceIn: 0,
          volume: 1,
          speed: 1,
          transform: transformPadrao(),
          label: midia.nome.slice(0, 28),
        });

        if (!audioBufferRef.current && kind !== "image" && midia.url) {
          try {
            audioBufferRef.current = await decodificarAudio(await (await fetch(midia.url)).blob());
          } catch (e) {
            console.warn(`[media] áudio não decodificável asset=${midia.id}`, e);
          }
        }
      }

      setAssets((a) => [...a.filter((x) => !novosAssets.some((n) => n.id === x.id)), ...novosAssets]);
      setMidias((m) => [...m.filter((x) => !novas.some((n) => n.id === x.id)), ...novas]);
      if (dims) {
        setDimsOriginais(dims);
        if (eraVazio) {
          proximo.width = dims.w;
          proximo.height = dims.h;
          engineRef.current?.redimensionar(dims.w, dims.h);
        }
      }
      aplicar(proximo);
      toast.success(ehLocal() ? "Mídia adicionada (arquivo continua no seu computador)" : "Mídia salva na galeria");
      if (autoRef.current) setAutoEtapa("planejar");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao importar");
      autoRef.current = null;
      setAutoEtapa(null);
    } finally {
      setOcupado(null);
    }
  };

  /** Arquivo movido no Finder: aponta o novo caminho e a timeline volta a funcionar. */
  const relinkAsset = async (assetId: string) => {
    const m = midias.find((x) => x.id === assetId);
    if (!m) return;
    const atualizado = await relinkarMidia(m);
    if (!atualizado) return;
    setMidias((cur) => cur.map((x) => (x.id === assetId ? atualizado : x)));
    const novo: AssetItem = {
      id: assetId,
      nome: atualizado.nome,
      kind: atualizado.kind,
      durationMs: atualizado.durationMs,
      url: atualizado.url,
      thumbUrl: atualizado.thumbUrl ?? null,
      local: atualizado.local,
      existe: true,
    };
    setAssets((cur) => cur.map((x) => (x.id === assetId ? { ...x, ...novo } : x)));
    await carregarNaEngine(novo);
    setState((cur) => recalcularDuracao({ ...cur }));
    toast.success("Mídia relinkada — seus cortes continuam intactos");
  };

  const renomearAsset = async (assetId: string, nome: string) => {
    setAssets((a) => a.map((x) => (x.id === assetId ? { ...x, nome } : x)));
    try {
      const m = midias.find((x) => x.id === assetId);
      if (m) await renomearMidia(m, nome);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao renomear");
    }
  };

  const excluirAsset = async (assetId: string) => {
    if (state.clips.some((c) => c.assetId === assetId)) {
      return toast.error("Remova os clipes desta mídia da timeline antes de excluir.");
    }
    setAssets((a) => a.filter((x) => x.id !== assetId));
    try {
      const m = midias.find((x) => x.id === assetId);
      if (m) await excluirMidia(m);
      setMidias((cur) => cur.filter((x) => x.id !== assetId));
      toast.success("Mídia removida do projeto");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao excluir");
    }
  };

  /* ---------------- áudio ---------------- */
  const separarAudio = () => {
    if (!clipeAtual || clipeAtual.kind !== "video") return toast.error("Selecione um clipe de vídeo.");
    const novo: EditairClip = {
      ...clipeAtual,
      id: novoId(),
      trackId: "t-voice",
      kind: "audio",
      label: `áudio de ${clipeAtual.label ?? "vídeo"}`,
    };
    aplicar({
      ...state,
      clips: [...state.clips.map((c) => (c.id === clipeAtual.id ? { ...c, muted: true } : c)), novo],
    });
    toast.success("Áudio separado para a trilha Voz");
  };

  const normalizar = async () => {
    if (!clipeAtual?.assetId) return toast.error("Selecione um clipe com áudio.");
    const info = assetsMap[clipeAtual.assetId];
    if (!info) return;
    setOcupado("Analisando áudio…");
    try {
      const { obterPicos } = await import("@/lib/editair/media");
      const picos = await obterPicos(info.url, info.url);
      if (!picos?.length) throw new Error("Não consegui ler o áudio.");
      const pico = Math.max(...picos);
      const ganho = Math.min(2, 0.9 / Math.max(0.05, pico));
      patchClipe({ volume: Number(ganho.toFixed(2)) });
      toast.success(`Volume normalizado para ${Math.round(ganho * 100)}%`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao normalizar");
    } finally {
      setOcupado(null);
    }
  };

  /* ---------------- IA / transcrição ---------------- */
  /**
   * O Desktop abre sem login (local-first). Toda função de nuvem exige sessão:
   * sem ela o serverFn responde "Unauthorized: No authorization header provided".
   */
  const exigirNuvem = async (): Promise<boolean> => {
    if (await temSessaoNuvem()) return true;
    setLoginNuvem(true);
    return false;
  };

  const analisar = async (): Promise<Transcript | null> => {
    if (!(await exigirNuvem())) return null;
    const buf = audioBufferRef.current;
    if (!buf) {
      toast.error("Reimporte o vídeo nesta sessão para analisar o áudio.");
      return null;
    }

    setOcupado("Transcrevendo…");
    try {
      const total = buf.duration * 1000;
      const bloco = 60_000;
      const palavras: Transcript["words"] = [];
      for (let ini = 0; ini < total; ini += bloco) {
        const fim = Math.min(total, ini + bloco);
        setOcupado(`Transcrevendo… ${Math.round((ini / total) * 100)}%`);
        const wav = paraWav16k(buf, ini, fim);
        const b64 = await blobParaBase64(wav);
        const r = await transcreverBlocoEditair({ data: { audioBase64: b64, offsetMs: Math.round(ini), idioma: "pt" } });
        palavras.push(...r.words);
      }
      const segmentos: Transcript["segments"] = [];
      let atual: typeof palavras = [];
      for (const w of palavras) {
        atual.push(w);
        if (/[.!?]$/.test(w.w) || atual.length >= 14) {
          segmentos.push({ start: atual[0].start, end: atual[atual.length - 1].end, text: atual.map((x) => x.w).join(" ") });
          atual = [];
        }
      }
      if (atual.length) segmentos.push({ start: atual[0].start, end: atual[atual.length - 1].end, text: atual.map((x) => x.w).join(" ") });
      const t: Transcript = { words: palavras, segments: segmentos };
      setTranscript(t);
      setFerramenta("legendas");
      toast.success(`${palavras.length} palavras transcritas`);
      return t;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha na transcrição");
      return null;
    } finally {
      setOcupado(null);
    }
  };


  const cortarPausas = () => {
    const buf = audioBufferRef.current;
    if (!buf) return toast.error("Reimporte o vídeo nesta sessão para detectar as pausas.");
    const base = state.clips.find((c) => c.trackId === "t-video");
    if (!base) return toast.error("Importe um vídeo primeiro.");
    const env = calcularEnvelope(buf);
    const { regioes, pausas } = detectarFala(env);
    if (!regioes.length) return toast.error("Não encontrei fala no áudio.");
    const novos: EditairClip[] = [];
    let cursor = 0;
    for (const r of regioes) {
      const dur = r.end - r.start;
      novos.push({ ...base, id: novoId(), start: cursor, duration: dur, sourceIn: Math.round(r.start), label: `fala ${formatarTempo(r.start)}` });
      cursor += dur;
    }
    const restantes = state.clips.filter((c) => c.trackId !== "t-video" && c.trackId !== "t-caption");
    aplicar({ ...state, clips: [...restantes, ...novos] });
    const removido = pausas.reduce((s, p) => s + (p.end - p.start), 0);
    toast.success(`${pausas.length} pausas removidas (−${formatarTempo(removido)})`);
  };

  const legendar = () => {
    if (!transcript?.words.length) return toast.error("Transcreva o áudio antes de legendar.");
    const legendas = gerarLegendas(state, transcript, "frase");
    const semLegenda = state.clips.filter((c) => c.trackId !== "t-caption");
    aplicar({ ...state, clips: [...semLegenda, ...legendas] });
    toast.success(`${legendas.length} legendas geradas`);
  };

  const adicionarTexto = () => {
    const clip: EditairClip = {
      id: novoId(),
      trackId: "t-text",
      kind: "text",
      start: Math.round(playhead),
      duration: 3000,
      sourceIn: 0,
      volume: 0,
      speed: 1,
      transform: transformPadrao(),
      text: "Seu texto aqui",
      textStyle: { ...TEXTO_PADRAO },
      label: "Texto",
    };
    aplicar({ ...state, clips: [...state.clips, clip] });
    setSelecionados([clip.id]);
    setFerramenta("texto");
  };

  const conversar = async (texto: string) => {
    if (!(await exigirNuvem())) return;
    setMensagens((m) => [...m, { id: novoId("m"), autor: "usuario", texto }]);
    setPensando(true);
    try {
      const r = await dirigirEdicaoEditair({
        data: {
          mensagem: texto,
          playheadMs: Math.round(playhead),
          selecao,
          clipeSelecionadoId: selecionados[0] ?? null,
          duracaoMs: state.durationMs,
          clipes: state.clips.slice(0, 400).map((c) => ({
            id: c.id,
            kind: c.kind,
            trackId: c.trackId,
            start: Math.round(c.start),
            duration: Math.round(c.duration),
            label: c.label ?? null,
          })),
          trilhas: state.tracks.map((t) => ({ id: t.id, name: t.name, kind: t.kind })),
          transcricao: (transcript?.segments ?? [])
            .map((s) => `[${Math.round(s.start)}-${Math.round(s.end)}] ${s.text}`)
            .join("\n")
            .slice(0, 24000),
        },
      });
      const ops = (r.ops ?? []) as unknown as EditairOp[];
      if (ops.length) {
        const { state: novo } = aplicarOps(state, ops, transcript);
        aplicar(novo);
      }
      setMensagens((m) => [...m, { id: novoId("m"), autor: "ia", texto: r.resposta, ops: ops.length }]);
      void registrarEvento({ projectId: id, actor: "ia", message: r.resposta, ops: r.ops });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Falha na IA";
      setMensagens((m) => [...m, { id: novoId("m"), autor: "ia", texto: msg }]);
      toast.error(msg);
    } finally {
      setPensando(false);
    }
  };

  /**
   * Edição com IA em duas fases: a IA devolve um PLANO tipado (nada é aplicado),
   * o usuário aprova e só então o EditAir executa tudo de uma vez — em camadas,
   * de forma não destrutiva e com um único Desfazer.
   */
  const planejarEdicaoIa = async (instrucao: string) => {
    if (!(await exigirNuvem())) return;
    const clip = iaEscopo === "clipe" && iaClipId ? state.clips.find((c) => c.id === iaClipId) : null;
    if (iaEscopo === "clipe" && !clip) {
      toast.error("Selecione um clipe para editar.");
      return;
    }

    const ratio = state.width / state.height;
    const janela =
      clip != null
        ? { de: clip.start, ate: clip.start + clip.duration }
        : iaEscopo === "cena"
          ? { de: Math.max(0, playhead - 30000), ate: playhead + 30000 }
          : { de: 0, ate: state.durationMs };

    const trechoTranscricao = (transcript?.segments ?? [])
      .filter((s) => s.end >= janela.de && s.start <= janela.ate)
      .map((s) => `[${Math.round(s.start)}-${Math.round(s.end)}] ${s.text}`)
      .join("\n")
      .slice(0, 30000);

    const contexto = [
      clip
        ? `Clipe alvo: ${clip.id} (${clip.kind}) na camada "${state.tracks.find((t) => t.id === clip.trackId)?.name ?? clip.trackId}", ${Math.round(clip.start)}ms → ${Math.round(clip.start + clip.duration)}ms, sourceIn ${Math.round(clip.sourceIn)}ms, velocidade ${clip.speed || 1}.`
        : iaEscopo === "cena"
          ? `Cena atual: ${Math.round(janela.de)}ms → ${Math.round(janela.ate)}ms (playhead em ${Math.round(playhead)}ms).`
          : "Projeto inteiro.",
      `Formato: ${ratio < 0.85 ? "vertical" : ratio > 1.2 ? "horizontal" : "quadrado"} (${state.width}x${state.height}).`,
    ].join("\n");

    setPensando(true);
    setIaEtapasFeitas([]);
    setEtapaIa("Analisando a fala e o material…");
    try {
      setEtapaIa("Planejando cortes, camadas e legendas…");
      const p = await planejarOperacoesEditair({
        data: {
          escopo: iaEscopo,
          instrucao,
          contexto,
          duracaoMs: Math.round(state.durationMs),
          playheadMs: Math.round(playhead),
          clipes: state.clips.slice(0, 400).map((c) => ({
            id: c.id,
            kind: c.kind,
            trackId: c.trackId,
            start: Math.round(c.start),
            duration: Math.round(c.duration),
            label: c.label ?? null,
          })),
          trilhas: state.tracks.map((t) => ({ id: t.id, name: t.name, kind: t.kind })),
          midias: assets.slice(0, 120).map((a) => ({
            id: a.id,
            nome: a.nome,
            kind: a.kind,
            durationMs: Math.round(a.durationMs),
          })),
          transcricao: trechoTranscricao,
        },
      });
      const pronto: PlanoIa = { ...p, resumo: resumoDoPlano(p) };
      if (!planoGrande(pronto)) {
        await aplicarPlanoIa(pronto);
        return;
      }
      setIaPlano(pronto);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao planejar a edição");
    } finally {
      setPensando(false);
      setEtapaIa("");
    }
  };

  /** Aplica o plano aprovado: gera mídias, cria camadas e executa as operações. */
  const aplicarPlanoIa = async (p: PlanoIa) => {
    setPensando(true);
    const feitas: string[] = [];
    const marcar = (t: string) => {
      feitas.push(t);
      setIaEtapasFeitas([...feitas]);
    };
    try {
      let ops = validarOps(p.ops, state, iaEscopo === "clipe" ? iaClipId : null);
      let base = state;

      // 1. gerações de IA viram ARQUIVOS na Biblioteca (assets normais e editáveis)
      if (p.geracoes.length) {
        setEtapaIa(`Gerando ${p.geracoes.length} cena(s) com IA…`);
        const prontas = await executarGeracoes(p.geracoes, {
          vertical: state.width < state.height,
          aoProgredir: (m) => setEtapaIa(m),
        });
        if (prontas.length) {
          const novas = await importarMidias(
            prontas.map((g) => g.arquivo),
            { projectId: id, aoProgredir: (pr) => setEtapaIa(pr.mensagem) },
          );
          const novosAssets: AssetItem[] = [];
          for (const midia of novas) {
            const asset: AssetItem = {
              id: midia.id,
              nome: midia.nome,
              kind: midia.kind,
              durationMs: midia.durationMs,
              url: midia.url,
              thumbUrl: midia.thumbUrl ?? null,
              local: midia.local,
              existe: midia.existe,
            };
            await carregarNaEngine(asset);
            novosAssets.push(asset);
          }
          setAssets((a) => [...a.filter((x) => !novosAssets.some((n) => n.id === x.id)), ...novosAssets]);
          setMidias((m) => [...m.filter((x) => !novas.some((n) => n.id === x.id)), ...novas]);

          // cada cena gerada entra na camada "IA Gerada" como clipe editável
          const camada: EditairOp[] = [
            { op: "create_track", ref: "ia-gerada", kind: "broll", name: "IA Gerada" } as EditairOp,
          ];
          const insercoes = prontas.map((g, i) => {
            const midia = novas[i];
            return {
              op: "insert_clip",
              trackId: "ia-gerada",
              assetId: midia?.id,
              kind: g.arquivo.type.startsWith("image") ? "image" : "video",
              startMs: Math.round(g.pedido.startMs),
              durationMs: Math.round(g.pedido.durationMs || midia?.durationMs || 4000),
              label: "Cena IA",
            } as EditairOp;
          });
          ops = [...camada, ...insercoes, ...ops];
          marcar(`${prontas.length} cena(s) gerada(s) e adicionada(s) à Biblioteca`);
        }
      }

      if (!ops.length) {
        toast.info("Nada aplicável no plano.");
        return;
      }

      setEtapaIa("Organizando camadas e aplicando a edição…");
      // checkpoint único: aplicar() empilha o estado anterior — um Desfazer reverte tudo
      const { state: novo } = aplicarOps(base, ops, transcript, duracoesFonte);
      base = novo;
      aplicar(novo);
      marcar("Edição aplicada na timeline");
      setMensagens((m) => [...m, { id: novoId("m"), autor: "ia", texto: p.resposta, ops: ops.length }]);
      toast.success(`${ops.length} operação(ões) aplicada(s) — use Desfazer para reverter tudo`);
      setIaPlano(null);
      setIaAberto(false);
      setIaClipId(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao aplicar a edição");
    } finally {
      setPensando(false);
      setEtapaIa("");
      setIaEtapasFeitas([]);
    }
  };

  /* ------------- cérebro editorial: plano antes do corte ------------- */

  const planejar = async (objetivo: string, ajuste = "") => {
    if (!(await exigirNuvem())) return;
    const buf = audioBufferRef.current;
    const base = state.clips.find((c) => c.trackId === "t-video" && c.assetId);
    const asset = base?.assetId ? assets.find((a) => a.id === base.assetId) : null;
    if (!buf || !base || !asset) {
      toast.error("Importe o vídeo nesta sessão para o editor-chefe analisar o material.");
      return;
    }
    setPensando(true);
    setObjetivoIa(objetivo || objetivoIa);
    const ratio = state.width / Math.max(1, state.height);
    const formatoProjeto = ratio < 0.85 ? "vertical" : ratio > 1.2 ? "horizontal" : "quadrado";
    try {
      setEtapaIa("Ouvindo o áudio e medindo cada trecho…");
      const audio = analisarAudio(buf);

      setEtapaIa("Olhando a imagem: exposição, contraste, nitidez e enquadramento…");
      let visual = null;
      try {
        visual = await analisarVisual(asset.url, asset.durationMs || audio.durationMs, state.width / state.height);
      } catch {
        visual = null;
      }
      const analise: AnaliseTecnica = { ...audio, visual };

      setEtapaIa("Lendo o que foi dito…");
      const t = transcript ?? (await analisar());

      setEtapaIa("Pensando como editor: narrativa, tomadas e ritmo…");
      const bruto = await planejarEdicaoEditair({
        data: {
          objetivo: objetivo || objetivoIa,
          ajuste,
          planoAnterior: ajuste && plano ? JSON.stringify({ estrategia: plano.estrategia, cortes: plano.cortes.slice(0, 120) }) : "",
          formato: formatoProjeto,
          duracaoMs: Math.round(audio.durationMs),
          transcricao: transcricaoParaPrompt(t?.segments ?? []),
          analise: JSON.stringify(resumirAnalise(analise)),
        },
      });
      const novo = normalizarPlano(JSON.parse(bruto), audio.durationMs, formatoProjeto);
      if (!novo.cortes.length) {
        toast.error("O editor não conseguiu montar um plano com esse material.");
        return;
      }
      setPlano(novo);
      setMensagens((m) => [...m, { id: novoId("m"), autor: "ia", texto: novo.estrategia || novo.intencao }]);
      void registrarEvento({ projectId: id, actor: "ia", message: novo.estrategia, ops: null });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao gerar o plano editorial");
    } finally {
      setEtapaIa("");
      setPensando(false);
    }
  };

  const aplicarPlano = () => {
    if (!plano) return;
    const base = state.clips.find((c) => c.trackId === "t-video" && c.assetId);
    if (!base?.assetId) return toast.error("Importe o vídeo antes de montar.");
    const { state: novo, resumo } = montarRoughCut(state, plano, base.assetId);
    aplicar(novo);
    setSelecionados([]);
    toast.success(resumo);
  };

  /* --------- fluxo automático vindo da tela "Novo projeto" --------- */
  useEffect(() => {
    if (autoEtapa !== "planejar" || pensando) return;
    if (!state.clips.some((c) => c.trackId === "t-video" && c.assetId)) return;
    setAutoEtapa("montar");
    void planejar(autoRef.current?.instrucao ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoEtapa, state.clips]);

  useEffect(() => {
    if (autoEtapa !== "montar" || pensando || !plano) return;
    setAutoEtapa(null);
    autoRef.current = null;
    aplicarPlano();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoEtapa, plano, pensando]);




  /* ---------------- exportação ---------------- */

  /** duração REAL da composição (fim do último clipe) — nunca a duração do arquivo importado */
  const duracaoExport = useMemo(() => duracaoComposicao(state, duracoesFonte), [state, duracoesFonte]);

  const caminhosAssets = useMemo(() => {
    const m: Record<string, string | undefined> = {};
    for (const a of assets) m[a.id] = (a as { localPath?: string }).localPath;
    return m;
  }, [assets]);

  useEffect(() => {
    if (!exportAberto) return;
    try {
      setCapaExport(engineRef.current?.canvas.toDataURL("image/jpeg", 0.7) ?? null);
    } catch {
      setCapaExport(null);
    }
    const api = pontoDesktop();
    if (api && !pastaExport) void api.dialogo.pastaExport().then(setPastaExport).catch(() => null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exportAberto]);

  const idDoCodec = (mime: string) =>
    mime.includes("hvc1") ? "h265" : mime.includes("vp9") ? "vp9" : mime.includes("av01") ? "av1" : "h264";

  /** Render final nativo (Desktop): quadro a quadro para o FFmpeg, sem depender de rAF. */
  const exportarDesktop = async (cfg: ExportConfig, eng: EditairEngine, estadoRender: ProjectState) => {
    const api = pontoDesktop();
    if (!api) throw new Error("Ponte desktop indisponível");

    const nomeArquivo = `${cfg.nome.replace(/[^\w\- ]+/g, "-").trim()}.${cfg.formato}`;
    const destino = await api.dialogo.salvarComo(nomeArquivo, pastaExport ?? undefined);
    if (!destino) {
      setProgresso(null);
      return;
    }
    setPastaExport(destino.replace(/[/\\][^/\\]+$/, ""));

    eng.redimensionar(state.width, state.height, cfg.altura / state.height);
    eng.prepararRenderQuadros();
    const W = eng.canvas.width;
    const H = eng.canvas.height;

    const audio = cfg.comAudio ? planoDeAudio(estadoRender, caminhosAssets, duracoesFonte) : [];
    const totalFrames = Math.max(1, Math.round((duracaoExport / 1000) * cfg.fps));

    const { id } = await api.render.quadros.iniciar({
      destino,
      width: W,
      height: H,
      fps: cfg.fps,
      totalFrames,
      formato: cfg.formato,
      codec: idDoCodec(cfg.mime),
      videoBitrate: cfg.bitrate,
      audio,
      comAudio: cfg.comAudio && audio.length > 0,
    });

    const t0 = performance.now();
    try {
      for (let i = 0; i < totalFrames; i++) {
        if (cancelarExportRef.current) {
          await api.render.quadros.cancelar(id);
          setProgresso(null);
          toast.info("Exportação cancelada");
          return;
        }
        const t = (i * 1000) / cfg.fps;
        await eng.renderizarQuadro(estadoRender, t);
        const px = eng.quadroRGBA();
        await api.render.quadros.quadro(id, px);
        const decorrido = performance.now() - t0;
        const restantes = totalFrames - (i + 1);
        setProgresso({
          pct: ((i + 1) / totalFrames) * 100,
          frame: i + 1,
          totalFrames,
          etaS: (decorrido / (i + 1)) * restantes / 1000,
          fase: "Renderizando localmente…",
        });
      }
      setProgresso({ pct: 99, frame: totalFrames, totalFrames, etaS: 0, fase: "Finalizando arquivo…" });
      const fim = await api.render.quadros.finalizar(id);
      setProgresso(null);
      setResultado({
        caminho: fim.destino,
        nome: nomeArquivo,
        bytes: fim.bytes ?? 0,
        largura: W,
        altura: H,
        fps: cfg.fps,
        duracaoMs: duracaoExport,
      });
      toast.success("Exportação concluída");
    } catch (e) {
      await api.render.quadros.cancelar(id).catch(() => null);
      throw e;
    } finally {
      eng.definirMudo(false);
      eng.redimensionar(state.width, state.height, qualidade);
    }
  };

  const exportar = async (cfg: ExportConfig) => {
    const eng = engineRef.current;
    if (!eng || duracaoExport < 200) {
      toast.error("Nada para exportar.");
      return;
    }
    cancelarExportRef.current = false;
    setResultado(null);
    setProgresso({ pct: 0, frame: 0, totalFrames: 0, etaS: 0, fase: "Preparando…" });
    setTocando(false);

    const estadoRender: ProjectState =
      cfg.escopo === "audio" && cfg.mixagem !== "completo"
        ? {
            ...state,
            tracks: state.tracks.map((t) =>
              cfg.mixagem === "voz"
                ? { ...t, muted: t.id === "t-music" ? true : t.muted }
                : { ...t, muted: t.id === "t-music" ? false : true },
            ),
          }
        : state;

    try {
      if (cfg.escopo === "video" && pontoDesktop()) {
        await exportarDesktop(cfg, eng, estadoRender);
        return;
      }

      if (cfg.escopo === "video") eng.redimensionar(state.width, state.height, cfg.altura / state.height);
      // nada de som acelerado durante o render: o áudio do arquivo final vem do mix, não das caixas
      if (cfg.escopo === "video") eng.definirMudo(true);

      const stream = cfg.escopo === "video" ? eng.streamExport(cfg.fps) : eng.streamAudio();
      if (cfg.escopo === "video" && !cfg.comAudio) {
        for (const t of stream.getAudioTracks()) stream.removeTrack(t);
      }
      const mimeGravacao =
        cfg.escopo === "audio" && cfg.mime === "wav"
          ? MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
            ? "audio/webm;codecs=opus"
            : "audio/mp4"
          : cfg.mime;
      const rec = new MediaRecorder(stream, {
        mimeType: mimeGravacao,
        videoBitsPerSecond: cfg.bitrate,
        audioBitsPerSecond: cfg.audioBitrate * 1000,
      });
      const partes: BlobPart[] = [];
      rec.ondataavailable = (e) => e.data.size && partes.push(e.data);
      const fim = new Promise<void>((r) => (rec.onstop = () => r()));

      rec.start(400);
      const totalFrames = Math.round((duracaoExport / 1000) * cfg.fps);
      const t0 = performance.now();
      await new Promise<void>((resolve) => {
        const passo = () => {
          if (cancelarExportRef.current) return resolve();
          const t = performance.now() - t0;
          if (t >= duracaoExport) return resolve();
          eng.sincronizar(estadoRender, t, true);
          if (cfg.escopo === "video") eng.desenhar(estadoRender, t);
          setPlayhead(t);
          const pct = (t / duracaoExport) * 100;
          setProgresso({
            pct,
            frame: Math.round((t / 1000) * cfg.fps),
            totalFrames: cfg.escopo === "video" ? totalFrames : 0,
            etaS: (duracaoExport - t) / 1000,
            fase: "Exportando…",
          });
          requestAnimationFrame(passo);
        };
        requestAnimationFrame(passo);
      });
      rec.stop();
      await fim;
      eng.pausarTudo();
      eng.definirMudo(false);
      eng.redimensionar(state.width, state.height, qualidade);

      if (cancelarExportRef.current) {
        setProgresso(null);
        toast.info("Exportação cancelada");
        return;
      }

      let blob = new Blob(partes, { type: mimeGravacao.split(";")[0] });
      let ext = cfg.formato;
      if (cfg.escopo === "audio" && cfg.mime === "wav") {
        setProgresso({ pct: 99, frame: 0, totalFrames: 0, etaS: 3, fase: "Convertendo áudio…" });
        const buf = await decodificarAudio(blob);
        blob = encodeWav(buf);
        ext = "wav";
      }
      const nomeArquivo = `${cfg.nome.replace(/[^\w\-]+/g, "-").toLowerCase()}.${ext}`;
      setProgresso(null);
      setResultado({
        url: URL.createObjectURL(blob),
        nome: nomeArquivo,
        bytes: blob.size,
        largura: cfg.escopo === "video" ? cfg.largura : 0,
        altura: cfg.escopo === "video" ? cfg.altura : 0,
        fps: cfg.fps,
        duracaoMs: duracaoExport,
      });
      toast.success("Exportação concluída");
    } catch (e) {
      setProgresso(null);
      eng.definirMudo(false);
      eng.redimensionar(state.width, state.height, qualidade);
      toast.error(e instanceof Error ? e.message : "Falha ao exportar");
    }
  };


  /* ---------------- atalhos ---------------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const alvo = e.target as HTMLElement;
      if (alvo && ["INPUT", "TEXTAREA", "SELECT"].includes(alvo.tagName)) return;
      const frame = 1000 / (state.fps || 30);
      if (e.code === "Space") {
        e.preventDefault();
        setTocando((v) => !v);
      } else if (e.key === "ArrowLeft") {
        setPlayhead((p) => Math.max(0, p - (e.shiftKey ? frame * 10 : frame)));
      } else if (e.key === "ArrowRight") {
        setPlayhead((p) => Math.min(state.durationMs, p + (e.shiftKey ? frame * 10 : frame)));
      } else if (e.key === "s" && !e.metaKey && !e.ctrlKey) {
        dividir();
      } else if (e.key === "Delete" || e.key === "Backspace") {
        excluirSelecionados(e.shiftKey);
      } else if ((e.metaKey || e.ctrlKey) && e.key === "z") {
        e.preventDefault();
        if (e.shiftKey) refazer();
        else desfazer();
      } else if ((e.metaKey || e.ctrlKey) && e.key === "c") {
        copiar();
      } else if ((e.metaKey || e.ctrlKey) && e.key === "v") {
        colar();
      } else if ((e.metaKey || e.ctrlKey) && e.key === "d") {
        e.preventDefault();
        duplicar();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (carregando) {
    return (
      <div className="flex h-[calc(100vh-3.5rem)] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-[#F26B1F]" />
      </div>
    );
  }

  const assetItens: AssetItem[] = assets;

  return (
    <>
    <WorkspaceLayout
      alturaTimeline={alturaTimeline}
      onAlturaTimeline={setAlturaTimeline}
      topbar={
      <div className="flex h-full items-center gap-3 border-b border-white/10 bg-[#0d1116] px-3">

        <div className="flex-1" />

        <TopBtn onClick={desfazer} titulo="Desfazer">
          <Undo2 className="h-4 w-4" />
        </TopBtn>
        <TopBtn onClick={refazer} titulo="Refazer">
          <Redo2 className="h-4 w-4" />
        </TopBtn>
        <TopBtn onClick={() => void salvar(false)} titulo="Salvar agora">
          {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        </TopBtn>
        <Button
          size="sm"
          variant="outline"
          className="h-8 gap-1.5 border-[#F26B1F]/40 bg-transparent text-xs text-[#F26B1F] hover:bg-[#F26B1F]/10 hover:text-[#F26B1F]"
          onClick={() => {
            setIaClipId(null);
            setIaEscopo(clipeAtual ? "cena" : "projeto");
            setIaPlano(null);
            setIaAberto(true);
          }}
        >
          <Sparkles className="h-3.5 w-3.5" />
          Editar com IA
        </Button>
        <Button
          size="sm"
          className="h-8 bg-[#F26B1F] text-xs font-bold hover:bg-[#d95c14]"
          onClick={() => {
            setResultado(null);
            setExportAberto(true);
          }}
        >
          Exportar
        </Button>
      </div>
      }
      rail={
        <aside className="flex h-full flex-col gap-1 overflow-y-auto border-r border-white/10 bg-[#0f141a] p-1.5">

          {FERRAMENTAS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFerramenta(f.id)}
              className={`flex flex-col items-center gap-1 rounded-lg px-1 py-2 text-[10px] transition ${
                ferramenta === f.id ? "bg-[#F26B1F]/15 text-[#F26B1F]" : "text-white/55 hover:bg-white/5 hover:text-white"
              }`}
            >
              {f.icone}
              {f.nome}
            </button>
          ))}
        </aside>

        <section className="min-h-0 overflow-hidden border-r border-white/10 bg-[#12171d]">
          <ToolPanel
            onDemonstrarClip={demonstrarClipe}
            fundoPronto={fundoPronto}
            fundoCarregando={fundoCarregando}
            ferramenta={ferramenta}
            state={state}
            clip={clipeAtual}
            assets={assetItens}
            transcript={transcript}
            mensagens={mensagens}
            pensando={pensando}
            playheadMs={playhead}
            onImportar={(f) => void importar(f)}
            onRenomearAsset={(aid, nome) => void renomearAsset(aid, nome)}
            onExcluirAsset={(aid) => void excluirAsset(aid)}
            onRelinkAsset={(aid) => void relinkAsset(aid)}
            onInserirAsset={inserirAsset}
            onEditarComIaAsset={(aid) => {
              const jaNaTimeline = state.clips.find((c) => c.assetId === aid);
              const cid = jaNaTimeline?.id ?? inserirAsset(aid);
              if (cid) {
                setIaEscopo("clipe");
                setIaEscopo("clipe");
            setIaClipId(cid);
              }
            }}
            onTranscreverAsset={() => void analisar()}
            onPatchClip={(patch) => patchClipe(patch)}
            onPatchState={(patch) => aplicar({ ...state, ...patch })}
            onCaption={(patch: Partial<CaptionStyle>) => aplicar({ ...state, captionStyle: { ...state.captionStyle, ...patch } })}
            onAplicarModeloLegenda={aplicarModeloLegenda}
            onAdicionarTexto={adicionarTexto}
            onAnalisar={() => void analisar()}
            onGerarLegendas={legendar}
            onCortarPausas={cortarPausas}
            onSepararAudio={separarAudio}
            onNormalizar={() => void normalizar()}
            onExtrairAudio={() => {
              setResultado(null);
              setExportAberto(true);
            }}
            onKeyframe={criarKeyframe}
            onEnviarIa={(t) => void conversar(t)}
            plano={plano}
            etapaIa={etapaIa}
            onPlanejar={(o) => void planejar(o)}
            onAplicarPlano={aplicarPlano}
            onAjustarPlano={(t) => void planejar(objetivoIa, t)}
            onDescartarPlano={() => setPlano(null)}
            onSeek={setPlayhead}
            onApagarTrecho={apagarTrecho}
          />
        </section>

        <PlayerStage
          canvasRef={canvasRef}
          width={state.width}
          height={state.height}
          originalWidth={dimsOriginais?.w}
          originalHeight={dimsOriginais?.h}
          fps={state.fps}
          playheadMs={playhead}
          durationMs={state.durationMs}
          tocando={tocando}
          volume={volume}
          mudo={mudo}
          qualidade={qualidade}
          onPlayPause={() => setTocando((v) => !v)}
          onSeek={setPlayhead}
          onFrame={(d) => setPlayhead((p) => Math.max(0, Math.min(state.durationMs, p + (d * 1000) / (state.fps || 30))))}
          onVolume={setVolume}
          onMudo={setMudo}
          onQualidade={setQualidade}
          onFormato={(w, h) => aplicar({ ...state, width: w, height: h })}
          elementos={elementosPalco}
          selecionadoId={selecionados[0] ?? null}
          onSelecionar={(cid) => setSelecionados(cid ? [cid] : [])}
          onMover={moverElemento}
          onEscalar={escalarElemento}
          onGirar={girarElemento}
        />

        <Inspector
          state={state}
          clip={clipeAtual}
          assets={assetItens.map((a) => ({ id: a.id, nome: a.nome }))}
          onPatchClip={(patch) => patchClipe(patch)}
          onPatchState={(patch) => aplicar({ ...state, ...patch })}
          onCaption={(patch) => aplicar({ ...state, captionStyle: { ...state.captionStyle, ...patch } })}
          onKeyframe={criarKeyframe}
          onDuplicar={duplicar}
          onCamada={moverCamada}
          onDesvincularAudio={desvincularAudio}
          onExtrairAudio={() => {
            setResultado(null);
            setExportAberto(true);
          }}
          onNormalizar={() => void normalizar()}
          onSepararAudio={separarAudio}
          onAnalisarFundo={async (onProgresso, cancelado) => {
            const eng = engineRef.current;
            const c = clipeAtual;
            if (!eng || !c) return false;
            return eng.analisarFundo(c, onProgresso, cancelado);
          }}
        />
      </div>

      {/* splitter vertical: só redistribui altura entre área superior e timeline */}
      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label="Redimensionar timeline"
        data-testid="editair-splitter"
        onPointerDown={(e) => {
          e.preventDefault();
          const y0 = e.clientY;
          const h0 = alturaTimeline;
          const mover = (ev: PointerEvent) =>
            setAlturaTimeline(alturaTimelineValida(h0 + (y0 - ev.clientY), window.innerHeight - 56 - 46));
          const soltar = () => {
            window.removeEventListener("pointermove", mover);
            window.removeEventListener("pointerup", soltar);
          };
          window.addEventListener("pointermove", mover);
          window.addEventListener("pointerup", soltar);
        }}
        className="group flex cursor-row-resize items-center justify-center bg-white/5 transition hover:bg-[#F26B1F]/40"
      >
        <span className="h-0.5 w-16 rounded-full bg-white/20 group-hover:bg-[#F26B1F]" />
      </div>

      {/* timeline */}
      <div className="grid min-h-0 grid-rows-[42px_1fr] border-t border-white/10">

        <div className="flex items-center gap-1.5 border-b border-white/10 bg-[#0d1116] px-3 text-[11px]">
          <BarraBtn onClick={dividir} icone={<Scissors className="h-3.5 w-3.5" />} texto="Dividir" />
          <BarraBtn onClick={() => excluirSelecionados(false)} icone={<Trash2 className="h-3.5 w-3.5" />} texto="Excluir" />
          <BarraBtn onClick={() => excluirSelecionados(true)} icone={<Trash2 className="h-3.5 w-3.5" />} texto="Ripple delete" />
          <BarraBtn onClick={duplicar} icone={<Copy className="h-3.5 w-3.5" />} texto="Duplicar" />
          <BarraBtn onClick={copiar} texto="Copiar" />
          <BarraBtn onClick={colar} texto="Colar" />
          <BarraBtn onClick={congelarFrame} texto="Congelar" />
          <BarraBtn onClick={desvincularAudio} texto="Desvincular áudio" />
          <BarraBtn onClick={adicionarMarcador} texto="Marcador" />
          <button
            onClick={() => setSnapping((v) => !v)}
            className={`ml-1 flex items-center gap-1 rounded-md px-2 py-1 transition ${
              snapping ? "bg-[#F26B1F]/20 text-[#F26B1F]" : "text-white/50 hover:bg-white/10"
            }`}
          >
            <Magnet className="h-3.5 w-3.5" /> Snap
          </button>
          <button
            onClick={() => setRippleTrim((v) => !v)}
            className={`flex items-center gap-1 rounded-md px-2 py-1 transition ${
              rippleTrim ? "bg-[#F26B1F]/20 text-[#F26B1F]" : "text-white/50 hover:bg-white/10"
            }`}
            title="Ao aparar, aproxima automaticamente os clipes seguintes"
          >
            Ripple trim
          </button>

          {selecao ? (
            <button
              onClick={() => {
                apagarTrecho(selecao.fromMs, selecao.toMs);
                setSelecao(null);
              }}
              className="rounded-md px-2 py-1 text-red-400 hover:bg-red-500/10"
            >
              Apagar intervalo {formatarTempo(selecao.fromMs)}–{formatarTempo(selecao.toMs)}
            </button>
          ) : null}
          <div className="flex-1" />
          <span className="text-white/35">{selecionados.length} selecionado(s)</span>
          <button onClick={() => setZoom((z) => Math.max(8, z / 1.4))} className="rounded p-1 text-white/50 hover:bg-white/10">
            <ZoomOut className="h-4 w-4" />
          </button>
          <button onClick={() => setZoom((z) => Math.min(600, z * 1.4))} className="rounded p-1 text-white/50 hover:bg-white/10">
            <ZoomIn className="h-4 w-4" />
          </button>
        </div>
        <Timeline
          state={state}
          playheadMs={playhead}
          zoom={zoom}
          selecionados={selecionados}
          selecao={selecao}
          assets={assetsMap}
          snapping={snapping}
          rippleTrim={rippleTrim}
          onSeek={(ms) => setPlayhead(Math.max(0, ms))}
          onSelecionar={setSelecionados}
          onSelecao={setSelecao}
          onAlterarClip={alterarClipTimeline}
          onAlterarClips={alterarClipsTimeline}
          onAbrirSource={setSourceClipId}
          onRestaurarClip={restaurarClip}
          onSoltarArquivos={(arquivos, ms) => void importar(arquivos, ms)}
          onSoltarAsset={(assetId: string, ms: number, destino?: DestinoSolto) => {
            // drag da Biblioteca e botão "+ Inserir" terminam no mesmo serviço de inserção
            if (destino?.tipo === "nova") {
              const nova = criarTrackEm(state, destino.indice);
              protegerTrack(nova.trackId);
              inserirAsset(assetId, { startMs: ms, trackId: nova.trackId }, nova.state);
              return;
            }
            inserirAsset(assetId, { startMs: ms, trackId: destino?.trackId });
          }}
          onNovaTrilhaVideo={() => {
            // camadas de vídeo empilhadas: a nova entra acima (aparece por cima no preview)
            const nova = criarTrackEm(state, 0);
            protegerTrack(nova.trackId);
            aplicar(nova.state);
          }}
          onSoltarClip={soltarClip}
          onMoverCamada={moverClipCamada}
          onNovaCamadaJunto={novaCamadaJunto}
          onReordenarTracks={reordenarTracks}
          onRenomearTrack={(trackId, nome) =>
            aplicar({ ...state, tracks: state.tracks.map((t) => (t.id === trackId ? { ...t, name: nome } : t)) })
          }
          onExcluirTrack={(trackId) => {
            tracksProtegidas.current.delete(trackId);
            usarResultado(excluirTrack(state, trackId));
          }}
          onEditarComIa={(cid) => {
            setSelecionados([cid]);
            setIaEscopo("clipe");
            setIaClipId(cid);
          }}
          onAcaoClip={(cid, acao) => {
            const c = state.clips.find((x) => x.id === cid);
            if (!c) return;
            setSelecionados([cid]);
            if (acao === "copiar") {
              clipboardRef.current = [{ ...c }];
              toast.success("Clipe copiado");
            } else if (acao === "bloquear") patchClipe({ bloqueado: !c.bloqueado }, cid);
            else if (acao === "mudo") patchClipe({ muted: !c.muted }, cid);
            else if (acao === "congelar") patchClipe({ congelado: !c.congelado, speed: c.congelado ? 1 : 0.01 }, cid);
            else if (acao === "desvincular") patchClipe({ semAudio: !c.semAudio }, cid);
            else
              usarResultado(
                acaoDeClip(state, cid, acao as Parameters<typeof acaoDeClip>[2], {
                  playheadMs: playhead,
                  transcript,
                  duracoesFonte,
                }),
              );
          }}

          onToggleTrack={(trackId, campo) => aplicar(alternarTrack(state, trackId, campo))}

        />
      </div>

      <LoginNuvemDialog
        aberto={loginNuvem}
        onFechar={() => setLoginNuvem(false)}
        onEntrou={() => {
          setLoginNuvem(false);
          toast.success("Conectado — agora é só repetir a instrução para a IA.");
        }}
      />

      <AiEditDialog
        aberto={!!iaClipId || iaAberto}
        escopo={
          iaClipId
            ? {
                titulo: state.clips.find((c) => c.id === iaClipId)?.label ?? "Clipe selecionado",
                detalhe: (() => {
                  const c = state.clips.find((x) => x.id === iaClipId);
                  return c ? `${formatarTempo(c.start)} → ${formatarTempo(c.start + c.duration)}` : undefined;
                })(),
              }
            : { titulo: projetoNome, detalhe: iaEscopo === "cena" ? "Cena atual" : "Projeto inteiro" }
        }
        escopoId={iaEscopo}
        podeClipe={!!iaClipId}
        onEscopoId={setIaEscopo}
        processando={pensando}
        etapa={etapaIa}
        etapas={iaEtapasFeitas}
        plano={iaPlano ? { titulo: iaPlano.titulo, resposta: iaPlano.resposta, resumo: iaPlano.resumo } : null}
        onFechar={() => {
          if (pensando) return;
          setIaClipId(null);
          setIaAberto(false);
          setIaPlano(null);
        }}
        onPlanejar={(instrucao) => void planejarEdicaoIa(instrucao)}
        onAplicar={() => iaPlano && void aplicarPlanoIa(iaPlano)}
        onDescartarPlano={() => setIaPlano(null)}
      />



      <ExportDialog
        aberto={exportAberto}
        onFechar={() => setExportAberto(false)}
        nomeProjeto={projetoNome}
        largura={state.width}
        altura={state.height}
        fpsProjeto={state.fps}
        duracaoMs={duracaoExport}
        progresso={progresso}
        resultado={resultado}
        desktop={!!pontoDesktop()}
        capaUrl={capaExport}
        pastaDestino={pastaExport}
        onEscolherPasta={async () => {
          const p = await pontoDesktop()?.dialogo.escolherPasta();
          if (p) setPastaExport(p);
        }}
        onExportar={(cfg) => void exportar(cfg)}
        onCancelar={() => {
          cancelarExportRef.current = true;
        }}
        onLimparResultado={() => setResultado(null)}
        onAbrirArquivo={(c) => void pontoDesktop()?.arquivo.abrir(c).catch(() => toast.error("Não foi possível abrir o arquivo"))}
        onRevelarArquivo={(c) => void pontoDesktop()?.arquivo.revelar(c)}
      />

      <SourceDialog
        aberto={!!clipeSource}
        clip={clipeSource}
        asset={clipeSource?.assetId ? (assetsMap[clipeSource.assetId] ?? null) : null}
        onFechar={() => setSourceClipId(null)}
        onRestaurar={() => {
          if (clipeSource) restaurarClip(clipeSource.id);
          setSourceClipId(null);
        }}
      />



      {ocupado ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-[#131316] px-6 py-4 text-sm">
            <Loader2 className="h-4 w-4 animate-spin text-[#F26B1F]" />
            {ocupado}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function TopBtn({ children, onClick, titulo }: { children: React.ReactNode; onClick: () => void; titulo: string }) {
  return (
    <button
      title={titulo}
      onClick={onClick}
      className="rounded-lg border border-white/10 bg-white/5 p-1.5 text-white/75 transition hover:bg-white/10 hover:text-white"
    >
      {children}
    </button>
  );
}

function BarraBtn({ onClick, icone, texto }: { onClick: () => void; icone?: React.ReactNode; texto: string }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1 rounded-md px-2 py-1 text-white/70 transition hover:bg-white/10 hover:text-white"
    >
      {icone}
      {texto}
    </button>
  );
}
