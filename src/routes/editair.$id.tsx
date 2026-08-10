import { createFileRoute, useParams } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Loader2,
  Play,
  Pause,
  Upload,
  Wand2,
  Scissors,
  Captions,
  Undo2,
  Redo2,
  Download,
  ZoomIn,
  ZoomOut,
  Save,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  obterProjetoEditair,
  registrarAssetEditair,
  registrarEventoEditair,
  salvarEstadoEditair,
} from "@/lib/editair/projects.functions";
import { transcreverBlocoEditair } from "@/lib/editair/transcribe.functions";
import { dirigirEdicaoEditair } from "@/lib/editair/director.functions";
import {
  estadoVazio,
  novoId,
  recalcularDuracao,
  transformPadrao,
  formatarTempo,
  type CaptionStyle,
  type EditairClip,
  type ProjectState,
  type Transcript,
} from "@/lib/editair/types";
import { aplicarOps, gerarLegendas, type EditairOp } from "@/lib/editair/ops";
import {
  blobParaBase64,
  calcularEnvelope,
  decodificarAudio,
  detectarFala,
  lerMetadados,
  paraWav16k,
  reduzirWaveform,
} from "@/lib/editair/audio";
import { EditairEngine } from "@/lib/editair/engine";
import { Timeline } from "@/components/editair/Timeline";
import { AiChat, Inspector, TranscriptPanel, type MensagemIa } from "@/components/editair/Panels";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/editair/$id")({
  ssr: false,
  component: EditorPage,
});

const SUGESTOES = [
  "Tira todas as pausas e silêncios",
  "Coloca legenda em todo o vídeo",
  "Deixa a legenda menor e mais em cima",
  "Abaixa a música e sobe a minha voz",
  "Dá um zoom em mim aqui",
];

type Aba = "ia" | "texto" | "props";

