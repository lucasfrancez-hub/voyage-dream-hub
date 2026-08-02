export const CENTRAL_PROMPT_VERSION = "central-especialistas-2026-08-02.2";

export function centralBriefHasMissingOrigin(brief: string | null | undefined): boolean {
  return /origem:\s*(?:n[aã]o informada|null)|origem[^\n]*n[aã]o foi informada/i.test(brief ?? "");
}

export function isInvalidMissingOriginResponse(text: string): boolean {
  return /(pacote\s+pronto|proposta\s+personalizada|saindo\s+(?:de|da|do|daí|dai)|aeroporto\s+mais\s+pr[oó]ximo|montar\s+voo|encaminh\w+\s+(?:ao|pro|para o)\s+comercial)/i.test(text);
}

export function safeMissingOriginResponse(clientName?: string | null): string {
  const first = (clientName ?? "").trim().split(/\s+/)[0];
  const greeting = first && /^[A-Za-zÀ-ÿ]{2,}$/.test(first) ? `Boa tarde, ${first}!\n\n` : "";
  return `${greeting}De qual cidade você vai embarcar?`;
}