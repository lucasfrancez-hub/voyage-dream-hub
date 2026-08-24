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

const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

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

  const partes = [
    `Em até ${max}x sem juros no cartão de crédito`,
    regra?.boleto_financiado_enabled === false
      ? null
      : `${boletoMax}x sem juros no boleto bancário`,
  ].filter(Boolean);

  let completo = partes.join(" e ") + ".";
  if (regra?.valid_until && max > DEFAULT_MAX_INSTALLMENTS) {
    completo += ` Condição válida até ${ddmm(regra.valid_until)} — depois passa para ${DEFAULT_MAX_INSTALLMENTS}x sem juros.`;
  }

  return { max, curto, completo };
}
