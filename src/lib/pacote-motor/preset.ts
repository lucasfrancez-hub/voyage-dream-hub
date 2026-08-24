import { ocupacaoPadrao, type OcupacaoQuarto } from "@/lib/pacote-motor/mapear";

/** Busca de pacote já preenchida (veio da URL do motor recolhível da página /pacotes). */
export type PacotePreset = {
  origem: string;
  destino: string;
  cidadeId: number | null;
  origemIata: string;
  destinoIata: string;
  ida: string;
  volta: string;
  quartos: OcupacaoQuarto[];
};

/** "2-0-0_1-1-0" → um bloco por quarto (adultos-crianças-bebês). */
export function encodeQuartos(quartos: OcupacaoQuarto[]): string {
  return quartos.map((q) => `${q.adultos}-${q.criancas}-${q.bebes}`).join("_");
}

export function decodeQuartos(valor?: string | null): OcupacaoQuarto[] {
  if (!valor) return [ocupacaoPadrao()];
  const lista = valor
    .split("_")
    .slice(0, 4)
    .map((bloco) => {
      const [a, c, b] = bloco.split("-").map((n) => Number(n));
      const criancas = Math.max(0, Math.min(6, Number.isFinite(c) ? c : 0));
      return {
        adultos: Math.max(1, Math.min(9, Number.isFinite(a) ? a : 1)),
        criancas,
        bebes: Math.max(0, Math.min(6, Number.isFinite(b) ? b : 0)),
        idades: Array.from({ length: criancas }, () => 7),
      } satisfies OcupacaoQuarto;
    })
    .filter(Boolean);
  return lista.length ? lista : [ocupacaoPadrao()];
}
