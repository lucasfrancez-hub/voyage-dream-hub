import { createFileRoute } from "@tanstack/react-router";
import { CheckoutVoo } from "@/components/checkout/CheckoutVoo";

export const Route = createFileRoute("/admin/checkout/$cartId")({
  component: CheckoutInterno,
  head: () => ({
    meta: [
      { title: "Checkout de voos | Admin VIA AIR" },
      { name: "description", content: "Checkout interno: passageiros e pagamento da reserva aérea." },
      { property: "og:title", content: "Checkout de voos | Admin VIA AIR" },
      { property: "og:description", content: "Checkout interno: passageiros e pagamento da reserva aérea." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

function CheckoutInterno() {
  const { cartId } = Route.useParams();
  return <CheckoutVoo key={cartId} cartId={cartId} />;
}
