import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getRequest } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data, error } = await ctx.supabase.rpc("has_role", {
    _user_id: ctx.userId,
    _role: "admin",
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Acesso restrito");
}

const PROMO_COLUMNS =
  "id,signature,scope,status,fare_status,origin_iata,origin_city,destination_iata,destination_city,airline_iata,airline_name,airline_logo,departure_date,return_date,is_round_trip,stops,has_checked_baggage,cabin_class,passengers,fare_price,taxes,total_price,price_per_passenger,interest_free_installments,interest_free_installment_value,airline_rule,extended_max_installments,extended_installment_value_12x,extended_markup_12x,extended_total_12x,extended_options,search_key,outbound_fare_id,outbound_itinerary_id,inbound_fare_id,inbound_itinerary_id,is_multi_leg,multi_leg_url,multi_leg_savings,inbound_search_key,inbound_airline_iata,inbound_airline_name,inbound_airline_logo,cart_url,short_url,quoted_at,last_checked_at,reference_source,reference_price,reference_collected_at,price_difference,price_difference_percent,unavailable_at,cycle_state,cycle_changed_fields,cycle_state_at,cycle_day";

const ARCHIVE_COLUMNS = `${PROMO_COLUMNS},archived_at,archived_reason,archived_cycle_day,created_at`;

/** Dia da curadoria no fuso de Brasília (YYYY-MM-DD). */
function hojeBRT(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export const listAirfarePromotions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        origin: z.string().trim().max(60).optional().nullable(),
        destination: z.string().trim().max(60).optional().nullable(),
        airline: z.string().trim().max(60).optional().nullable(),
        scope: z.string().trim().max(20).optional().nullable(),
        status: z.string().trim().max(20).optional().nullable(),
        baggage: z.boolean().optional().nullable(),
        maxPrice: z.number().optional().nullable(),
        sort: z.string().trim().max(30).optional().nullable(),
        includeArchived: z.boolean().optional().nullable(),
      })
      .partial()
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    let q = context.supabase.from("airfare_promotions").select(PROMO_COLUMNS).limit(300);

    // curadoria ATIVA do dia (o ciclo encerrado à meia-noite vira histórico).
    // Proteção extra: mesmo se o cron das 00:00 falhar, promoção de dia
    // anterior nunca aparece como ativa.
    if (!data.includeArchived) q = q.is("archived_at", null).eq("cycle_day", hojeBRT());

    if (data.origin) q = q.ilike("origin_iata", `%${data.origin}%`);
    if (data.destination) q = q.ilike("destination_iata", `%${data.destination}%`);
    if (data.airline) q = q.ilike("airline_name", `%${data.airline}%`);
    if (data.scope && data.scope !== "todos") q = q.eq("scope", data.scope);
    if (data.status && data.status !== "todos") q = q.eq("status", data.status);
    if (data.baggage) q = q.eq("has_checked_baggage", true);
    if (data.maxPrice) q = q.lte("total_price", data.maxPrice);

    const sort = data.sort ?? "preco";
    if (sort === "preco") q = q.order("total_price", { ascending: true });
    else if (sort === "pax") q = q.order("price_per_passenger", { ascending: true });
    else if (sort === "data") q = q.order("departure_date", { ascending: true });
    else q = q.order("quoted_at", { ascending: false });

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

/**
 * ARQUIVADOS — histórico dos últimos 30 dias (somente consulta).
 * Nunca alimenta a curadoria ativa nem gera divulgação sem nova validação.
 */
export const listArchivedPromotions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        origin: z.string().trim().max(60).optional().nullable(),
        destination: z.string().trim().max(60).optional().nullable(),
        airline: z.string().trim().max(60).optional().nullable(),
        scope: z.string().trim().max(20).optional().nullable(),
        day: z.string().trim().max(10).optional().nullable(),
        page: z.number().int().min(0).max(200).optional().nullable(),
        pageSize: z.number().int().min(10).max(200).optional().nullable(),
      })
      .partial()
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const size = data.pageSize ?? 50;
    const page = data.page ?? 0;
    const limite = new Date(Date.now() - 30 * 86400_000).toISOString();

    let q = context.supabase
      .from("airfare_promotions")
      .select(ARCHIVE_COLUMNS, { count: "exact" })
      .not("archived_at", "is", null)
      .gte("archived_at", limite);

    if (data.origin) q = q.ilike("origin_iata", `%${data.origin}%`);
    if (data.destination) q = q.ilike("destination_iata", `%${data.destination}%`);
    if (data.airline) q = q.ilike("airline_name", `%${data.airline}%`);
    if (data.scope && data.scope !== "todos") q = q.eq("scope", data.scope);
    if (data.day) q = q.eq("archived_cycle_day", data.day);

    const { data: rows, count, error } = await q
      .order("archived_at", { ascending: false })
      .range(page * size, page * size + size - 1);
    if (error) throw new Error(error.message);
    return { rows: rows ?? [], total: count ?? 0, page, pageSize: size };
  });

