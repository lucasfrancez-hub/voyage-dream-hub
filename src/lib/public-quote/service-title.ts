/**
 * Normalização dos títulos de serviços/adicionais que chegam dos
 * fornecedores em formato bruto (ex.: "[Adicional] ADD LIANA").
 * O cliente final nunca deve ver código interno nem CAIXA ALTA crua.
 */

const PREFIXOS = /^\s*(\[[^\]]*\]|adicional\s*[-:]|add\b[:\-]?|extra\s*[-:]|serv\.?\s*[-:])\s*/i;

const DICIONARIO: Array<{ re: RegExp; label: string; icon: ServiceIcon }> = [
  { re: /\btransfer|traslad/i, label: "Transfer", icon: "transfer" },
  { re: /\bseguro|assist[êe]ncia\s+viagem/i, label: "Seguro viagem", icon: "insurance" },
  { re: /\bingresso|ticket\b|entrada\b/i, label: "Ingresso", icon: "ticket" },
  { re: /\bpasseio|tour\b|excurs/i, label: "Passeio", icon: "activity" },
  { re: /\bcarro|loca[çc][ãa]o|rent\s*a\s*car/i, label: "Aluguel de carro", icon: "car" },
  { re: /\bbagagem|baggage/i, label: "Bagagem adicional", icon: "service" },
  { re: /\bassento|seat\b/i, label: "Marcação de assento", icon: "service" },
  { re: /\btaxa|fee\b/i, label: "Taxa de serviço", icon: "tax" },
];

export type ServiceIcon =
  | "car" | "transfer" | "activity" | "ticket" | "insurance" | "service" | "tax";

const MINUSCULAS = new Set(["de", "da", "do", "das", "dos", "e", "em", "para", "com", "a", "o"]);

function titleCase(raw: string): string {
  return raw
    .toLowerCase()
    .split(/\s+/)
    .map((w, i) => {
      if (i > 0 && MINUSCULAS.has(w)) return w;
      if (/^[a-z]{2,3}$/.test(w) && /^(gru|gig|cgh|cnf|iata)$/.test(w)) return w.toUpperCase();
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join(" ");
}

export type NormalizedService = {
  title: string;
  icon: ServiceIcon;
  /** Código/rótulo original, mantido apenas como detalhe secundário. */
  reference: string | null;
};

/** Converte um título bruto de serviço em algo apresentável ao cliente. */
export function normalizeServiceTitle(raw: string | null | undefined): NormalizedService {
  const original = String(raw ?? "").trim();
  let limpo = original.replace(PREFIXOS, "").trim();
  limpo = limpo.replace(/\s{2,}/g, " ");

  const match = DICIONARIO.find((d) => d.re.test(limpo) || d.re.test(original));
  const ehSigla = /^[A-Z0-9\s._-]{2,}$/.test(limpo) && !/[a-z]/.test(limpo);

  if (match) {
    const detalhe = limpo.replace(match.re, "").replace(/^[\s\-•:]+/, "").trim();
    const titulo = detalhe && !ehSigla ? `${match.label} — ${titleCase(detalhe)}` : match.label;
    return { title: titulo, icon: match.icon, reference: ehSigla ? limpo : null };
  }

  if (!limpo) return { title: "Serviço adicional", icon: "service", reference: original || null };
  if (ehSigla) return { title: "Serviço adicional", icon: "service", reference: limpo };
  return { title: titleCase(limpo), icon: "service", reference: null };
}
