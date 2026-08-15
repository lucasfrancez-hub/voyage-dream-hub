// Dados 100% mockados — ambiente de estudo de UI de Cruzeiros.
// Nada aqui toca o backend, o banco ou as telas em produção.

export const img = (seed: string, w = 1200, h = 800) =>
  `https://picsum.photos/seed/${encodeURIComponent(seed)}/${w}/${h}`;

export const cruise = {
  nome: "Encantos do Mediterrâneo",
  navio: "MSC Seaview",
  operadora: "MSC Cruzeiros",
  noites: 11,
  embarque: "Barcelona (Espanha)",
  desembarque: "Barcelona (Espanha)",
  saida: "12 de outubro de 2026",
  volta: "23 de outubro de 2026",
  portos: 8,
  paises: 4,
  precoDesde: 8490,
  taxasDesde: 1290,
  bandeira: "Panamá",
  resumo:
    "Onze noites navegando pelo coração do Mediterrâneo, com pernoites em Roma e Ibiza, gastronomia assinada e um dos navios mais premiados da frota MSC. Roteiro pensado para quem quer conhecer muito sem desfazer as malas.",
  destaques: [
    "Pernoite em Civitavecchia (Roma)",
    "Wi-Fi de bordo incluso no pacote Premium",
    "Pensão completa + bebidas no jantar",
    "Traslados aeroporto ⇄ porto inclusos",
    "Assistência VIA AIR 24h em português",
  ],
  incluso: [
    "Hospedagem a bordo na categoria escolhida",
    "Café da manhã, almoço, jantar e lanches",
    "Shows e entretenimento noturno",
    "Academia, piscinas e áreas de lazer",
  ],
  naoIncluso: [
    "Taxas portuárias e de serviço",
    "Passagens aéreas até Barcelona",
    "Excursões em terra",
    "Bebidas alcoólicas fora do pacote",
  ],
  galeriaHero: [img("cruise-hero-1", 1800, 1000), img("cruise-hero-2", 1800, 1000), img("cruise-hero-3", 1800, 1000)],
};

export type Parada = {
  dia: number;
  data: string;
  porto: string;
  pais: string;
  chegada: string;
  saida: string;
  tipo: "embarque" | "porto" | "mar" | "desembarque";
  foto: string;
  descricao: string;
  passeios: { nome: string; duracao: string; preco: number }[];
};

