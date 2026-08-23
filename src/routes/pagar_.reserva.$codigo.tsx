import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { CreditCard, Loader2, ShieldCheck } from "lucide-react";
import { PixQrPanel } from "@/components/pix/PixQrPanel";
import { passhubPixPublico } from "@/lib/passhub/passhub.functions";

export const Route = createFileRoute("/pagar_/reserva/$codigo")({
  component: PagarReservaPage,
  head: () => ({
    meta: [
      { title: "Pagamento da sua reserva | VIA AIR" },
      {
        name: "description",
        content:
          "Pague sua reserva aérea VIA AIR por Pix com QR Code e copia e cola, ou no cartão de crédito.",
      },
      { property: "og:title", content: "Pagamento da sua reserva | VIA AIR" },
      {
        property: "og:description",
        content: "QR Code Pix e cartão de crédito para concluir sua reserva VIA AIR.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

function PagarReservaPage() {
  const { codigo } = Route.useParams();
  const pedirPix = useServerFn(passhubPixPublico);

  const { data, isPending } = useQuery({
    queryKey: ["pix-publico", codigo],
    queryFn: () => pedirPix({ data: { codigo } }),
    staleTime: 5 * 60_000,
    retry: 1,
  });

  const linkCartao = data?.link ?? `https://checkout.passhub.com.br/payment/${codigo}`;

  return (
    <main className="min-h-screen bg-background px-4 py-10">
      <div className="mx-auto flex w-full max-w-sm flex-col items-center">
        <h1 className="mb-1 text-center font-display text-2xl font-bold text-foreground">
          Pagamento da sua reserva
        </h1>
        <p className="mb-6 text-center text-sm text-muted-foreground">
          Escaneie o QR Code ou use o copia e cola. A confirmação é automática.
        </p>

        {isPending ? (
          <div className="flex h-72 w-full items-center justify-center rounded-3xl border border-border bg-card">
            <Loader2 className="h-6 w-6 animate-spin text-brand-orange" />
          </div>
        ) : data?.ok ? (
          <PixQrPanel
            qrCode={data.pix.copiaECola}
            valor={data.pix.valor}
            expiraEm={data.pix.expiraEm || new Date(Date.now() + 30 * 60_000).toISOString()}
            variant="anel"
          />
        ) : (
          <div className="w-full rounded-3xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
            {data?.erro ?? "Não foi possível gerar o Pix agora."}
          </div>
        )}

        <a
          href={linkCartao}
          target="_blank"
          rel="noreferrer"
          className="mt-4 inline-flex w-full max-w-sm items-center justify-center gap-2 rounded-full border border-border bg-card px-4 py-3 text-sm font-semibold text-foreground transition hover:bg-muted"
        >
          <CreditCard className="h-4 w-4" /> Pagar com cartão de crédito
        </a>

        <p className="mt-5 flex items-center gap-1.5 text-xs text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5" /> Pagamento seguro · VIA AIR
        </p>
      </div>
    </main>
  );
}
