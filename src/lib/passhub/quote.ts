/**
 * Converte a seleção do motor PassHub no formato de voo da cesta de orçamento
 * (o mesmo usado pelo motor OnerTravel), para gerar UM orçamento com várias
 * opções de voo.
 */
import type { PassHubVoo } from "@/lib/passhub/types";
import type { QuoteFlight } from "@/lib/quote-flight";

/** "2026-10-10T08:35" a partir do que a PassHub devolve. */
function iso(valor: string | null | undefined): string | null {
  if (!valor) return null;
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) return valor;
  const p2 = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}`;
}

export function passhubToQuoteFlight(
  voo: PassHubVoo,
  direction: "OUTBOUND" | "INBOUND" | null = null,
  total: number | null = null,
): QuoteFlight {
  const bagagem = voo.bagagemDespachada
    ? `${voo.bagagemDespachadaQtd || 1} bagagem(ns) despachada(s)`
    : "Somente bagagem de mão";
  return {
    direction,
    airline: voo.companhia || voo.companhiaIata || null,
    fromIata: voo.origem || null,
    toIata: voo.destino || null,
    departure: iso(voo.partida),
    arrival: iso(voo.chegada),
    duration: voo.duracao || null,
    stops: voo.paradas ?? 0,
    total,
    segments: [
      {
        airline: voo.companhia || null,
        airlineIata: voo.companhiaIata || null,
        flightNumber: `${voo.companhiaIata ?? ""} ${voo.numeroVoo ?? ""}`.trim() || null,
        fromIata: voo.origem || null,
        toIata: voo.destino || null,
        departure: iso(voo.partida),
        arrival: iso(voo.chegada),
        cabin: voo.classe || voo.familiaTarifaria || null,
        baggage: bagagem,
      },
    ],
  };
}

/** Linhas de resumo (viram "itens inclusos" da opção no orçamento). */
export function passhubResumoLinhas(voo: PassHubVoo, rotulo: string): string[] {
  const escalas =
    voo.paradas > 0 ? `${voo.paradas} parada(s)${voo.escala ? ` • ${voo.escala}` : ""}` : "Voo direto";
  return [
    `${rotulo}: ${voo.origem} → ${voo.destino} • ${voo.companhia}${voo.numeroVoo ? ` ${voo.numeroVoo}` : ""}`,
    `${rotulo}: ${voo.duracao} • ${escalas}`,
    `${rotulo}: ${voo.bagagemDespachada ? `${voo.bagagemDespachadaQtd || 1} bagagem despachada` : "Somente bagagem de mão"}${voo.familiaTarifaria ? ` • ${voo.familiaTarifaria}` : ""}`,
  ];
}
