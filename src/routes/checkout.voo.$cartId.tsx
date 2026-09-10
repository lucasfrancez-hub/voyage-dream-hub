import { createFileRoute } from "@tanstack/react-router";
import { CheckoutVoo } from "@/components/checkout/CheckoutVoo";

export const Route = createFileRoute("/checkout/voo/$cartId")({
  component: CheckoutPublico,
  head: () => ({
    meta: [
      { title: "Finalize sua passagem aérea | VIA AIR" },
      {
        name: "description",
        content:
          "Confira os voos, informe os passageiros e pague no cartão em até 10x ou por Pix com QR Code da VIA AIR.",
      },
      { property: "og:title", content: "Finalize sua passagem aérea | VIA AIR" },
      {
        property: "og:description",
        content: "Passageiros e pagamento da sua passagem aérea, tudo dentro da VIA AIR.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

function CheckoutPublico() {
  const { cartId } = Route.useParams();
  return <CheckoutVoo key={cartId} cartId={cartId} publico />;
}
