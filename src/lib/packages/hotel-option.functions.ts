import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type PublicHotelOptionInfo = {
  location_id: number | null;
  name: string | null;
  stars: number | null;
  address: string | null;
  rating: number | null;
  num_reviews: number | null;
  photos: string[];
  photos_fallback: boolean;
  web_url: string | null;
};

/**
 * Dados públicos (TripAdvisor) de uma hospedagem alternativa do pacote.
 * Reaproveita exatamente o mesmo enriquecimento já usado no projeto,
 * com cache de 30 dias no servidor.
 */
export const getPackageHotelOptionInfo = createServerFn({ method: "POST" })
  .inputValidator((i: { hotelName: string; city?: string | null; locationId?: number | null }) =>
    z
      .object({
        hotelName: z.string().min(2).max(200),
        city: z.string().max(160).nullable().optional(),
        locationId: z.number().int().positive().nullable().optional(),
      })
      .parse(i),
  )
  .handler(async ({ data }): Promise<PublicHotelOptionInfo> => {
    const { enrichHotel } = await import("@/lib/public-quote/hotel-enrichment.server");
    const info = await enrichHotel({ name: data.hotelName, city: data.city ?? null, locationId: data.locationId ?? null }).catch(() => null);
    return {
      location_id: info?.location_id ?? null,
      name: info?.name ?? data.hotelName,
      stars: info?.stars ?? null,
      address: info?.address ?? null,
      rating: info?.rating ?? null,
      num_reviews: info?.num_reviews ?? null,
      photos: (info?.photos ?? []).slice(0, 8),
      photos_fallback: !!info?.photos_fallback,
      web_url: info?.web_url ?? null,
    };
  });
