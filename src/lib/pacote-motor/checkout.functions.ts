/**
 * Gera o link de pagamento do Motor de Pacotes VIA AIR.
 *
 * O pacote montado no motor (aéreo FRT/PassHub + hospedagem) vira um registro
 * de pacote sob medida, para o cliente cair EXATAMENTE no mesmo checkout dos
 * pacotes prontos (cartão, Pix e boleto com as regras da operadora).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const vooSchema = z
  .object({
    companhia: z.string().max(80).default(""),
    companhiaIata: z.string().max(10).default(""),
    numeroVoo: z.string().max(20).default(""),
    origem: z.string().max(10).default(""),
    destino: z.string().max(10).default(""),
    partida: z.string().max(40).default(""),
    chegada: z.string().max(40).default(""),
    duracao: z.string().max(40).default(""),
    classe: z.string().max(60).default(""),
    familiaTarifaria: z.string().max(60).default(""),
    bagagemMao: z.boolean().default(true),
    bagagemDespachada: z.boolean().default(false),
    escala: z.string().max(120).default(""),
  })
  .nullable()
  .optional();

const entrada = z.object({
  destino: z.string().min(2).max(160),
  origem: z.string().max(160).nullable().optional(),
  ida: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  volta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  noites: z.number().int().min(0).max(60).nullable().optional(),
  adultos: z.number().int().min(1).max(20),
  criancas: z.number().int().min(0).max(15).default(0),
  bebes: z.number().int().min(0).max(10).default(0),
  quartos: z.number().int().min(1).max(6).default(1),
  total: z.number().positive().max(1_000_000),
  hotelNome: z.string().max(200).nullable().optional(),
  hotelEstrelas: z.number().int().min(1).max(5).nullable().optional(),
  regime: z.string().max(120).nullable().optional(),
  quartoNome: z.string().max(160).nullable().optional(),
  foto: z.string().url().max(600).nullable().optional(),
  incluidos: z.array(z.string().max(200)).max(30).default([]),
  vooIda: vooSchema,
  vooVolta: vooSchema,
});

export type EntradaPacoteMotor = z.input<typeof entrada>;

function slugify(txt: string) {
  return txt
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

type VooEntrada = NonNullable<z.infer<typeof vooSchema>>;

function paraFlightInfo(v: VooEntrada | null | undefined) {
  if (!v) return null;
  return {
    airline: v.companhia || v.companhiaIata || null,
    flight_number: v.numeroVoo || null,
    from_iata: v.origem || null,
    to_iata: v.destino || null,
    depart_at: v.partida || null,
    arrive_at: v.chegada || null,
    duration: v.duracao || null,
    cabin_class: v.classe || null,
    fare_class: v.familiaTarifaria || null,
    carry_on: v.bagagemMao,
    checked_bag: v.bagagemDespachada,
    personal_item: true,
    layover: v.escala || null,
  };
}

/** Cria o pacote sob medida e devolve o slug do checkout. */
export const criarPacoteMotorCheckout = createServerFn({ method: "POST" })
  .inputValidator((i: EntradaPacoteMotor) => entrada.parse(i))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const pax = data.adultos + data.criancas;
    const precoPorPessoa = Number((data.total / Math.max(1, pax)).toFixed(2));
    const titulo = `${data.hotelNome || data.destino} — ${data.destino}${
      data.origem ? ` saindo de ${data.origem}` : ""
    }`;
    const slug = `motor-${slugify(data.destino)}-${Date.now().toString(36)}${Math.random()
      .toString(36)
      .slice(2, 6)}`;

    const incluidos = [
      ...(data.vooIda ? ["Passagem aérea ida e volta"] : []),
      ...(data.hotelNome
        ? [`Hospedagem em ${data.hotelNome}${data.regime ? ` (${data.regime})` : ""}`]
        : []),
      ...data.incluidos,
    ];

    const { error } = await supabaseAdmin.from("packages").insert({
      slug,
      title: titulo,
      destination: data.destino,
      origin: data.origem ?? null,
      going_date: data.ida,
      return_date: data.volta ?? null,
      nights: data.noites ?? null,
      price_per_person: precoPorPessoa,
      taxes: 0,
      image_url: data.foto ?? null,
      summary: `Pacote sob medida montado no motor VIA AIR para ${pax} viajante(s) em ${data.quartos} quarto(s).`,
      includes: incluidos,
      hotel_name: data.hotelNome ?? null,
      hotel_stars: data.hotelEstrelas ?? null,
      meal_plan: data.regime ?? null,
      room_type: data.quartoNome ?? null,
      base_occupancy: pax,
      is_active: true,
      kind: "package",
      pricing_mode: "per_occupancy",
      sort_order: 99999,
      supplier_name: "FRT",
      outbound_flight: paraFlightInfo(data.vooIda),
      return_flight: paraFlightInfo(data.vooVolta),
    });
    if (error) throw new Error(error.message);

    return { slug, url: `/pacotes/${slug}/checkout?fixed=1&qty=${pax}` };
  });
