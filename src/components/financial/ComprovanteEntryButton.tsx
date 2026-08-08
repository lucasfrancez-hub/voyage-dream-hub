import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { comprovanteDoLancamento } from "@/lib/comprovantes.functions";
import { ComprovanteActions } from "./ComprovanteActions";

/** Botão de comprovante para um lançamento financeiro já pago via ASAAS. */
export function ComprovanteEntryButton({ entryId }: { entryId: string }) {
  const buscar = useServerFn(comprovanteDoLancamento);
  const { data } = useQuery({
    queryKey: ["comprovante-lancamento", entryId],
    queryFn: () => buscar({ data: { entryId } }),
    staleTime: 5 * 60 * 1000,
  });

  if (!data?.transferId && !data?.billId) return null;

  return (
    <ComprovanteActions
      transferId={data.transferId ?? undefined}
      billId={data.billId ?? undefined}
      compact
    />
  );
}

export default ComprovanteEntryButton;
