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
  excluirAssetEditair,
  obterProjetoEditair,
  registrarAssetEditair,
  registrarEventoEditair,
  renomearAssetEditair,
  salvarEstadoEditair,
} from "@/lib/editair/projects.functions";
import { transcreverBlocoEditair } from "@/lib/editair/transcribe.functions";
import { dirigirEdicaoEditair } from "@/lib/editair/director.functions";
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
  transformPadrao,
  TEXTO_PADRAO,
  type CaptionStyle,
  type EditairClip,
  type KeyProp,
  type ProjectState,
  type Transcript,
} from "@/lib/editair/types";
import { aplicarOps, gerarLegendas, type EditairOp } from "@/lib/editair/ops";
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
import { consumirHandoff } from "@/lib/editair/handoff";
import { Timeline, type AssetInfo } from "@/components/editair/Timeline";
import { PlayerStage } from "@/components/editair/PlayerStage";
import { SourceDialog } from "@/components/editair/SourceDialog";
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

  const [playhead, setPlayhead] = useState(0);
  const [tocando, setTocando] = useState(false);
  const [zoom, setZoom] = useState(60);
  const [selecionados, setSelecionados] = useState<string[]>([]);
  const [selecao, setSelecao] = useState<{ fromMs: number; toMs: number } | null>(null);
  const [ferramenta, setFerramenta] = useState<Ferramenta>("midia");
  const [snapping, setSnapping] = useState(true);
  const [volume, setVolume] = useState(1);
  const [mudo, setMudo] = useState(false);
  const [qualidade, setQualidade] = useState(1);

  const [mensagens, setMensagens] = useState<MensagemIa[]>([]);
  const [pensando, setPensando] = useState(false);
  const [plano, setPlano] = useState<PlanoEditorial | null>(null);
  const [etapaIa, setEtapaIa] = useState("");
  const [objetivoIa, setObjetivoIa] = useState("");
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const [exportAberto, setExportAberto] = useState(false);
  const [progresso, setProgresso] = useState<ProgressoExport>(null);
  const [resultado, setResultado] = useState<ResultadoExport>(null);

  const [rippleTrim, setRippleTrim] = useState(false);
  const [sourceClipId, setSourceClipId] = useState<string | null>(null);
  const [dimsOriginais, setDimsOriginais] = useState<{ w: number; h: number } | null>(null);
  const [autoEtapa, setAutoEtapa] = useState<"importar" | "planejar" | "montar" | null>(null);
  const autoRef = useRef<{ instrucao: string } | null>(null);

  const historico = useRef<ProjectState[]>([]);
  const futuro = useRef<ProjectState[]>([]);

  const clipeAtual = useMemo(
    () => state.clips.find((c) => c.id === selecionados[0]) ?? null,
    [state.clips, selecionados],
  );

  const assetsMap = useMemo(() => {
    const m: Record<string, AssetInfo> = {};
    for (const a of assets) m[a.id] = { url: a.url, durationMs: a.durationMs, kind: a.kind, name: a.nome };
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


  /* ---------------- carregar projeto ---------------- */
  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const res = (await obterProjetoEditair({ data: { id } })) as unknown as {
          projeto: Record<string, unknown>;
          assets: Array<Record<string, unknown>>;
        };
        if (!vivo) return;
        const p = res.projeto;
        const w = Number(p.width) || 1080;
        const h = Number(p.height) || 1920;
        const fps = Number(p.fps ?? 30);
        setProjetoNome(String(p.name));
        const bruto =
          p.state && typeof p.state === "object" && "clips" in (p.state as object)
            ? (p.state as ProjectState)
            : estadoVazio(w, h, fps);
        const estado = normalizarEstado(bruto, w, h, fps);
        setState(estado);
        if (p.transcript && typeof p.transcript === "object" && "words" in (p.transcript as object)) {
          setTranscript(p.transcript as Transcript);
        }

        const canvas = canvasRef.current;
        if (canvas) {
          const eng = new EditairEngine(canvas, estado.width, estado.height);
          engineRef.current = eng;
          const lista: AssetItem[] = [];
          for (const a of res.assets) {
            const { data: url } = await supabase.storage
              .from("editair-media")
              .createSignedUrl(String(a.storage_path), 60 * 60 * 6);
            if (!url?.signedUrl) continue;
            await eng.carregar(String(a.id), url.signedUrl);
            lista.push({
              id: String(a.id),
              nome: String(a.name),
              kind: String(a.kind),
              durationMs: Number(a.duration_ms ?? 0),
              url: url.signedUrl,
            });
          }
          if (!vivo) return;
          setAssets(lista);
          eng.desenhar(estado, 0);
        }

        const primeiro = res.assets.find((a) => Number(a.width) > 0 && Number(a.height) > 0);
        if (primeiro) setDimsOriginais({ w: Number(primeiro.width), h: Number(primeiro.height) });

        // veio da tela "Novo projeto": importa, analisa e monta o primeiro corte
        const handoff = consumirHandoff(id);
        if (handoff?.arquivos.length) {
          autoRef.current = { instrucao: handoff.instrucao };
          setAutoEtapa("importar");
          void importarAuto(handoff.arquivos);
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Falha ao abrir o projeto");
      } finally {
        if (vivo) setCarregando(false);
      }

    })();
    return () => {
      vivo = false;
      engineRef.current?.destruir();
      engineRef.current = null;
    };
  }, [id]);

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
        setPlayhead(state.durationMs);
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
  const aplicar = useCallback((proximo: ProjectState) => {
    setState((atual) => {
      historico.current.push(atual);
      if (historico.current.length > 80) historico.current.shift();
      futuro.current = [];
      return recalcularDuracao(proximo);
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
        await salvarEstadoEditair({
          data: { id, state: state as unknown, transcript: transcript as unknown, status: "editando" },
        });
        if (!silencioso) toast.success("Projeto salvo");
      } catch (e) {
        if (!silencioso) toast.error(e instanceof Error ? e.message : "Falha ao salvar");
      } finally {
        setSalvando(false);
      }
    },
    [id, state, transcript],
  );

  useEffect(() => {
    if (carregando) return;
    const t = setTimeout(() => void salvar(true), 2500);
    return () => clearTimeout(t);
  }, [state, transcript, carregando, salvar]);

  /* ---------------- edição de clipes ---------------- */
  const patchClipe = (patch: Partial<EditairClip>, alvoId?: string) => {
    const cid = alvoId ?? clipeAtual?.id;
    if (!cid) return;
    aplicar({ ...state, clips: state.clips.map((c) => (c.id === cid ? { ...c, ...patch } : c)) });
  };

  const alterarClipTimeline = (cid: string, patch: Partial<EditairClip>, commit: boolean) => {
    if (commit) {
      setState((s) => recalcularDuracao({ ...s }));
      return;
    }
    setState((s) => recalcularDuracao({ ...s, clips: s.clips.map((c) => (c.id === cid ? { ...c, ...patch } : c)) }));
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

  /* ---------------- mídia ---------------- */
  const inserirAsset = (assetId: string) => {
    const a = assets.find((x) => x.id === assetId);
    if (!a) return;
    const trilha = a.kind === "audio" ? "t-music" : "t-video";
    const fim = state.clips.filter((c) => c.trackId === trilha).reduce((m, c) => Math.max(m, c.start + c.duration), 0);
    const clip: EditairClip = {
      id: novoId(),
      trackId: trilha,
      kind: a.kind === "audio" ? "audio" : a.kind === "image" ? "image" : "video",
      assetId: a.id,
      start: fim,
      duration: Math.max(1000, a.durationMs || 5000),
      sourceIn: 0,
      volume: 1,
      speed: 1,
      transform: transformPadrao(),
      label: a.nome.slice(0, 28),
    };
    aplicar({ ...state, clips: [...state.clips, clip] });
    setSelecionados([clip.id]);
  };

  const importar = async (arquivos: FileList | null) => {
    if (!arquivos?.length) return;
    setOcupado("Enviando mídia…");
    try {
      const { data: sess } = await supabase.auth.getUser();
      const uid = sess.user?.id;
      if (!uid) throw new Error("Sessão expirada");

      const proximo: ProjectState = { ...state, clips: [...state.clips] };
      const novosAssets: AssetItem[] = [];
      for (const arquivo of Array.from(arquivos)) {
        const kind = arquivo.type.startsWith("audio") ? "audio" : arquivo.type.startsWith("image") ? "image" : "video";
        const meta = kind === "image" ? { durationMs: 5000, width: 0, height: 0 } : await lerMetadados(arquivo);
        const caminho = `${uid}/${id}/${novoId("a")}-${arquivo.name.replace(/[^\w.\-]/g, "_")}`;
        const { error } = await supabase.storage.from("editair-media").upload(caminho, arquivo, {
          contentType: arquivo.type || "video/mp4",
          upsert: false,
        });
        if (error) throw new Error(error.message);

        const asset = (await registrarAssetEditair({
          data: {
            projectId: id,
            kind,
            name: arquivo.name,
            storagePath: caminho,
            mime: arquivo.type || null,
            sizeBytes: arquivo.size,
            durationMs: meta.durationMs,
            width: meta.width,
            height: meta.height,
          },
        })) as unknown as { id: string };

        const { data: url } = await supabase.storage.from("editair-media").createSignedUrl(caminho, 60 * 60 * 6);
        if (url?.signedUrl) {
          await engineRef.current?.carregar(asset.id, url.signedUrl);
          novosAssets.push({ id: asset.id, nome: arquivo.name, kind, durationMs: meta.durationMs, url: url.signedUrl });
        }

        const trilha = kind === "audio" ? "t-music" : "t-video";
        const fim = proximo.clips.filter((c) => c.trackId === trilha).reduce((m, c) => Math.max(m, c.start + c.duration), 0);
        proximo.clips.push({
          id: novoId(),
          trackId: trilha,
          kind: kind === "audio" ? "audio" : kind === "image" ? "image" : "video",
          assetId: asset.id,
          start: fim,
          duration: Math.max(1000, meta.durationMs),
          sourceIn: 0,
          volume: 1,
          speed: 1,
          transform: transformPadrao(),
          label: arquivo.name.slice(0, 28),
        });

        if (!audioBufferRef.current && kind !== "image") {
          try {
            audioBufferRef.current = await decodificarAudio(arquivo);
          } catch {
            /* sem áudio decodificável */
          }
        }
      }
      setAssets((a) => [...a, ...novosAssets]);
      aplicar(proximo);
      toast.success("Mídia importada");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao importar");
    } finally {
      setOcupado(null);
    }
  };

  const renomearAsset = async (assetId: string, nome: string) => {
    setAssets((a) => a.map((x) => (x.id === assetId ? { ...x, nome } : x)));
    try {
      await renomearAssetEditair({ data: { id: assetId, name: nome } });
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
      await excluirAssetEditair({ data: { id: assetId } });
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
  const analisar = async (): Promise<Transcript | null> => {
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
      void registrarEventoEditair({ data: { projectId: id, actor: "ia", message: r.resposta, ops: r.ops } }).catch(() => {});
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Falha na IA";
      setMensagens((m) => [...m, { id: novoId("m"), autor: "ia", texto: msg }]);
      toast.error(msg);
    } finally {
      setPensando(false);
    }
  };

  /* ------------- cérebro editorial: plano antes do corte ------------- */
  const planejar = async (objetivo: string, ajuste = "") => {
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
      void registrarEventoEditair({ data: { projectId: id, actor: "ia", message: novo.estrategia, ops: null } }).catch(() => {});
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


  /* ---------------- exportação ---------------- */
  const exportar = async (cfg: ExportConfig) => {
    const eng = engineRef.current;
    if (!eng || state.durationMs < 200) {
      toast.error("Nada para exportar.");
      return;
    }
    cancelarExportRef.current = false;
    setResultado(null);
    setProgresso({ pct: 0, frame: 0, totalFrames: 0, etaS: 0 });
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
      if (cfg.escopo === "video") eng.redimensionar(state.width, state.height, cfg.altura / state.height);

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
      const totalFrames = Math.round((state.durationMs / 1000) * cfg.fps);
      const t0 = performance.now();
      await new Promise<void>((resolve) => {
        const passo = () => {
          if (cancelarExportRef.current) return resolve();
          const t = performance.now() - t0;
          if (t >= state.durationMs) return resolve();
          eng.sincronizar(estadoRender, t, true);
          if (cfg.escopo === "video") eng.desenhar(estadoRender, t);
          setPlayhead(t);
          const pct = (t / state.durationMs) * 100;
          setProgresso({
            pct,
            frame: Math.round((t / 1000) * cfg.fps),
            totalFrames: cfg.escopo === "video" ? totalFrames : 0,
            etaS: ((state.durationMs - t) / 1000),
          });
          requestAnimationFrame(passo);
        };
        requestAnimationFrame(passo);
      });
      rec.stop();
      await fim;
      eng.pausarTudo();
      eng.redimensionar(state.width, state.height, qualidade);

      if (cancelarExportRef.current) {
        setProgresso(null);
        toast.info("Exportação cancelada");
        return;
      }

      let blob = new Blob(partes, { type: mimeGravacao.split(";")[0] });
      let ext = cfg.formato;
      if (cfg.escopo === "audio" && cfg.mime === "wav") {
        setProgresso({ pct: 99, frame: 0, totalFrames: 0, etaS: 3 });
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
        duracaoMs: state.durationMs,
      });
      toast.success("Exportação concluída");
    } catch (e) {
      setProgresso(null);
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
    <div className="grid h-[calc(100vh-3.5rem)] grid-rows-[46px_1fr_300px] bg-[#0c0f13]">
      {/* topo */}
      <div className="flex items-center gap-3 border-b border-white/10 bg-[#0d1116] px-3">
        <span className="truncate text-sm font-semibold">{projetoNome}</span>
        <span className="flex items-center gap-1.5 text-[11px] text-white/40">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          {salvando ? "Salvando…" : "Salvo automaticamente"}
        </span>
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
          className="h-8 bg-[#F26B1F] text-xs font-bold hover:bg-[#d95c14]"
          onClick={() => {
            setResultado(null);
            setExportAberto(true);
          }}
        >
          Exportar
        </Button>
      </div>

      {/* corpo */}
      <div className="grid min-h-0 grid-cols-[76px_340px_minmax(360px,1fr)] xl:grid-cols-[76px_360px_minmax(420px,1fr)]">
        <aside className="flex flex-col gap-1 overflow-y-auto border-r border-white/10 bg-[#0f141a] p-1.5">
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
            onInserirAsset={inserirAsset}
            onPatchClip={(patch) => patchClipe(patch)}
            onPatchState={(patch) => aplicar({ ...state, ...patch })}
            onCaption={(patch: Partial<CaptionStyle>) => aplicar({ ...state, captionStyle: { ...state.captionStyle, ...patch } })}
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
        />
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
          <button
            onClick={() => setSnapping((v) => !v)}
            className={`ml-1 flex items-center gap-1 rounded-md px-2 py-1 transition ${
              snapping ? "bg-[#F26B1F]/20 text-[#F26B1F]" : "text-white/50 hover:bg-white/10"
            }`}
          >
            <Magnet className="h-3.5 w-3.5" /> Snap
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
          onSeek={(ms) => setPlayhead(Math.max(0, ms))}
          onSelecionar={setSelecionados}
          onSelecao={setSelecao}
          onAlterarClip={alterarClipTimeline}
          onToggleTrack={(trackId, campo) =>
            aplicar({
              ...state,
              tracks: state.tracks.map((t) => (t.id === trackId ? { ...t, [campo]: !t[campo] } : t)),
            })
          }
        />
      </div>

      <ExportDialog
        aberto={exportAberto}
        onFechar={() => setExportAberto(false)}
        nomeProjeto={projetoNome}
        largura={state.width}
        altura={state.height}
        fpsProjeto={state.fps}
        duracaoMs={state.durationMs}
        progresso={progresso}
        resultado={resultado}
        onExportar={(cfg) => void exportar(cfg)}
        onCancelar={() => {
          cancelarExportRef.current = true;
        }}
        onLimparResultado={() => setResultado(null)}
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
