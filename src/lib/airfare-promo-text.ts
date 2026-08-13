/**
 * Textos de divulgação da promoção (WhatsApp / Instagram).
 * Só monta texto a partir dos DADOS estruturados de `airfare_promotions` —
 * os cards visuais (Feed/Story) virão dos HTMLs aprovados e usarão os mesmos
 * campos via `promoCardData`.
 */
import { AVISO_MAIOR_PARCELAMENTO, AVISO_VALIDADE_TARIFA } from "@/lib/airfare-conditions";
import { dataTarifaPorExtenso } from "@/lib/promo-card/card-html";

/** Títulos comerciais (padrão: Oferta Relâmpago). */
export const PROMO_TITULOS = [
  "⚡ OFERTA RELÂMPAGO VIA AIR",
  "✈️ PROMOÇÃO AÉREA VIA AIR",
  "🔥 TARIFA ENCONTRADA HOJE",
] as const;

export type PromoRow = {
  origin_iata: string;
  origin_city: string | null;
  destination_iata: string;
  destination_city: string | null;
  airline_name: string | null;
  airline_iata: string | null;
  airline_logo: string | null;
  departure_date: string;
  return_date: string | null;
  is_round_trip: boolean;
  stops: number;
  has_checked_baggage: boolean;
  passengers: number;
  total_price: number | string;
  price_per_passenger: number | string;
  interest_free_installments: number;
  interest_free_installment_value: number | string;
  extended_max_installments: number | null;
  extended_installment_value_12x: number | string | null;
  extended_options?: unknown;
  short_url?: string | null;
  cart_url?: string | null;
  quoted_at?: string | null;
  last_checked_at?: string | null;
};

const brl = (v: number | string | null | undefined) =>
  Number(v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const dataBR = (iso?: string | null) => {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};

/** Objeto único que alimentará Feed, Story, WhatsApp e Instagram. */
export function promoCardData(p: PromoRow) {
  return {
    origem: p.origin_city ? `${p.origin_city} (${p.origin_iata})` : p.origin_iata,
    destino: p.destination_city ? `${p.destination_city} (${p.destination_iata})` : p.destination_iata,
    companhia: p.airline_name ?? p.airline_iata ?? "—",
    logo: p.airline_logo,
    ida: dataBR(p.departure_date),
    volta: dataBR(p.return_date),
    tipo: p.is_round_trip ? "Ida e volta" : "Somente ida",
    paradas: p.stops === 0 ? "Voo direto" : `${p.stops} parada(s)`,
    bagagem: p.has_checked_baggage ? "Com bagagem despachada" : "Só bagagem de mão",
    passageiros: p.passengers,
    totalFmt: brl(p.total_price),
    porPassageiroFmt: brl(p.price_per_passenger),
    semJuros: {
      parcelas: p.interest_free_installments,
      valorFmt: brl(p.interest_free_installment_value),
      texto:
        p.interest_free_installments > 1
          ? `${p.interest_free_installments}x de ${brl(p.interest_free_installment_value)} sem juros`
          : `à vista ${brl(p.total_price)}`,
    },
    maisPrazo:
      p.extended_max_installments && p.extended_installment_value_12x
        ? {
            parcelas: p.extended_max_installments,
            valorFmt: brl(p.extended_installment_value_12x),
            texto: `${p.extended_max_installments}x de ${brl(p.extended_installment_value_12x)}`,
          }
        : null,
    avisoMaisPrazo: AVISO_MAIOR_PARCELAMENTO,
    avisoValidade: AVISO_VALIDADE_TARIFA,
    link: p.short_url ?? p.cart_url ?? null,
  };
}

export function promoWhatsappText(p: PromoRow): string {
  const d = promoCardData(p);
  const linhas = [
    `✈️ *${d.origem} → ${d.destino}*`,
    "",
    `${d.tipo} • ${d.companhia}`,
    d.volta ? `📅 ${d.ida} a ${d.volta}` : `📅 ${d.ida}`,
    `${d.paradas} • ${d.bagagem}`,
    "",
    `💰 *${d.totalFmt}* (${d.passageiros} passageiro(s))`,
    `Por passageiro: ${d.porPassageiroFmt}`,
    "",
    `*Melhor condição:* ${d.semJuros.texto}`,
  ];
  if (d.maisPrazo) {
    linhas.push(`*Precisa de mais prazo?* até ${d.maisPrazo.texto}`, `_${d.avisoMaisPrazo}_`);
  }
  linhas.push("", d.avisoValidade);
  if (d.link) linhas.push("", `👉 ${d.link}`);
  return linhas.join("\n");
}

export function promoInstagramText(p: PromoRow): string {
  const d = promoCardData(p);
  return [
    `${d.destino} saindo de ${d.origem} ✈️`,
    "",
    `${d.tipo} • ${d.companhia} • ${d.bagagem}`,
    d.volta ? `${d.ida} a ${d.volta}` : d.ida,
    `A partir de ${d.porPassageiroFmt} por passageiro`,
    `${d.semJuros.texto}`,
    d.maisPrazo ? `Precisa de mais prazo? até ${d.maisPrazo.texto}` : "",
    "",
    d.avisoValidade,
    "",
    "#viaair #passagensaereas #viagem",
  ]
    .filter(Boolean)
    .join("\n");
}
