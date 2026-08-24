/**
 * Camada de apresentação do Motor de Pacotes.
 *
 * Não cria motor novo: converte o que os motores existentes já devolvem
 * (pacotes CompreFácil + ofertas aéreas PassHub) para o formato usado pelos
 * componentes do marketplace. Nada aqui inventa dado que o fornecedor não
 * mandou — campos ausentes ficam nulos e a UI simplesmente não mostra.
 */
import type { PacoteBuscaCF } from "@/lib/comprefacil/busca.server";
import type { PassHubOferta, PassHubVoo } from "@/lib/passhub/types";
import { nomeCia } from "@/lib/pacote-motor/cia";

export type QuartoPacote = {
  id: string;
  nome: string;
  ocupacao: string | null;
  regime: string | null;
  reembolsavel: boolean | null;
  beneficios: string[];
  /** política de cancelamento exatamente como a operadora devolve */
  politica: string | null;
  /** número da pesquisa/quarto da distribuição (Quarto 1, Quarto 2, …) */
  pesquisa: number | null;
  /** valor total desta tarifa (todos os quartos da distribuição) */
  valor: number;
  /** diferença em relação ao quarto do pacote recomendado (R$ por pacote) */
  diferenca: number;
};

/** Distribuição de hóspedes por quarto pedida pelo cliente. */
export type OcupacaoQuarto = { adultos: number; criancas: number; bebes: number; idades: number[] };

export const ocupacaoPadrao = (): OcupacaoQuarto => ({ adultos: 2, criancas: 0, bebes: 0, idades: [] });

export const somaOcupacao = (quartos: OcupacaoQuarto[]) => ({
  adultos: quartos.reduce((n, q) => n + q.adultos, 0),
  criancas: quartos.reduce((n, q) => n + q.criancas, 0),
  bebes: quartos.reduce((n, q) => n + q.bebes, 0),
  hospedes: quartos.reduce((n, q) => n + q.adultos + q.criancas + q.bebes, 0),
});

export const plural = (n: number, singular: string, pluralStr: string) => `${n} ${n === 1 ? singular : pluralStr}`;

export type HotelPacote = {
  id: string;
  /** posição na ordem "recomendados" devolvida pela operadora (0 = mais recomendado) */
  posicao: number;
  /** id externo do pacote CompreFácil que originou esta hospedagem */
  pacoteExternoId: number;
  nome: string;
  categoria: number | null;
  avaliacao: number | null;
  localizacao: string | null;
  fotos: string[];
  beneficios: string[];
  regime: string | null;
  reembolsavel: boolean | null;
  /** endereço completo devolvido pela operadora */
  endereco: string | null;
  /** descrição oficial do hotel (operadora ou enriquecimento) */
  descricao: string | null;
  /** comodidades/informações do hotel */
  comodidades: string[];
  /** políticas de cancelamento devolvidas pela operadora */
  politicas: string[];
  /** quantidade de avaliações, quando disponível */
  numAvaliacoes: number | null;
  /** true quando o hotel aparece na lista "recomendados" da operadora */
  recomendado?: boolean;
  /** valor total do pacote com esta hospedagem (pax já multiplicados) */
  total: number;
  moeda: string;
  quartos: QuartoPacote[];
};

export type ServicoPacote = {
  id: string;
  titulo: string;
  tipo: string | null;
  descricao: string | null;
  valor: number | null;
};

export const brl = (v: number | null | undefined, moeda = "BRL") =>
  typeof v === "number" && Number.isFinite(v)
    ? v.toLocaleString("pt-BR", { style: "currency", currency: moeda === "USD" ? "USD" : moeda === "EUR" ? "EUR" : "BRL" })
    : "—";

/** Diferença assinada, no padrão pedido no briefing. */
export function diferencaTexto(diff: number, moeda = "BRL") {
  if (Math.abs(diff) < 0.005) return "Incluído no pacote";
  if (diff < 0) return `Economize ${brl(Math.abs(diff), moeda)}`;
  return `+ ${brl(diff, moeda)}`;
}

