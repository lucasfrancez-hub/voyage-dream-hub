/**
 * Busca server-side dos PACOTES PRONTOS do Command Center (admin de pacotes).
 *
 * Fonte de verdade ÚNICA: tabela `packages` (o que está publicado/gerenciado no
 * Command Center). Nunca consulta Cativa, Comprefácil, catalog_products nem
 * estoque bruto de fornecedor — essas bases seguem existindo só para
 * importação/curadoria interna.
 *
 * Nada aqui é inventado: preço, taxas, datas, hotel, inclusos, disponibilidade e
 * parcelamento saem do banco e das regras comerciais reais (`installment_rules`
 * + boleto pré-pago). SERVER-ONLY.
 */
import { z } from "zod";
import {
  boletoRulesForPackage,
  maxInstallmentsForPackage,
  type InstallmentRule,
} from "./installment-rules";
import { getPrepaidBoletoConditions } from "./prepaid-boleto";

export const PUBLIC_SITE_URL = "https://pedidos.viaair.tur.br";

/** Tipos de produto pronto que o Command Center publica. */
export const READY_PACKAGE_KINDS = ["package", "tour", "service"] as const;

export const readyPackagesInput = z.object({
  destination: z.string().trim().min(2).max(120).nullish(),
  origin: z.string().trim().min(2).max(120).nullish(),
  /** Mês desejado no formato AAAA-MM (ex.: "2027-01"). */
  month: z.string().regex(/^\d{4}-\d{2}$/).nullish(),
  /** Período: embarque entre estas datas. */
  departureFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
  departureTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
  /** Data exata de ida / volta, quando o cliente já tem certeza. */
  departureDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
  returnDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
  nights: z.number().int().min(1).max(60).nullish(),
  nightsMin: z.number().int().min(1).max(60).nullish(),
  nightsMax: z.number().int().min(1).max(60).nullish(),
  adults: z.number().int().min(1).max(9).nullish(),
  /** Idades das crianças, quando informadas. */
  children: z.array(z.number().int().min(0).max(17)).max(9).default([]),
  /** Tipo do produto no Command Center. */
  kind: z.enum(READY_PACKAGE_KINDS).nullish(),
  productType: z
    .enum(["pacote_pronto", "passeio", "servico", "cruzeiro"])
    .nullish(),
  /** Só produtos ativos/disponíveis (padrão true). */
  onlyAvailable: z.boolean().default(true),
  limit: z.number().int().min(1).max(30).default(8),
});

export type ReadyPackagesInput = z.infer<typeof readyPackagesInput>;

export type ReadyPackageDate = {
  date: string;
  price_per_person: number | null;
  taxes: number | null;
  seats: number | null;
  is_available: boolean;
  modality: string | null;
};

export type ReadyPackage = {
  package_id: string;
  slug: string | null;
  title: string | null;
  kind: string | null;
  product_type: "pacote_pronto" | "passeio" | "servico" | "cruzeiro";
  destination: string | null;
  origin: string | null;
  date_mode: "fixed" | "flexible" | null;
  going_date: string | null;
  return_date: string | null;
  nights: number | null;
  /** true quando o valor é "a partir de" (produto flexível / sem data fixa). */
  price_from: boolean;
  price_per_person: number | null;
  taxes: number | null;
  total_per_person: number | null;
  currency: "BRL";
  pricing_mode: string | null;
  base_occupancy: number | null;
  max_units: number | null;
  hotel: {
    name: string | null;
    stars: number | null;
    room_type: string | null;
    room_category: string | null;
    bed_type: string | null;
    meal_plan: string | null;
    options: unknown;
    stays: unknown;
  };
  flights: { included: boolean; outbound: unknown; inbound: unknown };
  includes: string[];
  services: unknown;
  cruise: unknown;
  installment_plan: ReadyPackageInstallmentPlan;
  seats: number | null;
  availability: "available" | "sold_out" | "on_request" | "inactive";
  available_dates: ReadyPackageDate[];
  image_url: string | null;
  public_url: string;
  public_path: string;
  supplier_name: string | null;
  summary: string | null;
  /** Por que o produto não casou 100% com o pedido (só nos near matches). */
  mismatch_reasons: string[];
};

export type ReadyPackageInstallmentPlan = {
  source: "VIAAIR_RULES";
  currency: "BRL";
  card: { max_installments: number; interest_free: true; installment_value: number | null };
  boleto_financiado: { enabled: boolean; max_installments: number; installment_value: number | null };
  boleto_prepago: {
    enabled: boolean;
    max_installments: number;
    entry_amount: number | null;
    installment_value: number | null;
  };
  /** true quando o valor base é "a partir de" — a parcela também é estimada. */
  estimated: boolean;
};

