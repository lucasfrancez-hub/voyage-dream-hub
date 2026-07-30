import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Plane, BedDouble, Layers, MapPin, ArrowLeftRight, CalendarDays, Users, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { VoosPage } from "./admin.voos-teste";
import { HoteisPage } from "./admin.hoteis-teste";


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

type Mode = "aereo" | "hotel" | "combo";

const MODES: { id: Mode; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "aereo", label: "Aéreo", icon: Plane },
  { id: "hotel", label: "Hotel", icon: BedDouble },
  { id: "combo", label: "Aéreo + Hotel", icon: Layers },
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
    <div className="flex w-full flex-col gap-6 md:flex-row md:items-end md:justify-between">
      <div>
        <h1 className="text-3xl font-light tracking-tight md:text-4xl">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
      </div>
      <div className="flex w-fit gap-1 rounded-2xl border border-border/60 bg-background/60 p-1.5 backdrop-blur">
        {MODES.map((m) => {
          const active = mode === m.id;
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => setMode(m.id)}
              className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all sm:px-6 ${
                active
                  ? "bg-primary text-primary-foreground shadow-lg"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <m.icon className="h-4 w-4" /> {m.label}
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
};

const COMBO_INITIAL: ComboForm = {
  departureIata: "CWB",
  arrivalIata: "GRU",
  destinationCity: "",
  departureDate: "",
  returnDate: "",
  adults: 2,
  children: 0,
  infants: 0,
  rooms: 1,
};

/** Formulário único do modo Aéreo + Hotel: uma busca alimenta os dois motores. */
function ComboForm({
  form,
  setForm,
  onSearch,
  disabled,
}: {
  form: ComboForm;
  setForm: (f: ComboForm) => void;
  onSearch: () => void;
  disabled: boolean;
}) {
  return (
    <div className="rounded-2xl border border-border/70 bg-card/85 p-4 shadow-[var(--shadow-card)] backdrop-blur">
      <div className="grid gap-3 lg:grid-cols-[1fr_1.2fr_auto]">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-muted-foreground">
              <MapPin className="h-3 w-3" /> Origem
            </Label>
            <Input
              className="h-11 text-base font-semibold uppercase"
              maxLength={3}
              value={form.departureIata}
              onChange={(e) => setForm({ ...form, departureIata: e.target.value.toUpperCase() })}
              placeholder="CWB"
            />
          </div>
          <div className="space-y-1">
            <Label className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-muted-foreground">
              <ArrowLeftRight className="h-3 w-3" /> Destino
            </Label>
            <Input
              className="h-11 text-base font-semibold uppercase"
              maxLength={3}
              value={form.arrivalIata}
              onChange={(e) => setForm({ ...form, arrivalIata: e.target.value.toUpperCase() })}
              placeholder="GRU"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-muted-foreground">
              <CalendarDays className="h-3 w-3" /> Ida / check-in
            </Label>
            <Input
              className="h-11"
              type="date"
              value={form.departureDate}
              onChange={(e) => setForm({ ...form, departureDate: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-muted-foreground">
              <CalendarDays className="h-3 w-3" /> Volta / check-out
            </Label>
            <Input
              className="h-11"
              type="date"
              value={form.returnDate}
              onChange={(e) => setForm({ ...form, returnDate: e.target.value })}
            />
          </div>
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
        <div className="flex flex-wrap items-end gap-3">
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Users className="h-3 w-3" /> {form.adults + form.children + form.infants} pax • {form.rooms} quarto(s)
          </span>
          {[
            { k: "adults" as const, l: "Adultos", min: 1 },
            { k: "children" as const, l: "Crianças", min: 0 },
            { k: "infants" as const, l: "Bebês", min: 0 },
            { k: "rooms" as const, l: "Quartos", min: 1 },
          ].map((p) => (
            <div key={p.k} className="w-24 space-y-1">
              <Label className="text-[11px] text-muted-foreground">{p.l}</Label>
              <Input
                className="h-9"
                type="number"
                min={p.min}
                max={9}
                value={form[p.k]}
                onChange={(e) => setForm({ ...form, [p.k]: Number(e.target.value) })}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function BuscarPage() {
  const [mode, setMode] = useState<Mode>("aereo");
  const [combo, setCombo] = useState<ComboForm>(COMBO_INITIAL);
  const [runToken, setRunToken] = useState(0);

  const heroTitle =
    mode === "hotel" ? (
      <>
        Onde vamos <span className="font-bold text-primary">hospedar</span>?
      </>
    ) : mode === "combo" ? (
      <>
        Aéreo <span className="font-bold text-primary">+</span> hotel juntos
      </>
    ) : (
      <>
        Para onde <span className="font-bold text-primary">vamos</span> hoje?
      </>
    );

  const subtitle =
    mode === "hotel"
      ? "Hospedagens em tempo real na operadora — tarifas por noite e cancelamento."
      : mode === "combo"
        ? "Um único motor: a mesma busca traz o voo e a hospedagem do destino."
        : "Busca em tempo real na operadora — tarifas, taxas e parcelamento por companhia.";

  const hero = <ModeHeader mode={mode} setMode={setMode} title={heroTitle} subtitle={subtitle} />;

  const comboReady =
    combo.departureIata.length === 3 &&
    combo.arrivalIata.length === 3 &&
    !!combo.departureDate &&
    !!combo.returnDate;

  function runCombo() {
    if (!comboReady) {
      toast.error("Informe origem, destino, ida e volta");
      return;
    }
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
    <div className="min-h-screen bg-background">
      {mode === "aereo" && <VoosPage header={hero} />}
      {mode === "hotel" && <HoteisPage header={hero} />}
      {mode === "combo" && (
        <>
          <header className="relative overflow-hidden border-b border-border/60">
            <div
              className="absolute inset-0 opacity-60"
              style={{ background: "radial-gradient(1200px 400px at 20% -10%, var(--brand-blue), transparent 70%)" }}
              aria-hidden
            />
            <div className="relative mx-auto max-w-7xl px-4 py-8">
              <div className="mb-6">{hero}</div>
              <ComboForm form={combo} setForm={setCombo} onSearch={runCombo} disabled={!comboReady} />
            </div>
          </header>

          <VoosPage
            hideForm
            preset={flightPreset}
            runToken={runToken}
            header={
              <SectionHeader icon={Plane} title="Aéreo" subtitle="Escolha a ida e a volta do pacote." />
            }
          />
          <HoteisPage
            hideForm
            preset={hotelPreset}
            runToken={runToken}
            header={
              <SectionHeader
                icon={BedDouble}
                title="Hospedagem"
                subtitle="Hotéis disponíveis no destino e nas mesmas datas."
              />
            }
          />
        </>
      )}
    </div>
  );
}

