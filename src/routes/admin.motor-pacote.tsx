import { createFileRoute } from "@tanstack/react-router";
import { MotorBuscaCF } from "@/components/comprefacil/MotorBuscaCF";
import { ConexaoCompreFacil } from "@/components/comprefacil/ConexaoCompreFacil";

export const Route = createFileRoute("/admin/motor-pacote")({
  head: () => ({
    meta: [
      { title: "Motor de Pacote CompreFácil | VIA AIR" },
      {
        name: "description",
        content:
          "Pesquise pacotes prontos da CompreFácil em tempo real: destino, saída, período, noites e preço, com resultados atualizados na operadora.",
      },
      { property: "og:title", content: "Motor de Pacote CompreFácil | VIA AIR" },
      {
        property: "og:description",
        content: "Busque pacotes da CompreFácil por destino, saída, período e preço.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MotorPacotePage,
});

function MotorPacotePage() {
  return (
    <div className="space-y-5 p-4 md:p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Motor de pacote</h1>
        <p className="text-sm text-muted-foreground">
          Pacotes prontos da CompreFácil — busca no catálogo com consulta ao vivo na operadora.
        </p>
      </header>
      <MotorBuscaCF />
    </div>
  );
}
