/**
 * ENTREGA OFICIAL DAS COTAÇÕES AÉREAS (Bruno e Paula).
 *
 * Os antigos cards/imagens de resultado de voo NÃO são mais enviados.
 * Fluxo: pesquisa -> orçamento AIR_ONLY -> link público -> link curto
 * -> WhatsApp com TEXTO CURTO + LINK no MESMO balão.
 *
 * SERVER-ONLY.
 */
import { buildAirOnlyQuote, buildAirOnlyMultiQuote } from "@/lib/public-quote/from-flight.server";
import { savePublicQuote } from "@/lib/public-quote/store.server";
import type { FlightQuoteOption, FlightQuoteResult } from "./flight-quote.server";

function hora(stamp: string): string {
  return String(stamp ?? "").split(" ")[1] ?? "—";
}
function dataBR(stamp: string): string {
  const d = String(stamp ?? "").split(" ")[0] ?? "";
  const [y, m, dd] = d.split("-");
  return dd && m ? `${dd}/${m}` : d;
}

/**
 * Texto curto que acompanha o link — nunca repete a ficha técnica do voo,
 * que agora vive no orçamento público.
 */
export function textoCurtoOpcao(params: {
  result: FlightQuoteResult;
  option: FlightQuoteOption;
  numero: number;
  link: string;
}): string {
  const { result, option, numero, link } = params;
  const rota = `${result.origem_nome || result.origem_iata} → ${result.destino_nome || result.destino_iata}`;
  const ida = `ida ${dataBR(option.ida.partida)} às ${hora(option.ida.partida)}`;
  const volta = option.volta ? `, volta ${dataBR(option.volta.partida)} às ${hora(option.volta.partida)}` : "";
  return [
    `Opção ${numero} — ${rota}`,
    `${ida}${volta} • ${option.por_pessoa_formatado} por pessoa`,
    "",
    "Abra o orçamento completo com horários, conexões, bagagem e formas de pagamento:",
    link,
  ].join("\n");
}

/** Gera o orçamento público AIR_ONLY e devolve o texto pronto pro WhatsApp. */
export async function prepararLinkDaOpcao(params: {
  result: FlightQuoteResult;
  option: FlightQuoteOption;
  numero: number;
  agentName?: string | null;
  conversationId?: string | null;
  flightQuoteId?: string | null;
}): Promise<{ texto: string; link: string; publicId: string }> {
  const dto = buildAirOnlyQuote({
    result: params.result,
    option: params.option,
    optionIndex: params.numero,
    agentName: params.agentName ?? null,
    conversationId: params.conversationId ?? null,
    flightQuoteId: params.flightQuoteId ?? null,
  });

  const { quote, url, shortUrl } = await savePublicQuote(dto);
  const link = shortUrl || url;
  return {
    texto: textoCurtoOpcao({ ...params, link }),
    link,
    publicId: quote.publicId,
  };
}

/* ───────────── ENTREGA ÚNICA: 1 pesquisa = 1 orçamento = 1 link ───────────── */

function resumoOpcao(option: FlightQuoteOption, numero: number): string {
  const ida = `ida ${dataBR(option.ida.partida)} ${hora(option.ida.partida)}→${hora(option.ida.chegada)}`;
  const volta = option.volta
    ? ` • volta ${dataBR(option.volta.partida)} ${hora(option.volta.partida)}→${hora(option.volta.chegada)}`
    : "";
  const paradas = (option.ida.paradas ?? 0) === 0 ? "direto" : `${option.ida.paradas} conexão(ões)`;
  const bagagem = option.bagagem_despachada ? "com bagagem despachada" : "sem bagagem despachada";
  return `${numero}) ${option.ida.cia} — ${ida}${volta}\n   ${paradas} • ${bagagem} • ${option.total_formatado} no total`;
}

const ABERTURAS = [
  "Consegui separar estas alternativas:",
  "Olha o que encontrei pra você:",
  "Fechei a pesquisa e ficaram assim:",
  "Estas foram as melhores saídas que apareceram:",
];

/**
 * Texto ÚNICO com todas as opções + UM link. Sem pressão comercial, sem
 * frase pronta de fechamento e sem repetir link por opção.
 */
export function textoMultiOpcoes(params: {
  result: FlightQuoteResult;
  options: FlightQuoteOption[];
  link: string;
}): string {
  const { result, options, link } = params;
  const rota = `${result.origem_nome || result.origem_iata} → ${result.destino_nome || result.destino_iata}`;
  const abertura = ABERTURAS[Math.floor(Math.random() * ABERTURAS.length)]!;
  const linhas = options.map((o, i) => resumoOpcao(o, i + 1));
  return [
    `${abertura} ${rota}`,
    "",
    linhas.join("\n"),
    "",
    options.length > 1
      ? "Neste link você abre as opções lado a lado, com horários, conexões, bagagem e formas de pagamento:"
      : "Neste link você abre o detalhamento completo, com horários, conexões, bagagem e formas de pagamento:",
    link,
  ].join("\n");
}

/**
 * Gera UM orçamento público com todas as opções, registra na esteira interna
 * (/admin/orcamentos) e devolve o texto pronto pro WhatsApp.
 */
export async function prepararOrcamentoMultiOpcoes(params: {
  result: FlightQuoteResult;
  options: FlightQuoteOption[];
  agentName?: string | null;
  agentSlug?: string | null;
  conversationId?: string | null;
  flightQuoteId?: string | null;
  clientName?: string | null;
  clientPhone?: string | null;
}): Promise<{ texto: string; link: string; publicId: string }> {
  const dto = buildAirOnlyMultiQuote({
    result: params.result,
    options: params.options,
    agentName: params.agentName ?? null,
    conversationId: params.conversationId ?? null,
    flightQuoteId: params.flightQuoteId ?? null,
  });

  const { quote, url, shortUrl } = await savePublicQuote(dto);
  const link = shortUrl || url;

  if (params.flightQuoteId) {
    const { registrarOrcamentoDaPesquisa } = await import("@/lib/quotes/from-flight-search.server");
    await registrarOrcamentoDaPesquisa({
      result: params.result,
      options: params.options,
      flightQuoteId: params.flightQuoteId,
      agentName: params.agentName ?? null,
      agentSlug: params.agentSlug ?? null,
      clientName: params.clientName ?? null,
      clientPhone: params.clientPhone ?? null,
      publicQuoteId: quote.id,
      publicUrl: url,
      publicShortUrl: shortUrl,
    }).catch(() => null);
  }

  return {
    texto: textoMultiOpcoes({ result: params.result, options: params.options, link }),
    link,
    publicId: quote.publicId,
  };
}
