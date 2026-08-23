/**
 * Plano de viagem (comprovante de reserva aérea) em página própria,
 * pronta para impressão / download em PDF.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Printer } from "lucide-react";
import { passhubReservaDetalhe } from "@/lib/passhub/passhub.functions";
import {
  ComprovanteReserva,
  type ComprovanteReservaDados,
  type ComprovanteVoo,
} from "@/components/passhub/ComprovanteReserva";
import type { PassHubReservaLista } from "@/lib/passhub/types";

export const Route = createFileRoute("/admin/reservas_/$id/plano-viagem")({
  component: PlanoViagemPage,
  head: () => ({
    meta: [
      { title: "Plano de viagem — Comprovante de reserva | VIA AIR" },
      {
        name: "description",
        content:
          "Comprovante de reserva aérea VIA AIR com itinerário completo, passageiros, bagagem e valores.",
      },
      { property: "og:title", content: "Plano de viagem — Comprovante de reserva | VIA AIR" },
      {
        property: "og:description",
        content: "Itinerário, passageiros e valores da reserva aérea VIA AIR.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
});

function tituloGrupo(indice: number, total: number, temVolta: boolean): string {
  if (total <= 1) return "IDA";
  if (total === 2 && temVolta) return indice === 0 ? "IDA" : "VOLTA";
  return `TRECHO ${indice + 1}`;
}

function paraComprovante(r: PassHubReservaLista): ComprovanteReservaDados {
  const emitido = Boolean(r.emitidaEm) || ["ISSUED", "EMITIDA", "EMITIDO"].includes(
    (r.status || "").toUpperCase(),
  );

  const grupos = (r.segmentos ?? []).map((s, i) => {
    const bagagem = {
      itemPessoal: true,
      mao: s.bagagemMao,
      despachada: s.bagagemDespachada,
      despachadaQtd: s.bagagemDespachadaQtd,
    };
    const conexoes = s.conexoes?.length
      ? s.conexoes
      : [
          {
            origem: s.origem,
            destino: s.destino,
            partida: s.partida,
            chegada: s.chegada,
            duracao: s.duracao,
            numeroVoo: "",
            familiaTarifaria: "",
            classe: "",
            companhia: r.companhia,
          },
        ];
    const voos: ComprovanteVoo[] = conexoes.map((c) => ({
      companhia: c.companhia || r.companhia,
      numeroVoo: c.numeroVoo,
      origem: c.origem,
      destino: c.destino,
      partida: c.partida,
      chegada: c.chegada,
      duracao: c.duracao,
      classe: c.classe,
      familiaTarifaria: c.familiaTarifaria,
      bagagem,
    }));
    return {
      titulo: tituloGrupo(i, (r.segmentos ?? []).length, Boolean(r.dataVolta)),
      voos,
    };
  });

  return {
    emitido,
    localizador: r.localizador || String(r.idPassagem),
    localizadorCompanhia: r.localizadorCompanhia,
    companhia: r.companhia,
    criadaEm: r.criadaEm,
    consultor: r.emissor,
    origem: r.origem,
    destino: r.destino,
    limiteEmissao: r.limiteEmissao,
    total: r.totalVenda || r.preco,
    passageiros: (r.passageirosDetalhe?.length
      ? r.passageirosDetalhe.map((p) => ({
          nome: p.nome,
          tipo: p.tipo,
          documento: p.documento,
          documentoTipo: p.documentoTipo,
          nascimento: p.nascimento,
        }))
      : (r.passageiros ?? []).map((nome) => ({ nome, tipo: "ADT" }))
    ).map((p) => ({ ...p })),
    grupos,
  };
}

function PlanoViagemPage() {
  const { id } = Route.useParams();
  const [semValores, setSemValores] = useState(false);
  const detalheFn = useServerFn(passhubReservaDetalhe);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    setSemValores(p.get("valores") === "0");
  }, []);

  const { data, isLoading } = useQuery({
    queryKey: ["passhub-reserva-plano", id],
    queryFn: () => detalheFn({ data: { id: Number(id) } }),
  });

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center gap-2 text-sm">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando plano de viagem…
      </div>
    );
  }

  if (!data?.ok || !data.reserva) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6 text-sm">
        {(data && "erro" in data && data.erro) || "Reserva não encontrada."}
      </div>
    );
  }

  return (
    <div style={{ background: "#eef2f5", minHeight: "100vh", padding: "22px 0" }}>
      <div className="no-print mx-auto mb-4 flex w-[900px] max-w-[calc(100%-24px)] justify-end">
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-[13px] font-bold text-primary-foreground shadow"
        >
          <Printer className="h-4 w-4" /> Imprimir / salvar PDF
        </button>
      </div>
      <ComprovanteReserva dados={paraComprovante(data.reserva)} />
    </div>
  );
}
