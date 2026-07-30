import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Plane, BedDouble, Layers } from "lucide-react";
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

function BuscarPage() {
  const [mode, setMode] = useState<Mode>("aereo");

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
        ? "Monte o pacote: escolha o voo e a hospedagem na mesma tela."
        : "Busca em tempo real na operadora — tarifas, taxas e parcelamento por companhia.";

  const hero = <ModeHeader mode={mode} setMode={setMode} title={heroTitle} subtitle={subtitle} />;

  return (
    <div className="min-h-screen bg-background">
      {mode === "aereo" && <VoosPage header={hero} />}
      {mode === "hotel" && <HoteisPage header={hero} />}
      {mode === "combo" && (
        <>
          <VoosPage header={hero} />
          <HoteisPage
            header={
              <SectionHeader
                icon={BedDouble}
                title="Hospedagem"
                subtitle="Complete o pacote com a hospedagem no mesmo destino."
              />
            }
          />
        </>
      )}
    </div>
  );
}
