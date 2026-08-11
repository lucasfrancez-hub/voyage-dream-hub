import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Eye,
  EyeOff,
  Lock,
  LockOpen,
  Volume2,
  VolumeX,
  Headphones,
  Plus,
  GripVertical,
  Pencil,
  Trash2,
  MousePointerSquareDashed,
  ZoomIn,
  ZoomOut,
  Maximize2,
} from "lucide-react";
import type { EditairClip, EditairTrack, ProjectState } from "@/lib/editair/types";
import { formatarTempo } from "@/lib/editair/types";
import { posicionarMenu, type DestinoCamada } from "@/lib/editair/layers";
import { destinoDeClip, destinoPorY, intencaoVertical, passouLimiar } from "@/lib/editair/interacao";
import { marcadoresEfeitos } from "@/lib/editair/efeitos";
import { limitesDoClip } from "@/lib/editair/ops";
import { obterPicos, obterThumb, picosEmCache } from "@/lib/editair/media";
import { executarJob } from "@/lib/editair/jobs";
import { useJobsDoAlvo } from "@/hooks/use-editair-jobs";
import { clipsNaCaixa, moverSelecao, tracksNaFaixa, unir } from "@/lib/editair/selecao";


export type AssetInfo = { id?: string; url: string; durationMs: number; kind: string; name: string };

export type AcaoClip =
  | "dividir"
  | "duplicar"
  | "excluir"
  | "bloquear"
  | "mudo"
  | "congelar"
  | "descongelar"
  | "desvincular"
  | "revincular"
  | "ripple"
  | "copiar"
  | "colar"
  | "extrair-audio"
  | "aparar";

/** Ações do menu de contexto de um marcador da timeline. */
export type AcaoMarcador = "renomear" | "cor" | "excluir";

/** Destino de um clip solto na timeline. */
export type DestinoSolto = DestinoCamada;

const ALTURA_TRILHA = 56; // h-14

/** limites do zoom horizontal da timeline (px por segundo) */
export const ZOOM_MIN = 4;
export const ZOOM_MAX = 600;

const CORES: Record<string, string> = {
  "t-text": "bg-violet-600/70 border-violet-300/40",
  "t-caption": "bg-amber-600/70 border-amber-300/40",
  "t-broll": "bg-sky-600/70 border-sky-300/40",
  "t-video": "bg-[#1d4f55] border-[#2c8d95]",
  "t-voice": "bg-emerald-700/70 border-emerald-400/40",
  "t-music": "bg-[#155445] border-emerald-400/40",
};

type Props = {
  state: ProjectState;
  playheadMs: number;
  zoom: number; // px por segundo
  /** altera o zoom (px por segundo) — controle fixo no canto da timeline */
  onZoom?: (zoom: number) => void;
  selecionados: string[];
  selecao: { fromMs: number; toMs: number } | null;
  assets: Record<string, AssetInfo>;
  snapping: boolean;
  rippleTrim: boolean;
  onSeek: (ms: number) => void;
  /** início/fim de um scrub (régua, linha do playhead ou topo do clipe) */
  onScrubInicio?: () => void;
  onScrubFim?: () => void;
  onSelecionar: (ids: string[]) => void;
  onSelecao: (s: { fromMs: number; toMs: number } | null) => void;
  onAlterarClip: (id: string, patch: Partial<EditairClip>, commit: boolean) => void;
  onAlterarClips: (patches: Record<string, Partial<EditairClip>>, commit: boolean) => void;
  onToggleTrack: (trackId: string, campo: "muted" | "hidden" | "locked" | "solo") => void;
  onAbrirSource: (clipId: string) => void;
  /** "Selecionar todos nesta camada" (menu do cabeçalho da track) */
  onSelecionarTrack?: (trackId: string) => void;
  /** duplo clique numa legenda: edição rápida do texto na própria timeline */
  onEditarTextoLegenda?: (clipId: string, texto: string, commit: boolean) => void;
  onRestaurarClip: (clipId: string) => void;
  onAcaoClip?: (clipId: string, acao: AcaoClip) => void;
  /** Arquivos arrastados do Finder/Explorer direto para a timeline. */
  onSoltarArquivos?: (arquivos: FileList, ms: number) => void;
  /** arrastar uma mídia da biblioteca direto para a timeline (track existente ou nova camada) */
  onSoltarAsset?: (assetId: string, ms: number, destino?: DestinoSolto) => void;
  /** Cria uma nova camada de vídeo acima das existentes (composição/PiP). */
  onNovaTrilhaVideo?: () => void;
  /** Clip solto após drag vertical: muda de camada (e de posição). */
  onSoltarClip?: (clipId: string, destino: DestinoSolto, startMs: number) => void;
  /** Move o clip uma camada acima (-1) ou abaixo (+1). */
  onMoverCamada?: (clipId: string, direcao: -1 | 1) => void;
  /** Cria uma camada nova acima (-1) ou abaixo (+1) do clip e move o clip para ela. */
  onNovaCamadaJunto?: (clipId: string, direcao: -1 | 1) => void;
  onReordenarTracks?: (de: number, para: number) => void;
  onRenomearTrack?: (trackId: string, nome: string) => void;
  onExcluirTrack?: (trackId: string) => void;
  onEditarComIa?: (clipId: string) => void;
  /** há clipes no clipboard interno (habilita "Colar" no menu) */
  temClipboard?: boolean;
  /** ações do menu de contexto de um marcador */
  onAcaoMarcador?: (id: string, acao: AcaoMarcador, valor?: string) => void;
};

type Dica = { x: number; y: number; titulo: string; valor: string; delta: string } | null;

