import * as VisaoGeral from "./screens/visao-geral";
import * as Itinerario from "./screens/itinerario";
import * as Navio from "./screens/navio";
import * as Atracoes from "./screens/atracoes";
import * as Cabines from "./screens/cabines";
import * as CabineDetalhe from "./screens/cabine-detalhe";
import * as DeckPlan from "./screens/deck-plan";
import * as Galeria from "./screens/galeria";
import * as Videos from "./screens/videos";
import * as FichaTecnica from "./screens/ficha-tecnica";
import * as Tarifas from "./screens/tarifas";
import * as Resumo from "./screens/resumo";
import * as Adicionais from "./screens/adicionais";
import * as AdicionalDetalhe from "./screens/adicional-detalhe";

export type ModelKey = "a" | "b" | "c";

export type ScreenDef = {
  slug: string;
  ordem: string;
  titulo: string;
  descricao: string;
  modelos: Record<ModelKey, { nome: string; resumo: string; Comp: () => React.JSX.Element }>;
};

const mk = (
  slug: string,
  ordem: string,
  titulo: string,
  descricao: string,
  mod: { A: () => React.JSX.Element; B: () => React.JSX.Element; C: () => React.JSX.Element },
  nomes: [string, string, string],
  resumos: [string, string, string],
): ScreenDef => ({
  slug,
  ordem,
  titulo,
  descricao,
  modelos: {
    a: { nome: nomes[0], resumo: resumos[0], Comp: mod.A },
    b: { nome: nomes[1], resumo: resumos[1], Comp: mod.B },
    c: { nome: nomes[2], resumo: resumos[2], Comp: mod.C },
  },
});

export const screens: ScreenDef[] = [
  mk("visao-geral", "01", "Visão geral / Sobre o cruzeiro", "Primeira tela do produto.", VisaoGeral,
    ["Editorial cinematográfico", "Painel comercial", "Storytelling por capítulos"],
    ["Hero full-bleed, abas de conteúdo e barra de reserva fixa no rodapé.",
     "Hero contido, coluna lateral de cotação com ocupação e ficha do produto.",
     "Vídeo de abertura e navegação por capítulos com âncoras laterais."]),

  mk("itinerario", "02", "Itinerário", "Os dias de viagem porto a porto.", Itinerario,
    ["Timeline vertical", "Trilho de rota + painel", "Cartões-postais + drawer"],
    ["Linha do tempo com expansão inline de cada dia.",
     "Trilho horizontal clicável com painel de detalhe e navegação dia a dia.",
     "Grade de cartões filtráveis (terra/mar) abrindo painel lateral."]),

  mk("navio", "03", "Conheça o navio", "Apresentação do navio.", Navio,
    ["Institucional com números", "Corte por decks", "Mapa com hotspots"],
    ["Hero, indicadores e abas sobre/áreas/decks.",
     "Lista de decks à esquerda e conteúdo do deck à direita.",
     "Foto do navio com pontos pulsantes clicáveis abrindo modais."]),

  mk("atracoes", "04", "Atrações", "O que fazer a bordo.", Atracoes,
    ["Grade com filtros", "Mosaico bento", "Lista comparativa incluso x pago"],
    ["Cards com filtro por categoria e modal de detalhe.",
     "Mosaico editorial com destaques de tamanhos diferentes e drawer inferior.",
     "Lista à esquerda + painel fixo à direita, separando incluso de pago."]),

  mk("cabines", "05", "Cabines", "Catálogo de categorias.", Cabines,
    ["Abas por família", "Comparador em tabela", "Famílias → categorias"],
    ["Abas Interna/Externa/Varanda/Suíte com grade de cards.",
     "Tabela densa com seleção de até 3 categorias para comparar.",
     "Cards grandes por família abrindo drawer com as categorias."]),

  mk("cabine-detalhe", "06", "Detalhe da cabine", "Ficha completa da categoria.", CabineDetalhe,
    ["Clássico com box de reserva", "Imersivo com abas", "Configurador em 3 passos"],
    ["Galeria + box lateral fixo com preços por ocupação.",
     "Capa full-width, abas de conteúdo e barra de preço fixa.",
     "Passo a passo: ocupação → tarifa → número da cabine no deck."]),

  mk("deck-plan", "07", "Deck plan", "Plantas dos decks.", DeckPlan,
    ["Seletor + planta grande", "Vista de perfil do navio", "Mapa de cabines clicável"],
    ["Abas de decks, planta ampliável e legenda por categoria.",
     "Pilha de decks em perspectiva com painel do deck selecionado.",
     "Grade de cabines com status livre/ocupada e modal de seleção."]),

  mk("galeria", "08", "Fotos / Galeria", "Acervo fotográfico.", Galeria,
    ["Masonry com filtros", "Álbuns por tema", "Faixa cinematográfica"],
    ["Colunas irregulares, filtro por categoria e lightbox completo.",
     "Capas de álbum abrindo carrossel dedicado com miniaturas.",
     "Foto em destaque com texto sobreposto e trilho horizontal."]),

  mk("videos", "09", "Vídeos", "Conteúdo em vídeo.", Videos,
    ["Grade + player em modal", "Player fixo com playlist", "Stories verticais"],
    ["Miniaturas com filtro por tema e player em modal.",
     "Player grande com playlist lateral, estilo streaming.",
     "Formato 9:16 com barra de progresso e toque nas laterais."]),

  mk("ficha-tecnica", "10", "Ficha técnica", "Especificações do navio.", FichaTecnica,
    ["Tabela por grupos", "Dashboard de números", "Acordeão com foto"],
    ["Leitura direta em blocos agrupados.",
     "Cartões-número em destaque e abas por grupo.",
     "Foto fixa do navio ao lado de acordeões compactos."]),

  mk("tarifas", "11", "Tarifas / Valores", "Condições comerciais.", Tarifas,
    ["Três planos lado a lado", "Matriz cabine x tarifa", "Simulador interativo"],
    ["Colunas de tarifa com destaque na recomendada e seletor de ocupação.",
     "Tabela completa com todas as cabines e tarifas, célula clicável.",
     "Steppers e seleção de pagamento com total recalculado ao vivo."]),

  mk("resumo", "12", "Resumo comercial", "Fechamento da proposta.", Resumo,
    ["Orçamento formal", "Checkout editável", "Proposta premium"],
    ["Formato recibo, pronto para enviar ou imprimir.",
     "Itens com checkbox e coluna de totais estilo checkout.",
     "Cartão único com valor em destaque e composição expansível."]),

  mk("adicionais", "13", "Adicionais", "Serviços opcionais.", Adicionais,
    ["Catálogo com carrinho", "Lista com switches", "Combos recomendados"],
    ["Cards por categoria com carrinho lateral somando o total.",
     "Lista compacta agrupada, switches e barra de total fixa.",
     "Combos prontos com desconto e vitrine horizontal dos itens."]),

  mk("adicional-detalhe", "14", "Detalhe do adicional", "Ficha do serviço.", AdicionalDetalhe,
    ["Página de produto", "Drawer sobre a lista", "Abas com comparativo"],
    ["Galeria, quantidade e box de compra.",
     "Detalhe em painel lateral mantendo o catálogo visível.",
     "Abas sobre/planos/regras com comparativo de variações."]),
];

export const getScreen = (slug: string) => screens.find((s) => s.slug === slug);
