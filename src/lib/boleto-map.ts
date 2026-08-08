import type { BoletoDocData } from "@/lib/boleto-html";

/** Converte um recebimento salvo (tabela asaas_recebimentos) no documento do boleto VIA AIR. */
export function recebimentoParaBoleto(row: any): BoletoDocData {
  const raw = row?.raw_response ?? {};
  const pay = raw?.payment ?? raw ?? {};
  const comp = row?.composicao ?? {};
  return {
    documentoRef: pay?.id ?? row?.id?.slice(0, 8)?.toUpperCase() ?? null,
    vencimento: row?.due_date ?? null,
    valor: Number(row?.value ?? 0),
    pagador: {
      nome: row?.customer_name ?? "",
      cpfCnpj: row?.customer_cpf_cnpj ?? null,
      telefone: row?.customer_phone ?? null,
      email: row?.customer_email ?? null,
      endereco: comp?.endereco ?? null,
    },
    composicao: {
      servico: comp?.servico ?? row?.description ?? null,
      destino: comp?.destino ?? null,
      periodo:
        comp?.periodo ??
        [comp?.periodoInicio, comp?.periodoFim]
          .filter(Boolean)
          .map((d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("pt-BR"))
          .join(" • ") ??
        null,
      passageiro: Array.isArray(comp?.passageiros)
        ? comp.passageiros.filter(Boolean).join(", ")
        : (comp?.passageiros ?? comp?.passageiro ?? null),
    },
    pix: { qrImage: row?.pix_qr_image ?? null, payload: row?.pix_payload ?? null },
    banco: {
      nome: pay?.bank?.name ?? "ASAAS IP S.A.",
      codigo: pay?.bank?.code ?? "461-0",
      linhaDigitavel: row?.identification_field ?? null,
      nossoNumero: pay?.nossoNumero ?? raw?.identificationField?.nossoNumero ?? null,
      dataDocumento: row?.created_at ?? null,
      dataProcessamento: row?.created_at ?? null,
      carteira: pay?.carteira ?? null,
      especie: pay?.especie ?? null,
      aceite: pay?.aceite ?? null,
      agenciaCodigo:
        raw?.conta?.agenciaCodigo ??
        pay?.agenciaCodigo ??
        (raw?.conta?.agencia
          ? [raw.conta.agencia, raw.conta.conta].filter(Boolean).join(" / ")
          : null),
    },
    multaPercent: row?.fine_percent != null ? Number(row.fine_percent) : null,
    jurosPercentMes: row?.interest_percent != null ? Number(row.interest_percent) : null,
    descontoValor: Number(pay?.discount?.value ?? 0),
  };
}
