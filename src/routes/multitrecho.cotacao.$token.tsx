/**
 * LINK PRONTO DA COTAÇÃO MULTI-TRECHO — /multitrecho/cotacao/{token}
 *
 * A seleção completa da viagem fica salva no backend: ao abrir o link (em
 * qualquer celular, direto do WhatsApp) o cliente cai na tela final pronta,
 * com todos os trechos, companhias, bagagem, valores, parcelamento e total —
 * sem passar de novo pela escolha trecho a trecho.
 */
import { createFileRoute } from "@tanstack/react-router";
import { TopBar } from "@/components/TopBar";
import { ContactFooter } from "@/components/ContactFooter";
import { getMultiCityQuote } from "@/lib/multicity-quote.functions";
import { VoosPage } from "./admin.voos-teste";
import { newSegment, type MultiSegmentInput, type SavedPick } from "@/lib/multicity";

export const Route = createFileRoute("/multitrecho/cotacao/$token")({
  loader: ({ params }) => getMultiCityQuote({ data: { token: params.token } }),
  head: () => ({
    meta: [
      { title: "Sua viagem multi-trecho | VIA AIR" },
      {
        name: "description",
        content:
          "Cotação multi-trecho VIA AIR pronta: veja todos os trechos, companhias, bagagem, parcelamento e o valor total da viagem.",
      },
      { property: "og:title", content: "Sua viagem multi-trecho | VIA AIR" },
      {
        property: "og:description",
        content: "Abra sua cotação multi-trecho com todos os voos já selecionados.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CotacaoMultiTrechoPage,
});

function CotacaoMultiTrechoPage() {
  const quote = Route.useLoaderData();

  const segments: MultiSegmentInput[] =
    quote?.segments?.map((s) =>
      newSegment({ origin: s.origin, destination: s.destination, date: s.date }),
    ) ?? [];

  return (
    <div className="voar-shell min-h-screen bg-background">
      <div className="voar-glow" aria-hidden />
      <div className="relative z-10">
        <TopBar
          transparent
          backHref="https://viaair.tur.br"
          backLabel="Voltar ao site"
          whatsappMessage="Olá! Recebi minha cotação multi-trecho e quero finalizar a compra."
        />

        {!quote || segments.length < 2 ? (
          <main className="mx-auto max-w-2xl px-4 py-20 text-center">
            <h1 className="text-2xl font-black tracking-tight">Cotação não encontrada</h1>
            <p className="mt-3 text-sm text-muted-foreground">
              Este link de cotação expirou ou não existe mais. Fale com a VIA AIR pelo WhatsApp
              que montamos sua viagem novamente.
            </p>
          </main>
        ) : (
          <main className="mx-auto max-w-7xl px-4 py-6">
            <VoosPage
              publicMode
              hideForm
              multiPreset={segments}
              multiSaved={quote.picks as SavedPick[]}
              multiPax={quote.pax}
              multiQuoteToken={quote.token}
            />
          </main>
        )}

        <ContactFooter whatsappMessage="Olá! Quero finalizar minha viagem multi-trecho." />
      </div>
    </div>
  );
}
