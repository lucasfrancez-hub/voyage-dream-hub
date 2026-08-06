export const CENTRAL_PROMPT_VERSION = "central-especialistas-2026-08-03.1";

export function centralBriefHasMissingOrigin(brief: string | null | undefined): boolean {
  return /origem:\s*(?:n[aã]o informada|null)|origem[^\n]*n[aã]o foi informada/i.test(brief ?? "");
}

export function isInvalidMissingOriginResponse(text: string): boolean {
  return /(pacote\s+pronto|proposta\s+personalizada|saindo\s+(?:de|da|do|daí|dai)|aeroporto\s+mais\s+pr[oó]ximo|montar\s+voo|encaminh\w+\s+(?:ao|pro|para o)\s+comercial)/i.test(text);
}

/** Pergunta obrigatória quando não há nenhuma origem no histórico. */
const RX_PERGUNTA_ORIGEM = /de qual cidade (?:voc[eê] )?(?:vai |quer |pretende )?embarcar/i;

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
    `(manter|mant[eé]m|continua|permanece|segue)[^\\n]{0,40}${esc}|${esc}[^\\n]{0,40}(ou (?:quer|prefere|vai|deseja)|mudar a origem|trocar a origem)`,
    "i",
  ).test(text);
}

/** Saudação conforme a hora de São Paulo (Bom dia / Boa tarde / Boa noite). */
export function saudacaoPorHora(date = new Date()): string {
  const h = Number(
    new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo",
      hour: "2-digit",
      hour12: false,
    }).format(date),
  );
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

/**
 * O cliente pediu EXPLICITAMENTE para repetir os dados do atendimento anterior
 * ("mantém igual da última vez", "mesma origem de sempre", "igual ao anterior").
 * Só nesse caso a origem de um protocolo antigo pode ser reaproveitada.
 */
export function pediuMesmosDadosDaUltimaVez(text: string | null | undefined): boolean {
  const t = (text ?? "").toLowerCase();
  if (!t.trim()) return false;
  return /(mesm[ao]s?|igual|como|do jeito|iguais)\s+(coisa\s+)?(d[aoe]|que\s+d[aoe]|à|a)?\s*(?:na\s+)?(última|ultima|outra)\s+(vez|cota[cç][aã]o|pesquisa|viagem)|igual\s+(?:ao|a)\s+(anterior|último|ultimo|última|ultima)|mant[eé]m?\s+(?:tudo\s+)?igual|mesma\s+origem\s+(?:de\s+)?(sempre|antes|anterior)|repete\s+a\s+(?:mesma\s+)?(pesquisa|cota[cç][aã]o)/i.test(
    t,
  );
}

/**
 * A pergunta de origem NUNCA pode ser repetida depois que o cliente respondeu.
 *
 * Se já perguntamos a origem neste protocolo e chegou qualquer mensagem do
 * cliente depois disso, o guarda de segurança precisa sair do caminho — a
 * resposta do modelo (que enxerga o histórico) vale mais do que repetir a
 * pergunta e a saudação, que é exatamente o bug que o cliente reclamou.
 */
export function origemJaFoiRespondidaNoProtocolo(params: {
  outbound: Array<{ content: string | null; created_at: string }>;
  inbound: Array<{ content: string | null; created_at: string }>;
  sugestao?: string | null;
}): boolean {
  const perguntas = params.outbound
    .filter((m) => isValidOriginQuestion(String(m.content ?? ""), params.sugestao ?? null))
    .map((m) => new Date(m.created_at).getTime())
    .sort((a, b) => a - b);
  if (!perguntas.length) return false;
  const primeira = perguntas[0]!;
  return params.inbound.some(
    (m) => new Date(m.created_at).getTime() > primeira && String(m.content ?? "").trim().length > 0,
  );
}

/** Já mandamos alguma coisa neste protocolo? Então não saúda de novo. */
export function safeMissingOriginResponse(
  clientName?: string | null,
  sugestao?: string | null,
  opts?: { semSaudacao?: boolean },
): string {
  const first = (clientName ?? "").trim().split(/\s+/)[0];
  const greeting =
    !opts?.semSaudacao && first && /^[A-Za-zÀ-ÿ]{2,}$/.test(first)
      ? `${saudacaoPorHora()}, ${first}!\n\n`
      : "";
  const s = (sugestao ?? "").trim();
  return `${greeting}${s ? originConfirmQuestion(s) : "De qual cidade você pretende embarcar?"}`;
}

