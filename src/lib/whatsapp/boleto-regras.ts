/**
 * REGRAS COMERCIAIS DE BOLETO / PARCELAMENTO — fonte única de verdade.
 * Usado nos prompts das consultoras (Camila & time) e da Central de
 * Especialistas (Paula/Bruno). Nunca duplicar essas regras em outro lugar.
 */

/** Antecedência mínima da viagem para oferecer parcelamento no boleto. */
export const BOLETO_ANTECEDENCIA_MINIMA_DIAS = 60;
/** Prazo máximo de quitação total no modelo pré-pago (somente aéreo). */
export const BOLETO_QUITACAO_AEREO_DIAS_ANTES = 30;

export type ProdutoBoleto = "somente_aereo" | "hotel_mais_aereo" | "indefinido";

export type ElegibilidadeBoleto = {
  elegivel: boolean;
  modalidade: "pre_pago" | "pre_pago_ou_pos_viagem" | "nenhuma";
  parcelasPosViagem: boolean;
  exigeAnaliseCredito: boolean;
  quitarAteDiasAntes: number | null;
  motivo: string;
};

/**
 * Avalia a elegibilidade de boleto parcelado.
 * `antecedenciaDias` = dias entre hoje e a data de embarque.
 */
export function avaliarBoleto(
  produto: ProdutoBoleto,
  antecedenciaDias: number | null | undefined,
): ElegibilidadeBoleto {
  if (typeof antecedenciaDias === "number" && antecedenciaDias < BOLETO_ANTECEDENCIA_MINIMA_DIAS) {
    return {
      elegivel: false,
      modalidade: "nenhuma",
      parcelasPosViagem: false,
      exigeAnaliseCredito: false,
      quitarAteDiasAntes: null,
      motivo: `Viagem com menos de ${BOLETO_ANTECEDENCIA_MINIMA_DIAS} dias de antecedência — não oferecer parcelamento no boleto.`,
    };
  }

  if (produto === "somente_aereo") {
    return {
      elegivel: true,
      modalidade: "pre_pago",
      parcelasPosViagem: false,
      exigeAnaliseCredito: false,
      quitarAteDiasAntes: BOLETO_QUITACAO_AEREO_DIAS_ANTES,
      motivo: `Somente aéreo é exclusivamente pré-pago: quitação total até ${BOLETO_QUITACAO_AEREO_DIAS_ANTES} dias antes da viagem. Nunca existe parcela após a viagem.`,
    };
  }

  if (produto === "hotel_mais_aereo") {
    return {
      elegivel: true,
      modalidade: "pre_pago_ou_pos_viagem",
      parcelasPosViagem: true,
      exigeAnaliseCredito: true,
      quitarAteDiasAntes: null,
      motivo:
        "Hotel + aéreo é pacote: pode ser pré-pago ou o cliente pode SOLICITAR parcelas vencendo depois da viagem, sujeito a análise de crédito. Aprovação nunca é automática.",
    };
  }

  return {
    elegivel: true,
    modalidade: "nenhuma",
    parcelasPosViagem: false,
    exigeAnaliseCredito: false,
    quitarAteDiasAntes: null,
    motivo:
      "Produto ainda não definido — explicar as duas possibilidades e perguntar se é somente aéreo ou hotel + aéreo.",
  };
}

/** Bloco de prompt com as regras de boleto (texto injetado nas IAs). */
export const REGRAS_BOLETO_PROMPT = `
# 💳 BOLETO E PARCELAMENTO (regra comercial obrigatória — nunca deduzir, nunca inventar)
- ANTECEDÊNCIA MÍNIMA: só existe parcelamento no boleto se a viagem tiver ${BOLETO_ANTECEDENCIA_MINIMA_DIAS} dias ou mais de antecedência. Menos que isso → não oferecer boleto parcelado. Valide isso ANTES de dizer que existe boleto.
- Boleto é FORMA DE PAGAMENTO. Ter boleto NÃO significa poder viajar devendo parcelas. São coisas diferentes:
  • PRÉ-PAGO = tudo quitado antes da viagem
  • PÓS-VIAGEM = parcelas continuam depois da viagem (só pacote hotel + aéreo, com análise de crédito)
- SOMENTE AÉREO → exclusivamente PRÉ-PAGO: mínimo ${BOLETO_ANTECEDENCIA_MINIMA_DIAS} dias de antecedência, todas as parcelas quitadas antes da viagem e quitação total até ${BOLETO_QUITACAO_AEREO_DIAS_ANTES} dias antes do embarque. NÃO existe boleto pós-viagem para somente aéreo.
- HOTEL + AÉREO (mínimo) = pacote para essa regra. Duas opções: (1) pré-pago; (2) SOLICITAR parcelas vencendo depois da viagem — exige análise de crédito, aprovação NÃO é automática.
- "Posso viajar devendo parcelas?" → NUNCA responda só "sim". Descubra o produto primeiro:
  • somente aéreo: "No caso de somente passagem aérea, o boleto é pré-pago. A viagem precisa ter pelo menos ${BOLETO_ANTECEDENCIA_MINIMA_DIAS} dias de antecedência e o valor precisa estar totalmente quitado até ${BOLETO_QUITACAO_AEREO_DIAS_ANTES} dias antes da viagem."
  • hotel + aéreo: "Para pacote com pelo menos hotel + aéreo, existe a possibilidade de viajar ainda com parcelas a vencer depois da viagem. Nesse caso, a condição passa por análise de crédito e precisa ser aprovada."
  • ainda não informou: "Temos as duas possibilidades, mas depende do que você pretende contratar. Se for somente aéreo, o boleto é pré-pago e precisa estar quitado até ${BOLETO_QUITACAO_AEREO_DIAS_ANTES} dias antes da viagem. Para pacote com hotel + aéreo, podemos verificar, mediante análise de crédito, a possibilidade de parcelas continuarem depois da viagem." — e só então pergunte se é somente aéreo ou hotel + aéreo
- 🚫 PROIBIDO dizer "você pode comprar somente o aéreo e continuar pagando depois da viagem".
- 🚫 PROIBIDO dizer que hotel + aéreo permite pagar depois da viagem automaticamente. O certo: "permite SOLICITAR essa modalidade, sujeita à análise de crédito".
- 🚫 PROIBIDO garantir aprovação da análise de crédito, prometer prazo de resposta ou citar limite/valor aprovado.
- Cliente em atendimento de SOMENTE AÉREO que pedir "quero continuar pagando depois da viagem": explique que somente aéreo não permite, que essa modalidade existe para pacote com hotel + aéreo mediante análise de crédito. Se ele disser que quer ver com hotel, a intenção virou PACOTE → o atendimento volta para a consultora/Comercial com todo o contexto preservado.
`.trim();
