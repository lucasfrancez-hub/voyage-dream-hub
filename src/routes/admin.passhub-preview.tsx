import { createFileRoute } from "@tanstack/react-router";
import { ResultadosPassHub, type FiltrosMotor } from "@/components/passhub/ResultadosPassHub";
import type { PassHubResultado } from "@/lib/passhub/types";

const mock: PassHubResultado = {
  pagina: 1,
  porPagina: 10,
  total: 3,
  totalPaginas: 1,
  companhias: ["LATAM", "GOL"],
  familias: ["Adulto"],
  precoMin: 768.14,
  precoMax: 1890.2,
  ofertas: [
    {
      id: "1",
      precoTotal: 1240.5,
      ida: {
        companhia: "LATAM",
        companhiaIata: "LA",
        operadoPor: "",
        familiaTarifaria: "Adulto",
        classe: "Econômica",
        origem: "MGF",
        destino: "MCZ",
        partida: "2026-09-15 19:40",
        chegada: "2026-09-16 02:00",
        duracao: "06h20",
        duracaoMinutos: 380,
        numeroVoo: "LA 3217/LA 3198",
        paradas: 1,
        escala: "GRU",
        mudancaAeroporto: false,
        conexoes: [
          {
            aeroporto: "GRU",
            chegada: "2026-09-15 21:00",
            saida: "2026-09-15 23:10",
            duracao: "02h10",
            mudancaAeroporto: false,
          },
        ],
        bagagemDespachada: false,
        bagagemDespachadaQtd: 0,
        bagagemMao: true,
        servicos: [],
        precoTotal: 1240.5,
        precoTarifa: 980,
        taxas: 160.5,
        ravValor: 100,
        ravPercentual: 10,
        provedor: "PassHub",
        canal: "API",
        rateToken: "token1",
        parcelamento: [],
      },
      voltas: [],
    },
    {
      id: "2",
      precoTotal: 1890.2,
      ida: {
        companhia: "GOL",
        companhiaIata: "G3",
        operadoPor: "",
        familiaTarifaria: "PROMO",
        classe: "Econômica",
        origem: "MGF",
        destino: "CGH",
        partida: "2026-09-15 10:15",
        chegada: "2026-09-15 11:30",
        duracao: "01h15",
        duracaoMinutos: 75,
        numeroVoo: "G3 1244",
        paradas: 0,
        escala: "",
        mudancaAeroporto: false,
        conexoes: [],
        bagagemDespachada: true,
        bagagemDespachadaQtd: 1,
        bagagemMao: true,
        servicos: [],
        precoTotal: 1890.2,
        precoTarifa: 1500,
        taxas: 240.2,
        ravValor: 150,
        ravPercentual: 10,
        provedor: "PassHub",
        canal: "API",
        rateToken: "token2",
        parcelamento: [],
      },
      voltas: [],
    },
    {
      id: "3",
      precoTotal: 2100,
      ida: {
        companhia: "LATAM",
        companhiaIata: "LA",
        operadoPor: "",
        familiaTarifaria: "Adulto",
        classe: "Econômica",
        origem: "MGF",
        destino: "REC",
        partida: "2026-09-15 08:00",
        chegada: "2026-09-15 14:30",
        duracao: "06h30",
        duracaoMinutos: 390,
        numeroVoo: "LA 100/LA 200/LA 300",
        paradas: 2,
        escala: "GRU,CNF",
        mudancaAeroporto: true,
        conexoes: [
          {
            aeroporto: "GRU",
            chegada: "2026-09-15 09:30",
            saida: "2026-09-15 11:00",
            duracao: "01h30",
            mudancaAeroporto: false,
          },
          {
            aeroporto: "CNF",
            chegada: "2026-09-15 12:10",
            saida: "2026-09-15 13:00",
            duracao: "00h50",
            mudancaAeroporto: false,
          },
        ],
        bagagemDespachada: false,
        bagagemDespachadaQtd: 0,
        bagagemMao: true,
        servicos: [],
        precoTotal: 2100,
        precoTarifa: 1600,
        taxas: 300,
        ravValor: 200,
        ravPercentual: 10,
        provedor: "PassHub",
        canal: "API",
        rateToken: "token3",
        parcelamento: [],
      },
      voltas: [],
    },
  ],
};

const filtros: FiltrosMotor = {
  ordem: "preco",
  mostrar: 10,
  bagagem: "todas",
  direto: false,
  companhias: [],
};

export const Route = createFileRoute("/admin/passhub-preview")({
  component: () => (
    <div className="cons-shell p-6">
      <h1 className="mb-6 text-2xl font-black">Preview — Itinerário</h1>
      <ResultadosPassHub
        resultado={mock}
        filtros={filtros}
        ravPercentual={10}
        onReservar={(o) => console.log("reservar", o.id)}
      />
    </div>
  ),
});
