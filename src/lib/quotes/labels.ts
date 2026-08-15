export const QUOTE_STATUS: { value: string; label: string; className: string }[] = [
  { value: "DRAFT", label: "Rascunho", className: "border-border bg-muted/40 text-muted-foreground" },
  { value: "IMPORTING", label: "Importando", className: "border-sky-500/40 bg-sky-500/10 text-sky-400" },
  { value: "READY", label: "Pronto", className: "border-emerald-500/40 bg-emerald-500/10 text-emerald-400" },
  { value: "SENT", label: "Enviado", className: "border-blue-500/40 bg-blue-500/10 text-blue-400" },
  { value: "VIEWED", label: "Visualizado", className: "border-indigo-500/40 bg-indigo-500/10 text-indigo-400" },
  { value: "INTERESTED", label: "Interessado", className: "border-amber-500/40 bg-amber-500/10 text-amber-400" },
  { value: "CONVERTED", label: "Convertido", className: "border-emerald-600/50 bg-emerald-600/15 text-emerald-300" },
  { value: "EXPIRED", label: "Expirado", className: "border-border bg-muted/40 text-muted-foreground" },
  { value: "CANCELLED", label: "Cancelado", className: "border-destructive/40 bg-destructive/10 text-destructive" },
  { value: "IMPORT_ERROR", label: "Erro na importação", className: "border-destructive/40 bg-destructive/10 text-destructive" },
];

export function quoteStatusBadge(status: string) {
  return (
    QUOTE_STATUS.find((s) => s.value === status) ?? {
      value: status,
      label: status,
      className: "border-border bg-muted/40 text-muted-foreground",
    }
  );
}

const SOURCES: Record<string, { label: string; className: string }> = {
  INFOTRAVEL: { label: "Infotravel", className: "border-sky-500/40 bg-sky-500/10 text-sky-300" },
  MANUAL: { label: "Manual", className: "border-border bg-muted/40 text-muted-foreground" },
  BRUNO: { label: "Bruno", className: "border-brand-orange/40 bg-brand-orange/10 text-brand-orange" },
  PAULA: { label: "Paula", className: "border-brand-orange/40 bg-brand-orange/10 text-brand-orange" },
  IMPORTADO: { label: "Importado", className: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" },
};

export function quoteSourceBadge(source: string) {
  return SOURCES[source] ?? { label: source, className: "border-border bg-muted/40 text-muted-foreground" };
}

/** Origem legível: operadora que veio pela URL (ex.: "FRT Infotravel") ou o agente do chatbot. */
const CHATBOT_AGENTS: Record<string, string> = { BRUNO: "Bruno", PAULA: "Paula", CAMILA: "Camila", GIOVANI: "Giovani" };

export function quoteOriginBadge(q: {
  source: string;
  source_company_code?: string | null;
  consultant?: string | null;
}) {
  const base = quoteSourceBadge(q.source);
  const code = (q.source_company_code ?? "").trim().toUpperCase();
  const agente = CHATBOT_AGENTS[q.source];

  if (agente) {
    return { ...base, label: `${agente} · Chatbot` };
  }
  if (code) {
    return { ...base, label: `${code} ${base.label}` };
  }
  return base;
}

/** Identificador do orçamento na operadora (ex.: "ID FRT 503428"). */
export function quoteExternalId(q: {
  source_company_code?: string | null;
  source_booking_id?: string | null;
}) {
  const id = (q.source_booking_id ?? "").trim();
  if (!id) return null;
  const code = (q.source_company_code ?? "").trim().toUpperCase();
  return { code, id, label: `ID ${[code, id].filter(Boolean).join(" ")}` };
}