/** Contador do botão 🗑 Arquivados (registros dentro da retenção). */
export const countArchivedPromotions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const limite = new Date(Date.now() - 30 * 86400_000).toISOString();
    const { count, error } = await context.supabase
      .from("airfare_promotions")
      .select("id", { count: "exact", head: true })
      .not("archived_at", "is", null)
      .gte("archived_at", limite);
    if (error) throw new Error(error.message);
    return { total: count ?? 0 };
  });

/** Histórico de preço de UMA promoção arquivada. */
export const promotionPriceHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: rows, error } = await context.supabase
      .from("airfare_promo_price_history")
      .select("*")
      .eq("promotion_id", data.id)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const listPromoRoutes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { data, error } = await context.supabase
      .from("airfare_promo_routes")
      .select("id,origin_iata,origin_city,destination_iata,destination_city,scope,priority,active")
      .order("priority", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const listInstallmentMarkups = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { data, error } = await context.supabase
      .from("airfare_installment_markups")
      .select("installments,markup_percent,active,updated_at")
      .order("installments", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const saveInstallmentMarkup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        installments: z.number().int().min(2).max(24),
        markup_percent: z.number().min(0).max(200),
        active: z.boolean().default(true),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase.from("airfare_installment_markups").upsert(
      {
        installments: data.installments,
        markup_percent: data.markup_percent,
        active: data.active,
        updated_at: new Date().toISOString(),
        updated_by: context.userId,
      },
      { onConflict: "installments" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setPromotionStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(["novo", "selecionado", "agendado", "publicado", "descartado"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase
      .from("airfare_promotions")
      .update({ status: data.status })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deletePromotion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase
      .from("airfare_promotions")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });



const HOOK_PATH = "/api/public/hooks/airfare-promos";

/** Endpoint executor no MESMO ambiente (preview/produção) que recebeu a chamada. */
function hookUrl(): string {
  try {
    const origem = new URL(getRequest().url).origin;
    if (origem) return `${origem}${HOOK_PATH}`;
  } catch {
    /* fallback abaixo */
  }
  return `https://pedidos.viaair.tur.br${HOOK_PATH}`;
}

/**
 * Dispara a coleta em SEGUNDO PLANO (não depende da página ficar aberta).
 * Cria a execução (trava global — nunca duas coletas simultâneas) e delega
 * o trabalho ao endpoint público, que atualiza o progresso real.
 */
export const runAirfarePromoCollection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({ routeIds: z.array(z.string().uuid()).optional(), maxRoutes: z.number().int().min(1).max(30).optional() })
      .partial()
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { startPromoRun } = await import("@/lib/airfare-promos.server");
    // "Atualizar agora" = rodada COMPLETA e nova: encerra corretamente
    // qualquer run anterior (inclusive travada) antes de começar.
    const run = await startPromoRun("manual", { force: true });
    if (!run) return { started: false as const, reason: "Não foi possível iniciar a coleta." };

    const payload = JSON.stringify({ runId: run.id, maxRoutes: data.maxRoutes ?? 14 });
    const url = hookUrl();
    // dispara e não espera concluir: o endpoint roda como invocação própria
    const disparo = fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
    }).catch((e) => {
      console.error("[airfare-promos] falha ao disparar coleta", url, e);
      return null;
    });
    await Promise.race([disparo, new Promise((r) => setTimeout(r, 1500))]);

    return { started: true as const, runId: run.id };

  });

/** Estado da coleta (progresso real; nada é estimado). */
export const getAirfarePromoRun = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { data, error } = await context.supabase
      .from("airfare_promo_runs")
      .select(
        "id,status,phase,trigger,total,discovered,discovered_raw,deduped,radar_available,radar_errors,fallback_count,radar_note,origin_metrics,processed,validated,saved,no_result,new_count,updated_count,expired_count,error_count,validation_metrics,last_label,error_message,started_at,finished_at,updated_at,cancel_requested_at,cancelled_at",
      )
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ?? null;
  });

/**
 * Cancelamento COOPERATIVO da coleta ativa (running → cancel_requested →
 * cancelada). Não apaga nada do que já foi validado.
 */
