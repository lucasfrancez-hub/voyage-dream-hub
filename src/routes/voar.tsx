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
          "Compare passagens aéreas de todas as companhias em tempo real e compre em até 15x sem juros com a VIA AIR.",
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
        preset={
          hasPreset
            ? {
                departureIata: s.o!,
                arrivalIata: s.d!,
                departureDate: s.ida!,
                returnDate: s.volta ?? "",
                adults: s.ad ?? 1,
                children: s.ch ?? 0,
                infants: s.inf ?? 0,
              }
            : undefined
        }
        runToken={hasPreset ? 1 : undefined}
      />

      <footer className="border-t border-border/50 bg-card/30">
        <div className="mx-auto grid max-w-7xl gap-6 px-4 py-10 sm:grid-cols-3">
          {[
            { icon: ShieldCheck, t: "Compra segura", d: "Pagamento no ambiente da operadora." },
            { icon: BadgePercent, t: "Até 15x sem juros", d: "Parcelamento conforme a companhia." },
            { icon: Headset, t: "Atendimento humano", d: "Especialistas VIA AIR do início ao fim." },
          ].map((i) => (
            <div key={i.t} className="flex items-start gap-3">
              <i.icon className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <div>
                <div className="text-sm font-semibold">{i.t}</div>
                <div className="text-xs text-muted-foreground">{i.d}</div>
              </div>
            </div>
          ))}
        </div>
      </footer>
    </div>
  );
}
