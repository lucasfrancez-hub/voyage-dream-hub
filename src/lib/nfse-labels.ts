// Short display label for a prestador (NFS-e provider).
// Explicit overrides per CNPJ keep the badge short and unambiguous even when
// two providers share the same nome_fantasia.
const OVERRIDES: Record<string, string> = {
  "56339877000166": "VIR",         // VIA AIR AGENCIA E REPRESENTACOES LTDA
  "47430791000153": "LRF TRAVEL",  // LRF TRAVEL SERVICES LTDA
};

const SUFFIXES = new Set([
  "LTDA", "LTDA.", "S/A", "SA", "S.A.", "S.A", "ME", "EPP", "EIRELI",
  "AGENCIA", "AGÊNCIA", "AGENCIAS", "AGÊNCIAS",
  "REPRESENTACOES", "REPRESENTAÇÕES", "REPRESENTACAO", "REPRESENTAÇÃO",
  "SERVICES", "SERVICOS", "SERVIÇOS", "SERVICO", "SERVIÇO",
  "COMERCIO", "COMÉRCIO", "INDUSTRIA", "INDÚSTRIA",
  "DE", "DA", "DO", "DAS", "DOS", "E",
]);

export function prestadorShortLabel(p: {
  cnpj?: string | null;
  nome_fantasia?: string | null;
  razao_social?: string | null;
} | null | undefined): string {
  if (!p) return "";
  const digits = (p.cnpj || "").replace(/\D/g, "");
  if (digits && OVERRIDES[digits]) return OVERRIDES[digits];
  const source = (p.razao_social || p.nome_fantasia || "").trim();
  if (!source) return "";
  const tokens = source.toUpperCase().split(/\s+/).filter(Boolean);
  const meaningful = tokens.filter((t) => !SUFFIXES.has(t));
  const pick = meaningful.slice(0, 2);
  return (pick.length ? pick : tokens.slice(0, 2)).join(" ");
}