export const cancelAirfarePromoCollection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { requestPromoRunCancel } = await import("@/lib/airfare-promos.server");
    return await requestPromoRunCancel();
  });

/**
 * Pesquisa manual de uma oportunidade no NOSSO motor, sem gravar nada.
 * Devolve a mesma estrutura das promoções (preço/parcelamento já calculados).
 */
export const searchPromoOpportunity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        origin: z.string().trim().min(3).max(3),
        destination: z.string().trim().min(3).max(3),
        departureDate: z.string().min(10).max(10),
        returnDate: z.string().min(10).max(10).optional().nullable(),
        scope: z.enum(["nacional", "internacional"]).default("nacional"),
        adults: z.number().int().min(1).max(9).default(1),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { loadMarkups, quoteRoute } = await import("@/lib/airfare-promos.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const markups = await loadMarkups(supabaseAdmin as never);

    const row = await quoteRoute({
      route: {
        id: "manual",
        origin_iata: data.origin.toUpperCase(),
        origin_city: null,
        destination_iata: data.destination.toUpperCase(),
        destination_city: null,
        scope: data.scope,
        priority: 0,
      },
      departureDate: data.departureDate,
      returnDate: data.returnDate ?? null,
      markups,
      adults: data.adults,
    });
    if (!row) throw new Error("Nenhuma tarifa encontrada no motor para esse trecho/data.");
    return JSON.parse(JSON.stringify(row)) as Record<string, string | number | boolean | null | object>;
  });

/**
 * Pesquisa manual flexível: nenhum campo é obrigatório além de origem OU destino.
 * Só com "MGF" já dá para pesquisar — o radar descobre os destinos e o motor valida.
 */
export const explorePromoOpportunities = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        origin: z.string().trim().max(3).optional().nullable(),
        destination: z.string().trim().max(3).optional().nullable(),
        departureDate: z.string().max(10).optional().nullable(),
        returnDate: z.string().max(10).optional().nullable(),
        scope: z.enum(["nacional", "internacional"]).optional().nullable(),
        adults: z.number().int().min(1).max(9).default(1),
        limit: z.number().int().min(1).max(12).default(6),
      })
      .refine((v) => !!(v.origin?.trim() || v.destination?.trim()), {
        message: "Informe pelo menos a origem ou o destino.",
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { exploreOpportunities } = await import("@/lib/airfare-promos.explore.server");
    return { rows: await exploreOpportunities(data) };
  });



/** Salva um resultado da pesquisa manual como promoção da curadoria. */
export const savePromoOpportunity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ row: z.record(z.string(), z.unknown()) }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase
      .from("airfare_promotions")
      .upsert(
        {
          ...data.row,
          status: "novo",
          // entra na curadoria ATIVA do dia corrente
          cycle_day: hojeBRT(),
          archived_at: null,
          archived_reason: null,
          archived_cycle_day: null,
        } as never,
        { onConflict: "signature" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * CURADORIA MANUAL — "Salvar" dentro do Passagens Baratas (uso administrativo).
 * O preço do explorador é só referência: cota o motor VIA AIR na hora e só
 * então grava/atualiza a promoção (sem duplicar, pela mesma signature).
 */
export const salvarOportunidadePassagensBaratas = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        origin: z.string().trim().length(3),
        destination: z.string().trim().length(3),
        departureDate: z.string().trim().min(8).max(10),
        returnDate: z.string().trim().max(10).optional().nullable(),
        referencePrice: z.number().positive().optional().nullable(),
        originCity: z.string().trim().max(80).optional().nullable(),
        destinationCity: z.string().trim().max(80).optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { saveManualOpportunity } = await import("@/lib/airfare-promos.manual.server");
    return await saveManualOpportunity(data);
  });




