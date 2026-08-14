/**
 * ENTREGA OFICIAL DAS COTAÇÕES AÉREAS (Bruno e Paula).
 *
 * Os antigos cards/imagens de resultado de voo NÃO são mais enviados.
 * Fluxo: pesquisa -> orçamento AIR_ONLY -> link público -> link curto
 * -> WhatsApp com TEXTO CURTO + LINK no MESMO balão.
 *
 * SERVER-ONLY.
 */
import { buildAirOnlyQuote } from "@/lib/public-quote/from-flight.server";
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
  /** Todas as opções da cotação — aparecem como abas dentro do orçamento. */
  allOptions?: FlightQuoteOption[] | null;
  agentName?: string | null;
  conversationId?: string | null;
  flightQuoteId?: string | null;
}): Promise<{ texto: string; link: string; publicId: string }> {
  const dto = buildAirOnlyQuote({
    result: params.result,
    option: params.option,
    optionIndex: params.numero,
    allOptions: params.allOptions ?? null,
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
