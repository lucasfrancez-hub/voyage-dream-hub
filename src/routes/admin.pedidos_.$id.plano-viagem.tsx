/**
 * Plano de viagem (comprovante aéreo) do pedido — mesmo layout do plano da
 * PassHub, com número de bilhete emitido e opção com/sem valores.
 */
import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Printer } from "lucide-react";
import { getOrderDetail } from "@/lib/orders.functions";
import { ComprovanteReserva } from "@/components/passhub/ComprovanteReserva";
import { pedidoParaComprovante, pedidoTemAereo } from "@/lib/orders/plano-viagem";

export const Route = createFileRoute("/admin/pedidos_/$id/plano-viagem")({
  component: PlanoViagemPedidoPage,
  head: () => ({
    meta: [
      { title: "Plano de viagem do pedido | VIA AIR" },
      {
        name: "description",
        content:
          "Plano de viagem aéreo do pedido VIA AIR com itinerário, passageiros, bilhetes emitidos e valores.",
      },
      { property: "og:title", content: "Plano de viagem do pedido | VIA AIR" },
      {
        property: "og:description",
        content: "Itinerário, passageiros e bilhetes do pedido aéreo VIA AIR.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
});

function PlanoViagemPedidoPage() {
  const { id } = Route.useParams();
  const [semValores, setSemValores] = useState(false);
  const detalheFn = useServerFn(getOrderDetail);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    setSemValores(p.get("valores") === "0");
  }, []);

  const { data, isLoading, error } = useQuery({
    queryKey: ["pedido-plano-viagem", id],
    queryFn: () => detalheFn({ data: { id } }),
  });

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center gap-2 text-sm">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando plano de viagem…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6 text-sm">
        {error instanceof Error ? error.message : "Pedido não encontrado."}
      </div>
    );
  }

  if (!pedidoTemAereo(data)) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6 text-sm">
        Este pedido não possui trechos aéreos ativos.
      </div>
    );
  }

  return (
    <div style={{ background: "#eef2f5", minHeight: "100vh", padding: "22px 0" }}>
      <div className="no-print mx-auto mb-4 flex w-[900px] max-w-[calc(100%-24px)] items-center justify-end gap-2">
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-black/10 bg-white px-3 py-2 text-[12px] font-bold text-slate-700 shadow-sm">
          <input
            type="checkbox"
            checked={semValores}
            onChange={(e) => setSemValores(e.target.checked)}
          />
          Sem valores
        </label>
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-[13px] font-bold text-primary-foreground shadow"
        >
          <Printer className="h-4 w-4" /> Imprimir / salvar PDF
        </button>
      </div>
      <ComprovanteReserva dados={pedidoParaComprovante(data, { ocultarValores: semValores })} />
    </div>
  );
}
