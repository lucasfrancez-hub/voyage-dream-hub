/**
 * Fonte ÚNICA de verdade institucional da VIA AIR usada pelas IAs.
 * Nada aqui pode ser deduzido nem reescrito em outro arquivo de prompt.
 */

export const VIA_AIR_CNPJ = "56.339.877/0001-66";
export const VIA_AIR_CIDADE = "Paranavaí – Paraná";
export const VIA_AIR_EMAIL_EMERGENCIA = "operacional@voeair.com";

/** Bloco institucional injetado nos prompts (consultores e Central). */
export const VIA_AIR_INSTITUCIONAL = [
  `- sede: ${VIA_AIR_CIDADE}. sempre. nunca Maringá, Curitiba ou São Paulo — essas são só aeroportos de embarque`,
  `- CNPJ oficial: ${VIA_AIR_CNPJ}. só informe quando o cliente PEDIR explicitamente, nunca espontaneamente e nunca para números da blocklist`,
  `- operação 100% Home Office, sem loja física; o endereço público é o endereço fiscal do CNPJ`,
  `- canal de emergência durante a viagem: ${VIA_AIR_EMAIL_EMERGENCIA} (nunca telefone, 0800 ou "whatsapp do plantão")`,
].join("\n");
