/**
 * Bilhete Eletrônico (e-ticket) em página própria, pronto para impressão / PDF.
 * Usa a mesma identidade visual do Plano de Viagem.
 */
import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Printer } from "lucide-react";
import {
  passhubReservaDetalhe,
  passhubBilheteNumeros,
} from "@/lib/passhub/passhub.functions";
import { ComprovanteReserva } from "@/components/passhub/ComprovanteReserva";
import { paraComprovante, comBilhetes } from "@/lib/passhub/comprovante";

export const Route = createFileRoute("/admin/bilhetes_/$id/eticket")({
  component: BilheteEletronicoPage,
  head: () => ({
    meta: [
      { title: "Bilhete eletrônico — E-ticket | VIA AIR" },
      {
        name: "description",
        content:
          "Bilhete eletrônico VIA AIR com números de e-ticket, itinerário, passageiros e bagagem.",
      },
      { property: "og:title", content: "Bilhete eletrônico — E-ticket | VIA AIR" },
      {
        property: "og:description",
        content: "Documento de embarque VIA AIR com e-ticket, itinerário e passageiros.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
});

function BilheteEletronicoPage() {
  const { id } = Route.useParams();
  const [semValores, setSemValores] = useState(false);
  const detalheFn = useServerFn(passhubReservaDetalhe);
  const bilheteFn = useServerFn(passhubBilheteNumeros);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    setSemValores(p.get("valores") === "0");
  }, []);

  const { data, isLoading } = useQuery({
    queryKey: ["passhub-reserva-eticket", id],
    queryFn: () => detalheFn({ data: { id: Number(id) } }),
  });

  const { data: bilhete } = useQuery({
    queryKey: ["passhub-bilhete-numeros", id],
    queryFn: () => bilheteFn({ data: { id: Number(id) } }),
  });

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center gap-2 text-sm">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando bilhete eletrônico…
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

  const base = paraComprovante(data.reserva);
  const dados = comBilhetes(
    base,
    bilhete?.ok ? (bilhete.numeros ?? []) : [],
    data.reserva.emitidaEm ?? null,
  );

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
        dados={{ ...dados, variante: "bilhete", ocultarValores: semValores }}
      />
    </div>
  );
}
