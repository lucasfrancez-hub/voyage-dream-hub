import { createFileRoute } from "@tanstack/react-router";
import { SearchEngine } from "./admin.buscar";

export const Route = createFileRoute("/admin/motor-pacote")({
  head: () => ({
    meta: [
      { title: "Motor de Pacote — Aéreo + Hotel | VIA AIR" },
      {
        name: "description",
        content:
          "Monte pacotes VIA AIR combinando aéreo e hospedagem em tempo real, com pacote recomendado e troca de voo ou hotel.",
      },
      { property: "og:title", content: "Motor de Pacote — Aéreo + Hotel | VIA AIR" },
      {
        property: "og:description",
        content: "Pesquise aéreo + hotel juntos e altere voo ou hospedagem em um clique.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MotorPacotePage,
});

function MotorPacotePage() {
  return <SearchEngine initialMode="combo" />;
}
