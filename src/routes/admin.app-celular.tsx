import { createFileRoute } from "@tanstack/react-router";
import { Smartphone } from "lucide-react";
import { AppNoCelularCard } from "@/components/chat/AppNoCelularCard";

export const Route = createFileRoute("/admin/app-celular")({
  ssr: false,
  component: AppCelularPage,
  head: () => ({
    meta: [
      { title: "App no celular — VIA AIR" },
      { name: "description", content: "Gere o link secreto para abrir o painel Admin da VIA AIR no celular." },
      { property: "og:title", content: "App no celular — VIA AIR" },
      { property: "og:description", content: "Gere o link secreto para abrir o painel Admin da VIA AIR no celular." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

function AppCelularPage() {
  return (
    <div className="mx-auto w-full max-w-xl space-y-4 p-4">
      <header className="flex items-center gap-2">
        <Smartphone className="h-5 w-5 text-brand-orange" />
        <div>
          <h1 className="text-lg font-semibold text-foreground">App no celular</h1>
          <p className="text-xs text-muted-foreground">
            Crie um link secreto com PIN para abrir somente o painel Admin, sem login ou autenticador.
          </p>
        </div>
      </header>

      <AppNoCelularCard destino="admin" />
    </div>
  );
}