export type ReadyPackagesResult = {
  status: "found" | "not_found" | "incompatible" | "customization_required";
  next_step: "present_options" | "custom_quote";
  source: "COMMAND_CENTER";
  criteria: Record<string, unknown>;
  total_count: number;
  packages: ReadyPackage[];
  /** Produtos do mesmo destino que existem mas não casam com data/ocupação. */
  near_matches: ReadyPackage[];
  message: string;
};

type Row = Record<string, any>;

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function n(v: unknown): number | null {
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
}

function productTypeOf(row: Row): ReadyPackage["product_type"] {
  if (row.cruise_details) return "cruzeiro";
  if (row.kind === "tour") return "passeio";
  if (row.kind === "service") return "servico";
  return "pacote_pronto";
}

function montarParcelamento(args: {
  rules: InstallmentRule[];
  supplierName: string | null;
  totalPerPerson: number | null;
  departureDate: string | null;
  priceFrom: boolean;
}): ReadyPackageInstallmentPlan {
  const input = { supplierName: args.supplierName, source: args.supplierName };
  const maxCartao = maxInstallmentsForPackage(args.rules, input);
  const boleto = boletoRulesForPackage(args.rules, input);
  const prepago = getPrepaidBoletoConditions({
    supplierName: args.supplierName,
    source: args.supplierName,
    departureDate: args.departureDate,
    totalAmount: args.totalPerPerson,
  });
  const total = args.totalPerPerson;
  const opcaoPrepago = prepago.options[prepago.options.length - 1] ?? null;
  return {
    source: "VIAAIR_RULES",
    currency: "BRL",
    card: {
      max_installments: maxCartao,
      interest_free: true,
      installment_value: total ? Number((total / maxCartao).toFixed(2)) : null,
    },
    boleto_financiado: {
      enabled: boleto.financedEnabled,
      max_installments: boleto.financedMax,
      installment_value:
        boleto.financedEnabled && total ? Number((total / boleto.financedMax).toFixed(2)) : null,
    },
    boleto_prepago: {
      enabled: boleto.prepaidEnabled && prepago.eligible,
      max_installments: prepago.eligible ? prepago.maxInstallments : 0,
      entry_amount: opcaoPrepago ? Number(opcaoPrepago.entryAmount.toFixed(2)) : null,
      installment_value: opcaoPrepago?.installmentAmounts.length
        ? Number((opcaoPrepago.installmentAmounts[0] ?? 0).toFixed(2))
        : null,
    },
    estimated: args.priceFrom,
  };
}

function normalizar(
  row: Row,
  datas: ReadyPackageDate[],
  rules: InstallmentRule[],
  mismatch: string[],
): ReadyPackage {
  const dateMode = (row.date_mode as ReadyPackage["date_mode"]) ?? null;
  const flexivel = dateMode === "flexible" || row.flexible_dates === true || !row.going_date;
  const disponiveis = datas.filter((d) => d.is_available && (d.seats == null || d.seats > 0));

  // Preço: prioriza a data disponível mais barata quando o calendário existe.
  const melhor = disponiveis.length
    ? disponiveis.reduce((a, b) =>
        (a.price_per_person ?? Infinity) <= (b.price_per_person ?? Infinity) ? a : b,
      )
    : null;
  const preco = n(melhor?.price_per_person ?? row.price_per_person);
  const taxas = n(melhor?.taxes ?? row.taxes);
  const totalPP = preco == null ? null : Number((preco + (taxas ?? 0)).toFixed(2));

  let availability: ReadyPackage["availability"];
  if (row.is_active === false) availability = "inactive";
  else if (datas.length > 0) availability = disponiveis.length ? "available" : "sold_out";
  else if (flexivel) availability = "on_request";
  else availability = "available";

  const seats = melhor?.seats ?? null;
  const slug = (row.slug as string | null) ?? null;
  const path = slug ? `/pacotes/${slug}` : "";

  return {
    package_id: String(row.id),
    slug,
    title: row.title ?? null,
    kind: row.kind ?? null,
    product_type: productTypeOf(row),
    destination: row.destination ?? null,
    origin: row.origin ?? null,
    date_mode: dateMode,
    going_date: row.going_date ?? null,
    return_date: row.return_date ?? null,
    nights: n(row.nights),
    price_from: flexivel || (!melhor && datas.length === 0 && !row.going_date),
    price_per_person: preco,
    taxes: taxas,
    total_per_person: totalPP,
    currency: "BRL",
    pricing_mode: row.pricing_mode ?? null,
    base_occupancy: n(row.base_occupancy),
    max_units: n(row.max_units),
    hotel: {
      name: row.hotel_name ?? null,
      stars: n(row.hotel_stars),
      room_type: row.room_type ?? null,
      room_category: row.room_category ?? null,
      bed_type: row.bed_type ?? null,
      meal_plan: row.meal_plan ?? null,
      options: row.hotel_options ?? null,
      stays: row.hotel_stays ?? null,
    },
    flights: {
      included: Boolean(row.outbound_flight || row.return_flight),
      outbound: row.outbound_flight ?? null,
      inbound: row.return_flight ?? null,
    },
    includes: Array.isArray(row.includes) ? (row.includes as string[]) : [],
    services: row.services ?? null,
    cruise: row.cruise_details ?? null,
    installment_plan: montarParcelamento({
      rules,
      supplierName: row.supplier_name ?? null,
      totalPerPerson: totalPP,
      departureDate: (melhor?.date ?? row.going_date ?? null) as string | null,
      priceFrom: flexivel,
    }),
    seats,
    availability,
    available_dates: disponiveis.slice(0, 24),
    image_url: row.image_url ?? null,
    public_url: path ? `${PUBLIC_SITE_URL}${path}` : "",
    public_path: path,
    supplier_name: row.supplier_name ?? null,
    summary: row.ai_summary ?? row.summary ?? null,
    mismatch_reasons: mismatch,
  };
}

