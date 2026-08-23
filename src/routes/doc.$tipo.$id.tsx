/**
 * Documento público VIA AIR (Plano de Viagem / Comprovante de reserva /
 * Bilhete eletrônico). Fica fora do painel admin: abre no navegador,
 * imprime, salva em PDF e compartilha no WhatsApp.
 */
import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Printer, Share2 } from "lucide-react";
import { comprovantePublico } from "@/lib/docs/comprovante.functions";
import { ComprovanteReserva } from "@/components/passhub/ComprovanteReserva";

export const Route = createFileRoute("/doc/$tipo/$id")({
  component: DocumentoPublicoPage,
  head: () => ({
    meta: [
      { title: "Documento da sua viagem | VIA AIR" },
      {
        name: "description",
        content:
          "Plano de viagem e bilhete eletrônico VIA AIR: itinerário, passageiros, bagagem e valores em um só documento.",
      },
      { property: "og:title", content: "Documento da sua viagem | VIA AIR" },
      {
        property: "og:description",
        content: "Itinerário, passageiros e bilhetes da sua viagem VIA AIR.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
});

function DocumentoPublicoPage() {
  const { tipo, id } = Route.useParams();
  const [token, setToken] = useState<string | null>(null);
  const [semValores, setSemValores] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const carregar = useServerFn(comprovantePublico);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    setToken(p.get("t"));
    setSemValores(p.get("valores") === "0");
  }, []);

  const { data, isLoading } = useQuery({
    queryKey: ["doc-publico", tipo, id, token],
    enabled: !!token,
    queryFn: () =>
      carregar({ data: { tipo: tipo as "reserva" | "bilhete" | "pedido", id, token: token! } }),
  });

  const titulo =
    tipo === "bilhete" ? "Bilhete eletrônico VIA AIR" : "Plano de viagem VIA AIR";

  async function compartilhar() {
    const url = window.location.href;
    const texto = `${titulo} — acesse: ${url}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: titulo, text: titulo, url });
        return;
      } catch {
        /* usuário cancelou — segue para o WhatsApp */
      }
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, "_blank", "noopener");
  }

  async function copiarLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      /* ignora */
    }
  }

  if (!token) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6 text-center text-sm">
        Link inválido. Peça um novo link ao seu consultor VIA AIR.
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center gap-2 text-sm">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando documento…
      </div>
    );
  }

  if (!data?.ok) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6 text-center text-sm">
        {(data && "erro" in data && data.erro) || "Documento não encontrado."}
      </div>
    );
  }

  return (
    <div style={{ background: "#eef2f5", minHeight: "100vh", padding: "16px 0 26px" }}>
      <div className="no-print mx-auto mb-4 flex w-[900px] max-w-[calc(100%-20px)] flex-wrap items-center justify-end gap-2">
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-black/10 bg-white px-3 py-2 text-[12px] font-bold text-slate-700 shadow-sm">
          <input
            type="checkbox"
            checked={semValores}
            onChange={(e) => setSemValores(e.target.checked)}
          />
          Sem valores
        </label>
        <button
          type="button"
          onClick={copiarLink}
          className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white px-4 py-2 text-[13px] font-bold text-slate-700 shadow-sm"
        >
          {copiado ? "Link copiado!" : "Copiar link"}
        </button>
        <button
          type="button"
          onClick={compartilhar}
          className="inline-flex items-center gap-2 rounded-full bg-[#25D366] px-4 py-2 text-[13px] font-bold text-white shadow"
        >
          <Share2 className="h-4 w-4" /> Compartilhar
        </button>
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-[13px] font-bold text-primary-foreground shadow"
        >
          <Printer className="h-4 w-4" /> Imprimir / salvar PDF
        </button>
      </div>
      <ComprovanteReserva dados={{ ...data.dados, ocultarValores: semValores }} />
    </div>
  );
}
