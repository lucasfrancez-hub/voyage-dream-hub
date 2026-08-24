/**
 * Agrupamento das categorias de serviços adicionais.
 *
 * A operadora devolve dezenas de variações ("Transfer IN", "Transfer OUT",
 * "Transfer IN/OUT", "Serviço", "Excursão"...). Aqui unificamos tudo em poucos
 * blocos claros para o cliente.
 */

export const GRUPOS_SERVICO = [
  "Transfer ida e volta",
  "Transfer (ida ou volta)",
  "Seguro viagem",
  "Ingressos",
  "Passeios e excursões",
  "Outros serviços",
] as const;

export type GrupoServico = (typeof GRUPOS_SERVICO)[number];

const semAcento = (v: string) =>
  v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export function grupoServico(s: { categoria?: string | null; titulo?: string | null }): GrupoServico {
  const t = semAcento(`${s.categoria ?? ""} ${s.titulo ?? ""}`);

  if (/\bseguro\b|assistencia de viagem|assistencia viagem/.test(t)) return "Seguro viagem";
  if (/ingresso|ticket|entrada para|park hopper/.test(t)) return "Ingressos";

  if (/transfer|traslado|transla/.test(t)) {
    const idaEVolta =
      /ida e volta|in\s*\/?\s*out|in\s*e\s*out|out\s*\/?\s*in|round\s*trip|\bio\b|regular io/.test(t) ||
      (/\bin\b/.test(t) && /\bout\b/.test(t)) ||
      (/chegada/.test(t) && /(saida|partida|retorno)/.test(t));
    return idaEVolta ? "Transfer ida e volta" : "Transfer (ida ou volta)";
  }

  if (/passeio|excursao|city tour|\btour\b|visita/.test(t)) return "Passeios e excursões";
  return "Outros serviços";
}