export function Timeline({
  state,
  playheadMs,
  zoom,
  onZoom,
  selecionados,
  selecao,
  assets,
  snapping,
  rippleTrim,
  onSeek,
  onScrubInicio,
  onScrubFim,
  onSelecionar,
  onSelecao,
  onAlterarClip,
  onAlterarClips,
  onToggleTrack,
  onAbrirSource,
  onSelecionarTrack,
  onEditarTextoLegenda,
  onRestaurarClip,
  onAcaoClip,
  onSoltarArquivos,
  onSoltarAsset,
  onNovaTrilhaVideo,
  onSoltarClip,
  onMoverCamada,
  onNovaCamadaJunto,
  onReordenarTracks,
  onRenomearTrack,
  onExcluirTrack,
  onEditarComIa,
  temClipboard,
  onAcaoMarcador,
}: Props) {
  const areaRef = useRef<HTMLDivElement>(null);
  const headersRef = useRef<HTMLDivElement>(null);

  const pxPorMs = zoom / 1000;
  const larguraTotal = Math.max(1200, (state.durationMs + 6000) * pxPorMs);

  /* ---- zoom horizontal (px por segundo) — controle fixo no viewport ----
     A âncora guarda um tempo e sua posição em pixels dentro do viewport; depois
     que o novo zoom é aplicado, o scrollLeft é recalculado para manter o mesmo
     ponto visual (playhead > clip selecionado > centro atual). */
  const ancoraRef = useRef<{ ms: number; px: number } | null>(null);
  useLayoutEffect(() => {
    const a = ancoraRef.current;
    const el = areaRef.current;
    ancoraRef.current = null;
    if (!a || !el) return;
    el.scrollLeft = Math.max(0, a.ms * (zoom / 1000) - a.px);
  }, [zoom]);

  const aplicarZoom = useCallback(
    (novo: number) => {
      if (!onZoom) return;
      const z = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, novo));
      const el = areaRef.current;
      if (el) {
        const larg = el.clientWidth;
        const inicioMs = el.scrollLeft / pxPorMs;
        const fimMs = (el.scrollLeft + larg) / pxPorMs;
        const sel = selecionados.length ? state.clips.find((c) => c.id === selecionados[0]) : null;
        let alvoMs = inicioMs + (fimMs - inicioMs) / 2;
        if (playheadMs >= inicioMs && playheadMs <= fimMs) alvoMs = playheadMs;
        else if (sel && sel.start <= fimMs && sel.start + sel.duration >= inicioMs) alvoMs = sel.start;
        ancoraRef.current = { ms: alvoMs, px: alvoMs * pxPorMs - el.scrollLeft };
      }
      onZoom(z);
    },
    [onZoom, pxPorMs, playheadMs, selecionados, state.clips],
  );

  const ajustarAJanela = useCallback(() => {
    if (!onZoom) return;
    const el = areaRef.current;
    const dur = Math.max(1000, state.durationMs);
    const larg = (el?.clientWidth ?? 900) - 32;
    ancoraRef.current = { ms: 0, px: 0 };
    onZoom(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, (larg * 1000) / dur)));
  }, [onZoom, state.durationMs]);

  const [dica, setDica] = useState<Dica>(null);
  const [arrastandoId, setArrastandoId] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; clipId: string } | null>(null);
  /** menu de contexto de um marcador da régua */
  const [menuMarcador, setMenuMarcador] = useState<{ x: number; y: number; id: string } | null>(null);
  const [soltando, setSoltando] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null);
  const [alvo, setAlvo] = useState<DestinoSolto | null>(null);
  const [arrastandoTrack, setArrastandoTrack] = useState<number | null>(null);
  /** retângulo de seleção (marquee) em coordenadas de tela */
  const [caixa, setCaixa] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const linhasRef = useRef<Record<string, HTMLDivElement | null>>({});

  /* menu de contexto: collision detection (flip + shift) medindo o menu já renderizado */
  useLayoutEffect(() => {
    if (!menu) {
      setMenuPos(null);
      return;
    }
    const el = menuRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setMenuPos(posicionarMenu(menu.x, menu.y, r.width, r.height, window.innerWidth, window.innerHeight));
  }, [menu]);

  /* arrastar mídia da biblioteca: Esc / fim do drag limpam ghost, highlight e dica */
  useEffect(() => {
    if (!soltando) return;
    const fim = () => {
      setSoltando(false);
      setAlvo(null);
      setDica(null);
    };
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") fim();
    };
    window.addEventListener("dragend", fim);
    window.addEventListener("drop", fim);
    window.addEventListener("keydown", aoTeclar, true);
    return () => {
      window.removeEventListener("dragend", fim);
      window.removeEventListener("drop", fim);
      window.removeEventListener("keydown", aoTeclar, true);
    };
  }, [soltando]);



  const duracoes = useMemo(() => {
    const m: Record<string, number> = {};
    for (const [id, a] of Object.entries(assets)) m[id] = a.durationMs;
    return m;
  }, [assets]);

  const msDoEvento = useCallback(
    (clientX: number) => {
      const el = areaRef.current;
      if (!el) return 0;
      const rect = el.getBoundingClientRect();
      return Math.max(0, Math.round((clientX - rect.left + el.scrollLeft) / pxPorMs));
    },
    [pxPorMs],
  );

  /** Descobre qual camada (ou zona de nova camada) está sob o cursor. */
  const destinoDoY = useCallback(
    (clientY: number): DestinoSolto | null => {
      const faixas = state.tracks
        .map((t) => {
          const el = linhasRef.current[t.id];
          if (!el) return null;
          const r = el.getBoundingClientRect();
          return { id: t.id, top: r.top, bottom: r.bottom };
        })
        .filter((v): v is { id: string; top: number; bottom: number } => !!v);
      return destinoPorY(clientY, faixas);
    },
    [state.tracks],
  );


  /** pontos de encaixe: playhead, marcadores e bordas dos clipes */
  const pontosSnap = useMemo(() => {
    const p: { ms: number; ids: string | null }[] = [{ ms: 0, ids: null }, { ms: playheadMs, ids: null }];
    for (const m of state.marcadores ?? []) p.push({ ms: m.atMs, ids: null });
    for (const c of state.clips) {
      p.push({ ms: c.start, ids: c.id }, { ms: c.start + c.duration, ids: c.id });
    }
    return p;
  }, [state.clips, state.marcadores, playheadMs]);

  /** Encaixa `ms` nos pontos próximos. `ignorar` = clipes em movimento (nunca
      podem servir de referência para si mesmos, senão o clipe parece travado). */
  const encaixar = useCallback(
    (ms: number, ignorar?: Set<string>) => {
      if (!snapping) return Math.max(0, Math.round(ms));
      const tol = 10 / pxPorMs;
      let melhor = ms;
      let dist = tol;
      for (const p of pontosSnap) {
        if (p.ids && ignorar?.has(p.ids)) continue;
        const d = Math.abs(p.ms - ms);
        if (d < dist) {
          dist = d;
          melhor = p.ms;
        }
      }
      return Math.max(0, Math.round(melhor));
    },
    [snapping, pontosSnap, pxPorMs],
  );


  /* Scrub do playhead: régua, linha e área vazia usam o MESMO caminho.
     Esc cancela e volta para o tempo em que o arraste começou. */
  const [arrastandoPlayhead, setArrastandoPlayhead] = useState(false);
  const iniciarScrub = useCallback(
    (e: React.PointerEvent, opcoes: { seguir?: boolean; selecao?: boolean } = {}) => {
      const tempoInicial = playheadMs;
      const inicio = msDoEvento(e.clientX);
      // suspende o playback internamente; retomamos no pointerup se estava tocando
      onScrubInicio?.();
      if (opcoes.seguir !== false) onSeek(inicio);
      onSelecao(null);
      setArrastandoPlayhead(true);
      let cancelado = false;

      const mover = (ev: PointerEvent) => {
        const atual = msDoEvento(ev.clientX);
        // seleção de intervalo só com Alt/Shift — arrastar puro é sempre scrub
        if (opcoes.selecao && (ev.altKey || ev.shiftKey) && Math.abs(atual - inicio) > 24) {
          onSelecao({ fromMs: Math.min(inicio, atual), toMs: Math.max(inicio, atual) });
          return;
        }
        onSeek(atual);
      };
      const encerrar = () => {
        window.removeEventListener("pointermove", mover);
        window.removeEventListener("pointerup", encerrar);
        window.removeEventListener("pointercancel", encerrar);
        window.removeEventListener("keydown", tecla, true);
        setArrastandoPlayhead(false);
        onScrubFim?.();
      };
      const tecla = (ev: KeyboardEvent) => {
        if (ev.key !== "Escape" || cancelado) return;
        cancelado = true;
        ev.preventDefault();
        ev.stopPropagation();
        onSeek(tempoInicial);
        onSelecao(null);
        encerrar();
      };

      window.addEventListener("pointermove", mover);
      window.addEventListener("pointerup", encerrar);
      window.addEventListener("pointercancel", encerrar);
      window.addEventListener("keydown", tecla, true);
    },
    [msDoEvento, onSeek, onSelecao, playheadMs, onScrubInicio, onScrubFim],
  );

  const marcas = useMemo(() => {
    const passo = zoom > 160 ? 1000 : zoom > 90 ? 2000 : zoom > 40 ? 5000 : zoom > 18 ? 10000 : 30000;
    const out: number[] = [];
    for (let t = 0; t <= state.durationMs + 6000; t += passo) out.push(t);
    return out;
  }, [zoom, state.durationMs]);

  /* arrastar clipe / trim — sempre não destrutivo: mexe só em sourceIn/duração.
     Drag direto: mousedown + ~4px de movimento já move o clip (sem "modo mover"),
     Esc / pointercancel / perda de foco cancelam e restauram o estado original. */
  const iniciarArraste = (
    e: React.PointerEvent,
    clip: EditairClip,
    modo: "mover" | "trim-in" | "trim-out",
  ) => {
    const trilha = state.tracks.find((t) => t.id === clip.trackId);
    if (trilha?.locked || clip.bloqueado) return;
    e.stopPropagation();
    const x0 = e.clientX;
    const y0 = e.clientY;
    const inicioMs = msDoEvento(e.clientX);
    const base = { start: clip.start, duration: clip.duration, sourceIn: clip.sourceIn };
    const lim = limitesDoClip(clip, duracoes);
    const speed = clip.speed || 1;
    const fimAntigo = base.start + base.duration;
    const posteriores = state.clips.filter((c) => c.trackId === clip.trackId && c.start >= fimAntigo && c.id !== clip.id);
    /* snapshot para restaurar em caso de cancelamento */
    /* conjunto arrastado: se o clip faz parte de uma seleção múltipla, todos vão
       juntos mantendo as distâncias relativas (a seleção continua sendo só UI) */
    const conjunto = modo === "mover" && selecionados.length > 1 && selecionados.includes(clip.id) ? selecionados : [];
    const originais: Record<string, Partial<EditairClip>> = { [clip.id]: { ...base } };
    for (const c of posteriores) originais[c.id] = { start: c.start };
    for (const c of state.clips) if (conjunto.includes(c.id)) originais[c.id] = { start: c.start };

    let ativo = false;
    let ultimoStart = base.start;
    let ultimoDestino: DestinoSolto | null = null;
    /* clipes em movimento: nunca servem de referência de snap para si mesmos */
    const ignorarSnap = new Set<string>([clip.id, ...conjunto]);

    const aplicarMovimento = (ev: PointerEvent) => {
      const delta = msDoEvento(ev.clientX) - inicioMs;

      if (modo === "mover") {
        ultimoStart = Math.max(0, encaixar(base.start + delta, ignorarSnap));
        if (conjunto.length) {
          // move o grupo inteiro pelo mesmo delta (distâncias relativas preservadas)
          const patches = moverSelecao(state, conjunto, ultimoStart - base.start);
          onAlterarClips(patches, false);
          setDica({
            x: ev.clientX,
            y: ev.clientY,
            titulo: `${conjunto.length} clipes`,
            valor: formatarTempo(ultimoStart, true),
            delta: `${delta >= 0 ? "+" : "−"}${formatarTempo(Math.abs(delta), true)}`,
          });
          return;
        }
        onAlterarClip(clip.id, { start: ultimoStart }, false);
        /* Só troca de camada quando o gesto é deliberadamente vertical: enquanto
           o movimento for predominantemente horizontal, o clipe fica na trilha
           de origem (arraste livre em X, sem criar camada). */
        ultimoDestino = intencaoVertical(ev.clientY - y0)
          ? destinoDeClip(
              destinoDoY(ev.clientY),
              clip.trackId,
              (tid) => !!state.tracks.find((t) => t.id === tid)?.locked,
            )
          : null;
        setAlvo(ultimoDestino);
        const dest = ultimoDestino;
        setDica({
          x: ev.clientX,
          y: ev.clientY,
          titulo: !dest
            ? trilha?.name ?? "Camada"
            : dest.tipo === "nova"
              ? "Nova camada"
              : state.tracks.find((t) => t.id === dest.trackId)?.name ?? "Camada",
          valor: formatarTempo(ultimoStart, true),
          delta: `${delta >= 0 ? "+" : "−"}${formatarTempo(Math.abs(delta), true)}`,
        });
        return;
      }


      if (modo === "trim-in") {
        // limite: não passa do início real do arquivo nem some com o clipe
        const bruto = encaixar(base.start + delta, ignorarSnap) - base.start;
        const dif = Math.max(-Math.min(lim.esquerda, base.start), Math.min(base.duration - 100, bruto));
        const novoSourceIn = Math.max(0, base.sourceIn + dif * speed);
        const patches: Record<string, Partial<EditairClip>> = {
          [clip.id]: rippleTrim
            ? { start: base.start, duration: base.duration - dif, sourceIn: novoSourceIn }
            : { start: base.start + dif, duration: base.duration - dif, sourceIn: novoSourceIn },
        };
        if (rippleTrim) {
          for (const c of posteriores) patches[c.id] = { start: Math.max(0, c.start - dif) };
        }
        onAlterarClips(patches, false);
        onSeek(Math.max(0, rippleTrim ? base.start : base.start + dif));
        setDica({
          x: ev.clientX,
          y: ev.clientY,
          titulo: "Source In",
          valor: formatarTempo(novoSourceIn, true),
          delta: `${dif >= 0 ? "+" : "−"}${formatarTempo(Math.abs(dif), true)}`,
        });
        return;
      }

      // trim-out
      const maxDur = Number.isFinite(lim.direita) ? base.duration + lim.direita : Infinity;
      const bruto = encaixar(base.start + base.duration + delta, ignorarSnap) - base.start;
      const novaDur = Math.max(100, Math.min(maxDur, bruto));
      const dif = novaDur - base.duration;
      const patches: Record<string, Partial<EditairClip>> = { [clip.id]: { duration: novaDur } };
      if (rippleTrim) {
        for (const c of posteriores) patches[c.id] = { start: Math.max(0, c.start + dif) };
      }
      onAlterarClips(patches, false);
      onSeek(base.start + novaDur);
      setDica({
        x: ev.clientX,
        y: ev.clientY,
        titulo: "Source Out",
        valor: formatarTempo(base.sourceIn + novaDur * speed, true),
        delta: `${dif >= 0 ? "+" : "−"}${formatarTempo(Math.abs(dif), true)}`,
      });
    };

    const limpar = () => {
      window.removeEventListener("pointermove", mover);
      window.removeEventListener("pointerup", soltar);
      window.removeEventListener("pointercancel", cancelar);
      window.removeEventListener("blur", cancelar);
      window.removeEventListener("keydown", aoTeclar, true);
      setDica(null);
      setArrastandoId(null);
      setAlvo(null);
    };

    function cancelar() {
      const estavaAtivo = ativo;
      ativo = false;
      limpar();
      // restaura start/duration/sourceIn e a posição dos clipes deslocados por ripple,
      // sem commit → nada entra no histórico
      if (estavaAtivo) onAlterarClips(originais, false);
    }

    function mover(ev: PointerEvent) {
      if (!ativo) {
        if (!passouLimiar(ev.clientX - x0, ev.clientY - y0)) return;
        ativo = true;
        setArrastandoId(clip.id);
      }
      aplicarMovimento(ev);
    }

    function soltar() {
      const estavaAtivo = ativo;
      ativo = false;
      limpar();
      if (!estavaAtivo) return; // clique sem movimento: apenas seleciona
      if (conjunto.length) {
        onAlterarClips({}, true);
        return;
      }
      if (modo === "mover" && ultimoDestino && onSoltarClip) {
        onSoltarClip(clip.id, ultimoDestino, ultimoStart);
        return;
      }
      onAlterarClip(clip.id, {}, true);
    }

    function aoTeclar(ev: KeyboardEvent) {
      if (ev.key !== "Escape") return;
      ev.preventDefault();
      ev.stopPropagation();
      cancelar();
    }

    window.addEventListener("pointermove", mover);
    window.addEventListener("pointerup", soltar);
    window.addEventListener("pointercancel", cancelar);
    window.addEventListener("blur", cancelar);
    window.addEventListener("keydown", aoTeclar, true);
  };


  /* Seleção múltipla por área (padrão CapCut): clicar no vazio e arrastar desenha
     um retângulo; todo clip tocado por ele entra na seleção, atravessando camadas.
     Shift = soma à seleção atual. Esc cancela. Clique sem arrastar limpa. */
  const iniciarCaixa = (e: React.PointerEvent) => {
    const x0 = e.clientX;
    const y0 = e.clientY;
    const aditivo = e.shiftKey || e.metaKey || e.ctrlKey;
    const anterior = aditivo ? [...selecionados] : [];
    let ativo = false;

    const faixas = () =>
      state.tracks
        .map((t) => {
          const el = linhasRef.current[t.id];
          if (!el) return null;
          const r = el.getBoundingClientRect();
          return { id: t.id, top: r.top, bottom: r.bottom };
        })
        .filter((v): v is { id: string; top: number; bottom: number } => !!v);

    const calcular = (ev: PointerEvent) => {
      const ids = clipsNaCaixa(state, {
        fromMs: msDoEvento(x0),
        toMs: msDoEvento(ev.clientX),
        trackIds: tracksNaFaixa(faixas(), y0, ev.clientY),
      });
      onSelecionar(aditivo ? unir(anterior, ids) : ids);
    };

    const limpar = () => {
      window.removeEventListener("pointermove", mover);
      window.removeEventListener("pointerup", soltar);
      window.removeEventListener("pointercancel", cancelar);
      window.removeEventListener("keydown", aoTeclar, true);
      setCaixa(null);
    };

    function cancelar() {
      const estava = ativo;
      ativo = false;
      limpar();
      if (estava) onSelecionar(anterior);
    }

    function mover(ev: PointerEvent) {
      if (!ativo) {
        if (!passouLimiar(ev.clientX - x0, ev.clientY - y0)) return;
        ativo = true;
      }
      setCaixa({ x1: x0, y1: y0, x2: ev.clientX, y2: ev.clientY });
      calcular(ev);
    }

    function soltar() {
      const estava = ativo;
      ativo = false;
      limpar();
      // clique seco no vazio limpa a seleção; ao soltar depois de arrastar, mantém
      if (!estava) onSelecionar([]);
    }

    function aoTeclar(ev: KeyboardEvent) {
      if (ev.key !== "Escape") return;
      ev.preventDefault();
      ev.stopPropagation();
      cancelar();
    }

    window.addEventListener("pointermove", mover);
    window.addEventListener("pointerup", soltar);
    window.addEventListener("pointercancel", cancelar);
    window.addEventListener("keydown", aoTeclar, true);
  };

  const clipMenu = menu ? state.clips.find((c) => c.id === menu.clipId) ?? null : null;
  const trilhaMenu = clipMenu ? state.tracks.find((t) => t.id === clipMenu.trackId) ?? null : null;
  const idxTrilhaMenu = trilhaMenu ? state.tracks.findIndex((t) => t.id === trilhaMenu.id) : -1;
  /** quantos clipes a ação vai afetar (o menu age sobre a seleção quando o clipe faz parte dela) */
  const nAfetados = menu && selecionados.includes(menu.clipId) ? selecionados.length : 1;
  const sufixoN = nAfetados > 1 ? ` (${nAfetados})` : "";
  /** clipe travado (ou camada bloqueada): só sobram ações não destrutivas */
  const travadoMenu = !!clipMenu?.bloqueado || !!trilhaMenu?.locked;
  /** o áudio deste clipe já foi extraído para outra faixa? */
  const audioSeparadoMenu = !!(
    clipMenu?.vinculoAudio &&
    state.clips.some((c) => c.id !== clipMenu.id && c.vinculoAudio === clipMenu.vinculoAudio)
  );
  const marcadorMenu = menuMarcador
    ? (state.marcadores ?? []).find((m) => m.id === menuMarcador.id) ?? null
    : null;

  return (
    <div className="relative flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-[#0d1116]" onPointerDown={() => {
        setMenu(null);
        setMenuMarcador(null);
      }}
    >
      <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
        {/* cabeçalho das trilhas — fixo à esquerda, acompanha só o scroll vertical */}
        <div className="w-[170px] shrink-0 overflow-hidden border-r border-white/10 bg-[#10151b]">
          <div className="flex h-7 items-center justify-between border-b border-white/10 px-2">
            <span className="text-[10px] uppercase tracking-wide text-white/30">Camadas</span>
            {onNovaTrilhaVideo ? (
              <button
                type="button"
                title="Nova camada de vídeo"
                onClick={onNovaTrilhaVideo}
                className="rounded p-0.5 text-white/45 transition hover:bg-white/10 hover:text-white"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>
          <div ref={headersRef} className="will-change-transform">
            {state.tracks.map((t, i) => (
              <TrackLabel
                key={t.id}
                track={t}
                indice={i}
                vazia={!state.clips.some((c) => c.trackId === t.id)}
                arrastandoIndice={arrastandoTrack}
                onToggle={onToggleTrack}
                onRenomear={onRenomearTrack}
                onExcluir={onExcluirTrack}
                onSelecionarTudo={onSelecionarTrack}
                onIniciarReorder={setArrastandoTrack}
                onSoltarReorder={(para) => {
                  if (arrastandoTrack !== null && arrastandoTrack !== para) onReordenarTracks?.(arrastandoTrack, para);
                  setArrastandoTrack(null);
                }}
              />
            ))}
            {onNovaTrilhaVideo ? (
              <button
                type="button"
                onClick={onNovaTrilhaVideo}
                className="flex w-full items-center gap-1.5 px-2 py-2 text-[11px] text-white/45 transition hover:bg-white/5 hover:text-white"
              >
                <Plus className="h-3.5 w-3.5" /> Nova camada de vídeo
              </button>
            ) : null}
          </div>
        </div>


        {/* área rolável — único scroll container (X e Y) da timeline */}
        <div
          ref={areaRef}
          data-testid="timeline-viewport"
          onScroll={(e) => {
            const el = e.currentTarget;
            if (headersRef.current) headersRef.current.style.transform = `translateY(${-el.scrollTop}px)`;
          }}
          className={`relative min-h-0 min-w-0 flex-1 overflow-x-auto overflow-y-auto ${soltando ? "ring-1 ring-inset ring-[#F26B1F]/50" : ""}`}

          onDragOver={
            onSoltarArquivos || onSoltarAsset
              ? (e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "copy";
                  setSoltando(true);
                  // destaque da camada sob o cursor + posição temporal do drop
                  const d = destinoDoY(e.clientY);
                  setAlvo(d);
                  const ms = msDoEvento(e.clientX);
                  setDica({
                    x: e.clientX,
                    y: e.clientY,
                    titulo:
                      !d || d.tipo === "nova"
                        ? "Nova camada"
                        : state.tracks.find((t) => t.id === d.trackId)?.name ?? "Camada",
                    valor: formatarTempo(ms, true),
                    delta: "Soltar para inserir",
                  });
                }
              : undefined
          }
          onDragLeave={
            onSoltarArquivos || onSoltarAsset
              ? () => {
                  setSoltando(false);
                  setAlvo(null);
                  setDica(null);
                }
              : undefined
          }
          onDrop={
            onSoltarArquivos || onSoltarAsset
              ? (e) => {
                  e.preventDefault();
                  const destino = destinoDoY(e.clientY) ?? undefined;
                  setSoltando(false);
                  setAlvo(null);
                  setDica(null);
                  const assetId = e.dataTransfer.getData("application/x-editair-asset");
                  if (assetId && onSoltarAsset) {
                    onSoltarAsset(assetId, msDoEvento(e.clientX), destino);
                    return;
                  }
                  if (e.dataTransfer.files?.length) onSoltarArquivos?.(e.dataTransfer.files, msDoEvento(e.clientX));
                }
              : undefined
          }
        >
          <div style={{ width: larguraTotal, minWidth: "100%" }} className="relative" data-testid="timeline-content">
            {/* régua */}
            <div
              title="Clique ou arraste para mover o tempo (Alt/Shift = selecionar intervalo)"
              className="sticky top-0 z-20 h-7 cursor-ew-resize border-b border-white/10 bg-[#0f141a]"
              onPointerDown={(e) => iniciarScrub(e, { selecao: true })}
            >
              {marcas.map((t) => (
                <div key={t} className="absolute top-0 h-full" style={{ left: t * pxPorMs }}>
                  <div className="h-2 w-px bg-white/20" />
                  <span className="ml-1 text-[10px] text-white/35">{formatarTempo(t)}</span>
                </div>
              ))}
            </div>

            {selecao ? (
              <div
                className="pointer-events-none absolute top-7 z-10 h-full border-x border-[#F26B1F]/70 bg-[#F26B1F]/10"
                style={{ left: selecao.fromMs * pxPorMs, width: (selecao.toMs - selecao.fromMs) * pxPorMs }}
              />
            ) : null}

            {/* zona de nova camada acima de tudo */}
            {alvo?.tipo === "nova" && alvo.indice === 0 ? (
              <div className="pointer-events-none flex h-6 items-center justify-center border-y border-dashed border-[#F26B1F] bg-[#F26B1F]/10 text-[10px] text-[#F26B1F]">
                Nova camada acima
              </div>
            ) : null}

            {state.tracks.map((t) => (
              <div
                key={t.id}
                ref={(el) => {
                  linhasRef.current[t.id] = el;
                }}
                className={`relative border-b border-white/5 ${
                  alvo?.tipo === "track" && alvo.trackId === t.id ? "bg-[#F26B1F]/10 ring-1 ring-inset ring-[#F26B1F]/60" : ""
                } ${t.hidden ? "opacity-50" : ""}`}
                style={{ height: ALTURA_TRILHA }}
                onPointerDown={(e) => {
                  if (e.target !== e.currentTarget) return;
                  // Alt + arrasto no vazio = scrub do playhead; o resto desenha o retângulo
                  if (e.altKey) {
                    onSelecionar([]);
                    iniciarScrub(e);
                    return;
                  }
                  iniciarCaixa(e);
                }}
              >
                {state.clips
                  .filter((c) => c.trackId === t.id)
                  .map((c) => (
                    <Clipe
                      key={c.id}
                      clip={c}
                      asset={c.assetId ? assets[c.assetId] : undefined}
                      pxPorMs={pxPorMs}
                      selecionado={selecionados.includes(c.id)}
                      arrastando={arrastandoId === c.id}
                      bloqueado={!!t.locked}
                      onSelect={(aditivo) =>
                        onSelecionar(
                          aditivo
                            ? selecionados.includes(c.id)
                              ? selecionados.filter((x) => x !== c.id)
                              : [...selecionados, c.id]
                            : // clicar num clipe que já faz parte de uma seleção múltipla
                              // mantém o grupo (permite arrastar tudo junto)
                              selecionados.includes(c.id)
                              ? selecionados
                              : [c.id],
                        )
                      }

                      onArrastar={iniciarArraste}
                      onAbrirSource={() => onAbrirSource(c.id)}
                      onEditarTexto={
                        onEditarTextoLegenda
                          ? (texto, commit) => onEditarTextoLegenda(c.id, texto, commit)
                          : undefined
                      }
                      onMenu={(x, y) => {
                        setMenuPos(null);
                        setMenu({ x, y, clipId: c.id });
                      }}
                      onScrub={(e) => iniciarScrub(e)}
                      msNoX={msDoEvento}
                    />

                  ))}
              </div>
            ))}

            {/* zona de nova camada abaixo de tudo */}
            {alvo?.tipo === "nova" && alvo.indice === state.tracks.length ? (
              <div className="pointer-events-none flex h-6 items-center justify-center border-y border-dashed border-[#F26B1F] bg-[#F26B1F]/10 text-[10px] text-[#F26B1F]">
                Nova camada abaixo
              </div>
            ) : null}

            {/* marcadores: clique leva o playhead, botão direito abre o menu do marcador */}
            {(state.marcadores ?? []).map((m) => (
              <div
                key={m.id}
                title={m.nota ? `${m.nota} — clique para ir, botão direito para editar` : "Marcador"}
                className="pointer-events-none absolute top-0 z-20 h-full w-px"
                style={{ left: m.atMs * pxPorMs, background: `${m.cor}66` }}
              >
                <button
                  type="button"
                  aria-label={m.nota ? `Marcador ${m.nota}` : "Marcador"}
                  className="pointer-events-auto -ml-2 block h-4 w-4 cursor-pointer bg-transparent p-0"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSeek(m.atMs);
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setMenu(null);
                    setMenuMarcador({ x: e.clientX, y: e.clientY, id: m.id });
                  }}
                >
                  <span className="ml-1 block h-2 w-2 rotate-45" style={{ background: m.cor }} />
                </button>
              </div>
            ))}


            {/* playhead */}

            {/* área de pegada larga (16px) com linha visual fina de 2px no centro */}
            <div
              role="slider"
              aria-label="Linha do tempo"
              aria-valuenow={Math.round(playheadMs)}
              tabIndex={-1}
              className="group absolute top-0 z-30 h-full w-4 -translate-x-1/2 cursor-ew-resize"
              style={{ left: playheadMs * pxPorMs }}
              onPointerDown={(e) => {
                e.stopPropagation();
                iniciarScrub(e, { seguir: false });
              }}
            >
              <div
                className={`pointer-events-none absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 rounded-full transition-colors ${
                  arrastandoPlayhead ? "bg-[#F26B1F]" : "bg-white group-hover:bg-[#F26B1F]"
                }`}
              />
              {/* cabeça: cresce no hover e durante o arraste */}
              <div
                className={`pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 rounded-b shadow transition-all ${
                  arrastandoPlayhead
                    ? "h-4 w-4 bg-[#F26B1F]"
                    : "h-2.5 w-2.5 bg-white group-hover:h-4 group-hover:w-4 group-hover:bg-[#F26B1F]"
                }`}
              />
            </div>
          </div>
        </div>
      </div>

      {/* retângulo de seleção múltipla */}
      {caixa ? (
        <div
          data-testid="timeline-marquee"
          className="pointer-events-none fixed z-[55] rounded-sm border border-[#F26B1F] bg-[#F26B1F]/15"
          style={{
            left: Math.min(caixa.x1, caixa.x2),
            top: Math.min(caixa.y1, caixa.y2),
            width: Math.abs(caixa.x2 - caixa.x1),
            height: Math.abs(caixa.y2 - caixa.y1),
          }}
        />
      ) : null}

      {/* controle de zoom — pertence ao viewport: não rola com o conteúdo */}
      {onZoom ? (
        <div
          data-testid="timeline-zoom"
          className="absolute bottom-3.5 right-3.5 z-[56] flex items-center gap-1.5 rounded-full border border-white/10 bg-[#12171d]/95 px-2 py-1 shadow-[0_4px_16px_rgba(0,0,0,.5)] backdrop-blur"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            title="Ajustar à janela"
            aria-label="Ajustar à janela"
            onClick={ajustarAJanela}
            className="rounded-full p-1 text-white/45 transition hover:bg-white/10 hover:text-white"
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </button>
          <span className="h-4 w-px bg-white/10" />
          <button
            type="button"
            title="Diminuir zoom"
            aria-label="Diminuir zoom"
            onClick={() => aplicarZoom(zoom / 1.4)}
            className="rounded-full p-1 text-white/50 transition hover:bg-white/10 hover:text-white"
          >
            <ZoomOut className="h-3.5 w-3.5" />
          </button>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            aria-label="Zoom da timeline"
            value={Math.round(((Math.log(zoom) - Math.log(ZOOM_MIN)) / (Math.log(ZOOM_MAX) - Math.log(ZOOM_MIN))) * 100)}
            onChange={(e) => {
              const p = Number(e.target.value) / 100;
              aplicarZoom(Math.exp(Math.log(ZOOM_MIN) + p * (Math.log(ZOOM_MAX) - Math.log(ZOOM_MIN))));
            }}
            className="h-1 w-24 cursor-pointer appearance-none rounded-full bg-white/15 accent-[#F26B1F]"
          />
          <button
            type="button"
            title="Aumentar zoom"
            aria-label="Aumentar zoom"
            onClick={() => aplicarZoom(zoom * 1.4)}
            className="rounded-full p-1 text-white/50 transition hover:bg-white/10 hover:text-white"
          >
            <ZoomIn className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : null}


      {selecionados.length > 1 ? (
        <div className="pointer-events-none absolute bottom-2 left-1/2 z-[55] -translate-x-1/2 rounded-full border border-[#F26B1F]/50 bg-[#0f141a]/95 px-3 py-1 text-[11px] text-white/80 shadow-lg">
          {selecionados.length} clipes selecionados
        </div>
      ) : null}

      {dica ? (

        <div
          className="pointer-events-none fixed z-[60] rounded-lg border border-white/15 bg-[#0f141a]/95 px-2.5 py-1.5 text-[11px] shadow-lg backdrop-blur"
          style={{ left: dica.x + 14, top: dica.y - 44 }}
        >
          <p className="text-white/50">{dica.titulo}</p>
          <p className="font-mono text-white">{dica.valor}</p>
          <p className="font-mono text-[#F26B1F]">{dica.delta}</p>
        </div>
      ) : null}

      {menu && clipMenu ? (
        <div
          ref={menuRef}
          className="fixed z-[60] flex max-h-[calc(100vh-16px)] w-60 flex-col overflow-y-auto overscroll-contain rounded-xl border border-white/10 bg-[#12171d] py-1 text-[12px] shadow-2xl"
          style={{ left: menuPos?.x ?? menu.x, top: menuPos?.y ?? menu.y, visibility: menuPos ? "visible" : "hidden" }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {onEditarComIa ? (
            <>
              <button
                className="block w-full px-3 py-2 text-left font-medium text-[#F26B1F] hover:bg-[#F26B1F]/10"
                onClick={() => {
                  onEditarComIa(menu.clipId);
                  setMenu(null);
                }}
              >
                ✨ Editar com IA
              </button>
              <div className="my-1 h-px bg-white/10" />
            </>
          ) : null}

          {[
            { id: "dividir" as const, nome: "Dividir no playhead", bloqueia: true },
            { id: "aparar" as const, nome: "Aparar até o playhead", bloqueia: true },
            { id: "duplicar" as const, nome: `Duplicar${sufixoN}`, bloqueia: true },
            { id: "copiar" as const, nome: `Copiar${sufixoN}`, bloqueia: false },
            { id: "colar" as const, nome: "Colar (camada acima)", bloqueia: false, exige: temClipboard },
          ].map((a) => (
            <button
              key={a.id}
              disabled={(a.bloqueia && travadoMenu) || a.exige === false}
              className="block w-full px-3 py-2 text-left hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-35"
              onClick={() => {
                onAcaoClip?.(menu.clipId, a.id);
                setMenu(null);
              }}
            >
              {a.nome}
            </button>
          ))}
          <button
            className="block w-full px-3 py-2 text-left hover:bg-white/10"
            onClick={() => {
              onRestaurarClip(menu.clipId);
              setMenu(null);
            }}
          >
            Restaurar duração original
          </button>
          <button
            className="block w-full px-3 py-2 text-left hover:bg-white/10"
            onClick={() => {
              onAbrirSource(menu.clipId);
              setMenu(null);
            }}
          >
            Abrir material original
          </button>

          {clipMenu.kind === "video" || clipMenu.kind === "audio" ? (
            <>
              <div className="my-1 h-px bg-white/10" />
              {clipMenu.kind === "video" ? (
                audioSeparadoMenu ? (
                  <button
                    disabled={travadoMenu}
                    className="block w-full px-3 py-2 text-left hover:bg-white/10 disabled:opacity-35"
                    onClick={() => {
                      onAcaoClip?.(menu.clipId, "revincular");
                      setMenu(null);
                    }}
                  >
                    Revincular áudio ao vídeo
                  </button>
                ) : (
                  <button
                    disabled={travadoMenu}
                    className="block w-full px-3 py-2 text-left hover:bg-white/10 disabled:opacity-35"
                    onClick={() => {
                      onAcaoClip?.(menu.clipId, "extrair-audio");
                      setMenu(null);
                    }}
                  >
                    Extrair áudio para nova faixa
                  </button>
                )
              ) : null}
              <button
                disabled={travadoMenu}
                className="block w-full px-3 py-2 text-left hover:bg-white/10 disabled:opacity-35"
                onClick={() => {
                  onAcaoClip?.(menu.clipId, "mudo");
                  setMenu(null);
                }}
              >
                {clipMenu.muted || clipMenu.semAudio ? `Reativar áudio${sufixoN}` : `Silenciar${sufixoN}`}
              </button>
            </>
          ) : null}

          {clipMenu.kind === "video" || clipMenu.kind === "image" ? (
            <>
              <div className="my-1 h-px bg-white/10" />
              <button
                disabled={idxTrilhaMenu <= 0}
                className="block w-full px-3 py-2 text-left hover:bg-white/10 disabled:opacity-35"
                onClick={() => {
                  onMoverCamada?.(menu.clipId, -1);
                  setMenu(null);
                }}
              >
                Mover para camada acima
              </button>
              <button
                disabled={idxTrilhaMenu < 0 || idxTrilhaMenu >= state.tracks.length - 1}
                className="block w-full px-3 py-2 text-left hover:bg-white/10 disabled:opacity-35"
                onClick={() => {
                  onMoverCamada?.(menu.clipId, 1);
                  setMenu(null);
                }}
              >
                Mover para camada abaixo
              </button>
              <button
                className="block w-full px-3 py-2 text-left hover:bg-white/10"
                onClick={() => {
                  onNovaCamadaJunto?.(menu.clipId, -1);
                  setMenu(null);
                }}
              >
                Criar nova camada acima
              </button>
              <button
                className="block w-full px-3 py-2 text-left hover:bg-white/10"
                onClick={() => {
                  onNovaCamadaJunto?.(menu.clipId, 1);
                  setMenu(null);
                }}
              >
                Criar nova camada abaixo
              </button>
            </>
          ) : null}

          <div className="my-1 h-px bg-white/10" />
          {clipMenu.kind === "video" || clipMenu.kind === "image" ? (
            <button
              disabled={travadoMenu}
              className="block w-full px-3 py-2 text-left hover:bg-white/10 disabled:opacity-35"
              onClick={() => {
                onAcaoClip?.(menu.clipId, clipMenu.congelado ? "descongelar" : "congelar");
                setMenu(null);
              }}
            >
              {clipMenu.congelado ? `Descongelar${sufixoN}` : `Congelar frame${sufixoN}`}
            </button>
          ) : null}
          <button
            className="block w-full px-3 py-2 text-left hover:bg-white/10"
            onClick={() => {
              onAcaoClip?.(menu.clipId, "bloquear");
              setMenu(null);
            }}
          >
            {clipMenu.bloqueado ? "Desbloquear clipe" : "Bloquear clipe"}
          </button>
          <div className="my-1 h-px bg-white/10" />
          <button
            disabled={travadoMenu}
            className="block w-full px-3 py-2 text-left text-red-400 hover:bg-red-500/10 disabled:opacity-35"
            onClick={() => {
              onAcaoClip?.(menu.clipId, "ripple");
              setMenu(null);
            }}
          >
            Ripple delete (fecha o buraco)
          </button>
          <button
            disabled={travadoMenu}
            className="block w-full px-3 py-2 text-left text-red-400 hover:bg-red-500/10 disabled:opacity-35"
            onClick={() => {
              onAcaoClip?.(menu.clipId, "excluir");
              setMenu(null);
            }}
          >
            {`Excluir clipe${sufixoN}`}
          </button>
        </div>
      ) : null}

      {menuMarcador && marcadorMenu ? (
        <div
          className="fixed z-[60] w-56 rounded-xl border border-white/10 bg-[#12171d] py-1 text-[12px] shadow-2xl"
          style={{ left: menuMarcador.x, top: menuMarcador.y }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className="px-3 py-1.5 text-[11px] text-white/45">
            {marcadorMenu.nota || "Marcador"} · {(marcadorMenu.atMs / 1000).toFixed(2)}s
          </div>
          <button
            className="block w-full px-3 py-2 text-left hover:bg-white/10"
            onClick={() => {
              onAcaoMarcador?.(marcadorMenu.id, "renomear");
              setMenuMarcador(null);
            }}
          >
            Renomear marcador
          </button>
          <div className="flex items-center gap-2 px-3 py-2">
            <span className="text-white/60">Cor</span>
            {CORES_MARCADOR.map((cor) => (
              <button
                key={cor}
                aria-label={`Cor ${cor}`}
                className="h-4 w-4 rounded-full border border-white/25"
                style={{ background: cor, outline: marcadorMenu.cor === cor ? "2px solid #fff" : "none" }}
                onClick={() => {
                  onAcaoMarcador?.(marcadorMenu.id, "cor", cor);
                  setMenuMarcador(null);
                }}
              />
            ))}
          </div>
          <div className="my-1 h-px bg-white/10" />
          <button
            className="block w-full px-3 py-2 text-left text-red-400 hover:bg-red-500/10"
            onClick={() => {
              onAcaoMarcador?.(marcadorMenu.id, "excluir");
              setMenuMarcador(null);
            }}
          >
            Excluir marcador
          </button>
        </div>
      ) : null}
    </div>
  );
}

/** paleta usada no menu de contexto do marcador */
const CORES_MARCADOR = ["#F26B1F", "#22c55e", "#38bdf8", "#e879f9", "#facc15"];

function TrackLabel({
  track,
  indice,
  vazia,
  arrastandoIndice,
  onToggle,
  onRenomear,
  onExcluir,
  onSelecionarTudo,
  onIniciarReorder,
  onSoltarReorder,
}: {
  track: EditairTrack;
  indice: number;
  vazia: boolean;
  arrastandoIndice: number | null;
  onToggle: (id: string, campo: "muted" | "hidden" | "locked" | "solo") => void;
  onRenomear?: (id: string, nome: string) => void;
  onExcluir?: (id: string) => void;
  onSelecionarTudo?: (id: string) => void;
  onIniciarReorder: (indice: number) => void;
  onSoltarReorder: (indice: number) => void;
}) {
  const audio = track.kind === "voice" || track.kind === "music" || track.kind === "video";
  const [editando, setEditando] = useState(false);
  const [nome, setNome] = useState(track.name);
  const [sobre, setSobre] = useState(false);
  const [menuTrack, setMenuTrack] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!menuTrack) return;
    const fechar = () => setMenuTrack(null);
    window.addEventListener("pointerdown", fechar);
    return () => window.removeEventListener("pointerdown", fechar);
  }, [menuTrack]);

  const salvar = () => {
    setEditando(false);
    const n = nome.trim();
    if (n && n !== track.name) onRenomear?.(track.id, n);
    else setNome(track.name);
  };

  return (
    <div
      draggable={!!onRenomear || true}
      onDragStart={() => onIniciarReorder(indice)}
      onDragOver={(e) => {
        e.preventDefault();
        setSobre(true);
      }}
      onDragLeave={() => setSobre(false)}
      onDrop={(e) => {
        e.preventDefault();
        setSobre(false);
        onSoltarReorder(indice);
      }}
      onDragEnd={() => setSobre(false)}
      onContextMenu={(e) => {
        if (!onSelecionarTudo) return;
        e.preventDefault();
        setMenuTrack({ x: e.clientX, y: e.clientY });
      }}
      style={{ height: ALTURA_TRILHA }}
      className={`flex items-center justify-between gap-1 border-b border-white/5 px-1.5 text-[11px] text-white/65 ${
        sobre && arrastandoIndice !== null && arrastandoIndice !== indice ? "bg-[#F26B1F]/15" : ""
      }`}
    >
      {menuTrack ? (
        <div
          className="fixed z-50 min-w-[200px] rounded-lg border border-white/10 bg-[#151b22] py-1 text-[12px] text-white/85 shadow-xl"
          style={{ left: menuTrack.x, top: menuTrack.y }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            disabled={!!track.locked}
            onClick={() => {
              onSelecionarTudo?.(track.id);
              setMenuTrack(null);
            }}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left transition hover:bg-white/10 disabled:opacity-40"
          >
            <MousePointerSquareDashed className="h-3.5 w-3.5" />
            {track.locked ? "Camada bloqueada" : "Selecionar todos nesta camada"}
          </button>
        </div>
      ) : null}
      <GripVertical className="h-3.5 w-3.5 shrink-0 cursor-grab text-white/25" />
      {editando ? (
        <input
          autoFocus
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          onBlur={salvar}
          onKeyDown={(e) => {
            if (e.key === "Enter") salvar();
            if (e.key === "Escape") {
              setNome(track.name);
              setEditando(false);
            }
          }}
          className="min-w-0 flex-1 rounded bg-black/40 px-1 py-0.5 text-[11px] text-white outline-none"
        />
      ) : (
        <span className="min-w-0 flex-1 truncate" onDoubleClick={() => setEditando(true)} title={track.name}>
          {track.name}
        </span>
      )}
      <div className="flex shrink-0 items-center gap-0.5">
        {onRenomear && !editando ? (
          <IconBtn title="Renomear camada" onClick={() => setEditando(true)}>
            <Pencil className="h-3 w-3" />
          </IconBtn>
        ) : null}
        <IconBtn title="Mostrar/ocultar" onClick={() => onToggle(track.id, "hidden")}>
          {track.hidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
        </IconBtn>
        {audio ? (
          <>
            <IconBtn title="Mudo" onClick={() => onToggle(track.id, "muted")}>
              {track.muted ? <VolumeX className="h-3.5 w-3.5 text-red-400" /> : <Volume2 className="h-3.5 w-3.5" />}
            </IconBtn>
            <IconBtn title="Solo" onClick={() => onToggle(track.id, "solo")}>
              <Headphones className={`h-3.5 w-3.5 ${track.solo ? "text-[#F26B1F]" : ""}`} />
            </IconBtn>
          </>
        ) : null}
        <IconBtn title="Bloquear" onClick={() => onToggle(track.id, "locked")}>
          {track.locked ? <Lock className="h-3.5 w-3.5 text-amber-400" /> : <LockOpen className="h-3.5 w-3.5" />}
        </IconBtn>
        {vazia && onExcluir ? (
          <IconBtn title="Excluir camada vazia" onClick={() => onExcluir(track.id)}>
            <Trash2 className="h-3 w-3 text-red-400" />
          </IconBtn>
        ) : null}
      </div>
    </div>
  );
}

function IconBtn({ children, onClick, title }: { children: React.ReactNode; onClick: () => void; title: string }) {
  return (
    <button
      title={title}
      onClick={onClick}
      className="rounded p-1 text-white/40 transition hover:bg-white/10 hover:text-white"
    >
      {children}
    </button>
  );
}

function Clipe({
  clip,
  asset,
  pxPorMs,
  selecionado,
  arrastando,
  bloqueado,
  onSelect,
  onArrastar,
  onAbrirSource,
  onEditarTexto,
  onMenu,
  onScrub,
  msNoX,
}: {
  clip: EditairClip;
  asset?: AssetInfo;
  pxPorMs: number;
  selecionado: boolean;
  arrastando: boolean;
  bloqueado: boolean;
  onSelect: (aditivo: boolean) => void;
  onArrastar: (e: React.PointerEvent, clip: EditairClip, modo: "mover" | "trim-in" | "trim-out") => void;
  onAbrirSource: () => void;
  onEditarTexto?: (texto: string, commit: boolean) => void;
  onMenu: (x: number, y: number) => void;
  /** clique/arraste na faixa superior do clipe = scrub do playhead (mesmo caminho da régua) */
  onScrub: (e: React.PointerEvent) => void;
  /** converte clientX em ms usando o sistema central (rect + scrollLeft) */
  msNoX: (clientX: number) => number;
}) {

  const largura = Math.max(8, clip.duration * pxPorMs);
  const editavel = (clip.kind === "caption" || clip.kind === "text") && !!onEditarTexto;
  const [editandoTexto, setEditandoTexto] = useState(false);
  const visual = clip.kind === "video" || clip.kind === "image";
  const sonoro = clip.kind === "audio";
  const speed = clip.speed || 1;
  const dispEsq = asset ? Math.min(clip.sourceIn / speed, 60_000) : 0;
  const dispDir = asset
    ? Math.min(Math.max(0, (asset.durationMs - (clip.sourceIn + clip.duration * speed)) / speed), 60_000)
    : 0;
  const mostrarSobra = (selecionado || arrastando) && !!asset;
  /** posição do cursor dentro da faixa de seek (px relativos ao clipe) + timecode */
  const [seekHover, setSeekHover] = useState<{ x: number; ms: number } | null>(null);


  return (
    <>
      {mostrarSobra && dispEsq > 1 ? (
        <div
          className="pointer-events-none absolute top-1.5 h-11 rounded-l-md border border-dashed border-white/25 bg-[repeating-linear-gradient(45deg,rgba(255,255,255,.09)_0_6px,transparent_6px_12px)]"
          style={{ left: (clip.start - dispEsq) * pxPorMs, width: dispEsq * pxPorMs }}
          title="Material disponível no arquivo original"
        />
      ) : null}
      {mostrarSobra && dispDir > 1 ? (
        <div
          className="pointer-events-none absolute top-1.5 h-11 rounded-r-md border border-dashed border-white/25 bg-[repeating-linear-gradient(45deg,rgba(255,255,255,.09)_0_6px,transparent_6px_12px)]"
          style={{ left: (clip.start + clip.duration) * pxPorMs, width: dispDir * pxPorMs }}
          title="Material disponível no arquivo original"
        />
      ) : null}

      <div
        onPointerDown={(e) => {
          if (e.button === 2) return;
          onSelect(e.shiftKey || e.metaKey || e.ctrlKey);
          onArrastar(e, clip, "mover");
        }}
        onDoubleClick={(e) => {
          e.stopPropagation();
          if (editavel) setEditandoTexto(true);
          else onAbrirSource();
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          onSelect(false);
          onMenu(e.clientX, e.clientY);
        }}
        className={`absolute top-1.5 flex h-11 select-none items-center overflow-hidden rounded-lg border-2 text-[11px] text-white/90 shadow-[0_2px_8px_rgba(0,0,0,.45)] transition ${
          CORES[clip.trackId] ?? (clip.trackId.startsWith("t-video") ? CORES["t-video"] : "bg-white/20 border-white/20")
        } ${selecionado ? "border-[#F26B1F] ring-1 ring-[#F26B1F]/60" : "hover:brightness-110"} ${
          bloqueado || clip.bloqueado ? "cursor-not-allowed opacity-70" : arrastando ? "cursor-grabbing" : "cursor-grab"
        } ${arrastando ? "opacity-70 ring-2 ring-white/40" : ""
        }`}
        style={{ left: clip.start * pxPorMs, width: largura }}
        title={clip.label ?? clip.text ?? clip.kind}
      >
        {visual && asset ? <Filmstrip clip={clip} asset={asset} largura={largura} /> : null}
        {clip.kind === "video" && asset ? (
          <WaveClip clip={clip} asset={asset} largura={largura} sobreposta />
        ) : null}
        {sonoro && asset ? <WaveClip clip={clip} asset={asset} largura={largura} /> : null}
        {editandoTexto ? (
          <input
            autoFocus
            data-testid="timeline-editar-legenda"
            defaultValue={clip.text ?? ""}
            onPointerDown={(e) => e.stopPropagation()}
            onChange={(e) => onEditarTexto?.(e.target.value, false)}
            onBlur={(e) => {
              onEditarTexto?.(e.target.value, true);
              setEditandoTexto(false);
            }}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter" || e.key === "Escape") e.currentTarget.blur();
            }}
            className="mx-1 w-full rounded border border-[#F26B1F] bg-black/80 px-1 py-0.5 text-[11px] outline-none"
          />
        ) : !visual && !sonoro ? (
          <span className="truncate px-2">{clip.text ?? clip.label ?? clip.kind}</span>
        ) : (
          <span className="pointer-events-none absolute bottom-0 left-1 max-w-[90%] truncate rounded-sm bg-black/50 px-1 text-[9px]">
            {clip.label ?? asset?.name ?? ""}
          </span>
        )}
        <span className="pointer-events-none absolute right-1 top-0.5 rounded bg-black/55 px-1 text-[9px] font-mono text-white/80">
          {(clip.duration / 1000).toFixed(1)}s
        </span>
        {clip.bloqueado ? (
          <span className="pointer-events-none absolute left-1 top-0.5 rounded bg-black/55 px-1 text-[9px]">🔒</span>
        ) : null}
        {clip.transicao ? (
          <span className="pointer-events-none absolute left-0 top-0 h-full w-3 bg-gradient-to-r from-white/60 to-transparent" />
        ) : null}
        <MarcadoresEfeitos clip={clip} largura={largura} />
        <StatusClipe clip={clip} />

        {/* FAIXA DE SEEK — topo do clipe: clique/arraste posiciona o playhead (CapCut-like).
            Fica abaixo das alças de trim (renderizadas depois) para não roubar o trim. */}
        {!editandoTexto ? (
          <div
            data-testid="clip-seek-zone"
            className="absolute inset-x-2.5 top-0 z-20 h-3.5 cursor-ew-resize"
            title="Clique ou arraste para mover o playhead"
            onPointerDown={(e) => {
              if (e.button === 2) return;
              e.stopPropagation();
              onScrub(e);
            }}
            onDoubleClick={(e) => e.stopPropagation()}
            onPointerMove={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              setSeekHover({ x: e.clientX - r.left, ms: msNoX(e.clientX) });
            }}
            onPointerLeave={() => setSeekHover(null)}
          >
            <span className="pointer-events-none absolute inset-0 bg-white/10 opacity-0 transition hover:opacity-100" />
            {seekHover ? (
              <>
                <span
                  className="pointer-events-none absolute top-0 h-3.5 w-px bg-white/80"
                  style={{ left: seekHover.x }}
                />
                <span
                  className="pointer-events-none absolute top-4 rounded bg-black/80 px-1 font-mono text-[9px] text-white"
                  style={{ left: Math.max(0, seekHover.x - 18) }}
                >
                  {formatarTempo(seekHover.ms, true)}
                </span>
              </>
            ) : null}
          </div>
        ) : null}

        {!bloqueado && !clip.bloqueado ? (
          <>
            <div
              onPointerDown={(e) => {
                e.stopPropagation();
                onSelect(false);
                onArrastar(e, clip, "trim-in");
              }}
              className={`absolute left-0 top-0 flex h-full w-2.5 cursor-ew-resize items-center justify-center transition ${
                selecionado ? "bg-white/70" : "bg-white/0 hover:bg-white/40"
              }`}
            >
              {selecionado ? <span className="h-5 w-px bg-black/50" /> : null}
            </div>
            <div
              onPointerDown={(e) => {
                e.stopPropagation();
                onSelect(false);
                onArrastar(e, clip, "trim-out");
              }}
              className={`absolute right-0 top-0 flex h-full w-2.5 cursor-ew-resize items-center justify-center transition ${
                selecionado ? "bg-white/70" : "bg-white/0 hover:bg-white/40"
              }`}
            >
              {selecionado ? <span className="h-5 w-px bg-black/50" /> : null}
            </div>
          </>
        ) : null}
      </div>
    </>
  );
}

