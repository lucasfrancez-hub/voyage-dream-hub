/**
 * Parcelamento vigente do Motor de Pacotes.
 *
 * Lê a tabela `installment_rules` (mesma fonte do admin) e devolve o limite
 * de parcelas sem juros vigente hoje, além dos textos exibidos no resumo do
 * pacote e nos cards de voo. Quando a campanha tem data de término, o texto
 * avisa qual será o limite depois dela.
 */
import { useQuery } from "@tanstack/react-query";
import {
  DEFAULT_MAX_INSTALLMENTS,
  findRule,
  installmentRulesQuery,
} from "@/lib/packages/installment-rules";

/** Fornecedor padrão do motor (pacotes dinâmicos FRT/CompreFácil). */
export const FORNECEDOR_MOTOR = "FRT CompreFácil";

export type ParcelamentoPacote = {
  /** Máximo de parcelas sem juros vigente hoje. */
  max: number;
  /** Texto curto usado nos cards (voo/hotel). */
  curto: string;
  /** Texto completo usado no resumo do pacote. */
  completo: string;
};

export function useParcelamentoPacote(fornecedor = FORNECEDOR_MOTOR): ParcelamentoPacote {
  const { data: regras } = useQuery(installmentRulesQuery);
  const regra = findRule(regras, { supplierName: fornecedor, source: fornecedor });
  const max = regra?.max_installments ?? DEFAULT_MAX_INSTALLMENTS;
  const boletoMax = regra?.boleto_financiado_max ?? max;

  const curto = `Em até ${max}x sem juros no cartão`;

  const completo =
    regra?.boleto_financiado_enabled === false
      ? `Em até ${max}x sem juros no cartão de crédito.`
      : `Em até ${max}x sem juros no cartão de crédito ou boleto bancário.`;


  return { max, curto, completo };
}
