import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Copy, Download, Loader2, RefreshCw, Ticket } from "lucide-react";
import { toast } from "sonner";
import { passhubBilheteNumeros, passhubBilhetePdf } from "@/lib/passhub/passhub.functions";

/**
 * Mostra o número do bilhete (e-ticket) da reserva emitida. A consolidadora só
 * imprime esse número dentro do PDF, então o sistema lê o PDF automaticamente e
 * fica reconsultando enquanto a emissão não sai.
 */
export function BlocoBilhete({
  idPassagem,
  localizador,
  emitida,
}: {
  idPassagem: number;
  localizador?: string | null;
  emitida: boolean;
}) {
  const buscar = useServerFn(passhubBilheteNumeros);
  const baixar = useServerFn(passhubBilhetePdf);

  const bilhete = useQuery({
    queryKey: ["passhub-bilhete", idPassagem],
    queryFn: () => buscar({ data: { id: idPassagem, localizador: localizador ?? null } }),
    enabled: emitida,
    // enquanto a companhia não devolve o número, reconsultamos sozinho
    refetchInterval: (q) => (q.state.data && "encontrado" in q.state.data && q.state.data.encontrado ? false : 60_000),
  });

  const reler = useMutation({
    mutationFn: () => buscar({ data: { id: idPassagem, localizador: localizador ?? null, forcar: true } }),
    onSuccess: (res) => {
      if (!res.ok) return toast.error(res.erro);
      bilhete.refetch();
      toast[res.encontrado ? "success" : "info"](
        res.encontrado ? "Número do bilhete atualizado" : "A consolidadora ainda não imprimiu o número no PDF.",
      );
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao reler o bilhete"),
  });

  const pdf = useMutation({
    mutationFn: () => baixar({ data: { id: idPassagem } }),
    onSuccess: (res) => {
      if (!res.ok) return toast.error(res.erro);
      const bin = atob(res.base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
      const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `bilhete-${localizador || idPassagem}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao baixar o PDF"),
  });

  const dados = bilhete.data && bilhete.data.ok ? bilhete.data : null;
  const numeros = dados?.numeros ?? [];

  if (!emitida) return null;

  return (
    <div className="cons-box p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="cons-lab flex items-center gap-2">
          <Ticket className="h-4 w-4 text-[#77b8ff]" /> Bilhete emitido
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            className="cons-btn !px-2 !py-1"
            onClick={() => reler.mutate()}
            disabled={reler.isPending}
            title="Reler o PDF na consolidadora"
          >
            {reler.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
          </button>
          <button
            type="button"
            className="cons-btn !px-2 !py-1"
            onClick={() => pdf.mutate()}
            disabled={pdf.isPending}
            title="Baixar PDF do bilhete"
          >
            {pdf.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      </div>

      {bilhete.isLoading ? (
        <div className="flex items-center gap-2 text-[13px] cons-muted">
          <Loader2 className="h-4 w-4 animate-spin" /> Lendo o bilhete...
        </div>
      ) : numeros.length ? (
        <div className="space-y-2">
          {numeros.map((b) => (
            <div key={b.numero} className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="font-mono text-[16px] font-black tracking-wider">{b.numero}</div>
                {b.passageiro ? (
                  <div className="truncate text-[12px] cons-muted">{b.passageiro}</div>
                ) : null}
              </div>
              <button
                type="button"
                className="cons-btn !px-2 !py-1"
                onClick={() => {
                  navigator.clipboard.writeText(b.numero.replace(/\D/g, ""));
                  toast.success("Número copiado");
                }}
              >
                <Copy className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[13px] cons-muted">
          A consolidadora ainda não imprimiu o número do bilhete no PDF. Estamos reconsultando
          automaticamente a cada minuto.
        </p>
      )}
    </div>
  );
}
