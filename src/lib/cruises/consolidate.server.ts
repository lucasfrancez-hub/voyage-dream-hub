/**
 * Consolidação de snapshots do plugin "Exportar Cruzeiro".
 *
 * Regras (briefing):
 *  - merge, nunca apagar o que não veio na captura;
 *  - navio é entidade reutilizável (não duplica MSC Divina);
 *  - N categorias de cabine por tipo, cada uma com preço próprio;
 *  - preço mais recente vira vigente, histórico é preservado;
 *  - mídia deduplicada por URL; adicionais por cruzeiro + código.
 */
import type { SnapshotData } from "./snapshot-schema";

type Admin = Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"];

export type ConsolidateStats = Record<string, number>;

function bump(stats: ConsolidateStats, key: string, n = 1) {
  stats[key] = (stats[key] ?? 0) + n;
}

function isoDate(v?: string | null): string | null {
  if (!v) return null;
  const s = String(v).trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(s);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return null;
}

export function occupancyKey(o: {
  adults?: number;
  young?: number;
  children?: number;
  infants?: number;
  children_ages?: number[];
}): string {
  const ages = (o.children_ages ?? []).slice().sort((a, b) => a - b).join(".");
  return `a${o.adults ?? 0}-y${o.young ?? 0}-c${o.children ?? 0}-i${o.infants ?? 0}${ages ? `-${ages}` : ""}`;
}

async function ensureShip(
  admin: Admin,
  data: SnapshotData,
  cruise: { id: string; ship_id: string | null; ship_name: string; operator: string },
  stats: ConsolidateStats,
): Promise<string | null> {
  const name = (data.ship?.name || data.cruise?.ship_name || cruise.ship_name || "").trim();
  if (!name) return cruise.ship_id;
  const line = (data.ship?.line || data.cruise?.line || cruise.operator || "").trim();

  let shipId = cruise.ship_id;
  if (!shipId) {
    const { data: found } = await admin
      .from("ships")
      .select("id")
      .ilike("name", name)
      .limit(1)
      .maybeSingle();
    if (found?.id) shipId = found.id;
  }

  if (!shipId) {
    const { data: created } = await admin
      .from("ships")
      .insert({
        name,
        line,
        description: data.ship?.description ?? "",
        main_image_url: data.ship?.main_image_url || null,
        technical_image_url: data.ship?.technical_image_url || null,
        specs: data.ship?.specs ?? {},
      })
      .select("id")
      .maybeSingle();
    shipId = created?.id ?? null;
    if (shipId) bump(stats, "navios_criados");
  } else if (data.ship) {
    // merge: só preenche o que estiver vazio / acrescenta specs novas
    const { data: cur } = await admin
      .from("ships")
      .select("description, main_image_url, technical_image_url, specs")
      .eq("id", shipId)
      .maybeSingle();
    const specs = { ...((cur?.specs as Record<string, unknown>) ?? {}), ...(data.ship.specs ?? {}) };
    await admin
      .from("ships")
      .update({
        description: cur?.description || data.ship.description || "",
        main_image_url: cur?.main_image_url || data.ship.main_image_url || null,
        technical_image_url: cur?.technical_image_url || data.ship.technical_image_url || null,
        specs,
        line: line || undefined,
      })
      .eq("id", shipId);
    bump(stats, "navios_atualizados");
  }

  if (shipId && shipId !== cruise.ship_id) {
    await admin.from("cruises").update({ ship_id: shipId, ship_name: name }).eq("id", cruise.id);
  }
  return shipId;
}

