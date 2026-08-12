import { ComprovanteActions } from "./ComprovanteActions";
import { formaLabel, type PagamentoExterno } from "@/lib/pagamentos-externos.helpers";

const VIAAIR_DOC = "47430791000153";

function fmt(v: string | null) {
  if (!v) return null;
  const d = new Date(v.length <= 10 ? `${v}T12:00:00-03:00` : v);
  if (Number.isNaN(d.getTime())) return v;
  return d.toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

/** Comprovante VIA AIR gerado a partir de um pagamento feito em outro banco. */
export function ExternalReceiptButton({
  pagamento, compact = true,
}: {
  pagamento: PagamentoExterno;
  compact?: boolean;
}) {
  const p = pagamento;
  return (
    <ComprovanteActions
      compact={compact}
      receipt={{
        valor: Math.abs(Number(p.valor ?? 0)),
        favorecido: p.beneficiario_nome || "—",
        favorecidoLabel: "Beneficiário",
        direction: "out",
        instituicao: p.banco_nome,
        cpfCnpj: p.beneficiario_documento,
        descricao: p.descricao,
        tipo: `${formaLabel(p.forma_pagamento)} pago · ${p.banco_nome}`,
        dataHora: fmt(p.data_pagamento),
        transacaoId: p.autenticacao || p.id,
        status: "Pago",
        concluido: true,
        formaPagamento: formaLabel(p.forma_pagamento),
        dataVencimento: p.data_vencimento,
        dataPagamento: p.data_pagamento,
        tipoDocumento: p.forma_pagamento === "boleto" ? "boleto" : "pix",
        linhaDigitavel: p.linha_digitavel,
        codigoBarras: p.linha_digitavel,
        valorOriginal: p.valor_original,
        juros: p.juros,
        multa: p.multa,
        desconto: p.desconto,
        autenticacao: p.autenticacao,
        referenciaInterna: p.id,
        processadoPor: p.banco_nome,
        pagador: {
          nome: p.pagador_nome || "VIA AIR",
          cpfCnpj: p.pagador_documento || VIAAIR_DOC,
          instituicao: `${p.banco_nome}${p.conta_debito ? ` · ${p.conta_debito}` : ""}`,
        },
        recebedor: {
          nome: p.beneficiario_nome || "—",
          cpfCnpj: p.beneficiario_documento,
          instituicao: p.banco_nome,
        },
      }}
    />
  );
}

export default ExternalReceiptButton;