function Filmstrip({ clip, asset, largura }: { clip: EditairClip; asset: AssetInfo; largura: number }) {
  const passoIdeal = 72;
  const larguraSegura = Math.max(1, largura);
  // nunca deixa buraco: a quantidade cobre a largura toda e cada quadro estica
  // proporcionalmente quando o clipe é maior que o limite de miniaturas.
  const qtd = Math.max(1, Math.min(60, Math.ceil(larguraSegura / passoIdeal)));
  const passo = larguraSegura / qtd;
  const [imgs, setImgs] = useState<(string | null)[]>([]);

  useEffect(() => {
    let vivo = true;
    const alvos = Array.from(
      { length: qtd },
      (_, i) => clip.sourceIn + ((i + 0.5) * (clip.duration * clip.speed)) / qtd,
    );
    setImgs(Array(qtd).fill(null));
    (async () => {
      for (let i = 0; i < alvos.length; i++) {
        const src = await obterThumb(asset.id || asset.url, asset.url, alvos[i], 72);
        if (!vivo) return;
        setImgs((atual) => {
          const c = [...atual];
          c[i] = src;
          return c;
        });
      }
    })();
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asset.url, qtd, clip.sourceIn, clip.speed, clip.duration]);

  return (
    <div className="absolute inset-0 flex h-full w-full">
      {imgs.map((src, i) => (
        <div key={i} className="h-full shrink-0 border-r border-black/40" style={{ width: passo }}>
          {src ? <img src={src} alt="" className="h-full w-full object-cover" /> : <div className="h-full w-full bg-black/30" />}
        </div>
      ))}
    </div>
  );
}


