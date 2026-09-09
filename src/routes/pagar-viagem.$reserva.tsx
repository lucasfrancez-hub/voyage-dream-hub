import { createFileRoute } from "@tanstack/react-router";
import { OnerPagamento } from "@/components/checkout/OnerPagamento";

export const Route = createFileRoute("/pagar-viagem/$reserva")({
  component: PagarViagem,
  head: () => ({
    meta: [
      { title: "Pagamento da sua viagem | VIA AIR" },
      { name: "description", content: "Finalize o pagamento da sua viagem com cartão de crédito ou Pix." },
      { property: "og:title", content: "Pagamento da sua viagem | VIA AIR" },
      {
        property: "og:description",
        content: "Finalize o pagamento da sua viagem com cartão de crédito ou Pix.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

function PagarViagem() {
  const { reserva } = Route.useParams();
  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-bold">Pagamento da sua viagem</h1>
        <p className="text-sm text-muted-foreground">Confira os dados e escolha como quer pagar.</p>
      </header>
      <OnerPagamento cartId={reserva} />
    </div>
  );
}