/** Executa a busca nos pacotes prontos publicados no Command Center. */
export async function searchReadyPackages(
  input: ReadyPackagesInput,
): Promise<ReadyPackagesResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const hoje = todayISO();

  const criteria = {
    destination: input.destination ?? null,
    origin: input.origin ?? null,
    month: input.month ?? null,
    departureFrom: input.departureFrom ?? null,
    departureTo: input.departureTo ?? null,
    departureDate: input.departureDate ?? null,
    returnDate: input.returnDate ?? null,
    nights: input.nights ?? null,
    adults: input.adults ?? null,
    children: input.children,
    kind: input.kind ?? null,
    productType: input.productType ?? null,
  };

  // Sem nenhum critério de destino não dá para oferecer pacote pronto de forma
  // honesta — vira cotação personalizada (nunca "pacote parecido").
  if (!input.destination && !input.origin && !input.month && !input.departureDate) {
    return {
      status: "customization_required",
      next_step: "custom_quote",
      source: "COMMAND_CENTER",
      criteria,
      total_count: 0,
      packages: [],
      near_matches: [],
      message: "Sem destino/período informado: não é possível pesquisar pacote pronto.",
    };
  }

  const kinds = input.kind
    ? [input.kind]
    : input.productType === "passeio"
      ? ["tour"]
      : input.productType === "servico"
        ? ["service"]
        : input.productType === "cruzeiro"
          ? [...READY_PACKAGE_KINDS]
          : ["package"];

  let q = supabaseAdmin
    .from("packages")
    .select(
      "id,slug,title,kind,destination,origin,going_date,return_date,nights,price_per_person,taxes,image_url,hotel_name,hotel_stars,hotel_options,hotel_stays,room_type,room_category,bed_type,meal_plan,includes,services,outbound_flight,return_flight,base_occupancy,max_units,date_mode,pricing_mode,flexible_dates,supplier_name,summary,ai_summary,cruise_details,is_active,sort_order",
    )
    .eq("is_active", true)
    // `motor-*` são modelos internos do motor de pacote, não produto publicado.
    .not("slug", "like", "motor-%")
    .in("kind", kinds)
    .or(`going_date.is.null,going_date.gte.${hoje}`)
    .order("sort_order", { ascending: true })
    .limit(200);

  if (input.destination) q = q.ilike("destination", `%${input.destination}%`);
  if (input.origin) q = q.ilike("origin", `%${input.origin}%`);

  const { data, error } = await q;
  if (error) throw new Error(`packages_query_failed: ${error.message}`);
  let rows = (data ?? []) as Row[];
  if (input.productType === "cruzeiro") rows = rows.filter((r) => r.cruise_details);

  if (rows.length === 0) {
    return {
      status: "not_found",
      next_step: "custom_quote",
      source: "COMMAND_CENTER",
      criteria,
      total_count: 0,
      packages: [],
      near_matches: [],
      message: "Nenhum pacote pronto no Command Center para esse destino.",
    };
  }

  // Calendário de datas dos candidatos (datas fixas com preço e vagas reais).
  const ids = rows.map((r) => String(r.id));
  const porPacote = new Map<string, ReadyPackageDate[]>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data: datas } = await supabaseAdmin
      .from("package_date_prices")
      .select("package_id,date,price_per_person,taxes,seats,is_available,modality")
      .in("package_id", ids.slice(i, i + 200))
      .gte("date", hoje)
      .order("date");
    for (const d of (datas ?? []) as Row[]) {
      const lista = porPacote.get(String(d.package_id)) ?? [];
      lista.push({
        date: String(d.date),
        price_per_person: n(d.price_per_person),
        taxes: n(d.taxes),
        seats: d.seats == null ? null : n(d.seats),
        is_available: d.is_available !== false,
        modality: d.modality ?? null,
      });
      porPacote.set(String(d.package_id), lista);
    }
  }

  const { data: rulesData } = await supabaseAdmin
    .from("installment_rules")
    .select(
      "id,operator_label,match_pattern,max_installments,limited_brands,limited_brands_max,valid_from,valid_until,priority,is_active,notes,boleto_financiado_enabled,boleto_financiado_max,boleto_prepago_enabled",
    )
    .eq("is_active", true)
    .order("priority", { ascending: false });
  const rules = (rulesData ?? []) as unknown as InstallmentRule[];

  const from = input.departureFrom ?? (input.month ? `${input.month}-01` : null);
  const to =
    input.departureTo ??
    (input.month
      ? (() => {
          const [y, m] = input.month.split("-").map(Number);
          const last = new Date(y!, m!, 0).getDate();
          return `${input.month}-${String(last).padStart(2, "0")}`;
        })()
      : null);

  const compativeis: ReadyPackage[] = [];
  const proximos: ReadyPackage[] = [];

  for (const row of rows) {
    const datas = porPacote.get(String(row.id)) ?? [];
    const motivos: string[] = [];

    // --- período ---------------------------------------------------------
    const datasCandidatas = datas.length
      ? datas.filter((d) => {
          if (input.departureDate) return d.date === input.departureDate;
          if (from && d.date < from) return false;
          if (to && d.date > to) return false;
          return true;
        })
      : [];
    const goingDate = row.going_date as string | null;
    const flexivel = row.date_mode === "flexible" || row.flexible_dates === true || !goingDate;

    let periodoOk = true;
    if (!flexivel) {
      if (datas.length) {
        periodoOk = datasCandidatas.length > 0;
      } else if (goingDate) {
        if (input.departureDate) periodoOk = goingDate === input.departureDate;
        else if (from || to)
          periodoOk = (!from || goingDate >= from) && (!to || goingDate <= to);
      }
    }
    if (!periodoOk) motivos.push("data_incompativel");

    // --- vagas / disponibilidade ----------------------------------------
    const usadas = datas.length ? (periodoOk ? datasCandidatas : datas) : [];
    const comVaga = usadas.filter((d) => d.is_available && (d.seats == null || d.seats > 0));
    if (usadas.length > 0 && comVaga.length === 0) motivos.push("sem_vaga");

    // --- ocupação --------------------------------------------------------
    const ocupacao = n(row.base_occupancy);
    if (input.adults && ocupacao && input.adults > ocupacao) motivos.push("ocupacao_incompativel");
    if (input.children.length > 0) motivos.push("criancas_a_confirmar");

    // --- noites ----------------------------------------------------------
    const noites = n(row.nights);
    const nMin = input.nightsMin ?? input.nights ?? null;
    const nMax = input.nightsMax ?? input.nights ?? null;
    if (noites != null && ((nMin && noites < nMin) || (nMax && noites > nMax)))
      motivos.push("noites_incompativel");

    const bloqueantes = motivos.filter((m) => m !== "criancas_a_confirmar");
    const item = normalizar(
      row,
      periodoOk && datas.length ? datasCandidatas : datas,
      rules,
      motivos,
    );

    if (bloqueantes.length === 0) {
      if (input.onlyAvailable && item.availability === "sold_out") proximos.push(item);
      else compativeis.push(item);
    } else {
      proximos.push(item);
    }
  }

  const packages = compativeis.slice(0, input.limit);
  const near = proximos.slice(0, input.limit);

  if (packages.length > 0) {
    return {
      status: "found",
      next_step: "present_options",
      source: "COMMAND_CENTER",
      criteria,
      total_count: compativeis.length,
      packages,
      near_matches: near,
      message: `${compativeis.length} pacote(s) pronto(s) compatível(is) no Command Center.`,
    };
  }

  if (near.length > 0) {
    return {
      status: "incompatible",
      next_step: "custom_quote",
      source: "COMMAND_CENTER",
      criteria,
      total_count: 0,
      packages: [],
      near_matches: near,
      message:
        "Existem pacotes prontos para esse destino, mas nenhum compatível com as datas/ocupação pedidas.",
    };
  }

  return {
    status: "not_found",
    next_step: "custom_quote",
    source: "COMMAND_CENTER",
    criteria,
    total_count: 0,
    packages: [],
    near_matches: [],
    message: "Nenhum pacote pronto no Command Center para esse destino.",
  };
}
