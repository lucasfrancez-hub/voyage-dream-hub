/**
 * TEXTO DE UMA OPÇÃO DE VOO (fallback real dos cards).
 *
 * Monta o texto de UMA opção usando EXCLUSIVAMENTE os dados estruturados
 * devolvidos pelo motor de busca — nunca conhecimento do modelo, nunca
 * reconstrução de valores/horários. É o mesmo conteúdo da arte, em texto.
 *
 * SERVER-ONLY.
 */
import { bestInstallments } from "@/lib/airline-installments";
import type { FlightQuoteLeg, FlightQuoteOption, FlightQuoteResult } from "./flight-quote.server";

export type OptionTextQuote = Pick<
  FlightQuoteResult,
  "origem_nome" | "destino_nome"
>;

export function fmtDataHora(s: string): { data: string; hora: string } {
  // "2026-08-10 07:35"
  const [d, h] = String(s ?? "").split(" ");
  const [y, m, dd] = (d ?? "").split("-");
  return { data: dd && m ? `${dd}/${m}/${y}` : (d ?? "—"), hora: h ?? "—" };
}

export function legBlock(leg: FlightQuoteLeg, icon: string): string[] {
  const ida = fmtDataHora(leg.partida);
  const chg = fmtDataHora(leg.chegada);
  const paradas =
    leg.paradas <= 0
      ? "Direto"
      : `${leg.paradas === 1 ? "1 conexão" : `${leg.paradas} conexões`}${leg.escalas?.length ? ` em ${leg.escalas.join(", ")}` : ""}`;
  const lines = [
    `📅 ${ida.data}`,
    `${icon} ${ida.hora} → ${chg.hora}`,
    `🏢 ${leg.cia}`,
    `🔁 ${paradas}`,
  ];
  if (leg.duracao) lines.push(`⏱ Duração: ${leg.duracao}`);
  return lines;
}

const SEP = "━━━━━━━━━━━━━━━━━━";

/**
 * Texto completo de UMA opção — usado como fallback quando a arte falha.
 * Inclui origem, destino, datas/horários de ida e volta, companhia, conexões,
 * duração, bagagem, valor e a forma de pagamento mostrada no card.
 */
export function formatOptionText(
  quote: OptionTextQuote,
  op: FlightQuoteOption,
  numero: number,
): string {
  const lines: string[] = [
    SEP,
    `✈️ Opção ${numero}`,
    `📍 ${quote.origem_nome} → ${quote.destino_nome}`,
  ];
  if (op.volta) {
    lines.push("", "Ida", ...legBlock(op.ida, "🕘"), "", "Volta", ...legBlock(op.volta, "🕓"));
  } else {
    lines.push(...legBlock(op.ida, "🕘"));
  }
  lines.push(
    `🧳 ${op.bagagem_despachada ? "Tarifa com bagagem despachada incluída" : "Tarifa promocional (bagagem conforme tarifa)"}`,
  );
  lines.push(`💰 ${op.por_pessoa_formatado} por pessoa`);
  if (op.total_formatado) lines.push(`💳 Total ${op.total_formatado}`);
  const { parcelas, valor } = bestInstallments(Number(op.total ?? 0), op.ida?.cia ?? "");
  if (parcelas > 1) {
    lines.push(
      `💳 Em até ${parcelas}x de ${valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} sem juros`,
    );
  }
  lines.push(SEP);
  return lines.join("\n");
}

/** Bloco com várias opções (contingência quando nenhuma arte saiu). */
export function formatOptionsText(
  quote: OptionTextQuote,
  opcoes: FlightQuoteOption[],
): string {
  const blocks = opcoes.map((op, i) => formatOptionText(quote, op, i + 1));
  blocks.push(
    "Se preferir, posso pesquisar outras companhias, horários ou opções com bagagem incluída.",
  );
  return blocks.join("\n");
}
