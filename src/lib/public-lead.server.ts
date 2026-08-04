import { z } from "zod";

export const publicFlightLeadInput = z.object({
  departureIata: z.string().trim().min(3).max(4),
  arrivalIata: z.string().trim().min(3).max(4),
  departureDate: z.string().max(10),
  returnDate: z.string().max(10).nullable().optional(),
  adults: z.number().int().min(1).max(9),
  children: z.number().int().min(0).max(9),
  infants: z.number().int().min(0).max(9),
  total: z.number().finite().nonnegative().max(10_000_000),
  summary: z.string().max(4000),
  cartUrl: z.string().max(2000).nullable().optional(),
});

export type PublicFlightLeadInput = z.infer<typeof publicFlightLeadInput>;

function fmtDate(iso: string) {
  const [y, m, d] = iso.split("-");
  return d ? `${d}/${m}/${y}` : iso;
}

/**
 * Registra um PEDIDO PENDENTE quando o visitante do motor público clica em
 * "Comprar agora". Vem sem dados pessoais — serve como log de intenção de
 * compra para a equipe confirmar manualmente depois.
 */
export async function createPublicFlightLeadHandler({ data }: { data: PublicFlightLeadInput }) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const pax = data.adults + data.children + data.infants;
  const route = `${data.departureIata.toUpperCase()} → ${data.arrivalIata.toUpperCase()}`;
  const tripTitle = `${route} • ${fmtDate(data.departureDate)}${
    data.returnDate ? ` a ${fmtDate(data.returnDate)}` : ""
  }`;

  const notes = [
    "PEDIDO GERADO PELO MOTOR DE BUSCA PÚBLICO (site).",
    "Cliente clicou em COMPRAR AGORA e foi levado ao carrinho da operadora.",
    "Sem dados cadastrais — confirmar manualmente se a compra foi concluída.",
    "",
    `Trecho: ${tripTitle}`,
    `Passageiros: ${data.adults} adulto(s), ${data.children} criança(s), ${data.infants} bebê(s) — total ${pax}`,
    "",
    data.summary,
    data.cartUrl ? `\nCarrinho: ${data.cartUrl}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const { data: order, error } = await supabaseAdmin
    .from("orders")
    .insert({
      full_name: "Lead do site (motor público)",
      payment_method: "other",
      status: "pending",
      total_price: data.total,
      expected_total: data.total,
      adults: data.adults,
      children: data.children,
      supplier_name: "Comprar Viagem",
      trip_title: tripTitle,
      notes,
      package_snapshot: {},
    } as never)
    .select("id, order_number")
    .single();

  if (error) throw new Error(error.message);
  return { id: order.id as string, order_number: String(order.order_number) };
}
