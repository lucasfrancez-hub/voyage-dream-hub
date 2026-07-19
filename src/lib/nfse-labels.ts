// Short display label for a prestador (NFS-e provider).
// Derived from razao_social so distinct CNPJs are visually distinguishable
// even when they share the same nome_fantasia (e.g. "VIA AIR").
const SUFFIXES = new Set([
  "LTDA", "LTDA.", "S/A", "SA", "S.A.", "S.A", "ME", "EPP", "EIRELI",
  "AGENCIA", "AGÊNCIA", "AGENCIAS", "AGÊNCIAS",
  "REPRESENTACOES", "REPRESENTAÇÕES", "REPRESENTACAO", "REPRESENTAÇÃO",
  "SERVICES", "SERVICOS", "SERVIÇOS", "SERVICO", "SERVIÇO",
  "COMERCIO", "COMÉRCIO", "INDUSTRIA", "INDÚSTRIA",
  "DE", "DA", "DO", "DAS", "DOS", "E",
]);

export function prestadorShortLabel(p: {
  nome_fantasia?: string | null;
  razao_social?: string | null;
} | null | undefined): string {
  if (!p) return "";
  const source = (p.razao_social || p.nome_fantasia || "").trim();
  if (!source) return "";
  const tokens = source.toUpperCase().split(/\s+/).filter(Boolean);
  const meaningful = tokens.filter((t) => !SUFFIXES.has(t));
  const pick = meaningful.slice(0, 2);
  return (pick.length ? pick : tokens.slice(0, 2)).join(" ");
}