/**
 * Forma de onda do clipe. Respeita zoom (largura), trim (sourceIn), split
 * (duration) e velocidade. Nunca bloqueia: o clipe aparece na hora e a
 * waveform surge quando os picos ficam prontos, em segundo plano.
 */
function WaveClip({
  clip,
  asset,
  largura,
  sobreposta = false,
  projectId,
}: {
  clip: EditairClip;
  asset: AssetInfo;
  largura: number;
  /** desenhada por cima dos thumbnails de vídeo, na faixa inferior */
  sobreposta?: boolean;
  projectId?: string;
}) {
  const [picos, setPicos] = useState<number[] | null>(null);
  useEffect(() => {
    let vivo = true;
    const chave = asset.id || asset.url;
    const emCache = picosEmCache(chave);
    if (emCache) {
      setPicos(emCache);
      return;
    }
    const { promessa } = executarJob(
      {
        projectId: projectId || "editair",
        type: "waveform",
        title: "Forma de onda",
        stage: "Gerando forma de onda…",
        targetId: clip.id,
        cancellable: false,
        resultado: "Forma de onda pronta",
      },
      async () => obterPicos(chave, asset.url),
    );
    void promessa.then((r) => {
      if (vivo && r.ok) setPicos(r.valor);
    });
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asset.id, asset.url]);

  const altura = sobreposta ? 16 : 44;
  if (!picos?.length) {
    return sobreposta ? null : <div className="h-full w-full bg-black/20" />;
  }
  const total = asset.durationMs || 1;
  const ini = Math.floor((clip.sourceIn / total) * picos.length);
  const fim = Math.ceil(((clip.sourceIn + clip.duration * clip.speed) / total) * picos.length);
  const fatia = picos.slice(Math.max(0, ini), Math.max(ini + 1, fim));
  const barras = Math.max(4, Math.min(400, Math.floor(largura / 3)));
  const passo = fatia.length / barras;
  const meio = altura / 2;
  const escala = altura * 0.82;

  return (
    <svg
      className={sobreposta ? "pointer-events-none absolute inset-x-0 bottom-0 w-full" : "h-full w-full"}
      width={largura}
      height={altura}
      preserveAspectRatio="none"
    >
      {sobreposta ? <rect x={0} y={0} width={largura} height={altura} fill="rgba(0,0,0,.45)" /> : null}
      {Array.from({ length: barras }, (_, i) => {
        const v = fatia[Math.floor(i * passo)] ?? 0;
        const h = Math.max(1.5, v * escala);
        return <rect key={i} x={i * 3} y={meio - h / 2} width={2} height={h} fill="#66e0d2" opacity={0.85} />;
      })}
    </svg>
  );
}

