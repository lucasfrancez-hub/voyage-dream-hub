/**
 * REFERÊNCIA EXPLÍCITA A ATENDIMENTO ANTERIOR
 *
 * Regra do briefing: nada de protocolo encerrado entra sozinho no prompt.
 * O histórico antigo só é carregado quando o próprio cliente puxa o assunto
 * ("da outra vez", "a cotação que vocês mandaram", "o comercial não me
 * respondeu") ou quando ele responde/cita uma mensagem antiga.
 *
 * Puro — sem I/O, testável.
 */

const RX_REFERENCIA_ANTERIOR = new RegExp(
  [
    "\\b(da|na|daquela|naquela)\\s+(outra\\s+)?vez\\b",
    "\\banteriorment\\w*\\b",
    "\\bantes\\s+(eu|voc[eê]s|a gente)\\b",
    "\\b(a|aquela|minha|nossa)\\s+cota[çc][aã]o\\b",
    "\\bcota[çc][aã]o\\s+(anterior|passada|de ontem|que (voc[eê]s )?(me )?(mandaram|enviaram))\\b",
    "\\b(o|a)\\s+(or[çc]amento|proposta)\\s+(anterior|passad\\w+|que (voc[eê]s )?(me )?(mandaram|enviaram))\\b",
    "\\b(protocolo|atendimento|conversa)\\s+(anterior|passad\\w+|de ontem|da semana passada)\\b",
    "\\bvoltei\\b",
    "\\bretomando\\b",
    "\\bcontinuando\\b",
    "\\b(voc[eê]s|o comercial|a equipe|ningu[eé]m)\\s+(n[aã]o\\s+)?(me\\s+)?(retorn\\w+|respond\\w+|entr\\w+ em contato|deu retorno)\\b",
    "\\b(ficou|ficaram) de (me )?(retornar|responder|mandar|enviar)\\b",
    "\\b(meu|o)\\s+pedido\\b",
    "\\blocalizador\\b",
    "\\bminha\\s+reserva\\b",
    "\\bja\\s+falei\\b",
    "\\bj[aá]\\s+(falei|conversei|pedi|passei)\\b",
    "\\bmesma\\s+(cota[çc][aã]o|viagem|pesquisa)\\b",
  ].join("|"),
  "i",
);

/** true quando o cliente referencia expressamente algo de antes do protocolo atual. */
export function mentionsPreviousAttendance(text: string | null | undefined): boolean {
  const t = (text ?? "").trim();
  if (!t) return false;
  return RX_REFERENCIA_ANTERIOR.test(t);
}

/** Decide se o bloco de histórico anterior pode ser injetado no prompt. */
export function shouldLoadPreviousContext(params: {
  lastCustomerText?: string | null;
  hasQuotedOldMessage?: boolean;
}): boolean {
  if (params.hasQuotedOldMessage) return true;
  return mentionsPreviousAttendance(params.lastCustomerText);
}
