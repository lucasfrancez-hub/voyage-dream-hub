/**
 * Motor de busca PÚBLICO (cliente final).
 * Recebe os parâmetros vindos do widget do site (/embed/motor-busca),
 * já dispara a busca e, no "Comprar agora", manda direto pro carrinho da
 * operadora registrando um pedido pendente no admin.
 */
import { createFileRoute } from "@tanstack/react-router";
import { Plane, ShieldCheck, Headset, CreditCard, ChevronRight, BedDouble } from "lucide-react";
import { VoosPage, CITY_CODES } from "./admin.voos-teste";
import { onerFlightSearchPublic } from "@/lib/onertravel-public.functions";
import { HoteisPage } from "./admin.hoteis-teste";

import { SearchEngine, type Mode } from "./admin.buscar";
import {
  PassagensBaratasExplorer,
  type MdStep,
  type MdFiltro,
} from "./admin.passagens-baratas";
import { PaymentMethodsBar } from "@/components/flights/PaymentMethodsBar";
import { ContactFooter } from "@/components/ContactFooter";


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
  m?: Mode;
  /** Aba vinda do widget: ?tab=exclusivos */
  tab?: string;
  /** Hotel vindo do widget */
  hd?: string;
  ci?: string;
  co?: string;
  rm?: number;
  /** Trilha do explorador de passagens baratas (estado por URL). */
  p?: string;
  /** Filtro global do explorador: origem (IATA), rótulo e mês. */
  fo?: string;
  fol?: string;
  fm?: string;
};

const SEP = "|";
const FSEP = "~";

function encodeTrail(trail: MdStep[]): string {
  return trail
    .map((s) =>
      [
        s.label,
        s.baseLabel ?? "",
        s.categoryId ?? "",
        s.toIata ?? "",
        s.fromIata ?? "",
        s.month ?? "",
      ]
        .map((v) => String(v).replace(/[|~]/g, " "))
        .join(FSEP),
    )
    .join(SEP);
}

function decodeTrail(raw?: string): MdStep[] {
  const base: MdStep[] = [{ label: "Passagens baratas" }];
  if (!raw) return base;
  const steps = raw
    .split(SEP)
    .map((chunk) => {
      const [label, baseLabel, categoryId, toIata, fromIata, month] = chunk.split(FSEP);
      if (!label) return null;
      return {
        label,
        ...(baseLabel ? { baseLabel } : {}),
        ...(categoryId ? { categoryId: Number(categoryId) } : {}),
        ...(toIata ? { toIata } : {}),
        ...(fromIata ? { fromIata } : {}),
        ...(month ? { month } : {}),
      } as MdStep;
    })
    .filter(Boolean) as MdStep[];
  return steps.length ? steps : base;
}

const MODES: Mode[] = ["aereo", "hotel", "carro", "combo", "exclusivo", "seguro"];

type PresetDeps = {
  o: string;
  d: string;
  ida: string;
  volta: string;
  ad: number;
  ch: number;
  inf: number;
};

/** Busca do preset iniciada já no load da rota (não espera a hidratação do motor). */
function presetSearchOptions(p: PresetDeps) {
  return {
    queryKey: ["voar-preset", p] as const,
    queryFn: () =>
      onerFlightSearchPublic({
        data: {
          departureIata: p.o,
          arrivalIata: p.d,
          departureDate: p.ida,
          returnDate: p.volta || null,
          adults: p.ad,
          children: p.ch,
          infants: p.inf,
          pageSize: 50,
          searchKey: null,
          departureIsCity: CITY_CODES.has(p.o),
          arrivalIsCity: CITY_CODES.has(p.d),
        },
      }),
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
  };
}


