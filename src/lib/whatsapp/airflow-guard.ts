export const CENTRAL_PROMPT_VERSION = "central-especialistas-2026-08-02.3";

export function centralBriefHasMissingOrigin(brief: string | null | undefined): boolean {
  return /origem:\s*(?:n[aã]o informada|null)|origem[^\n]*n[aã]o foi informada/i.test(brief ?? "");
}

export function isInvalidMissingOriginResponse(text: string): boolean {
  return /(pacote\s+pronto|proposta\s+personalizada|saindo\s+(?:de|da|do|daí|dai)|aeroporto\s+mais\s+pr[oó]ximo|montar\s+voo|encaminh\w+\s+(?:ao|pro|para o)\s+comercial)/i.test(text);
}

/** Pergunta obrigatória quando não há nenhuma origem no histórico. */
const RX_PERGUNTA_ORIGEM = /de qual cidade (?:voc[eê] )?(?:vai |quer )?embarcar/i;

/**
 * Pergunta de confirmação quando existe origem recuperada do histórico.
 * O histórico SUGERE, o cliente CONFIRMA — só então a pesquisa é liberada.
 */
export function originConfirmQuestion(sugestao: string): string {
  return `Vai manter o embarque por ${sugestao} ou quer mudar a origem?`;
}

/** Aceita tanto a pergunta aberta quanto a confirmação da origem sugerida. */
export function isValidOriginQuestion(
  text: string,
  sugestao?: string | null,
): boolean {
  if (RX_PERGUNTA_ORIGEM.test(text)) return true;
  const s = (sugestao ?? "").trim();
  if (!s) return false;
  const esc = s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(
    `(manter|continua|segue|sai(?:r|ndo)?|embarq\\w*|permanece)[^\\n]{0,40}${esc}|${esc}[^\\n]{0,40}(ou (?:quer|prefere|vai)|mudar a origem|trocar a origem)`,
    "i",
  ).test(text);
}

export function safeMissingOriginResponse(
  clientName?: string | null,
  sugestao?: string | null,
): string {
  const first = (clientName ?? "").trim().split(/\s+/)[0];
  const greeting = first && /^[A-Za-zÀ-ÿ]{2,}$/.test(first) ? `Boa tarde, ${first}!\n\n` : "";
  const s = (sugestao ?? "").trim();
  return `${greeting}${s ? originConfirmQuestion(s) : "De qual cidade você vai embarcar?"}`;
}