export async function consolidateSnapshot(opts: {
  admin: Admin;
  cruiseId: string;
  snapshotId: string;
  data: SnapshotData;
}): Promise<ConsolidateStats> {
  const { admin, cruiseId, snapshotId, data } = opts;
  const stats: ConsolidateStats = {};

  const { data: cruise } = await admin
    .from("cruises")
    .select("id, ship_id, ship_name, operator, name, departure_date, nights, embark_port, disembark_port, currency")
    .eq("id", cruiseId)
    .maybeSingle();
  if (!cruise) throw new Error("cruzeiro não encontrado");

  // ---- cabeçalho do cruzeiro (só completa lacunas) ----
  const c = data.cruise;
  if (c) {
    const patch: Record<string, unknown> = {};
    if (!cruise.name && c.name) patch.name = c.name;
    if (!cruise.departure_date && isoDate(c.departure_date)) patch.departure_date = isoDate(c.departure_date);
    if (isoDate(c.return_date)) patch.return_date = isoDate(c.return_date);
    if (!cruise.nights && c.nights) patch.nights = c.nights;
    if (!cruise.embark_port && c.embark_port) patch.embark_port = c.embark_port;
    if (!cruise.disembark_port && c.disembark_port) patch.disembark_port = c.disembark_port;
    if (c.currency) patch.currency = c.currency;
    if (Object.keys(patch).length) {
      await admin.from("cruises").update(patch).eq("id", cruiseId);
      bump(stats, "cruzeiro_atualizado");
    }
  }

  const shipId = await ensureShip(admin, data, cruise as never, stats);

  // ---- itinerário ----
  for (const day of data.itinerary ?? []) {
    const { error } = await admin.from("cruise_itineraries").upsert(
      {
        cruise_id: cruiseId,
        day: day.day,
        date: isoDate(day.date),
        port: day.port,
        country: day.country || null,
        arrival: day.arrival || null,
        departure: day.departure || null,
        description: day.description || "",
        image_url: day.image_url || null,
        map_image_url: day.map_image_url || null,
        activities: day.activities ?? [],
      },
      { onConflict: "cruise_id,day" },
    );
    if (!error) bump(stats, "itinerario");
  }

  // ---- catálogo de cabines do navio ----
  if (shipId) {
    for (const cab of data.ship_cabins ?? []) {
      const { error } = await admin.from("ship_cabins").upsert(
        {
          ship_id: shipId,
          cabin_type: cab.cabin_type,
          code: cab.code || "",
          name: cab.name,
          capacity: cab.capacity ?? null,
          size_m2: cab.size_m2 || null,
          description: cab.description || "",
          amenities: cab.amenities ?? [],
          photos: cab.photos ?? [],
        },
        { onConflict: "ship_id,cabin_type,name" },
      );
      if (!error) bump(stats, "cabines_navio");
    }
    for (const at of data.attractions ?? []) {
      const { error } = await admin.from("ship_attractions").upsert(
        {
          ship_id: shipId,
          category: at.category || "outros",
          name: at.name,
          description: at.description || "",
          deck: at.deck || null,
          images: at.images ?? [],
        },
        { onConflict: "ship_id,category,name" },
      );
      if (!error) bump(stats, "atracoes");
    }
    for (const [i, deck] of (data.decks ?? []).entries()) {
      const { error } = await admin.from("ship_decks").upsert(
        {
          ship_id: shipId,
          deck_label: deck.deck_label,
          deck_number: deck.deck_number ?? null,
          image_url: deck.image_url || null,
          source_url: deck.source_url || null,
          sort_order: i,
        },
        { onConflict: "ship_id,deck_label" },
      );
      if (!error) bump(stats, "decks");
    }
  }

  // ---- mídia (dedup por URL) ----
  for (const [i, m] of (data.media ?? []).entries()) {
    const row = {
      media_type: m.media_type,
      context: m.context || "gallery",
      source_url: m.source_url,
      hires_url: m.hires_url || null,
      thumbnail_url: m.thumbnail_url || null,
      embed_url: m.embed_url || null,
      provider: m.provider || null,
      title: m.title || null,
      alt: m.alt || null,
      sort_order: i,
    };
    if (m.scope === "ship" && shipId) {
      const { error } = await admin
        .from("ship_media")
        .upsert({ ...row, ship_id: shipId }, { onConflict: "ship_id,source_url" });
      if (!error) bump(stats, "midia_navio");
    } else {
      const { error } = await admin
        .from("cruise_media")
        .upsert({ ...row, cruise_id: cruiseId }, { onConflict: "cruise_id,source_url" });
      if (!error) bump(stats, "midia_cruzeiro");
    }
  }

  // ---- ofertas de cabine + preços ----
  for (const [i, offer] of (data.cabin_offers ?? []).entries()) {
    const { data: saved } = await admin
      .from("cruise_cabin_offers")
      .upsert(
        {
          cruise_id: cruiseId,
          cabin_type: offer.cabin_type,
          name: offer.name,
          fare_name: offer.fare_name || "",
          category_codes: offer.category_codes ?? [],
          image_url: offer.image_url || null,
          amenities: offer.amenities ?? [],
          availability: offer.availability || null,
          sort_order: i,
        },
        { onConflict: "cruise_id,cabin_type,name,fare_name" },
      )
      .select("id")
      .maybeSingle();
    if (!saved?.id) continue;
    bump(stats, "cabines_oferta");

    const price = offer.price;
    if (!price) continue;
    const occ = price.occupancy ?? data.occupancy ?? { adults: 0, young: 0, children: 0, infants: 0, children_ages: [] };
    const key = occupancyKey(occ);

    const { data: last } = await admin
      .from("cruise_prices")
      .select("id, total, taxes, base_amount")
      .eq("cruise_id", cruiseId)
      .eq("offer_id", saved.id)
      .eq("occupancy_key", key)
      .eq("is_current", true)
      .maybeSingle();

    const same =
      last &&
      Number(last.total ?? 0) === Number(price.total ?? 0) &&
      Number(last.taxes ?? 0) === Number(price.taxes ?? 0) &&
      Number(last.base_amount ?? 0) === Number(price.base_amount ?? 0);

    if (same) {
      bump(stats, "precos_iguais");
      continue;
    }

    if (last) {
      await admin.from("cruise_prices").update({ is_current: false }).eq("id", last.id);
      bump(stats, "precos_atualizados");
    } else {
      bump(stats, "precos_novos");
    }

    await admin.from("cruise_prices").insert({
      cruise_id: cruiseId,
      offer_id: saved.id,
      cabin_category: (offer.category_codes ?? []).join(", "),
      fare: offer.fare_name || offer.name,
      adults: occ.adults ?? 0,
      young: occ.young ?? 0,
      children: occ.children ?? 0,
      infants: occ.infants ?? 0,
      children_ages: occ.children_ages ?? [],
      occupancy_key: key,
      base_amount: price.base_amount,
      taxes: price.taxes,
      total: price.total,
      currency: price.currency || "BRL",
      installments: price.installments ?? {},
      passenger_prices: price.passenger_prices ?? [],
      is_current: true,
      snapshot_id: snapshotId,
    });
  }

  // ---- adicionais ----
  for (const add of data.additionals ?? []) {
    const categoryName = add.category || "Outros";
    const { data: cat } = await admin
      .from("cruise_additional_categories")
      .upsert({ cruise_id: cruiseId, name: categoryName }, { onConflict: "cruise_id,name" })
      .select("id")
      .maybeSingle();

    const { data: saved } = await admin
      .from("cruise_additionals")
      .upsert(
        {
          cruise_id: cruiseId,
          category_id: cat?.id ?? null,
          category_name: categoryName,
          code: add.code || "",
          name: add.name,
          description: add.description || "",
        },
        { onConflict: "cruise_id,code,name" },
      )
      .select("id")
      .maybeSingle();
    if (!saved?.id) continue;
    bump(stats, "adicionais");

    for (const [profile, value] of Object.entries(add.prices ?? {})) {
      if (value === null || value === undefined) continue;
      await admin
        .from("cruise_additional_prices")
        .upsert(
          { additional_id: saved.id, profile, price: value as number },
          { onConflict: "additional_id,profile" },
        );
    }
  }

  // ---- seguro ----
  for (const ins of data.insurances ?? []) {
    const { error } = await admin.from("cruise_insurances").upsert(
      {
        cruise_id: cruiseId,
        name: ins.name,
        price_per_person: ins.price_per_person,
        coverage_url: ins.coverage_url || null,
      },
      { onConflict: "cruise_id,name" },
    );
    if (!error) bump(stats, "seguros");
  }

  return stats;
}

/** Reprocessa um snapshot já gravado a partir do payload bruto. */
export async function reprocessSnapshot(admin: Admin, snapshotId: string) {
  const { snapshotPayloadSchema } = await import("./snapshot-schema");
  const { data: snap } = await admin
    .from("cruise_import_snapshots")
    .select("id, cruise_id, payload")
    .eq("id", snapshotId)
    .maybeSingle();
  if (!snap) throw new Error("captura não encontrada");

  await admin.from("cruise_import_snapshots").update({ status: "processando", error: null }).eq("id", snapshotId);
  try {
    const parsed = snapshotPayloadSchema.parse(snap.payload ?? {});
    const stats = await consolidateSnapshot({
      admin,
      cruiseId: snap.cruise_id,
      snapshotId,
      data: parsed.data,
    });
    await admin
      .from("cruise_import_snapshots")
      .update({
        status: "processado",
        stats,
        normalized: parsed.data as never,
        processed_at: new Date().toISOString(),
      })
      .eq("id", snapshotId);
    return stats;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await admin.from("cruise_import_snapshots").update({ status: "falhou", error: msg }).eq("id", snapshotId);
    throw e;
  }
}