export const itinerario: Parada[] = [
  {
    dia: 1, data: "12/10", porto: "Barcelona", pais: "Espanha", chegada: "—", saida: "18:00", tipo: "embarque",
    foto: img("port-barcelona"), descricao: "Embarque a partir das 13h no Porto de Barcelona. Coquetel de boas-vindas ao pôr do sol.",
    passeios: [{ nome: "Sagrada Família + Park Güell", duracao: "4h", preco: 320 }],
  },
  {
    dia: 2, data: "13/10", porto: "Marselha", pais: "França", chegada: "08:00", saida: "18:00", tipo: "porto",
    foto: img("port-marseille"), descricao: "O maior porto francês, portal para a Provence e para as calanques de calcário.",
    passeios: [
      { nome: "Calanques de barco", duracao: "3h30", preco: 410 },
      { nome: "Aix-en-Provence", duracao: "5h", preco: 380 },
    ],
  },
  {
    dia: 3, data: "14/10", porto: "Gênova", pais: "Itália", chegada: "07:00", saida: "17:00", tipo: "porto",
    foto: img("port-genova"), descricao: "Centro histórico patrimônio da UNESCO e o maior aquário da Europa.",
    passeios: [{ nome: "Portofino & Santa Margherita", duracao: "6h", preco: 520 }],
  },
  {
    dia: 4, data: "15/10", porto: "Civitavecchia (Roma)", pais: "Itália", chegada: "07:00", saida: "—", tipo: "porto",
    foto: img("port-rome"), descricao: "Pernoite a bordo: dois dias inteiros para explorar Roma sem correria.",
    passeios: [
      { nome: "Roma clássica", duracao: "8h", preco: 640 },
      { nome: "Vaticano sem fila", duracao: "5h", preco: 590 },
    ],
  },
  {
    dia: 5, data: "16/10", porto: "Civitavecchia (Roma)", pais: "Itália", chegada: "—", saida: "19:00", tipo: "porto",
    foto: img("port-rome-2"), descricao: "Segundo dia em Roma. Saída no início da noite.",
    passeios: [{ nome: "Roma gastronômica", duracao: "4h", preco: 430 }],
  },
  {
    dia: 6, data: "17/10", porto: "Navegação", pais: "—", chegada: "—", saida: "—", tipo: "mar",
    foto: img("sea-day"), descricao: "Dia no mar: spa, aulas de culinária, piscina aquecida e show no teatro.",
    passeios: [],
  },
  {
    dia: 7, data: "18/10", porto: "Palermo", pais: "Itália", chegada: "09:00", saida: "18:00", tipo: "porto",
    foto: img("port-palermo"), descricao: "Sicília em estado puro: mercados, catedrais normandas e street food.",
    passeios: [{ nome: "Monreale & mercados", duracao: "4h", preco: 290 }],
  },
  {
    dia: 8, data: "19/10", porto: "Valletta", pais: "Malta", chegada: "08:00", saida: "17:00", tipo: "porto",
    foto: img("port-valletta"), descricao: "Cidade fortificada com vista para o Grande Porto.",
    passeios: [{ nome: "Mdina, a cidade silenciosa", duracao: "4h", preco: 310 }],
  },
  {
    dia: 9, data: "20/10", porto: "Navegação", pais: "—", chegada: "—", saida: "—", tipo: "mar",
    foto: img("sea-day-2"), descricao: "Dia no mar com noite de gala e jantar do comandante.",
    passeios: [],
  },
  {
    dia: 10, data: "21/10", porto: "Ibiza", pais: "Espanha", chegada: "10:00", saida: "23:00", tipo: "porto",
    foto: img("port-ibiza"), descricao: "Escala longa: praia de dia, Dalt Vila e pôr do sol em Sant Antoni.",
    passeios: [{ nome: "Formentera de catamarã", duracao: "6h", preco: 560 }],
  },
  {
    dia: 11, data: "22/10", porto: "Valência", pais: "Espanha", chegada: "08:00", saida: "17:00", tipo: "porto",
    foto: img("port-valencia"), descricao: "Cidade das Artes e Ciências e o berço da paella.",
    passeios: [{ nome: "Paella experience", duracao: "4h", preco: 340 }],
  },
  {
    dia: 12, data: "23/10", porto: "Barcelona", pais: "Espanha", chegada: "07:00", saida: "—", tipo: "desembarque",
    foto: img("port-barcelona-2"), descricao: "Desembarque a partir das 07h com traslado ao aeroporto incluso.",
    passeios: [],
  },
];

export type Cabine = {
  id: string;
  familia: "Interna" | "Externa" | "Varanda" | "Suíte";
  nome: string;
  area: string;
  ocupacao: string;
  decks: string;
  preco: number;
  taxas: number;
  fotos: string[];
  amenidades: string[];
  descricao: string;
  disponiveis: number;
};

const fotos = (s: string) => [img(`${s}-a`), img(`${s}-b`), img(`${s}-c`), img(`${s}-d`)];