/** Reconsulta UMA promoção no motor e atualiza preço/condições. */
export const refreshAirfarePromotion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: promo, error } = await context.supabase
      .from("airfare_promotions")
      .select(PROMO_COLUMNS)
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!promo) throw new Error("Promoção não encontrada");

    const { loadMarkups, quoteRoute } = await import("@/lib/airfare-promos.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const markups = await loadMarkups(supabaseAdmin as never);

    const row = await quoteRoute({
      route: {
        id: promo.id,
        origin_iata: promo.origin_iata,
        origin_city: promo.origin_city,
        destination_iata: promo.destination_iata,
        destination_city: promo.destination_city,
        scope: promo.scope as "nacional" | "internacional",
        priority: 0,
      },
      departureDate: promo.departure_date,
      returnDate: promo.return_date,
      markups,
    });

    if (!row) {
      await context.supabase
        .from("airfare_promotions")
        .update({ fare_status: "expirada", last_checked_at: new Date().toISOString() })
        .eq("id", data.id);
      return { ok: false, fare_status: "expirada" as const };
    }

    const mudou = Number(row.total_price) !== Number(promo.total_price);
    const { error: upErr } = await context.supabase
      .from("airfare_promotions")
      .update({
        ...(row as never as Record<string, unknown>),
        signature: promo.signature,
        status: promo.status,
        cart_url: mudou ? null : promo.cart_url,
        short_url: mudou ? null : promo.short_url,
        fare_status: "valida",
      })
      .eq("id", data.id);
    if (upErr) throw new Error(upErr.message);
    return { ok: true, total_price: row.total_price, changed: mudou };
  });

/** Cria o carrinho na operadora e o link curto Via Air da promoção. */
/** Cria o link curto rastreável da promoção (usado no WhatsApp e nos posts). */
/**
 * Multi-trecho: salva a viagem montada (ida + volta em companhias diferentes)
 * e devolve o link pronto, que abre direto a tela final da cotação.
 */
