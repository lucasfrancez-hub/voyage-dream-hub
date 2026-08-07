import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { StoryArtVariant, type ArtMode, type ArtVariant } from "@/components/packages/StoryArtVariants";
import type { FeedArtData } from "@/components/packages/PackageFeedArt";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/admin/arte-modelos")({
  component: ArteModelosPage,
  head: () => ({
    meta: [
      { title: "Modelos de arte — Passeio e Ingresso | VIA AIR" },
      {
        name: "description",
        content: "Pré-visualização dos três modelos de arte para passeios e três para ingressos da VIA AIR.",
      },
      { property: "og:title", content: "Modelos de arte — Passeio e Ingresso | VIA AIR" },
      {
        property: "og:description",
        content: "Compare os modelos de arte de passeio e ingresso antes de publicar.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

const BASE: FeedArtData = {
  backgroundDataUrl: "",
  destino: "Orlando",
  estado: "Flórida",
  frase: "",
  dataIda: "",
  dataVolta: "",
  noites: 1,
  origem: "",
  hotel: "",
  estrelas: null,
  quantidadePessoas: 2,
  apartamento: "",
  parcelas: 10,
  valorTotal: 899.9,
  flexibleDates: true,
  dateMode: "flexible",
  inclusos: {
    aereo: false,
    hotel: false,
    cafeDaManha: false,
    bagagem23kg: false,
    transfer: false,
    seguroViagem: false,
    esimInternacional: false,
    ingressos: false,
    passeios: false,
    maisServicos: false,
  },
};

const PASSEIO: FeedArtData = {
  ...BASE,
  kind: "tour",
  title: "City Tour Panorâmico com Passeio de Barco e Almoço",
  destino: "Balneário Camboriú",
  estado: "Santa Catarina",
  valorTotal: 640,
  passeiosList: ["Guia acompanhante", "Transporte executivo", "Passeio de barco", "Almoço incluso"],
};

const INGRESSO: FeedArtData = {
  ...BASE,
  kind: "service",
  title: "Universal Studios — 3 Dias Park to Park",
  destino: "Orlando",
  estado: "Flórida",
  valorTotal: 1899,
  ticketsParks: ["Universal Studios", "Islands of Adventure", "Epic Universe"],
};

function Preview({ data, mode, variant }: { data: FeedArtData; mode: ArtMode; variant: ArtVariant }) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold text-foreground">
        {mode === "passeio" ? "Passeio" : "Ingresso"} — Modelo {variant}
      </p>
      <div
        className="overflow-hidden rounded-xl border border-border"
        style={{ width: 270, height: 480 }}
      >
        <div style={{ transform: "scale(0.25)", transformOrigin: "top left" }}>
          <StoryArtVariant data={data} mode={mode} variant={variant} />
        </div>
      </div>
    </div>
  );
}

function ArteModelosPage() {
  const [bg, setBg] = useState("");
  const passeio = { ...PASSEIO, backgroundDataUrl: bg };
  const ingresso = { ...INGRESSO, backgroundDataUrl: bg };

  return (
    <div className="space-y-8 p-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold text-foreground">Modelos de arte — Passeio e Ingresso</h1>
        <p className="text-sm text-muted-foreground">
          Mesma identidade (blur, laranja, estrutura), com a informação reorganizada. O título é sempre o
          nome do produto, com tamanho automático para nomes longos.
        </p>
        <div className="max-w-xl space-y-1">
          <Label htmlFor="bg">URL da imagem de fundo (opcional, para testar)</Label>
          <Input id="bg" value={bg} onChange={(e) => setBg(e.target.value)} placeholder="https://..." />
        </div>
      </header>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">Passeios</h2>
        <div className="flex flex-wrap gap-6">
          {([1, 2, 3] as ArtVariant[]).map((v) => (
            <Preview key={v} data={passeio} mode="passeio" variant={v} />
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">Ingressos</h2>
        <div className="flex flex-wrap gap-6">
          {([1, 2, 3] as ArtVariant[]).map((v) => (
            <Preview key={v} data={ingresso} mode="ingresso" variant={v} />
          ))}
        </div>
      </section>
    </div>
  );
}