export const cabines: Cabine[] = [
  { id: "int-gar", familia: "Interna", nome: "Interna Garantida", area: "14 m²", ocupacao: "2 a 4 hóspedes", decks: "5, 8, 9", preco: 8490, taxas: 1290, fotos: fotos("cab-int-gar"), amenidades: ["Ar-condicionado", "TV interativa", "Cofre", "Frigobar"], descricao: "Categoria mais econômica. O número da cabine é atribuído pela companhia até 30 dias antes do embarque.", disponiveis: 12 },
  { id: "int-std", familia: "Interna", nome: "Interna Standard", area: "15 m²", ocupacao: "2 a 4 hóspedes", decks: "8, 9, 10", preco: 9190, taxas: 1290, fotos: fotos("cab-int-std"), amenidades: ["Ar-condicionado", "TV interativa", "Cofre", "Frigobar", "Escolha do número"], descricao: "Você escolhe a localização exata da cabine no deck plan.", disponiveis: 8 },
  { id: "int-sup", familia: "Interna", nome: "Interna Superior", area: "16 m²", ocupacao: "2 a 3 hóspedes", decks: "11, 12", preco: 9890, taxas: 1290, fotos: fotos("cab-int-sup"), amenidades: ["Decks altos", "Sofá-cama", "Frigobar", "Amenities premium"], descricao: "Nos decks mais altos, próxima às áreas de lazer.", disponiveis: 4 },
  { id: "int-fam", familia: "Interna", nome: "Interna Família", area: "21 m²", ocupacao: "até 5 hóspedes", decks: "9", preco: 11240, taxas: 1290, fotos: fotos("cab-int-fam"), amenidades: ["Beliches", "Cortina divisória", "Banheiro ampliado"], descricao: "Layout pensado para famílias com crianças.", disponiveis: 2 },

  { id: "ext-gar", familia: "Externa", nome: "Externa Garantida", area: "16 m²", ocupacao: "2 a 4 hóspedes", decks: "5, 6", preco: 10390, taxas: 1290, fotos: fotos("cab-ext-gar"), amenidades: ["Janela panorâmica", "Frigobar", "Cofre"], descricao: "Cabine com janela, número atribuído pela companhia.", disponiveis: 9 },
  { id: "ext-std", familia: "Externa", nome: "Externa Standard", area: "17 m²", ocupacao: "2 a 4 hóspedes", decks: "6, 7", preco: 11090, taxas: 1290, fotos: fotos("cab-ext-std"), amenidades: ["Janela panorâmica", "Sofá", "Frigobar"], descricao: "Vista para o mar através de janela ampla.", disponiveis: 6 },
  { id: "ext-vo", familia: "Externa", nome: "Externa Vista Obstruída", area: "17 m²", ocupacao: "2 hóspedes", decks: "6", preco: 9990, taxas: 1290, fotos: fotos("cab-ext-vo"), amenidades: ["Janela", "Frigobar"], descricao: "Mesma metragem, com obstrução parcial por equipamentos do navio — e preço menor.", disponiveis: 3 },

  { id: "var-gar", familia: "Varanda", nome: "Varanda Garantida", area: "19 m² + 4 m²", ocupacao: "2 a 4 hóspedes", decks: "9 a 12", preco: 12890, taxas: 1390, fotos: fotos("cab-var-gar"), amenidades: ["Varanda privativa", "Mesa externa", "Frigobar"], descricao: "Varanda privativa com número atribuído pela companhia.", disponiveis: 14 },
  { id: "var-std", familia: "Varanda", nome: "Varanda Standard", area: "20 m² + 5 m²", ocupacao: "2 a 4 hóspedes", decks: "10, 11", preco: 13590, taxas: 1390, fotos: fotos("cab-var-std"), amenidades: ["Varanda privativa", "Sofá-cama", "Roupão", "Amenities premium"], descricao: "A categoria mais procurada do navio.", disponiveis: 7 },
  { id: "var-pre", familia: "Varanda", nome: "Varanda Premium Ampla", area: "22 m² + 9 m²", ocupacao: "2 a 4 hóspedes", decks: "12", preco: 15240, taxas: 1390, fotos: fotos("cab-var-pre"), amenidades: ["Varanda estendida", "Espreguiçadeiras", "Cafeteira", "Jantar em cabine"], descricao: "Varanda quase o dobro do tamanho padrão.", disponiveis: 3 },
  { id: "var-aur", familia: "Varanda", nome: "Varanda Aurea (all inclusive)", area: "20 m² + 5 m²", ocupacao: "2 hóspedes", decks: "11, 12", preco: 17980, taxas: 1390, fotos: fotos("cab-var-aur"), amenidades: ["Pacote de bebidas", "Wi-Fi ilimitado", "Embarque prioritário", "Área exclusiva"], descricao: "Experiência Aurea com benefícios all inclusive.", disponiveis: 5 },

  { id: "sui-jr", familia: "Suíte", nome: "Junior Suite", area: "28 m² + 7 m²", ocupacao: "2 a 3 hóspedes", decks: "12", preco: 19890, taxas: 1590, fotos: fotos("cab-sui-jr"), amenidades: ["Sala de estar", "Banheira", "Mordomo diurno", "Área exclusiva"], descricao: "Primeira categoria de suíte, com sala separada.", disponiveis: 4 },
  { id: "sui-gr", familia: "Suíte", nome: "Grand Suite", area: "38 m² + 12 m²", ocupacao: "2 a 4 hóspedes", decks: "14", preco: 26490, taxas: 1690, fotos: fotos("cab-sui-gr"), amenidades: ["Mordomo 24h", "Jacuzzi na varanda", "Restaurante exclusivo", "Transfer privativo", "Wi-Fi ilimitado"], descricao: "Suíte com jacuzzi privativa na varanda e acesso ao restaurante exclusivo do Yacht Club.", disponiveis: 2 },
  { id: "sui-own", familia: "Suíte", nome: "Owner's Suite", area: "58 m² + 24 m²", ocupacao: "2 a 6 hóspedes", decks: "16", preco: 41900, taxas: 1890, fotos: fotos("cab-sui-own"), amenidades: ["Dois ambientes", "Piano", "Mordomo 24h", "Chef privativo (sob consulta)", "Deck solarium privativo"], descricao: "A cabine mais exclusiva do navio, na proa do deck 16.", disponiveis: 1 },
  { id: "sui-dup", familia: "Suíte", nome: "Duplex Suite", area: "72 m² + 30 m²", ocupacao: "até 8 hóspedes", decks: "15/16", preco: 58400, taxas: 1890, fotos: fotos("cab-sui-dup"), amenidades: ["Dois andares", "Piscina privativa", "Mordomo 24h", "Sala de jantar"], descricao: "Dois andares, piscina privativa e sala de jantar para oito pessoas.", disponiveis: 1 },
];

