import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/** Busca propriedades no TripAdvisor para vincular a um hotel do orçamento. */
export const buscarHotelTripAdvisor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { query: string }) => z.object({ query: z.string().min(3).max(160) }).parse(i))
  .handler(async ({ data }) => {
    const { searchHotelLocations } = await import("./hotel-enrichment.server");
    return { results: await searchHotelLocations(data.query) };
  });

/** Fixa a propriedade TripAdvisor de um hotel e recarrega os dados reais. */
export const vincularHotelTripAdvisor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { hotelName: string; city?: string | null; locationId: number; locationName?: string | null }) =>
    z
      .object({
        hotelName: z.string().min(2).max(200),
        city: z.string().max(160).nullable().optional(),
        locationId: z.number().int().positive(),
        locationName: z.string().max(200).nullable().optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { hotelLinkKey, limparCacheHotel, enrichHotel } = await import("./hotel-enrichment.server");

    const key = hotelLinkKey(data.hotelName, data.city ?? null);
    const { error } = await supabaseAdmin.from("hotel_tripadvisor_links").upsert(
      {
        hotel_key: key,
        hotel_name: data.hotelName,
        city: data.city ?? null,
        location_id: data.locationId,
        location_name: data.locationName ?? null,
        created_by: context.userId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "hotel_key" },
    );
    if (error) throw new Error(error.message);

    await limparCacheHotel(data.hotelName, data.city ?? null);
    const info = await enrichHotel({
      name: data.hotelName,
      city: data.city ?? null,
      locationId: data.locationId,
      force: true,
    }).catch(() => null);

    return {
      ok: true,
      photos: info?.photos.length ?? 0,
      stars: info?.stars ?? null,
      address: info?.address ?? null,
      status: info?.status ?? "MATCH_FAILED",
    };
  });

/** Vínculo atual de um hotel (se existir). */
export const obterVinculoHotel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { hotelName: string; city?: string | null }) =>
    z.object({ hotelName: z.string().min(2).max(200), city: z.string().max(160).nullable().optional() }).parse(i),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { hotelLinkKey } = await import("./hotel-enrichment.server");
    const { data: row } = await supabaseAdmin
      .from("hotel_tripadvisor_links")
      .select("location_id, location_name")
      .eq("hotel_key", hotelLinkKey(data.hotelName, data.city ?? null))
      .maybeSingle();
    return {
      locationId: row ? Number(row.location_id) : null,
      locationName: row?.location_name ?? null,
    };
  });
