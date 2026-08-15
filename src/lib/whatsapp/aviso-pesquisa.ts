/**
 * AVISO ANTES DA PESQUISA.
 *
 * Ninguém some por 1 minuto e volta com três cards do nada. Antes de rodar o
 * motor de busca, o especialista responde como gente: "Claro! Já vou verificar
 * aqui pra vc". Variações pra não parecer robô, e um regex pra não repetir o
 * aviso na mesma pesquisa.
 */
const AVISOS = [
  "Claro! Já vou verificar aqui pra vc",
  "Perfeito, deixa comigo — já vou pesquisar aqui",
  "Show, já vou dar uma olhada aqui nas melhores opções",
  "Claro, já tô verificando aqui pra vc",
  "Boa! Já vou consultar aqui e te trago as opções",
  "Certo, deixa que eu já verifico aqui pra vc",
];

const COMPLEMENTOS = [
  "É rapidinho, só um minutinho",
  "Me dá só um instante",
  "Já te trago as melhores tarifas",
  "Já volto com as opções",
];

/**
 * Reconhece QUALQUER promessa de pesquisa já enviada — inclusive as que o
 * próprio modelo escreve com outras palavras ("já estou vendo", "volto com as
 * opções"). Sem isso o cliente recebia o aviso duas vezes.
 */
export const AVISO_PESQUISA_RE =
  /(j[áa] (vou|estou|tô|to) ?(ver|vendo|verificar|verificando|pesquisar|pesquisando|consultar|consultando|olhar|olhando|checar|checando|dar uma olhada)|j[áa] (verifico|pesquiso|checo|olho) aqui|deixa comigo|volto com (as|essas|umas)? ?(melhores )?op[çc]|j[áa] volto com|te trago as op[çc]|separando as op[çc]|vou dar uma olhada)/i;

const pick = <T,>(l: readonly T[]) => l[Math.floor(Math.random() * l.length)];

/** Monta o aviso em 1 balão curto (jeito humano de escrever no WhatsApp). */
export function montarAvisoPesquisa(nome?: string | null): string {
  const voc = nome ? `${nome}, ` : "";
  const abre = pick(AVISOS);
  const texto = voc ? `${voc}${abre.charAt(0).toLowerCase()}${abre.slice(1)}` : abre;
  return `${texto}. ${pick(COMPLEMENTOS)}`;
}
