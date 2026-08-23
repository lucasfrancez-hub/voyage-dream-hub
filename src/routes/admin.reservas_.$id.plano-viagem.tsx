/**
 * Plano de viagem (comprovante de reserva aérea) em página própria,
 * pronta para impressão / download em PDF.
 */
import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Printer } from "lucide-react";
import { passhubReservaDetalhe } from "@/lib/passhub/passhub.functions";
import { ComprovanteReserva } from "@/components/passhub/ComprovanteReserva";
import { paraComprovante } from "@/lib/passhub/comprovante";

export const Route = createFileRoute("/admin/reservas_/$id/plano-viagem")({
  component: PlanoViagemPage,
  head: () => ({
    meta: [
      { title: "Plano de viagem — Comprovante de reserva | VIA AIR" },
      {
        name: "description",
        content:
          "Comprovante de reserva aérea VIA AIR com itinerário completo, passageiros, bagagem e valores.",
      },
      { property: "og:title", content: "Plano de viagem — Comprovante de reserva | VIA AIR" },
      {
        property: "og:description",
        content: "Itinerário, passageiros e valores da reserva aérea VIA AIR.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
});

function PlanoViagemPage() {
  const { id } = Route.useParams();
  const [semValores, setSemValores] = useState(false);
  const detalheFn = useServerFn(passhubReservaDetalhe);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    setSemValores(p.get("valores") === "0");
  }, []);

  const { data, isLoading } = useQuery({
    queryKey: ["passhub-reserva-plano", id],
    queryFn: () => detalheFn({ data: { id: Number(id) } }),
  });

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center gap-2 text-sm">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando plano de viagem…
      </div>
    );
  }

  if (!data?.ok || !data.reserva) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6 text-sm">
        {(data && "erro" in data && data.erro) || "Reserva não encontrada."}
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
      <ComprovanteReserva
        dados={{ ...paraComprovante(data.reserva), ocultarValores: semValores }}
      />
    </div>
  );
}
