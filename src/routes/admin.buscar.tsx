import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Plane, BedDouble, Layers, MapPin, ArrowLeftRight, CalendarDays, Users, Search, Car, ClipboardCheck, ChevronRight, ChevronLeft, Loader2, ExternalLink, Copy, Sparkles, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { VoosPage, NewOrderFromFlightsDialog } from "./admin.voos-teste";
import type { MultiPick, MultiSegmentInput } from "@/lib/multicity";
import type { FlightPreset } from "./admin.voos-teste";
import type { HotelPreset } from "./admin.hoteis-teste";
import type { ComboPick } from "@/lib/combo-selection";
import { newCombinedKey } from "@/lib/combined-journey";
import { useServerFn } from "@tanstack/react-start";
import {
  onerCreateComboCart,
  onerCreateComboCartPublic,
} from "@/lib/onertravel-combo.functions";

import { HoteisPage } from "./admin.hoteis-teste";
import { CarrosPage } from "./admin.carros";
import { ExclusivosPage } from "./admin.exclusivos";
import { SegurosPage } from "./admin.seguros";
import { RoomsPaxField, QUARTO_PADRAO, totalPax, type QuartoPax } from "@/components/search/RoomsPaxField";
import { DateRangeField } from "@/components/search/DateRangeField";
import { AirportAutocomplete } from "@/components/search/AirportAutocomplete";

import { PublicEngineProvider } from "@/lib/public-engine";
import { PacoteMotor } from "@/components/pacote-motor/PacoteMotor";
import type { PacotePreset } from "@/lib/pacote-motor/preset";



export const Route = createFileRoute("/admin/buscar")({
  head: () => ({
    meta: [
      { title: "Motor de Busca — Aéreo e Hotel | VIA AIR" },
      {
        name: "description",
        content:
          "Motor único VIA AIR: busque passagens aéreas, hospedagens ou combine aéreo + hotel em tempo real na operadora.",
      },
      { property: "og:title", content: "Motor de Busca — Aéreo e Hotel | VIA AIR" },
      {
        property: "og:description",
        content: "Busque aéreo, hotel ou os dois combinados em um só motor.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BuscarPage,
});

export type Mode = "aereo" | "hotel" | "carro" | "combo" | "exclusivo" | "seguro";

/** Motor interno: todos os modos liberados. O bloqueio de hotel/carro/pacote
 * vale apenas para o chatbot do WhatsApp. */
const ENABLED_MODES: Mode[] = ["aereo", "hotel", "carro", "combo", "exclusivo", "seguro"];

const MODES: { id: Mode; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "aereo", label: "Aéreo", icon: Plane },
  { id: "hotel", label: "Hotel", icon: BedDouble },
  { id: "combo", label: "Pacotes", icon: Layers },
  { id: "carro", label: "Carro", icon: Car },
  { id: "exclusivo", label: "Exclusivos", icon: Sparkles },
  { id: "seguro", label: "Seguros", icon: ShieldCheck },
];



function ModeHeader({
  mode,
  setMode,
  title,
  subtitle,
}: {
  mode: Mode;
  setMode: (m: Mode) => void;
  title: React.ReactNode;
  subtitle: string;
}) {
  return (
    <div className="flex w-full flex-col gap-6 px-2 md:flex-row md:items-end md:justify-between">
      <div>
        <h1 className="text-4xl font-bold tracking-tight">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p> : null}
      </div>
      <div className="flex w-full max-w-full gap-1 overflow-x-auto rounded-full border border-border/50 bg-card/70 p-1 backdrop-blur-xl md:w-fit md:overflow-visible [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {MODES.map((m) => {
          const active = mode === m.id;
          const disabled = !ENABLED_MODES.includes(m.id);
          return (
            <button
              key={m.id}
              type="button"
              disabled={disabled}
              title={disabled ? "Indisponível no momento — em breve" : undefined}
              onClick={() => {
                if (disabled) return;
                setMode(m.id);
              }}
              className={`flex h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-5 text-sm leading-none transition-all sm:px-6 ${
                disabled
                  ? "cursor-not-allowed font-medium text-muted-foreground/40"
                  : active
                    ? "bg-primary font-semibold text-primary-foreground shadow-lg shadow-primary/20"
                    : "font-medium text-muted-foreground hover:text-foreground"
              }`}
            >
              <m.icon className="h-4 w-4 shrink-0" /> {m.label}

              {disabled ? <span className="text-[10px] uppercase opacity-70">em breve</span> : null}
            </button>
          );
        })}

      </div>
    </div>

  );
}

