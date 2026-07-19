// Short display label + visual tone for a prestador (NFS-e provider).
// Explicit overrides per CNPJ keep the badge short and unambiguous even when
// two providers share the same nome_fantasia.
type Tone = "brand" | "muted";

const OVERRIDES: Record<string, { label: string; tone: Tone }> = {
  "56339877000166": { label: "VIA AIR", tone: "brand" },   // VIA AIR AGENCIA E REPRESENTACOES LTDA
  "47430791000153": { label: "LRF TRAVEL", tone: "muted" }, // LRF TRAVEL SERVICES LTDA
};

const SUFFIXES = new Set([
  "LTDA", "LTDA.", "S/A", "SA", "S.A.", "S.A", "ME", "EPP", "EIRELI",
  "AGENCIA", "AGÊNCIA", "AGENCIAS", "AGÊNCIAS",
  "REPRESENTACOES", "REPRESENTAÇÕES", "REPRESENTACAO", "REPRESENTAÇÃO",
  "SERVICES", "SERVICOS", "SERVIÇOS", "SERVICO", "SERVIÇO",
  "COMERCIO", "COMÉRCIO", "INDUSTRIA", "INDÚSTRIA",
  "DE", "DA", "DO", "DAS", "DOS", "E",
]);

type PrestadorLike = {
  cnpj?: string | null;
  nome_fantasia?: string | null;
  razao_social?: string | null;
} | null | undefined;

export function prestadorShortLabel(p: PrestadorLike): string {
  if (!p) return "";
  const digits = (p.cnpj || "").replace(/\D/g, "");
  if (digits && OVERRIDES[digits]) return OVERRIDES[digits].label;
  const source = (p.razao_social || p.nome_fantasia || "").trim();
  if (!source) return "";
  const tokens = source.toUpperCase().split(/\s+/).filter(Boolean);
  const meaningful = tokens.filter((t) => !SUFFIXES.has(t));
  const pick = meaningful.slice(0, 2);
  return (pick.length ? pick : tokens.slice(0, 2)).join(" ");
}

export function prestadorTone(p: PrestadorLike): Tone {
  if (!p) return "brand";
  const digits = (p.cnpj || "").replace(/\D/g, "");
  if (digits && OVERRIDES[digits]) return OVERRIDES[digits].tone;
  return "brand";
}

export function prestadorBadgeClass(p: PrestadorLike): string {
  return prestadorTone(p) === "muted"
    ? "bg-muted/60 text-muted-foreground border-border"
    : "bg-brand-orange/10 text-brand-orange border-brand-orange/20";
}


