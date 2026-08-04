/**
 * Motor de busca PÚBLICO (cliente final).
 * Recebe os parâmetros vindos do widget do site (/embed/motor-busca),
 * já dispara a busca e, no "Comprar agora", manda direto pro carrinho da
 * operadora registrando um pedido pendente no admin.
 */
import { createFileRoute } from "@tanstack/react-router";
import { Plane, ShieldCheck, Headset, CreditCard, ChevronRight } from "lucide-react";
import { VoosPage } from "./admin.voos-teste";
import { TopBar } from "@/components/TopBar";
import { InstallmentRulesDialog } from "@/components/flights/InstallmentRulesDialog";


type VoarSearch = {
  o?: string;
  d?: string;
  ida?: string;
  volta?: string;
  ad?: number;
  ch?: number;
  inf?: number;
};

export const Route = createFileRoute("/voar")({
  validateSearch: (search: Record<string, unknown>): VoarSearch => ({
    o: typeof search.o === "string" ? search.o.toUpperCase().slice(0, 3) : undefined,
    d: typeof search.d === "string" ? search.d.toUpperCase().slice(0, 3) : undefined,
    ida: typeof search.ida === "string" ? search.ida.slice(0, 10) : undefined,
    volta: typeof search.volta === "string" ? search.volta.slice(0, 10) : undefined,
    ad: Number(search.ad) > 0 ? Math.min(9, Number(search.ad)) : undefined,
    ch: Number(search.ch) > 0 ? Math.min(9, Number(search.ch)) : undefined,
    inf: Number(search.inf) > 0 ? Math.min(9, Number(search.inf)) : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Passagens aéreas em tempo real | VIA AIR" },
      {
        name: "description",
        content:
          "Compare passagens aéreas de todas as companhias em tempo real e parcele no cartão conforme as regras de cada companhia com a VIA AIR.",
      },
      { property: "og:title", content: "Passagens aéreas em tempo real | VIA AIR" },
      {
        property: "og:description",
        content: "Busque, compare e compre sua passagem aérea com atendimento humano VIA AIR.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: VoarPublicPage,
});

function VoarPublicPage() {
  const s = Route.useSearch();
  const hasPreset = !!(s.o && s.d && s.ida);

  return (
    <div className="min-h-screen bg-background">
      <TopBar
        backHref="https://viaair.tur.br"
        backLabel="Voltar ao site"
        whatsappMessage="Olá! Estou pesquisando passagens aéreas no site da Via Air."
      />
      {hasPreset ? (
        <VoosPage
          publicMode
          header={
            <div>
              <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight">
                <Plane className="h-7 w-7 text-primary" /> Passagens aéreas VIA AIR
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Todas as companhias, tarifas em tempo real e compra segura.
              </p>
            </div>
          }
          preset={{
            departureIata: s.o!,
            arrivalIata: s.d!,
            departureDate: s.ida!,
            returnDate: s.volta ?? "",
            adults: s.ad ?? 1,
            children: s.ch ?? 0,
            infants: s.inf ?? 0,
          }}
          runToken={1}
        />
      ) : (
        <SearchEngine publicMode initialMode={s.m ?? "aereo"} />
      )}


      <footer className="border-t border-border/50 bg-card/30">
        <div className="mx-auto grid max-w-7xl gap-6 px-4 py-10 sm:grid-cols-3">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div>
              <div className="text-sm font-semibold">Compra segura</div>
              <div className="text-xs text-muted-foreground">
                Pagamento no ambiente da operadora.
              </div>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <CreditCard className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div className="min-w-0">
              <div className="text-sm font-semibold">Parcelamento no cartão</div>
              <div className="text-xs text-muted-foreground">
                O número de parcelas sem juros varia conforme a companhia aérea e
                aparece no seu pedido.
              </div>
              <InstallmentRulesDialog
                trigger={
                  <button
                    type="button"
                    className="mt-2 inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary transition hover:bg-primary hover:text-primary-foreground"
                  >
                    Consulte aqui <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                }
              />
            </div>
          </div>

          <div className="flex items-start gap-3">
            <Headset className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div>
              <div className="text-sm font-semibold">Atendimento humano</div>
              <div className="text-xs text-muted-foreground">
                Especialistas VIA AIR do início ao fim.
              </div>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );

}
