import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { TopBar } from "@/components/TopBar";
import { ContactFooter } from "@/components/ContactFooter";

export const Route = createFileRoute("/visto-americano/$token")({
  head: () => ({
    meta: [
      { title: "Visto Americano — Formulário DS-160 | VIA AIR" },
      {
        name: "description",
        content:
          "Preencha o formulário de apoio ao DS-160 do visto americano com a VIA AIR: passo a passo guiado, salvamento automático e acompanhamento da equipe.",
      },
      { property: "og:title", content: "Visto Americano — Formulário DS-160 | VIA AIR" },
      {
        property: "og:description",
        content:
          "Formulário guiado de apoio ao DS-160 do visto americano, com salvamento automático e suporte da VIA AIR.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: VistoAmericanoPage,
});

function VistoAmericanoPage() {
  const { token } = Route.useParams();
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(1600);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      const data = event.data as { type?: string; height?: number } | null;
      if (!data || data.type !== "viaair-visto-height") return;
      if (typeof data.height === "number" && data.height > 400) {
        setHeight(Math.ceil(data.height) + 24);
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <TopBar />
      <main>
        <iframe
          ref={frameRef}
          title="Formulário de apoio ao DS-160"
          src={`/visto-americano/${token}/form`}
          style={{ height }}
          className="block w-full border-0"
        />
      </main>
      <ContactFooter />
    </div>
  );
}