export const familias = ["Interna", "Externa", "Varanda", "Suíte"] as const;

export const decks = [
  { numero: 16, nome: "Deck 16 — Sun", cabines: 12, destaques: ["Owner's Suite", "Solarium"], mapa: img("deck-16", 1600, 700) },
  { numero: 15, nome: "Deck 15 — Yacht Club", cabines: 38, destaques: ["Duplex Suites", "Piscina privativa", "Lounge"], mapa: img("deck-15", 1600, 700) },
  { numero: 14, nome: "Deck 14 — Grand", cabines: 64, destaques: ["Grand Suites", "Spa", "Academia"], mapa: img("deck-14", 1600, 700) },
  { numero: 12, nome: "Deck 12 — Panorama", cabines: 142, destaques: ["Varandas Premium", "Buffet", "Piscina principal"], mapa: img("deck-12", 1600, 700) },
  { numero: 11, nome: "Deck 11 — Marina", cabines: 168, destaques: ["Varandas", "Bar do mar"], mapa: img("deck-11", 1600, 700) },
  { numero: 9, nome: "Deck 9 — Atlântico", cabines: 190, destaques: ["Internas Família", "Kids Club"], mapa: img("deck-9", 1600, 700) },
  { numero: 7, nome: "Deck 7 — Promenade", cabines: 120, destaques: ["Teatro", "Cassino", "Galeria de lojas"], mapa: img("deck-7", 1600, 700) },
  { numero: 5, nome: "Deck 5 — Embarque", cabines: 96, destaques: ["Recepção", "Terminal de embarque"], mapa: img("deck-5", 1600, 700) },
];

export const atracoes = [
  { nome: "Aquapark Jungle", categoria: "Diversão", deck: "16", foto: img("atr-aquapark"), desc: "Quatro toboáguas, incluindo o mais longo da frota, e área de jatos para crianças.", horario: "09h às 18h", incluso: true },
  { nome: "Teatro Astoria", categoria: "Entretenimento", deck: "6 e 7", foto: img("atr-teatro"), desc: "Espetáculos diários com elenco internacional e duas sessões por noite.", horario: "21h e 23h", incluso: true },
  { nome: "MSC Aurea Spa", categoria: "Bem-estar", deck: "14", foto: img("atr-spa"), desc: "Termas balinesas, sauna, hammam e 12 salas de tratamento.", horario: "08h às 22h", incluso: false },
  { nome: "Zipline sobre o mar", categoria: "Aventura", deck: "18", foto: img("atr-zipline"), desc: "105 metros de tirolesa suspensa sobre a lateral do navio.", horario: "10h às 17h", incluso: false },
  { nome: "Butcher's Cut", categoria: "Gastronomia", deck: "8", foto: img("atr-steak"), desc: "Steakhouse americana com cortes premium e carta de vinhos.", horario: "18h às 23h", incluso: false },
  { nome: "Kaito Sushi Bar", categoria: "Gastronomia", deck: "8", foto: img("atr-sushi"), desc: "Sushi bar com teppanyaki e menu degustação.", horario: "18h às 23h", incluso: false },
  { nome: "Doremi Kids Club", categoria: "Família", deck: "15", foto: img("atr-kids"), desc: "Áreas separadas por faixa etária, em parceria com LEGO e Chicco.", horario: "09h às 22h", incluso: true },
  { nome: "Piscina Panorâmica", categoria: "Diversão", deck: "16", foto: img("atr-pool"), desc: "Piscina com teto retrátil e vista 180° para o mar.", horario: "07h às 20h", incluso: true },
  { nome: "Cassino Veneza", categoria: "Entretenimento", deck: "7", foto: img("atr-casino"), desc: "Mesas de blackjack, roleta e 140 slots.", horario: "20h às 03h", incluso: false },
];

