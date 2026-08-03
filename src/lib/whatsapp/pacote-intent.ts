/**
 * INTENÇÃO DE PACOTE — detector determinístico.
 *
 * Paula e Bruno são exclusivos do aéreo. Qualquer sinal de pacote precisa sair
 * do fluxo aéreo e ir para os CONSULTORES (não pro Comercial). O modelo tem a
 * tool, mas a detecção aqui garante o roteamento mesmo quando ele hesita.
 */

const PADROES: RegExp[] = [
  /\bpacote?s?\b/i,
  /\bop[çc][õo]es? completas?\b/i,
  /\bviagem (montada|completa|fechada)\b/i,
  /\btudo inclu[íi]d[oa]\b/i,
  /\bcom hotel\b/i,
  /\ba[ée]reo\s*\+\s*hotel\b/i,
  /\bconhecer outros destinos\b/i,
  /\bpromo[çc][ãa]o de viagem\b/i,
];

/** Frases que citam "pacote" sem pedir pacote (ex.: bagagem/tarifa). */
const FALSOS_POSITIVOS: RegExp[] = [
  /pacote de dados/i,
  /pacote de milhas/i,
];

export function detectarInteressePacote(texto: string | null | undefined): boolean {
  const t = (texto ?? "").trim();
  if (t.length < 2) return false;
  if (FALSOS_POSITIVOS.some((re) => re.test(t))) return false;
  return PADROES.some((re) => re.test(t));
}
