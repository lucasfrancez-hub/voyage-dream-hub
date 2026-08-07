import { createFileRoute } from "@tanstack/react-router";
import { PackageFeedArt, type FeedArtData } from "@/components/packages/PackageFeedArt";
import { PackageStoryArt } from "@/components/packages/PackageStoryArt";
import { StoryArtVariant } from "@/components/packages/StoryArtVariants";

export const Route = createFileRoute("/preview-selo")({ component: P });

const BG = "https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=1200&q=70";

const BASE: FeedArtData = {
  backgroundDataUrl: BG,
  destino: "Buenos Aires",
  estado: "Argentina",
  frase: "Tango, parrilla e ruas que contam histórias",
  dataIda: "12/09/2026",
  dataVolta: "17/09/2026",
  noites: 5,
  origem: "Curitiba",
  hotel: "Hotel Panamericano",
  estrelas: 4,
  quantidadePessoas: 2,
  apartamento: "Duplo",
  parcelas: 10,
  valorTotal: 3890.5,
  flexibleDates: false,
  dateMode: "fixed",
  inclusos: {
    aereo: true,
    hotel: true,
    cafeDaManha: true,
    bagagem23kg: true,
    transfer: true,
    seguroViagem: true,
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

function Box({ w, h, children }: { w: number; h: number; children: React.ReactNode }) {
  const s = 1;
  return (
    <div style={{ width: w * s, height: h * s, overflow: "hidden" }}>
      <div style={{ transform: `scale(${s})`, transformOrigin: "top left" }}>{children}</div>
    </div>
  );
}

function P() {
  return (
    <div style={{ display: "flex", gap: 24, padding: 24, background: "#0b1116", alignItems: "flex-start" }}>
      <Box w={1080} h={1440}>
        <PackageFeedArt data={BASE} />
      </Box>
      <Box w={1080} h={1920}>
        <PackageStoryArt data={BASE} />
      </Box>
      <Box w={1080} h={1920}>
        <StoryArtVariant data={PASSEIO} mode="passeio" variant={2} format="story" />
      </Box>
    </div>
  );
}