/**
 * Progresso da operação que pertence a ESTE clipe, integrado ao topo dele:
 * texto de etapa + barra fina. Não muda posição nem duração do clipe e não
 * bloqueia o editor.
 */
function StatusClipe({ clip }: { clip: EditairClip }) {
  const jobs = useJobsDoAlvo(clip.id);
  const ativo = jobs.find((j) => j.status === "running" || j.status === "queued");
  const recente = jobs.find((j) => j.status === "completed" || j.status === "failed");
  const job = ativo ?? recente;
  if (!job) return null;

  if (!ativo && job.status === "completed") {
    return (
      <span className="pointer-events-none absolute inset-x-0 top-0 truncate bg-emerald-600/80 px-1 text-[9px] text-white">
        ✓ {job.resultado || `${job.title} concluído`}
      </span>
    );
  }
  if (!ativo && job.status === "failed") {
    return (
      <span className="pointer-events-none absolute inset-x-0 top-0 truncate bg-amber-600/80 px-1 text-[9px] text-white">
        ⚠ {job.error || `Falha em ${job.title}`}
      </span>
    );
  }

  const rotulo = job.stage || job.title;
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0" data-testid={`status-clipe-${clip.id}`}>
      <div className="flex items-center gap-1 bg-black/70 px-1 py-[1px] text-[9px] text-white/90">
        <span className="inline-block h-2 w-2 shrink-0 animate-spin rounded-full border border-white/30 border-t-[#F26B1F]" />
        <span className="truncate">
          {rotulo}
          {job.progress != null ? ` ${job.progress}%` : ""}
        </span>
      </div>
      <div className="h-[3px] w-full bg-white/10">
        {job.progress == null ? (
          <div className="h-full w-1/3 animate-[editair-indeterminado_1.2s_ease-in-out_infinite] bg-[#F26B1F]" />
        ) : (
          <div className="h-full bg-[#F26B1F] transition-all" style={{ width: `${job.progress}%` }} />
        )}
      </div>
    </div>
  );
}