async function criarCotacaoMultiTrecho(promo: {
  origin_iata: string;
  destination_iata: string;
  departure_date: string;
  return_date: string | null;
  passengers: number | null;
  multi_leg_url: string | null;
  airline_iata: string | null;
  airline_name: string | null;
  inbound_airline_iata: string | null;
  inbound_airline_name: string | null;
  outbound_fare_id: string | null;
  inbound_fare_id: string | null;
  has_checked_baggage: boolean | null;
}): Promise<string | null> {
  if (!promo.return_date) return null;
  try {
    // horários vêm do ps=... já gravado no link do motor (companhia-hora por trecho)
    let horaIda: string | null = null;
    let horaVolta: string | null = null;
    if (promo.multi_leg_url) {
      const ps = new URL(promo.multi_leg_url).searchParams.get("ps");
      const partes = (ps ?? "").split("~");
      horaIda = partes[0]?.split("-")[1] || null;
      horaVolta = partes[1]?.split("-")[1] || null;
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
    const bytes = new Uint8Array(10);
    crypto.getRandomValues(bytes);
    let token = "";
    for (let i = 0; i < bytes.length; i++) token += alphabet[bytes[i]! % alphabet.length];

    const o = promo.origin_iata.toUpperCase();
    const d = promo.destination_iata.toUpperCase();
    const { error } = await supabaseAdmin.from("multicity_quotes").insert({
      token,
      segments: [
        { origin: o, destination: d, date: promo.departure_date },
        { origin: d, destination: o, date: promo.return_date },
      ],
      pax: { adults: promo.passengers || 1, children: 0, infants: 0 },
      picks: [
        {
          airline: promo.airline_iata,
          airlineName: promo.airline_name,
          time: horaIda,
          fareKey: promo.outbound_fare_id,
          baggage: promo.has_checked_baggage,
        },
        {
          airline: promo.inbound_airline_iata,
          airlineName: promo.inbound_airline_name,
          time: horaVolta,
          fareKey: promo.inbound_fare_id,
          baggage: promo.has_checked_baggage,
        },
      ],
      label: `${o}-${d} / ${d}-${o}`,
    });
    if (error) return null;
    return `https://pedidos.viaair.tur.br/multitrecho/cotacao/${token}`;
  } catch {
    return null;
  }
}

async function criarShortLink(
  context: { supabase: { from: (t: string) => any } },
  targetUrl: string,
  promo: { origin_iata: string; destination_iata: string },
): Promise<string | null> {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  let slug = "";
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  for (let i = 0; i < 6; i++) slug += alphabet[bytes[i]! % alphabet.length];
  const { error } = await context.supabase.from("short_links").insert({
    slug,
    target_url: targetUrl,
    label: `Promo ${promo.origin_iata}-${promo.destination_iata}`,
  });
  return error ? null : `https://pedidos.viaair.tur.br/l/${slug}`;
}

export const generatePromotionLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ id: z.string().uuid(), force: z.boolean().optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: promo, error } = await context.supabase
      .from("airfare_promotions")
      .select(PROMO_COLUMNS)
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!promo) throw new Error("Promoção não encontrada");
    // Reaproveita o link já válido (a atualização de tarifa zera cart_url/short_url).
    if (!data.force && promo.cart_url && promo.short_url) {
      return { cart_url: promo.cart_url, short_url: promo.short_url, reused: true };
    }
    // MULTI-TRECHO (nacional, ida e volta em companhias diferentes):
    // não existe carrinho único na operadora — o link abre o motor VIA AIR
    // em multi-trecho e o cliente compra cada trecho pelo Comprar Viagem.
    if (promo.is_multi_leg) {
      const { multiLegSearchUrl } = await import("@/lib/airfare-promos.server");
      const motorUrl =
        promo.multi_leg_url ??
        (promo.return_date
          ? multiLegSearchUrl({
              origin: promo.origin_iata,
              destination: promo.destination_iata,
              departureDate: promo.departure_date,
              returnDate: promo.return_date,
              adults: promo.passengers || 1,
            })
          : null);
      if (!motorUrl) throw new Error("Promoção multi-trecho sem data de volta.");

      // Link pronto: a seleção dos dois trechos fica salva no backend, então o
      // cliente abre direto a tela final da viagem (funciona em qualquer celular).
      const destino = (await criarCotacaoMultiTrecho(promo)) ?? motorUrl;
      const short = await criarShortLink(context, destino, promo);
      const { error: mErr } = await context.supabase
        .from("airfare_promotions")
        .update({ cart_url: destino, multi_leg_url: destino, short_url: short })
        .eq("id", data.id);
      if (mErr) throw new Error(mErr.message);
      return { cart_url: destino, short_url: short, reused: false };
    }


    if (!promo.search_key || !promo.outbound_fare_id || !promo.outbound_itinerary_id) {
      throw new Error("Tarifa sem chaves de busca. Atualize a promoção antes de gerar o link.");
    }

    const { createFlightCart } = await import("@/lib/onertravel.server");
    const montarCarrinho = () =>
      createFlightCart({
      searchKey: promo.search_key,
      outboundFareId: promo.outbound_fare_id,
      outboundItineraryId: promo.outbound_itinerary_id,
      inboundFareId: promo.inbound_fare_id,
      inboundItineraryId: promo.inbound_itinerary_id,
      isRoundTrip: !!promo.is_round_trip,
      departureIata: promo.origin_iata,
      arrivalIata: promo.destination_iata,
      departureDate: promo.departure_date,
      returnDate: promo.return_date,
      adults: promo.passengers || 1,
      children: 0,
      infants: 0,
      departureIsCity: false,
      arrivalIsCity: false,
      // ida e volta em promoção = tarifa fechada: manda só a tarifa da VOLTA
      preferInboundFare: !!promo.is_round_trip && !!promo.inbound_fare_id,
    } as never);

    let cart: Awaited<ReturnType<typeof createFlightCart>>;
    try {
      cart = await montarCarrinho();
    } catch (e) {
      // tarifa expirada: refaz a pesquisa no motor e tenta uma única vez mais
      const { loadMarkups, quoteRoute } = await import("@/lib/airfare-promos.server");
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const markups = await loadMarkups(supabaseAdmin as never);
      const atualizada = (await quoteRoute({
        route: {
          id: promo.id,
          origin_iata: promo.origin_iata,
          origin_city: promo.origin_city,
          destination_iata: promo.destination_iata,
          destination_city: promo.destination_city,
          scope: promo.scope as "nacional" | "internacional",
          priority: 0,
        },
        departureDate: promo.departure_date,
        returnDate: promo.return_date,
        markups,
      }).catch(() => null)) as null | Record<string, string | null>;
      if (!atualizada) throw e;
      await context.supabase
        .from("airfare_promotions")
        .update({ ...(atualizada as never as Record<string, unknown>), fare_status: "valida" })
        .eq("id", promo.id);
      promo.search_key = atualizada.search_key ?? promo.search_key;
      promo.outbound_fare_id = atualizada.outbound_fare_id ?? promo.outbound_fare_id;
      promo.outbound_itinerary_id =
        atualizada.outbound_itinerary_id ?? promo.outbound_itinerary_id;
      promo.inbound_fare_id = atualizada.inbound_fare_id ?? promo.inbound_fare_id;
      promo.inbound_itinerary_id = atualizada.inbound_itinerary_id ?? promo.inbound_itinerary_id;
      cart = await montarCarrinho();
    }

    const short = await criarShortLink(context, cart.url, promo);

    const { error: upErr } = await context.supabase
      .from("airfare_promotions")
      .update({ cart_url: cart.url, short_url: short })
      .eq("id", data.id);
    if (upErr) throw new Error(upErr.message);

    return { cart_url: cart.url, short_url: short, reused: false };
  });
