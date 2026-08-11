import { useEffect, useMemo, useState } from "react";
import { X, Download, Loader2, CheckCircle2, Folder, FolderOpen, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatarTempo } from "@/lib/editair/types";
import { estimarBytes, formatarBytes } from "@/lib/editair/composicao";
import type { MetricasExport } from "@/lib/editair/export-metrics";

export type CodecOpcao = { id: string; nome: string; mime: string };
export type PresetExport = "rapido" | "recomendado" | "alta";
export type ExportConfig = {
  escopo: "video" | "audio";
  nome: string;
  formato: string;
  largura: number;
  altura: number;
  fps: number;
  bitrate: number;
  mime: string;
  comAudio: boolean;
  mixagem: "completo" | "voz" | "musica";
  audioBitrate: number;
  audioFormato: string;
  /** velocidade x qualidade do encoder: rapido | recomendado | alta */
  preset: PresetExport;
  /** caminho completo escolhido no diálogo nativo (Desktop) */
  destino?: string | null;
};

export type ProgressoExport = {
  pct: number;
  frame: number;
  totalFrames: number;
  etaS: number;
  fase?: string;
} | null;
export type ResultadoExport = {
  url?: string;
  caminho?: string;
  nome: string;
  bytes: number;
  largura: number;
  altura: number;
  fps: number;
  duracaoMs: number;
  metricas?: MetricasExport;
  relatorio?: string;
} | null;

function suportado(mime: string) {
  try {
    return typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(mime);
  } catch {
    return false;
  }
}

const CODECS_VIDEO: CodecOpcao[] = [
  { id: "h264", nome: "H.264", mime: "video/mp4;codecs=avc1.42E01E,mp4a.40.2" },
  { id: "h265", nome: "H.265 / HEVC", mime: "video/mp4;codecs=hvc1" },
  { id: "vp9", nome: "VP9", mime: "video/webm;codecs=vp9,opus" },
  { id: "av1", nome: "AV1", mime: "video/webm;codecs=av01.0.05M.08,opus" },
];

const CODECS_AUDIO: CodecOpcao[] = [
  { id: "aac", nome: "M4A / AAC", mime: "audio/mp4" },
  { id: "opus", nome: "WebM / Opus", mime: "audio/webm;codecs=opus" },
];

const QUALIDADES: { id: PresetExport; nome: string; fator: number; dica: string }[] = [
  { id: "rapido", nome: "Rápido", fator: 0.07, dica: "Encoder por hardware, bitrate enxuto — ideal para prévias e stories." },
  { id: "recomendado", nome: "Recomendado", fator: 0.1, dica: "Hardware + bitrate cheio: qualidade ótima para Reels/YouTube com arquivo leve." },
  { id: "alta", nome: "Alta qualidade", fator: 0.16, dica: "Encoder por software (CRF 18). Bem mais lento, para masterização." },
];

