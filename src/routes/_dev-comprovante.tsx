import { createFileRoute } from "@tanstack/react-router";
import { ComprovanteReceipt } from "@/components/financial/ComprovanteReceipt";

export const Route = createFileRoute("/_dev-comprovante")({
  component: () => (
    <ComprovanteReceipt
      open
      onOpenChange={() => {}}
      data={{
        valor: 7,
        favorecido: "LRF TRAVEL SERVICES LTDA",
        direction: "in",
        instituicao: "BANCO BRADESCO S.A.",
        chavePix: "47430791000153",
        cpfCnpj: "47430791000153",
        tipo: "Pix recebido",
        formaPagamento: "Pix",
        dataVencimento: "2026-08-07",
        dataPagamento: "2026-08-07T20:58:19",
        dataHora: "07/08/2026 20:58",
        transacaoId: "E60746948202608072358C0083siLp6w",
        descricao: "Pagamento de reserva",
        concluido: true,
      }}
    />
  ),
});
