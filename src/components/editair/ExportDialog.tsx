import { useMemo, useState } from "react";
import { X, Download, Loader2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatarTempo } from "@/lib/editair/types";

export type CodecOpcao = { id: string; nome: string; mime: string };
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
};

export type ProgressoExport = { pct: number; frame: number; totalFrames: number; etaS: number } | null;
export type ResultadoExport = {
  url: string;
  nome: string;
  bytes: number;
  largura: number;
  altura: number;
  fps: number;
  duracaoMs: number;
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

const QUALIDADES = [
  { id: "baixa", nome: "Baixa", fator: 0.04 },
  { id: "recomendada", nome: "Recomendada", fator: 0.09 },
  { id: "alta", nome: "Alta", fator: 0.15 },
  { id: "maxima", nome: "Máxima", fator: 0.24 },
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
  onExportar,
  onCancelar,
  onLimparResultado,
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
  onExportar: (cfg: ExportConfig) => void;
  onCancelar: () => void;
  onLimparResultado: () => void;
}) {
  const [escopo, setEscopo] = useState<"video" | "audio">("video");
  const [nome, setNome] = useState(nomeProjeto);
  const [alturaAlvo, setAlturaAlvo] = useState(1080);
  const [fps, setFps] = useState(fpsProjeto);
  const [qualidade, setQualidade] = useState("alta");
  const [codec, setCodec] = useState<string>("");
  const [comAudio, setComAudio] = useState(true);
  const [avancado, setAvancado] = useState(false);
  const [bitrateManual, setBitrateManual] = useState<number | null>(null);
  const [mixagem, setMixagem] = useState<"completo" | "voz" | "musica">("completo");
  const [audioCodec, setAudioCodec] = useState<string>("");
  const [audioBitrate, setAudioBitrate] = useState(192);

  const codecsVideo = useMemo(() => CODECS_VIDEO.filter((c) => suportado(c.mime)), []);
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
  const fator = QUALIDADES.find((q) => q.id === qualidade)?.fator ?? 0.12;
  const bitrate =
    bitrateManual ?? Math.round(alvo.w * alvo.h * fps * fator * 0.07);
  const bytesEstimados =
    escopo === "video"
      ? ((bitrate + audioBitrate * 1000) * (duracaoMs / 1000)) / 8
      : ((audioBitrate * 1000) * (duracaoMs / 1000)) / 8;

  if (!aberto) return null;

  const emAndamento = !!progresso;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="max-h-[92vh] w-full max-w-[520px] overflow-y-auto rounded-2xl border border-white/10 bg-[#12171d] shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <h2 className="text-sm font-semibold">Exportar</h2>
          <button onClick={onFechar} className="rounded p-1 text-white/50 hover:bg-white/10 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>

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
              <p>{(resultado.bytes / 1024 / 1024).toFixed(1)} MB</p>
            </div>
            <div className="flex flex-wrap gap-2">
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
              <Button size="sm" variant="ghost" onClick={onLimparResultado}>
                Exportar outra versão
              </Button>
            </div>
          </div>
        ) : emAndamento ? (
          <div className="space-y-4 p-5 text-sm">
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-[#F26B1F]" /> Exportando…
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-white/10">
              <div className="h-full bg-[#F26B1F] transition-all" style={{ width: `${progresso.pct}%` }} />
            </div>
            <p className="text-xs text-white/55">
              {progresso.totalFrames > 0
                ? `Renderizando frame ${progresso.frame.toLocaleString("pt-BR")} / ${progresso.totalFrames.toLocaleString("pt-BR")}`
                : "Processando áudio"}
              {" · "}
              Tempo restante: ~{Math.max(0, Math.round(progresso.etaS))}s
            </p>
            <p className="text-[11px] text-white/35">
              A renderização acontece em tempo real no navegador — mantenha esta aba aberta.
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
                    Definido pelo codec suportado por este navegador. MOV: em breve.
                  </p>
                </Campo>

                <Campo label="Resolução">
                  <Select
                    value={String(alturaAlvo)}
                    onChange={(v) => setAlturaAlvo(Number(v))}
                    opcoes={escalas.map((s) => {
                      const d = dims(s);
                      const nomes: Record<number, string> = {
                        720: "720p — HD",
                        1080: "1080p — Full HD",
                        1440: "1440p — 2K/QHD",
                        2160: "2160p — 4K UHD",
                      };
                      return { v: String(s), l: `${nomes[s]} (${d.w} × ${d.h})` };
                    })}
                  />
                </Campo>

                <Campo label="Taxa de quadros">
                  <Select
                    value={String(fps)}
                    onChange={(v) => setFps(Number(v))}
                    opcoes={[
                      { v: String(fpsProjeto), l: `Original — ${fpsProjeto} FPS` },
                      ...[24, 25, 30, 50, 60].filter((f) => f !== fpsProjeto).map((f) => ({ v: String(f), l: `${f} FPS` })),
                    ]}
                  />
                  <p className="mt-1 text-[10px] text-white/35">
                    A composição é renderizada na taxa escolhida — não há interpolação de frames inventados.
                  </p>
                </Campo>

                <Campo label="Qualidade">
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
                </Campo>

                <Campo label="Codec">
                  <Select
                    value={codecEscolhido?.id ?? ""}
                    onChange={setCodec}
                    opcoes={codecsVideo.map((c) => ({ v: c.id, l: c.nome }))}
                  />
                  {codecsVideo.length < CODECS_VIDEO.length ? (
                    <p className="mt-1 text-[10px] text-white/35">
                      Só aparecem codecs que este navegador consegue renderizar de verdade.
                    </p>
                  ) : null}
                </Campo>

                <label className="flex cursor-pointer items-center gap-2 text-xs text-white/70">
                  <input type="checkbox" checked={comAudio} onChange={(e) => setComAudio(e.target.checked)} className="accent-[#F26B1F]" />
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
                  <p className="mt-1 text-[10px] text-white/35">MP3: em breve (sem codificador nativo no navegador).</p>
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

            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-[11px] text-white/60">
              <p>Duração: {formatarTempo(duracaoMs)}</p>
              {escopo === "video" ? (
                <p>
                  Resolução: {alvo.w} × {alvo.h} · {fps} FPS
                </p>
              ) : null}
              <p>Tamanho estimado: ~{(bytesEstimados / 1024 / 1024).toFixed(0)} MB</p>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button size="sm" variant="ghost" onClick={onFechar}>
                Cancelar
              </Button>
              <Button
                size="sm"
                className="bg-[#F26B1F] hover:bg-[#d95c14]"
                onClick={() =>
                  onExportar({
                    escopo,
                    nome: nome.trim() || "editair",
                    formato: escopo === "video" ? (codecEscolhido?.mime.includes("mp4") ? "mp4" : "webm") : audioCodec === "wav" ? "wav" : audioEscolhido?.mime.includes("mp4") ? "m4a" : "webm",
                    largura: alvo.w,
                    altura: alvo.h,
                    fps,
                    bitrate,
                    mime: escopo === "video" ? (codecEscolhido?.mime ?? "video/webm") : audioCodec === "wav" ? "wav" : (audioEscolhido?.mime ?? "audio/webm"),
                    comAudio,
                    mixagem,
                    audioBitrate,
                    audioFormato: audioCodec || audioEscolhido?.id || "opus",
                  })
                }
              >
                EXPORTAR
              </Button>
            </div>
          </div>
        )}
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