export const Route = createFileRoute("/voar")({
  validateSearch: (search: Record<string, unknown>): VoarSearch => ({
    o: typeof search.o === "string" ? search.o.toUpperCase().slice(0, 3) : undefined,
    d: typeof search.d === "string" ? search.d.toUpperCase().slice(0, 3) : undefined,
    ida: typeof search.ida === "string" ? search.ida.slice(0, 10) : undefined,
    volta: typeof search.volta === "string" ? search.volta.slice(0, 10) : undefined,
    ad: Number(search.ad) > 0 ? Math.min(9, Number(search.ad)) : undefined,
    ch: Number(search.ch) > 0 ? Math.min(9, Number(search.ch)) : undefined,
    inf: Number(search.inf) > 0 ? Math.min(9, Number(search.inf)) : undefined,
    m: MODES.includes(search.m as Mode)
      ? (search.m as Mode)
      : search.tab === "exclusivos" || search.tab === "exclusivo"
        ? ("exclusivo" as Mode)
        : undefined,
    tab: typeof search.tab === "string" ? search.tab.slice(0, 20) : undefined,
    hd: typeof search.hd === "string" ? search.hd.slice(0, 120) : undefined,
    ci: typeof search.ci === "string" ? search.ci.slice(0, 10) : undefined,
    co: typeof search.co === "string" ? search.co.slice(0, 10) : undefined,
    rm: Number(search.rm) > 0 ? Math.min(5, Number(search.rm)) : undefined,
    p: typeof search.p === "string" ? search.p.slice(0, 600) : undefined,
    fo: typeof search.fo === "string" ? search.fo.toUpperCase().slice(0, 3) : undefined,
    fol: typeof search.fol === "string" ? search.fol.slice(0, 60) : undefined,
    fm: typeof search.fm === "string" ? search.fm.slice(0, 7) : undefined,
  }),

  loaderDeps: ({ search }) => ({
    o: search.o ?? "",
    d: search.d ?? "",
    ida: search.ida ?? "",
    volta: search.volta ?? "",
    ad: search.ad ?? 1,
    ch: search.ch ?? 0,
    inf: search.inf ?? 0,
  }),
  // Dispara a busca do preset já no load da rota: quando o motor hidrata,
  // a resposta da operadora normalmente já chegou (ou está a caminho).
  loader: ({ deps, context }) => {
    if (!deps.o || !deps.d || !deps.ida) return;
    context.queryClient.prefetchQuery(presetSearchOptions(deps));
  },

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
  const deps = Route.useLoaderDeps();
  const queryClient = useQueryClient();
  const navigate = Route.useNavigate();
  const hasPreset = !!(s.o && s.d && s.ida);
  const hasHotelPreset = s.m === "hotel" && !!(s.hd && s.ci && s.co);

  return (
    <div className="voar-shell min-h-screen bg-background">
      <div className="voar-glow" aria-hidden />
      <div className="relative z-10">
      <TopBar
        transparent
        backHref="https://viaair.tur.br"
        backLabel="Voltar ao site"
        whatsappMessage="Olá! Estou pesquisando passagens aéreas no site da Via Air."
      />
      {hasHotelPreset ? (
        <HoteisPage
          publicMode
          header={
            <div>
              <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight">
                <BedDouble className="h-7 w-7 text-primary" /> Hospedagem VIA AIR
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Tarifas em tempo real e reserva com atendimento humano.
              </p>
            </div>
          }
          preset={{
            destination: s.hd!,
            checkIn: s.ci!,
            checkOut: s.co!,
            adults: s.ad ?? 2,
            children: s.ch ?? 0,
            rooms: s.rm ?? 1,
          }}
          runToken={1}
        />
      ) : hasPreset ? (
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
        <SearchEngine
          publicMode
          initialMode={s.m ?? "aereo"}
          emptySlot={
            <div className="mx-auto w-full max-w-5xl px-4 py-2">
              <div className="overflow-hidden rounded-3xl border border-border/60 bg-card/90 shadow-2xl backdrop-blur-xl">
                <div className="p-3 md:p-5">
                  <PassagensBaratasExplorer
                    className="w-full space-y-4"
                    linkVoos={({ origem, destino, ida, volta }) => {
                      const p = new URLSearchParams({ o: origem, d: destino, ida });
                      if (volta) p.set("volta", volta);
                      return `/voar?${p.toString()}`;
                    }}
                    trail={decodeTrail(s.p)}
                    onTrailChange={(t) =>
                      navigate({
                        search: (prev) => ({
                          ...prev,
                          p: t.length > 1 ? encodeTrail(t) : undefined,
                        }),
                      })
                    }
                    filtro={{ iata: s.fo ?? null, label: s.fol ?? "", month: s.fm ?? "" }}
                    onFiltroChange={(f: MdFiltro) =>
                      navigate({
                        search: (prev) => ({
                          ...prev,
                          fo: f.iata ?? undefined,
                          fol: f.label || undefined,
                          fm: f.month || undefined,
                        }),
                      })
                    }
                  />
                </div>

              </div>
            </div>
          }
        />
      )}



      <footer className="border-t border-border/50 bg-card/30">
        <div className="mx-auto grid max-w-7xl items-stretch gap-8 px-4 py-12 md:grid-cols-12">
          {/* Coluna 1: selos de confiança, um embaixo do outro */}
          <div className="flex flex-col justify-between py-2 md:col-span-3">
            <div className="space-y-8">
              <div className="flex items-start gap-4">
                <ShieldCheck className="mt-0.5 h-6 w-6 shrink-0 text-primary" />
                <div className="min-w-0">
                  <div className="text-sm font-semibold uppercase tracking-wider">Compra segura</div>
                  <div className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    Pagamento no ambiente da operadora.
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <CreditCard className="mt-0.5 h-6 w-6 shrink-0 text-primary" />
                <div className="min-w-0">
                  <div className="text-sm font-semibold uppercase tracking-wider">
                    Parcelamento no cartão
                  </div>
                  <div className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    Passagens aéreas: parcelas conforme a companhia. Demais serviços: até 6x.
                  </div>
                  <InstallmentRulesDialog
                    trigger={
                      <button
                        type="button"
                        className="mt-3 inline-flex items-center gap-1 rounded-full border border-primary/40 px-4 py-1.5 text-[10px] font-bold uppercase tracking-widest text-primary transition-all duration-300 hover:bg-primary hover:text-primary-foreground"
                      >
                        Consulte aqui <ChevronRight className="h-3.5 w-3.5" />
                      </button>
                    }
                  />
                </div>
              </div>

              <div className="flex items-start gap-4">
                <Headset className="mt-0.5 h-6 w-6 shrink-0 text-primary" />
                <div className="min-w-0">
                  <div className="text-sm font-semibold uppercase tracking-wider">
                    Atendimento humano
                  </div>
                  <div className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    Especialistas VIA AIR do início ao fim.
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-12 border-l-2 border-primary pl-3 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
              Formas de pagamento aceitas
            </div>
          </div>


          {/* Colunas 2 e 3: Pix e Cartão */}
          <PaymentMethodsBar />
        </div>
      </footer>

      <ContactFooter whatsappMessage="Olá! Quero ajuda para escolher minha passagem aérea." />

      </div>
    </div>

  );

}