const limparHtml = (v: unknown) =>
  typeof v === "string"
    ? v
        .replace(/<[^>]*>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&#(\d+);/g, (_, c) => String.fromCharCode(Number(c)))
        .replace(/\s+/g, " ")
        .trim() || null
    : null;

/** Total do pacote para os pax pagantes informados. */
export function totalPacote(p: PacoteBuscaCF, pagantes: number) {
  const servico = Number(p.valor_servico ?? 0);
  const taxa = Number(p.valor_taxa ?? 0);
  return Number(((servico + taxa) * Math.max(1, pagantes)).toFixed(2));
}

/** Converte a lista de pacotes encontrados em opções de hospedagem reais. */
export function hoteisDosPacotes(pacotes: PacoteBuscaCF[], pagantes: number): HotelPacote[] {
  return pacotes.map((p, i) => ({
    id: p.id,
    posicao: i,
    pacoteExternoId: p.externo_id,
    nome: p.hoteis[0] ?? p.nome,
    categoria: null,
    avaliacao: null,
    localizacao: p.cidade,
    fotos: p.imagem ? [p.imagem] : [],
    beneficios: p.hoteis.slice(1),
    regime: null,
    reembolsavel: null,
    endereco: null,
    descricao: null,
    comodidades: [],
    politicas: [],
    numAvaliacoes: null,
    total: totalPacote(p, pagantes),
    moeda: p.moeda ?? "BRL",
    quartos: [],
  }));
}

/** Quartos, fotos e serviços reais lidos do detalhe (raw) do pacote da operadora. */
export function detalharHospedagem(raw: any, pagantes: number) {
  const fotos: string[] = (raw?.PacoteImagens ?? [])
    .map((i: any) => (typeof i?.Imagem === "string" ? `https://v2.comprefacil.tur.br${i.Imagem}` : null))
    .filter(Boolean);

  const base = (Number(raw?.ValorServico ?? 0) + Number(raw?.ValorTaxa ?? 0)) * Math.max(1, pagantes);

  const quartos: QuartoPacote[] = (raw?.Apartamentos ?? []).map((a: any, i: number) => {
    const valor = Number(a?.ValorServico ?? a?.Valor ?? 0) * Math.max(1, pagantes);
    return {
      id: String(a?.Id ?? i),
      nome: a?.Nome ?? a?.Descricao ?? `Acomodação ${i + 1}`,
      ocupacao: a?.Ocupacao ?? (a?.QuantidadeAdultos ? `${a.QuantidadeAdultos} adulto(s)` : null),
      regime: a?.Regime ?? a?.Pensao ?? null,
      reembolsavel: typeof a?.Reembolsavel === "boolean" ? a.Reembolsavel : null,
      beneficios: [],
      politica: null,
      pesquisa: null,
      valor,
      diferenca: valor ? Number((valor - base).toFixed(2)) : 0,
    };
  });

  const hoteis: string[] = (raw?.PacoteHoteis ?? []).map((h: any) => h?.NomeHotel).filter(Boolean);

  const inclui = (raw?.PacotesInclui ?? [])
    .filter((i: any) => i?.NaoInclui !== true)
    .map((i: any) => limparHtml(i?.Descritivo) ?? i?.Titulo)
    .filter(Boolean) as string[];

  const servicos: ServicoPacote[] = (raw?.OfflineServicos ?? []).map((s: any, i: number) => ({
    id: String(s?.Id ?? i),
    titulo: s?.Titulo ?? `Serviço ${i + 1}`,
    tipo: s?.Categoria ? String(s.Categoria) : null,
    descricao: limparHtml(s?.Descricao),
    valor: typeof s?.Valor === "number" ? s.Valor : null,
  }));

  return { fotos, quartos, hoteis, inclui, servicos, checkin: raw?.Checkin ?? null, checkout: raw?.Checkout ?? null };
}

/** Resumo textual de um voo (usado nos cards e no resumo lateral). */
export function resumoVoo(v: PassHubVoo) {
  return {
    companhia: nomeCia(v.companhiaIata, v.companhia),
    rota: `${v.origem} → ${v.destino}`,
    horarios: `${hora(v.partida)} → ${hora(v.chegada)}`,
    duracao: v.duracao,
    paradas: v.paradas,
    escalas: v.paradas === 0 ? "Direto" : `${v.paradas} conexão${v.paradas > 1 ? "ões" : ""}`,
    bagagem: v.bagagemDespachada
      ? `${v.bagagemDespachadaQtd || 1} bagagem despachada`
      : v.bagagemMao
        ? "Bagagem de mão"
        : "Sem bagagem informada",
  };
}

export function hora(iso: string) {
  if (!iso) return "—";
  const d = new Date(iso.length <= 16 ? iso.replace(" ", "T") : iso);
  if (Number.isNaN(d.getTime())) return iso.slice(11, 16) || iso;
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export function precoOferta(o: PassHubOferta) {
  return Number(o.precoTotal ?? 0);
}
