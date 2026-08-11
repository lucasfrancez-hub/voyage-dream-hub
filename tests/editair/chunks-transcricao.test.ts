import { describe, it, expect } from "vitest";
import { montarLegendas, janelasDaTimeline, projetarPalavras } from "@/lib/editair/legendas";
import { limitarVelocidade } from "@/lib/editair/velocidade";
import { transformPadrao, type EditairClip, type ProjectState, type Transcript, type TranscriptWord } from "@/lib/editair/types";

/**
 * O chunk (bloco enviado ao transcritor) é SÓ unidade de processamento.
 * Aqui simulamos exatamente o que o app faz: fatiar o áudio, transcrever cada
 * fatia e somar o `offsetMs` da fatia nos tempos que voltam do modelo.
 * Nenhum tempo de legenda pode encostar na fronteira do chunk.
 */
const CHUNK = 10_000;

/** fatia as palavras em chunks de 10s e devolve os tempos já com offset (como o serverFn faz) */
function transcreverEmChunks(palavras: TranscriptWord[], totalMs = 30_000): TranscriptWord[] {
  const saida: TranscriptWord[] = [];
  for (let ini = 0; ini < totalMs; ini += CHUNK) {
    const fim = Math.min(totalMs, ini + CHUNK);
    // o modelo enxerga só a fatia: tempos relativos ao início dela
    const relativas = palavras
      .filter((w) => w.start >= ini && w.start < fim)
      .map((w) => ({ ...w, start: w.start - ini, end: w.end - ini }));
    // e o servidor devolve somando offsetMs = ini
    saida.push(...relativas.map((w) => ({ ...w, start: w.start + ini, end: w.end + ini })));
  }
  return saida;
}

const audio = (speed: number, start = 0): EditairClip => ({
  id: "cAud",
  trackId: "t-video",
  kind: "audio",
  assetId: "aud30",
  start,
  duration: 30_000 / limitarVelocidade(speed),
  sourceIn: 0,
  volume: 1,
  speed,
  transform: transformPadrao(),
});

const projeto = (clips: EditairClip[]): ProjectState => ({
  version: 1,
  tracks: [
    { id: "t-video", kind: "video", name: "Vídeo" },
    { id: "t-caption", kind: "caption", name: "Legendas" },
  ],
  clips,
  durationMs: 60_000,
  captionStyle: { fontSize: 48, y: 80, color: "#fff", activeColor: "#F26B1F", uppercase: false } as never,
  width: 1080,
  height: 1920,
  fps: 30,
});

const naTimeline = (tFonte: number, speed: number, start = 0) =>
  start + tFonte / limitarVelocidade(speed);

const VELOCIDADES = [0.5, 1, 1.7, 2, 6];

describe("chunk de 10s é só processamento, nunca timing de legenda", () => {
  // fala inteira dentro do chunk 0–10s
  const dentroDoChunk: TranscriptWord[] = [
    { w: "Olá", start: 8_000, end: 8_400, assetId: "aud30" },
    { w: "pessoal", start: 8_450, end: 9_200, assetId: "aud30" },
  ];

  // frase que atravessa a fronteira 10s (9,4s → 11,2s), sem pausa nem pontuação
  const atravessando: TranscriptWord[] = [
    { w: "esse", start: 9_400, end: 9_700, assetId: "aud30" },
    { w: "voo", start: 9_760, end: 10_100, assetId: "aud30" },
    { w: "sai", start: 10_160, end: 10_500, assetId: "aud30" },
    { w: "de", start: 10_540, end: 10_700, assetId: "aud30" },
    { w: "Maringá", start: 10_760, end: 11_200, assetId: "aud30" },
  ];

  it("1x: palavra em 8,0s dentro do chunk 0–10 vira legenda em 8,0s (não em 10s)", () => {
    const t: Transcript = { words: transcreverEmChunks(dentroDoChunk), segments: [] };
    expect(t.words[0].start).toBe(8_000); // o offset do chunk devolveu o tempo absoluto

    const st = projeto([audio(1)]);
    const [p] = projetarPalavras(t.words, janelasDaTimeline(st));
    expect(p.start).toBe(8_000);

    const [leg] = montarLegendas(st, t);
    expect(leg.start).toBe(7_940); // 8.000 − leadIn visual de 60ms
    expect(leg.start).not.toBe(10_000);
    expect(leg.start + leg.duration).toBeLessThan(10_000);
  });

  it("frase 9,4s → 11,2s não é quebrada na fronteira do chunk", () => {
    const t: Transcript = { words: transcreverEmChunks(atravessando), segments: [] };
    // as palavras dos dois chunks voltam contínuas e em ordem
    expect(t.words.map((w) => w.start)).toEqual([9_400, 9_760, 10_160, 10_540, 10_760]);

    const st = projeto([audio(1)]);
    const legs = montarLegendas(st, t);
    expect(legs).toHaveLength(1); // um único bloco, atravessando o 10s
    expect(legs[0].text).toBe("esse voo sai de Maringá");
    expect(legs[0].start).toBe(9_340); // 9.400 − leadIn
    expect(legs[0].start + legs[0].duration).toBe(11_320); // 11.200 + leadOut
    // nenhuma legenda começa ou termina em cima da fronteira
    for (const l of legs) {
      expect(l.start).not.toBe(10_000);
      expect(l.start + l.duration).not.toBe(10_000);
    }
  });

  for (const speed of VELOCIDADES) {
    const s = limitarVelocidade(speed);
    const nota = s !== speed ? ` (limitado a ${s}x pelo máximo do editor)` : "";

    it(`${speed}x${nota}: timestamps projetados pela timeline, não pelo chunk`, () => {
      const t: Transcript = {
        words: transcreverEmChunks([...dentroDoChunk, ...atravessando]),
        segments: [],
      };
      const st = projeto([audio(speed, 16_000)]);
      const proj = projetarPalavras(t.words, janelasDaTimeline(st));

      expect(proj.map((p) => p.start)).toEqual(
        [8_000, 8_450, 9_400, 9_760, 10_160, 10_540, 10_760].map((ms) =>
          Math.round(naTimeline(ms, speed, 16_000)),
        ),
      );

      // a fronteira do chunk (10s da fonte) não é marco de nada na timeline
      const fronteira = naTimeline(CHUNK, speed, 16_000);
      for (const p of proj) expect(p.start).not.toBe(fronteira);

      // e a frase continua inteira em qualquer velocidade (em velocidades altas
      // ela pode até se juntar à fala anterior — o que nunca acontece é quebrar no 10s)
      const legs = montarLegendas(st, t);
      const frase = legs.find((l) => l.text.includes("Maringá"))!;
      expect(frase.text).toContain("esse voo sai de Maringá");
      // o bloco começa nas próprias palavras (com o leadIn visual), não na fronteira
      const primeira = frase.words![0]!;
      expect(frase.start).toBeGreaterThanOrEqual(primeira.start - 60);
      expect(frase.start).toBeLessThanOrEqual(primeira.start);
      for (const l of legs) {
        expect(l.start).not.toBe(fronteira);
        expect(l.start + l.duration).not.toBe(fronteira);
      }

    });
  }
});
