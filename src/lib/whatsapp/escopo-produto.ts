/**
 * ESCOPO DE PRODUTO — trava determinística de roteamento.
 *
 * Paula e Bruno (Central de Especialistas) atendem SOMENTE passagem aérea
 * avulsa. Qualquer composição de produto (aéreo + hotel, pacote, hospedagem,
 * seguro, transfer, carro, cruzeiro, passeios) é COMERCIAL/CONSULTOR e fica
 * com a Camila (ou com o consultor que estiver atendendo).
 *
 * Esta regra não pode depender do prompt do LLM: ela vive aqui e é aplicada
 * no orquestrador (triagem, runner e tool de transferência).
 */

import { normalizarTexto } from "./triage.server";

/** Serviços que, sozinhos ou combinados com aéreo, tiram o caso da Central. */
const RX_OUTRO_PRODUTO =
  /\b(pacote?s?|hotel|hoteis|hospedagem|hospedar|pousada|resort|di[aá]ria|di[aá]rias|cruzeiro|navio|roteiro|excursao|all inclusive|passeio|passeios|city tour|ingresso|ingressos|disney|universal|beto carrero|seguro( viagem)?|transfer|traslado|translado|alug(ar|uel)|loca[cç][aã]o de carro|carro alugado|intercambio|viagem completa|viagem montada|tudo inclu[ií]d[oa])\b/i;

/** Expressões que explicitam combinação com aéreo. */
const RX_COMBINADO =
  /(a[eé]reo\s*(\+|e|com|mais)\s*hotel|hotel\s*(\+|e|com|mais)\s*a[eé]reo|voo\s*(\+|e|com|mais)\s*hotel|hotel\s*(\+|e|com|mais)\s*(voo|passagem)|passagem\s*(\+|e|com|mais)\s*hotel|hospedagem\s*(\+|e|com|mais)\s*(voo|a[eé]reo|passagem))/i;

/** Reforço de "somente aéreo": o cliente delimita o produto. */
const RX_SOMENTE_AEREO =
  /\b((so|somente|apenas)\s*(o\s*|a\s*)?(a[eé]reo|voo|voos|passagem|passagens|bilhete)|(a[eé]reo|voo|passagem)\s*(avulso|avulsa)|sem hotel|nao quero hotel|pode ser (so|somente) o (voo|a[eé]reo))\b/i;

/**
 * true quando a mensagem indica pacote / aéreo + hotel / qualquer outro
 * serviço além da passagem. Nesse caso a Central fica BLOQUEADA.
 */
export function contemProdutoCombinado(textoBruto: string | null | undefined): boolean {
  const t = normalizarTexto(textoBruto ?? "");
  if (!t) return false;
  if (RX_SOMENTE_AEREO.test(t) && !RX_COMBINADO.test(t)) return false;
  return RX_COMBINADO.test(t) || RX_OUTRO_PRODUTO.test(t);
}

/**
 * Trava final antes de qualquer transferência para Paula/Bruno.
 * Só libera quando o produto é claramente SOMENTE AÉREO.
 */
export function podeIrParaCentral(textoBruto: string | null | undefined): boolean {
  return !contemProdutoCombinado(textoBruto);
}

/* ── dúvida antes da coleta ───────────────────────────────────────────── */

/**
 * O cliente sinalizou que tem uma DÚVIDA (ou fez uma pergunta comercial).
 * Nesses casos o agente responde/entende primeiro e só depois coleta dados.
 */
const RX_ANUNCIA_DUVIDA =
  /\b(tirar? (uma|umas|algumas)? ?d[uú]vidas?|tenho (uma|umas|algumas)? ?d[uú]vidas?|queria (tirar|saber|entender|perguntar)|gostaria de (tirar|saber|entender|perguntar)|posso (fazer|tirar) uma pergunta|uma pergunta|preciso (saber|entender)|d[uú]vida)\b/i;

const RX_PERGUNTA_COMERCIAL =
  /\b(parcel\w*|boleto|cart[aã]o|pix|entrada|desconto|forma de pagamento|formas de pagamento|como funciona|voces? (tem|aceitam|trabalham)|documenta[cç][aã]o|passaporte|visto|bagagem|antecedencia|cancelamento|remarca\w*|reembols\w*|seguro|regra|condi[cç][oõ]es)\b/i;

export function ehDuvidaAntesDeColeta(textoBruto: string | null | undefined): boolean {
  const t = normalizarTexto(textoBruto ?? "");
  if (!t) return false;
  if (RX_ANUNCIA_DUVIDA.test(t)) return true;
  return /\?/.test(t) && RX_PERGUNTA_COMERCIAL.test(t);
}

/**
 * "Quero tirar uma dúvida" sem dizer qual: o agente precisa perguntar QUAL é
 * a dúvida — nunca começar coleta comercial.
 */
export function duvidaSemConteudo(textoBruto: string | null | undefined): boolean {
  const t = normalizarTexto(textoBruto ?? "");
  if (!t) return false;
  if (!RX_ANUNCIA_DUVIDA.test(t)) return false;
  return !RX_PERGUNTA_COMERCIAL.test(t);
}