function SectionHeader({ icon: Icon, title, subtitle }: { icon: React.ComponentType<{ className?: string }>; title: string; subtitle: string }) {
  return (
    <div>
      <h2 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
        <Icon className="h-6 w-6 text-primary" /> {title}
      </h2>
      <p className="text-sm text-muted-foreground">{subtitle}</p>
    </div>
  );
}

type ComboStep = 1 | 2 | 3;




type ComboForm = {
  departureIata: string;
  arrivalIata: string;
  destinationCity: string;
  departureDate: string;
  returnDate: string;
  adults: number;
  children: number;
  infants: number;
  rooms: number;
  /** Distribuição por quarto (clique no quarto para editar). */
  quartos: QuartoPax[];
};

const COMBO_INITIAL: ComboForm = {
  departureIata: "",
  arrivalIata: "",

  destinationCity: "",
  departureDate: "",
  returnDate: "",
  adults: 2,
  children: 0,
  infants: 0,
  rooms: 1,
  quartos: [{ ...QUARTO_PADRAO }],
};

/** Formulário único do modo Aéreo + Hotel: uma busca alimenta os dois motores. */
function ComboForm({
  form,
  setForm,
  onSearch,
  disabled,
  publicMode = false,
}: {
  form: ComboForm;
  setForm: (f: ComboForm) => void;
  onSearch: () => void;
  disabled: boolean;
  /** Motor público (sem login): o autocomplete usa a consulta aberta. */
  publicMode?: boolean;
}) {
  return (
    <div className="rounded-[32px] border border-border/50 bg-card/60 p-6 shadow-2xl backdrop-blur-xl">
      <div className="grid gap-3 lg:grid-cols-[1fr_1.2fr_auto]">
        <div className="relative grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-muted-foreground">
              <MapPin className="h-3 w-3" /> Origem
            </Label>
            {/* MESMO autocomplete da aba Aéreo (cidade/aeroporto → IATA). */}
            <AirportAutocomplete
              value={form.departureIata}
              publicMode={publicMode}
              isDeparture
              placeholder="De onde sairemos?"
              className="h-11 text-sm font-semibold uppercase sm:text-base"
              onSelect={(iata) => setForm({ ...form, departureIata: iata })}
            />
          </div>
          <button
            type="button"
            aria-label="Inverter origem e destino"
            title="Inverter origem e destino"
            onClick={() =>
              setForm({ ...form, departureIata: form.arrivalIata, arrivalIata: form.departureIata })
            }
            className="absolute left-1/2 top-[calc(50%+0.5rem)] z-10 grid h-8 w-8 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-border/60 bg-card text-muted-foreground shadow-lg transition hover:text-primary active:scale-95"
          >
            <ArrowLeftRight className="h-3.5 w-3.5" />
          </button>
          <div className="space-y-1">
            <Label className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-muted-foreground">
              <ArrowLeftRight className="h-3 w-3" /> Destino
            </Label>
            <AirportAutocomplete
              value={form.arrivalIata}
              publicMode={publicMode}
              isDeparture={false}
              placeholder="Para onde vamos?"
              className="h-11 text-sm font-semibold uppercase sm:text-base"
              onSelect={(iata) => setForm({ ...form, arrivalIata: iata })}
            />
          </div>
        </div>


        <div className="space-y-1">
          <Label className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-muted-foreground">
            <CalendarDays className="h-3 w-3" /> Ida e volta
          </Label>
          <DateRangeField
            departureDate={form.departureDate}
            returnDate={form.returnDate}
            allowOneWay={false}
            labels={{ start: "Ida", end: "Volta" }}
            onChange={(departureDate, returnDate) => setForm({ ...form, departureDate, returnDate })}
          />
        </div>

        <div className="flex items-end">
          <Button size="lg" className="h-11 w-full lg:w-auto" disabled={disabled} onClick={onSearch}>
            <Search className="mr-2 h-4 w-4" /> Buscar pacote
          </Button>
        </div>
      </div>


      <div className="mt-3 grid gap-3 border-t border-border/60 pt-3 md:grid-cols-[1.4fr_auto]">
        <div className="space-y-1">
          <Label className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-muted-foreground">
            <BedDouble className="h-3 w-3" /> Cidade da hospedagem
          </Label>
          <Input
            className="h-9"
            placeholder="Ex.: São Paulo (deixe em branco para usar o destino)"
            value={form.destinationCity}
            onChange={(e) => setForm({ ...form, destinationCity: e.target.value })}
          />
        </div>
        <div className="w-full space-y-1 md:w-72">
          <Label className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-muted-foreground">
            <Users className="h-3 w-3" /> Pessoas e quartos
          </Label>
          <RoomsPaxField
            quartos={form.quartos}
            onChange={(quartos) => {
              const t = totalPax(quartos);
              setForm({
                ...form,
                quartos,
                adults: t.adultos,
                children: t.criancas,
                infants: t.bebes,
                rooms: quartos.length,
              });
            }}
          />
        </div>
      </div>
    </div>
  );
}

