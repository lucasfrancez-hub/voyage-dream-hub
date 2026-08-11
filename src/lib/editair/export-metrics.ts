/* Instrumentação da exportação do EditAir.
   Mede, separadamente, cada etapa do pipeline para que a lentidão possa ser
   atribuída a uma causa concreta (seek/decode, desenho, leitura de pixels,
   IPC, encode) em vez de "está lento". */

export type MetricasExport = {
  /* contexto */
  duracaoMs: number;
  largura: number;
  altura: number;
  fps: number;
  totalFrames: number;
  encoder?: string;
  aceleracao?: boolean;
  preset?: string;

  /* etapas (ms acumulados) */
  preparacaoMs: number;
  seekMs: number;
  desenhoMs: number;
  leituraMs: number;
  ipcMs: number;
  esperaEncodeMs: number;
  audioMs: number;
  muxMs: number;
  totalMs: number;

  /* contadores */
  seeks: number;
  seeksEvitados: number;
  framesEnviados: number;
  framesRepetidos: number;
  bytesEnviados: number;
};

export function metricasVazias(base: Partial<MetricasExport> = {}): MetricasExport {
  return {
    duracaoMs: 0,
    largura: 0,
    altura: 0,
    fps: 30,
    totalFrames: 0,
    preparacaoMs: 0,
    seekMs: 0,
    desenhoMs: 0,
    leituraMs: 0,
    ipcMs: 0,
    esperaEncodeMs: 0,
    audioMs: 0,
    muxMs: 0,
    totalMs: 0,
    seeks: 0,
    seeksEvitados: 0,
    framesEnviados: 0,
    framesRepetidos: 0,
    bytesEnviados: 0,
    ...base,
  };
}

const s = (ms: number) => `${(ms / 1000).toFixed(1)}s`;
const pc = (parte: number, total: number) => (total > 0 ? ` (${Math.round((parte / total) * 100)}%)` : "");

/** relatório legível — o mesmo texto vai para a UI e para a área de transferência */
export function relatorioExport(m: MetricasExport): string {
  const totalS = m.totalMs / 1000;
  const velocidade = totalS > 0 ? m.duracaoMs / 1000 / totalS : 0;
  const fpsEfetivo = totalS > 0 ? m.framesEnviados / totalS : 0;
  const linhas = [
    "EXPORTAÇÃO — MEDIÇÃO DO PIPELINE",
    `duração do projeto: ${(m.duracaoMs / 1000).toFixed(1)}s`,
    `resolução: ${m.largura}x${m.altura}`,
    `FPS: ${m.fps}`,
    `total de frames: ${m.totalFrames}`,
    "",
    `preparação: ${s(m.preparacaoMs)}`,
    `seek/decode das mídias: ${s(m.seekMs)}${pc(m.seekMs, m.totalMs)}`,
    `desenho no canvas: ${s(m.desenhoMs)}${pc(m.desenhoMs, m.totalMs)}`,
    `leitura de pixels (getImageData): ${s(m.leituraMs)}${pc(m.leituraMs, m.totalMs)}`,
    `IPC + espera do encoder: ${s(m.ipcMs)}${pc(m.ipcMs, m.totalMs)}`,
    `áudio (mixagem no FFmpeg): ${s(m.audioMs)}`,
    `mux final: ${s(m.muxMs)}`,
    "",
    `tempo total: ${s(m.totalMs)}`,
    `velocidade: ${velocidade.toFixed(2)}x tempo real`,
    `FPS efetivo de exportação: ${fpsEfetivo.toFixed(1)}`,
    "",
    `seeks realizados: ${m.seeks}`,
    `seeks evitados (mesmo quadro de origem): ${m.seeksEvitados}`,
    `frames enviados: ${m.framesEnviados} (repetidos sem IPC: ${m.framesRepetidos})`,
    `bytes transferidos por IPC: ${(m.bytesEnviados / 1024 / 1024 / 1024).toFixed(2)} GB`,
    `encoder: ${m.encoder ?? "?"} · aceleração por hardware: ${m.aceleracao ? "SIM" : "NÃO"}`,
    `preset: ${m.preset ?? "-"}`,
  ];
  return linhas.join("\n");
}

/** média móvel exponencial de ms/frame — ETA que estabiliza em vez de oscilar */
export class EstimadorETA {
  private media = 0;
  private amostras = 0;
  private ultimo = 0;

  iniciar(agora = performance.now()) {
    this.ultimo = agora;
    this.media = 0;
    this.amostras = 0;
  }

  /** registra a conclusão de um frame e devolve o ETA em segundos */
  frame(restantes: number, agora = performance.now()): number {
    const dt = agora - this.ultimo;
    this.ultimo = agora;
    this.amostras += 1;
    // peso alto no início (converge rápido), depois suaviza
    const alfa = this.amostras <= 5 ? 0.5 : 0.06;
    this.media = this.media === 0 ? dt : this.media * (1 - alfa) + dt * alfa;
    // nos primeiros frames a medição é ruidosa: só mostra ETA depois de 8 frames
    if (this.amostras < 8) return 0;
    return (this.media * restantes) / 1000;
  }

  get msPorFrame() {
    return this.media;
  }
}