export const galeria = [
  { titulo: "Fachada do navio", cat: "Navio", src: img("gal-1") },
  { titulo: "Piscina principal", cat: "Áreas comuns", src: img("gal-2") },
  { titulo: "Suíte Grand", cat: "Cabines", src: img("gal-3") },
  { titulo: "Restaurante principal", cat: "Gastronomia", src: img("gal-4") },
  { titulo: "Teatro Astoria", cat: "Áreas comuns", src: img("gal-5") },
  { titulo: "Varanda Premium", cat: "Cabines", src: img("gal-6") },
  { titulo: "Spa termal", cat: "Áreas comuns", src: img("gal-7") },
  { titulo: "Sushi bar", cat: "Gastronomia", src: img("gal-8") },
  { titulo: "Pôr do sol em Ibiza", cat: "Destinos", src: img("gal-9") },
  { titulo: "Valletta ao amanhecer", cat: "Destinos", src: img("gal-10") },
  { titulo: "Aquapark", cat: "Áreas comuns", src: img("gal-11") },
  { titulo: "Interna Standard", cat: "Cabines", src: img("gal-12") },
  { titulo: "Buffet Marketplace", cat: "Gastronomia", src: img("gal-13") },
  { titulo: "Roma — Coliseu", cat: "Destinos", src: img("gal-14") },
  { titulo: "Deck solarium", cat: "Navio", src: img("gal-15") },
  { titulo: "Proa ao entardecer", cat: "Navio", src: img("gal-16") },
];

export const videos = [
  { titulo: "Tour completo pelo MSC Seaview", dur: "8:42", cat: "Navio", thumb: img("vid-1"), desc: "Passeio guiado por todos os decks públicos do navio." },
  { titulo: "Como são as cabines com varanda", dur: "4:15", cat: "Cabines", thumb: img("vid-2"), desc: "Comparativo entre Varanda Standard, Premium e Aurea." },
  { titulo: "Um dia no Mediterrâneo", dur: "6:03", cat: "Roteiro", thumb: img("vid-3"), desc: "Rotina de bordo em um dia de navegação." },
  { titulo: "Yacht Club por dentro", dur: "5:28", cat: "Suítes", thumb: img("vid-4"), desc: "A área exclusiva das suítes e seus benefícios." },
  { titulo: "Gastronomia a bordo", dur: "3:47", cat: "Gastronomia", thumb: img("vid-5"), desc: "Restaurantes inclusos e especialidades pagas." },
  { titulo: "Roma em um dia", dur: "7:12", cat: "Roteiro", thumb: img("vid-6"), desc: "O que dá para fazer no pernoite em Civitavecchia." },
];

export const fichaTecnica = [
  { grupo: "Identificação", itens: [["Navio", "MSC Seaview"], ["Companhia", "MSC Cruzeiros"], ["Bandeira", "Panamá"], ["Ano de construção", "2018"], ["Última reforma", "2024"]] },
  { grupo: "Dimensões", itens: [["Tonelagem", "153.516 GT"], ["Comprimento", "323 m"], ["Largura", "41 m"], ["Decks", "18 (16 acessíveis)"], ["Velocidade de cruzeiro", "21,8 nós"]] },
  { grupo: "Capacidade", itens: [["Hóspedes", "5.331"], ["Cabines", "2.066"], ["Tripulação", "1.413"], ["Cabines acessíveis", "43"], ["Elevadores", "19"]] },
  { grupo: "Estrutura", itens: [["Piscinas", "5"], ["Jacuzzis", "13"], ["Restaurantes", "11"], ["Bares", "20"], ["Teatro", "1 (1.000 lugares)"]] },
];