function BuscarPage() {
  return <SearchEngine />;
}

/** Motor de busca completo (aéreo, hotel, carro, combo, exclusivos, seguros).
 *  `publicMode` liga a versão sem login usada em /voar e no widget. */
export function SearchEngine({
  publicMode = false,
  embedMode = false,
  initialMode = "aereo",
  emptySlot,
  flightPreset: flightPresetProp,
  hotelPreset: hotelPresetProp,
  presetRunToken,
  presetFetch,
  multiPreset,
  multiPicks,
  pacotePreset,
}: {
  publicMode?: boolean;
  /** Conteúdo abaixo do motor aéreo enquanto não há resultados. */
  emptySlot?: React.ReactNode;
  /** No widget, a pesquisa segue por navegação nativa para /voar em outra aba. */
  embedMode?: boolean;
  initialMode?: Mode;
  /** Busca aérea já preenchida (veio da URL) — mantém as abas do motor visíveis. */
  flightPreset?: FlightPreset;
  /** Busca de hospedagem já preenchida (veio da URL). */
  hotelPreset?: HotelPreset;
  presetRunToken?: number;
  presetFetch?: () => Promise<unknown>;
  /** Viagem multi-trecho vinda da URL (?ms=...). */
  multiPreset?: MultiSegmentInput[];
  /** Voo já escolhido por trecho (?ps=...) — abre o carrinho pronto. */
  multiPicks?: MultiPick[];
  /** Busca de pacote já preenchida (veio do motor recolhível da página /pacotes). */
  pacotePreset?: PacotePreset;
} = {}) {
  const [mode, setMode] = useState<Mode>(initialMode);

  /** No widget, "Exclusivos" não abre dentro do iframe do site: leva o
   *  usuário para a página completa, fora do iframe, já na aba certa. */
  function changeMode(next: Mode) {
    if (embedMode && next === "exclusivo") {
      const url = "https://pedidos.viaair.tur.br/voar?tab=exclusivos";
      try {
        window.open(url, "_top");
      } catch {
        window.open(url, "_blank", "noopener,noreferrer");
      }
      return;
    }
    setMode(next);
  }


  const [combo, setCombo] = useState<ComboForm>(COMBO_INITIAL);
  const [runToken, setRunToken] = useState(0);
  /** Chave única da jornada Aéreo + Hotel (voo e hotel usam a MESMA). */
  const [combinedKey, setCombinedKey] = useState<string | null>(null);
  const [step, setStep] = useState<ComboStep>(1);
  const [flightPick, setFlightPick] = useState<ComboPick | null>(null);
  const [hotelPick, setHotelPick] = useState<ComboPick | null>(null);
  const [orderOpen, setOrderOpen] = useState(false);
  const [buying, setBuying] = useState(false);
  const [cartLinks, setCartLinks] = useState<{ label: string; url: string }[]>([]);

  const comboTotal = (flightPick?.total ?? 0) + (hotelPick?.total ?? 0);
  const comboSummary = [flightPick?.summary, hotelPick?.summary].filter(Boolean).join("\n\n");

  const createComboCart = useServerFn(
    publicMode ? onerCreateComboCartPublic : onerCreateComboCart,
  );

  async function buyCombo() {
    setBuying(true);
    setCartLinks([]);
    const links: { label: string; url: string }[] = [];
    try {
      // Aéreo + hotel juntos: UM único carrinho /viaair/combined/cart
      if (flightPick?.flightBooking && hotelPick?.hotelBooking) {
        const r = await createComboCart({
          data: {
            flight: flightPick.flightBooking,
            hotel: hotelPick.hotelBooking,
            combinedKey,
          },
        });
        if (publicMode) {
          window.location.href = r.url;
          return;
        }
        setCartLinks([{ label: "Aéreo + Hotel", url: r.url }]);
        toast.success("Carrinho do Comprar Viagem gerado");
        return;
      }

      if (flightPick) links.push({ label: "A\u00e9reo", url: await flightPick.buy() });
      if (hotelPick) links.push({ label: "Hospedagem", url: await hotelPick.buy() });
      setCartLinks(links);
      toast.success("Carrinho(s) do Comprar Viagem gerado(s)");
    } catch (e) {
      setCartLinks(links);
      toast.error(e instanceof Error ? e.message : "Erro ao gerar carrinho");
    } finally {
      setBuying(false);
    }
  }

  const heroTitle =
    mode === "carro" ? (
      <>
        Qual <span className="font-bold text-primary">carro</span> vamos alugar?
      </>
    ) : mode === "hotel" ? (
      <>
        Onde vamos <span className="font-bold text-primary">hospedar</span>?
      </>
    ) : mode === "combo" ? (
      <>
        Pacotes de <span className="font-bold text-primary">viagens</span>
      </>
    ) : mode === "exclusivo" ? (
      <>
        O que temos de <span className="font-bold text-primary">exclusivo</span>?
      </>
    ) : mode === "seguro" ? (
      <>
        Qual <span className="font-bold text-primary">seguro</span> vamos cotar?
      </>
    ) : (
      <>
        Para onde <span className="font-bold text-primary">vamos</span> hoje?
      </>
    );

  const subtitle =
    mode === "hotel"
      ? ""
      : mode === "combo"
        ? "Aéreo + hospedagem no mesmo pacote, com quartos e viajantes do seu jeito."
        : "";



  const hero = <ModeHeader mode={mode} setMode={changeMode} title={heroTitle} subtitle={subtitle} />;

  const comboReady =
    combo.departureIata.length === 3 &&
    combo.arrivalIata.length === 3 &&
    !!combo.departureDate &&
    !!combo.returnDate;

  const fmtBRL = (v: number) =>
    v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  function runCombo() {
    if (!comboReady) {
      toast.error("Informe origem, destino, ida e volta");
      return;
    }
    // Uma jornada = uma searchKey só, usada no /combined/flight e no /combined/hotel.
    setCombinedKey(newCombinedKey());
    setRunToken((t) => t + 1);
  }

  const flightPreset = {
    departureIata: combo.departureIata,
    arrivalIata: combo.arrivalIata,
    departureDate: combo.departureDate,
    returnDate: combo.returnDate,
    adults: combo.adults,
    children: combo.children,
    infants: combo.infants,
  };

  const hotelPreset = {
    destination: combo.destinationCity.trim() || combo.arrivalIata,
    checkIn: combo.departureDate,
    checkOut: combo.returnDate,
    adults: Math.max(1, Math.ceil(combo.adults / Math.max(1, combo.rooms))),
    children: combo.children,
    rooms: combo.rooms,
  };

  return (
    <PublicEngineProvider value={publicMode}>
    <div
      className={
        (embedMode ? "bg-background" : "min-h-screen bg-background") +
        (embedMode ? "" : " voar-shell")
      }
    >
      {!embedMode && <div className="voar-glow" aria-hidden />}
      {mode === "aereo" && (
        <VoosPage
          header={hero}
          publicMode={publicMode}
          externalSearch={embedMode}
          emptySlot={emptySlot}
          preset={flightPresetProp}
          runToken={flightPresetProp ? (presetRunToken ?? 1) : undefined}
          presetFetch={flightPresetProp ? presetFetch : undefined}
          multiPreset={multiPreset}
          multiPicks={multiPicks}
        />
      )}
      {mode === "hotel" && (
        <HoteisPage
          header={hero}
          publicMode={publicMode}
          externalSearch={embedMode}
          preset={hotelPresetProp}
          runToken={hotelPresetProp ? (presetRunToken ?? 1) : undefined}
        />
      )}

      {mode === "carro" && <CarrosPage header={hero} embedMode={embedMode} />}
      {mode === "exclusivo" && <ExclusivosPage header={hero} />}
      {mode === "seguro" && <SegurosPage header={hero} />}

      {mode === "combo" && (
        <>
          <header className="relative overflow-hidden border-b border-border/60">
            <div className="relative mx-auto max-w-7xl px-4 py-8">{hero}</div>
          </header>
          {/* Motor de Pacotes VIA AIR (operadora própria — FRT/CompreFácil). */}
          <div className="mx-auto max-w-7xl px-4 py-6">
            <PacoteMotor embed={embedMode} publico={embedMode || publicMode} preset={pacotePreset} />
          </div>
        </>
      )}


    </div>
    </PublicEngineProvider>
  );

}

