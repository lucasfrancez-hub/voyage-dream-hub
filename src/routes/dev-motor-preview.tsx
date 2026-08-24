import { createFileRoute } from "@tanstack/react-router";
import { CardVooSelecionado } from "@/components/pacote-motor/CardVooSelecionado";
import { CardHotelSelecionado } from "@/components/pacote-motor/CardHotelSelecionado";
import { SobreHotelModal } from "@/components/pacote-motor/SobreHotelModal";

export const Route = createFileRoute("/dev-motor-preview")({
  component: DevMotorPreview,
  head: () => ({
    meta: [{ title: "Preview interno do motor" }, { name: "robots", content: "noindex" }],
  }),
});

const voo: any = {
  id: "of1",
  precoTotal: 2380,
  ida: {
    companhia: "LATAM",
    companhiaIata: "LA",
    operadoPor: "LATAM",
    familiaTarifaria: "Light",
    classe: "Econômica",
    origem: "CWB",
    destino: "PUJ",
    partida: "2026-11-12T06:20:00",
    chegada: "2026-11-12T15:40:00",
    duracao: "9h20",
    duracaoMinutos: 560,
    numeroVoo: "3421",
    paradas: 1,
    escala: "1 parada",
    mudancaAeroporto: false,
    conexoes: [],
    bagagemDespachada: true,
    bagagemDespachadaQtd: 1,
    bagagemMao: true,
    servicos: [],
    precoTarifa: 1900,
    taxas: 480,
    ravValor: 0,
    ravPercentual: 0,
    incentivoValor: 0,
    incentivoPercentual: 0,
    precoTotal: 2380,
  },
  voltas: [
    {
      companhia: "LATAM",
      companhiaIata: "LA",
      operadoPor: "LATAM",
      familiaTarifaria: "Light",
      classe: "Econômica",
      origem: "PUJ",
      destino: "CWB",
      partida: "2026-11-19T17:10:00",
      chegada: "2026-11-20T07:05:00",
      duracao: "12h55",
      duracaoMinutos: 775,
      numeroVoo: "3422",
      paradas: 1,
      escala: "1 parada",
      mudancaAeroporto: false,
      conexoes: [],
      bagagemDespachada: true,
      bagagemDespachadaQtd: 1,
      bagagemMao: true,
      servicos: [],
      precoTarifa: 1900,
      taxas: 480,
      ravValor: 0,
      ravPercentual: 0,
      incentivoValor: 0,
      incentivoPercentual: 0,
      precoTotal: 2380,
    },
  ],
};

const hotel: any = {
  id: "h1",
  posicao: 0,
  pacoteExternoId: 1,
  nome: "Bahia Principe Grand Punta Cana",
  categoria: 5,
  avaliacao: 4.5,
  localizacao: "Punta Cana, República Dominicana",
  fotos: [
    "https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?w=1200",
    "https://images.unsplash.com/photo-1566073771259-6a8506099945?w=1200",
    "https://images.unsplash.com/photo-1571003123894-1f0594d2b5d9?w=1200",
    "https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?w=1200",
  ],
  beneficios: ["All inclusive", "Wi-Fi grátis"],
  regime: "All inclusive",
  reembolsavel: true,
  endereco: "Playa Bávaro, Punta Cana",
  descricao:
    "Resort all inclusive à beira-mar, com praia privativa, seis restaurantes temáticos, spa e clube infantil. Quartos amplos com varanda e vista jardim ou mar.",
  comodidades: ["Piscina", "Spa", "Academia", "Praia privativa", "Kids club", "Wi-Fi", "Estacionamento", "Bar"],
  politicas: ["Cancelamento grátis até 30 dias antes do check-in."],
  numAvaliacoes: 3120,
  recomendado: true,
  total: 9840,
  moeda: "BRL",
  quartos: [
    {
      id: "q1",
      nome: "Standard - 1 cama de casal",
      ocupacao: "2 adultos",
      regime: "All inclusive",
      reembolsavel: true,
      beneficios: ["Café da manhã"],
      politica: "Cancelamento grátis até 30 dias antes.",
      pesquisa: 1,
      valor: 9840,
      diferenca: 0,
    },
  ],
};

function DevMotorPreview() {
  return (
    <div className="mkt inset">
      <div className="shell" style={{ padding: 24 }}>
        <section className="screen active">
          <div className="title">
            <div>
              <h2>Pacote recomendado</h2>
              <p>Combinação recomendada com aéreo ida e volta + hospedagem.</p>
            </div>
            <span className="pill">2 adultos · 7 noites</span>
          </div>
          <div className="overview">
            <div className="overview-main">
              <div className="overview-grid">
                <CardVooSelecionado oferta={voo} carregando={false} aviso={null} onAlterar={() => {}} />
                <CardHotelSelecionado
                  hotel={hotel}
                  quarto={hotel.quartos[0]}
                  qtdQuartos={1}
                  checkin="2026-11-12"
                  checkout="2026-11-19"
                  noites={7}
                  carregando={false}
                  onAlterar={() => {}}
                />
              </div>
            </div>
          </div>
        </section>
        <div id="modal-alvo">
          <SobreHotelModal hotel={hotel} onFechar={() => {}} />
        </div>
      </div>
    </div>
  );
}