function EditorPage() {
  const { id } = useParams({ from: "/editair/$id" });
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<EditairEngine | null>(null);
  const audioBufferRef = useRef<AudioBuffer | null>(null);
  const rafRef = useRef<number | null>(null);
  const relogioRef = useRef<{ t0: number; ms0: number } | null>(null);

  const [carregando, setCarregando] = useState(true);
  const [projeto, setProjeto] = useState<{ id: string; name: string; width: number; height: number; fps: number } | null>(null);
  const [state, setState] = useState<ProjectState>(estadoVazio());
  const [transcript, setTranscript] = useState<Transcript | null>(null);
  const [waveform, setWaveform] = useState<number[] | null>(null);

  const [playhead, setPlayhead] = useState(0);
  const [tocando, setTocando] = useState(false);
  const [zoom, setZoom] = useState(60);
  const [clipeSel, setClipeSel] = useState<string | null>(null);
  const [selecao, setSelecao] = useState<{ fromMs: number; toMs: number } | null>(null);
  const [aba, setAba] = useState<Aba>("ia");

  const [mensagens, setMensagens] = useState<MensagemIa[]>([]);
  const [pensando, setPensando] = useState(false);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const historico = useRef<ProjectState[]>([]);
  const futuro = useRef<ProjectState[]>([]);

  const clipeAtual = useMemo(() => state.clips.find((c) => c.id === clipeSel) ?? null, [state.clips, clipeSel]);

  /* ---------- carregar projeto ---------- */
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
        setProjeto({
          id: String(p.id),
          name: String(p.name),
          width: Number(p.width),
          height: Number(p.height),
          fps: Number(p.fps ?? 30),
        });
        const estado = p.state && typeof p.state === "object" && "clips" in (p.state as object)
          ? (p.state as ProjectState)
          : estadoVazio();
        setState(estado);
        if (p.transcript && typeof p.transcript === "object" && "words" in (p.transcript as object)) {
          setTranscript(p.transcript as Transcript);
        }

        // engine + mídias
        const canvas = canvasRef.current;
        if (canvas) {
          const eng = new EditairEngine(canvas, Number(p.width), Number(p.height));
          engineRef.current = eng;
          for (const a of res.assets) {
            const { data: url } = await supabase.storage
              .from("editair-media")
              .createSignedUrl(String(a.storage_path), 60 * 60 * 6);
            if (url?.signedUrl) await eng.carregar(String(a.id), url.signedUrl);
          }
          eng.desenhar(estado, 0);
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

  /* ---------- desenho ---------- */
  const redesenhar = useCallback(
    (s: ProjectState, t: number) => {
      const eng = engineRef.current;
      if (!eng) return;
      eng.sincronizar(s, t, false);
      eng.desenhar(s, t);
    },
    [],
  );

  useEffect(() => {
    if (!tocando) redesenhar(state, playhead);
  }, [state, playhead, tocando, redesenhar]);

  /* ---------- playback ---------- */
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

  /* ---------- histórico + autosave ---------- */
  const aplicar = useCallback((proximo: ProjectState) => {
    setState((atual) => {
      historico.current.push(atual);
      if (historico.current.length > 60) historico.current.shift();
      futuro.current = [];
      return recalcularDuracao(proximo);
    });
  }, []);

  const desfazer = () => {
    const anterior = historico.current.pop();
    if (!anterior) return;
    setState((atual) => {
      futuro.current.push(atual);
      return anterior;
    });
  };
  const refazer = () => {
    const proximo = futuro.current.pop();
    if (!proximo) return;
    setState((atual) => {
      historico.current.push(atual);
      return proximo;
    });
  };

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

  /* ---------- importar mídia ---------- */
  const importar = async (arquivos: FileList | null) => {
    if (!arquivos?.length) return;
    setOcupado("Enviando mídia…");
    try {
      const { data: sess } = await supabase.auth.getUser();
      const uid = sess.user?.id;
      if (!uid) throw new Error("Sessão expirada");

      let proximo: ProjectState = { ...state, clips: [...state.clips] };
      for (const arquivo of Array.from(arquivos)) {
        const meta = await lerMetadados(arquivo);
        const caminho = `${uid}/${id}/${novoId("a")}-${arquivo.name.replace(/[^\w.\-]/g, "_")}`;
        const { error } = await supabase.storage.from("editair-media").upload(caminho, arquivo, {
          contentType: arquivo.type || "video/mp4",
          upsert: false,
        });
        if (error) throw new Error(error.message);

        const asset = (await registrarAssetEditair({
          data: {
            projectId: id,
            kind: arquivo.type.startsWith("audio") ? "audio" : "video",
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
        if (url?.signedUrl) await engineRef.current?.carregar(asset.id, url.signedUrl);

        const trilha = arquivo.type.startsWith("audio") ? "t-music" : "t-video";
        const fim = proximo.clips.filter((c) => c.trackId === trilha).reduce((m, c) => Math.max(m, c.start + c.duration), 0);
        proximo.clips.push({
          id: novoId(),
          trackId: trilha,
          kind: arquivo.type.startsWith("audio") ? "audio" : "video",
          assetId: asset.id,
          start: fim,
          duration: Math.max(1000, meta.durationMs),
          sourceIn: 0,
          volume: 1,
          speed: 1,
          transform: transformPadrao(),
          label: arquivo.name.slice(0, 24),
        });

        // guarda o áudio decodificado do primeiro vídeo para análise
        if (!audioBufferRef.current) {
          try {
            const buf = await decodificarAudio(arquivo);
            audioBufferRef.current = buf;
            const env = calcularEnvelope(buf);
            setWaveform(reduzirWaveform(env));
          } catch {
            /* arquivo sem áudio decodificável */
          }
        }
      }
      aplicar(proximo);
      toast.success("Mídia importada");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao importar");
    } finally {
      setOcupado(null);
    }
  };

  /* ---------- analisar (transcrever) ---------- */
  const analisar = async () => {
    const buf = audioBufferRef.current;
    if (!buf) {
      toast.error("Reimporte o vídeo nesta sessão para analisar o áudio.");
      return;
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

      setTranscript({ words: palavras, segments: segmentos });
      setAba("texto");
      toast.success(`${palavras.length} palavras transcritas`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha na transcrição");
    } finally {
      setOcupado(null);
    }
  };

  /* ---------- cortar pausas ---------- */
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
      novos.push({
        ...base,
        id: novoId(),
        start: cursor,
        duration: dur,
        sourceIn: Math.round(r.start),
        label: `fala ${formatarTempo(r.start)}`,
      });
      cursor += dur;
    }
    const restantes = state.clips.filter((c) => c.trackId !== "t-video" && c.trackId !== "t-caption");
    aplicar({ ...state, clips: [...restantes, ...novos] });
    const removido = pausas.reduce((s, p) => s + (p.end - p.start), 0);
    toast.success(`${pausas.length} pausas removidas (−${formatarTempo(removido)})`);
  };

  /* ---------- legendar ---------- */
  const legendar = () => {
    if (!transcript?.words.length) return toast.error("Analise o áudio antes de legendar.");
    const legendas = gerarLegendas(state, transcript, "frase");
    const semLegenda = state.clips.filter((c) => c.trackId !== "t-caption");
    aplicar({ ...state, clips: [...semLegenda, ...legendas] });
    toast.success(`${legendas.length} legendas geradas`);
  };

  /* ---------- IA ---------- */
  const conversar = async (texto: string) => {
    setMensagens((m) => [...m, { id: novoId("m"), autor: "usuario", texto }]);
    setPensando(true);
    try {
      const r = await dirigirEdicaoEditair({
        data: {
          mensagem: texto,
          playheadMs: Math.round(playhead),
          selecao,
          clipeSelecionadoId: clipeSel,
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

  /* ---------- edições manuais ---------- */
  const patchClipe = (patch: Partial<EditairClip>) => {
    if (!clipeAtual) return;
    aplicar({ ...state, clips: state.clips.map((c) => (c.id === clipeAtual.id ? { ...c, ...patch } : c)) });
  };
  const patchLegenda = (patch: Partial<CaptionStyle>) =>
    aplicar({ ...state, captionStyle: { ...state.captionStyle, ...patch } });

  const dividir = () => {
    if (!clipeAtual) return;
    const { state: novo } = aplicarOps(state, [{ op: "split_clip", clipId: clipeAtual.id, atMs: playhead }], transcript);
    aplicar(novo);
  };
  const excluirClipe = () => {
    if (!clipeAtual) return;
    const { state: novo } = aplicarOps(state, [{ op: "delete_clip", clipId: clipeAtual.id }], transcript);
    setClipeSel(null);
    aplicar(novo);
  };
  const apagarTrecho = (fromMs: number, toMs: number) => {
    const { state: novo } = aplicarOps(state, [{ op: "delete_range", fromMs, toMs, ripple: true }], transcript);
    aplicar(novo);
    toast.success("Trecho removido");
  };

  /* ---------- exportar ---------- */
  const exportar = async () => {
    const eng = engineRef.current;
    if (!eng || !projeto || state.durationMs < 200) return toast.error("Nada para exportar.");
    setOcupado("Exportando… não feche a aba");
    try {
      const stream = eng.streamExport(projeto.fps);
      const mime = MediaRecorder.isTypeSupported("video/mp4;codecs=avc1")
        ? "video/mp4;codecs=avc1"
        : "video/webm;codecs=vp9,opus";
      const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8_000_000 });
      const partes: BlobPart[] = [];
      rec.ondataavailable = (e) => e.data.size && partes.push(e.data);
      const fim = new Promise<void>((r) => (rec.onstop = () => r()));

      rec.start(500);
      setPlayhead(0);
      const t0 = performance.now();
      await new Promise<void>((resolve) => {
        const passo = () => {
          const t = performance.now() - t0;
          if (t >= state.durationMs) return resolve();
          eng.sincronizar(state, t, true);
          eng.desenhar(state, t);
          setPlayhead(t);
          setOcupado(`Exportando… ${Math.round((t / state.durationMs) * 100)}%`);
          requestAnimationFrame(passo);
        };
        requestAnimationFrame(passo);
      });
      rec.stop();
      await fim;
      eng.pausarTudo();

      const blob = new Blob(partes, { type: mime.split(";")[0] });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${projeto.name.replace(/[^\w\-]+/g, "-").toLowerCase()}.${mime.includes("mp4") ? "mp4" : "webm"}`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      toast.success("Vídeo exportado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao exportar");
    } finally {
      setOcupado(null);
    }
  };

  if (carregando) {
    return (
      <div className="flex h-[calc(100vh-3.5rem)] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-[#F26B1F]" />
      </div>
    );
  }

  const proporcao = projeto ? projeto.width / projeto.height : 9 / 16;

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col">
      {/* barra de ferramentas */}
      <div className="flex flex-wrap items-center gap-2 border-b border-white/10 px-4 py-2">
        <span className="mr-2 truncate text-sm font-medium">{projeto?.name}</span>
        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-xs transition hover:bg-white/20">
          <Upload className="h-3.5 w-3.5" /> Importar
          <input type="file" accept="video/*,audio/*" multiple hidden onChange={(e) => void importar(e.target.files)} />
        </label>
        <Ferramenta onClick={() => void analisar()} icone={<Wand2 className="h-3.5 w-3.5" />} texto="Analisar" />
        <Ferramenta onClick={cortarPausas} icone={<Scissors className="h-3.5 w-3.5" />} texto="Cortar pausas" />
        <Ferramenta onClick={legendar} icone={<Captions className="h-3.5 w-3.5" />} texto="Legendar" />
        <div className="mx-1 h-5 w-px bg-white/10" />
        <Ferramenta onClick={desfazer} icone={<Undo2 className="h-3.5 w-3.5" />} texto="Desfazer" />
        <Ferramenta onClick={refazer} icone={<Redo2 className="h-3.5 w-3.5" />} texto="Refazer" />
        <div className="ml-auto flex items-center gap-2">
          <Ferramenta onClick={() => void salvar(false)} icone={salvando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} texto="Salvar" />
          <Button onClick={() => void exportar()} size="sm" className="h-8 bg-[#F26B1F] text-xs hover:bg-[#d95c14]">
            <Download className="mr-1.5 h-3.5 w-3.5" /> Exportar
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* preview */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1 items-center justify-center bg-black p-4">
            <canvas
              ref={canvasRef}
              className="max-h-full max-w-full rounded-lg shadow-2xl"
              style={{ aspectRatio: String(proporcao) }}
            />
          </div>
          <div className="flex items-center gap-3 border-t border-white/10 px-4 py-2">
            <button
              onClick={() => setTocando((v) => !v)}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-[#F26B1F] text-white transition hover:bg-[#d95c14]"
            >
              {tocando ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </button>
            <span className="font-mono text-xs text-white/60">
              {formatarTempo(playhead, true)} / {formatarTempo(state.durationMs)}
            </span>
            <div className="ml-auto flex items-center gap-1">
              <button onClick={() => setZoom((z) => Math.max(10, z / 1.4))} className="rounded p-1.5 text-white/50 hover:bg-white/10">
                <ZoomOut className="h-4 w-4" />
              </button>
              <button onClick={() => setZoom((z) => Math.min(400, z * 1.4))} className="rounded p-1.5 text-white/50 hover:bg-white/10">
                <ZoomIn className="h-4 w-4" />
              </button>
            </div>
          </div>
          <div className="h-[248px] shrink-0 border-t border-white/10">
            <Timeline
              state={state}
              playheadMs={playhead}
              zoom={zoom}
              selectedClipId={clipeSel}
              selecao={selecao}
              waveform={waveform}
              onSeek={setPlayhead}
              onSelectClip={setClipeSel}
              onSelecao={setSelecao}
              onMoveClip={(cid, ms) =>
                setState((s) => recalcularDuracao({ ...s, clips: s.clips.map((c) => (c.id === cid ? { ...c, start: ms } : c)) }))
              }
              onToggleTrack={(trackId, campo) =>
                aplicar({
                  ...state,
                  tracks: state.tracks.map((t) => (t.id === trackId ? { ...t, [campo]: !t[campo] } : t)),
                })
              }
            />
          </div>
        </div>

        {/* painel direito */}
        <aside className="flex w-[360px] shrink-0 flex-col border-l border-white/10 bg-[#111114]">
          <div className="flex border-b border-white/10">
            {([
              ["ia", "IA"],
              ["texto", "Texto"],
              ["props", "Ajustes"],
            ] as [Aba, string][]).map(([chave, rotulo]) => (
              <button
                key={chave}
                onClick={() => setAba(chave)}
                className={`flex-1 py-2.5 text-xs transition ${
                  aba === chave ? "border-b-2 border-[#F26B1F] text-white" : "text-white/45 hover:text-white/80"
                }`}
              >
                {rotulo}
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1">
            {aba === "ia" ? (
              <AiChat mensagens={mensagens} pensando={pensando} onEnviar={(t) => void conversar(t)} sugestoes={SUGESTOES} />
            ) : aba === "texto" ? (
              <TranscriptPanel
                transcript={transcript}
                playheadMs={playhead}
                onSeek={setPlayhead}
                onApagarTrecho={apagarTrecho}
              />
            ) : (
              <Inspector
                clip={clipeAtual}
                captionStyle={state.captionStyle}
                onClip={patchClipe}
                onCaption={patchLegenda}
                onDividir={dividir}
                onExcluir={excluirClipe}
              />
            )}
          </div>
        </aside>
      </div>

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

function Ferramenta({ onClick, icone, texto }: { onClick: () => void; icone: React.ReactNode; texto: string }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-lg bg-white/[0.06] px-3 py-1.5 text-xs text-white/80 transition hover:bg-white/15 hover:text-white"
    >
      {icone}
      {texto}
    </button>
  );
}