export function ExportDialog({
  aberto,
  onFechar,
  nomeProjeto,
  largura,
  altura,
  fpsProjeto,
  duracaoMs,
  progresso,
  resultado,
  desktop = false,
  capaUrl,
  pastaDestino,
  onEscolherPasta,
  onExportar,
  onCancelar,
  onLimparResultado,
  onAbrirArquivo,
  onRevelarArquivo,
}: {
  aberto: boolean;
  onFechar: () => void;
  nomeProjeto: string;
  largura: number;
  altura: number;
  fpsProjeto: number;
  duracaoMs: number;
  progresso: ProgressoExport;
  resultado: ResultadoExport;
  desktop?: boolean;
  capaUrl?: string | null;
  pastaDestino?: string | null;
  onEscolherPasta?: () => void;
  onExportar: (cfg: ExportConfig) => void;
  onCancelar: () => void;
  onLimparResultado: () => void;
  onAbrirArquivo?: (caminho: string) => void;
  onRevelarArquivo?: (caminho: string) => void;
}) {
  const [escopo, setEscopo] = useState<"video" | "audio">("video");
  const [nome, setNome] = useState(nomeProjeto);
  const [alturaAlvo, setAlturaAlvo] = useState(1080);
  const [fps, setFps] = useState(fpsProjeto);
  const [qualidade, setQualidade] = useState<PresetExport>("recomendado");
  const [codec, setCodec] = useState<string>("");
  const [comAudio, setComAudio] = useState(true);
  const [avancado, setAvancado] = useState(false);
  const [bitrateManual, setBitrateManual] = useState<number | null>(null);
  const [mixagem, setMixagem] = useState<"completo" | "voz" | "musica">("completo");
  const [audioCodec, setAudioCodec] = useState<string>("");
  const [audioBitrate, setAudioBitrate] = useState(192);

  useEffect(() => {
    if (aberto) setNome(nomeProjeto);
  }, [aberto, nomeProjeto]);

  const codecsVideo = useMemo(() => (desktop ? CODECS_VIDEO.slice(0, 3) : CODECS_VIDEO.filter((c) => suportado(c.mime))), [desktop]);
  const codecsAudio = useMemo(() => CODECS_AUDIO.filter((c) => suportado(c.mime)), []);
  const codecEscolhido = codecsVideo.find((c) => c.id === codec) ?? codecsVideo[0];
  const audioEscolhido = codecsAudio.find((c) => c.id === audioCodec) ?? codecsAudio[0];

  const vertical = altura >= largura;
  const escalas = [720, 1080, 1440, 2160];
  const dims = (base: number) => {
    const menor = base;
    const maior = Math.round((menor * Math.max(largura, altura)) / Math.min(largura, altura));
    return vertical ? { w: menor, h: maior } : { w: maior, h: menor };
  };
  const alvo = dims(alturaAlvo);
  const presetInfo = QUALIDADES.find((q) => q.id === qualidade) ?? QUALIDADES[1]!;
  const fator = presetInfo.fator;
  const bitrate = bitrateManual ?? Math.round(alvo.w * alvo.h * fps * fator * 0.07);
  const bytesEstimados = estimarBytes({
    duracaoMs,
    videoBps: bitrate,
    audioBps: audioBitrate * 1000,
    comVideo: escopo === "video",
    comAudio: escopo === "audio" || comAudio,
  });

  if (!aberto) return null;

  const emAndamento = !!progresso;
  const extensao =
    escopo === "video"
      ? codecEscolhido?.mime.includes("mp4")
        ? "mp4"
        : "webm"
      : audioCodec === "wav"
        ? "wav"
        : audioEscolhido?.mime.includes("mp4")
          ? "m4a"
          : "webm";
  const nomeArquivo = `${(nome.trim() || "editair").replace(/\.[a-z0-9]{2,4}$/i, "")}.${extensao}`;

  const disparar = () =>
    onExportar({
      escopo,
      nome: nome.trim() || "editair",
      formato: extensao,
      largura: alvo.w,
      altura: alvo.h,
      fps,
      bitrate,
      mime:
        escopo === "video"
          ? (codecEscolhido?.mime ?? "video/webm")
          : audioCodec === "wav"
            ? "wav"
            : (audioEscolhido?.mime ?? "audio/webm"),
      comAudio,
      mixagem,
      audioBitrate,
      audioFormato: audioCodec || audioEscolhido?.id || "opus",
      preset: qualidade,
    });

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="max-h-[92vh] w-full max-w-[860px] overflow-hidden rounded-2xl border border-white/10 bg-[#12171d] shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-3.5">
          <h2 className="text-sm font-semibold">Exportar</h2>
          <button onClick={onFechar} className="rounded p-1 text-white/50 hover:bg-white/10 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid max-h-[80vh] grid-cols-1 md:grid-cols-[300px_1fr]">
          {/* ---------- coluna esquerda: preview ---------- */}
          <div className="hidden flex-col gap-3 border-r border-white/10 bg-black/30 p-5 md:flex">
            <div
              className="relative w-full overflow-hidden rounded-xl border border-white/10 bg-black"
              style={{ aspectRatio: `${largura} / ${altura}`, maxHeight: 340 }}
            >
              {capaUrl ? (
                <img src={capaUrl} alt="Prévia do vídeo a exportar" className="h-full w-full object-contain" />
              ) : (
                <div className="flex h-full items-center justify-center text-white/25">
                  <Play className="h-8 w-8" />
                </div>
              )}
            </div>
            <div className="space-y-1 text-[11px] text-white/55">
              <p className="truncate text-xs font-medium text-white">{nomeArquivo}</p>
              <p>
                Duração real: <span className="text-white/80">{formatarTempo(duracaoMs)}</span>
              </p>
              {escopo === "video" ? (
                <p>
                  {alvo.w} × {alvo.h} · {fps} FPS
                </p>
              ) : null}
              <p>Tamanho estimado: ~{formatarBytes(bytesEstimados)}</p>
            </div>
          </div>

          {/* ---------- coluna direita ---------- */}
          <div className="overflow-y-auto">
            {resultado ? (
              <div className="space-y-4 p-5 text-sm">
                <div className="flex items-center gap-2 text-emerald-400">
                  <CheckCircle2 className="h-5 w-5" /> Exportação concluída
                </div>
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-xs text-white/70">
                  <p className="mb-1 font-medium text-white">{resultado.nome}</p>
                  <p>
                    {resultado.largura} × {resultado.altura} · {resultado.fps} FPS · {formatarTempo(resultado.duracaoMs)}
                  </p>
                  <p>{formatarBytes(resultado.bytes)}</p>
                  {resultado.caminho ? (
                    <p className="mt-1 break-all text-[10px] text-white/40">{resultado.caminho}</p>
                  ) : null}
                </div>
                {resultado.metricas ? (
                  <details className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-[11px] text-white/60">
                    <summary className="cursor-pointer text-white/80">
                      Desempenho: {(resultado.duracaoMs / 1000 / Math.max(0.001, resultado.metricas.totalMs / 1000)).toFixed(2)}× tempo real ·{" "}
                      {(resultado.metricas.framesEnviados / Math.max(0.001, resultado.metricas.totalMs / 1000)).toFixed(0)} FPS ·{" "}
                      {resultado.metricas.encoder}
                      {resultado.metricas.aceleracao ? " (hardware)" : " (CPU)"}
                    </summary>
                    <pre className="mt-2 max-h-52 overflow-auto whitespace-pre-wrap text-[10px] leading-relaxed text-white/55">
                      {resultado.relatorio}
                    </pre>
                    <button
                      onClick={() => navigator.clipboard?.writeText(resultado.relatorio ?? "")}
                      className="mt-2 text-[10px] text-[#F26B1F] hover:underline"
                    >
                      Copiar medição
                    </button>
                  </details>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  {resultado.caminho ? (
                    <>
                      <Button
                        size="sm"
                        className="bg-[#F26B1F] hover:bg-[#d95c14]"
                        onClick={() => onAbrirArquivo?.(resultado.caminho!)}
                      >
                        <Play className="mr-1.5 h-3.5 w-3.5" /> Abrir arquivo
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        className="bg-white/10 hover:bg-white/20"
                        onClick={() => onRevelarArquivo?.(resultado.caminho!)}
                      >
                        <FolderOpen className="mr-1.5 h-3.5 w-3.5" />
                        {navigator.platform.toLowerCase().includes("mac") ? "Mostrar no Finder" : "Mostrar na pasta"}
                      </Button>
                    </>
                  ) : resultado.url ? (
                    <>
                      <Button size="sm" className="bg-[#F26B1F] hover:bg-[#d95c14]" asChild>
                        <a href={resultado.url} download={resultado.nome}>
                          <Download className="mr-1.5 h-3.5 w-3.5" /> Baixar
                        </a>
                      </Button>
                      <Button size="sm" variant="secondary" className="bg-white/10 hover:bg-white/20" asChild>
                        <a href={resultado.url} target="_blank" rel="noreferrer">
                          Abrir
                        </a>
                      </Button>
                    </>
                  ) : null}
                  <Button size="sm" variant="ghost" onClick={onLimparResultado}>
                    Exportar outra versão
                  </Button>
                </div>
              </div>
            ) : emAndamento ? (
              <div className="space-y-4 p-5 text-sm">
                <div className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-[#F26B1F]" /> {progresso.fase || "Exportando…"}
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full bg-[#F26B1F] transition-all" style={{ width: `${Math.min(100, progresso.pct)}%` }} />
                </div>
                <p className="text-xs text-white/55">
                  {progresso.totalFrames > 0
                    ? `Frame ${progresso.frame.toLocaleString("pt-BR")} / ${progresso.totalFrames.toLocaleString("pt-BR")} · ${Math.round(progresso.pct)}%`
                    : "Processando áudio"}
                  {progresso.etaS > 0 ? ` · restam ~${formatarTempo(progresso.etaS * 1000)}` : ""}
                </p>
                <p className="text-[11px] text-white/35">
                  {desktop
                    ? "O render acontece localmente pelo FFmpeg. Você pode continuar usando o app — não é preciso deixar esta tela aberta."
                    : "A renderização acontece em tempo real no navegador — mantenha esta aba aberta."}
                </p>
                <Button size="sm" variant="ghost" className="text-red-400 hover:bg-red-500/10" onClick={onCancelar}>
                  Cancelar exportação
                </Button>
              </div>
            ) : (
              <div className="space-y-4 p-5">
                <div className="flex gap-1 rounded-lg bg-white/5 p-1 text-xs">
                  {(["video", "audio"] as const).map((e) => (
                    <button
                      key={e}
                      onClick={() => setEscopo(e)}
                      className={`flex-1 rounded-md py-1.5 transition ${
                        escopo === e ? "bg-[#F26B1F] text-white" : "text-white/60 hover:text-white"
                      }`}
                    >
                      {e === "video" ? "VÍDEO" : "ÁUDIO"}
                    </button>
                  ))}
                </div>

                <Campo label="Nome">
                  <input
                    value={nome}
                    onChange={(e) => setNome(e.target.value)}
                    className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs outline-none focus:border-[#F26B1F]/60"
                  />
                </Campo>

                {desktop ? (
                  <Campo label="Salvar em">
                    <button
                      onClick={onEscolherPasta}
                      className="flex w-full items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-left text-xs hover:border-[#F26B1F]/60"
                    >
                      <Folder className="h-3.5 w-3.5 shrink-0 text-[#F26B1F]" />
                      <span className="truncate text-white/80">{pastaDestino || "Escolher pasta…"}</span>
                    </button>
                    <p className="mt-1 text-[10px] text-white/35">O app lembra a última pasta usada.</p>
                  </Campo>
                ) : null}

                {escopo === "video" ? (
                  <>
                    <Campo label="Formato">
                      <Select
                        value={codecEscolhido?.mime.startsWith("video/mp4") ? "mp4" : "webm"}
                        onChange={() => {}}
                        disabled
                        opcoes={[
                          { v: "mp4", l: "MP4" },
                          { v: "webm", l: "WebM" },
                        ]}
                      />
                      <p className="mt-1 text-[10px] text-white/35">
                        {desktop ? "Render local com FFmpeg." : "Definido pelo codec suportado por este navegador."}
                      </p>
                    </Campo>

                    <div className="grid grid-cols-2 gap-3">
                      <Campo label="Resolução">
                        <Select
                          value={String(alturaAlvo)}
                          onChange={(v) => setAlturaAlvo(Number(v))}
                          opcoes={escalas.map((s) => {
                            const d = dims(s);
                            const nomes: Record<number, string> = {
                              720: "720p HD",
                              1080: "1080p Full HD",
                              1440: "1440p 2K",
                              2160: "2160p 4K",
                            };
                            return { v: String(s), l: `${nomes[s]} (${d.w}×${d.h})` };
                          })}
                        />
                      </Campo>

                      <Campo label="Taxa de quadros">
                        <Select
                          value={String(fps)}
                          onChange={(v) => setFps(Number(v))}
                          opcoes={[
                            { v: String(fpsProjeto), l: `Original — ${fpsProjeto} FPS` },
                            ...[24, 25, 30, 50, 60]
                              .filter((f) => f !== fpsProjeto)
                              .map((f) => ({ v: String(f), l: `${f} FPS` })),
                          ]}
                        />
                      </Campo>
                    </div>

                    <Campo label="Qualidade x velocidade">
                      <div className="flex gap-1.5">
                        {QUALIDADES.map((q) => (
                          <button
                            key={q.id}
                            onClick={() => {
                              setQualidade(q.id);
                              setBitrateManual(null);
                            }}
                            className={`flex-1 rounded-lg border px-2 py-1.5 text-[11px] transition ${
                              qualidade === q.id
                                ? "border-[#F26B1F] bg-[#F26B1F]/15 text-white"
                                : "border-white/10 text-white/60 hover:bg-white/5"
                            }`}
                          >
                            {q.nome}
                          </button>
                        ))}
                      </div>
                      <p className="mt-1.5 text-[10px] leading-snug text-white/40">{presetInfo.dica}</p>
                    </Campo>

                    <Campo label="Codec">
                      <Select
                        value={codecEscolhido?.id ?? ""}
                        onChange={setCodec}
                        opcoes={codecsVideo.map((c) => ({ v: c.id, l: c.nome }))}
                      />
                    </Campo>

                    <label className="flex cursor-pointer items-center gap-2 text-xs text-white/70">
                      <input
                        type="checkbox"
                        checked={comAudio}
                        onChange={(e) => setComAudio(e.target.checked)}
                        className="accent-[#F26B1F]"
                      />
                      Exportar áudio
                    </label>

                    <button onClick={() => setAvancado((v) => !v)} className="text-[11px] text-[#F26B1F] hover:underline">
                      {avancado ? "Ocultar avançado" : "Modo avançado (bitrate)"}
                    </button>
                    {avancado ? (
                      <Campo label={`Bitrate de vídeo — ${(bitrate / 1_000_000).toFixed(1)} Mbps`}>
                        <input
                          type="range"
                          min={1}
                          max={60}
                          step={1}
                          value={Math.round(bitrate / 1_000_000)}
                          onChange={(e) => setBitrateManual(Number(e.target.value) * 1_000_000)}
                          className="w-full accent-[#F26B1F]"
                        />
                      </Campo>
                    ) : null}
                  </>
                ) : (
                  <>
                    <Campo label="Formato">
                      <Select
                        value={audioEscolhido?.id ?? ""}
                        onChange={setAudioCodec}
                        opcoes={[...codecsAudio.map((c) => ({ v: c.id, l: c.nome })), { v: "wav", l: "WAV (PCM)" }]}
                      />
                    </Campo>
                    <Campo label="Qualidade">
                      <Select
                        value={String(audioBitrate)}
                        onChange={(v) => setAudioBitrate(Number(v))}
                        opcoes={[128, 192, 256, 320].map((b) => ({ v: String(b), l: `${b} kbps` }))}
                      />
                    </Campo>
                    <Campo label="Mixagem">
                      <Select
                        value={mixagem}
                        onChange={(v) => setMixagem(v as "completo" | "voz" | "musica")}
                        opcoes={[
                          { v: "completo", l: "Mix completo (respeita os volumes)" },
                          { v: "voz", l: "Somente voz" },
                          { v: "musica", l: "Somente música" },
                        ]}
                      />
                    </Campo>
                  </>
                )}

                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-[11px] text-white/60 md:hidden">
                  <p>Duração real: {formatarTempo(duracaoMs)}</p>
                  <p>Tamanho estimado: ~{formatarBytes(bytesEstimados)}</p>
                </div>

                <div className="flex justify-end gap-2 pt-1">
                  <Button size="sm" variant="ghost" onClick={onFechar}>
                    Cancelar
                  </Button>
                  <Button size="sm" className="bg-[#F26B1F] hover:bg-[#d95c14]" onClick={disparar}>
                    EXPORTAR
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-[11px] text-white/45">{label}</p>
      {children}
    </div>
  );
}

function Select({
  value,
  onChange,
  opcoes,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  opcoes: { v: string; l: string }[];
  disabled?: boolean;
}) {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs outline-none focus:border-[#F26B1F]/60 disabled:opacity-60"
    >
      {opcoes.map((o) => (
        <option key={o.v} value={o.v}>
          {o.l}
        </option>
      ))}
    </select>
  );
}