/** Faixas visuais de entrada / momento / saída no próprio clipe. */
function MarcadoresEfeitos({ clip, largura }: { clip: EditairClip; largura: number }) {
  const { entradaMs, saidaMs, temMomento } = marcadoresEfeitos(clip.efeitos, clip.duration);
  if (!entradaMs && !saidaMs && !temMomento) return null;
  const px = (ms: number) => Math.max(6, (ms / Math.max(1, clip.duration)) * largura);
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 h-full">
      {entradaMs ? (
        <span
          title={`Entrada: ${clip.efeitos?.entrada?.id}`}
          className="absolute left-0 top-0 h-full bg-gradient-to-r from-[#F26B1F]/70 to-transparent"
          style={{ width: px(entradaMs) }}
        />
      ) : null}
      {saidaMs ? (
        <span
          title={`Saída: ${clip.efeitos?.saida?.id}`}
          className="absolute right-0 top-0 h-full bg-gradient-to-l from-[#37E1FF]/70 to-transparent"
          style={{ width: px(saidaMs) }}
        />
      ) : null}
      {temMomento ? (
        <span
          title={`Momento: ${clip.efeitos?.momento?.id}`}
          className="absolute inset-x-0 top-0 h-[3px] bg-[repeating-linear-gradient(90deg,rgba(255,255,255,.75)_0_6px,transparent_6px_12px)]"
        />
      ) : null}
    </div>
  );
}
