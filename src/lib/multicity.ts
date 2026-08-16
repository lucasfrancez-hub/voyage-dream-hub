/**
 * Multi-trecho VIA AIR — camada de orquestração.
 *
 * O cliente monta UMA viagem com vários trechos; por baixo, cada trecho é uma
 * pesquisa independente de somente ida (os fornecedores não têm MultiCity
 * nativo compatível). Nada aqui altera o comportamento de ida e volta / só ida.
 */

export const MAX_SEGMENTS = 6;
export const MIN_SEGMENTS = 2;

export type MultiSegmentInput = {
  id: string;
  origin: string;
  destination: string;
  date: string;
};

let seq = 0;
export function newSegment(partial: Partial<MultiSegmentInput> = {}): MultiSegmentInput {
  seq += 1;
  return {
    id: `t${Date.now().toString(36)}${seq}`,
    origin: "",
    destination: "",
    date: "",
    ...partial,
  };
}

/** Dois trechos vazios (regra: ao ativar, já nascem Trecho 1 e Trecho 2). */
export function initialSegments(seed?: {
  origin?: string;
  destination?: string;
  date?: string;
}): MultiSegmentInput[] {
  const first = newSegment({
    origin: seed?.origin ?? "",
    destination: seed?.destination ?? "",
    date: seed?.date ?? "",
  });
  // Preenchimento inteligente: destino do anterior vira origem do próximo.
  return [first, newSegment({ origin: first.destination })];
}

export function isSegmentComplete(s: MultiSegmentInput) {
  return s.origin.trim().length === 3 && s.destination.trim().length === 3 && !!s.date;
}

/** Erros de validação por trecho (rota + ordem cronológica). */
export function validateSegments(segments: MultiSegmentInput[]): Record<string, string> {
  const errors: Record<string, string> = {};
  let prevDate = "";
  segments.forEach((s, i) => {
    if (!isSegmentComplete(s)) {
      // Trecho incompleto bloqueia a busca, mas sem texto na tela (UI compacta).
      errors[s.id] = "";
    } else if (s.origin.trim().toUpperCase() === s.destination.trim().toUpperCase()) {

      errors[s.id] = "Origem e destino não podem ser iguais.";
    } else if (prevDate && s.date < prevDate) {
      errors[s.id] = `A data do Trecho ${i + 1} não pode ser anterior à do Trecho ${i}.`;
    }
    if (s.date && !errors[s.id]) prevDate = s.date;
  });
  return errors;
}

/** Serializa para a URL: GRU-MAD-2026-11-22_MAD-CDG-2026-11-26 */
export function encodeSegments(segments: MultiSegmentInput[]): string {
  return segments
    .filter(isSegmentComplete)
    .map((s) => `${s.origin.toUpperCase()}-${s.destination.toUpperCase()}-${s.date}`)
    .join("_");
}

export function decodeSegments(raw?: string | null): MultiSegmentInput[] | null {
  if (!raw) return null;
  const parts = raw
    .split("_")
    .map((chunk) => {
      const m = /^([A-Z]{3})-([A-Z]{3})-(\d{4}-\d{2}-\d{2})$/.exec(chunk.trim().toUpperCase());
      if (!m) return null;
      return newSegment({ origin: m[1], destination: m[2], date: m[3].toLowerCase() });
    })
    .filter((s): s is MultiSegmentInput => !!s)
    .slice(0, MAX_SEGMENTS);
  return parts.length >= MIN_SEGMENTS ? parts : null;
}

/**
 * PRÉ-SELEÇÃO DE VOO POR TRECHO (?ps=AD-1150_LA-0445).
 *
 * O link de uma promoção multi-trecho já nasce com o voo de cada trecho
 * escolhido — o cliente abre o motor e vê o carrinho pronto, sem precisar
 * selecionar ida e volta na mão.
 */
export type MultiPick = { airline: string | null; time: string | null };

export function encodePicks(picks: MultiPick[]): string {
  return picks
    .map((p) => `${(p.airline ?? "").toUpperCase()}-${(p.time ?? "").replace(":", "")}`)
    .join("_");
}

export function decodePicks(raw?: string | null): MultiPick[] | null {
  if (!raw) return null;
  const picks = raw
    .split("_")
    .slice(0, MAX_SEGMENTS)
    .map((chunk) => {
      const m = /^([A-Z0-9]{0,3})-(\d{0,4})$/.exec(chunk.trim().toUpperCase());
      if (!m) return { airline: null, time: null };
      return { airline: m[1] || null, time: m[2] ? `${m[2].slice(0, 2)}:${m[2].slice(2)}` : null };
    });
  return picks.some((p) => p.airline || p.time) ? picks : null;
}