export const tarifas = [
  { nome: "Fare Flex", desc: "Cancelamento até 60 dias antes com reembolso integral.", multiplicador: 1.18, beneficios: ["Reembolso integral (60d)", "Alteração de nome grátis", "Seleção de cabine"], destaque: false },
  { nome: "Fare Bella", desc: "Tarifa padrão com boa relação custo-benefício.", multiplicador: 1.0, beneficios: ["Seleção de cabine", "Pacote de refeições completo"], destaque: true },
  { nome: "Fare Smart", desc: "Melhor preço, com cabine atribuída pela companhia.", multiplicador: 0.89, beneficios: ["Menor valor", "Cabine garantida (sem escolha)"], destaque: false },
];

export const ocupacoes = [
  { label: "1 hóspede (single)", fator: 1.75 },
  { label: "2 hóspedes", fator: 1 },
  { label: "3 hóspedes", fator: 0.86 },
  { label: "4 hóspedes", fator: 0.78 },
];

export type Adicional = {
  id: string;
  nome: string;
  cat: string;
  preco: number;
  unidade: string;
  foto: string;
  resumo: string;
  detalhes: string;
  regras: string[];
};

export const adicionais: Adicional[] = [
  { id: "beb", nome: "Pacote de bebidas Easy Plus", cat: "Bordo", preco: 2190, unidade: "por pessoa / pacote", foto: img("add-bebidas"), resumo: "Bebidas alcoólicas e não alcoólicas até € 9 por unidade.", detalhes: "Inclui coquetéis, vinhos em taça, cervejas, refrigerantes, água mineral e café especial em todos os bares do navio, exceto no minibar da cabine.", regras: ["Obrigatório para todos os adultos da mesma cabine", "Válido por toda a viagem", "Não reembolsável após o embarque"] },
  { id: "wifi", nome: "Wi-Fi Ilimitado Browse & Stream", cat: "Bordo", preco: 690, unidade: "por dispositivo", foto: img("add-wifi"), resumo: "Internet ilimitada com streaming liberado.", detalhes: "Conexão via satélite em todo o navio, com suporte a chamadas de vídeo e streaming em definição padrão.", regras: ["1 dispositivo conectado por vez", "Velocidade sujeita à cobertura de satélite"] },
  { id: "trf", nome: "Traslado privativo aeroporto ⇄ porto", cat: "Terrestre", preco: 480, unidade: "por trecho / veículo", foto: img("add-transfer"), resumo: "Carro executivo com motorista falando português.", detalhes: "Veículo exclusivo, monitoramento de voo e espera de até 90 minutos sem custo adicional.", regras: ["Até 3 passageiros e 3 malas", "Reservar com 7 dias de antecedência"] },
  { id: "seg", nome: "Seguro viagem Europa Premium", cat: "Proteção", preco: 410, unidade: "por pessoa", foto: img("add-seguro"), resumo: "Cobertura médica de € 60.000 e bagagem.", detalhes: "Atende às exigências do Tratado de Schengen, com cobertura para cancelamento por motivos cobertos e extravio de bagagem.", regras: ["Contratação até 24h antes do embarque", "Idade máxima 85 anos"] },
  { id: "exc", nome: "Combo de 3 excursões", cat: "Passeios", preco: 1260, unidade: "por pessoa", foto: img("add-excursoes"), resumo: "Escolha 3 passeios do catálogo com 15% de desconto.", detalhes: "Passeios operados por parceiros locais com guia em português ou espanhol e retorno garantido ao navio.", regras: ["Escolha até 30 dias antes", "Sujeito a disponibilidade por porto"] },
  { id: "hot", nome: "Pré-embarque em Barcelona (2 noites)", cat: "Hotelaria", preco: 1840, unidade: "por casal", foto: img("add-hotel"), resumo: "Hotel 4★ no Passeig de Gràcia com café da manhã.", detalhes: "Duas diárias em apartamento duplo, café da manhã incluso e late check-out sujeito a disponibilidade.", regras: ["Check-in a partir das 15h", "Tarifa de turismo paga no hotel"] },
];

export const resumoComercial = {
  passageiros: 2,
  cabine: "Varanda Standard — Deck 11",
  tarifa: "Fare Bella",
  itens: [
    { label: "Cruzeiro (2 hóspedes)", valor: 27180 },
    { label: "Taxas portuárias e serviço", valor: 2780 },
    { label: "Pacote de bebidas Easy Plus", valor: 4380 },
    { label: "Traslados privativos (2 trechos)", valor: 960 },
    { label: "Seguro viagem Europa Premium", valor: 820 },
  ],
  desconto: 1200,
};

export const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

export const brl2 = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });
