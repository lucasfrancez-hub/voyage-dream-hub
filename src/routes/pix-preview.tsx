import { createFileRoute } from "@tanstack/react-router";
import { PixQrPanel, PIX_QR_MINUTES } from "@/components/pix/PixQrPanel";

export const Route = createFileRoute("/pix-preview")({
  component: PixPreviewPage,
  head: () => ({
    meta: [
      { title: "Preview do QR Code Pix | VIA AIR" },
      {
        name: "description",
        content:
          "Comparativo das três opções de exibição do QR Code Pix no checkout VIA AIR.",
      },
      { property: "og:title", content: "Preview do QR Code Pix | VIA AIR" },
      {
        property: "og:description",
        content: "Três modelos de QR Code Pix com contador de expiração.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

const DEMO_PAYLOAD =
  "00020101021226800014br.gov.bcb.pix2558pix.asaas.com/qr/cobv/924f157f-cc00-45cb-ba01-630b423ac0325204000053039865802BR5923VIA AIR AGENCIA REPRESE6009Paranavai61088770712062070503***63046F70";

function PixPreviewPage() {
  const expiraEm = new Date(Date.now() + PIX_QR_MINUTES * 60_000).toISOString();
  const opcoes = [
    {
      id: "anel",
      titulo: "Opção 1 — Anel de progresso",
      desc: "Contador circular ao redor do QR, valor em destaque laranja.",
    },
    {
      id: "barra",
      titulo: "Opção 2 — Barra de carregamento",
      desc: "Barra fina no topo com o tempo restante, layout mais limpo.",
    },
    {
      id: "minimal",
      titulo: "Opção 3 — Cabeçalho com cronômetro",
      desc: "Faixa laranja com timer fixo e barra sutil embaixo do QR.",
    },
  ] as const;

  return (
    <main className="min-h-screen bg-background px-4 py-10">
      <div className="mx-auto max-w-6xl">
        <h1 className="font-display text-2xl font-bold text-foreground md:text-3xl">
          QR Code Pix — 3 opções
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Somente QR + copia e cola, com indicador de tempo. Validade atual:{" "}
          {PIX_QR_MINUTES} minutos.
        </p>

        <div className="mt-8 grid gap-8 md:grid-cols-3">
          {opcoes.map((o) => (
            <section key={o.id} className="flex flex-col items-center">
              <h2 className="font-display text-base font-semibold text-foreground">
                {o.titulo}
              </h2>
              <p className="mt-1 mb-4 text-center text-xs text-muted-foreground">
                {o.desc}
              </p>
              <PixQrPanel
                qrCode={DEMO_PAYLOAD}
                valor={4321.99}
                expiraEm={expiraEm}
                variant={o.id}
              />
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
